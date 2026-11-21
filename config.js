/**
 * RecVerse Configuration Module
 * Loads and validates environment configuration
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env file if it exists
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // Load from process.env
}

/**
 * Parse comma-separated string into array
 * @param {string} value - Comma-separated string
 * @returns {string[]}
 */
function parseCSV(value) {
  if (!value) return [];
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/**
 * Parse integer with default
 * @param {string} value - String value
 * @param {number} defaultValue - Default value
 * @returns {number}
 */
function parseIntSafe(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean with default
 * @param {string} value - String value
 * @param {boolean} defaultValue - Default value
 * @returns {boolean}
 */
function parseBool(value, defaultValue) {
  if (value === undefined || value === '') return defaultValue;
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
}

// Build configuration object
const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: parseIntSafe(process.env.PORT, 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${parseIntSafe(process.env.PORT, 3000)}`,

  // Database
  database: {
    url: process.env.DATABASE_URL || '',
    ssl: parseBool(process.env.DATABASE_SSL, true),
    maxConnections: parseIntSafe(process.env.DATABASE_MAX_CONNECTIONS, 10),
  },

  // Authentication
  auth: {
    jwtSecret: process.env.JWT_SECRET || '',
    sessionExpiration: parseIntSafe(process.env.SESSION_EXPIRATION, 86400),
    refreshTokenExpiration: parseIntSafe(process.env.REFRESH_TOKEN_EXPIRATION, 604800),
  },

  // Game Version
  game: {
    version: process.env.GAME_VERSION || '20250424.01',
    supportedVersions: parseCSV(process.env.SUPPORTED_GAME_VERSIONS),
    rolloutVersions: parseCSV(process.env.ROLLOUT_GAME_VERSIONS),
  },

  // Email
  email: {
    enabled: parseBool(process.env.EMAIL_ENABLED, false),
    host: process.env.EMAIL_HOST || '',
    port: parseIntSafe(process.env.EMAIL_PORT, 587),
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@localhost',
  },

  // Storage
  storage: {
    path: process.env.STORAGE_PATH || './storage',
    maxUploadSize: parseIntSafe(process.env.MAX_UPLOAD_SIZE, 52428800),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // RecNet Service URLs (for NameServer response)
  services: {
    auth: process.env.RECNET_AUTH_URL || `${config.publicBaseUrl}/auth`,
    api: process.env.RECNET_API_URL || `${config.publicBaseUrl}/api`,
    accounts: process.env.RECNET_ACCOUNTS_URL || `${config.publicBaseUrl}/accounts`,
    econ: process.env.RECNET_ECON_URL || `${config.publicBaseUrl}/econ`,
    commerce: process.env.RECNET_COMMERCE_URL || `${config.publicBaseUrl}/commerce`,
    rooms: process.env.RECNET_ROOMS_URL || `${config.publicBaseUrl}/rooms`,
    match: process.env.RECNET_MATCH_URL || `${config.publicBaseUrl}/match`,
    chat: process.env.RECNET_CHAT_URL || `${config.publicBaseUrl}/chat`,
    notify: process.env.RECNET_NOTIFY_URL || `${config.publicBaseUrl}/notify`,
    playersettings: process.env.RECNET_PLAYERSETTINGS_URL || `${config.publicBaseUrl}/playersettings`,
    leaderboard: process.env.RECNET_LEADERBOARD_URL || `${config.publicBaseUrl}/leaderboard`,
    discovery: process.env.RECNET_DISCOVERY_URL || `${config.publicBaseUrl}/discovery`,
    cdn: process.env.RECNET_CDN_URL || `${config.publicBaseUrl}/cdn`,
    img: process.env.RECNET_IMG_URL || `${config.publicBaseUrl}/img`,
    studio: process.env.RECNET_STUDIO_URL || `${config.publicBaseUrl}/studio`,
    data: process.env.RECNET_DATA_URL || `${config.publicBaseUrl}/data`,
    lists: process.env.RECNET_LISTS_URL || `${config.publicBaseUrl}/lists`,
    roomcomments: process.env.RECNET_ROOMCOMMENTS_URL || `${config.publicBaseUrl}/roomcomments`,
    datacollection: process.env.RECNET_DATACOLLECTION_URL || `${config.publicBaseUrl}/datacollection`,
  },

  // Photon Configuration (for client-side redirection via patcher/versemain.dll)
  photon: {
    redirectEnabled: parseBool(process.env.PHOTON_REDIRECT_ENABLED, true),
    targetHost: process.env.PHOTON_TARGET_HOST || '',
    nameServerPort: parseIntSafe(process.env.PHOTON_NAMESERVER_PORT, 5058),
    masterServerPort: parseIntSafe(process.env.PHOTON_MASTER_PORT, 5055),
    gameServerPort: parseIntSafe(process.env.PHOTON_GAME_PORT, 5056),
    appIdRealtime: process.env.PHOTON_APP_ID_REALTIME || '',
    appIdVoice: process.env.PHOTON_APP_ID_VOICE || '',
    appIdChat: process.env.PHOTON_APP_ID_CHAT || '',
  },
};

/**
 * Validate required configuration
 * @throws {Error} If required config is missing
 */
function validateConfig() {
  const errors = [];

  if (!config.auth.jwtSecret) {
    errors.push('JWT_SECRET is required');
  }

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (config.auth.jwtSecret && config.auth.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters');
  }

  if (config.photon.redirectEnabled && !config.photon.targetHost) {
    errors.push('PHOTON_TARGET_HOST is required when PHOTON_REDIRECT_ENABLED=true');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get service URL by name
 * @param {string} name - Service name
 * @returns {string} Service URL
 */
function getServiceUrl(name) {
  return config.services[name] || '';
}

/**
 * Get all service URLs as NameServerResponse format
 * @returns {Object} Service URL map
 */
function getNameServerResponse() {
  return {
    RecNetStatus: `${config.services.api}/status`,
    Auth: config.services.auth,
    API: config.services.api,
    WWW: config.publicBaseUrl,
    Notifications: config.services.notify,
    Images: config.services.img,
    CDN: config.services.cdn,
    Commerce: config.services.commerce,
    Matchmaking: config.services.match,
    Storage: config.services.data,
    Chat: config.services.chat,
    Leaderboard: config.services.leaderboard,
    Accounts: config.services.accounts,
    Link: `${config.services.auth}/link`,
    RoomComments: config.services.roomcomments,
    Clubs: `${config.services.api}/clubs`,
    Rooms: config.services.rooms,
    PlatformNotifications: config.services.notify,
    Moderation: `${config.services.api}/moderation`,
    DataCollection: config.services.datacollection,
    BugReporting: `${config.services.api}/bugreporting`,
    Discovery: config.services.discovery,
    PlayerSettings: config.services.playersettings,
    Studio: config.services.studio,
    GameLogs: `${config.services.api}/gamelogs`,
    Strings: `${config.services.cdn}/strings`,
    Econ: config.services.econ,
    StringsCDN: `${config.services.cdn}/strings`,
  };
}

module.exports = {
  config,
  validateConfig,
  getServiceUrl,
  getNameServerResponse,
  parseCSV,
  parseIntSafe,
  parseBool,
};
