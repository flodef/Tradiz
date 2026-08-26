const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Stable identifier for this device, persisted by the renderer in userData/publickey.
function getDevicePublicKey() {
    try {
        const keyPath = path.join(app.getPath('userData'), 'publickey');
        if (fs.existsSync(keyPath)) {
            return fs.readFileSync(keyPath, 'utf8').trim();
        }
    } catch (err) {
        console.error('Failed to read device public key: ' + err.message);
    }
    return null;
}

// Redirect console output to a log file for debugging on POS hardware.
const logDir = app.getPath('logs') || app.getPath('userData');
try {
    fs.mkdirSync(logDir, { recursive: true });
} catch {
    /* ignore */
}
const logFilePath = path.join(logDir, 'tradiz.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });
function formatArgs(args) {
    return args
        .map(function (a) {
            if (typeof a === 'object') {
                try {
                    return JSON.stringify(a);
                } catch {
                    return String(a);
                }
            }
            return String(a);
        })
        .join(' ');
}
const origLog = console.log;
const origErr = console.error;

// Buffer logs for batch insertion into dc_sys.logs via the API.
// Flushes every 5 seconds or when 50 entries accumulate.
const logBuffer = [];
const LOG_FLUSH_INTERVAL_MS = 5000;
const LOG_FLUSH_BATCH_SIZE = 50;
var logFlushTimer = null;

function startLogFlushTimer() {
    if (logFlushTimer) return;
    logFlushTimer = setInterval(flushLogsToDb, LOG_FLUSH_INTERVAL_MS);
}

function flushLogsToDb() {
    if (logBuffer.length === 0) return;
    var batch = logBuffer.splice(0, logBuffer.length);
    try {
        var http = require('http');
        var data = JSON.stringify({ logs: batch });
        var req = http.request(
            {
                hostname: 'localhost',
                port: 3001,
                path: '/api/sql/addLog',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            },
            function (res) {
                res.resume(); // consume the response
            }
        );
        req.on('error', function () {
            // Silently ignore — file logs are the primary source.
        });
        req.write(data);
        req.end();
    } catch {
        // Silently ignore — don't let logging break the app.
    }
}

// Clear this device's logs from dc_sys.logs on startup so each session
// starts with a clean log without wiping logs from other devices.
function clearLogsOnStartup() {
    try {
        var publicKey = getDevicePublicKey();
        if (!publicKey) return;
        var http = require('http');
        var data = JSON.stringify({ source: publicKey });
        var req = http.request(
            {
                hostname: 'localhost',
                port: 3001,
                path: '/api/sql/clearLogs',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            },
            function (res) {
                res.resume();
            }
        );
        req.on('error', function () {
            // Silently ignore — logs clearing is best-effort.
        });
        req.write(data);
        req.end();
    } catch {
        // Silently ignore.
    }
}

function bufferLog(level, message) {
    const publicKey = getDevicePublicKey();
    // source identifies the device so logs can be cleared per-device on restart.
    logBuffer.push({
        level: level,
        message: message,
        source: publicKey || 'electron',
    });
    if (logBuffer.length >= LOG_FLUSH_BATCH_SIZE) {
        flushLogsToDb();
    } else {
        startLogFlushTimer();
    }
}

console.log = function () {
    var msg = formatArgs(Array.prototype.slice.call(arguments));
    logStream.write('[INFO] ' + new Date().toISOString() + ' ' + msg + '\n');
    bufferLog('info', msg);
    origLog.apply(console, arguments);
};
console.error = function () {
    var msg = formatArgs(Array.prototype.slice.call(arguments));
    logStream.write('[ERROR] ' + new Date().toISOString() + ' ' + msg + '\n');
    bufferLog('error', msg);
    origErr.apply(console, arguments);
};

// electron-updater is optional — the app works without auto-updates.
let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (err) {
    console.error('electron-updater not available, auto-updates disabled:', err.message);
}

// Catch any uncaught errors so they appear in the log file.
process.on('uncaughtException', function (err) {
    console.error('Uncaught exception:', err && err.stack ? err.stack : err);
});

// --- Customer display (serial LCD 2x20) ---
let displayPort = null;
let displayReconnectTimer = null;

// ESC/POS commands for customer displays
const DISPLAY_CMD = {
    INIT: Buffer.from([0x1b, 0x40]), // ESC @ — initialize / clear screen
    LINE2: Buffer.from([0x1b, 0x4a, 0x02]), // ESC J 2 — move cursor to line 2 (some displays)
    CR: Buffer.from([0x0d]), // carriage return
    LF: Buffer.from([0x0a]), // line feed
};

// Simple fs-based COM port handle (fallback when serialport module is unavailable)
let comFd = null;
let comPortName = null;

function openComPort(portName) {
    try {
        comFd = fs.openSync('\\\\.\\' + portName, 'r+');
        comPortName = portName;
        console.log('Customer display opened on ' + portName + ' (fs mode)');
        return true;
    } catch (err) {
        console.log('Could not open ' + portName + ': ' + err.message);
        return false;
    }
}

function writeComPort(data) {
    if (comFd === null) return;
    try {
        fs.writeSync(comFd, data, 0, data.length, null);
    } catch (err) {
        console.error('COM write error:', err.message);
        // Try to reopen
        try {
            fs.closeSync(comFd);
        } catch {
            /* ignore */
        }
        comFd = null;
        setTimeout(function () {
            openComPort(comPortName);
        }, 2000);
    }
}

async function findDisplayPort() {
    let configuredPort = process.env.TRADIZ_DISPLAY_PORT;
    let configuredBaud = parseInt(process.env.TRADIZ_DISPLAY_BAUDRATE || '0', 10);

    // If no env-configured port, try to fetch device hardware config from the API
    if (!configuredPort) {
        try {
            var http = require('http');
            var port = process.env.PORT || 3001;

            // Read the public key so we can look up the correct device
            var publicKey = null;
            try {
                var keyPath = path.join(app.getPath('userData'), 'publickey');
                if (fs.existsSync(keyPath)) {
                    publicKey = fs.readFileSync(keyPath, 'utf8').trim();
                }
            } catch (err) {
                console.log('Could not read public key: ' + err.message);
            }

            var displayConfig = await new Promise((resolve) => {
                var req = http.get('http://127.0.0.1:' + port + '/api/sql/getDevices', (res) => {
                    var body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => {
                        try {
                            var data = JSON.parse(body);
                            var devices = data.devices || [];
                            // Find this device by public key
                            var device = publicKey ? devices.find((d) => d.key === publicKey) : null;
                            if (device && device.backscreenCom) {
                                resolve({
                                    port: device.backscreenCom,
                                    baud: device.backscreenBaud || null,
                                });
                            } else {
                                resolve(null);
                            }
                        } catch {
                            resolve(null);
                        }
                    });
                });
                req.on('error', () => resolve(null));
                req.setTimeout(3000, () => {
                    req.destroy();
                    resolve(null);
                });
            });

            if (displayConfig) {
                configuredPort = displayConfig.port;
                if (displayConfig.baud) {
                    configuredBaud = displayConfig.baud;
                }
                console.log(
                    'Found display config: ' + configuredPort + (configuredBaud ? ' @ ' + configuredBaud + ' baud' : '')
                );
            }
        } catch {
            // API not available yet, continue with auto-detect
        }
    }

    if (!configuredPort) {
        console.log('No customer display configured (set backscreen COM in device config).');
        return null;
    }

    // Build baud rate list: configured baud first, then common rates
    var BAUD_RATES = configuredBaud
        ? [configuredBaud, 9600, 4800, 19200, 38400, 57600, 115200, 2400]
        : [9600, 4800, 19200, 38400, 57600, 115200, 2400];
    // Remove duplicates
    BAUD_RATES = [...new Set(BAUD_RATES)];

    // Try serialport module first (supports baud rate configuration)
    let SerialPort = null;
    try {
        SerialPort = require('serialport').SerialPort;
    } catch (err) {
        console.error('SerialPort module not available, using fs fallback:', err.message);
    }

    for (var b = 0; b < BAUD_RATES.length; b++) {
        var baud = BAUD_RATES[b];
        if (SerialPort) {
            try {
                const port = new SerialPort({
                    path: configuredPort,
                    baudRate: baud,
                    autoOpen: false,
                });
                await new Promise((resolve, reject) => {
                    port.open((err) => (err ? reject(err) : resolve()));
                });
                console.log('Customer display opened on ' + configuredPort + ' @ ' + baud + ' (serialport mode)');
                return port;
            } catch (err) {
                console.log('Could not open ' + configuredPort + ' @ ' + baud + ': ' + err.message);
            }
        } else {
            // Fallback: use fs to open COM port directly (Windows only)
            try {
                require('child_process').execSync(
                    'mode ' +
                        configuredPort +
                        ': BAUD=' +
                        baud +
                        ' PARITY=N DATA=8 STOP=1 to=off xon=off odsr=off octs=off dtr=on rts=on',
                    { stdio: 'pipe' }
                );
            } catch (err) {
                console.log('Could not configure ' + configuredPort + ' @ ' + baud + ': ' + err.message);
            }
            if (openComPort(configuredPort)) {
                console.log('Customer display opened on ' + configuredPort + ' @ ' + baud + ' (fs mode)');
                return { _fsMode: true };
            }
        }
    }

    console.log('Could not open customer display on ' + configuredPort + ' at any baud rate.');
    return null;
}

