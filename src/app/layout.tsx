import { Inter } from 'next/font/google';
import { twMerge } from 'tailwind-merge';
import './globals.css';
import { ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'] });

const preloadedThemeScript = `(function () {
    var root = document.documentElement;
    var applied = false;

    try {
        var raw = window.localStorage.getItem('Config');
        if (!raw) return;

        var parsed = JSON.parse(raw);
        var colors = parsed && Array.isArray(parsed.colors) ? parsed.colors : null;
        if (!colors || colors.length < 7) return;

        var slots = [
            ['writing', 0],
            ['main-from', 1],
            ['main-to', 2],
            ['popup', 3],
            ['active', 4],
            ['secondary', 5],
            ['secondary-active', 6]
        ];

        for (var i = 0; i < slots.length; i++) {
            var name = slots[i][0];
            var index = slots[i][1];
            var light = colors[index] && colors[index].light;
            var dark = colors[index] && colors[index].dark;

            if (typeof light === 'string' && light) {
                root.style.setProperty('--' + name + '-light-color', light);
            }
            if (typeof dark === 'string' && dark) {
                root.style.setProperty('--' + name + '-dark-color', dark);
            }
        }
        applied = true;
    } catch (_) {
        // Ignore invalid cached config.
    } finally {
        if (applied) {
            root.setAttribute('data-theme-ready', '1');
        } else {
            setTimeout(function () {
                root.setAttribute('data-theme-ready', '1');
            }, 2000);
        }
    }
})();`;

const conditionalManifestScript = `(function () {
    try {
        var path = window.location.pathname || '';
        var pattern1 = new RegExp('/admin/tradiz/?$');
        var pattern2 = new RegExp('^/[^/]+/admin/tradiz/?$');
        var isLiteRoute = pattern1.test(path) || pattern2.test(path);
        if (isLiteRoute) return;

        if (!document.querySelector('link[rel="manifest"]')) {
            var link = document.createElement('link');
            link.rel = 'manifest';
            link.href = '/manifest.webmanifest';
            document.head.appendChild(link);
        }
    } catch (_) {
        // Ignore manifest injection failures.
    }
})();`;

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
                <script dangerouslySetInnerHTML={{ __html: preloadedThemeScript }} />
                <script dangerouslySetInnerHTML={{ __html: conditionalManifestScript }} />
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
            </body>
        </html>
    );
}
