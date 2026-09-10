'use client'; // Error components must be Client Components

// inspired by https://codepen.io/altreiter/pen/EedZRQ
import Link from 'next/link';
import { useEffect } from 'react';
import { CloseButton } from './components/CloseButton';
import './globals.css';
import { DEV_EMAIL } from './utils/constants';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    // Auto-update recovery: check for updates, download, and install automatically
    // since the user is stuck on a 500 error and can't use the app.
    useEffect(() => {
        if (typeof window === 'undefined' || !window.electronAPI) return;
        const api = window.electronAPI;

        // Trigger a fresh update check immediately
        api.checkForUpdates?.();

        // When an update is detected, auto-start the download
        const cleanupAvailable = api.onUpdateAvailable?.(() => {
            api.respondUpdate('download');
        });

        // When download completes, auto-install immediately
        const cleanupDownloaded = api.onUpdateDownloaded?.(() => {
            api.respondUpdate('install');
        });

        // Retry check every 60s in case the first check failed
        const interval = setInterval(() => {
            api.checkForUpdates?.();
        }, 60000);

        return () => {
            cleanupAvailable?.();
            cleanupDownloaded?.();
            clearInterval(interval);
        };
    }, []);

    const retry = () => setTimeout(reset, 1000);
    const reload = () => {
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.checkForUpdates?.();
        }
        setTimeout(() => location.reload(), 2000);
    };

    return (
        <div className="font-sans">
            {typeof window !== 'undefined' && window.electronAPI?.closeApp && (
                <div className="fixed top-4 right-4 z-20">
                    <CloseButton
                        onClose={() => window.electronAPI?.closeApp()}
                        size="xl"
                        className="text-secondary-light dark:text-secondary-dark"
                    />
                </div>
            )}
            <div
                className={
                    'w-screen h-screen overflow-hidden flex flex-col items-center justify-center font-bold ' +
                    'uppercase text-[3vmin] text-center text-secondary-light dark:text-secondary-dark ' +
                    'bg-linear-to-tr from-main-from-light to-main-to-light dark:from-main-from-dark dark:to-main-to-dark'
                }
            >
                <p className="px-6 z-10">
                    Oups ! L'appli s'est emmelée les pinceaux ... <br />
                    Merci de me le signaler à{' '}
                    <Link target="_blank" href={`mailto:${DEV_EMAIL}?subject=Erreur innatendue sur ${window.location}`}>
                        {DEV_EMAIL}
                    </Link>
                </p>
                <div className="error-500 group z-0">
                    <h1 className="internal" onClick={retry}>
                        <span className="five">5</span>
                        <span className="zero">0</span>
                        <span className="zero">0</span>
                    </h1>
                    <p className="px-6 cursor-pointer" onClick={reload}>
                        Recharger la page
                    </p>
                </div>
            </div>
        </div>
    );
}
