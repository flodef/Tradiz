import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/app/utils/localStorage';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const VERSION_CHECK_KEY = 'version_check_time';

export function useVersionCheck() {
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [lastCheckTime, setLastCheckTime] = useLocalStorage<number | null>(VERSION_CHECK_KEY, null);

    useEffect(() => {
        // Get current version from package.json (embedded at build time)
        setCurrentVersion(process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0');

        const checkVersion = async () => {
            // Check if we've already checked recently
            const now = Date.now();
            if (lastCheckTime && now - lastCheckTime < CHECK_INTERVAL - 10000) return;

            try {
                const response = await fetch('/api/version');
                if (response.ok) {
                    const data = await response.json();
                    setLatestVersion(data.version);
                    setUpdateAvailable(data.version !== currentVersion);
                    setLastCheckTime(now);
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
    }, [currentVersion, lastCheckTime, setLastCheckTime]);

    return { currentVersion, latestVersion, updateAvailable };
}
