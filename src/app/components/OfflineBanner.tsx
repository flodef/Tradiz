'use client';

import { FC, useEffect, useState } from 'react';
import { useWindowParam } from '../hooks/useWindowParam';
import { WifiOffIcon } from '../images/WifiOffIcon';
import { useIsMobile } from '../utils/mobile';

export const OfflineBanner: FC = () => {
    const { isOnline } = useWindowParam();
    const isMobile = useIsMobile();
    const [dismissed, setDismissed] = useState(false);

    // Re-show banner when going offline again
    useEffect(() => {
        if (!isOnline) setDismissed(false);
    }, [isOnline]);

    if (isOnline || dismissed) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md md:text-base">
            <div className="flex items-center justify-center gap-2 w-full">
                <WifiOffIcon className="h-4 w-4 shrink-0 md:h-5 md:w-5" />
                <span>
                    {isMobile ? 'Application hors ligne' : 'Application hors ligne — Vérifiez votre connexion internet'}
                </span>
            </div>
            <button
                onClick={() => setDismissed(true)}
                className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-2xl font-bold cursor-pointer text-white/80 hover:text-white hover:bg-red-700 transition-colors"
                aria-label="Fermer"
            >
                ✕
            </button>
        </div>
    );
};
