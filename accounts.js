/**
 * RecVerse Accounts Service
 * Handles account lookups, profile mutations, search
 */

const express = require('express');
const { query, transaction } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId } = require('./shared');

const router = express.Router();

// Constants
const SEARCH_LIMIT = 20;
const DEFAULT_USERNAME_CHANGES = 3;

// Whitelisted emojis (from RecFlare)
const WHITELISTED_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
  '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
  '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
  '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
  '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
  '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
  '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
  '👿', '👹', '👺', '💀', '☠️', '👻', '👽', '👾', '🤖', '💩',
  '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙌',
  '👏', '👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟',
  '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👋', '🤚',
  '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✍️', '🙏', '🤝', '💅',
  '💪', '🦾', '🦵', '🦿', '👂', '🦻', '👃', '🧠', '🫀', '🫁',
  '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸', '👶', '🧒',
  '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵',
  '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🙇', '🤦', '🤷', '🧑‍⚕️',
  '🧑‍🎓', '🧑‍⚖️', '🧑‍🌾', '🧑‍🍳', '🧑‍🔧', '🧑‍🏭', '🧑‍💼', '🧑‍🔬', '🧑‍💻', '🧑‍🎨',
  '🧑‍🎤', '🧑‍✈️', '🧑‍🚀', '🧑‍🚒', '👮', '🕵️', '💂', '🥷', '👷', '🤴',
  '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅',
  '🤶', '🧑‍🎄', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜', '🧝', '🧞',
  '🧟', '💆', '💇', '🚶', '🏃', '💃', '🕺', '🕴️', '👯', '🧖',
  '🧗', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🏄', '🏊', '🤽', '🚣',
  '🧘', '🛀', '🛌', '🤸', '🤾', '🤼', '🤽', '🏋️', '🚴', '🚵',
  '🤹', '🎭', '🧑‍🎭', '🧸', '🎨', '🎮', '🕹️', '🎲', '🎰', '🎯',
  '🎱', '🎳', '🏀', '⚽', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉',
  '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳',
  '🏹', '🎣', '🤿', '🏋️', '🤸', '🏊', '🧘', '🏄', '🏂', '🏇',
  '🏹', '🎯', '🎮', '🎨', '🎭', '🎤', '🎧', '🎻', '🎺', '🎷',
  '🎸', '🎹', '🎼', '🎵', '🎶', '🎷', '🎸', '🎹', '🎻', '🎺',
  '🎧', '🎤', '🎭', '🎨', '🎮', '🕹️', '🎲', '🎯', '🎱', '🎳',
];

