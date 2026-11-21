/**
 * RecVerse Economy Service
 * Handles tokens, inventory, equipment, consumables, catalog
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId, formatISO, parseIds } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// CURRENCY / TOKENS
// ============================================================

// Get token balance
router.get('/tokenbalance/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch from token_balance table
  res.json({ accountId, tokens: 0 });
});

// Get player currency
router.get('/playercurrency/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({
    accountId,
    tokens: 0,
    tickets: 0,
    // Other currencies
  });
});

// ============================================================
// CATALOG
// ============================================================

// Get catalog
router.get('/catalog', async (req, res) => {
  // Would fetch from catalog table
  res.json({
    categories: [],
    items: [],
    bundles: [],
  });
});

// Get catalog item
router.get('/catalog/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  // Would fetch item details
  res.json({ itemId, name: 'Item', price: 0 });
});

// ============================================================
// INVENTORY
// ============================================================

// Get inventory
router.get('/inventory/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  // Would fetch from inventory tables
  res.json({
    accountId,
    items: [],
    equipment: [],
    consumables: [],
  });
});

// Get inventory item
router.get('/inventory/:accountId/:itemId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  const itemId = req.params.itemId;
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, itemId, quantity: 0 });
});

// Add item to inventory
router.post('/inventory/:accountId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would add item
  res.json({ success: true });
});

// ============================================================
// EQUIPMENT
// ============================================================

// Get equipment
router.get('/equipment/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, slots: {} });
});

// Equip item
router.post('/equipment/:accountId/equip', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// Unequip item
router.post('/equipment/:accountId/unequip', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// ============================================================
// CONSUMABLES
// ============================================================

// Get consumables
router.get('/consumables/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, consumables: [] });
});

// Use consumable
router.post('/consumables/:accountId/use', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// ============================================================
// PURCHASES
// ============================================================

// Purchase item
router.post('/purchase', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { itemId, currency, quantity } = req.body;

  // Would process purchase
  res.json({ success: true, transactionId: 'txn-' + Date.now() });
});

// ============================================================
// GIFTS
// ============================================================

// Send gift
router.post('/gifts/send', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// Claim gift
router.post('/gifts/claim', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// ============================================================
// REWARDS
// ============================================================

// Get daily reward
router.get('/rewards/daily/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, claimed: false, reward: null });
});

// Claim daily reward
router.post('/rewards/daily/:accountId/claim', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true, reward: { tokens: 100 } });
});

// ============================================================
// CHALLENGES
// ============================================================

// Get challenges
router.get('/challenges/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, challenges: [] });
});

// Complete challenge
router.post('/challenges/:accountId/complete', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// ============================================================
// INFLUENCER PARTNER PROGRAM
// ============================================================

// Get influencers
router.get('/influencerpartnerprogram/influencers', async (req, res) => {
  res.json({ influencers: [] });
});

// Support influencer
router.post('/influencerpartnerprogram/support', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true });
});

// Get my influencer
router.get('/influencerpartnerprogram/myinfluencer/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, influencerId: 0 });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'econ', status: 'ok' });
});

module.exports = router;
