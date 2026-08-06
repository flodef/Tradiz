'use client';

import { FC, useEffect } from 'react';
import { usePopup } from '../hooks/usePopup';
import { LoadingDot } from '../loading';

export const UpdateListener: FC = () => {
    const { openPopup, closePopup } = usePopup();

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onUpdateAvailable || !api?.respondUpdate) return;

        const cleanupAvailable = api.onUpdateAvailable(() => {
            openPopup('Mise à jour disponible', ['Installer', 'Plus tard'], (index) => {
                if (index === 0) {
                    openPopup(
                        'Téléchargement en cours…',
                        [<LoadingDot key="loading" fullscreen={false} />],
                        () => {},
                        true
                    );
                    api.respondUpdate('download');
                }
            });
        });

        return () => {
            cleanupAvailable?.();
        };
    }, [openPopup, closePopup]);

    return null;
};
