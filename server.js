/**
 * RecVerse - Main Server Entry Point
 * Single Express app mounting all service routers
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const { config, validateConfig, getNameServerResponse } = require('./config');
const { closePool } = require('./database');
const { extractBearerToken, verifyToken, RateLimiter } = require('./shared');

// Import all service routers
const authRouter = require('./auth');
const accountsRouter = require('./accounts');
const apiRouter = require('./api');
const econRouter = require('./econ');
const commerceRouter = require('./commerce');
const roomsRouter = require('./rooms');
const matchRouter = require('./match');
const chatRouter = require('./chat');
const notifyRouter = require('./notify');
const playerSettingsRouter = require('./playersettings');
const leaderboardRouter = require('./leaderboard');
const discoveryRouter = require('./discovery');
const cdnRouter = require('./cdn');
const imgRouter = require('./img');
const studioRouter = require('./studio');
const dataRouter = require('./data');
const listsRouter = require('./lists');
const roomCommentsRouter = require('./roomcomments');
const datacollectionRouter = require('./datacollection');

// Configure Winston logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'recverse-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Global rate limiter
const globalRateLimiter = new RateLimiter();

// Create Express app
const app = express();

// Trust proxy for correct IP detection behind load balancers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// Global rate limiting
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const result = globalRateLimiter.check(`global:${ip}`, 1000, 60000);

  res.set({
    'X-RateLimit-Limit': '1000',
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
  });

  if (!result.allowed) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    });
  }

  next();
});

// Authentication middleware
function authenticate(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

function optionalAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
}

app.set('authenticate', authenticate);
app.set('optionalAuth', optionalAuth);
app.set('logger', logger);

// Health check endpoint
app.get('/health', async (req, res) => {
  const { healthCheck } = require('./database');
  const dbHealthy = await healthCheck();

  res.json({
    status: dbHealthy ? 'healthy' : 'degraded',
    service: 'recverse-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// NameServer endpoint - returns service URLs for client configuration
app.get('/ns', (req, res) => {
  const response = getNameServerResponse();
  logger.info('NameServer request', { ip: req.ip });
  res.json(response);
});

app.get('/ns/v1', (req, res) => {
  const response = getNameServerResponse();
  res.json(response);
});

// EAC (Easy Anti-Cheat) challenge endpoint
app.get('/eac/challenge', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('"AA=="');
});

// Mount service routers
app.use('/auth', authRouter);
app.use('/accounts', accountsRouter);
app.use('/api', apiRouter);
app.use('/econ', econRouter);
app.use('/commerce', commerceRouter);
app.use('/rooms', roomsRouter);
app.use('/match', matchRouter);
app.use('/chat', chatRouter);
app.use('/notify', notifyRouter);
app.use('/playersettings', playerSettingsRouter);
app.use('/leaderboard', leaderboardRouter);
app.use('/discovery', discoveryRouter);
app.use('/cdn', cdnRouter);
app.use('/img', imgRouter);
app.use('/studio', studioRouter);
app.use('/data', dataRouter);
app.use('/lists', listsRouter);
app.use('/roomcomments', roomCommentsRouter);
app.use('/datacollection', datacollectionRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  const isDevelopment = config.env === 'development';

  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: isDevelopment ? err.message : 'An unexpected error occurred',
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Graceful shutdown
let server = null;

async function shutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
      logger.info('Database pool closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  } else {
    await closePool();
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
function start() {
  return new Promise((resolve) => {
    server = app.listen(config.port, config.host, () => {
      logger.info(`RecVerse API server started on ${config.host}:${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Public Base URL: ${config.publicBaseUrl}`);
      resolve(server);
    });
  });
}

module.exports = { app, start, shutdown, logger };

// Auto-start if run directly
if (require.main === module) {
  start().catch(err => {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  });
}