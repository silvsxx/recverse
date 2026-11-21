/**
 * RecVerse Discovery Service
 * Handles room discovery, recommendations, featured content
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
// DISCOVERY
// ============================================================

// Get featured rooms
router.get('/featured', async (req, res) => {
  const { category, limit = 20 } = req.query;

  // Would fetch from room table with featured flag
  const rooms = [];
  for (let i = 0; i < Math.min(parseInt(limit), 10); i++) {
    rooms.push({
      roomId: 1000 + i,
      name: `Featured Room ${i + 1}`,
      description: 'A great room to visit!',
      ownerId: 100 + i,
      ownerName: `Creator${100 + i}`,
      imageKey: `room-${1000 + i}.jpg`,
      tags: ['featured', category || 'popular'],
      playerCount: Math.floor(Math.random() * 16),
      maxPlayers: 16,
      isPrivate: false,
      createdAt: formatISO(),
    });
  }

  res.json({ rooms, category: category || 'all' });
});

// Get recommended rooms
router.get('/recommended', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  const { limit = 20 } = req.query;

  // Would use recommendation algorithm based on player history
  const rooms = [];
  for (let i = 0; i < Math.min(parseInt(limit), 10); i++) {
    rooms.push({
      roomId: 2000 + i,
      name: `Recommended Room ${i + 1}`,
      description: 'Recommended for you!',
      ownerId: 200 + i,
      ownerName: `Creator${200 + i}`,
      imageKey: `room-${2000 + i}.jpg`,
      tags: ['recommended'],
      playerCount: Math.floor(Math.random() * 16),
      maxPlayers: 16,
      isPrivate: false,
      createdAt: formatISO(),
    });
  }

  res.json({ rooms });
});

// Get popular rooms
router.get('/popular', async (req, res) => {
  const { timeRange = 'week', category, limit = 20 } = req.query;

  // Would fetch rooms sorted by recent visits
  const rooms = [];
  for (let i = 0; i < Math.min(parseInt(limit), 10); i++) {
    rooms.push({
      roomId: 3000 + i,
      name: `Popular Room ${i + 1}`,
      description: 'Very popular!',
      ownerId: 300 + i,
      ownerName: `Creator${300 + i}`,
      imageKey: `room-${3000 + i}.jpg`,
      tags: ['popular', category || 'all'],
      playerCount: Math.floor(Math.random() * 16),
      maxPlayers: 16,
      visitCount: 10000 - i * 100,
      isPrivate: false,
      createdAt: formatISO(),
    });
  }

  res.json({ rooms, timeRange, category: category || 'all' });
});

// Get new rooms
router.get('/new', async (req, res) => {
  const { limit = 20 } = req.query;

  // Would fetch recently created rooms
  const rooms = [];
  for (let i = 0; i < Math.min(parseInt(limit), 10); i++) {
    rooms.push({
      roomId: 4000 + i,
      name: `New Room ${i + 1}`,
      description: 'Freshly created!',
      ownerId: 400 + i,
      ownerName: `Creator${400 + i}`,
      imageKey: `room-${4000 + i}.jpg`,
      tags: ['new'],
      playerCount: 0,
      maxPlayers: 16,
      isPrivate: false,
      createdAt: formatISO(),
    });
  }

  res.json({ rooms });
});

// Get categories
router.get('/categories', async (req, res) => {
  res.json({
    categories: [
      { id: 'all', name: 'All', icon: '🏠' },
      { id: 'popular', name: 'Popular', icon: '🔥' },
      { id: 'featured', name: 'Featured', icon: '⭐' },
      { id: 'new', name: 'New', icon: '🆕' },
      { id: 'games', name: 'Games', icon: '🎮' },
      { id: 'social', name: 'Social', icon: '👥' },
      { id: 'creative', name: 'Creative', icon: '🎨' },
      { id: 'horror', name: 'Horror', icon: '👻' },
      { id: 'roleplay', name: 'Roleplay', icon: '🎭' },
      { id: 'parkour', name: 'Parkour', icon: '🏃' },
      { id: 'puzzle', name: 'Puzzle', icon: '🧩' },
      { id: 'education', name: 'Education', icon: '📚' },
    ],
  });
});

// Search rooms
router.get('/search', async (req, res) => {
  const { q, tags, category, sort = 'relevance', limit = 20, offset = 0 } = req.query;

  if (!q && !tags && !category) {
    return res.status(400).json({ error: 'Query parameter required' });
  }

  // Would implement search
  const rooms = [];
  for (let i = 0; i < Math.min(parseInt(limit), 5); i++) {
    rooms.push({
      roomId: 5000 + i,
      name: `Search Result ${i + 1} for "${q || ''}"`,
      description: 'Matches your search!',
      ownerId: 500 + i,
      ownerName: `Creator${500 + i}`,
      imageKey: `room-${5000 + i}.jpg`,
      tags: tags ? tags.split(',') : ['search'],
      playerCount: Math.floor(Math.random() * 16),
      maxPlayers: 16,
      isPrivate: false,
      createdAt: formatISO(),
    });
  }

  res.json({ rooms, query: q, tags: tags ? tags.split(',') : [], category, sort });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'discovery', status: 'ok' });
});

module.exports = router;