async function writeToDisplay(line1, line2) {
    if (!displayPort) {
        // Try to reconnect
        displayPort = await findDisplayPort();
        if (!displayPort) return;
    }

    var l1 = line1.slice(0, 20).padEnd(20, ' ');
    var l2 = line2.slice(0, 20).padEnd(20, ' ');

    // Write as a single buffer: INIT + line1 (20 chars) + line2 (20 chars)
    // The display auto-wraps to line 2 after 20 characters.
    // Sending CRLF between lines caused the cursor to wrap back to line 1,
    // overwriting line1 with line2 content.
    var buf = Buffer.concat([DISPLAY_CMD.INIT, Buffer.from(l1, 'latin1'), Buffer.from(l2, 'latin1')]);

    if (displayPort._fsMode) {
        writeComPort(buf);
        return;
    }

    // serialport module mode
    if (!displayPort.isOpen) return;

    displayPort.write(buf, (err) => {
        if (err) console.error('Display write error:', err.message);
    });
}

async function initDisplay() {
    displayPort = await findDisplayPort();
    if (displayPort) {
        if (!displayPort._fsMode) {
            displayPort.on('error', (err) => {
                console.error('Display port error:', err.message);
                displayPort = null;
            });
            displayPort.on('close', () => {
                console.log('Display port closed, will retry in 5s');
                displayPort = null;
                if (displayReconnectTimer) clearTimeout(displayReconnectTimer);
                displayReconnectTimer = setTimeout(initDisplay, 5000);
            });
        }
        // Send initial display
        writeToDisplay('Tradiz', 'Bienvenue');
    } else {
        // No display found, retry periodically
        if (displayReconnectTimer) clearTimeout(displayReconnectTimer);
        displayReconnectTimer = setTimeout(initDisplay, 10000);
    }
}

