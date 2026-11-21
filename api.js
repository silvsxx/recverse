/**
 * RecVerse API Service (Game API)
 * Main game API endpoints - config, avatar, inventory, rooms, social, etc.
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId, formatISO, parseIds, deduplicate } = require('./shared');

const router = express.Router();

// Helper: get account
async function getAccount(accountId) {
  const result = await query('SELECT * FROM account WHERE account_id = $1', [accountId]);
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// CONFIG ENDPOINTS
// ============================================================

// Version check
router.get('/versioncheck/v4', (req, res) => {
  const clientVersion = req.query.ver;
  const supported = config.game.supportedVersions;
  const rollout = config.game.rolloutVersions;

  let supportedBuild = true;
  let rolloutBuild = false;

  if (clientVersion) {
    supportedBuild = supported.length === 0 || supported.includes(clientVersion);
    rolloutBuild = rollout.length > 0 && rollout.includes(clientVersion);
  }

  if (!supportedBuild) {
    return res.status(400).json({
      supported: false,
      message: 'this game version is not supported by this server; update your game',
      minVersion: supported[0] || config.game.version,
    });
  }

  res.json({
    supported: true,
    rollout: rolloutBuild,
    version: config.game.version,
    minVersion: supported[0] || config.game.version,
  });
});

// Game config
router.get('/config', (req, res) => {
  res.json({
    gameVersion: config.game.version,
    supportedVersions: config.game.supportedVersions,
    rolloutVersions: config.game.rolloutVersions,
    // Add other config values as needed
  });
});

// ============================================================
// AVATAR ENDPOINTS
// ============================================================

// Get avatar
router.get('/avatar/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch from avatar table
  res.json({ accountId, avatar: {} });
});

// Save avatar
router.post('/avatar/:accountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const targetId = parseInt(req.params.accountId, 10);
  if (isNaN(targetId) || targetId !== accountId) return res.status(403).send();

  // Would save avatar data
  res.json({ success: true });
});

// ============================================================
// INVENTORY ENDPOINTS
// ============================================================

// Get inventory
router.get('/inventory/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch from inventory tables
  res.json({ accountId, items: [] });
});

// ============================================================
// ROOMS ENDPOINTS
// ============================================================

// Get room
router.get('/rooms/:roomId', async (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  if (isNaN(roomId)) return res.status(400).send();

  const result = await query('SELECT * FROM room WHERE room_id = $1', [roomId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Room not found' });

  res.json(JSON.parse(result.rows[0].data));
});

// Search rooms
router.get('/rooms', async (req, res) => {
  // Would implement room search
  res.json({ rooms: [], total: 0 });
});

// ============================================================
// SOCIAL ENDPOINTS
// ============================================================

// Get friends
router.get('/friends/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch from relationships table
  res.json({ friends: [], incoming: [], outgoing: [] });
});

// Add friend
router.post('/friends/:accountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would add friend request
  res.json({ success: true });
});

// Remove friend
router.delete('/friends/:accountId/:friendId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would remove friend
  res.json({ success: true });
});

// ============================================================
// EVENTS ENDPOINTS
// ============================================================

// Player events
router.post('/events', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would store player events
  res.json({ success: true });
});

// ============================================================
// PROGRESSION ENDPOINTS
// ============================================================

// Get progression
router.get('/progression/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, level: 1, xp: 0 });
});

// ============================================================
// MODERATION ENDPOINTS
// ============================================================

// Report player
router.post('/moderation/report', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would create report
  res.json({ success: true });
});

// ============================================================
// IMAGES ENDPOINTS
// ============================================================

// Upload image
router.post('/images/upload', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would handle multipart upload
  res.json({ success: true, imageKey: 'uploaded-image-key' });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'api', status: 'ok' });
});

module.exports = router;
