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
    sendToMini: (data: unknown) => void;
    onMiniMessage: (callback: (data: unknown) => void) => () => void;
    onBarcodeScan: (callback: (code: string) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export {};
