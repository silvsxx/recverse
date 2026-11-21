# RecVerse

**Rec Room compatible backend and client integration based on RecFlare open-source projects.**

A complete reimplementation of the Rec Room backend services with client-side patching and native Windows DLL integration for Photon/RecNet redirection.

## Architecture Overview

```
RecVerse/
├── server.js                 # Main Express entry point (mounts all services)
├── config.js                 # Configuration loader (.env support)
├── database.js               # PostgreSQL/YugabyteDB connection pool
├── shared.js                 # Shared utilities (crypto, JWT, bcrypt, etc.)
├── auth.js                   # Authentication service (/auth)
├── accounts.js               # Accounts service (/accounts)
├── api.js                    # Game API service (/api)
├── econ.js                   # Economy service (/econ)
├── commerce.js               # Commerce service (/commerce)
├── rooms.js                  # Rooms service (/rooms)
├── match.js                  # Matchmaking service (/match)
├── chat.js                   # Chat service (/chat)
├── notify.js                 # Notifications service (/notify)
├── playersettings.js         # Player Settings service (/playersettings)
├── leaderboard.js            # Leaderboard service (/leaderboard)
├── discovery.js              # Discovery service (/discovery)
├── cdn.js                    # CDN service (/cdn)
├── img.js                    # Images service (/img)
├── studio.js                 # Studio service (/studio)
├── data.js                   # Data service (/data)
├── lists.js                  # Lists service (/lists)
├── roomcomments.js           # Room Comments service (/roomcomments)
├── datacollection.js         # Data Collection service (/datacollection)
├── patcher.js                # JavaScript patcher (client config)
├── terminal.js               # Diagnostic terminal (IPC with native DLLs)
├── database/                 # Database migrations & utilities
│   ├── index.js              # Database pool & query helpers
│   └── migrate.js            # Migration runner
├── migrations/               # SQL migration files
│   └── 0001_initial_schema.sql
├── recverse-windows/         # Native C++ Windows DLLs
│   ├── version-proxy/        # version.dll (system DLL proxy)
│   │   ├── version_proxy.cpp
│   │   ├── exports.def
│   │   └── CMakeLists.txt
│   └── versemain/            # versemain.dll (main integration)
│       ├── versemain.cpp
│       ├── config.h
│       ├── CMakeLists.txt
│       ├── hooks/            # Hook implementations
│       │   ├── recnet_hooks.h/cpp
│       │   ├── photon_hooks.h/cpp
│       │   └── duid_hooks.h/cpp
│       ├── networking/       # Network redirection
│       │   ├── dns_hooks.h/cpp
│       │   └── photon_redirect.h/cpp
│       └── diagnostics/      # IPC & logging
│           ├── ipc.h/cpp
│           └── logger.h/cpp
├── vendor/                   # Cloned RecFlare repositories (reference)
│   ├── recflare-server/      # https://github.com/recflare/server
│   ├── recflare-patch/       # https://github.com/recflare/patch
│   ├── recflare-client/      # https://github.com/recflare/client
│   ├── recflare-patch-2025/  # https://github.com/recflare/patch-2025
│   └── recflare-patch-2026/  # https://github.com/recflare/patch-2026
├── analysis/                 # Technical analysis documents
│   ├── endpoint-map.md       # Service endpoint mapping
│   ├── dump_report.md        # dump.cs analysis
│   └── photon-redirect-report.md
├── tests/                    # Test files
├── deployment/               # Deployment configurations
└── .env.example              # Environment configuration template
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL/YugabyteDB database
- Windows (for native DLL components)

### Installation

```bash
# Clone and install dependencies
cd RecVerse
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your values

# Run migrations
npm run migrate

# Start server
npm start
```

### Development

```bash
# Start with auto-reload
npm run dev

# Run patcher (configure client)
npm run patcher -- --game-path="C:\Games\RecRoom" --api-url="https://your-domain.com"

