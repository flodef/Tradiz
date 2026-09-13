'use client';

import { ReactNode, useEffect, useState } from 'react';
import { deviceFetch } from '@/app/utils/deviceFetch';
import Loading from '@/app/loading';

/**
 * Level-0 device gate for admin pages: probes /api/sql/whoami and renders
 * the page only for a device whose public key is registered (any role — the
 * per-page role checks still apply). Unknown devices get an access-denied
 * screen; a network/DB failure fails closed.
 */
export default function DeviceGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking');

    useEffect(() => {
        deviceFetch('/api/sql/whoami')
            .then((r) => setState(r.ok ? 'ok' : 'denied'))
            .catch(() => setState('denied'));
    }, []);

    if (state === 'checking') return <Loading fullscreen />;
    if (state === 'denied') {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                    <p className="text-red-800 dark:text-red-200">
                        <strong>Accès refusé :</strong> cet appareil n'est pas enregistré ou le serveur est injoignable.
                    </p>
                </div>
            </div>
        );
    }
    return <>{children}</>;
}