// Helper: get account by ID
async function getAccount(accountId) {
  const result = await query('SELECT * FROM account WHERE account_id = $1', [accountId]);
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Helper: get account by username
async function getAccountByUsername(username) {
  const result = await query('SELECT * FROM account WHERE username_lower = $1', [username.toLowerCase()]);
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Helper: get account by email
async function getAccountByEmail(email) {
  const result = await query('SELECT * FROM account WHERE email_lower = $1', [email.toLowerCase()]);
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Helper: update account
async function updateAccount(accountId, updates) {
  const current = await getAccount(accountId) || { accountId };
  const updated = { ...current, ...updates, accountId };
  await query(
    'UPDATE account SET data = $2 WHERE account_id = $1',
    [accountId, JSON.stringify(updated)]
  );
  return updated;
}

// Helper: search accounts by username prefix
async function searchAccounts(name, limit = SEARCH_LIMIT) {
  const q = name.trim().toLowerCase();
  if (!q) return [];

  const result = await query(
    `SELECT * FROM account
     WHERE username_lower >= $1 AND username_lower < $2 AND username_lower LIKE $3 ESCAPE '\\'
     ORDER BY username_lower LIMIT $4`,
    [q, q + '\u{10FFFF}', q.replace(/[%_\\]/g, '\\$&') + '%', limit]
  );
  return result.rows.map(r => JSON.parse(r.data));
}

// Helper: get accounts by IDs
async function getAccountsByIds(ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `SELECT * FROM account WHERE account_id IN (${placeholders})`,
    ids
  );
  return result.rows.map(r => JSON.parse(r.data));
}

// Helper: project to public account DTO
function toAccountDto(account) {
  return {
    accountId: account.accountId,
    username: account.username,
    displayName: account.displayName,
    profileImage: account.profileImage,
    bannerImage: account.bannerImage || '',
    displayEmoji: account.displayEmoji || '',
    isJunior: account.isJunior,
    platforms: account.platforms,
    personalPronouns: account.personalPronouns,
    identityFlags: account.identityFlags,
    createdAt: account.createdAt,
  };
}

// Helper: project to private self account DTO
function toSelfAccountDto(account) {
  return {
    ...toAccountDto(account),
    email: account.email || '',
    birthday: '1904-01-01T00:00:00.000Z',
    availableUsernameChanges: account.availableUsernameChanges ?? DEFAULT_USERNAME_CHANGES,
    isDeleted: account.isDeleted === true,
    ...(account.isDeleted === true && account.deletedAt ? { deletedAt: account.deletedAt } : {}),
  };
}

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// ROUTES
// ============================================================

// Health check
router.get('/', (req, res) => {
  res.json({ service: 'accounts', status: 'ok' });
});

// Whitelisted emojis
router.get('/emojiConfig/whitelistedEmojis', (req, res) => {
  res.json(WHITELISTED_EMOJIS);
});

// Self account
router.get('/account/me', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const account = await getAccount(accountId) || { accountId, username: `Player${accountId}`, displayName: `Player${accountId}` };
  res.json(toSelfAccountDto(account));
});

// Search accounts
router.get('/account/search', async (req, res) => {
  const name = req.query.name || '';
  const take = parseInt(req.query.take, 10);
  const limit = isNaN(take) ? SEARCH_LIMIT : Math.max(1, Math.min(take, SEARCH_LIMIT));

  const accounts = await searchAccounts(name, limit);
  res.json(accounts.map(toAccountDto));
});

// Account by username (path)
router.get('/account/username/:name', async (req, res) => {
  const name = req.params.name.trim().replace(/^@/, '');
  if (!name) return res.status(404).json({ error: `There's no player called @${name}.` });

  const account = await getAccountByUsername(name);
  if (!account) return res.status(404).json({ error: `There's no player called @${name}.` });

  res.json(toAccountDto(account));
});

// Account by username (query)
router.get('/account', async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(404).json({ error: 'No account has that username' });

  const account = await getAccountByUsername(username);
  if (!account) return res.status(404).json({ error: 'No account has that username' });

  res.json(toAccountDto(account));
});

// Bulk account lookup (GET)
router.get('/account/bulk', async (req, res) => {
  const ids = parseIds(req.query.id);
  const uniqueIds = deduplicate(ids);

  const stored = new Map((await getAccountsByIds(uniqueIds)).map(a => [a.accountId, a]));
  const results = uniqueIds.map(id => toAccountDto(stored.get(id) || { accountId: id, username: `Player${id}`, displayName: `Player${id}` }));
  res.json(results);
});

// Bulk account lookup (POST)
router.post('/account/bulk', async (req, res) => {
  const ids = parseIds(req.body.id);
  const uniqueIds = deduplicate(ids);

  const stored = new Map((await getAccountsByIds(uniqueIds)).map(a => [a.accountId, a]));
  const results = uniqueIds.map(id => toAccountDto(stored.get(id) || { accountId: id, username: `Player${id}`, displayName: `Player${id}` }));
  res.json(results);
});

// Account bio
router.get('/account/:id/bio', async (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  if (isNaN(accountId)) return res.status(400).send();

  const account = await getAccount(accountId);
  res.json({ accountId, bio: account?.bio || '' });
});

// Single account by ID
router.get('/account/:id', async (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  if (isNaN(accountId)) return res.status(400).send();

  const account = await getAccount(accountId) || { accountId, username: `Player${accountId}`, displayName: `Player${accountId}` };
  res.json(toAccountDto(account));
});

// Create account
router.post('/account/create', async (req, res) => {
  const platform = parseInt(req.body.platform, 10) || 0;
  // platformId is parsed but not persisted yet

  const account = await createAccount({ platforms: platform });
  res.json({ success: true, value: toAccountDto(account) });
});

// Parental control
router.get('/parentalcontrol/me', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ accountId, disallowInAppPurchases: true });
});

// Privacy settings
router.get('/accountprivacysettings/:id', (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  if (isNaN(accountId)) return res.status(400).send();

  res.json({ accountId, isRecentHistoryVisible: true });
});