# Start diagnostic terminal
npm run terminal
```

## Configuration

All configuration via `.env` file (see `.env.example`):

```env
# Server
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
PUBLIC_BASE_URL=https://your-domain.com

# Database (YugabyteDB/PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5433/db?sslmode=require
DATABASE_SSL=true
DATABASE_MAX_CONNECTIONS=20

# Auth
JWT_SECRET=your-32-char-min-secret
SESSION_EXPIRATION=86400
REFRESH_TOKEN_EXPIRATION=604800

# Game Version
GAME_VERSION=20250424.01
SUPPORTED_GAME_VERSIONS=20250424.01,20260323.14

# Photon (for client-side redirection)
PHOTON_REDIRECT_ENABLED=true
PHOTON_TARGET_HOST=your-photon-host.example.com
PHOTON_NAMESERVER_PORT=5058
PHOTON_APP_ID_REALTIME=your-app-id
PHOTON_APP_ID_VOICE=your-app-id
PHOTON_APP_ID_CHAT=your-app-id
```

## Services & Endpoints

All services mounted under single domain with path prefixes:

| Service | Path Prefix | Key Endpoints |
|---------|-------------|---------------|
| Auth | `/auth` | `POST /connect/token`, `GET /cachedlogin/forplatformid/:platform/:id` |
| Accounts | `/accounts` | `GET /account/me`, `PUT /account/me/displayname`, `GET /account/search` |
| API | `/api` | `GET /versioncheck/v4`, `GET /config` |
| Economy | `/econ` | `GET /tokenbalance/:id`, `GET /catalog`, `POST /purchase` |
| Commerce | `/commerce` | `POST /purchase`, `POST /subscription` |
| Rooms | `/rooms` | `POST /rooms`, `GET /rooms/:id`, `POST /rooms/:id/save` |
| Match | `/match` | `POST /matchmake`, `GET /player/connection-info`, `POST /heartbeat` |
| Chat | `/chat` | `GET /channels`, `POST /channels/:id/messages` |
| Notify | `/notify` | `GET /notifications`, `GET /websocket-info` |
| PlayerSettings | `/playersettings` | `GET /settings`, `PUT /settings` |
| Leaderboard | `/leaderboard` | `GET /leaderboards/:id`, `POST /leaderboards/:id/submit` |
| Discovery | `/discovery` | `GET /featured`, `GET /search` |
| CDN | `/cdn` | `POST /upload`, `GET /files/:key` |
| Images | `/img` | `POST /upload`, `POST /avatar` |
| Studio | `/studio` | `POST /assets`, `POST /rooms/publish` |
| Data | `/data` | `PUT /kv/:key`, `GET /player/:id` |
| Lists | `/lists` | `GET /lists/:type`, `POST /friends/request` |
| RoomComments | `/roomcomments` | `GET /rooms/:id/comments`, `POST /rooms/:id/comments` |
| DataCollection | `/datacollection` | `POST /events`, `POST /session/start` |

### NameServer Endpoint

`GET /ns` returns the service discovery response compatible with Rec Room client:

```json
{
  "Auth": "https://your-domain.com/auth",
  "API": "https://your-domain.com/api",
  "Accounts": "https://your-domain.com/accounts",
  "Econ": "https://your-domain.com/econ",
  "Commerce": "https://your-domain.com/commerce",
  "Rooms": "https://your-domain.com/rooms",
  "Matchmaking": "https://your-domain.com/match",
  "Chat": "https://your-domain.com/chat",
  "Notifications": "https://your-domain.com/notify",
  "PlayerSettings": "https://your-domain.com/playersettings",
  "Leaderboard": "https://your-domain.com/leaderboard",
  "Discovery": "https://your-domain.com/discovery",
  "CDN": "https://your-domain.com/cdn",
  "Images": "https://your-domain.com/img",
  "Studio": "https://your-domain.com/studio",
  "Storage": "https://your-domain.com/data",
  "Lists": "https://your-domain.com/lists",
  "RoomComments": "https://your-domain.com/roomcomments",
  "DataCollection": "https://your-domain.com/datacollection"
}
```

## Client Patching

The JavaScript patcher (`patcher.js`) configures the Rec Room client:

```bash
# Patch game installation
node patcher.js --game-path="C:\Games\RecRoom" --api-url="https://your-domain.com" --photon-host="photon.your-domain.com"

