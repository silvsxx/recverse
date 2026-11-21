# RecVerse Dump.cs Analysis Report

Analysis of Rec Room client `dump.cs` (IL2CPP dump) for hook target identification.

## Client Information

- **Game**: Rec Room
- **Engine**: Unity (IL2CPP)
- **Architecture**: x64
- **Dump Source**: Provided `dump.cs` file

## Key Assemblies Identified

### Photon Networking
| Assembly | TypeDefIndex | Notes |
|----------|--------------|-------|
| Photon3Unity3D.dll | 8135 | Core Photon library |
| PhotonRealtime.dll | 9140 | Realtime API |
| PhotonUnityNetworking.dll | 10607 | Unity integration |
| PhotonVoice.API.dll | 18131 | Voice API |
| PhotonVoice.dll | 19022 | Voice implementation |
| PhotonVoice.PUN.dll | 21491 | PUN Voice integration |
| PhotonChat.dll | 25700 | Chat API |

### RecNet / Networking
| Assembly | TypeDefIndex | Notes |
|----------|--------------|-------|
| RecNet.Interfaces.dll | 12833 | RecNet interfaces |
| RecNet.Runtime.dll | 13570 | RecNet implementation |
| RecRoom.Networking.PhotonImpl.Runtime.dll | 21818 | Photon implementation |
| RecRoom.Networking.RoomLoading.Runtime.dll | 21929 | Room loading |

### Key Classes Identified

#### Photon.Realtime.AppSettings (TypeDefIndex: 9143)
```csharp
public class AppSettings {
    public string AppIdRealtime;      // 0x10
    public string AppIdChat;          // 0x18
    public string AppIdVoice;         // 0x20
    public string AppVersion;         // 0x28
    public bool UseNameServer;        // 0x30
    public string FixedRegion;        // 0x38
    public string BestRegionSummaryFromStorage; // 0x40
    public string Server;             // 0x48
    public int Port;                  // 0x50
    public string ProxyServer;        // 0x58
    public ConnectionProtocol Protocol; // 0x60
    public bool EnableProtocolFallback; // 0x61
    public NPKLNBNLCNP AuthMode;      // 0x64
    public bool EnableLobbyStatistics; // 0x68
    public DebugLevel NetworkLogging; // 0x69
}
```

#### Photon Connection Flow
- `LoadBalancingClient.ConnectUsingSettings(AppSettings)` - Main connection entry
- `LoadBalancingClient.GetNameServerAddress()` - Returns "host:port" for NameServer
- `LoadBalancingClient.NameServerPortInAppSettings` - Port override field
- `PhotonPeer.SendOperation(byte, Dictionary, SendOptions)` - Operation sending
- `PeerBase.EnqueueStatusCallback(StatusCode)` - Status callbacks

#### RecNet NameServer Response (NDFLHBFOIGB.NameServerResponse, TypeDefIndex: 16316)
```csharp
internal class NameServerResponse {
    public string RecNetStatus;    // 0x10
    public string Auth;            // 0x18
    public string API;             // 0x20
    public string WWW;             // 0x28
    public string Notifications;   // 0x30
    public string Images;          // 0x38
    public string CDN;             // 0x40
    public string Commerce;        // 0x48
    public string Matchmaking;     // 0x50
    public string Storage;         // 0x58
    public string Chat;            // 0x60
    public string Leaderboard;     // 0x68
    public string Accounts;        // 0x70
    public string Link;            // 0x78
    public string RoomComments;    // 0x80
    public string Clubs;           // 0x88
    public string Rooms;           // 0x90
    public string PlatformNotifications; // 0x98
    public string Moderation;      // 0xA0
    public string DataCollection;  // 0xA8
    public string BugReporting;    // 0xB0
    public string Discovery;       // 0xB8
    public string PlayerSettings;  // 0xC0
    public string Studio;          // 0xC8
    public string GameLogs;        // 0xD0
    public string Strings;         // 0xD8
    public string Econ;            // 0xE0
    public string StringsCDN;      // 0xE8
}
```

#### RecNet Core (NDFLHBFOIGB, TypeDefIndex: 16333)
Key methods:
- `ConnectToRecNet()` - Main connection flow
- `GetServiceUri(FIJCCHEPFFC service)` - Get service URI
- `KBKOIKCIEKB(FIJCCHEPFFC service, out Uri)` - Try get service URI
- `IKPHCCFKKGM(...)` - HTTP request wrapper

#### Photon AppSettings Factory (HPEENKELKDJ, TypeDefIndex: 37976)
```csharp
public class HPEENKELKDJ {
    // Const AppIds (Rec Room defaults)
    private const string CGHBGEKCDMC = "9372aa8d-d3f4-44a0-986d-419e145a2b83"; // Realtime
    protected const string FMKKBNCNKOE = "e93ae440-f238-4b6c-848f-1df89faf14f5"; // Voice
    protected const string CIBDHFNDBDD = "db7300fd-ac24-4e14-9dca-2bd685a7924f"; // Chat
    
    public abstract AppSettings MGKINLFMJLB(); // Factory method
}
```

