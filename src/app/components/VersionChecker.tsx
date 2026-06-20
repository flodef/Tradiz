'use client';

import { useVersionCheck } from '../hooks/useVersionCheck';

export function VersionChecker() {
    const { updateAvailable } = useVersionCheck();

    // Auto-reload when update is detected
    if (updateAvailable) {
        window.location.reload();
    }

    return null;
}
