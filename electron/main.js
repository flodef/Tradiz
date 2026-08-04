const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Redirect console output to a log file for debugging on POS hardware.
const logFilePath = path.join(app.getPath('userData'), 'tradiz.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
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
} catch {
    console.log('electron-updater not available, auto-updates disabled');
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

async function findDisplayPort() {
    let SerialPort;
    try {
        SerialPort = require('serialport');
    } catch {
        console.log('SerialPort module not available, customer display disabled');
        return null;
    }

    // If a specific port is configured, use it directly
    const configuredPort = process.env.TRADIZ_DISPLAY_PORT;
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
            console.log(`Customer display opened on ${configuredPort}`);
            return port;
        } catch (err) {
            console.log(`Could not open configured display port ${configuredPort}: ${err.message}`);
            return null;
        }
    }

    // Auto-detect: look for common POS display vendor IDs
    try {
        const ports = await SerialPort.list();
        // Common POS customer display patterns: USB serial adapters, COM ports with "Prolific", "FTDI", "Silicon Labs"
        const displayCandidates = ports.filter((p) => {
            const vendorId = (p.vendorId || '').toLowerCase();
            const manufacturer = (p.manufacturer || '').toLowerCase();
            // Common USB-to-serial chips used in POS displays
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
                console.log(`Customer display auto-detected on ${candidate.path}`);
                return port;
            } catch {
                // try next candidate
            }
        }
    } catch (err) {
        console.log(`Serial port listing failed: ${err.message}`);
    }

    return null;
}

function writeToDisplay(line1, line2) {
    if (!displayPort || !displayPort.isOpen) return;

    // Clear screen and home cursor
    displayPort.write(DISPLAY_CMD.INIT, (err) => {
        if (err) console.error('Display write error (init):', err.message);
    });

    // Write line 1 (padded to 20 chars)
    displayPort.write(line1.slice(0, 20).padEnd(20, ' '), (err) => {
        if (err) console.error('Display write error (line1):', err.message);
    });

    // Move to line 2 — CR + LF works on most 2-line displays
    displayPort.write(Buffer.from([0x0d, 0x0a]), (err) => {
        if (err) console.error('Display write error (line feed):', err.message);
    });

    // Write line 2 (padded to 20 chars)
    displayPort.write(line2.slice(0, 20).padEnd(20, ' '), (err) => {
        if (err) console.error('Display write error (line2):', err.message);
    });
}

async function initDisplay() {
    displayPort = await findDisplayPort();
    if (displayPort) {
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
                const value = trimmed
                    .slice(eqIndex + 1)
                    .trim()
                    .replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
            console.log(`Loaded env from: ${envPath}`);
            break;
        }
    }
}

const PORT = 3001;
const DEV_URL = `http://localhost:${PORT}`;

let mainWindow;
let miniWindow;

const isDev = !app.isPackaged;

function startServer() {
    if (isDev) {
        return Promise.resolve();
    }

    const standaloneDir = path.join(process.resourcesPath, 'standalone');
    const serverPath = path.join(standaloneDir, 'server.js');

    if (!fs.existsSync(serverPath)) {
        return Promise.reject(new Error('Server file not found: ' + serverPath));
    }

    process.chdir(standaloneDir);
    process.env.NODE_ENV = 'production';
    process.env.PORT = String(PORT);

    // Ensure require resolves modules from the standalone directory, not electron/.
    var standaloneNodeModules = path.join(standaloneDir, 'node_modules');
    if (fs.existsSync(standaloneNodeModules)) {
        module.paths.unshift(standaloneNodeModules);
    }

    console.log('Starting standalone server from: ' + standaloneDir);
    console.log('Standalone node_modules: ' + standaloneNodeModules);
    console.log('Exists node_modules/next: ' + fs.existsSync(path.join(standaloneNodeModules, 'next')));

    return new Promise(function (resolve, reject) {
        try {
            // The standalone server bundle starts listening immediately.
            require(serverPath);
            // Give the server a moment to bind before loading the UI.
            setTimeout(resolve, 2000);
        } catch (err) {
            reject(err);
        }
    });
}

function loadWithRetry(window, url, attempts = 30) {
    return new Promise((resolve, reject) => {
        const http = require('http');
        const tryLoad = (remaining) => {
            const req = http
                .get(url, (_res) => {
                    req.destroy();
                    window.loadURL(url).then(resolve).catch(reject);
                })
                .on('error', () => {
                    req.destroy();
                    if (remaining > 0) {
                        setTimeout(() => tryLoad(remaining - 1), 500);
                    } else {
                        reject(new Error(`Could not connect to ${url}`));
                    }
                });
            req.setTimeout(1000, () => {
                req.destroy();
                if (remaining > 0) {
                    setTimeout(() => tryLoad(remaining - 1), 500);
                } else {
                    reject(new Error(`Could not connect to ${url}`));
                }
            });
        };
        tryLoad(attempts);
    });
}

function initAutoUpdater() {
    // Auto-updater only works in packaged Windows builds with electron-updater available.
    if (!autoUpdater || isDev || process.platform !== 'win32') return;

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
                    autoUpdater.downloadUpdate();
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

    autoUpdater.checkForUpdates().catch((err) => {
        console.error('Auto-updater check failed:', err.message);
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
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Show the window immediately even before content loads.
    mainWindow.show();
    mainWindow.focus();

    const targetUrl = DEV_URL;
    loadWithRetry(mainWindow, targetUrl).catch((err) => {
        console.error('Failed to load application:', err.message);
        dialog.showErrorBox(
            'Erreur de chargement Tradiz',
            `Impossible de charger l'application.\n\nURL: ${targetUrl}\nErreur: ${err.message}\n\nVérifiez que le serveur a bien démarré.`
        );
    });

    // Open DevTools in dev mode for debugging.
    if (isDev) {
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
    });
}

function createMiniWindow() {
    if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.focus();
        return;
    }

    const displays = screen.getAllDisplays();
    const external = displays.find((d) => d.bounds.x !== 0 || d.bounds.y !== 0);
    const display = external || displays[0];

    miniWindow = new BrowserWindow({
        x: display.bounds.x + 50,
        y: display.bounds.y + 50,
        width: 800,
        height: 600,
        title: 'Tradiz - Afficheur client',
        parent: mainWindow,
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

    console.log('Tradiz starting...');
    console.log(`isDev: ${isDev}, isPackaged: ${app.isPackaged}`);
    console.log(`TRADIZ_FULLSCREEN: ${process.env.TRADIZ_FULLSCREEN}`);
    console.log(`resourcesPath: ${process.resourcesPath || 'N/A'}`);

    try {
        await startServer();
        console.log('Server started successfully');
    } catch (err) {
        console.error('Failed to start server:', err);
        dialog.showErrorBox(
            'Erreur de démarrage Tradiz',
            `Le serveur n'a pas pu démarrer.\n\nErreur: ${err.message}\n\nStandalone dir: ${path.join(process.resourcesPath || 'N/A', 'standalone')}`
        );
    }

    console.log('Creating main window...');
    createMainWindow();
    initAutoUpdater();
    initDisplay();
    console.log('App initialized');

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
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
