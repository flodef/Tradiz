declare module '*module.css' {
    const styles: {
        [className: string]: string;
    };
    export default styles;
}

interface ElectronAPI {
    platform: string;
    openMiniDisplay: () => void;
    closeMiniDisplay: () => void;
    closeApp: () => void;
    getPublicKey: () => Promise<string | null>;
    setPublicKey: (key: string) => Promise<void>;
    sendToMini: (data: unknown) => void;
    onMiniMessage: (callback: (data: unknown) => void) => () => void;
    sendCustomerDisplay: (payload: { line1: string; line2: string }) => void;
    testDisplay: (params?: { port: string; baud: number }) => void;
    onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
    onUpdateDownloaded: (callback: () => void) => () => void;
    respondUpdate: (response: string) => void;
    checkForUpdates: () => void;
    getPendingUpdate: () => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export {};
