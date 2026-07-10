import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/app/utils/localStorage';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const VERSION_CHECK_KEY = 'version_check_time';

// Version embedded at build time from package.json - stable, available synchronously
const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

export function useVersionCheck() {
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useLocalStorage<number | null>(VERSION_CHECK_KEY, null);

    useEffect(() => {
        const checkVersion = async () => {
            // Check if we've already checked recently
            const now = Date.now();
            if (lastCheckTime && now - lastCheckTime < CHECK_INTERVAL - 10000) return;

            try {
                const response = await fetch('/api/version');
                if (response.ok) {
                    const data = await response.json();
                    setLastCheckTime(now);
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
    }, [lastCheckTime, setLastCheckTime]);

    return { currentVersion: CURRENT_VERSION, latestVersion, updateAvailable };
}
