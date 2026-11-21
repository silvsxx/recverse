/**
 * RecVerse CDN Service
 * Handles content delivery, file uploads, asset management
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(config.storage.path, 'cdn');
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
  limits: { fileSize: config.storage.maxUploadSize },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, audio, and common file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
      'application/json', 'application/octet-stream',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

// ============================================================
// FILE UPLOAD
// ============================================================

// Upload single file
router.post('/upload', upload.single('file'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileKey = `uploads/${req.file.filename}`;
  const fileUrl = `${config.publicBaseUrl}/cdn/files/${fileKey}`;

  // Store file metadata
  await query(
    `INSERT INTO cdn_file (file_key, original_name, mime_type, size, account_id, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [fileKey, req.file.originalname, req.file.mimetype, req.file.size, accountId, fileUrl]
  );

  res.json({
    success: true,
    fileKey,
    url: fileUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// Upload multiple files
router.post('/upload/multiple', upload.array('files', 10), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploaded = [];
  for (const file of req.files) {
    const fileKey = `uploads/${file.filename}`;
    const fileUrl = `${config.publicBaseUrl}/cdn/files/${fileKey}`;

    await query(
      `INSERT INTO cdn_file (file_key, original_name, mime_type, size, account_id, url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [fileKey, file.originalname, file.mimetype, file.size, accountId, fileUrl]
    );

    uploaded.push({
      fileKey,
      url: fileUrl,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    });
  }

  res.json({ success: true, files: uploaded });
});

// ============================================================
// FILE ACCESS
// ============================================================

// Serve file
router.get('/files/:fileKey(*)', async (req, res) => {
  const fileKey = req.params.fileKey;

  const result = await query(
    'SELECT * FROM cdn_file WHERE file_key = $1',
    [fileKey]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'File not found' });
  }

  const file = result.rows[0];
  const filePath = path.join(config.storage.path, 'cdn', path.basename(file.file_key));

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.set('Content-Type', file.mime_type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// Get file info
router.get('/files/:fileKey/info', async (req, res) => {
  const fileKey = req.params.fileKey;

  const result = await query(
    'SELECT file_key, original_name, mime_type, size, url, created_at FROM cdn_file WHERE file_key = $1',
    [fileKey]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.json(result.rows[0]);
});

// Delete file (owner only)
router.delete('/files/:fileKey', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const fileKey = req.params.fileKey;

  const result = await query(
    'SELECT * FROM cdn_file WHERE file_key = $1 AND account_id = $2',
    [fileKey, accountId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'File not found or not owner' });
  }

  const filePath = path.join(config.storage.path, 'cdn', path.basename(result.rows[0].file_key));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await query('DELETE FROM cdn_file WHERE file_key = $1', [fileKey]);

  res.json({ success: true });
});

// ============================================================
// ROOM ASSETS
// ============================================================

// Upload room asset
router.post('/rooms/:roomId/assets', upload.single('asset'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileKey = `rooms/${roomId}/${req.file.filename}`;
  const fileUrl = `${config.publicBaseUrl}/cdn/files/${fileKey}`;

  await query(
    `INSERT INTO room_asset (room_id, file_key, original_name, mime_type, size, account_id, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [roomId, fileKey, req.file.originalname, req.file.mimetype, req.file.size, accountId, fileUrl]
  );

  res.json({
    success: true,
    fileKey,
    url: fileUrl,
    originalName: req.file.originalname,
  });
});

// Get room assets
router.get('/rooms/:roomId/assets', async (req, res) => {
  const roomId = req.params.roomId;

  const result = await query(
    'SELECT file_key, original_name, mime_type, size, url, created_at FROM room_asset WHERE room_id = $1 ORDER BY created_at DESC',
    [roomId]
  );

  res.json({ assets: result.rows });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'cdn', status: 'ok' });
});

module.exports = router;



