/**
 * RecVerse Data Service
 * Handles data storage, key-value storage, player data persistence
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// KEY-VALUE STORAGE
// ============================================================

// Set key-value
router.put('/kv/:key', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const key = req.params.key;
  const { value, ttl } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: 'Missing value' });
  }

  const dataKey = `account:${accountId}:${key}`;

  await query(
    `INSERT INTO data_kv (data_key, data_value, expires_at) VALUES ($1, $2, $3)
     ON CONFLICT (data_key) DO UPDATE SET data_value = $2, expires_at = $3`,
    [dataKey, JSON.stringify(value), ttl ? new Date(Date.now() + ttl * 1000) : null]
  );

  res.json({ success: true, key });
});

// Get key-value
router.get('/kv/:key', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const key = req.params.key;
  const dataKey = `account:${accountId}:${key}`;

  const result = await query(
    'SELECT data_value FROM data_kv WHERE data_key = $1 AND (expires_at IS NULL OR expires_at > NOW())',
    [dataKey]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Key not found' });
  }

  res.json({ key, value: JSON.parse(result.rows[0].data_value) });
});

// Delete key-value
router.delete('/kv/:key', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const key = req.params.key;
  const dataKey = `account:${accountId}:${key}`;

  await query('DELETE FROM data_kv WHERE data_key = $1', [dataKey]);

  res.json({ success: true });
});

// List keys
router.get('/kv', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { prefix, limit = 100 } = req.query;
  const dataKeyPrefix = `account:${accountId}:${prefix || ''}`;

  const result = await query(
    'SELECT data_key FROM data_kv WHERE data_key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT $2',
    [dataKeyPrefix + '%', parseInt(limit)]
  );

  const keys = result.rows.map(r => r.data_key.replace(`account:${accountId}:`, ''));
  res.json({ keys });
});

// ============================================================
// PLAYER DATA (legacy compatibility)
// ============================================================

// Save player data
router.post('/player/:accountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const targetAccountId = parseInt(req.params.accountId, 10);
  if (isNaN(targetAccountId) || targetAccountId !== accountId) {
    return res.status(403).json({ error: 'Can only save own data' });
  }

  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Missing data' });

  await query(
    `INSERT INTO player_data (account_id, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE SET data = $2, updated_at = NOW()`,
    [accountId, JSON.stringify(data)]
  );

  res.json({ success: true });
});

// Get player data
router.get('/player/:accountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const targetAccountId = parseInt(req.params.accountId, 10);
  if (isNaN(targetAccountId)) return res.status(400).send();

  const result = await query('SELECT data FROM player_data WHERE account_id = $1', [targetAccountId]);

  if (result.rows.length === 0) {
    return res.json({ data: {} });
  }

  res.json({ data: JSON.parse(result.rows[0].data) });
});

// ============================================================
// HEARTBEAT DATA
// ============================================================

// Save heartbeat data
router.post('/heartbeat', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { data } = req.body;

  await query(
    `INSERT INTO heartbeat_data (account_id, data, created_at) VALUES ($1, $2, NOW())`,
    [accountId, JSON.stringify(data || {})]
  );

  res.json({ success: true });
});

// Get recent heartbeats
router.get('/heartbeat', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { limit = 100 } = req.query;

  const result = await query(
    'SELECT data, created_at FROM heartbeat_data WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2',
    [accountId, parseInt(limit)]
  );

  res.json({ heartbeats: result.rows.map(r => ({ data: JSON.parse(r.data), createdAt: r.created_at })) });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'data', status: 'ok' });
});

module.exports = router;