// Load .env.local from the app directory (development) or from the user data
// directory (production, next to the executable).
function loadEnv() {
    const envPaths = [path.join(process.cwd(), '.env.local'), path.join(app.getPath('userData'), '.env.local')];
    if (!app.isPackaged) {
        envPaths.unshift(path.join(__dirname, '..', '.env.local'));
    } else {
        // In packaged builds, _env.local is in resources/standalone/ (renamed from .env.local
        // during build to avoid electron-builder stripping). Load it here before startServer renames it.
        envPaths.push(path.join(process.resourcesPath, 'standalone', '_env.local'));
        envPaths.push(path.join(process.resourcesPath, 'standalone', '.env.local'));
    }
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIndex = trimmed.indexOf('=');
                if (eqIndex === -1) continue;
                const key = trimmed.slice(0, eqIndex).trim();
                var value = trimmed.slice(eqIndex + 1).trim();
                // Strip inline comments (e.g. VALUE=foo  # comment)
                var hashIdx = value.indexOf('#');
                if (hashIdx >= 0) {
                    value = value.slice(0, hashIdx).trim();
                }
                // Strip surrounding quotes
                value = value.replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
            console.log(`Loaded env from: ${envPath}`);
            console.log(
                'DB env vars: PG_HOST=' +
                    (process.env.PG_HOST || 'unset') +
                    ', PG_USER=' +
                    (process.env.PG_USER || 'unset') +
                    ', PG_DATABASE=' +
                    (process.env.PG_DATABASE || 'unset') +
                    ', DB_HOST=' +
                    (process.env.DB_HOST || 'unset')
            );

            // Persist env to userData so future auto-updates (which replace
            // resources/) don't wipe the configuration.
            if (app.isPackaged && envPath.includes('resources')) {
                var userDataEnv = path.join(app.getPath('userData'), '.env.local');
                if (!fs.existsSync(userDataEnv)) {
                    try {
                        fs.writeFileSync(userDataEnv, content, 'utf8');
                        console.log('Persisted env to: ' + userDataEnv);
                    } catch (err) {
                        console.error('Failed to persist env to userData: ' + err.message);
                    }
                }
            }

            break;
        }
    }
}

const PORT = 3001;
const DEV_URL = `http://localhost:${PORT}`;

let mainWindow;
let miniWindow;
let splashWindow = null;
let splashWatchdog = null;
let serverProcess = null;

const isDev = !app.isPackaged;

