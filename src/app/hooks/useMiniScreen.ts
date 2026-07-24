'use client';

import { useCallback } from 'react';

export interface MiniScreenData {
    message?: string;
    total?: string;
    change?: string;
}

export function useMiniScreen() {
    const openMiniDisplay = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (window.electronAPI?.openMiniDisplay) {
            window.electronAPI.openMiniDisplay();
        } else {
            window.open('/mini', 'tradizMini', 'width=800,height=600,scrollbars=no');
        }
    }, []);

    const closeMiniDisplay = useCallback(() => {
        if (typeof window === 'undefined') return;
        if (window.electronAPI?.closeMiniDisplay) {
            window.electronAPI.closeMiniDisplay();
        }
    }, []);

    const sendToMini = useCallback((data: MiniScreenData | string) => {
        if (typeof window === 'undefined') return;

        if (window.electronAPI?.sendToMini) {
            window.electronAPI.sendToMini(data);
            return;
        }

        if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('tradiz-mini');
            channel.postMessage(data);
            channel.close();
        }
    }, []);

    return { openMiniDisplay, closeMiniDisplay, sendToMini };
}
