'use client';

import { FC, useEffect } from 'react';
import { usePopup } from '../hooks/usePopup';
import { LoadingDot } from '../loading';

interface UpdateInfo {
    version: string;
}

interface ElectronUpdateAPI {
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    respondUpdate: (action: string) => void;
}

export const UpdateListener: FC = () => {
    const { openPopup, closePopup } = usePopup();

    useEffect(() => {
        const api = (window as { electronAPI?: ElectronUpdateAPI }).electronAPI;
        if (!api) return;

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
