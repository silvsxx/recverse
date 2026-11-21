/**
 * RecVerse Player Settings Service
 * Handles player preferences, settings, keybinds
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
// PLAYER SETTINGS
// ============================================================

// Get all settings for account
router.get('/settings', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const result = await query(
    'SELECT * FROM player_settings WHERE account_id = $1',
    [accountId]
  );

  if (result.rows.length === 0) {
    // Return defaults
    return res.json({
      accountId,
      settings: getDefaultSettings(),
    });
  }

  const settings = JSON.parse(result.rows[0].data);
  res.json({ accountId, settings });
});

// Update settings
router.put('/settings', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { settings } = req.body;
  if (!settings) return res.status(400).json({ error: 'Missing settings' });

  const current = await getSettings(accountId);
  const updated = { ...current, ...settings };

  await query(
    `INSERT INTO player_settings (account_id, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE SET data = $2, updated_at = NOW()`,
    [accountId, JSON.stringify(updated)]
  );

  res.json({ success: true, settings: updated });
});

// Get specific setting
router.get('/settings/:key', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const key = req.params.key;
  const current = await getSettings(accountId);

  if (key in current) {
    res.json({ key, value: current[key] });
  } else {
    const defaults = getDefaultSettings();
    res.json({ key, value: defaults[key] || null });
  }
});

// Update specific setting
router.put('/settings/:key', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const key = req.params.key;
  const { value } = req.body;

  const current = await getSettings(accountId);
  current[key] = value;

  await query(
    `INSERT INTO player_settings (account_id, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE SET data = $2, updated_at = NOW()`,
    [accountId, JSON.stringify(current)]
  );

  res.json({ success: true, key, value });
});

// Reset settings to defaults
router.post('/settings/reset', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const defaults = getDefaultSettings();
  await query(
    `INSERT INTO player_settings (account_id, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE SET data = $2, updated_at = NOW()`,
    [accountId, JSON.stringify(defaults)]
  );

  res.json({ success: true, settings: defaults });
});

// Helper: get settings
async function getSettings(accountId) {
  const result = await query('SELECT data FROM player_settings WHERE account_id = $1', [accountId]);
  if (result.rows.length === 0) return getDefaultSettings();
  return JSON.parse(result.rows[0].data);
}

// Default settings
function getDefaultSettings() {
  return {
    // Graphics
    graphicsQuality: 2,
    resolutionScale: 1.0,
    vsync: true,
    fov: 90,
    motionBlur: false,
    bloom: true,
    ssao: true,
    shadows: true,
    antiAliasing: 1,

    // Audio
    masterVolume: 1.0,
    musicVolume: 0.5,
    sfxVolume: 1.0,
    voiceVolume: 1.0,
    voiceChatEnabled: true,
    pushToTalk: false,
    pushToTalkKey: 'V',

    // Comfort
    snapTurn: false,
    snapTurnAngle: 45,
    smoothTurn: true,
    movementType: 'smooth', // smooth, teleport, snap
    vignette: true,
    reduceMotion: false,

    // Controls
    keybinds: {
      jump: 'Space',
      crouch: 'C',
      sprint: 'Shift',
      interact: 'E',
      menu: 'Escape',
      screenshot: 'F12',
      pushToTalk: 'V',
    },

    // UI
    showNames: true,
    showHealth: true,
    showComfortRating: true,
    language: 'en',
    chatFilter: true,
    profanityFilter: true,

    // Privacy
    showOnlineStatus: true,
    allowFriendRequests: true,
    allowPartyInvites: true,
    allowRoomInvites: true,
    allowVoiceChat: true,
    showActivity: true,

    // Accessibility
    subtitles: false,
    subtitleSize: 1.0,
    colorBlindMode: 'none', // none, protanopia, deuteranopia, tritanopia
    highContrast: false,
    textToSpeech: false,
    speechToText: false,
  };
}

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'playersettings', status: 'ok' });
});

module.exports = router;



