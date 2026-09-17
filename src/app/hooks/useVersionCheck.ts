import { useState, useEffect } from 'react';
import { deviceFetchIfKnown } from '@/app/utils/deviceFetch';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const VERSION_CHECK_KEY = 'version_check_time';

// Version embedded at build time from package.json - stable, available synchronously
const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

export function useVersionCheck() {
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        const checkVersion = async () => {
            const now = Date.now();
            try {
                // Throttle on a synchronous localStorage read — a state value
                // hydrated in another effect would still hold the default on
                // this first pass, so every mount would re-check. Persist the
                // timestamp before fetching too: if a version mismatch below
                // triggers a page reload, the next mount must see it.
                const last = Number(localStorage.getItem(VERSION_CHECK_KEY) ?? 0);
                if (last && now - last < CHECK_INTERVAL - 10000) return;
                localStorage.setItem(VERSION_CHECK_KEY, JSON.stringify(now));
            } catch {
                // localStorage unavailable — check anyway.
            }

            try {
                const response = await deviceFetchIfKnown('/api/version');
                if (response.ok) {
                    const data = await response.json();
                    // Only flag an update when both versions are known and genuinely differ.
                    // Compare against the build-time constant (not state) to avoid a false
                    // positive on first mount that would trigger an infinite reload loop.
                    if (data.version) {
                        setLatestVersion(data.version);
                        setUpdateAvailable(data.version !== CURRENT_VERSION);
                    }
                }
            } catch (error) {
                console.error('Failed to check version:', error);
            }
        };

        // Check immediately on mount
        checkVersion();

        // Poll periodically
        const interval = setInterval(checkVersion, CHECK_INTERVAL);

        return () => clearInterval(interval);
    }, []);

    return { currentVersion: CURRENT_VERSION, latestVersion, updateAvailable };
}
