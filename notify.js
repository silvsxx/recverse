/**
 * RecVerse Notifications Service
 * Handles real-time notifications via WebSocket
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId, formatISO, generateId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// Notification types (matching RecFlare)
const NotificationType = {
  SubscriptionUpdateSelfProfile: 'SubscriptionUpdateSelfProfile',
  SubscriptionUpdateProfile: 'SubscriptionUpdateProfile',
  SubscriptionUpdateFriend: 'SubscriptionUpdateFriend',
  SubscriptionUpdateFriendRequest: 'SubscriptionUpdateFriendRequest',
  SubscriptionUpdateRoomInvite: 'SubscriptionUpdateRoomInvite',
  SubscriptionUpdateChatMessage: 'SubscriptionUpdateChatMessage',
  SubscriptionUpdateRoomJoin: 'SubscriptionUpdateRoomJoin',
  SubscriptionUpdateRoomLeave: 'SubscriptionUpdateRoomLeave',
  SubscriptionUpdatePartyInvite: 'SubscriptionUpdatePartyInvite',
  SubscriptionUpdatePartyJoin: 'SubscriptionUpdatePartyJoin',
  SubscriptionUpdatePartyLeave: 'SubscriptionUpdatePartyLeave',
  SubscriptionUpdateGift: 'SubscriptionUpdateGift',
  SubscriptionUpdateReport: 'SubscriptionUpdateReport',
  SubscriptionUpdateModeration: 'SubscriptionUpdateModeration',
  SubscriptionUpdateSystem: 'SubscriptionUpdateSystem',
};

// ============================================================
// NOTIFICATIONS REST ENDPOINTS
// ============================================================

// Get notifications for account
router.get('/notifications', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { limit = 50, unreadOnly = false } = req.query;

  let sql = 'SELECT * FROM notification WHERE account_id = $1';
  const params = [accountId];
  let paramIndex = 2;

  if (unreadOnly === 'true') {
    sql += ` AND read_at IS NULL`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  params.push(parseInt(limit));

  const result = await query(sql, params);
  const notifications = result.rows.map(r => ({
    notificationId: r.notification_id,
    type: r.type,
    data: JSON.parse(r.data),
    readAt: r.read_at,
    createdAt: r.created_at,
  }));

  res.json({ notifications });
});

// Mark notification as read
router.post('/notifications/:notificationId/read', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const notificationId = req.params.notificationId;
  await query(
    'UPDATE notification SET read_at = NOW() WHERE notification_id = $1 AND account_id = $2',
    [notificationId, accountId]
  );

  res.json({ success: true });
});

// Mark all as read
router.post('/notifications/read-all', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  await query(
    'UPDATE notification SET read_at = NOW() WHERE account_id = $1 AND read_at IS NULL',
    [accountId]
  );

  res.json({ success: true });
});

// Get unread count
router.get('/notifications/unread-count', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT COUNT(*) FROM notification WHERE account_id = $1 AND read_at IS NULL',
    [accountId]
  );

  res.json({ count: parseInt(result.rows[0].count, 10) });
});

// ============================================================
// WEBSOCKET ENDPOINT (for real-time)
// ============================================================

// This would be handled by a separate WebSocket server
// The REST endpoints above are for fetching history
router.get('/websocket-info', (req, res) => {
  res.json({
    wsUrl: config.publicBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/notifications',
    // Client would connect with: wsUrl + '?token=' + accessToken
  });
});

// ============================================================
// INTERNAL: Send notification (called by other services)
// ============================================================

async function sendNotification(accountId, type, data) {
  const notificationId = generateId();
  await query(
    'INSERT INTO notification (notification_id, account_id, type, data, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [notificationId, accountId, type, JSON.stringify(data)]
  );

  // In a real implementation, this would also push to WebSocket
  // if the user is connected

  return { notificationId, type, data };
}

async function broadcastNotification(type, data, excludeAccountId = null) {
  // Would broadcast to all connected users
  // For now, just store for each online user
  const result = await query('SELECT account_id FROM presence WHERE updated_at > NOW() - INTERVAL \'5 minutes\'');
  const accountIds = result.rows.map(r => r.account_id).filter(id => id !== excludeAccountId);

  for (const accountId of accountIds) {
    await sendNotification(accountId, type, data);
  }
}

// Export for use by other services
router.sendNotification = sendNotification;
router.broadcastNotification = broadcastNotification;
router.NotificationType = NotificationType;

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'notify', status: 'ok' });
});

module.exports = router;
