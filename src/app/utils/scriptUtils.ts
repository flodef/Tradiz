import { CONFIG_KEYWORD } from './constants';

/**
 * Generates the manifest injection script based on whether Digicarte mode is enabled.
 * In Digicarte mode, no script is injected to prevent 401 fetch errors.
 *
 * @param useDigicarte - Whether Digicarte mode is enabled
 * @returns The script string (empty if Digicarte mode is enabled)
 */
export function conditionalManifestScript(useDigicarte: boolean): string {
    return useDigicarte
        ? ''
        : `(function () {
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
}

/**
 * Generates the preloaded theme script that reads config from localStorage and applies CSS variables.
 * This script runs before React hydration to prevent FOUC (Flash of Unstyled Content).
 *
 * @returns The script string
 */
export function preloadedThemeScript(): string {
    return `(function () {
    var root = document.documentElement;
    var applied = false;

    try {
        var raw = window.localStorage.getItem('${CONFIG_KEYWORD}');
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
}