#### BestHTTP.HTTPManager.SendRequest
- `SendRequest(HTTPRequest request)` - Intercept point for HTTP redirection
- `HTTPRequest.Uri` property at offset 0x10

## Hook Targets Summary

### RecNet HTTP Redirection
| Target | Method | Approach | Status |
|--------|--------|----------|--------|
| BestHTTP.HTTPManager.SendRequest | `SendRequest(HTTPRequest)` | Hook & rewrite URI | ✅ Identified |
| NDFLHBFOIGB.ConnectToRecNet | Connection flow | Hook for config injection | ✅ Identified |

### Photon Redirection
| Target | Method | Approach | Status |
|--------|--------|----------|--------|
| getaddrinfo / GetAddrInfoW | DNS resolution | Hook & redirect Photon hosts | ✅ Identified |
| LoadBalancingClient.GetNameServerAddress | Returns "host:port" | Hook & modify port | ✅ Identified |
| LoadBalancingClient.NameServerPortInAppSettings | Port field | Direct field write | ✅ Identified |
| HPEENKELKDJ.MGKINLFMJLB | AppSettings factory | Hook & modify AppIds | ✅ Identified |
| PhotonPeer.SendOperation | Operation sending | Trace/log only | ✅ Identified |
| PeerBase.EnqueueStatusCallback | Status callbacks | Trace/log only | ✅ Identified |

### DUID Mismatch Suppression
| Target | Method | Approach | Status |
|--------|--------|----------|--------|
| CheatManager.CheckForDUIDMismatch | `bool CheckForDUIDMismatch(out string, out string)` | Hook return false | ✅ Identified |

## Verified Signatures (from dump.cs)

### Photon AppSettings Fields (offsets from dump)
```
AppIdRealtime:     0x10
AppIdChat:         0x18
AppIdVoice:        0x20
AppVersion:        0x28
UseNameServer:     0x30
FixedRegion:       0x38
BestRegionSummary: 0x40
Server:            0x48
Port:              0x50
ProxyServer:       0x58
Protocol:          0x60
EnableProtocolFallback: 0x61
AuthMode:          0x64
EnableLobbyStatistics: 0x68
NetworkLogging:    0x69
```

### RecNet NameServerResponse Fields
```
RecNetStatus:      0x10
Auth:              0x18
API:               0x20
WWW:               0x28
Notifications:     0x30
Images:            0x38
CDN:               0x40
Commerce:          0x48
Matchmaking:       0x50
Storage:           0x58
Chat:              0x60
Leaderboard:       0x68
Accounts:          0x70
Link:              0x78
RoomComments:      0x80
Clubs:             0x88
Rooms:             0x90
PlatformNotifications: 0x98
Moderation:        0xA0
DataCollection:    0xA8
BugReporting:      0xB0
Discovery:         0xB8
PlayerSettings:    0xC0
Studio:            0xC8
GameLogs:          0xD0
Strings:           0xD8
Econ:              0xE0
StringsCDN:        0xE8
```

### HTTPRequest Uri Field
```
HTTPRequest.Uri:   0x10 (offset from object start)
```

## Classification

| Finding | Classification | Notes |
|---------|---------------|-------|
| AppSettings structure | ✅ Verified | Direct from dump.cs |
| NameServerResponse structure | ✅ Verified | Direct from dump.cs |
| HTTPRequest.Uri offset | ✅ Verified | Offset 0x10 confirmed |
| Photon AppIds (constants) | ✅ Verified | Found in HPEENKELKDJ |
| RecNet connection flow | ✅ Verified | NDFLHBFOIGB class |
| Photon connection methods | ✅ Verified | LoadBalancingClient methods |
| DUID mismatch method | ✅ Verified | CheatManager.CheckForDUIDMismatch |

## Remaining Work

1. **Signature Scanning**: Need to implement runtime signature scanning for:
   - `BestHTTP.HTTPManager.SendRequest`
   - `LoadBalancingClient.ConnectUsingSettings`
   - `LoadBalancingClient.GetNameServerAddress`
   - `HPEENKELKDJ.MGKINLFMJLB`
   - `CheatManager.CheckForDUIDMismatch`

2. **Offset Verification**: Verify field offsets match running game:
   - `LoadBalancingClient.NameServerPortInAppSettings`
   - `AppSettings.Server`, `AppSettings.Port`
   - `HTTPRequest.Uri` (confirmed 0x10)

3. **Game Version Specifics**: Offsets may change between builds:
   - 20250424.01 (2025 build)
   - 20260323.14 (2026 build)
   - Need version-specific offset tables

## References

- RecFlare patcher: https://github.com/recflare/patch
- RecFlare patch-2025: https://github.com/recflare/patch-2025
- RecFlare patch-2026: https://github.com/recflare/patch-2026
- Provided dump.cs (local)