# Restore original configuration
node patcher.js restore --game-path="C:\Games\RecRoom"
```

The patcher:
1. Detects game installation and version
2. Backs up original configuration
3. Writes `recverse-patch.json` and `2025patch.ini`/`2026patch.ini`
4. Configures RecNet API endpoints
5. Configures Photon redirection targets
6. Installs native DLLs (version.dll, versemain.dll)

## Native Windows Integration

Two DLLs provide runtime redirection:

### version.dll (Proxy)
- Forwards all Windows Version API calls to real System32 version.dll
- Loads `versemain.dll` after initialization
- Prevents recursive DLL loading

### versemain.dll (Main Integration)
- **RecNet Hooks**: Intercepts `BestHTTP.HTTPManager.SendRequest` to rewrite `ns.rec.net` → RecVerse API
- **Photon Hooks**: 
  - `getaddrinfo`/`GetAddrInfoW` hook redirects Photon DNS (`photonengine.com`, `exitgames.com`) to configured host
  - `LoadBalancingClient.NameServerPortInAppSettings` field injection
- **DUID Mismatch**: Hooks `CheatManager.CheckForDUIDMismatch` to return false
- **IPC**: Named pipe (`\\.\pipe\recverse-diagnostics`) communication with terminal

### Building Native Components

```bash
cd recverse-windows
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# Output: build/Release/version.dll, build/Release/versemain.dll
```

Requires:
- Visual Studio 2022 with C++ workload
- Windows 10 SDK
- MinHook (included as submodule)

## Database

Uses PostgreSQL-compatible driver (`pg`) for YugabyteDB/PostgreSQL.

Schema based on RecFlare D1 schema adapted for PostgreSQL:
- `account` - User accounts with JSONB data
- `platform_account` - Steam/Meta/Discord links
- `room` - Room metadata
- `presence` - Player presence for matchmaking
- `chat_channel` / `chat_message` - Chat system
- `notification` - Real-time notifications
- `purchase` / `subscription` - Commerce
- `telemetry_event` / `crash_report` - Data collection

Run migrations:
```bash
npm run migrate
```

## Development

### Project Structure Principles

1. **Flat JS structure** - All service files in root, mounted by `server.js`
2. **No TypeScript** - Pure JavaScript (CommonJS)
3. **Single Express app** - All services as routers, no separate HTTP servers
4. **Path-based routing** - One domain, service prefixes (no subdomains)
5. **Native only for DLLs** - C++ only for `version.dll` and `versemain.dll`

### Adding a New Service

1. Create `newservice.js` in root exporting Express Router
2. Add require and `app.use('/newservice', newserviceRouter)` in `server.js`
3. Add service URL to `config.js` `getNameServerResponse()`
4. Update patcher to include in generated config

## RecFlare References

This project is based on the excellent RecFlare open-source projects:

- **Server**: https://github.com/recflare/server (Hono/Cloudflare Workers backend)
- **Patch**: https://github.com/recflare/patch (BepInEx/Harmony patcher)
- **Client**: https://github.com/recflare/client (Installer)
- **Patch-2025**: https://github.com/recflare/patch-2025 (C++ DLL for 2025 build)
- **Patch-2026**: https://github.com/recflare/patch-2026 (C++ DLL for 2026 build)

All original licenses preserved in `vendor/` directories.

## License

MIT License - See LICENSE files in vendor directories for RecFlare licenses.

## Disclaimer

This is an independent reimplementation for educational and archival purposes. Not affiliated with Against Gravity or Rec Room Inc.