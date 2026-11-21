/**
 * RecVerse Shared Utilities
 * Common helpers used across all services
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('./config');

/**
 * Generate a random UUID
 * @returns {string}
 */
function generateId() {
  return uuidv4();
}

/**
 * Generate a random string
 * @param {number} length - Length of string
 * @returns {string}
 */
function randomString(length = 32) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Bcrypt hash
 */
async function hashPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against bcrypt hash
 * @param {string} password - Plain text password
 * @param {string} hash - Bcrypt hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token
 * @param {Object} payload - Token payload
 * @param {string} secret - JWT secret
 * @param {number} expiresIn - Expiration in seconds
 * @returns {string} JWT token
 */
function generateToken(payload, secret = config.auth.jwtSecret, expiresIn = config.auth.sessionExpiration) {
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token, secret = config.auth.jwtSecret) {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
function extractBearerToken(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1];
}

/**
 * Extract account ID from Bearer token in request
 * @param {Object} req - Express request object
 * @returns {number|null} Account ID or null
 */
function getAuthedAccountId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  try {
    const decoded = jwt.verify(parts[1], config.auth.jwtSecret);
    return decoded.sub ? parseInt(decoded.sub, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize string for safe use in SQL LIKE queries
 * @param {string} str - Input string
 * @returns {string} Escaped string
 */
function escapeLike(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Create a prefix upper bound for SQLite/PostgreSQL range queries
 * @param {string} prefix - Prefix string
 * @returns {string} Upper bound string
 */
function prefixUpperBound(prefix) {
  return prefix + '\u{10FFFF}';
}

/**
 * Format date as ISO 8601 string
 * @param {Date} date - Date object
 * @returns {string} ISO 8601 string
 */
function formatISO(date = new Date()) {
  return date.toISOString();
}

/**
 * Parse comma-separated IDs from query params
 * @param {string|string[]} ids - IDs from query
 * @returns {number[]} Array of integer IDs
 */
function parseIds(ids) {
  if (!ids) return [];
  const arr = Array.isArray(ids) ? ids : [ids];
  return arr
    .flatMap(v => String(v).split(','))
    .map(v => parseInt(v.trim(), 10))
    .filter(n => !isNaN(n));
}

/**
 * Deduplicate array while preserving order
 * @param {any[]} arr - Input array
 * @returns {any[]} Deduplicated array
 */
function deduplicate(arr) {
  return [...new Set(arr)];
}

/**
 * Chunk array into smaller arrays
 * @param {any[]} arr - Input array
 * @param {number} size - Chunk size
 * @returns {any[][]} Array of chunks
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create placeholder string for SQL IN clause
 * @param {number} count - Number of placeholders
 * @param {number} start - Starting parameter number (default 1)
 * @returns {string} Placeholder string like $1, $2, $3
 */
function createPlaceholders(count, start = 1) {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(', ');
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Omit keys from an object
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to omit
 * @returns {Object} New object without omitted keys
 */
function omit(obj, keys) {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Pick keys from an object
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to pick
 * @returns {Object} New object with only picked keys
 */
function pick(obj, keys) {
  const result = {};
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxAttempts - Maximum attempts
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise<any>}
 */
async function retry(fn, maxAttempts = 3, baseDelay = 100) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Rate limiter using in-memory store (for single instance)
 * For production, use Redis-based rate limiting
 */
class RateLimiter {
  constructor() {
    this.store = new Map();
  }

  /**
   * Check and consume rate limit
   * @param {string} key - Rate limit key
   * @param {number} limit - Max requests
   * @param {number} windowMs - Time window in ms
   * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
   */
  check(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.store.get(key);
    if (!record || record.resetTime <= now) {
      record = { count: 0, resetTime: now + windowMs };
      this.store.set(key, record);
    }

    // Clean old entries periodically
    if (this.store.size > 10000) {
      for (const [k, v] of this.store.entries()) {
        if (v.resetTime <= now) {
          this.store.delete(k);
        }
      }
    }

    record.count++;
    return {
      allowed: record.count <= limit,
      remaining: Math.max(0, limit - record.count),
      resetTime: record.resetTime,
    };
  }

  /**
   * Reset rate limit for a key
   * @param {string} key - Rate limit key
   */
  reset(key) {
    this.store.delete(key);
  }
}

module.exports = {
  generateId,
  randomString,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  extractBearerToken,
  getAuthedAccountId,
  isValidEmail,
  escapeLike,
  prefixUpperBound,
  formatISO,
  parseIds,
  deduplicate,
  chunkArray,
  createPlaceholders,
  deepClone,
  omit,
  pick,
  sleep,
  retry,
  RateLimiter,
};
