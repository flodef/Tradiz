'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { UpdateScreen, UpdateStep } from './UpdateScreen';

export const UpdateListener: FC = () => {
    const [updateStep, setUpdateStep] = useState<UpdateStep | null>(null);
    const [updateVersion, setUpdateVersion] = useState<string | undefined>();

    const handleAccept = useCallback(() => {
        const api = window.electronAPI;
        if (!api?.respondUpdate) return;
        setUpdateStep('downloading');
        api.respondUpdate('download');
    }, []);

    const handleDismiss = useCallback(() => {
        setUpdateStep(null);
    }, []);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onUpdateAvailable || !api?.respondUpdate) return;

        // Query for any pending update that was detected before this listener mounted
        api.getPendingUpdate?.();

        const cleanupAvailable = api.onUpdateAvailable((info: { version: string }) => {
            setUpdateVersion(info?.version);
            setUpdateStep('available');
        });

        const cleanupDownloaded = api.onUpdateDownloaded?.(() => {
            // Show "Installation en cours…" briefly, then auto-restart
            setUpdateStep('installing');
            setTimeout(() => {
                setUpdateStep('restarting');
                api.respondUpdate('install');
            }, 2000);
        });

        return () => {
            cleanupAvailable?.();
            cleanupDownloaded?.();
        };
    }, []);

    if (!updateStep) return null;

    return <UpdateScreen step={updateStep} version={updateVersion} onAccept={handleAccept} onDismiss={handleDismiss} />;
};
