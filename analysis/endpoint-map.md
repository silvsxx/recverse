# RecVerse Endpoint Mapping

This document maps the original RecFlare/RecNet service hostnames to RecVerse path-based routing.

## Original RecFlare Service Hostnames

| Service | Original Hostname | RecVerse Path Prefix | Status |
|---------|-------------------|---------------------|--------|
| Auth | auth.recflare.net | /auth | ✅ Mapped |
| Accounts | accounts.recflare.net | /accounts | ✅ Mapped |
| API (Game) | api.recflare.net | /api | ✅ Mapped |
| Economy | econ.recflare.net | /econ | ✅ Mapped |
| Commerce | commerce.recflare.net | /commerce | ✅ Mapped |
| Rooms | rooms.recflare.net | /rooms | ✅ Mapped |
| Matchmaking | match.recflare.net | /match | ✅ Mapped |
| Chat | chat.recflare.net | /chat | ✅ Mapped |
| Notifications | notify.recflare.net | /notify | ✅ Mapped |
| Player Settings | playersettings.recflare.net | /playersettings | ✅ Mapped |
| Leaderboard | leaderboard.recflare.net | /leaderboard | ✅ Mapped |
| Discovery | discovery.recflare.net | /discovery | ✅ Mapped |
| CDN | cdn.recflare.net | /cdn | ✅ Mapped |
| Images | img.recflare.net | /img | ✅ Mapped |
| Studio | studio.recflare.net | /studio | ✅ Mapped |
| Data | data.recflare.net | /data | ✅ Mapped |
| Lists | lists.recflare.net | /lists | ✅ Mapped |
| Room Comments | roomcomments.recflare.net | /roomcomments | ✅ Mapped |
| Data Collection | datacollection.recflare.net | /datacollection | ✅ Mapped |

## NameServer Response Format

The `/ns` endpoint returns a `NameServerResponse` compatible with the Rec Room client:

```json
{
  "RecNetStatus": "https://YOUR_DOMAIN/api/status",
  "Auth": "https://YOUR_DOMAIN/auth",
  "API": "https://YOUR_DOMAIN/api",
  "WWW": "https://YOUR_DOMAIN",
  "Notifications": "https://YOUR_DOMAIN/notify",
  "Images": "https://YOUR_DOMAIN/img",
  "CDN": "https://YOUR_DOMAIN/cdn",
  "Commerce": "https://YOUR_DOMAIN/commerce",
  "Matchmaking": "https://YOUR_DOMAIN/match",
  "Storage": "https://YOUR_DOMAIN/data",
  "Chat": "https://YOUR_DOMAIN/chat",
  "Leaderboard": "https://YOUR_DOMAIN/leaderboard",
  "Accounts": "https://YOUR_DOMAIN/accounts",
  "Link": "https://YOUR_DOMAIN/auth/link",
  "RoomComments": "https://YOUR_DOMAIN/roomcomments",
  "Clubs": "https://YOUR_DOMAIN/api/clubs",
  "Rooms": "https://YOUR_DOMAIN/rooms",
  "PlatformNotifications": "https://YOUR_DOMAIN/notify",
  "Moderation": "https://YOUR_DOMAIN/api/moderation",
  "DataCollection": "https://YOUR_DOMAIN/datacollection",
  "BugReporting": "https://YOUR_DOMAIN/api/bugreporting",
  "Discovery": "https://YOUR_DOMAIN/discovery",
  "PlayerSettings": "https://YOUR_DOMAIN/playersettings",
  "Studio": "https://YOUR_DOMAIN/studio",
  "GameLogs": "https://YOUR_DOMAIN/api/gamelogs",
  "Strings": "https://YOUR_DOMAIN/cdn/strings",
  "Econ": "https://YOUR_DOMAIN/econ",
  "StringsCDN": "https://YOUR_DOMAIN/cdn/strings"
}
```

## Path Preservation

All original paths are preserved under their respective service prefixes:

| Original Path | RecVerse Path | Notes |
|---------------|---------------|-------|
| `POST /connect/token` | `POST /auth/connect/token` | Auth service |
| `GET /account/me` | `GET /accounts/account/me` | Accounts service |
| `GET /api/versioncheck/v4` | `GET /api/versioncheck/v4` | API service |
| `GET /ns` | `GET /ns` | NameServer (root) |
| `POST /matchmake` | `POST /match/matchmake` | Match service |
| `POST /heartbeat` | `POST /match/heartbeat` | Match service |
| `GET /player/connection-info` | `GET /match/player/connection-info` | Match service |

## Photon Redirection

Photon is redirected client-side via the patcher and versemain.dll:

| Original | Redirected To | Method |
|----------|---------------|--------|
| `ns.exitgames.com` | Configured Photon Host | DNS (getaddrinfo hook) |
| `photon.exitgames.com` | Configured Photon Host | DNS (getaddrinfo hook) |
| `photonengine.com` | Configured Photon Host | DNS (getaddrinfo hook) |
| NameServer Port | Configured Port | LoadBalancingClient hook |
| AppIds | Configured AppIds | AppSettings hook |

## Implementation Status

| Service | Router Created | Endpoints Implemented | Database | Tests |
|---------|---------------|----------------------|----------|-------|
| Auth | ✅ | Core endpoints | ✅ | ⏳ |
| Accounts | ✅ | Core endpoints | ✅ | ⏳ |
| API | ✅ | Stubs | ✅ | ⏳ |
| Economy | ✅ | Stubs | ✅ | ⏳ |
| Commerce | ✅ | Stubs | ✅ | ⏳ |
| Rooms | ✅ | Stubs | ✅ | ⏳ |
| Match | ✅ | Core endpoints | ✅ | ⏳ |
| Chat | ✅ | Stubs | ✅ | ⏳ |
| Notify | ✅ | Stubs | ✅ | ⏳ |
| PlayerSettings | ✅ | Stubs | ✅ | ⏳ |
| Leaderboard | ✅ | Stubs | ✅ | ⏳ |
| Discovery | ✅ | Stubs | ✅ | ⏳ |
| CDN | ✅ | Stubs | ✅ | ⏳ |
| Images | ✅ | Stubs | ✅ | ⏳ |
| Studio | ✅ | Stubs | ✅ | ⏳ |
| Data | ✅ | Stubs | ✅ | ⏳ |
| Lists | ✅ | Stubs | ✅ | ⏳ |
| RoomComments | ✅ | Stubs | ✅ | ⏳ |
| DataCollection | ✅ | Stubs | ✅ | ⏳ |

## Notes

- All services mounted under single Express app in `recverse-api`
- No wildcard subdomains used
- No `/patch` backend endpoint (patcher is separate)
- Photon redirection is client-side only
- Database schema matches RecFlare D1 schema adapted for PostgreSQL/YugabyteDB