'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isSiteRoutePathname } from '../utils/scriptUtils';

/**
 * siteThemeScript only runs on full document loads. On a client-side
 * navigation from a public site page to a POS page (e.g. the "retour" link on
 * a storefront 404), `data-site-route` and `site-dark` would linger on <html>
 * and kill the POS body background — this removes them.
 */
export function SiteRouteCleanup({ publicSiteHost }: { publicSiteHost: string }) {
    const pathname = usePathname();
    useEffect(() => {
        if (isSiteRoutePathname(pathname, window.location.hostname, publicSiteHost)) return;
        const root = document.documentElement;
        root.removeAttribute('data-site-route');
        root.classList.remove('site-dark');
    }, [pathname, publicSiteHost]);
    return null;
}
