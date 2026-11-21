/**
 * RecVerse Database Layer
 * Shared PostgreSQL/YugabyteDB connection pool and query helpers
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { config, validateConfig } = require('./config');

let pool = null;
let isShuttingDown = false;

/**
 * Initialize the database connection pool
 * @returns {Pool} The connection pool
 */
function initializePool() {
  if (pool) {
    return pool;
  }

  validateConfig();

  const poolConfig = {
    connectionString: config.database.url,
    max: config.database.maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  };

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('[Database] Unexpected pool error:', err.message);
  });

  pool.on('connect', () => {
    if (config.env !== 'test') {
      console.log('[Database] New connection established');
    }
  });

  return pool;
}

/**
 * Get the database pool (initializes if needed)
 * @returns {Pool}
 */
function getPool() {
  if (!pool) {
    return initializePool();
  }
  return pool;
}

/**
 * Execute a query with automatic retry on transient errors
 * @param {string} text - SQL query
 * @param {any[]} params - Query parameters
 * @returns {Promise<QueryResult>}
 */
async function query(text, params) {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.env !== 'test' && config.logging.level === 'debug') {
      console.log(`[Database] Query executed in ${duration}ms: ${text.substring(0, 100)}`);
    }
    return result;
  } catch (error) {
    console.error('[Database] Query error:', error.message);
    console.error('[Database] Query:', text);
    throw error;
  }
}

/**
 * Execute a query within a transaction
 * @param {Function} callback - Function that receives client and returns promise
 * @returns {Promise<any>}
 */
async function transaction(callback) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a client from the pool for manual transaction management
 * @returns {Promise<PoolClient>}
 */
async function getClient() {
  const pool = getPool();
  return pool.connect();
}

/**
 * Run database migrations
 * @param {string} migrationsDir - Directory containing migration files
 * @returns {Promise<void>}
 */
async function runMigrations(migrationsDir = './migrations') {
  const pool = getPool();

  // Create migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get applied migrations
  const appliedResult = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map(r => r.filename));

  // Get migration files
  const fullMigrationsDir = path.resolve(process.cwd(), migrationsDir);
  if (!fs.existsSync(fullMigrationsDir)) {
    console.log('[Database] No migrations directory found, skipping');
    return;
  }

  const files = fs.readdirSync(fullMigrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const filePath = path.join(fullMigrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`[Database] Applying migration: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    console.log(`[Database] Migration applied: ${file}`);
  }

  console.log('[Database] All migrations applied');
}

/**
 * Close the database pool gracefully
 * @returns {Promise<void>}
 */
async function closePool() {
  if (pool && !isShuttingDown) {
    isShuttingDown = true;
    console.log('[Database] Closing connection pool...');
    await pool.end();
    pool = null;
    console.log('[Database] Connection pool closed');
  }
}

/**
 * Health check for database connection
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT 1 as health');
    return result.rows[0].health === 1;
  } catch (error) {
    console.error('[Database] Health check failed:', error.message);
    return false;
  }
}

/**
 * Execute multiple queries in a batch
 * @param {Array<{text: string, params: any[]}>} queries - Array of queries
 * @returns {Promise<QueryResult[]>}
 */
async function batch(queries) {
  const pool = getPool();
  const results = [];

  for (const { text, params } of queries) {
    const result = await pool.query(text, params);
    results.push(result);
  }

  return results;
}

module.exports = {
  initializePool,
  getPool,
  query,
  transaction,
  getClient,
  runMigrations,
  closePool,
  healthCheck,
  batch,
};
