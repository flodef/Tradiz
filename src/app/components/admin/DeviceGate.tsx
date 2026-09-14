'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { deviceFetch } from '@/app/utils/deviceFetch';
import { useConfig } from '@/app/hooks/useConfig';
import { Role } from '@/app/utils/interfaces';
import { UserSwitchPopup } from '@/app/components/UserSwitchPopup';
import Loading from '@/app/loading';

/**
 * Device gate for admin pages: probes /api/sql/whoami and renders the page
 * only for a device whose public key is registered. Unknown devices get an
 * access-denied screen; a network/DB failure fails closed.
 *
 * When the shop enables `requireUserAuth`, the device key alone is not
 * enough for admin pages — the gate then asks for an admin user's PIN
 * (UserSwitchPopup filtered to Admin users with a PIN), which creates a
 * user session bound to this device.
 */
export default function DeviceGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<'checking' | 'ok' | 'denied' | 'auth-required'>('checking');
    const { users } = useConfig();

    const probe = useCallback(() => {
        deviceFetch('/api/sql/whoami')
            .then(async (r) => {
                if (!r.ok) return setState('denied');
                const body = (await r.json()) as { admin?: boolean; requiresUserAuth?: boolean };
                setState(body.admin || !body.requiresUserAuth ? 'ok' : 'auth-required');
            })
            .catch(() => setState('denied'));
    }, []);

    useEffect(() => {
        probe();
    }, [probe]);

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
    if (state === 'auth-required') {
        const hasPinAdmin = users.some((u) => u.role === Role.admin && u.hasPin);
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="w-full max-w-md rounded-xl bg-popup-light dark:bg-popup-dark shadow-lg p-4">
                    <h2 className="text-lg font-semibold mb-1 text-popup-dark dark:text-popup-light">
                        Authentification administrateur
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        {hasPinAdmin
                            ? 'Sélectionnez un administrateur et entrez son code PIN.'
                            : "Aucun utilisateur Admin n'a de PIN — configurez-en un depuis un appareil autorisé."}
                    </p>
                    <UserSwitchPopup roleFilter={Role.admin} requirePin onSelect={probe} />
                </div>
            </div>
        );
    }
    return <>{children}</>;
}
