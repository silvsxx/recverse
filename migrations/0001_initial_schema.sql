-- RecVerse Initial Database Schema
-- Run this against your YugabyteDB/PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ACCOUNTS
-- ============================================================

CREATE TABLE IF NOT EXISTS account (
    account_id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated columns for common queries
ALTER TABLE account ADD COLUMN IF NOT EXISTS username_lower TEXT
    GENERATED ALWAYS AS (LOWER(data->>'username')) STORED;

ALTER TABLE account ADD COLUMN IF NOT EXISTS email_lower TEXT
    GENERATED ALWAYS AS (NULLIF(LOWER(data->>'email'), '')) STORED;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_username_lower ON account (username_lower);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_lower ON account (email_lower) WHERE email_lower IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_platform_id ON account ((data->>'platformId'));
CREATE INDEX IF NOT EXISTS idx_account_signup_ip ON account ((data->>'signupIp'));
CREATE INDEX IF NOT EXISTS idx_account_device_id ON account ((data->>'deviceId'));
CREATE INDEX IF NOT EXISTS idx_account_has_plus ON account ((data->>'hasPlus')) WHERE (data->>'hasPlus')::boolean = true;
CREATE INDEX IF NOT EXISTS idx_account_is_influencer ON account ((data->>'isInfluencer')) WHERE (data->>'isInfluencer')::boolean = true;

-- ============================================================
-- PLATFORM ACCOUNTS (Steam, Meta, Discord, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_account (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    platform INTEGER NOT NULL, -- 0=Steam, 1=Oculus/Meta, 2=Discord, etc.
    platform_id TEXT NOT NULL,
    roles TEXT[] DEFAULT '{}',
    has_recorded_roles BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(platform, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_account_account_id ON platform_account(account_id);
CREATE INDEX IF NOT EXISTS idx_platform_account_platform_id ON platform_account(platform, platform_id);

-- ============================================================
-- ACCOUNT IP HISTORY (for ban evasion)
-- ============================================================

CREATE TABLE IF NOT EXISTS account_ip (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    ip INET NOT NULL,
    country TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_ip_account_id ON account_ip(account_id);
CREATE INDEX IF NOT EXISTS idx_account_ip_ip ON account_ip(ip);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_token (
    token TEXT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_account_id ON refresh_token(account_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_expires_at ON refresh_token(expires_at);

-- ============================================================
-- EMAIL CODES (for verification, password reset, 2FA)
-- ============================================================

CREATE TABLE IF NOT EXISTS email_code (
    id BIGSERIAL PRIMARY KEY,
    purpose TEXT NOT NULL, -- 'email_change', 'email_verify', 'login', 'recovery'
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 1,
    ttl_seconds INTEGER DEFAULT 1800,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_code_account_purpose ON email_code(account_id, purpose);
CREATE INDEX IF NOT EXISTS idx_email_code_expires_at ON email_code(expires_at);

-- ============================================================
-- LOGIN CHALLENGES (for 2FA)
-- ============================================================

CREATE TABLE IF NOT EXISTS login_challenge (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    method TEXT NOT NULL, -- 'totp', 'email'
    context TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_login_challenge_account_id ON login_challenge(account_id);

-- ============================================================
-- TWO-FACTOR AUTHENTICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS two_factor (
    account_id BIGINT PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
    method TEXT NOT NULL DEFAULT 'none', -- 'none', 'totp', 'email'
    totp_secret TEXT,
    backup_codes TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEVICE CODES (for Studio device authorization)
-- ============================================================

CREATE TABLE IF NOT EXISTS device_code (
    device_code TEXT PRIMARY KEY,
    user_code TEXT NOT NULL UNIQUE,
    client_id TEXT NOT NULL,
    account_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    approved BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_code_user_code ON device_code(user_code);
CREATE INDEX IF NOT EXISTS idx_device_code_expires_at ON device_code(expires_at);

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    player_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_player_id ON audit_log(player_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ============================================================
-- BAN EVASION
-- ============================================================

CREATE TABLE IF NOT EXISTS ban_evasion (
    id BIGSERIAL PRIMARY KEY,
    banned_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    matched_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    match_type TEXT NOT NULL, -- 'platform', 'ip', 'device'
    match_value TEXT NOT NULL,
    report_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(banned_account_id, matched_account_id, match_type)
);

-- ============================================================
-- REPORTS (moderation)
-- ============================================================

CREATE TABLE IF NOT EXISTS report (
    id BIGSERIAL PRIMARY KEY,
    reporter_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    reported_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'actioned', 'dismissed'
    action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by BIGINT REFERENCES account(account_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_report_reporter_id ON report(reporter_id);
CREATE INDEX IF NOT EXISTS idx_report_reported_id ON report(reported_id);
CREATE INDEX IF NOT EXISTS idx_report_status ON report(status);

-- ============================================================
-- PLAYER SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS player_settings (
    account_id BIGINT PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PLAYER LISTS (friends, blocked, favorites)
-- ============================================================

CREATE TABLE IF NOT EXISTS player_list (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    list_type TEXT NOT NULL, -- 'friends', 'blocked', 'favorites', 'recent', 'party'
    target_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, list_type, target_account_id)
);

CREATE INDEX IF NOT EXISTS idx_player_list_account_id ON player_list(account_id);
CREATE INDEX IF NOT EXISTS idx_player_list_target ON player_list(target_account_id);

-- ============================================================
-- FRIEND REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS friend_request (
    id BIGSERIAL PRIMARY KEY,
    from_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    to_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    message TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'blocked'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(from_account_id, to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_request_to_account ON friend_request(to_account_id);
CREATE INDEX IF NOT EXISTS idx_friend_request_status ON friend_request(status);

-- ============================================================
-- ROOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS room (
    room_id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_owner ON room ((data->>'ownerId'));
CREATE INDEX IF NOT EXISTS idx_room_tags ON room USING GIN ((data->'tags'));
CREATE INDEX IF NOT EXISTS idx_room_created_at ON room(created_at DESC);

-- Room saves
CREATE TABLE IF NOT EXISTS room_save (
    save_id TEXT PRIMARY KEY,
    room_id BIGINT NOT NULL REFERENCES room(room_id) ON DELETE CASCADE,
    sub_room_id INTEGER NOT NULL DEFAULT 1,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_save_room_id ON room_save(room_id);
CREATE INDEX IF NOT EXISTS idx_room_save_account_id ON room_save(account_id);

-- Room invites
CREATE TABLE IF NOT EXISTS room_invite (
    invite_id TEXT PRIMARY KEY,
    room_id BIGINT NOT NULL REFERENCES room(room_id) ON DELETE CASCADE,
    from_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    to_account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    message TEXT,
    accepted BOOLEAN DEFAULT FALSE,
    declined BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_room_invite_to_account ON room_invite(to_account_id);
CREATE INDEX IF NOT EXISTS idx_room_invite_expires ON room_invite(expires_at);

-- Room rating aggregate
CREATE TABLE IF NOT EXISTS room_rating (
    room_id BIGINT PRIMARY KEY REFERENCES room(room_id) ON DELETE CASCADE,
    average_rating NUMERIC(10,2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROOM COMMENTS / REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS room_comment (
    comment_id TEXT PRIMARY KEY,
    room_id BIGINT NOT NULL REFERENCES room(room_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    parent_id TEXT REFERENCES room_comment(comment_id) ON DELETE CASCADE,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_comment_room_id ON room_comment(room_id);
CREATE INDEX IF NOT EXISTS idx_room_comment_account_id ON room_comment(account_id);
CREATE INDEX IF NOT EXISTS idx_room_comment_parent_id ON room_comment(parent_id);
CREATE INDEX IF NOT EXISTS idx_room_comment_created_at ON room_comment(created_at DESC);

-- Comment helpful votes
CREATE TABLE IF NOT EXISTS comment_helpful (
    comment_id TEXT NOT NULL REFERENCES room_comment(comment_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, account_id)
);

-- ============================================================
-- PRESENCE / MATCHMAKING
-- ============================================================

CREATE TABLE IF NOT EXISTS presence (
    account_id BIGINT PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
    room_instance_id BIGINT,
    room_id BIGINT REFERENCES room(room_id) ON DELETE SET NULL,
    sub_room_id INTEGER,
    room_instance_type INTEGER,
    location TEXT,
    data_blob JSONB,
    event_id BIGINT,
    club_id BIGINT,
    room_code TEXT,
    photon_region TEXT,
    photon_region_id TEXT,
    photon_room_id TEXT,
    name TEXT,
    max_capacity INTEGER,
    is_full BOOLEAN,
    is_private BOOLEAN,
    is_in_progress BOOLEAN,
    encrypt_voice_chat BOOLEAN,
    status_visibility INTEGER,
    device_class INTEGER,
    vr_movement_mode INTEGER,
    platform INTEGER,
    app_version TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_room_instance ON presence(room_instance_id);
CREATE INDEX IF NOT EXISTS idx_presence_room_id ON presence(room_id);

-- ============================================================
-- CHAT
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_channel (
    channel_id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT NOT NULL, -- 'direct', 'group', 'room', 'club'
    owner_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    room_id BIGINT REFERENCES room(room_id) ON DELETE SET NULL,
    club_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_channel_member (
    channel_id TEXT NOT NULL REFERENCES chat_channel(channel_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (channel_id, account_id)
);

CREATE TABLE IF NOT EXISTS chat_message (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES chat_channel(channel_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'text', -- 'text', 'image', 'system', 'invite'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_message_channel_id ON chat_message(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_account_id ON chat_message(account_id);
CREATE INDEX IF NOT EXISTS idx_chat_message_created_at ON chat_message(created_at DESC);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notification (
    notification_id TEXT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_account_id ON notification(account_id);
CREATE INDEX IF NOT EXISTS idx_notification_read_at ON notification(read_at);
CREATE INDEX IF NOT EXISTS idx_notification_created_at ON notification(created_at DESC);

-- ============================================================
-- ECONOMY / INVENTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS token_balance (
    account_id BIGINT PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
    tokens BIGINT DEFAULT 0,
    tickets BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_item (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_account_id ON inventory_item(account_id);

CREATE TABLE IF NOT EXISTS equipment (
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    slot TEXT NOT NULL, -- 'head', 'face', 'body', 'hand_left', 'hand_right', 'back', 'waist', 'feet'
    item_id TEXT NOT NULL,
    equipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, slot)
);

CREATE TABLE IF NOT EXISTS consumable (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    consumable_id TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumable_account_id ON consumable(account_id);

-- Catalog
CREATE TABLE IF NOT EXISTS catalog_item (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    price_tokens INTEGER,
    price_tickets INTEGER,
    price_usd NUMERIC(10,2),
    currency TEXT DEFAULT 'tokens',
    item_type TEXT, -- 'clothing', 'accessory', 'consumable', 'room', 'invention'
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchase (
    purchase_id TEXT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    receipt TEXT,
    platform TEXT,
    status TEXT DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'refunded'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_account_id ON purchase(account_id);
CREATE INDEX IF NOT EXISTS idx_purchase_created_at ON purchase(created_at DESC);

-- Validated receipts
CREATE TABLE IF NOT EXISTS validated_receipt (
    receipt TEXT NOT NULL,
    platform TEXT NOT NULL,
    product_id TEXT,
    account_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (receipt, platform)
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscription (
    subscription_id TEXT PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    receipt TEXT,
    platform TEXT,
    auto_renew BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'expired', 'paused'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_account_id ON subscription(account_id);
CREATE INDEX IF NOT EXISTS idx_subscription_status ON subscription(status);

-- ============================================================
-- STUDIO
-- ============================================================

CREATE TABLE IF NOT EXISTS studio_asset (
    asset_key TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_asset_account_id ON studio_asset(account_id);

CREATE TABLE IF NOT EXISTS studio_room (
    room_id BIGINT PRIMARY KEY REFERENCES room(room_id) ON DELETE CASCADE,
    room_key TEXT NOT NULL UNIQUE,
    data JSONB NOT NULL,
    assets JSONB DEFAULT '[]',
    thumbnail TEXT,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    status TEXT DEFAULT 'draft', -- 'draft', 'published', 'archived'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_room_account_id ON studio_room(account_id);

-- Inventions
CREATE TABLE IF NOT EXISTS invention (
    invention_id TEXT PRIMARY KEY,
    invention_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invention_account_id ON invention(account_id);

-- ============================================================
-- IMAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS image (
    image_key TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_account_id ON image(account_id);

CREATE TABLE IF NOT EXISTS avatar_image (
    account_id BIGINT PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
    image_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_photo (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL REFERENCES room(room_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    image_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_photo_room_id ON room_photo(room_id);

CREATE TABLE IF NOT EXISTS invention_image (
    invention_id TEXT NOT NULL REFERENCES invention(invention_id) ON DELETE CASCADE,
    image_key TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CDN FILES
-- ============================================================

CREATE TABLE IF NOT EXISTS cdn_file (
    file_key TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdn_file_account_id ON cdn_file(account_id);

CREATE TABLE IF NOT EXISTS room_asset (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL REFERENCES room(room_id) ON DELETE CASCADE,
    file_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_asset_room_id ON room_asset(room_id);

-- ============================================================
-- DATA STORAGE
-- ============================================================

CREATE TABLE IF NOT EXISTS data_kv (
    data_key TEXT PRIMARY KEY,
    data_value JSONB NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_kv_expires_at ON data_kv(expires_at);

CREATE TABLE IF NOT EXISTS player_data (
    account_id BIGINT PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS heartbeat_data (
    id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_data_account_id ON heartbeat_data(account_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_data_created_at ON heartbeat_data(created_at DESC);

-- ============================================================
-- TELEMETRY / DATA COLLECTION
-- ============================================================

CREATE TABLE IF NOT EXISTS telemetry_event (
    event_id TEXT PRIMARY KEY,
    account_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    session_id TEXT,
    timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_event_account_id ON telemetry_event(account_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON telemetry_event(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_timestamp ON telemetry_event(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_session_id ON telemetry_event(session_id);

CREATE TABLE IF NOT EXISTS telemetry_session (
    session_id TEXT PRIMARY KEY,
    account_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    device_info JSONB DEFAULT '{}',
    game_version TEXT,
    platform TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_session_account_id ON telemetry_session(account_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_session_started_at ON telemetry_session(started_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_heartbeat (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES telemetry_session(session_id) ON DELETE CASCADE,
    account_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_heartbeat_session_id ON telemetry_heartbeat(session_id);

CREATE TABLE IF NOT EXISTS crash_report (
    crash_id TEXT PRIMARY KEY,
    account_id BIGINT REFERENCES account(account_id) ON DELETE SET NULL,
    session_id TEXT REFERENCES telemetry_session(session_id) ON DELETE SET NULL,
    crash_data JSONB NOT NULL,
    game_version TEXT,
    platform TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crash_report_created_at ON crash_report(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crash_report_platform ON crash_report(platform);

-- ============================================================
-- SCHEMA MIGRATIONS TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (optional, for multi-tenant)
-- ============================================================

-- ALTER TABLE account ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY account_isolation ON account USING (account_id = current_setting('app.current_account_id')::bigint);