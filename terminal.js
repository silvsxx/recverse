/**
 * RecVerse Terminal - Diagnostic Console
 * Provides live diagnostic output for patcher and native integration
 * Communicates with native DLLs via named pipe IPC
 */

const net = require('net');
const readline = require('readline');
const { EventEmitter } = require('events');
const { config } = require('./config');
const { formatISO } = require('./shared');

class RecVerseTerminal extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pipeName = options.pipeName || '\\\\.\\pipe\\recverse-diagnostics';
    this.logLevel = options.logLevel || config.logging.level || 'info';
    this.enabled = options.enabled !== false;
    this.colors = options.colors !== false && process.platform !== 'win32';
    this.server = null;
    this.clients = new Set();
    this.messageBuffer = [];
    this.maxBufferSize = 1000;
    this.startTime = Date.now();

    // Message types
    this.MessageType = {
      LOG: 'log',
      STATUS: 'status',
      CONFIG: 'config',
      HEARTBEAT: 'heartbeat',
      ERROR: 'error',
      DLL_INIT: 'dll_init',
      HOOK_STATUS: 'hook_status',
      PHOTON_STATUS: 'photon_status',
      RECNET_STATUS: 'recnet_status',
    };

    // Color codes
    this.colorCodes = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      gray: '\x1b[90m',
      bgRed: '\x1b[41m',
      bgGreen: '\x1b[42m',
      bgYellow: '\x1b[43m',
      bgBlue: '\x1b[44m',
    };
  }

  // ============================================================
  // SERVER / IPC
  // ============================================================

  async start() {
    if (!this.enabled) {
      this.log('Terminal disabled', 'INFO');
      return;
    }

    return new Promise((resolve, reject) => {
      // Clean up any existing pipe
      this.cleanupPipe();

      this.server = net.createServer((socket) => {
        this.handleClient(socket);
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.cleanupPipe();
          this.server.listen(this.pipeName, () => resolve());
        } else {
          reject(err);
        }
      });

      this.server.listen(this.pipeName, () => {
        this.log(`Terminal IPC server listening on ${this.pipeName}`, 'INFO');
        this.printHeader();
        resolve();
      });
    });
  }

  cleanupPipe() {
    try {
      // On Windows, we can't easily remove the pipe, but we can try
      const fs = require('fs');
      if (fs.existsSync(this.pipeName)) {
        fs.unlinkSync(this.pipeName);
      }
    } catch (e) {
      // Ignore
    }
  }

  handleClient(socket) {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    this.clients.add(socket);
    this.log(`Client connected: ${clientId}`, 'DEBUG');

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.handleMessage(line.trim(), socket);
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.log(`Client disconnected: ${clientId}`, 'DEBUG');
    });

    socket.on('error', (err) => {
      this.log(`Client error: ${err.message}`, 'WARN');
    });

    // Send buffered messages to new client
    for (const msg of this.messageBuffer) {
      this.sendToClient(socket, msg);
    }
  }

  handleMessage(line, socket) {
    try {
      const message = JSON.parse(line);
      this.processMessage(message, socket);
    } catch (e) {
      // Not JSON, treat as raw log
      this.log(`[NATIVE] ${line}`, 'DEBUG');
    }
  }

  processMessage(message, socket) {
    // Add to buffer
    this.messageBuffer.push(message);
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer.shift();
    }

    // Emit for any listeners
    this.emit('message', message);

    // Handle specific message types
    switch (message.type) {
      case this.MessageType.LOG:
        this.logNativeMessage(message);
        break;
      case this.MessageType.STATUS:
        this.updateStatus(message);
        break;
      case this.MessageType.DLL_INIT:
        this.logDLLInit(message);
        break;
      case this.MessageType.HOOK_STATUS:
        this.logHookStatus(message);
        break;
      case this.MessageType.PHOTON_STATUS:
        this.logPhotonStatus(message);
        break;
      case this.MessageType.RECNET_STATUS:
        this.logRecNetStatus(message);
        break;
      case this.MessageType.CONFIG:
        this.logConfig(message);
        break;
      case this.MessageType.HEARTBEAT:
        // Silent
        break;
      default:
        this.log(`[${message.type}] ${JSON.stringify(message)}`, 'DEBUG');
    }
  }

  // ============================================================
  // LOGGING / OUTPUT
  // ============================================================

  printHeader() {
    const width = 60;
    const line = '='.repeat(width);
    console.log(this.colorize(line, 'cyan'));
    console.log(this.colorize(' '.repeat((width - 14) / 2) + 'RECVERSE', 'bright', 'cyan'));
    console.log(this.colorize(line, 'cyan'));
    console.log('');
    this.log('RecVerse terminal starting', 'INFO');
    this.log(`Configuration loaded`, 'INFO');
    this.log(`Log level: ${this.logLevel}`, 'INFO');
    console.log('');
  }

  log(message, level = 'INFO') {
    if (!this.shouldLog(level)) return;

    const timestamp = this.formatTimestamp();
    const levelStr = this.formatLevel(level);
    const prefix = `${timestamp} ${levelStr}`;

    const output = this.colorize(prefix, this.getLevelColor(level)) + ` ${message}`;
    console.log(output);

    // Also send to connected web clients if any
    this.broadcast({
      type: this.MessageType.LOG,
      timestamp: formatISO(),
      level,
      message,
    });
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level.toLowerCase()] >= levels[this.logLevel.toLowerCase()];
  }

  formatTimestamp() {
    const now = new Date();
    return `[${now.toISOString().substr(11, 12)}]`;
  }

  formatLevel(level) {
    const upper = level.toUpperCase();
    return `[${upper.padEnd(5)}]`;
  }

  getLevelColor(level) {
    switch (level.toLowerCase()) {
      case 'debug': return 'gray';
      case 'info': return 'green';
      case 'warn': return 'yellow';
      case 'error': return 'red';
      default: return 'white';
    }
  }

  colorize(text, ...colors) {
    if (!this.colors) return text;
    const codes = colors.map(c => this.colorCodes[c]).filter(Boolean).join('');
    return `${codes}${text}${this.colorCodes.reset}`;
  }

  logNativeMessage(message) {
    const prefix = message.component ? `[${message.component}]` : '[NATIVE]';
    const level = message.level || 'INFO';
    this.log(`${prefix} ${message.message}`, level);
  }

  updateStatus(message) {
    const status = message.status || 'unknown';
    const component = message.component || 'system';
    this.log(`[STATUS] ${component}: ${status}`, 'INFO');
  }

  logDLLInit(message) {
    const dll = message.dll || 'unknown';
    const status = message.status || 'unknown';
    const details = message.details || '';

    const statusColor = status === 'success' ? 'green' : status === 'failed' ? 'red' : 'yellow';
    this.log(`[DLL] ${dll}: ${this.colorize(status.toUpperCase(), statusColor)} ${details}`, 'INFO');
  }

  logHookStatus(message) {
    const hook = message.hook || 'unknown';
    const status = message.status || 'unknown';
    const target = message.target || '';
    const details = message.details || '';

    const statusColor = status === 'installed' ? 'green' : status === 'failed' ? 'red' : 'yellow';
    this.log(`[HOOK] ${hook}: ${this.colorize(status.toUpperCase(), statusColor)} ${target} ${details}`, 'INFO');
  }

  logPhotonStatus(message) {
    const status = message.status || 'unknown';
    const originalHost = message.originalHost || 'unknown';
    const targetHost = message.targetHost || 'unknown';
    const port = message.port || 'unknown';

    const statusColor = status === 'redirected' ? 'green' : 'yellow';
    this.log(`[PHOTON] ${this.colorize(status.toUpperCase(), statusColor)}`, 'INFO');
    this.log(`[PHOTON] Original: ${originalHost}:${port}`, 'DEBUG');
    this.log(`[PHOTON] Target: ${targetHost}:${port}`, 'INFO');
  }

  logRecNetStatus(message) {
    const status = message.status || 'unknown';
    const apiUrl = message.apiUrl || 'unknown';

    const statusColor = status === 'configured' ? 'green' : 'yellow';
    this.log(`[RECNET] ${this.colorize(status.toUpperCase(), statusColor)}`, 'INFO');
    this.log(`[RECNET] API Base: ${apiUrl}`, 'INFO');
  }

  logConfig(message) {
    this.log('[CONFIG] Configuration received from native', 'DEBUG');
    if (message.config) {
      for (const [key, value] of Object.entries(message.config)) {
        if (typeof value === 'string' && (key.includes('key') || key.includes('secret') || key.includes('token'))) {
          this.log(`[CONFIG] ${key}: [REDACTED]`, 'DEBUG');
        } else {
          this.log(`[CONFIG] ${key}: ${value}`, 'DEBUG');
        }
      }
    }
  }

  // ============================================================
  // BROADCAST / CLIENT COMMUNICATION
  // ============================================================

  broadcast(message) {
    const data = JSON.stringify(message) + '\n';
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  sendToClient(client, message) {
    try {
      client.write(JSON.stringify(message) + '\n');
    } catch (e) {
      // Client disconnected
    }
  }

  sendCommand(command, params = {}) {
    this.broadcast({ type: 'command', command, params, timestamp: formatISO() });
  }

  // ============================================================
  // INTERACTIVE COMMANDS
  // ============================================================

  startInteractive() {
    if (!this.enabled) return;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.colorize('recverse> ', 'cyan'),
    });

    rl.prompt();

    rl.on('line', (line) => {
      this.handleCommand(line.trim(), rl);
      rl.prompt();
    });

    rl.on('close', () => {
      this.log('Terminal closed', 'INFO');
      this.stop();
      process.exit(0);
    });
  }

  handleCommand(line, rl) {
    if (!line) return;

    const parts = line.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'status':
        this.showStatus();
        break;
      case 'loglevel':
        if (args[0]) {
          this.logLevel = args[0].toLowerCase();
          this.log(`Log level set to: ${this.logLevel}`, 'INFO');
        } else {
          this.log(`Current log level: ${this.logLevel}`, 'INFO');
        }
        break;
      case 'clients':
        this.log(`Connected clients: ${this.clients.size}`, 'INFO');
        break;
      case 'buffer':
        this.log(`Message buffer: ${this.messageBuffer.length} messages`, 'INFO');
        break;
      case 'clear':
        console.clear();
        this.printHeader();
        break;
      case 'config':
        this.sendCommand('get_config');
        break;
      case 'photon':
        this.sendCommand('photon_status');
        break;
      case 'recnet':
        this.sendCommand('recnet_status');
        break;
      case 'hooks':
        this.sendCommand('hooks_status');
        break;
      case 'dlls':
        this.sendCommand('dlls_status');
        break;
      case 'test-photon':
        this.sendCommand('test_photon_connection');
        break;
      case 'test-recnet':
        this.sendCommand('test_recnet_connection');
        break;
      case 'exit':
      case 'quit':
        rl.close();
        break;
      default:
        this.log(`Unknown command: ${cmd}. Type 'help' for commands.`, 'WARN');
    }
  }

  showHelp() {
    console.log(`
${this.colorize('Available Commands:', 'bright')}
  help              Show this help
  status            Show overall status
  loglevel <level>  Set log level (debug, info, warn, error)
  clients           Show connected native clients
  buffer            Show message buffer size
  clear             Clear screen and reprint header
  config            Request config from native
  photon            Request Photon status
  recnet            Request RecNet status
  hooks             Request hook status
  dlls              Request DLL status
  test-photon       Test Photon connection
  test-recnet       Test RecNet connection
  exit/quit         Exit terminal
`);
  }

  showStatus() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    console.log(`
${this.colorize('RecVerse Terminal Status', 'bright')}
  Uptime: ${hours}h ${minutes}m ${seconds}s
  Log Level: ${this.logLevel}
  Connected Clients: ${this.clients.size}
  Buffered Messages: ${this.messageBuffer.length}
  Pipe: ${this.pipeName}
  Enabled: ${this.enabled}
`);
  }

  // ============================================================
  // SHUTDOWN
  // ============================================================

  stop() {
    this.log('Shutting down terminal...', 'INFO');

    // Notify clients
    this.broadcast({ type: 'shutdown', timestamp: formatISO() });

    // Close client connections
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Cleanup pipe
    this.cleanupPipe();

    this.emit('close');
  }
}

// CLI Entry
async function main() {
  const args = process.argv.slice(2);

  const terminal = new RecVerseTerminal({
    pipeName: args.find(a => a.startsWith('--pipe='))?.split('=')[1],
    logLevel: args.find(a => a.startsWith('--log-level='))?.split('=')[1] || 'info',
    enabled: !args.includes('--disabled'),
    colors: !args.includes('--no-color'),
  });

  // Handle shutdown signals
  process.on('SIGINT', () => terminal.stop());
  process.on('SIGTERM', () => terminal.stop());

  try {
    await terminal.start();

    if (args.includes('--interactive') || args.includes('-i')) {
      terminal.startInteractive();
    } else {
      // Just run as daemon
      terminal.log('Running in daemon mode. Press Ctrl+C to exit.', 'INFO');

      // Keep alive
      await new Promise(() => {});
    }
  } catch (error) {
    console.error(`Terminal error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { RecVerseTerminal };