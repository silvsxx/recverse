/**
 * RecVerse Leaderboard Service
 * Handles leaderboards, rankings, stats
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
// LEADERBOARDS
// ============================================================

// Get leaderboard
router.get('/leaderboards/:leaderboardId', async (req, res) => {
  const leaderboardId = req.params.leaderboardId;
  const { limit = 100, offset = 0, season } = req.query;

  // Would fetch from leaderboard table
  // For now, return mock data
  const entries = [];
  for (let i = 0; i < Math.min(parseInt(limit), 10); i++) {
    entries.push({
      rank: parseInt(offset) + i + 1,
      accountId: 1000 + i,
      username: `Player${1000 + i}`,
      displayName: `Player${1000 + i}`,
      score: 10000 - i * 100,
      season: season || 'current',
    });
  }

  res.json({
    leaderboardId,
    season: season || 'current',
    entries,
    total: 1000,
  });
});

// Get player rank
router.get('/leaderboards/:leaderboardId/rank/:accountId', async (req, res) => {
  const leaderboardId = req.params.leaderboardId;
  const accountId = parseInt(req.params.accountId, 10);
  const { season } = req.query;

  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch actual rank
  res.json({
    leaderboardId,
    accountId,
    rank: 42,
    score: 5000,
    season: season || 'current',
    percentile: 95.5,
  });
});

// Get multiple player ranks
router.post('/leaderboards/:leaderboardId/ranks', async (req, res) => {
  const leaderboardId = req.params.leaderboardId;
  const { accountIds, season } = req.body;

  if (!accountIds || !Array.isArray(accountIds)) {
    return res.status(400).json({ error: 'accountIds array required' });
  }

  const ranks = accountIds.map((id, i) => ({
    accountId: parseInt(id),
    rank: 100 + i,
    score: 5000 - i * 10,
    season: season || 'current',
  }));

  res.json({ leaderboardId, ranks });
});

// Get leaderboard seasons
router.get('/leaderboards/:leaderboardId/seasons', async (req, res) => {
  const leaderboardId = req.params.leaderboardId;

  res.json({
    leaderboardId,
    seasons: [
      { id: 'current', name: 'Current Season', startDate: '2026-01-01', endDate: '2026-03-31', isActive: true },
      { id: '2025-4', name: 'Season 4', startDate: '2025-10-01', endDate: '2025-12-31', isActive: false },
      { id: '2025-3', name: 'Season 3', startDate: '2025-07-01', endDate: '2025-09-30', isActive: false },
    ],
  });
});

// Submit score (for game servers)
router.post('/leaderboards/:leaderboardId/submit', async (req, res) => {
  // Would verify game server auth
  const { accountId, score, season, metadata } = req.body;

  if (!accountId || score === undefined) {
    return res.status(400).json({ error: 'accountId and score required' });
  }

  // Would update leaderboard
  res.json({ success: true, rank: 1 });
});

// ============================================================
// STATS
// ============================================================

// Get player stats
router.get('/stats/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch from stats table
  res.json({
    accountId,
    stats: {
      roomsVisited: 0,
      roomsCreated: 0,
      itemsCollected: 0,
      playTime: 0,
      friendsCount: 0,
      photosTaken: 0,
      giftsSent: 0,
      giftsReceived: 0,
    },
  });
});

// Update stats (called by game servers)
router.post('/stats/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  const { stats } = req.body;
  if (!stats) return res.status(400).json({ error: 'stats object required' });

  // Would update stats
  res.json({ success: true });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'leaderboard', status: 'ok' });
});

module.exports = router;



