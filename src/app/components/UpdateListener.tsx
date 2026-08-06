'use client';

import { FC, useEffect, useRef } from 'react';
import { usePopup } from '../hooks/usePopup';

interface UpdateInfo {
    version: string;
}

interface ElectronUpdateAPI {
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
    respondUpdate: (action: string) => void;
}

export const UpdateListener: FC = () => {
    const { openPopup, closePopup, updatePopup } = usePopup();
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const api = (window as { electronAPI?: ElectronUpdateAPI }).electronAPI;
        if (!api) return;

        const startCountdown = () => {
            let seconds = 10;
            updatePopup(
                'Redémarrage dans 10 s',
                ["L'application va redémarrer pour installer la mise à jour.", 'Annuler'],
                (index) => {
                    if (index === 1 && countdownRef.current) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                        closePopup();
                    }
                }
            );

            countdownRef.current = setInterval(() => {
                seconds--;
                if (seconds <= 0) {
                    if (countdownRef.current) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                    }
                    api.respondUpdate('install');
                } else {
                    updatePopup(
                        `Redémarrage dans ${seconds} s`,
                        ["L'application va redémarrer pour installer la mise à jour.", 'Annuler'],
                        (index) => {
                            if (index === 1 && countdownRef.current) {
                                clearInterval(countdownRef.current);
                                countdownRef.current = null;
                                closePopup();
                            }
                        }
                    );
                }
            }, 1000);
        };

        const cleanupAvailable = api.onUpdateAvailable((info) => {
            openPopup('Mise à jour disponible', [`Télécharger la v${info.version}`, 'Plus tard'], (index) => {
                if (index === 0) {
                    api.respondUpdate('download');
                }
            });
        });

        const cleanupDownloaded = api.onUpdateDownloaded((info) => {
            openPopup('Mise à jour prête', [`Installer la v${info.version} maintenant`, 'Plus tard'], (index) => {
                if (index === 0) {
                    startCountdown();
                }
            });
        });

        return () => {
            cleanupAvailable?.();
            cleanupDownloaded?.();
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
            }
        };
    }, [openPopup, closePopup, updatePopup]);

    return null;
};
