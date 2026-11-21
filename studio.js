/**
 * RecVerse Studio Service
 * Handles Rec Room Studio integration, asset uploads, room publishing
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// Configure multer for studio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(config.storage.path, 'studio');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${generateId()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for studio assets
  fileFilter: (req, file, cb) => {
    // Allow Unity packages, textures, models, scripts, etc.
    const allowedTypes = [
      'application/zip',
      'application/octet-stream',
      'image/png', 'image/jpeg', 'image/tga', 'image/psd',
      'model/gltf-binary', 'model/gltf+json', 'model/fbx', 'model/obj',
      'text/plain', 'text/csv', 'application/json',
      'audio/wav', 'audio/ogg', 'audio/mpeg',
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.unitypackage')) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed for Studio'), false);
    }
  },
});

// ============================================================
// STUDIO ASSET UPLOAD
// ============================================================

// Upload studio asset
router.post('/assets', upload.single('asset'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Check studio access (would check token for betastudio role)
  // For now, allow all authenticated users

  if (!req.file) {
    return res.status(400).json({ error: 'No asset uploaded' });
  }

  const assetKey = `studio/${accountId}/${req.file.filename}`;
  const assetUrl = `${config.publicBaseUrl}/studio/files/${assetKey}`;

  await query(
    `INSERT INTO studio_asset (asset_key, original_name, mime_type, size, account_id, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [assetKey, req.file.originalname, req.file.mimetype, req.file.size, accountId, assetUrl]
  );

  res.json({
    success: true,
    assetKey,
    url: assetUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// Upload multiple studio assets
router.post('/assets/batch', upload.array('assets', 50), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No assets uploaded' });
  }

  const uploaded = [];
  for (const file of req.files) {
    const assetKey = `studio/${accountId}/${file.filename}`;
    const assetUrl = `${config.publicBaseUrl}/studio/files/${assetKey}`;

    await query(
      `INSERT INTO studio_asset (asset_key, original_name, mime_type, size, account_id, url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [assetKey, file.originalname, file.mimetype, file.size, accountId, assetUrl]
    );

    uploaded.push({
      assetKey,
      url: assetUrl,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });
  }

  res.json({ success: true, assets: uploaded });
});

// ============================================================
// ROOM PUBLISHING
// ============================================================

// Publish room from Studio
router.post('/rooms/publish', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { roomData, assets, thumbnail } = req.body;

  if (!roomData) {
    return res.status(400).json({ error: 'Missing roomData' });
  }

  const roomId = generateId();
  const roomKey = `studio/rooms/${roomId}`;

  await query(
    `INSERT INTO studio_room (room_id, room_key, data, assets, thumbnail, account_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'published', NOW(), NOW())`,
    [roomId, roomKey, JSON.stringify(roomData), JSON.stringify(assets || []), thumbnail || null, accountId]
  );

  // Also create in main rooms table
  await query(
    `INSERT INTO room (room_id, data) VALUES ($1, $2)`,
    [roomId, JSON.stringify({
      roomId,
      name: roomData.name || 'Studio Room',
      description: roomData.description || '',
      ownerId: accountId,
      maxPlayers: roomData.maxPlayers || 16,
      subRooms: roomData.subRooms || [],
      tags: ['studio'],
      createdAt: formatISO(),
      updatedAt: formatISO(),
    })]
  );

  res.json({
    success: true,
    roomId,
    roomKey,
    url: `${config.publicBaseUrl}/rooms/${roomId}`,
  });
});

// Update published room
router.put('/rooms/:roomId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  const { roomData, assets, thumbnail } = req.body;

  const result = await query(
    'SELECT * FROM studio_room WHERE room_id = $1 AND account_id = $2',
    [roomId, accountId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found or not owner' });
  }

  await query(
    `UPDATE studio_room SET data = $1, assets = $2, thumbnail = $3, updated_at = NOW() WHERE room_id = $4`,
    [JSON.stringify(roomData), JSON.stringify(assets || []), thumbnail || null, roomId]
  );

  // Update main room table
  await query(
    `UPDATE room SET data = jsonb_set(data, '{name}', $2), data = jsonb_set(data, '{description}', $3), data = jsonb_set(data, '{subRooms}', $4), data = jsonb_set(data, '{updatedAt}', $5) WHERE room_id = $1`,
    [roomId, JSON.stringify(roomData.name || ''), JSON.stringify(roomData.description || ''), JSON.stringify(roomData.subRooms || []), JSON.stringify(formatISO())]
  );

  res.json({ success: true });
});

// Get studio rooms for account
router.get('/rooms', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT room_id, room_key, data, thumbnail, status, created_at, updated_at FROM studio_room WHERE account_id = $1 ORDER BY updated_at DESC',
    [accountId]
  );

  const rooms = result.rows.map(r => ({
    roomId: r.room_id,
    roomKey: r.room_key,
    data: JSON.parse(r.data),
    thumbnail: r.thumbnail,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  res.json({ rooms });
});

// ============================================================
// INVENTIONS
// ============================================================

// Upload invention
router.post('/inventions', upload.single('invention'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  if (!req.file) {
    return res.status(400).json({ error: 'No invention file uploaded' });
  }

  const inventionId = generateId();
  const inventionKey = `studio/inventions/${inventionId}`;

  await query(
    `INSERT INTO invention (invention_id, invention_key, original_name, mime_type, size, account_id, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [inventionId, inventionKey, req.file.originalname, req.file.mimetype, req.file.size, accountId, `${config.publicBaseUrl}/studio/files/${inventionKey}`]
  );

  res.json({
    success: true,
    inventionId,
    inventionKey,
    url: `${config.publicBaseUrl}/studio/files/${inventionKey}`,
  });
});

// Get inventions
router.get('/inventions', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT invention_id, invention_key, original_name, mime_type, size, url, created_at FROM invention WHERE account_id = $1 ORDER BY created_at DESC',
    [accountId]
  );

  res.json({ inventions: result.rows });
});

// ============================================================
// STUDIO FILE ACCESS
// ============================================================

// Serve studio file
router.get('/files/:fileKey(*)', async (req, res) => {
  const fileKey = req.params.fileKey;

  const tables = ['studio_asset', 'studio_room', 'invention'];
  let found = null;

  for (const table of tables) {
    const col = table === 'studio_room' ? 'room_key' : table === 'invention' ? 'invention_key' : 'asset_key';
    const r = await query(`SELECT * FROM ${table} WHERE ${col} = $1`, [fileKey]);
    if (r.rows.length > 0) {
      found = r.rows[0];
      break;
    }
  }

  if (!found) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(config.storage.path, 'studio', path.basename(found.asset_key || found.room_key || found.invention_key));

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.set('Content-Type', found.mime_type || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'studio', status: 'ok' });
});

module.exports = router;



