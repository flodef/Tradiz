const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    openMiniDisplay: () => ipcRenderer.send('open-mini-display'),
    closeMiniDisplay: () => ipcRenderer.send('close-mini-display'),
    closeApp: () => ipcRenderer.send('close-app'),
    getPublicKey: () => ipcRenderer.invoke('get-public-key'),
    setPublicKey: (key) => ipcRenderer.invoke('set-public-key', key),
    sendToMini: (data) => ipcRenderer.send('send-to-mini', data),
    onMiniMessage: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('mini-message', handler);
        return () => ipcRenderer.removeListener('mini-message', handler);
    },
    sendCustomerDisplay: (payload) => ipcRenderer.send('customer-display', payload),
});