// Display name
router.put('/account/me/displayname', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { displayName } = req.body;
  if (!displayName || displayName.length > 15) {
    return res.status(400).send();
  }

  await updateAccount(accountId, { displayName });
  res.json({ success: true });
});

// Username
router.put('/account/me/username', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { username } = req.body;
  if (!username || username.length > 50 || !/^[a-zA-Z0-9]+$/.test(username)) {
    return res.json({ success: false, error: 'That username cannot be used.', value: '' });
  }

  // Check if taken
  const existing = await getAccountByUsername(username);
  if (existing && existing.accountId !== accountId) {
    return res.json({ success: false, error: 'That username is already taken.', value: '' });
  }

  // Check remaining changes
  const account = await getAccount(accountId) || { accountId };
  const remaining = account.availableUsernameChanges ?? DEFAULT_USERNAME_CHANGES;
  if (remaining <= 0) {
    return res.json({ success: false, error: 'You have no username changes remaining.', value: '' });
  }

  try {
    const updated = await updateAccount(accountId, {
      username,
      availableUsernameChanges: remaining - 1,
    });
    res.json({ success: true, error: '', value: toAccountDto(updated) });
  } catch (error) {
    if (error.message?.includes('username_lower')) {
      return res.json({ success: false, error: 'That username is already taken.', value: '' });
    }
    throw error;
  }
});

// Email
router.post('/account/me/email', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).send();
  }

  // Check if taken by another account
  const holder = await getAccountByEmail(email);
  if (holder && holder.accountId !== accountId) {
    return res.status(400).json({ success: false, error: 'That email address is already on another account.' });
  }

  const current = (await getAccount(accountId))?.email || null;
  if (current && current.toLowerCase() === email.toLowerCase()) {
    await updateAccount(accountId, { email });
    return res.json({ success: true });
  }

  // Would send confirmation code in real implementation
  res.json({ success: true });
});

router.get('/account/me/email/pending', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ pending: null, sentTo: null });
});

router.post('/account/me/email/confirm', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: false, error: 'Enter the code from the email.' });
});

// Phone
router.post('/account/me/phone', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { phone } = req.body;
  if (!phone) return res.status(400).send();

  await updateAccount(accountId, { phone });
  res.json({ success: true });
});

// Identity flags
router.put('/account/me/identityflags', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const identityFlags = parseInt(req.body.identityFlags, 10);
  if (isNaN(identityFlags)) return res.status(400).send();

  await updateAccount(accountId, { identityFlags });
  res.json({ success: true });
});

// Personal pronouns
router.put('/account/me/personalpronouns', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const personalPronouns = parseInt(req.body.pronounFlags, 10);
  if (isNaN(personalPronouns)) return res.status(400).send();

  await updateAccount(accountId, { personalPronouns });
  res.json({ success: true });
});

// Bio
router.put('/account/me/bio', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { bio } = req.body;
  if (bio && bio.length > 255) return res.status(400).send();

  await updateAccount(accountId, { bio: bio || '' });
  res.json({ success: true });
});

// Display emoji
router.put('/account/me/emoji', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const submitted = req.body.displayEmoji || '';
  const displayEmoji = submitted === '' ? '' : WHITELISTED_EMOJIS.includes(submitted) ? submitted : null;

  if (displayEmoji === null) return res.status(400).send();

  // Check Plus for setting emoji (simplified)
  if (displayEmoji !== '') {
    // Would check token for rn.plus claim
  }

  await updateAccount(accountId, { displayEmoji });
  res.json({ success: true });
});

// Banner image
router.put('/account/me/bannerimage', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const imageName = req.body.imageName;
  if (!imageName) return res.status(400).send();

  await updateAccount(accountId, { bannerImage: imageName });
  res.json({ success: true });
});

// Profile image
router.put('/account/me/profileimage', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const imageName = req.body.imageName;
  if (!imageName) return res.status(400).send();

  await updateAccount(accountId, { profileImage: imageName });
  res.json({ success: true });
});

// Helper: create account
async function createAccount(overrides = {}) {
  const result = await query(
    'INSERT INTO account (data) VALUES ($1) RETURNING account_id',
    [JSON.stringify({ accountId: 0, username: `Player${Date.now()}`, displayName: `Player${Date.now()}`, profileImage: 'DefaultProfileImage.jpg', ...overrides })]
  );
  const accountId = result.rows[0].account_id;
  return getAccount(accountId);
}

module.exports = router;



