'use client';

import { useEffect } from 'react';
import { useVersionCheck } from '../hooks/useVersionCheck';

export function VersionChecker() {
    const { updateAvailable } = useVersionCheck();

    // Auto-reload when a genuine update is detected (in an effect, never during render)
    useEffect(() => {
        if (updateAvailable) {
            window.location.reload();
        }
    }, [updateAvailable]);

    return null;
}
