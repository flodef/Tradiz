'use client';

import { useEffect } from 'react';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { useConfig } from '../hooks/useConfig';

export function VersionChecker() {
    const { updateAvailable } = useVersionCheck();
    const { deviceId } = useConfig();

    // Log software version to NF525 audit trail (only once per browser session)
    useEffect(() => {
        if (sessionStorage.getItem('nf525_version_logged')) return;
        fetch('/api/sql/logSoftwareVersion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
        })
            .then((res) => {
                if (res.ok) sessionStorage.setItem('nf525_version_logged', '1');
            })
            .catch(() => {});
    }, [deviceId]);

    // Auto-reload when a genuine update is detected (in an effect, never during render)
    useEffect(() => {
        if (updateAvailable) window.location.reload();
    }, [updateAvailable]);

    return null;
}
