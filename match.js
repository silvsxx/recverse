/**
 * RecVerse Matchmaking Service
 * Handles room matchmaking, player connection info, heartbeats
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
// MATCHMAKING
// ============================================================

// Find room (matchmake)
router.post('/matchmake', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { roomId, subRoomId, region, mode, tags } = req.body;

  // In a real implementation, this would:
  // 1. Check for existing room instances with space
  // 2. Check region preferences
  // 3. Create new instance if needed
  // 4. Return Photon/Tachyon connection info

  // For now, return a mock response that the client expects
  const roomInstanceId = generateId();

  res.json({
    roomInstanceId,
    roomId: roomId || 0,
    subRoomId: subRoomId || 1,
    roomInstanceType: 0, // Public
    location: 'Dorm',
    dataBlob: '{}',
    eventId: 0,
    clubId: 0,
    roomCode: '',
    photonRegion: region || 'us',
    photonRegionId: region || 'us',
    photonRoomId: `rec.${roomId || 'dorm'}`,
    name: '^Dorm',
    maxCapacity: 16,
    isFull: false,
    isPrivate: false,
    isInProgress: false,
    EncryptVoiceChat: false,
  });
});

// Join room by code
router.post('/joinroom', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const { roomCode } = req.body;

  // Would look up room by code
  res.json({
    roomInstanceId: generateId(),
    roomId: 0,
    subRoomId: 1,
    roomInstanceType: 0,
    location: 'Dorm',
    dataBlob: '{}',
    eventId: 0,
    clubId: 0,
    roomCode,
    photonRegion: 'us',
    photonRegionId: 'us',
    photonRoomId: 'rec.dorm',
    name: '^Dorm',
    maxCapacity: 16,
    isFull: false,
    isPrivate: false,
    isInProgress: false,
    EncryptVoiceChat: false,
  });
});

// Player connection info (for Photon/Tachyon)
router.get('/player/connection-info', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  // Return connection info for the room transport
  // This is what the client uses to connect to Photon/Tachyon
  res.json({
    accountId,
    // Photon settings (for older clients)
    photon: {
      appIdRealtime: config.photon.appIdRealtime || 'default',
      appIdVoice: config.photon.appIdVoice || 'default',
      appIdChat: config.photon.appIdChat || 'default',
      region: 'us',
      server: config.photon.targetHost || 'photon.example.com',
      port: config.photon.nameServerPort,
    },
    // Tachyon settings (for newer clients)
    tachyon: {
      server: config.photon.targetHost || 'tachyon.example.com',
      port: config.photon.gameServerPort,
    },
    // Voice settings
    voice: {
      server: config.photon.targetHost || 'voice.example.com',
      port: config.photon.nameServerPort,
    },
  });
});

// ============================================================
// HEARTBEAT / PRESENCE
// ============================================================

// Heartbeat - update player presence
router.post('/heartbeat', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const {
    roomInstanceId,
    roomId,
    subRoomId,
    roomInstanceType,
    location,
    dataBlob,
    eventId,
    clubId,
    roomCode,
    photonRegion,
    photonRegionId,
    photonRoomId,
    name,
    maxCapacity,
    isFull,
    isPrivate,
    isInProgress,
    EncryptVoiceChat,
    statusVisibility,
    deviceClass,
    vrMovementMode,
    platform,
    appVersion,
  } = req.body;

  // Update presence in database
  await query(
    `INSERT INTO presence (account_id, room_instance_id, room_id, sub_room_id, room_instance_type, location, data_blob, event_id, club_id, room_code, photon_region, photon_region_id, photon_room_id, name, max_capacity, is_full, is_private, is_in_progress, encrypt_voice_chat, status_visibility, device_class, vr_movement_mode, platform, app_version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       room_instance_id = $2, room_id = $3, sub_room_id = $4, room_instance_type = $5, location = $6, data_blob = $7, event_id = $8, club_id = $9, room_code = $10, photon_region = $11, photon_region_id = $12, photon_room_id = $13, name = $14, max_capacity = $15, is_full = $16, is_private = $17, is_in_progress = $18, encrypt_voice_chat = $19, status_visibility = $20, device_class = $21, vr_movement_mode = $22, platform = $23, app_version = $24, updated_at = NOW()`,
    [
      accountId, roomInstanceId, roomId, subRoomId, roomInstanceType, location, dataBlob, eventId, clubId, roomCode, photonRegion, photonRegionId, photonRoomId, name, maxCapacity, isFull, isPrivate, isInProgress, EncryptVoiceChat, statusVisibility, deviceClass, vrMovementMode, platform, appVersion,
    ]
  );

  // Return updated presence for other players in the same room
  const result = await query(
    `SELECT * FROM presence WHERE room_instance_id = $1 AND account_id != $2`,
    [roomInstanceId, accountId]
  );

  const otherPlayers = result.rows.map(r => ({
    accountId: r.account_id,
    roomInstance: {
      roomInstanceId: r.room_instance_id,
      roomId: r.room_id,
      subRoomId: r.sub_room_id,
      roomInstanceType: r.room_instance_type,
      location: r.location,
      dataBlob: r.data_blob,
      eventId: r.event_id,
      clubId: r.club_id,
      roomCode: r.room_code,
      photonRegion: r.photon_region,
      photonRegionId: r.photon_region_id,
      photonRoomId: r.photon_room_id,
      name: r.name,
      maxCapacity: r.max_capacity,
      isFull: r.is_full,
      isPrivate: r.is_private,
      isInProgress: r.is_in_progress,
      EncryptVoiceChat: r.encrypt_voice_chat,
    },
    statusVisibility: r.status_visibility,
    deviceClass: r.device_class,
    vrMovementMode: r.vr_movement_mode,
    platform: r.platform,
    appVersion: r.app_version,
  }));

  res.json({ players: otherPlayers });
});

// Get player presence
router.get('/presence/:accountId', async (req, res) => {
  const accountId = parseInt(req.params.accountId, 10);
  if (isNaN(accountId)) return res.status(400).send();

  const result = await query('SELECT * FROM presence WHERE account_id = $1', [accountId]);

  if (result.rows.length === 0) {
    return res.json({ accountId, roomInstance: null });
  }

  const r = result.rows[0];
  res.json({
    accountId: r.account_id,
    roomInstance: {
      roomInstanceId: r.room_instance_id,
      roomId: r.room_id,
      subRoomId: r.sub_room_id,
      roomInstanceType: r.room_instance_type,
      location: r.location,
      dataBlob: r.data_blob,
      eventId: r.event_id,
      clubId: r.club_id,
      roomCode: r.room_code,
      photonRegion: r.photon_region,
      photonRegionId: r.photon_region_id,
      photonRoomId: r.photon_room_id,
      name: r.name,
      maxCapacity: r.max_capacity,
      isFull: r.is_full,
      isPrivate: r.is_private,
      isInProgress: r.is_in_progress,
      EncryptVoiceChat: r.encrypt_voice_chat,
    },
    statusVisibility: r.status_visibility,
    deviceClass: r.device_class,
    vrMovementMode: r.vr_movement_mode,
    platform: r.platform,
    appVersion: r.app_version,
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'match', status: 'ok' });
});

module.exports = router;