function createSplashScreen() {
    splashWindow = new BrowserWindow({
        width: 480,
        height: 360,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        center: true,
        show: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const splashHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; width: 100vw; overflow: hidden;
    background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .logo { font-size: 48px; font-weight: 800; color: #d97706; letter-spacing: -1px; margin-bottom: 8px; }
  .subtitle { font-size: 14px; color: #92400e; margin-bottom: 32px; }

  /* LoadingDot animation — replicated from src/app/loading.tsx */
  .dots-container { display: flex; align-items: center; justify-content: center; height: 16px; width: 112px; position: relative; }
  .dot { height: 16px; width: 16px; border-radius: 50%; background: #d97706; }
  .dot.grow-left { position: absolute; top: 0; left: 0; margin-right: 32px; animation: grow 500ms linear 0ms infinite; }
  .dot.move { margin-right: 30px; animation: move 500ms linear 0ms infinite; }
  .dot.grow-right { position: absolute; top: 0; right: 0; margin: 0; animation: grow 500ms linear 0ms infinite reverse; }

  @keyframes move { 0% { transform: translateX(0); } 100% { transform: translateX(45px); } }
  @keyframes grow { 0% { transform: scale(0,0); opacity: 0; } 100% { transform: scale(1,1); opacity: 1; } }

  .loading-text { margin-top: 32px; font-size: 13px; color: #92400e; text-align: center; transition: opacity 0.5s ease; }
  .loading-text.fade { opacity: 0; }
  .version { position: absolute; bottom: 16px; font-size: 11px; color: #c4a484; }
</style>
</head>
<body>
  <div class="logo">Tradiz</div>
  <div class="subtitle">Caisse &amp; Gestion</div>
  <div class="dots-container">
    <span class="dot grow-left"></span>
    <span class="dot move"></span>
    <span class="dot move"></span>
    <span class="dot grow-right"></span>
  </div>
  <div class="loading-text" id="loadingText">Démarrage en cours…</div>
  <div class="version">v${app.getVersion()}</div>
  <script>
    var messages = [
      "Démarrage en cours…",
      "L'application met les petits plats dans les grands…",
      "On y est presque…",
      "Encore un petit instant…",
      "À vos marques, prêt, feu…"
    ];
    var idx = 0;
    var el = document.getElementById('loadingText');
    setInterval(function () {
      el.classList.add('fade');
      setTimeout(function () {
        idx = (idx + 1) % messages.length;
        el.textContent = messages[idx];
        el.classList.remove('fade');
      }, 500);
    }, 10000);
  </script>
</body>
</html>`;

    splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));

    splashWindow.on('closed', function () {
        splashWindow = null;
    });

    // Watchdog: close splash after 120s no matter what, so it never becomes permanent.
    splashWatchdog = setTimeout(function () {
        console.error('Splash watchdog: closing splash after 120s timeout');
        closeSplashScreen();
        if (!mainWindow || mainWindow.isDestroyed()) {
            dialog.showErrorBox(
                "Tradiz n'a pas pu d\u00e9marrer",
                "L'application n'a pas r\u00e9ussi \u00e0 d\u00e9marrer dans les temps impartis.\n\n" +
                    "Veuillez fermer cette fen\u00eatre et relancer Tradiz en double-cliquant sur l'ic\u00f4ne de l'application.\n\n" +
                    'Si le probl\u00e8me persiste, contactez le support technique.'
            );
            app.quit();
        }
    }, 120000);
}

function closeSplashScreen() {
    if (splashWatchdog) {
        clearTimeout(splashWatchdog);
        splashWatchdog = null;
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
    }
}

function startServer() {
    if (isDev) {
        return Promise.resolve();
    }

    var standaloneDir = path.join(process.resourcesPath, 'standalone');
    var serverPath = path.join(standaloneDir, 'server.js');

    if (!fs.existsSync(serverPath)) {
        var errorMsg = 'Server file not found: ' + serverPath;
        console.error(errorMsg);
        if (app.isPackaged) {
            errorMsg += '\n\nThe installation may be incomplete. Please reinstall Tradiz.';
            dialog.showErrorBox('Tradiz - Installation Error', errorMsg);
            app.quit();
        }
        return Promise.reject(new Error(errorMsg));
    }

    // Kill any existing process on port 3001 to avoid EADDRINUSE on restart
    try {
        require('child_process').execSync(
            'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :3001 ^| findstr LISTENING\') do taskkill /F /PID %a',
            { stdio: 'ignore', shell: 'cmd.exe' }
        );
        console.log('Killed existing process on port 3001');
    } catch {
        // No process on port 3001, or kill failed — continue anyway
    }

    // electron-builder strips node_modules from extraResources, so we renamed
    // them to _node_modules during build. Rename them back at runtime.
    var nmRenamed = path.join(standaloneDir, '_node_modules');
    var nmDir = path.join(standaloneDir, 'node_modules');
    if (fs.existsSync(nmRenamed) && !fs.existsSync(nmDir)) {
        try {
            fs.renameSync(nmRenamed, nmDir);
            console.log('Restored _node_modules -> node_modules');
        } catch (err) {
            console.error('Failed to restore node_modules: ' + err.message);
        }
    }
    var nextNmRenamed = path.join(standaloneDir, '.next/_node_modules');
    var nextNmDir = path.join(standaloneDir, '.next/node_modules');
    if (fs.existsSync(nextNmRenamed) && !fs.existsSync(nextNmDir)) {
        try {
            fs.renameSync(nextNmRenamed, nextNmDir);
            console.log('Restored .next/_node_modules -> .next/node_modules');
        } catch (err) {
            console.error('Failed to restore .next/node_modules: ' + err.message);
        }
    }
    // Restore _env.local -> .env.local so the Next.js server can read it.
    var envRenamed = path.join(standaloneDir, '_env.local');
    var envLocal = path.join(standaloneDir, '.env.local');
    if (fs.existsSync(envRenamed) && !fs.existsSync(envLocal)) {
        try {
            fs.renameSync(envRenamed, envLocal);
            console.log('Restored _env.local -> .env.local');
        } catch (err) {
            console.error('Failed to restore .env.local: ' + err.message);
        }
    }
    // Fallback: if .env.local doesn't exist in standalone (e.g. after auto-update
    // that replaced resources/), copy it from userData where it was persisted.
    if (!fs.existsSync(envLocal)) {
        var userDataEnv = path.join(app.getPath('userData'), '.env.local');
        if (fs.existsSync(userDataEnv)) {
            try {
                fs.copyFileSync(userDataEnv, envLocal);
                console.log('Copied .env.local from userData to standalone');
            } catch (err) {
                console.error('Failed to copy .env.local from userData: ' + err.message);
            }
        }
    }

    process.env.NODE_ENV = 'production';
    process.env.PORT = String(PORT);

    console.log('Starting standalone server from: ' + standaloneDir);
    console.log('Exists node_modules/next: ' + fs.existsSync(path.join(standaloneDir, 'node_modules', 'next')));
    console.log('process.execPath: ' + process.execPath);

    var serverOutput = [];

    var spawn = require('child_process').spawn;
    var serverEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
    serverProcess = spawn(process.execPath, [serverPath], {
        cwd: standaloneDir,
        env: serverEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', function (data) {
        var msg = String(data).trim();
        console.log('[server] ' + msg);
        serverOutput.push(msg);
    });

    serverProcess.stderr.on('data', function (data) {
        var msg = String(data).trim();
        console.error('[server] ' + msg);
        serverOutput.push(msg);
    });

    return new Promise(function (resolve, reject) {
        var rejected = false;

        serverProcess.on('exit', function (code, signal) {
            console.log('Server process exited with code ' + code + ' signal ' + signal);
            serverProcess = null;
            if (!rejected && code !== 0) {
                rejected = true;
                reject(new Error('Server crashed (code ' + code + '). Output:\n' + serverOutput.join('\n')));
            }
        });

        // Wait for the server to be ready by checking the port.
        var http = require('http');
        var attempts = 0;
        var maxAttempts = 120;
        var checkReady = function () {
            if (rejected) return;
            if (!serverProcess) {
                rejected = true;
                reject(new Error('Server process exited before becoming ready. Output:\n' + serverOutput.join('\n')));
                return;
            }
            var settled = false;
            var req = http.get('http://127.0.0.1:' + PORT + '/', function () {
                if (settled) return;
                settled = true;
                req.destroy();
                console.log('Server is ready');
                resolve();
            });
            req.on('error', function () {
                if (settled) return;
                settled = true;
                req.destroy();
                attempts++;
                if (attempts >= maxAttempts) {
                    rejected = true;
                    reject(
                        new Error(
                            'Server failed to start within ' +
                                maxAttempts +
                                ' attempts. Output:\n' +
                                serverOutput.join('\n')
                        )
                    );
                } else {
                    setTimeout(checkReady, 500);
                }
            });
            req.setTimeout(2000, function () {
                if (settled) return;
                settled = true;
                req.destroy();
                attempts++;
                if (attempts >= maxAttempts) {
                    rejected = true;
                    reject(
                        new Error(
                            'Server failed to start within ' +
                                maxAttempts +
                                ' attempts. Output:\n' +
                                serverOutput.join('\n')
                        )
                    );
                } else {
                    setTimeout(checkReady, 500);
                }
            });
        };
        setTimeout(checkReady, 500);
    });
}

var loadErrorShown = false;

function loadWithRetry(window, url, attempts) {
    if (!attempts) attempts = 30;
    return new Promise(function (resolve, reject) {
        var http = require('http');
        var tryLoad = function (remaining) {
            var settled = false;
            var req = http.get(url, function () {
                if (settled) return;
                settled = true;
                req.destroy();
                window.loadURL(url).then(resolve).catch(reject);
            });
            req.on('error', function () {
                if (settled) return;
                settled = true;
                req.destroy();
                if (remaining > 0) {
                    setTimeout(function () {
                        tryLoad(remaining - 1);
                    }, 500);
                } else {
                    reject(new Error('Could not connect to ' + url));
                }
            });
            req.setTimeout(1000, function () {
                if (settled) return;
                settled = true;
                req.destroy();
                if (remaining > 0) {
                    setTimeout(function () {
                        tryLoad(remaining - 1);
                    }, 500);
                } else {
                    reject(new Error('Could not connect to ' + url));
                }
            });
        };
        tryLoad(attempts);
    });
}

// Store pending update info so the renderer can query it on mount,
// avoiding the race condition where update-available fires before
// UpdateListener has registered its IPC listeners.
let pendingUpdateInfo = null;
let updateDownloaded = false;

function initAutoUpdater() {
    // Auto-updater works in packaged builds with electron-updater available.
    if (!autoUpdater || isDev) {
        console.log('Auto-updater disabled: ' + (!autoUpdater ? 'module not loaded' : 'dev mode'));
        return;
    }

    try {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('update-available', (info) => {
            console.log('Auto-updater: update available v' + info.version);
            pendingUpdateInfo = { version: info.version };
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-available', { version: info.version });
            }
        });

        autoUpdater.on('update-downloaded', () => {
            console.log('Auto-updater: update downloaded, waiting for user to confirm restart');
            updateDownloaded = true;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-downloaded');
            }
        });

        autoUpdater.on('error', (err) => {
            console.error('Auto-updater error:', err.message);
        });

        // Listen for user response from the renderer popup
        ipcMain.on('update-response', (_event, response) => {
            if (!autoUpdater) return;
            if (response === 'download') {
                autoUpdater.downloadUpdate().catch((err) => {
                    console.error('Auto-updater download failed:', err.message);
                });
            } else if (response === 'install') {
                console.log('Auto-updater: user confirmed restart, installing silently');
                // quitAndInstall(false, true) = silent install, force restart
                // This does an in-place update without showing the NSIS installer UI.
                autoUpdater.quitAndInstall(false, true);
            }
        });

        // Allow renderer to trigger a fresh update check (e.g. from 500 error page)
        ipcMain.on('check-for-updates', () => {
            if (!autoUpdater) {
                console.error('Auto-updater: check-for-updates requested but module not loaded');
                return;
            }
            console.log('Auto-updater: check-for-updates requested by renderer');
            checkForUpdatesWithRetry();
        });

        // Renderer queries for pending update on mount to avoid missing the event
        ipcMain.on('get-pending-update', (event) => {
            if (pendingUpdateInfo) {
                event.reply('update-available', pendingUpdateInfo);
            }
            if (updateDownloaded) {
                event.reply('update-downloaded');
            }
        });

        // Check for updates every 30 minutes
        setInterval(() => {
            checkForUpdatesWithRetry();
        }, 1800000);
    } catch (err) {
        console.error('Auto-updater init failed:', err.message);
    }
}

// Check for updates with retry — the CI build may still be uploading latest.yml
// when the app starts right after a release is created. Retry up to 5 times with
// a 30-second delay between attempts.
var updateCheckAttempts = 0;
var updateCheckMaxAttempts = 5;
function checkForUpdatesWithRetry() {
    if (!autoUpdater) return;
    autoUpdater
        .checkForUpdates()
        .then(function () {
            updateCheckAttempts = 0; // reset on success
        })
        .catch(function (err) {
            var msg = err.message || '';
            console.error('Auto-updater check failed:', msg);
            // Retry when latest.yml is not yet uploaded (CI still running)
            if (msg.indexOf('latest.yml') !== -1 && updateCheckAttempts < updateCheckMaxAttempts) {
                updateCheckAttempts++;
                console.log(
                    'Auto-updater: retrying in 30s (attempt ' + updateCheckAttempts + '/' + updateCheckMaxAttempts + ')'
                );
                setTimeout(checkForUpdatesWithRetry, 30000);
            }
        });
}

function createMainWindow() {
    const fullscreen = process.env.TRADIZ_FULLSCREEN !== 'false';

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Tradiz',
        icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
        fullscreen: fullscreen,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    var targetUrl = DEV_URL;
    loadWithRetry(mainWindow, targetUrl).catch(function (err) {
        console.error('Failed to load application:', err.message);
        closeSplashScreen();
        if (!loadErrorShown) {
            loadErrorShown = true;
            dialog.showErrorBox(
                'Erreur de chargement Tradiz',
                "Impossible de charger l'application.\n\nURL: " +
                    targetUrl +
                    '\nErreur: ' +
                    err.message +
                    '\n\nVérifiez que le serveur a bien démarré.'
            );
        }
    });

    // Open DevTools in dev mode or when TRADIZ_DEBUG is set.
    if (isDev || process.env.TRADIZ_DEBUG === '1') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (miniWindow && !miniWindow.isDestroyed()) {
            miniWindow.close();
        }
    });

    // Log any load errors to a visible dialog in production.
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`Load failed: ${errorCode} ${errorDescription} for ${validatedURL}`);
        closeSplashScreen();
    });

    // Inject touch-drag-to-scroll for touch screen POS (no mouse, only touch).
    // Only active on /admin pages where the VirtualKeyboard is used.
    // Uses Pointer Events to cover both touch and mouse-emulation digitizers.
    mainWindow.webContents.on('did-finish-load', function () {
        console.log('Page finished loading');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
        }
        closeSplashScreen();

        // Check for updates after a short delay to give the renderer time
        // to mount UpdateListener and register IPC listeners.
        if (!isDev && autoUpdater) {
            setTimeout(() => {
                checkForUpdatesWithRetry();
            }, 5000);
        }

        mainWindow.webContents
            .executeJavaScript(
                '(function () {' +
                    '  if (window.__tradizTouchScroll) return;' +
                    '  window.__tradizTouchScroll = true;' +
                    '  var target = null, startX = 0, startY = 0, startScrollTop = 0, startScrollLeft = 0;' +
                    '  function isAdmin() {' +
                    '    return /(^|\\/)admin(\\/|$)/.test(window.location.pathname);' +
                    '  }' +
                    '  function findScrollable(el) {' +
                    '    while (el && el !== document.body) {' +
                    '      var style = getComputedStyle(el);' +
                    '      if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;' +
                    '      el = el.parentElement;' +
                    '    }' +
                    '    return document.scrollingElement || document.documentElement;' +
                    '  }' +
                    "  document.addEventListener('pointerdown', function (e) {" +
                    '    if (!isAdmin() || !e.isPrimary) { target = null; return; }' +
                    '    target = findScrollable(e.target);' +
                    '    startX = e.clientX; startY = e.clientY;' +
                    '    startScrollTop = target.scrollTop; startScrollLeft = target.scrollLeft;' +
                    '  });' +
                    "  document.addEventListener('pointermove', function (e) {" +
                    '    if (!target || !e.isPrimary) return;' +
                    '    var dx = e.clientX - startX, dy = e.clientY - startY;' +
                    '    target.scrollTop = startScrollTop - dy;' +
                    '    // Only scroll horizontally if the container actually has horizontal overflow.' +
                    '    if (target.scrollWidth > target.clientWidth) target.scrollLeft = startScrollLeft - dx;' +
                    '  });' +
                    '  function clearTarget() { target = null; }' +
                    "  document.addEventListener('pointerup', clearTarget);" +
                    "  document.addEventListener('pointercancel', clearTarget);" +
                    '})();'
            )
            .catch(function () {});
    });

    // Log client-side console messages to the log file for debugging.
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        var levelStr = ['LOG', 'WARN', 'ERROR'][level] || 'LOG';
        console.log('[client][' + levelStr + '] ' + message + ' (' + sourceId + ':' + line + ')');
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('Render process gone: ' + JSON.stringify(details));
        closeSplashScreen();
    });
}

function createMiniWindow() {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.focus();
        return;
    }

    const displays = screen.getAllDisplays();
    const external = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0);
    if (!external) {
        console.log('No external display found for mini window');
        return;
    }

    miniWindow = new BrowserWindow({
        x: external.bounds.x,
        y: external.bounds.y,
        width: external.bounds.width,
        height: external.bounds.height,
        frame: false,
        fullscreen: true,
        title: 'Tradiz - Afficheur client',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const miniUrl = `${DEV_URL}/mini`;
    loadWithRetry(miniWindow, miniUrl).catch((err) => {
        console.error('Failed to load mini display:', err.message);
    });

    miniWindow.on('closed', () => {
        miniWindow = null;
    });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.whenReady().then(async () => {
    loadEnv();

    console.log('Tradiz v' + app.getVersion() + ' starting...');

    // Show splash screen immediately so the user sees feedback during server startup.
    createSplashScreen();

    // Launch at OS startup when packaged
    if (app.isPackaged) {
        app.setLoginItemSettings({
            openAtLogin: true,
            path: process.execPath,
        });
    }

    console.log(`isDev: ${isDev}, isPackaged: ${app.isPackaged}`);
    console.log(`TRADIZ_FULLSCREEN: ${process.env.TRADIZ_FULLSCREEN}`);
    console.log(`resourcesPath: ${process.resourcesPath || 'N/A'}`);

    try {
        await startServer();
        console.log('Server started successfully');
        // Clear logs from previous sessions now that the server is ready.
        clearLogsOnStartup();
    } catch (err) {
        console.error('Failed to start server:', err);
        closeSplashScreen();
        dialog.showErrorBox(
            'Erreur de démarrage Tradiz',
            `Le serveur n'a pas pu démarrer.\n\nErreur: ${err.message}\n\nStandalone dir: ${path.join(process.resourcesPath || 'N/A', 'standalone')}`
        );
    }

    console.log('Creating main window...');
    createMainWindow();
    initAutoUpdater();
    initDisplay();

    // Auto-open customer display on second monitor if present
    const displays = screen.getAllDisplays();
    const externalDisplay = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0);
    if (externalDisplay) {
        console.log('External display detected, opening customer display window');
        setTimeout(createMiniWindow, 2000);
    } else {
        console.log('No external display detected, skipping customer display window');
    }

    console.log('App initialized');

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
    // Flush any buffered logs before quitting.
    flushLogsToDb();
    if (logFlushTimer) clearInterval(logFlushTimer);
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.on('open-mini-display', () => {
    createMiniWindow();
});

ipcMain.on('close-mini-display', () => {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.close();
    }
});

ipcMain.on('close-app', () => {
    app.quit();
});

ipcMain.handle('get-public-key', () => {
    try {
        var keyPath = path.join(app.getPath('userData'), 'publickey');
        if (fs.existsSync(keyPath)) {
            return fs.readFileSync(keyPath, 'utf8').trim();
        }
        return null;
    } catch (err) {
        console.error('Failed to read public key: ' + err.message);
        return null;
    }
});

ipcMain.handle('set-public-key', (_event, key) => {
    try {
        var keyPath = path.join(app.getPath('userData'), 'publickey');
        fs.writeFileSync(keyPath, key, 'utf8');
        console.log('Saved public key to: ' + keyPath);
    } catch (err) {
        console.error('Failed to write public key: ' + err.message);
    }
});

ipcMain.on('send-to-mini', (_event, data) => {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send('mini-message', data);
    }
});

ipcMain.on('customer-display', (_event, payload) => {
    if (payload && payload.line1 !== undefined && payload.line2 !== undefined) {
        writeToDisplay(payload.line1, payload.line2);
    }
});

ipcMain.on('test-display', async (_event, testParams) => {
    var targetPort = testParams && testParams.port;
    var targetBaud = testParams && testParams.baud;

    // If the display is already connected and no specific port is requested, just write to it
    if (displayPort && !targetPort) {
        writeToDisplay('TEST ECRAN CLIENT', 'Tradiz 2x20 LCD');
        return;
    }

    // If a specific port + baud is provided, test only that combination
    if (targetPort) {
        var baud = targetBaud || 9600;
        console.log('[TEST DISPLAY] Testing ' + targetPort + ' @ ' + baud + ' baud...');

        var l1 = (targetPort + ' ' + baud).slice(0, 20).padEnd(20, ' ');
        var l2 = 'ECRAN CLIENT OK'.slice(0, 20).padEnd(20, ' ');
        var buf = Buffer.concat([DISPLAY_CMD.INIT, Buffer.from(l1, 'latin1'), Buffer.from(l2, 'latin1')]);

        var SerialPort = null;
        try {
            SerialPort = require('serialport').SerialPort;
        } catch (err) {
            console.error('[TEST DISPLAY] SerialPort module not available:', err.message);
        }

        if (SerialPort) {
            try {
                var port = new SerialPort({
                    path: targetPort,
                    baudRate: baud,
                    autoOpen: false,
                });
                await new Promise(function (resolve) {
                    port.open(function (err) {
                        if (err) {
                            console.log(
                                '[TEST DISPLAY] Could not open ' + targetPort + ' @ ' + baud + ': ' + err.message
                            );
                            resolve();
                            return;
                        }
                        port.write(buf, function (werr) {
                            if (werr) {
                                console.log(
                                    '[TEST DISPLAY] Write failed on ' + targetPort + ' @ ' + baud + ': ' + werr.message
                                );
                            } else {
                                console.log('[TEST DISPLAY] Test sent to ' + targetPort + ' @ ' + baud + ' OK');
                            }
                            port.close();
                            resolve();
                        });
                    });
                });
                return;
            } catch (err) {
                console.log('[TEST DISPLAY] Error testing ' + targetPort + ': ' + err.message);
                return;
            }
        } else {
            // fs fallback
            try {
                require('child_process').execSync(
                    'mode ' +
                        targetPort +
                        ': BAUD=' +
                        baud +
                        ' PARITY=N DATA=8 STOP=1 to=off xon=off odsr=off octs=off dtr=on rts=on',
                    { stdio: 'pipe' }
                );
            } catch (err) {
                console.log('[TEST DISPLAY] Could not configure ' + targetPort + ' @ ' + baud + ': ' + err.message);
            }
            try {
                var targetPath = '\\\\.\\' + targetPort;
                var fd = fs.openSync(targetPath, 'r+');
                try {
                    fs.writeSync(fd, buf, 0, buf.length, null);
                    console.log('[TEST DISPLAY] Test sent to ' + targetPort + ' @ ' + baud + ' (fs mode) OK');
                } finally {
                    fs.closeSync(fd);
                }
            } catch (err) {
                console.log('[TEST DISPLAY] fs mode failed on ' + targetPort + ' @ ' + baud + ': ' + err.message);
            }
            return;
        }
    }

    // No specific port — scan all available COM ports at all common baud rates
    console.log('[TEST DISPLAY] Scanning all COM ports × baud rates...');
    SerialPort = null;
    try {
        SerialPort = require('serialport').SerialPort;
    } catch (err) {
        console.error('[TEST DISPLAY] SerialPort module not available:', err.message);
    }

    var BAUD_RATES = ['9600', '19200', '38400', '57600', '115200', '2400', '4800'];

    for (var i = 1; i <= 16; i++) {
        var portName = 'COM' + i;
        var path = '\\\\.\\' + portName;

        // Check if port exists
        try {
            fd = fs.openSync(path, 'r');
            fs.closeSync(fd);
        } catch {
            continue;
        }

        // Skip COM1 (cashier printer)
        if (i === 1) {
            console.log('[TEST DISPLAY] Skipping ' + portName + ' (cashier printer)');
            continue;
        }

        for (var b = 0; b < BAUD_RATES.length; b++) {
            baud = BAUD_RATES[b];
            console.log('[TEST DISPLAY] Sending test to ' + portName + ' @ ' + baud + ' baud...');

            l1 = (portName + ' ' + baud).slice(0, 20).padEnd(20, ' ');
            l2 = 'ECRAN CLIENT OK'.slice(0, 20).padEnd(20, ' ');
            buf = Buffer.concat([DISPLAY_CMD.INIT, Buffer.from(l1, 'latin1'), Buffer.from(l2, 'latin1')]);

            // Try serialport module first (configures baud rate properly)
            if (SerialPort) {
                try {
                    port = new SerialPort({
                        path: portName,
                        baudRate: parseInt(baud, 10),
                        autoOpen: false,
                    });
                    await new Promise(function (resolve) {
                        port.open(function (err) {
                            if (err) {
                                console.log(
                                    '[TEST DISPLAY] Could not open ' + portName + ' @ ' + baud + ': ' + err.message
                                );
                                resolve();
                                return;
                            }
                            port.write(buf, function (werr) {
                                if (werr) {
                                    console.log(
                                        '[TEST DISPLAY] Write failed on ' +
                                            portName +
                                            ' @ ' +
                                            baud +
                                            ': ' +
                                            werr.message
                                    );
                                } else {
                                    console.log('[TEST DISPLAY] Test sent to ' + portName + ' @ ' + baud + ' OK');
                                }
                                port.close();
                                resolve();
                            });
                        });
                    });
                } catch (err) {
                    console.log('[TEST DISPLAY] Error on ' + portName + ' @ ' + baud + ': ' + err.message);
                }
            } else {
                // Fallback: fs mode (configure with `mode` command first)
                try {
                    require('child_process').execSync(
                        'mode ' +
                            portName +
                            ': BAUD=' +
                            baud +
                            ' PARITY=N DATA=8 STOP=1 to=off xon=off odsr=off octs=off dtr=on rts=on',
                        { stdio: 'pipe' }
                    );
                    fd = fs.openSync(path, 'r+');
                    try {
                        fs.writeSync(fd, buf, 0, buf.length, null);
                        console.log('[TEST DISPLAY] Test sent to ' + portName + ' @ ' + baud + ' (fs mode)');
                    } finally {
                        fs.closeSync(fd);
                    }
                } catch (err) {
                    console.log('[TEST DISPLAY] fs mode failed on ' + portName + ' @ ' + baud + ': ' + err.message);
                }
            }

            // Brief pause between baud rates so the display has time to process
            await new Promise(function (resolve) {
                setTimeout(resolve, 300);
            });
        }
    }
    console.log('[TEST DISPLAY] Scan complete — check which port+baud showed text on the LCD');
});

// Barcode scanner support is handled entirely in the renderer via the
// useBarcodeScanner keydown hook. It works in the Electron window like any
// browser, and it correctly ignores focused input fields, so no duplicate
// main-process aggregation is needed here.
