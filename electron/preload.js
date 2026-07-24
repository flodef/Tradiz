const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    openMiniDisplay: () => ipcRenderer.send('open-mini-display'),
    closeMiniDisplay: () => ipcRenderer.send('close-mini-display'),
    sendToMini: (data) => ipcRenderer.send('send-to-mini', data),
    onMiniMessage: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('mini-message', handler);
        return () => ipcRenderer.removeListener('mini-message', handler);
    },
    onBarcodeScan: (callback) => {
        const handler = (_event, code) => callback(code);
        ipcRenderer.on('barcode-scan', handler);
        return () => ipcRenderer.removeListener('barcode-scan', handler);
    },
});
