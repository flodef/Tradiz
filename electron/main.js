const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const PORT = 3001;
const DEV_URL = `http://localhost:${PORT}`;

let mainWindow;
let miniWindow;
let scannerBuffer = '';
let scannerTimer = null;

const isDev = !app.isPackaged;

function startServer() {
    if (isDev) {
        return Promise.resolve();
    }

    const standaloneDir = path.join(process.resourcesPath, 'standalone');
    const serverPath = path.join(standaloneDir, 'server.js');

    process.chdir(standaloneDir);
    process.env.NODE_ENV = 'production';

    return new Promise((resolve, reject) => {
        try {
            // The standalone server bundle starts listening immediately.
            require(serverPath);
            // Give the server a moment to bind before loading the UI.
            setTimeout(resolve, 1500);
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
    // Auto-updater only works in packaged Windows builds.
    if (isDev || process.platform !== 'win32') return;

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
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'Tradiz',
        icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const targetUrl = DEV_URL;
    loadWithRetry(mainWindow, targetUrl).catch((err) => {
        console.error('Failed to load application:', err.message);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (miniWindow && !miniWindow.isDestroyed()) {
            miniWindow.close();
        }
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
    try {
        await startServer();
        createMainWindow();
        initAutoUpdater();
    } catch (err) {
        console.error('Failed to start server:', err);
    }

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

// Global barcode scanner support: most scanners emulate a keyboard and send
// digits very quickly, ending with Enter. We aggregate consecutive key events
// and forward the scanned string to the renderer when Enter is pressed.
function handleBeforeInput(input, window) {
    if (!window || window.isDestroyed()) return;

    if (input.type === 'keyDown') {
        const isDigit = input.key >= '0' && input.key <= '9';
        const isEnter = input.key === 'Enter';

        if (isDigit) {
            scannerBuffer += input.key;
            if (scannerTimer) clearTimeout(scannerTimer);
            scannerTimer = setTimeout(() => {
                scannerBuffer = '';
            }, 100);
        } else if (isEnter) {
            if (scannerTimer) clearTimeout(scannerTimer);
            if (scannerBuffer.length >= 5) {
                window.webContents.send('barcode-scan', scannerBuffer);
            }
            scannerBuffer = '';
        } else {
            // Any non-digit, non-Enter key resets the buffer.
            if (scannerTimer) clearTimeout(scannerTimer);
            scannerBuffer = '';
        }
    }
}

app.on('browser-window-created', (_event, window) => {
    window.webContents.on('before-input-event', (_event, input) => {
        handleBeforeInput(input, window);
    });
});
