'use client';

import { FC, useEffect } from 'react';
import { usePopup } from '../hooks/usePopup';
import { LoadingDot } from '../loading';

export const UpdateListener: FC = () => {
    const { openFullscreenPopup, closePopup } = usePopup();

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onUpdateAvailable || !api?.respondUpdate) return;

        const cleanupAvailable = api.onUpdateAvailable(() => {
            openFullscreenPopup('Mise à jour disponible', ['Installer', 'Plus tard'], (index) => {
                if (index === 0) {
                    openFullscreenPopup(
                        'Téléchargement en cours…',
                        [<LoadingDot key="loading" fullscreen={false} />],
                        () => {},
                        true
                    );
                    api.respondUpdate('download');
                }
            });
        });

        const cleanupDownloaded = api.onUpdateDownloaded?.(() => {
            openFullscreenPopup('Mise à jour prête', ['Redémarrer maintenant'], () => {
                api.respondUpdate('install');
            });
        });

        return () => {
            cleanupAvailable?.();
            cleanupDownloaded?.();
        };
    }, [openFullscreenPopup, closePopup]);

    return null;
};
