import { Inter } from 'next/font/google';
import { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import './globals.css';
import { USE_DIGICARTE } from './utils/constants';
import { conditionalManifestScript, preloadedThemeScript } from './utils/scriptUtils';
import { VersionChecker } from './components/VersionChecker';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'Tradiz',
    description: 'Caisse enregistreuse merveilleuse',
    icons: {
        icon: '/icons/favicon.ico',
        shortcut: '/icons/favicon.ico',
        apple: '/icons/favicon.ico',
    },
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="fr" data-theme-ready="0" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: preloadedThemeScript() }} />
                <script dangerouslySetInnerHTML={{ __html: conditionalManifestScript(USE_DIGICARTE) }} />
                <noscript>
                    <style>{`html[data-theme-ready="0"] body { visibility: visible; }`}</style>
                </noscript>
            </head>
            <body
                className={twMerge(
                    inter.className,
                    'text-writing-light dark:text-writing-dark',
                    'bg-linear-to-tr from-main-from-light to-main-to-light dark:from-main-from-dark dark:to-main-to-dark'
                )}
            >
                {children}
                <VersionChecker />
            </body>
        </html>
    );
}
