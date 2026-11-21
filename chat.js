/**
 * RecVerse Chat Service
 * Handles chat messages, channels, history
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId, formatISO, generateId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// CHAT CHANNELS
// ============================================================

// Get channels for account
router.get('/channels', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would fetch from chat_channel_member table
  res.json({ channels: [] });
});

// Create channel
router.post('/channels', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { name, type, memberIds } = req.body;

  const channelId = generateId();
  await query(
    'INSERT INTO chat_channel (channel_id, name, type, owner_id, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [channelId, name, type || 'group', accountId]
  );

  // Add members
  if (memberIds && memberIds.length > 0) {
    for (const memberId of memberIds) {
      await query(
        'INSERT INTO chat_channel_member (channel_id, account_id, joined_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
        [channelId, memberId]
      );
    }
  }

  // Add owner
  await query(
    'INSERT INTO chat_channel_member (channel_id, account_id, joined_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
    [channelId, accountId]
  );

  res.json({ success: true, channelId });
});

// Get channel messages
router.get('/channels/:channelId/messages', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const channelId = req.params.channelId;
  const { limit = 50, before } = req.query;

  let sql = 'SELECT * FROM chat_message WHERE channel_id = $1';
  const params = [channelId];
  let paramIndex = 2;

  if (before) {
    sql += ` AND created_at < $${paramIndex++}`;
    params.push(new Date(before));
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  params.push(parseInt(limit));

  const result = await query(sql, params);
  const messages = result.rows.map(r => ({
    messageId: r.message_id,
    channelId: r.channel_id,
    accountId: r.account_id,
    content: r.content,
    type: r.type,
    createdAt: r.created_at,
  })).reverse();

  res.json({ messages });
});

// Send message
router.post('/channels/:channelId/messages', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const channelId = req.params.channelId;
  const { content, type = 'text' } = req.body;

  if (!content) return res.status(400).json({ error: 'Missing content' });

  const messageId = generateId();
  await query(
    'INSERT INTO chat_message (message_id, channel_id, account_id, content, type, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
    [messageId, channelId, accountId, content, type]
  );

  res.json({
    success: true,
    message: {
      messageId,
      channelId,
      accountId,
      content,
      type,
      createdAt: formatISO(),
    },
  });
});

// ============================================================
// DIRECT MESSAGES
// ============================================================

// Get DM conversation
router.get('/dms/:otherAccountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const otherAccountId = parseInt(req.params.otherAccountId, 10);
  if (isNaN(otherAccountId)) return res.status(400).send();

  // Would fetch DM messages
  res.json({ messages: [] });
});

// Send DM
router.post('/dms/:otherAccountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const otherAccountId = parseInt(req.params.otherAccountId, 10);
  if (isNaN(otherAccountId)) return res.status(400).send();

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Missing content' });

  res.json({ success: true });
});

// ============================================================
// MODERATION
// ============================================================

// Report message
router.post('/report', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { messageId, channelId, reason } = req.body;
  // Would create report

  res.json({ success: true });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'chat', status: 'ok' });
});

module.exports = router;
