/**
 * RecVerse Data Collection Service
 * Handles telemetry, analytics, event tracking
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
// EVENT TRACKING
// ============================================================

// Track single event
router.post('/events', async (req, res) => {
  const accountId = getAuthedAccountId(req);

  // Data collection doesn't require auth - can be anonymous
  const { eventType, eventData, sessionId, timestamp } = req.body;

  if (!eventType) {
    return res.status(400).json({ error: 'eventType required' });
  }

  const eventId = generateId();
  await query(
    `INSERT INTO telemetry_event (event_id, account_id, event_type, event_data, session_id, timestamp, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [eventId, accountId || null, eventType, JSON.stringify(eventData || {}), sessionId || null, timestamp ? new Date(timestamp) : null]
  );

  res.json({ success: true, eventId });
});

// Track batch events
router.post('/events/batch', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  const { events, sessionId } = req.body;

  if (!events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events array required' });
  }

  // Limit batch size
  if (events.length > 100) {
    return res.status(400).json({ error: 'Batch too large (max 100)' });
  }

  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const event of events) {
    if (!event.eventType) continue;

    values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, NOW())`);
    params.push(generateId(), accountId || null, event.eventType, JSON.stringify(event.eventData || {}), sessionId || null, event.timestamp ? new Date(event.timestamp) : null);
  }

  if (values.length === 0) {
    return res.status(400).json({ error: 'No valid events' });
  }

  await query(
    `INSERT INTO telemetry_event (event_id, account_id, event_type, event_data, session_id, timestamp, created_at) VALUES ${values.join(', ')}`,
    params
  );

  res.json({ success: true, count: values.length });
});

// ============================================================
// HEARTBEAT / SESSION
// ============================================================

// Session start
router.post('/session/start', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  const { sessionId, deviceInfo, gameVersion, platform } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  await query(
    `INSERT INTO telemetry_session (session_id, account_id, device_info, game_version, platform, started_at, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (session_id) DO UPDATE SET
       account_id = $2, device_info = $3, game_version = $4, platform = $5`,
    [sessionId, accountId || null, JSON.stringify(deviceInfo || {}), gameVersion || config.game.version, platform || 'unknown']
  );

  res.json({ success: true });
});

// Session end
router.post('/session/end', async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  await query(
    `UPDATE telemetry_session SET ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at)) WHERE session_id = $1`,
    [sessionId]
  );

  res.json({ success: true });
});

// Session heartbeat
router.post('/session/heartbeat', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  const { sessionId, data } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  await query(
    `INSERT INTO telemetry_heartbeat (session_id, account_id, data, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [sessionId, accountId || null, JSON.stringify(data || {})]
  );

  res.json({ success: true });
});

// ============================================================
// CRASH REPORTING
// ============================================================

// Submit crash report
router.post('/crash', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  const { crashData, sessionId, gameVersion, platform } = req.body;

  if (!crashData) {
    return res.status(400).json({ error: 'crashData required' });
  }

  const crashId = generateId();
  await query(
    `INSERT INTO crash_report (crash_id, account_id, session_id, crash_data, game_version, platform, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [crashId, accountId || null, sessionId || null, JSON.stringify(crashData), gameVersion || config.game.version, platform || 'unknown']
  );

  res.json({ success: true, crashId });
});

// ============================================================
// METRICS AGGREGATION (for dashboards)
// ============================================================

// Get event counts
router.get('/metrics/events', async (req, res) => {
  // Would require admin auth in real implementation
  const { eventType, startDate, endDate, interval = 'hour' } = req.query;

  let sql = `
    SELECT
      date_trunc($1, timestamp) as bucket,
      event_type,
      COUNT(*) as count
    FROM telemetry_event
    WHERE 1=1
  `;
  const params = [interval];
  let paramIndex = 2;

  if (eventType) {
    sql += ` AND event_type = $${paramIndex++}`;
    params.push(eventType);
  }

  if (startDate) {
    sql += ` AND timestamp >= $${paramIndex++}`;
    params.push(new Date(startDate));
  }

  if (endDate) {
    sql += ` AND timestamp <= $${paramIndex++}`;
    params.push(new Date(endDate));
  }

  sql += ` GROUP BY bucket, event_type ORDER BY bucket DESC LIMIT 1000`;

  const result = await query(sql, params);
  res.json({ metrics: result.rows });
});

// Get session stats
router.get('/metrics/sessions', async (req, res) => {
  const { startDate, endDate } = req.query;

  let sql = `
    SELECT
      COUNT(*) as total_sessions,
      COUNT(DISTINCT account_id) as unique_players,
      AVG(duration_seconds) as avg_duration,
      DATE_TRUNC('day', started_at) as day
    FROM telemetry_session
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    sql += ` AND started_at >= $${paramIndex++}`;
    params.push(new Date(startDate));
  }

  if (endDate) {
    sql += ` AND started_at <= $${paramIndex++}`;
    params.push(new Date(endDate));
  }

  sql += ` GROUP BY day ORDER BY day DESC LIMIT 30`;

  const result = await query(sql, params);
  res.json({ sessions: result.rows });
});

// Get crash stats
router.get('/metrics/crashes', async (req, res) => {
  const { startDate, endDate, platform } = req.query;

  let sql = `
    SELECT
      platform,
      game_version,
      COUNT(*) as crash_count
    FROM crash_report
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (startDate) {
    sql += ` AND created_at >= $${paramIndex++}`;
    params.push(new Date(startDate));
  }

  if (endDate) {
    sql += ` AND created_at <= $${paramIndex++}`;
    params.push(new Date(endDate));
  }

  if (platform) {
    sql += ` AND platform = $${paramIndex++}`;
    params.push(platform);
  }

  sql += ` GROUP BY platform, game_version ORDER BY crash_count DESC LIMIT 50`;

  const result = await query(sql, params);
  res.json({ crashes: result.rows });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'datacollection', status: 'ok' });
});

module.exports = router;



