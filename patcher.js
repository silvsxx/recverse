/**
 * RecVerse Patcher - Pure JavaScript/Node.js
 * Configures Rec Room client to connect to RecVerse backend
 * Based on RecFlare patcher architecture
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const readline = require('readline');
const { config } = require('./config');
const { generateId, formatISO } = require('./shared');

class RecVersePatcher {
  constructor(options = {}) {
    this.gamePath = options.gamePath || null;
    this.apiBaseUrl = options.apiBaseUrl || config.publicBaseUrl;
    this.photonHost = options.photonHost || config.photon.targetHost;
    this.photonPort = options.photonPort || config.photon.nameServerPort;
    this.dryRun = options.dryRun || false;
    this.backupDir = options.backupDir || path.join(process.cwd(), 'patcher-backups');
    this.logFile = options.logFile || path.join(process.cwd(), 'recverse-patcher.log');
    this.gameVersion = options.gameVersion || config.game.version;

    this.log = this.log.bind(this);
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;
    console.log(logLine);
    fs.appendFileSync(this.logFile, logLine + '\n');
  }

  // ============================================================
  // GAME DETECTION
  // ============================================================

  async findGameInstallation(customPath = null) {
    if (customPath) {
      if (this.validateGamePath(customPath)) {
        this.log(`Game found at custom path: ${customPath}`);
        return customPath;
      }
      throw new Error(`Invalid game path: ${customPath}`);
    }

    // Common installation paths
    const possiblePaths = [
      // Steam
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\RecRoom',
      'C:\\Program Files\\Steam\\steamapps\\common\\RecRoom',
      // Custom Steam library
      ...this.getSteamLibraryPaths().map(p => path.join(p, 'steamapps', 'common', 'RecRoom')),
      // Oculus/Meta
      'C:\\Program Files\\Oculus\\Software\\Software\\rec-room',
      // Standalone
      path.join(process.env.LOCALAPPDATA || '', 'RecRoom'),
      path.join(process.env.PROGRAMFILES || '', 'RecRoom'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'RecRoom'),
    ];

    for (const p of possiblePaths) {
      if (this.validateGamePath(p)) {
        this.log(`Game found at: ${p}`);
        return p;
      }
    }

    throw new Error('Rec Room installation not found. Please specify path with --game-path');
  }

  getSteamLibraryPaths() {
    const paths = [];
    try {
      // Check default Steam library
      const steamPath = path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Steam');
      const libraryFolders = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
      if (fs.existsSync(libraryFolders)) {
        const content = fs.readFileSync(libraryFolders, 'utf8');
        // Parse VDF for library paths (simplified)
        const matches = content.match(/"path"\s+"([^"]+)"/g);
        if (matches) {
          for (const match of matches) {
            const p = match.match(/"path"\s+"([^"]+)"/)[1].replace(/\\\\/g, '\\');
            paths.push(p);
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    return paths;
  }

  validateGamePath(gamePath) {
    if (!fs.existsSync(gamePath)) return false;

    // Check for RecRoom.exe
    const exePath = path.join(gamePath, 'RecRoom.exe');
    if (!fs.existsSync(exePath)) return false;

    // Check for GameAssembly.dll (Unity)
    const gameAssembly = path.join(gamePath, 'RecRoom_Data', 'Managed', 'GameAssembly.dll');
    if (!fs.existsSync(gameAssembly)) return false;

    return true;
  }

  async detectGameVersion(gamePath) {
    // Try to read version from various sources
    const versionFile = path.join(gamePath, 'version.txt');
    if (fs.existsSync(versionFile)) {
      return fs.readFileSync(versionFile, 'utf8').trim();
    }

    // Try to read from GameAssembly
    const gameAssembly = path.join(gamePath, 'RecRoom_Data', 'Managed', 'GameAssembly.dll');
    if (fs.existsSync(gameAssembly)) {
      try {
        // Use a simple string search for version pattern
        const buffer = fs.readFileSync(gameAssembly);
        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1000000));
        const versionMatch = content.match(/202\d{4}\.\d{2}/);
        if (versionMatch) {
          return versionMatch[0];
        }
      } catch (e) {
        // Ignore
      }
    }

    // Check steam appmanifest
    const steamManifests = [
      path.join(gamePath, '..', '..', 'appmanifest_471710.acf'),
      path.join(gamePath, 'steam_appid.txt'),
    ];

    for (const manifest of steamManifests) {
      if (fs.existsSync(manifest)) {
        const content = fs.readFileSync(manifest, 'utf8');
        const buildMatch = content.match(/buildid["\s]+(\d+)/i) || content.match(/build["\s]+(\d+)/i);
        if (buildMatch) {
          return `build-${buildMatch[1]}`;
        }
      }
    }

    return 'unknown';
  }

  // ============================================================
  // CONFIGURATION BACKUP
  // ============================================================

  async backupConfigFiles(gamePath) {
    const timestamp = formatISO().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `backup-${timestamp}`);
    fs.mkdirSync(backupPath, { recursive: true });

    const configFiles = [
      // Unity PlayerPrefs (registry on Windows)
      // We'll back up the registry keys
      // User data
      path.join(process.env.LOCALAPPDATA || '', 'Low', 'Against Gravity', 'Rec Room'),
      path.join(process.env.APPDATA || '', 'Against Gravity', 'Rec Room'),
    ];

    for (const src of configFiles) {
      if (fs.existsSync(src)) {
        const dest = path.join(backupPath, path.basename(src));
        this.copyRecursive(src, dest);
        this.log(`Backed up: ${src} -> ${dest}`);
      }
    }

    // Backup registry keys (Windows)
    if (process.platform === 'win32') {
      const regBackup = path.join(backupPath, 'registry-backup.reg');
      try {
        execSync(`reg export "HKCU\\Software\\Against Gravity\\Rec Room" "${regBackup}" /y`, { stdio: 'ignore' });
        this.log('Backed up registry keys');
      } catch (e) {
        this.log('Registry backup failed (keys may not exist)', 'WARN');
      }
    }

    this.log(`Configuration backed up to: ${backupPath}`);
    return backupPath;
  }

  copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    for (const item of fs.readdirSync(src)) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        this.copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // ============================================================
  // RECNET CONFIGURATION
  // ============================================================

  async configureRecNet(gamePath) {
    this.log('Configuring RecNet endpoints...');

    // 1. Generate new recverse.ini (primary config for versemain.dll)
    const iniContent = this.generateIniConfig();
    const iniPath = path.join(gamePath, 'recverse.ini');
    if (!this.dryRun) {
      fs.writeFileSync(iniPath, iniContent);
      this.log(`recverse.ini written to: ${iniPath}`);
    } else {
      this.log(`[DRY RUN] Would write recverse.ini to: ${iniPath}`);
      this.log(`[DRY RUN] Config:\n${iniContent}`);
    }

    // 2. Also create recverse-patch.json (legacy JSON)
    const patcherConfig = {
      apiHost: this.apiBaseUrl,
      photonHost: this.photonHost,
      photonPort: this.photonPort,
      photonRedirectEnabled: config.photon.redirectEnabled,
      appIdRealtime: config.photon.appIdRealtime,
      appIdVoice: config.photon.appIdVoice,
      appIdChat: config.photon.appIdChat,
      suppressDuidMismatch: true,
      blockDeadHosts: true,
      gameVersion: this.gameVersion,
    };
    const configPath = path.join(gamePath, 'recverse-patch.json');
    if (!this.dryRun) {
      fs.writeFileSync(configPath, JSON.stringify(patcherConfig, null, 2));
      this.log(`recverse-patch.json written to: ${configPath}`);
    } else {
      this.log(`[DRY RUN] Would write recverse-patch.json to: ${configPath}`);
    }

    // 3. Create 2025patch.ini / 2026patch.ini for backward compatibility
    const legacyIniContent = `[config]
ApiHost=${this.apiBaseUrl}
SuppressDuidMismatch=true
EnableTracing=false
VoiceKeyXml=
`;
    const legacyIniPath = path.join(gamePath, '2025patch.ini');
    if (!this.dryRun) {
      fs.writeFileSync(legacyIniPath, legacyIniContent);
      this.log(`2025patch.ini written to: ${legacyIniPath}`);
    } else {
      this.log(`[DRY RUN] Would write 2025patch.ini to: ${legacyIniPath}`);
    }
    
    const legacyIniPath26 = path.join(gamePath, '2026patch.ini');
    if (!this.dryRun) {
      fs.writeFileSync(legacyIniPath26, legacyIniContent);
      this.log(`2026patch.ini written to: ${legacyIniPath26}`);
    }

    return { iniPath, configPath };
  }

  generateIniConfig() {
    return `[recnet]
; RecVerse API base URL (used by NameServer response)
apiHost=${this.apiBaseUrl}

; Enable Photon redirection (requires versemain.dll)
photonRedirectEnabled=${config.photon.redirectEnabled ? 'true' : 'false'}

; Enable debug tracing in versemain.dll
enableTracing=false

[photon]
; Target Photon hostname (your Photon server or relay)
host=${this.photonHost || ''}

; Photon ports (defaults shown)
nameServerPort=${this.photonPort}
masterServerPort=${config.photon.masterServerPort}
gameServerPort=${config.photon.gameServerPort}

; Photon App IDs (get from your Photon dashboard)
appIdRealtime=${config.photon.appIdRealtime || ''}
appIdVoice=${config.photon.appIdVoice || ''}
appIdChat=${config.photon.appIdChat || ''}

; Enable Photon redirection (DNS + AppSettings)
enabled=${config.photon.redirectEnabled ? 'true' : 'false'}

; Block dead telemetry hosts (backtrace.io, rudderstack.com, etc.)
blockDeadHosts=true

[duid]
; Suppress DUID mismatch check (prevents create account hang)
suppressMismatch=true
`;
  }

    // For 2026 client
    const ini2026Content = `[config]
ApiHost=${this.apiBaseUrl}
SuppressDuidMismatch=true
EnableTracing=false
VoiceKeyXml=
`;
    const ini2026Path = path.join(gamePath, '2026patch.ini');
    if (!this.dryRun) {
      fs.writeFileSync(ini2026Path, ini2026Content);
      this.log(`2026patch.ini written to: ${ini2026Path}`);
    } else {
      this.log(`[DRY RUN] Would write 2026patch.ini to: ${ini2026Path}`);
    }

    return patcherConfig;
  }

  // ============================================================
  // PHOTON CONFIGURATION
  // ============================================================

  async configurePhoton(gamePath) {
    if (!config.photon.redirectEnabled) {
      this.log('Photon redirection disabled, skipping...');
      return;
    }

    this.log('Configuring Photon redirection...');

    // The Photon configuration is handled by the native versemain.dll
    // The JavaScript patcher just writes the target configuration
    // that the DLL will read at runtime

    const photonConfig = {
      targetHost: this.photonHost,
      nameServerPort: this.photonPort,
      masterServerPort: config.photon.masterServerPort,
      gameServerPort: config.photon.gameServerPort,
      appIdRealtime: config.photon.appIdRealtime,
      appIdVoice: config.photon.appIdVoice,
      appIdChat: config.photon.appIdChat,
    };

    const photonConfigPath = path.join(gamePath, 'recverse-photon.json');
    if (!this.dryRun) {
      fs.writeFileSync(photonConfigPath, JSON.stringify(photonConfig, null, 2));
      this.log(`Photon config written to: ${photonConfigPath}`);
    } else {
      this.log(`[DRY RUN] Would write Photon config to: ${photonConfigPath}`);
    }

    // The native DLL will hook:
    // 1. getaddrinfo/GetAddrInfoW to redirect Photon DNS
    // 2. LoadBalancingClient.NameServerPortInAppSettings for port
    // 3. PhotonPeer.ConnectUsingSettings for AppIds
    this.log('Photon redirection will be handled by versemain.dll at runtime');
  }

  // ============================================================
  // FILE INTEGRITY CHECKS
  // ============================================================

  async verifyGameIntegrity(gamePath) {
    this.log('Verifying game file integrity...');

    const criticalFiles = [
      'RecRoom.exe',
      path.join('RecRoom_Data', 'Managed', 'GameAssembly.dll'),
      path.join('RecRoom_Data', 'Managed', 'UnityPlayer.dll'),
      path.join('RecRoom_Data', 'Managed', 'Photon3Unity3D.dll'),
      path.join('RecRoom_Data', 'Managed', 'PhotonRealtime.dll'),
    ];

    const results = {};
    for (const file of criticalFiles) {
      const fullPath = path.join(gamePath, file);
      if (fs.existsSync(fullPath)) {
        const hash = this.sha256File(fullPath);
        results[file] = { exists: true, sha256: hash };
        this.log(`  ${file}: ${hash.substring(0, 16)}...`);
      } else {
        results[file] = { exists: false };
        this.log(`  ${file}: MISSING`, 'ERROR');
      }
    }

    return results;
  }

  sha256File(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // ============================================================
  // MAIN PATCH PROCESS
  // ============================================================

  async patch(options = {}) {
    this.log('========================================');
    this.log('        RecVerse Patcher Starting');
    this.log('========================================');

    try {
      // 1. Find game installation
      const gamePath = await this.findGameInstallation(options.gamePath);
      this.gamePath = gamePath;

      // 2. Detect game version
      const version = await this.detectGameVersion(gamePath);
      this.log(`Game version detected: ${version}`);

      if (version !== 'unknown' && version !== this.gameVersion) {
        this.log(`Warning: Game version (${version}) differs from configured (${this.gameVersion})`, 'WARN');
      }

      // 3. Verify game integrity
      await this.verifyGameIntegrity(gamePath);

      // 4. Backup configuration
      await this.backupConfigFiles(gamePath);

      // 5. Configure RecNet
      await this.configureRecNet(gamePath);

      // 6. Configure Photon
      await this.configurePhoton(gamePath);

      // 7. Install native DLLs (if not dry run)
      if (!this.dryRun && process.platform === 'win32') {
        await this.installNativeDLLs(gamePath);
      }

      this.log('========================================');
      this.log('        Patching Complete!');
      this.log('========================================');
      this.log('');
      this.log('Next steps:');
      this.log('1. Ensure RecVerse backend is running');
      this.log('2. Copy version.dll and versemain.dll to game directory');
      this.log('3. Launch Rec Room via RecRoomScreen.bat or RecRoomVR.bat');
      this.log('4. Check recverse-patcher.log for details');
      this.log('');

      return { success: true, gamePath, version };
    } catch (error) {
      this.log(`Patching failed: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  async installNativeDLLs(gamePath) {
    this.log('Installing native DLLs...');

    const dllSourceDir = path.join(process.cwd(), 'recverse-windows', 'build', 'Release');
    const targetDir = gamePath;

    const dlls = [
      'version.dll',
      'versemain.dll',
    ];

    for (const dll of dlls) {
      const src = path.join(dllSourceDir, dll);
      const dest = path.join(targetDir, dll);

      if (fs.existsSync(src)) {
        if (fs.existsSync(dest)) {
          // Backup existing
          const backup = dest + '.bak';
          fs.copyFileSync(dest, backup);
          this.log(`Backed up existing ${dll} to ${backup}`);
        }
        fs.copyFileSync(src, dest);
        this.log(`Installed ${dll} to ${dest}`);
      } else {
        this.log(`${dll} not found at ${src} - build the native components first`, 'WARN');
      }
    }
  }

  // ============================================================
  // RESTORE / REPAIR
  // ============================================================

  async restore(gamePath) {
    this.log('Restoring original configuration...');

    // Remove patcher config files
    const configFiles = [
      'recverse-patch.json',
      'recverse-photon.json',
      '2025patch.ini',
      '2026patch.ini',
    ];

    for (const file of configFiles) {
      const fullPath = path.join(gamePath, file);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.log(`Removed: ${file}`);
      }
    }

    // Restore native DLLs
    const dlls = ['version.dll', 'versemain.dll'];
    for (const dll of dlls) {
      const fullPath = path.join(gamePath, dll);
      const backup = fullPath + '.bak';
      if (fs.existsSync(backup)) {
        fs.copyFileSync(backup, fullPath);
        fs.unlinkSync(backup);
        this.log(`Restored: ${dll}`);
      } else if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.log(`Removed patched: ${dll}`);
      }
    }

    // Restore registry from backup (latest)
    const backups = fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('backup-'))
      .sort()
      .reverse();

    if (backups.length > 0) {
      const latestBackup = path.join(this.backupDir, backups[0]);
      const regBackup = path.join(latestBackup, 'registry-backup.reg');
      if (fs.existsSync(regBackup)) {
        try {
          execSync(`reg import "${regBackup}"`, { stdio: 'ignore' });
          this.log('Restored registry keys');
        } catch (e) {
          this.log('Registry restore failed', 'WARN');
        }
      }
    }

    this.log('Restoration complete');
  }

  async repair(gamePath) {
    this.log('Repairing installation...');
    // Re-run patch process
    await this.patch({ gamePath });
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'patch';

  const patcher = new RecVersePatcher({
    gamePath: args.find(a => a.startsWith('--game-path='))?.split('=')[1],
    apiBaseUrl: args.find(a => a.startsWith('--api-url='))?.split('=')[1],
    photonHost: args.find(a => a.startsWith('--photon-host='))?.split('=')[1],
    photonPort: parseInt(args.find(a => a.startsWith('--photon-port='))?.split('=')[1] || '5058'),
    dryRun: args.includes('--dry-run'),
    gameVersion: args.find(a => a.startsWith('--game-version='))?.split('=')[1],
  });

  try {
    switch (command) {
      case 'patch':
        await patcher.patch();
        break;
      case 'restore':
        const restorePath = args[1] || patcher.gamePath;
        if (!restorePath) {
          throw new Error('Game path required for restore');
        }
        await patcher.restore(restorePath);
        break;
      case 'repair':
        const repairPath = args[1] || patcher.gamePath;
        if (!repairPath) {
          throw new Error('Game path required for repair');
        }
        await patcher.repair(repairPath);
        break;
      case 'verify':
        const verifyPath = args[1] || patcher.gamePath;
        if (!verifyPath) {
          throw new Error('Game path required for verify');
        }
        await patcher.verifyGameIntegrity(verifyPath);
        break;
      case 'config':
        // Generate config files only
        const configPath = args[1] || patcher.gamePath;
        if (!configPath) {
          throw new Error('Game path required for config');
        }
        await patcher.configureRecNet(configPath);
        await patcher.configurePhoton(configPath);
        break;
      default:
        console.log(`
RecVerse Patcher - Rec Room client configuration tool

Usage:
  node recverse-patcher/index.js <command> [options]

Commands:
  patch       Patch the game to connect to RecVerse (default)
  restore     Restore original game configuration
  repair      Repair a patched installation
  verify      Verify game file integrity
  config      Generate config files only

Options:
  --game-path=<path>      Path to Rec Room installation
  --api-url=<url>         RecVerse API base URL
  --photon-host=<host>    Photon server hostname
  --photon-port=<port>    Photon NameServer port
  --game-version=<ver>    Target game version
  --dry-run               Show what would be done without making changes

Examples:
  node recverse-patcher/index.js patch --game-path="C:\\Games\\RecRoom" --api-url="https://my-recverse.com"
  node recverse-patcher/index.js restore --game-path="C:\\Games\\RecRoom"
  node recverse-patcher/index.js verify --game-path="C:\\Games\\RecRoom"
`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { RecVersePatcher };