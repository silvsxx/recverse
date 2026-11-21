/**
 * RecVerse Rooms Service
 * Handles room creation, management, saves, invites
 */

const express = require('express');
const { query, transaction } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId, formatISO, generateId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// ROOM CRUD
// ============================================================

// Create room
router.post('/rooms', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { name, description, maxPlayers, isPrivate, subRooms } = req.body;

  const roomId = generateId();
  const roomData = {
    roomId,
    name: name || 'Untitled Room',
    description: description || '',
    ownerId: accountId,
    maxPlayers: maxPlayers || 16,
    isPrivate: isPrivate || false,
    subRooms: subRooms || [{ subRoomId: 1, name: 'Main', unitySceneId: 'Dorm', maxPlayers: maxPlayers || 16 }],
    createdAt: formatISO(),
    updatedAt: formatISO(),
    tags: [],
    imageKey: '',
  };

  await query(
    'INSERT INTO room (room_id, data) VALUES ($1, $2)',
    [roomId, JSON.stringify(roomData)]
  );

  res.json({ success: true, roomId, room: roomData });
});

// Get room
router.get('/rooms/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  const result = await query('SELECT * FROM room WHERE room_id = $1', [roomId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json(JSON.parse(result.rows[0].data));
});

// Update room
router.put('/rooms/:roomId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  const result = await query('SELECT * FROM room WHERE room_id = $1', [roomId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = JSON.parse(result.rows[0].data);
  if (room.ownerId !== accountId) {
    return res.status(403).json({ error: 'Not room owner' });
  }

  const updates = req.body;
  const updated = { ...room, ...updates, updatedAt: formatISO() };

  await query('UPDATE room SET data = $2 WHERE room_id = $1', [roomId, JSON.stringify(updated)]);

  res.json({ success: true, room: updated });
});

// Delete room
router.delete('/rooms/:roomId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  const result = await query('SELECT * FROM room WHERE room_id = $1', [roomId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = JSON.parse(result.rows[0].data);
  if (room.ownerId !== accountId) {
    return res.status(403).json({ error: 'Not room owner' });
  }

  await query('DELETE FROM room WHERE room_id = $1', [roomId]);

  res.json({ success: true });
});

// List rooms (with filters)
router.get('/rooms', async (req, res) => {
  const { ownerId, tag, limit = 20, offset = 0 } = req.query;
  let sql = 'SELECT * FROM room WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (ownerId) {
    sql += ` AND data->>'ownerId' = $${paramIndex++}`;
    params.push(ownerId);
  }

  if (tag) {
    sql += ` AND data->'tags' @> $${paramIndex++}`;
    params.push(JSON.stringify([tag]));
  }

  sql += ` ORDER BY (data->>'createdAt') DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await query(sql, params);
  const rooms = result.rows.map(r => JSON.parse(r.data));

  res.json({ rooms, total: rooms.length });
});

// ============================================================
// ROOM SAVES
// ============================================================

// Save room state
router.post('/rooms/:roomId/save', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  const { saveData, subRoomId } = req.body;

  const saveId = generateId();
  await query(
    'INSERT INTO room_save (save_id, room_id, sub_room_id, account_id, data, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [saveId, roomId, subRoomId || 1, accountId, JSON.stringify(saveData)]
  );

  res.json({ success: true, saveId });
});

// Get room saves
router.get('/rooms/:roomId/saves', async (req, res) => {
  const roomId = req.params.roomId;
  const { subRoomId } = req.query;

  let sql = 'SELECT * FROM room_save WHERE room_id = $1';
  const params = [roomId];

  if (subRoomId) {
    sql += ' AND sub_room_id = $2';
    params.push(parseInt(subRoomId));
  }

  sql += ' ORDER BY created_at DESC LIMIT 50';

  const result = await query(sql, params);
  const saves = result.rows.map(r => ({
    saveId: r.save_id,
    roomId: r.room_id,
    subRoomId: r.sub_room_id,
    accountId: r.account_id,
    data: JSON.parse(r.data),
    createdAt: r.created_at,
  }));

  res.json({ saves });
});

// ============================================================
// ROOM INVITES
// ============================================================

// Create invite
router.post('/rooms/:roomId/invites', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  const { targetAccountId, message } = req.body;

  const inviteId = generateId();
  await query(
    'INSERT INTO room_invite (invite_id, room_id, from_account_id, to_account_id, message, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [inviteId, roomId, accountId, targetAccountId, message || '']
  );

  res.json({ success: true, inviteId });
});

// Get invites for account
router.get('/invites', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT * FROM room_invite WHERE to_account_id = $1 AND expires_at > NOW() ORDER BY created_at DESC',
    [accountId]
  );

  const invites = result.rows.map(r => ({
    inviteId: r.invite_id,
    roomId: r.room_id,
    fromAccountId: r.from_account_id,
    message: r.message,
    createdAt: r.created_at,
  }));

  res.json({ invites });
});

// Accept invite
router.post('/invites/:inviteId/accept', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const inviteId = req.params.inviteId;
  await query(
    'UPDATE room_invite SET accepted = true, accepted_at = NOW() WHERE invite_id = $1 AND to_account_id = $2',
    [inviteId, accountId]
  );

  res.json({ success: true });
});

// Decline invite
router.post('/invites/:inviteId/decline', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const inviteId = req.params.inviteId;
  await query(
    'UPDATE room_invite SET declined = true WHERE invite_id = $1 AND to_account_id = $2',
    [inviteId, accountId]
  );

  res.json({ success: true });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'rooms', status: 'ok' });
});

module.exports = router;
