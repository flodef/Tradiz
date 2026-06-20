import { useState, useEffect } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

export function useVersionCheck() {
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [updateAvailable, setUpdateAvailable] = useState(false);

    useEffect(() => {
        // Get current version from package.json (embedded at build time)
        setCurrentVersion(process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0');

        const checkVersion = async () => {
            try {
                const response = await fetch('/api/version');
                if (response.ok) {
                    const data = await response.json();
                    setLatestVersion(data.version);
                    setUpdateAvailable(data.version !== currentVersion);
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
    }, [currentVersion]);

    return { currentVersion, latestVersion, updateAvailable };
}
