const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
console.log = function () {
    var msg = formatArgs(Array.prototype.slice.call(arguments));
    logStream.write('[INFO] ' + new Date().toISOString() + ' ' + msg + '\n');
    origLog.apply(console, arguments);
};
console.error = function () {
    var msg = formatArgs(Array.prototype.slice.call(arguments));
    logStream.write('[ERROR] ' + new Date().toISOString() + ' ' + msg + '\n');
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
    const configuredPort = process.env.TRADIZ_DISPLAY_PORT;

    // Try serialport module first (supports auto-detect)
    let SerialPort = null;
    try {
        SerialPort = require('serialport').SerialPort;
    } catch (err) {
        console.error('SerialPort module not available, using fs fallback:', err.message);
    }

    if (SerialPort) {
        // If a specific port is configured, use it directly
        if (configuredPort) {
            try {
                const port = new SerialPort({
                    path: configuredPort,
                    baudRate: parseInt(process.env.TRADIZ_DISPLAY_BAUDRATE || '9600', 10),
                    autoOpen: false,
                });
                await new Promise((resolve, reject) => {
                    port.open((err) => (err ? reject(err) : resolve()));
                });
                console.log('Customer display opened on ' + configuredPort + ' (serialport mode)');
                return port;
            } catch (err) {
                console.log('Could not open configured display port ' + configuredPort + ': ' + err.message);
            }
        }

        // Auto-detect: look for common POS display vendor IDs
        try {
            const ports = await SerialPort.list();
            const displayCandidates = ports.filter((p) => {
                const vendorId = (p.vendorId || '').toLowerCase();
                const manufacturer = (p.manufacturer || '').toLowerCase();
                return (
                    vendorId === '067b' || // Prolific
                    vendorId === '0403' || // FTDI
                    vendorId === '10c4' || // Silicon Labs CP210x
                    vendorId === '1a86' || // CH340
                    manufacturer.includes('prolific') ||
                    manufacturer.includes('ftdi') ||
                    manufacturer.includes('silicon labs') ||
                    manufacturer.includes('ch340')
                );
            });

            for (const candidate of displayCandidates) {
                try {
                    const port = new SerialPort({
                        path: candidate.path,
                        baudRate: 9600,
                        autoOpen: false,
                    });
                    await new Promise((resolve, reject) => {
                        port.open((err) => (err ? reject(err) : resolve()));
                    });
                    console.log('Customer display auto-detected on ' + candidate.path);
                    return port;
                } catch {
                    // try next candidate
                }
            }
        } catch (err) {
            console.log('Serial port listing failed: ' + err.message);
        }
    }

    // Fallback: use fs to open COM port directly (Windows only)
    // Only use the explicitly configured port — scanning all COM ports
    // would grab the thermal printer's port and send display commands to it.
    if (configuredPort) {
        if (openComPort(configuredPort)) return { _fsMode: true };
    }

    return null;
}

function writeToDisplay(line1, line2) {
    if (!displayPort) return;

    var init = DISPLAY_CMD.INIT;
    var l1 = Buffer.from(line1.slice(0, 20).padEnd(20, ' '), 'latin1');
    var crlf = Buffer.from([0x0d, 0x0a]);
    var l2 = Buffer.from(line2.slice(0, 20).padEnd(20, ' '), 'latin1');

    if (displayPort._fsMode) {
        // fs-based COM port write
        writeComPort(init);
        writeComPort(l1);
        writeComPort(crlf);
        writeComPort(l2);
        return;
    }

    // serialport module mode
    if (!displayPort.isOpen) return;

    displayPort.write(init, (err) => {
        if (err) console.error('Display write error (init):', err.message);
    });

    displayPort.write(l1, (err) => {
        if (err) console.error('Display write error (line1):', err.message);
    });

    displayPort.write(crlf, (err) => {
        if (err) console.error('Display write error (line feed):', err.message);
    });

    displayPort.write(l2, (err) => {
        if (err) console.error('Display write error (line2):', err.message);
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

  .loading-text { margin-top: 48px; font-size: 13px; color: #92400e; text-align: center; transition: opacity 0.5s ease; }
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

    // Watchdog: close splash after 60s no matter what, so it never becomes permanent.
    splashWatchdog = setTimeout(function () {
        console.error('Splash watchdog: closing splash after 60s timeout');
        closeSplashScreen();
    }, 60000);
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
        return Promise.reject(new Error('Server file not found: ' + serverPath));
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
        var maxAttempts = 60;
        var checkReady = function () {
            if (rejected) return;
            if (!serverProcess) {
                rejected = true;
                reject(new Error('Server process exited before becoming ready. Output:\n' + serverOutput.join('\n')));
                return;
            }
            var settled = false;
            var req = http.get('http://localhost:' + PORT + '/', function () {
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

function initAutoUpdater() {
    // Auto-updater works in packaged builds with electron-updater available.
    if (!autoUpdater || isDev) return;

    try {
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('update-available', (info) => {
            dialog
                .showMessageBox(mainWindow || undefined, {
                    type: 'info',
                    title: 'Mise à jour disponible',
                    message: `Une nouvelle version de Tradiz (${info.version}) est disponible.`,
                    detail: "Voulez-vous la télécharger et l'installer maintenant ?",
                    buttons: ['Oui', 'Plus tard'],
                    defaultId: 0,
                    cancelId: 1,
                })
                .then(({ response }) => {
                    if (response === 0) {
                        autoUpdater.downloadUpdate().catch((err) => {
                            console.error('Auto-updater download failed:', err.message);
                        });
                    }
                });
        });

        autoUpdater.on('update-downloaded', () => {
            dialog
                .showMessageBox(mainWindow || undefined, {
                    type: 'info',
                    title: 'Mise à jour prête',
                    message: 'La mise à jour a été téléchargée.',
                    detail: "L'application va redémarrer pour installer la mise à jour.",
                    buttons: ['Redémarrer maintenant'],
                    defaultId: 0,
                })
                .then(() => {
                    autoUpdater.quitAndInstall(true, true);
                });
        });

        autoUpdater.on('error', (err) => {
            console.error('Auto-updater error:', err.message);
        });

        // Delay check so it doesn't interfere with app startup
        setTimeout(() => {
            autoUpdater.checkForUpdates().catch((err) => {
                console.error('Auto-updater check failed:', err.message);
            });
        }, 5000);
    } catch (err) {
        console.error('Auto-updater init failed:', err.message);
    }
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

        mainWindow.webContents
            .executeJavaScript(
                '(function () {' +
                    '  if (window.__tradizTouchScroll) return;' +
                    '  window.__tradizTouchScroll = true;' +
                    '  var target = null, startX = 0, startY = 0, startScrollTop = 0, startScrollLeft = 0;' +
                    '  function isAdmin() {' +
                    '    return /(^|/)admin(/|$)/.test(window.location.pathname);' +
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

// Barcode scanner support is handled entirely in the renderer via the
// useBarcodeScanner keydown hook. It works in the Electron window like any
// browser, and it correctly ignores focused input fields, so no duplicate
// main-process aggregation is needed here.
