'use client';

import { FC, useEffect } from 'react';
import { usePopup } from '../hooks/usePopup';

export const UpdateListener: FC = () => {
    const { openFullscreenPopup, closePopup } = usePopup();

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onUpdateAvailable || !api?.respondUpdate) return;

        // Query for any pending update that was detected before this listener mounted
        api.getPendingUpdate?.();

        const cleanupAvailable = api.onUpdateAvailable(() => {
            openFullscreenPopup('Mise à jour disponible', ['Installer', 'Plus tard'], (index) => {
                if (index === 0) {
                    openFullscreenPopup(
                        'Mise à jour',
                        [
                            <div key="msg" className="text-xl text-center py-4">
                                Téléchargement en cours…
                            </div>,
                        ],
                        () => {},
                        true
                    );
                    api.respondUpdate('download');
                }
            });
        });

        const cleanupDownloaded = api.onUpdateDownloaded?.(() => {
            openFullscreenPopup(
                'Mise à jour',
                [
                    <div key="msg" className="text-xl text-center py-4">
                        Installation en cours…
                    </div>,
                ],
                () => {},
                true
            );
            setTimeout(() => {
                openFullscreenPopup('Mise à jour prête', ['Redémarrer maintenant'], () => {
                    api.respondUpdate('install');
                });
            }, 2000);
        });

        return () => {
            cleanupAvailable?.();
            cleanupDownloaded?.();
        };
    }, [openFullscreenPopup, closePopup]);

    return null;
};
