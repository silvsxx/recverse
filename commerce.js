/**
 * RecVerse Commerce Service
 * Handles purchases, subscriptions, receipts, store
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
// PURCHASES
// ============================================================

// Process purchase
router.post('/purchase', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { productId, currency, price, quantity, receipt, platform } = req.body;

  if (!productId || !currency || price === undefined) {
    return res.status(400).json({ error: 'productId, currency, and price required' });
  }

  const purchaseId = generateId();
  await query(
    `INSERT INTO purchase (purchase_id, account_id, product_id, currency, price, quantity, receipt, platform, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', NOW())`,
    [purchaseId, accountId, productId, currency, price, quantity || 1, receipt || null, platform || 'unknown']
  );

  // Grant items/currency based on product
  // This would integrate with econ service

  res.json({
    success: true,
    purchaseId,
    productId,
    currency,
    price,
    quantity: quantity || 1,
  });
});

// Get purchase history
router.get('/purchases', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { limit = 50, offset = 0 } = req.query;

  const result = await query(
    `SELECT purchase_id, product_id, currency, price, quantity, platform, status, created_at
     FROM purchase
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [accountId, parseInt(limit), parseInt(offset)]
  );

  res.json({ purchases: result.rows });
});

// Get purchase details
router.get('/purchases/:purchaseId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const purchaseId = req.params.purchaseId;

  const result = await query(
    `SELECT * FROM purchase WHERE purchase_id = $1 AND account_id = $2`,
    [purchaseId, accountId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Purchase not found' });
  }

  res.json(result.rows[0]);
});

// ============================================================
// SUBSCRIPTIONS (Rec Room Plus)
// ============================================================

// Get subscription status
router.get('/subscription', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    `SELECT * FROM subscription WHERE account_id = $1 AND status = 'active' AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [accountId]
  );

  if (result.rows.length === 0) {
    return res.json({ active: false });
  }

  const sub = result.rows[0];
  res.json({
    active: true,
    subscriptionId: sub.subscription_id,
    plan: sub.plan,
    startedAt: sub.started_at,
    endsAt: sub.ends_at,
    autoRenew: sub.auto_renew,
    platform: sub.platform,
  });
});

// Create subscription (from platform receipt)
router.post('/subscription', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { plan, receipt, platform, autoRenew } = req.body;

  if (!plan || !receipt) {
    return res.status(400).json({ error: 'plan and receipt required' });
  }

  // Verify receipt with platform (Apple/Google/Steam/Oculus)
  // For now, just create subscription

  const subscriptionId = generateId();
  const now = new Date();
  const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await query(
    `INSERT INTO subscription (subscription_id, account_id, plan, receipt, platform, auto_renew, started_at, ends_at, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())`,
    [subscriptionId, accountId, plan, receipt, platform || 'unknown', autoRenew !== false, now, endsAt]
  );

  // Update account hasPlus flag
  await query(
    `UPDATE account SET data = jsonb_set(data, '{hasPlus}', 'true') WHERE account_id = $1`,
    [accountId]
  );

  res.json({
    success: true,
    subscriptionId,
    plan,
    startedAt: now,
    endsAt,
  });
});

// Cancel subscription
router.post('/subscription/cancel', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  await query(
    `UPDATE subscription SET status = 'cancelled', auto_renew = false WHERE account_id = $1 AND status = 'active'`,
    [accountId]
  );

  // Note: Don't remove hasPlus immediately - let it expire naturally
  // Or remove it if that's the desired behavior

  res.json({ success: true });
});

// ============================================================
// STORE / CATALOG
// ============================================================

// Get store catalog
router.get('/catalog', async (req, res) => {
  const { category, platform } = req.query;

  // Would fetch from catalog table with platform-specific pricing
  res.json({
    categories: [
      { id: 'tokens', name: 'Tokens', items: [] },
      { id: 'subscriptions', name: 'Subscriptions', items: [] },
      { id: 'bundles', name: 'Bundles', items: [] },
    ],
    items: [],
  });
});

// Get product details
router.get('/catalog/:productId', async (req, res) => {
  const productId = req.params.productId;
  const { platform } = req.query;

  // Would fetch product with platform-specific pricing
  res.json({
    productId,
    name: 'Product',
    description: 'Description',
    price: 0,
    currency: 'USD',
    platformPrices: {},
  });
});

// ============================================================
// RECEIPT VALIDATION
// ============================================================

// Validate receipt (Apple/Google/Steam/Oculus)
router.post('/receipt/validate', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { receipt, platform, productId } = req.body;

  if (!receipt || !platform) {
    return res.status(400).json({ error: 'receipt and platform required' });
  }

  // In real implementation, would verify with platform's validation API
  // For now, return mock validation

  const isValid = true; // Would be actual validation result

  if (isValid) {
    // Check if receipt already used
    const existing = await query(
      'SELECT 1 FROM purchase WHERE receipt = $1 AND platform = $2',
      [receipt, platform]
    );

    if (existing.rows.length > 0) {
      return res.json({ valid: false, error: 'Receipt already used' });
    }

    // Store validated receipt for later purchase processing
    await query(
      `INSERT INTO validated_receipt (receipt, platform, product_id, account_id, validated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (receipt, platform) DO UPDATE SET product_id = $3, account_id = $4, validated_at = NOW()`,
      [receipt, platform, productId || null, accountId]
    );
  }

  res.json({ valid: isValid });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'commerce', status: 'ok' });
});

module.exports = router;



