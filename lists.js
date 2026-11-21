/**
 * RecVerse Lists Service
 * Handles player lists (friends, blocks, favorites, etc.)
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// List types
const ListType = {
  Friends: 'friends',
  Blocked: 'blocked',
  Favorites: 'favorites',
  Recent: 'recent',
  Party: 'party',
};

// ============================================================
// LIST OPERATIONS
// ============================================================

// Get list
router.get('/lists/:listType', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const listType = req.params.listType;
  if (!Object.values(ListType).includes(listType)) {
    return res.status(400).json({ error: 'Invalid list type' });
  }

  const result = await query(
    'SELECT target_account_id, metadata, created_at FROM player_list WHERE account_id = $1 AND list_type = $2 ORDER BY created_at DESC',
    [accountId, listType]
  );

  const items = result.rows.map(r => ({
    accountId: r.target_account_id,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
    addedAt: r.created_at,
  }));

  res.json({ listType, items });
});

// Add to list
router.post('/lists/:listType', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const listType = req.params.listType;
  if (!Object.values(ListType).includes(listType)) {
    return res.status(400).json({ error: 'Invalid list type' });
  }

  const { targetAccountId, metadata } = req.body;
  const targetId = parseInt(targetAccountId, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  if (targetId === accountId) {
    return res.status(400).json({ error: 'Cannot add yourself' });
  }

  await query(
    `INSERT INTO player_list (account_id, list_type, target_account_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (account_id, list_type, target_account_id) DO UPDATE SET metadata = $4, created_at = NOW()`,
    [accountId, listType, targetId, JSON.stringify(metadata || {})]
  );

  res.json({ success: true });
});

// Remove from list
router.delete('/lists/:listType/:targetAccountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const listType = req.params.listType;
  if (!Object.values(ListType).includes(listType)) {
    return res.status(400).json({ error: 'Invalid list type' });
  }

  const targetAccountId = parseInt(req.params.targetAccountId, 10);
  if (isNaN(targetAccountId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  await query(
    'DELETE FROM player_list WHERE account_id = $1 AND list_type = $2 AND target_account_id = $3',
    [accountId, listType, targetAccountId]
  );

  res.json({ success: true });
});

// Check if in list
router.get('/lists/:listType/:targetAccountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const listType = req.params.listType;
  if (!Object.values(ListType).includes(listType)) {
    return res.status(400).json({ error: 'Invalid list type' });
  }

  const targetAccountId = parseInt(req.params.targetAccountId, 10);
  if (isNaN(targetAccountId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  const result = await query(
    'SELECT 1 FROM player_list WHERE account_id = $1 AND list_type = $2 AND target_account_id = $3',
    [accountId, listType, targetAccountId]
  );

  res.json({ inList: result.rows.length > 0 });
});

// ============================================================
// FRIENDS LIST SPECIFIC
// ============================================================

// Get friends with status
router.get('/friends', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Get friends list
  const result = await query(
    'SELECT target_account_id, metadata, created_at FROM player_list WHERE account_id = $1 AND list_type = $2 ORDER BY created_at DESC',
    [accountId, ListType.Friends]
  );

  const friendIds = result.rows.map(r => r.target_account_id);
  let friends = [];

  if (friendIds.length > 0) {
    // Get account details for friends
    const placeholders = friendIds.map((_, i) => `$${i + 2}`).join(', ');
    const accountsResult = await query(
      `SELECT * FROM account WHERE account_id IN (${placeholders})`,
      friendIds
    );

    const accountsMap = new Map();
    for (const row of accountsResult.rows) {
      const acc = JSON.parse(row.data);
      accountsMap.set(acc.accountId, {
        accountId: acc.accountId,
        username: acc.username,
        displayName: acc.displayName,
        profileImage: acc.profileImage,
        isJunior: acc.isJunior,
      });
    }

    // Get presence for friends
    const presenceResult = await query(
      `SELECT account_id, room_instance_id, room_id, status_visibility FROM presence WHERE account_id IN (${placeholders})`,
      friendIds
    );

    const presenceMap = new Map();
    for (const row of presenceResult.rows) {
      presenceMap.set(row.account_id, {
        roomInstanceId: row.room_instance_id,
        roomId: row.room_id,
        statusVisibility: row.status_visibility,
      });
    }

    friends = result.rows.map(r => {
      const account = accountsMap.get(r.target_account_id);
      const presence = presenceMap.get(r.target_account_id);
      return {
        ...account,
        metadata: r.metadata ? JSON.parse(r.metadata) : {},
        addedAt: r.created_at,
        presence: presence || null,
      };
    }).filter(f => f.accountId); // Filter out deleted accounts
  }

  res.json({ friends });
});

// Send friend request
router.post('/friends/request', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { targetAccountId } = req.body;
  const targetId = parseInt(targetAccountId, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  if (targetId === accountId) {
    return res.status(400).json({ error: 'Cannot friend yourself' });
  }

  // Check if already friends
  const existing = await query(
    'SELECT 1 FROM player_list WHERE account_id = $1 AND list_type = $2 AND target_account_id = $3',
    [accountId, ListType.Friends, targetId]
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'Already friends' });
  }

  // Check for pending request (would use a separate friend_request table)
  // For now, just add as friend (auto-accept)
  await query(
    `INSERT INTO player_list (account_id, list_type, target_account_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (account_id, list_type, target_account_id) DO UPDATE SET metadata = $4`,
    [accountId, ListType.Friends, targetId, JSON.stringify({})]
  );

  // Also add reverse (mutual friendship)
  await query(
    `INSERT INTO player_list (account_id, list_type, target_account_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (account_id, list_type, target_account_id) DO UPDATE SET metadata = $4`,
    [targetId, ListType.Friends, accountId, JSON.stringify({})]
  );

  res.json({ success: true });
});

// Remove friend
router.delete('/friends/:targetAccountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const targetAccountId = parseInt(req.params.targetAccountId, 10);
  if (isNaN(targetAccountId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  // Remove both directions
  await query(
    'DELETE FROM player_list WHERE (account_id = $1 AND list_type = $2 AND target_account_id = $3) OR (account_id = $3 AND list_type = $2 AND target_account_id = $1)',
    [accountId, ListType.Friends, targetAccountId]
  );

  res.json({ success: true });
});

// ============================================================
// BLOCK LIST
// ============================================================

// Block user
router.post('/blocked', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { targetAccountId } = req.body;
  const targetId = parseInt(targetAccountId, 10);
  if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  if (targetId === accountId) {
    return res.status(400).json({ error: 'Cannot block yourself' });
  }

  // Remove from friends if present
  await query(
    'DELETE FROM player_list WHERE (account_id = $1 AND list_type = $2 AND target_account_id = $3) OR (account_id = $3 AND list_type = $2 AND target_account_id = $1)',
    [accountId, ListType.Friends, targetId]
  );

  // Add to blocked
  await query(
    `INSERT INTO player_list (account_id, list_type, target_account_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (account_id, list_type, target_account_id) DO UPDATE SET metadata = $4`,
    [accountId, ListType.Blocked, targetId, JSON.stringify({})]
  );

  res.json({ success: true });
});

// Unblock user
router.delete('/blocked/:targetAccountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const targetAccountId = parseInt(req.params.targetAccountId, 10);
  if (isNaN(targetAccountId)) return res.status(400).json({ error: 'Invalid targetAccountId' });

  await query(
    'DELETE FROM player_list WHERE account_id = $1 AND list_type = $2 AND target_account_id = $3',
    [accountId, ListType.Blocked, targetAccountId]
  );

  res.json({ success: true });
});

// Get blocked users
router.get('/blocked', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT target_account_id, metadata, created_at FROM player_list WHERE account_id = $1 AND list_type = $2 ORDER BY created_at DESC',
    [accountId, ListType.Blocked]
  );

  const blocked = result.rows.map(r => ({
    accountId: r.target_account_id,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
    blockedAt: r.created_at,
  }));

  res.json({ blocked });
});

// ============================================================
// FAVORITES
// ============================================================

// Add favorite room
router.post('/favorites/rooms', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { roomId, metadata } = req.body;
  const roomIdInt = parseInt(roomId, 10);
  if (isNaN(roomIdInt)) return res.status(400).json({ error: 'Invalid roomId' });

  await query(
    `INSERT INTO player_list (account_id, list_type, target_account_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (account_id, list_type, target_account_id) DO UPDATE SET metadata = $4`,
    [accountId, ListType.Favorites, roomIdInt, JSON.stringify({ type: 'room', ...metadata })]
  );

  res.json({ success: true });
});

// Get favorite rooms
router.get('/favorites/rooms', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT target_account_id, metadata, created_at FROM player_list WHERE account_id = $1 AND list_type = $2 AND metadata->>\'type\' = \'room\' ORDER BY created_at DESC',
    [accountId, ListType.Favorites]
  );

  const favorites = result.rows.map(r => ({
    roomId: r.target_account_id,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
    addedAt: r.created_at,
  }));

  res.json({ favorites });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'lists', status: 'ok' });
});

module.exports = router;



