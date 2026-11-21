/**
 * RecVerse Auth Service
 * Handles authentication, token issuance, cached logins, device authorization
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId, RateLimiter } = require('./shared');

const router = express.Router();

// Rate limiters
const loginRateLimiter = new RateLimiter();
const recoverRateLimiter = new RateLimiter();
const twoFactorRateLimiter = new RateLimiter();

// Constants
const TOKEN_TTL_SECONDS = config.auth.sessionExpiration;
const REFRESH_TOKEN_TTL_SECONDS = config.auth.refreshTokenExpiration;
const TOKEN_SCOPE = 'offline_access profile rn rn.accounts rn.accounts.gc rn.api rn.chat rn.clubs rn.commerce rn.match.read rn.match.write rn.notify rn.rooms rn.storage';
const EMAIL_CODE_TTL_SECONDS = 1800; // 30 minutes
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_ATTEMPT_WINDOW = 900; // 15 minutes

// Platform types
const PlatformType = {
  Steam: 0,
  Oculus: 1,
  Discord: 2,
  Apple: 3,
  Google: 4,
  Epic: 5,
  Viveport: 6,
  Meta: 7, // Alias for Oculus
};

// Staff roles
const STAFF_ROLES = ['developer', 'moderator', 'screenshare'];

// Orientation room for new players
const ORIENTATION_ROOM_ID = 13;
const ORIENTATION_INSTANCE_ID = -2;

// Error responses
function oauthError(res, error, description, status = 400) {
  return res.status(status).json({ error, error_description: description });
}

function unauthorized(res) {
  return res.status(401).send();
}

// Get account by ID
async function getAccount(accountId) {
  const result = await query(
    'SELECT * FROM account WHERE account_id = $1',
    [accountId]
  );
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Get account by username
async function getAccountByUsername(username) {
  const result = await query(
    'SELECT * FROM account WHERE username_lower = $1',
    [username.toLowerCase()]
  );
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Get account by email
async function getAccountByEmail(email) {
  const result = await query(
    'SELECT * FROM account WHERE email_lower = $1',
    [email.toLowerCase()]
  );
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Update account
async function updateAccount(accountId, updates) {
  const current = await getAccount(accountId) || { accountId };
  const updated = { ...current, ...updates, accountId };
  await query(
    'UPDATE account SET data = $2 WHERE account_id = $1',
    [accountId, JSON.stringify(updated)]
  );
  return updated;
}

// Create new account
async function createAccount(overrides = {}) {
  const result = await query(
    'INSERT INTO account (data) VALUES ($1) RETURNING account_id',
    [JSON.stringify({ accountId: 0, ...overrides })]
  );
  const accountId = result.rows[0].account_id;
  return getAccount(accountId);
}

// Set last login time
async function setLastLoginTime(accountId, time) {
  await query(
    "UPDATE account SET data = jsonb_set(data, '{lastLoginTime}', $2) WHERE account_id = $1",
    [accountId, JSON.stringify(time)]
  );
}

// Record account IP
async function recordAccountIp(accountId, ip, meta = {}) {
  await query(
    'INSERT INTO account_ip (account_id, ip, country, created_at) VALUES ($1, $2, $3, NOW())',
    [accountId, ip, meta.country || null]
  );
}

// Set login context (device, IP)
async function setLoginContext(accountId, ctx) {
  const updates = {};
  if (ctx.deviceId) updates.deviceId = ctx.deviceId;
  if (ctx.deviceClass !== undefined) updates.deviceClass = ctx.deviceClass;
  if (ctx.ip) updates.lastLoginIp = ctx.ip;
  if (Object.keys(updates).length > 0) {
    await updateAccount(accountId, updates);
  }
}

// Get password hash
async function getPasswordHash(accountId) {
  const result = await query(
    "SELECT data->>'passwordHash' as hash FROM account WHERE account_id = $1",
    [accountId]
  );
  return result.rows[0]?.hash || null;
}

// Set password hash
async function setPasswordHash(accountId, hash) {
  await query(
    "UPDATE account SET data = jsonb_set(data, '{passwordHash}', $2) WHERE account_id = $1",
    [accountId, JSON.stringify(hash)]
  );
}

// Get platform links for identity
async function getLinksForIdentity(platform, platformId) {
  const result = await query(
    'SELECT account_id FROM platform_account WHERE platform = $1 AND platform_id = $2',
    [platform, platformId]
  );
  return result.rows.map(r => ({ accountId: r.account_id, platform, platformId }));
}

// Link platform identity to account
async function linkPlatformIdentity(accountId, platform, platformId) {
  await query(
    'INSERT INTO platform_account (account_id, platform, platform_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [accountId, platform, platformId]
  );
}

// Check if platform identity is linked
async function isPlatformIdentityLinked(accountId, platform, platformId) {
  const result = await query(
    'SELECT 1 FROM platform_account WHERE account_id = $1 AND platform = $2 AND platform_id = $3',
    [accountId, platform, platformId]
  );
  return result.rows.length > 0;
}

// Count accounts for platform identity
async function countAccountsForPlatformIdentity(platform, platformId) {
  const result = await query(
    'SELECT COUNT(*) FROM platform_account WHERE platform = $1 AND platform_id = $2',
    [platform, platformId]
  );
  return parseInt(result.rows[0].count, 10);
}

// Count accounts by signup IP
async function countAccountsBySignupIp(ip) {
  const result = await query(
    "SELECT COUNT(*) FROM account WHERE data->>'signupIp' = $1",
    [ip]
  );
  return parseInt(result.rows[0].count, 10);
}

// Count accounts by device ID
async function countAccountsByDeviceId(deviceId) {
  const result = await query(
    "SELECT COUNT(*) FROM account WHERE data->>'deviceId' = $1",
    [deviceId]
  );
  return parseInt(result.rows[0].count, 10);
}

// Get accounts by IDs
async function getAccountsByIds(ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const result = await query(
    `SELECT * FROM account WHERE account_id IN (${placeholders})`,
    ids
  );
  return result.rows.map(r => JSON.parse(r.data));
}

// Write audit log
async function writeAuditLog(data) {
  await query(
    'INSERT INTO audit_log (player_id, action, data, created_at) VALUES ($1, $2, $3, NOW())',
    [data.playerId, data.action, JSON.stringify(data.data)]
  );
}

// Resolve ban (simplified)
async function resolveBan(db, accountId, params) {
  // Simplified - would check ban_evasion table in real implementation
  return null;
}

// Check if account holds Discord role
async function accountHoldsDiscordRole(accountId, roleIds) {
  // Simplified - would check platform_account for Discord link with roles
  return false;
}

// Get room by ID
async function getRoomById(roomId) {
  const result = await query('SELECT * FROM room WHERE room_id = $1', [roomId]);
  return result.rows[0] ? JSON.parse(result.rows[0].data) : null;
}

// Set presence
async function setPresence(db, presence) {
  await query(
    `INSERT INTO presence (account_id, room_instance_id, room_id, sub_room_id, status_visibility, device_class, vr_movement_mode, platform, app_version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       room_instance_id = $2, room_id = $3, sub_room_id = $4, status_visibility = $5,
       device_class = $6, vr_movement_mode = $7, platform = $8, app_version = $9, updated_at = NOW()`,
    [
      presence.accountId,
      presence.roomInstance.roomInstanceId,
      presence.roomInstance.roomId,
      presence.roomInstance.subRoomId,
      presence.statusVisibility,
      presence.deviceClass,
      presence.vrMovementMode,
      presence.platform,
      presence.appVersion,
    ]
  );
}

// SubRoom data blob helper
function subRoomDataBlob(sub) {
  return sub ? JSON.stringify(sub) : '{}';
}

// Account roles for token
function accountRoles(account, studio) {
  const roles = [];
  if (account?.hasScreenshare) roles.push('screenshare');
  if (account?.isDeveloper) roles.push('developer');
  if (account?.isModerator) roles.push('moderator');
  if (account?.isJunior) roles.push('junior');
  if (studio) roles.push('betastudio');
  if (account?.isInfluencer) roles.push('influencer');
  return roles;
}

// Account privileges for token
function accountPrivileges(account) {
  return account?.isJunior ? ['BanVChat', 'BanRmChat'] : [];
}

// Account platform
function accountPlatform(account) {
  return account?.platform ?? 0;
}

// Place new player in orientation
async function placeNewPlayerInOrientation(accountId, deviceClass) {
  const room = await getRoomById(ORIENTATION_ROOM_ID);
  if (!room) return;

  const subRooms = room.SubRooms || [];
  const sub = subRooms[0] || { SubRoomId: 1, UnitySceneId: 'Orientation', MaxPlayers: 4 };

  const roomInstance = {
    roomInstanceId: ORIENTATION_INSTANCE_ID,
    roomId: ORIENTATION_ROOM_ID,
    subRoomId: sub.SubRoomId || 1,
    roomInstanceType: 0, // Public
    location: sub.UnitySceneId || 'Orientation',
    dataBlob: subRoomDataBlob(sub),
    eventId: 0,
    clubId: 0,
    roomCode: '',
    photonRegion: 'us',
    photonRegionId: 'us',
    photonRoomId: `rec.${ORIENTATION_ROOM_ID}`,
    name: `^${room.Name || 'Orientation'}`,
    maxCapacity: sub.MaxPlayers || 4,
    isFull: false,
    isPrivate: false,
    isInProgress: false,
    EncryptVoiceChat: false,
  };

  await setPresence(null, {
    accountId,
    roomInstance,
    statusVisibility: 0,
    deviceClass,
    vrMovementMode: 1,
    platform: 0,
    appVersion: config.game.version,
  });
}

// Issue session tokens
async function issueSession(req, accountId, grantType, extra = {}) {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || '';
  const ban = await resolveBan(null, accountId, {
    identity: { ip: clientIp },
    arms: [],
  });

  const roleAccount = await getAccount(accountId);
  if (!roleAccount) {
    return oauthError(req.res, 'invalid_grant', 'account no longer exists');
  }

  const studio = await accountHoldsDiscordRole(accountId, []) || roleAccount.hasStudio;

  const accessToken = generateToken(
    String(accountId),
    roleAccount.platformId || '',
    accountPlatform(roleAccount),
    config.auth.jwtSecret,
    accountRoles(roleAccount, studio),
    accountPrivileges(roleAccount),
    config.game.version,
    roleAccount.hasPlus === true
  );

  const refreshToken = generateId();
  await query(
    'INSERT INTO refresh_token (token, account_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
    [refreshToken, accountId]
  );

  await setLastLoginTime(accountId, formatISO());
  await setLoginContext(accountId, { ip: clientIp });
  await recordAccountIp(accountId, clientIp, { country: req.headers['cf-ipcountry'] });

  // Staff login audit
  const staffRoles = STAFF_ROLES.filter(role => {
    if (role === 'screenshare') return roleAccount.hasScreenshare;
    if (role === 'developer') return roleAccount.isDeveloper;
    if (role === 'moderator') return roleAccount.isModerator;
    return false;
  });

  if (staffRoles.length > 0) {
    await writeAuditLog({
      playerId: accountId,
      action: 'staff_login',
      data: { ip: clientIp, roles: staffRoles, grantType, username: roleAccount.username, deviceId: '', deviceClass: 0, version: null },
    });
  }

  return {
    access_token: accessToken,
    expires_in: TOKEN_TTL_SECONDS,
    token_type: 'Bearer',
    refresh_token: refreshToken,
    scope: TOKEN_SCOPE,
    key: '8oQ+e+WQaOBPbEcakhqs3dwZZdOmmyDUmJSD9u4AHMY=',
    ...extra,
  };
}

// ============================================================
// ROUTES
// ============================================================

// EAC Challenge
router.get('/eac/challenge', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send('"AA=="');
});

// Cached login for platform ID
router.on(['GET', 'POST'], '/cachedlogin/forplatformid/:platform/:id', async (req, res) => {
  const { platform, id } = req.params;
  const platformInt = parseInt(platform, 10);

  // Sideloaded APK special case
  if (platformInt === PlatformType.Oculus && id === '1') {
    return res.json([{
      platform: PlatformType.Oculus,
      platformId: '1',
      accountId: 1,
      lastLoginTime: '2026-07-19T17:13:29.225Z',
      requirePassword: true,
    }]);
  }

  let links;
  if (isNaN(platformInt)) {
    const result = await query(
      'SELECT account_id, platform FROM platform_account WHERE platform_id = $1',
      [id]
    );
    links = result.rows.map(r => ({ accountId: r.account_id, platform: r.platform, platformId: id }));
  } else {
    const result = await query(
      'SELECT account_id FROM platform_account WHERE platform = $1 AND platform_id = $2',
      [platformInt, id]
    );
    links = result.rows.map(r => ({ accountId: r.account_id, platform: platformInt, platformId: id }));
  }

  const accounts = await getAccountsByIds(links.map(l => l.accountId));
  const byId = new Map(accounts.map(a => [a.accountId, a]));

  const cachedLogins = links
    .map(link => {
      const account = byId.get(link.accountId);
      if (!account) return null;
      return {
        platform: link.platform,
        platformId: link.platformId,
        accountId: account.accountId,
        lastLoginTime: account.lastLoginTime || account.createdAt,
        requirePassword: false,
      };
    })
    .filter(Boolean);

  res.json(cachedLogins);
});

// Bulk cached login lookup
router.post('/cachedlogin/forplatformids', async (req, res) => {
  const ids = req.body.id || [];
  const idArray = Array.isArray(ids) ? ids : [ids];

  const allLogins = [];
  for (const pid of idArray) {
    const result = await query(
      'SELECT account_id, platform FROM platform_account WHERE platform_id = $1',
      [String(pid)]
    );
    const links = result.rows.map(r => ({ accountId: r.account_id, platform: r.platform, platformId: String(pid) }));
    const accounts = await getAccountsByIds(links.map(l => l.accountId));
    const byId = new Map(accounts.map(a => [a.accountId, a]));

    for (const link of links) {
      const account = byId.get(link.accountId);
      if (account) {
        allLogins.push({
          platform: link.platform,
          platformId: link.platformId,
          accountId: account.accountId,
          lastLoginTime: account.lastLoginTime || account.createdAt,
          requirePassword: false,
        });
      }
    }
  }

  res.json(allLogins);
});

// Device Authorization (Studio)
router.post('/connect/deviceauthorization', async (req, res) => {
  const clientId = req.body.client_id;
  const clientSecret = req.body.client_secret;

  if (clientId !== 'recroom.studio') {
    return oauthError(res, 'invalid_client', 'Invalid client_id');
  }

  // In real implementation, verify client_secret
  const userCode = randomString(8).toUpperCase().match(/.{1,4}/g).join('-');
  const deviceCode = generateId();
  const expiresIn = 900; // 15 minutes

  await query(
    'INSERT INTO device_code (device_code, user_code, client_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'15 minutes\')',
    [deviceCode, userCode, clientId]
  );

  const www = config.services.accounts.replace('/accounts', ''); // Get base URL
  const verificationUri = `${www}/device`;

  res.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(userCode)}`,
    expires_in: expiresIn,
    interval: 5,
  });
});

// Device decision
router.post('/connect/deviceauthorization/decision', async (req, res) => {
  const accountId = await getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const userCode = req.body.user_code;
  if (!userCode) return oauthError(res, 'invalid_grant', 'Missing user_code');

  const result = await query(
    'SELECT * FROM device_code WHERE user_code = $1 AND expires_at > NOW()',
    [userCode]
  );

  if (result.rows.length === 0) {
    return oauthError(res, 'expired_token', 'Code expired or not found');
  }

  const deviceCode = result.rows[0];

  if (req.body.action === 'approve') {
    await query('UPDATE device_code SET approved = true, account_id = $1 WHERE device_code = $2', [accountId, deviceCode.device_code]);
    res.json({ ok: true });
  } else {
    await query('DELETE FROM device_code WHERE device_code = $1', [deviceCode.device_code]);
    res.json({ ok: true });
  }
});

// Poll device code
router.post('/connect/deviceauthorization/poll', async (req, res) => {
  const deviceCode = req.body.device_code;
  if (!deviceCode) return oauthError(res, 'invalid_grant', 'Missing device_code');

  const result = await query(
    'SELECT * FROM device_code WHERE device_code = $1 AND expires_at > NOW()',
    [deviceCode]
  );

  if (result.rows.length === 0) {
    return oauthError(res, 'expired_token', 'Device code expired');
  }

  const code = result.rows[0];

  if (code.approved && code.account_id) {
    await query('DELETE FROM device_code WHERE device_code = $1', [deviceCode]);
    const session = await issueSession(req, code.account_id, 'device_code');
    res.json(session);
  } else if (!code.approved && code.expires_at < new Date()) {
    await query('DELETE FROM device_code WHERE device_code = $1', [deviceCode]);
    return oauthError(res, 'expired_token', 'Device code expired');
  } else {
    return oauthError(res, 'authorization_pending', 'Waiting for user approval');
  }
});

// Token endpoint
router.post('/connect/token', async (req, res) => {
  const grantType = req.body.grant_type;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || '';

  try {
    switch (grantType) {
      case 'password': {
        const username = req.body.username;
        const password = req.body.password;
        const deviceId = req.body.device_id;
        const deviceClass = parseInt(req.body.device_class, 10) || 0;
        const platformAuth = req.body.platform_auth;
        const platform = parseInt(req.body.platform, 10);
        const platformId = req.body.platform_id;

        if (!username || !password) {
          return oauthError(res, 'invalid_grant', 'Missing username or password');
        }

        // Find account by username or email
        let account = await getAccountByUsername(username);
        if (!account && isValidEmail(username)) {
          account = await getAccountByEmail(username);
        }
        if (!account) {
          return oauthError(res, 'invalid_grant', 'Invalid username or password');
        }

        // Verify password
        const hash = await getPasswordHash(account.accountId);
        if (!hash || !(await verifyPassword(password, hash))) {
          return oauthError(res, 'invalid_grant', 'Invalid username or password');
        }

        // Handle platform auth linking
        if (platformAuth && platform !== undefined) {
          // In real implementation, verify Steam ticket or Meta nonce
          await linkPlatformIdentity(account.accountId, platform, platformId);
        }

        // Link device ID
        if (deviceId) {
          await linkPlatformIdentity(account.accountId, platform || 0, deviceId); // Simplified
        }

        const session = await issueSession(req, account.accountId, 'password');
        res.json(session);
        break;
      }

      case 'refresh_token': {
        const refreshToken = req.body.refresh_token;
        if (!refreshToken) {
          return oauthError(res, 'invalid_grant', 'Missing refresh_token');
        }

        const result = await query(
          'SELECT account_id FROM refresh_token WHERE token = $1 AND expires_at > NOW()',
          [refreshToken]
        );

        if (result.rows.length === 0) {
          return oauthError(res, 'invalid_grant', 'Invalid or expired refresh token');
        }

        const accountId = result.rows[0].account_id;
        await query('DELETE FROM refresh_token WHERE token = $1', [refreshToken]);

        const session = await issueSession(req, accountId, 'refresh_token');
        res.json(session);
        break;
      }

      case 'cached_login': {
        const accountId = parseInt(req.body.account_id, 10);
        const platformAuth = req.body.platform_auth;
        const platform = parseInt(req.body.platform, 10);
        const platformId = req.body.platform_id;

        if (!accountId) {
          return oauthError(res, 'invalid_grant', 'Missing account_id');
        }

        // Verify platform auth
        if (!platformAuth || platform === undefined || !platformId) {
          return oauthError(res, 'invalid_grant', 'Missing platform authentication');
        }

        // Verify the platform identity matches the account
        const linked = await isPlatformIdentityLinked(accountId, platform, platformId);
        if (!linked) {
          return oauthError(res, 'invalid_grant', 'Platform identity not linked to account');
        }

        const session = await issueSession(req, accountId, 'cached_login');
        res.json(session);
        break;
      }

      case 'identity_assertion': {
        const assertion = req.body.assertion;
        if (!assertion) {
          return oauthError(res, 'invalid_grant', 'Missing assertion');
        }

        // Verify the assertion (JWT signed by www)
        // In real implementation, validate the signature
        const decoded = verifyToken(assertion);
        if (!decoded || !decoded.platform || !decoded.platformId) {
          return oauthError(res, 'invalid_grant', 'Invalid or expired identity assertion');
        }

        const links = await getLinksForIdentity(decoded.platform, decoded.platformId);
        if (links.length > 1) {
          return oauthError(res, 'invalid_grant', 'Platform identity linked to multiple accounts');
        }

        if (links.length === 1) {
          const session = await issueSession(req, links[0].accountId, 'identity_assertion');
          res.json(session);
        } else {
          // Create new account
          const account = await createAccount({
            platforms: 0,
            lastLoginTime: formatISO(),
            signupIp: clientIp,
            lastLoginIp: clientIp,
          });
          await linkPlatformIdentity(account.accountId, decoded.platform, decoded.platformId);
          await placeNewPlayerInOrientation(account.accountId, 0);
          const session = await issueSession(req, account.accountId, 'identity_assertion', { created: true });
          res.json(session);
        }
        break;
      }

      default:
        return oauthError(res, 'unsupported_grant_type', `Grant type ${grantType} not supported`);
    }
  } catch (error) {
    console.error('[Auth] Token error:', error);
    return oauthError(res, 'server_error', 'Internal server error', 500);
  }
});

// Role lookups
router.get('/role/:role/:id', async (req, res) => {
  const { role, id } = req.params;
  const accountId = parseInt(id, 10);
  if (isNaN(accountId)) return res.status(404).send();

  const account = await getAccount(accountId);
  if (!account) return res.status(404).send();

  let hasRole = false;
  if (role === 'developer') hasRole = account.isDeveloper === true;
  else if (role === 'moderator') hasRole = account.isModerator === true;
  else if (role === 'screenshare') hasRole = account.hasScreenshare === true;

  res.json(hasRole);
});

router.get('/role/:role', async (req, res) => {
  const { role } = req.params;
  const ids = req.query.id ? (Array.isArray(req.query.id) ? req.query.id : [req.query.id]) : [];
  const intIds = ids.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
  const uniqueIds = [...new Set(intIds)];

  if (uniqueIds.length === 0) return res.json([]);

  const accounts = await getAccountsByIds(uniqueIds);
  const holders = new Set(accounts.filter(a => {
    if (role === 'developer') return a.isDeveloper === true;
    if (role === 'moderator') return a.isModerator === true;
    return false;
  }).map(a => a.accountId));

  res.json(uniqueIds.filter(id => holders.has(id)));
});

// ============================================================
// TWO-FACTOR AUTHENTICATION
// ============================================================

// Simplified 2FA endpoints - would need full implementation with TOTP and email codes
router.post('/account/twofactor/enable', async (req, res) => {
  const accountId = await getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Would implement TOTP setup or email 2FA
  res.json({ success: true, message: '2FA not fully implemented' });
});

router.post('/account/twofactor/disable', async (req, res) => {
  const accountId = await getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  res.json({ success: true, message: '2FA not fully implemented' });
});

// ============================================================
// PASSWORD RECOVERY
// ============================================================

router.post('/account/recoverpassword', async (req, res) => {
  const email = req.body.email;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || '';

  if (!email || !isValidEmail(email)) {
    return res.json({ success: true }); // Don't reveal if email exists
  }

  // Rate limit by IP
  const ipLimit = recoverRateLimiter.check(`recover:${clientIp}`, 10, 3600000);
  if (!ipLimit.allowed) {
    return res.json({ success: true }); // Silent fail
  }

  const account = await getAccountByEmail(email);
  if (!account) {
    return res.json({ success: true }); // Don't reveal
  }

  // Would send email with reset code
  res.json({ success: true });
});

router.post('/account/resetpassword', async (req, res) => {
  const email = req.body.email;
  const code = req.body.code;
  const password = req.body.password;

  if (!email || !code || !password) {
    return oauthError(res, 'invalid_grant', 'Missing required fields');
  }

  // Would verify code and reset password
  res.json({ success: true, message: 'Password reset not fully implemented' });
});

module.exports = router;



