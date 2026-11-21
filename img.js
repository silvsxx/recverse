/**
 * RecVerse Image Service
 * Handles image processing, thumbnails, avatar images, room photos
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

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(config.storage.path, 'images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${generateId()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for images
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'), false);
    }
  },
});

// ============================================================
// IMAGE UPLOAD
// ============================================================

// Upload image (general)
router.post('/upload', upload.single('image'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const imageKey = `images/${req.file.filename}`;
  const imageUrl = `${config.publicBaseUrl}/img/files/${imageKey}`;

  // In a real implementation, would generate thumbnails here
  // For now, just store metadata
  await query(
    `INSERT INTO image (image_key, original_name, mime_type, size, width, height, account_id, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [imageKey, req.file.originalname, req.file.mimetype, req.file.size, 0, 0, accountId, imageUrl]
  );

  res.json({
    success: true,
    imageKey,
    url: imageUrl,
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// Upload avatar image
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  if (!req.file) return res.status(400).json({ error: 'No avatar uploaded' });

  const imageKey = `avatars/${accountId}/${req.file.filename}`;
  const imageUrl = `${config.publicBaseUrl}/img/files/${imageKey}`;

  await query(
    `INSERT INTO avatar_image (account_id, image_key, original_name, mime_type, size, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (account_id) DO UPDATE SET image_key = $2, original_name = $3, mime_type = $4, size = $5, url = $6, created_at = NOW()`,
    [accountId, imageKey, req.file.originalname, req.file.mimetype, req.file.size, imageUrl]
  );

  // Update account profile image
  await query(
    `UPDATE account SET data = jsonb_set(data, '{profileImage}', $2) WHERE account_id = $1`,
    [accountId, JSON.stringify(imageKey)]
  );

  res.json({
    success: true,
    imageKey,
    url: imageUrl,
  });
});

// Upload room photo
router.post('/room/:roomId/photo', upload.single('photo'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const imageKey = `rooms/${roomId}/photos/${req.file.filename}`;
  const imageUrl = `${config.publicBaseUrl}/img/files/${imageKey}`;

  await query(
    `INSERT INTO room_photo (room_id, account_id, image_key, original_name, mime_type, size, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [roomId, accountId, imageKey, req.file.originalname, req.file.mimetype, req.file.size, imageUrl]
  );

  res.json({
    success: true,
    imageKey,
    url: imageUrl,
  });
});

// Upload invention thumbnail
router.post('/invention/:inventionId/thumbnail', upload.single('thumbnail'), async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const inventionId = req.params.inventionId;
  if (!req.file) return res.status(400).json({ error: 'No thumbnail uploaded' });

  const imageKey = `inventions/${inventionId}/${req.file.filename}`;
  const imageUrl = `${config.publicBaseUrl}/img/files/${imageKey}`;

  await query(
    `INSERT INTO invention_image (invention_id, image_key, original_name, mime_type, size, url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [inventionId, imageKey, req.file.originalname, req.file.mimetype, req.file.size, imageUrl]
  );

  res.json({
    success: true,
    imageKey,
    url: imageUrl,
  });
});

// ============================================================
// IMAGE ACCESS
// ============================================================

// Serve image file
router.get('/files/:imageKey(*)', async (req, res) => {
  const imageKey = req.params.imageKey;

  const result = await query(
    'SELECT * FROM image WHERE image_key = $1',
    [imageKey]
  );

  if (result.rows.length === 0) {
    // Check other image tables
    const tables = ['avatar_image', 'room_photo', 'invention_image'];
    let found = null;
    for (const table of tables) {
      const r = await query(`SELECT * FROM ${table} WHERE image_key = $1`, [imageKey]);
      if (r.rows.length > 0) {
        found = r.rows[0];
        break;
      }
    }
    if (!found) {
      return res.status(404).json({ error: 'Image not found' });
    }
    // Use found record
    const filePath = path.join(config.storage.path, 'images', path.basename(found.image_key));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image not found on disk' });
    }
    res.set('Content-Type', found.mime_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  }

  const image = result.rows[0];
  const filePath = path.join(config.storage.path, 'images', path.basename(image.image_key));

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found on disk' });
  }

  res.set('Content-Type', image.mime_type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// Get image info
router.get('/images/:imageKey/info', async (req, res) => {
  const imageKey = req.params.imageKey;

  const result = await query(
    'SELECT image_key, original_name, mime_type, size, width, height, url, created_at FROM image WHERE image_key = $1',
    [imageKey]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.json(result.rows[0]);
});

// ============================================================
// IMAGE SIGNATURE VERIFICATION (for client compatibility)
// ============================================================

// The client verifies image signatures against Rec Room's public key
// This endpoint provides a way to sign images for self-hosted servers
router.post('/sign', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // In a real implementation, would sign the image with server's private key
  // For now, return a mock signature
  const { imageKey } = req.body;

  res.json({
    success: true,
    signature: 'mock-signature-' + generateId(),
    algorithm: 'RSA-SHA256',
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'img', status: 'ok' });
});

module.exports = router;



