/**
 * RecVerse Database Migration Runner
 * Runs SQL migrations from the migrations/ directory
 */

const fs = require('fs');
const path = require('path');
const { runMigrations, initializePool, closePool } = require('./index');
const { config, validateConfig } = require('../config');

async function main() {
  console.log('[Migrate] Starting database migrations...');
  console.log('[Migrate] Environment:', config.env);
  console.log('[Migrate] Database URL:', config.database.url ? 'configured' : 'NOT CONFIGURED');

  try {
    validateConfig();
    initializePool();
    
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    console.log('[Migrate] Migrations directory:', migrationsDir);
    
    await runMigrations(migrationsDir);
    
    console.log('[Migrate] All migrations completed successfully!');
  } catch (error) {
    console.error('[Migrate] Migration failed:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };