import { NextRequest, NextResponse } from 'next/server';

const BASE_DOMAIN = 'tradiz.fr';
const LEGACY_HOST = `pos.${BASE_DOMAIN}`;
const PUBLIC_SITE_HOST = process.env.PUBLIC_SITE_HOST || `shop.${BASE_DOMAIN}`;
const LANDING_HOSTS = new Set([BASE_DOMAIN, `www.${BASE_DOMAIN}`]);

// Local dev hosts that should also get the clean-URL rewrite (/annette → /site/annette).
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// Reserved top-level paths that must never be treated as a shop ID.
const RESERVED_PATHS = new Set([
    'api',
    'admin',
    'stats',
    'site',
    'landing',
    'checkout',
    'mini',
    'icons',
    'fonts',
    '_next',
    'favicon.ico',
    'manifest.webmanifest',
]);

/**
 * Redirects legacy path-based shop URLs to subdomain-based URLs.
 * e.g. https://pos.tradiz.fr/annette        → https://annette.tradiz.fr/
 *      https://pos.tradiz.fr/annette/foo    → https://annette.tradiz.fr/foo
 *
 * Must NOT redirect API routes, Next.js internals, or static assets.
 */
function handleLegacyHost(request: NextRequest): NextResponse | null {
    const { hostname, pathname } = request.nextUrl;
    if (hostname !== LEGACY_HOST) return null;

    // Match /shopId or /shopId/rest/of/path
    const match = pathname.match(/^\/([^/]+)(\/.*)?$/);
    if (!match) return NextResponse.next();

    const [, shopSegment, rest = '/'] = match;
    if (RESERVED_PATHS.has(shopSegment.toLowerCase())) return NextResponse.next();

    // Validate shopSegment to prevent open redirect — only allow alphanumeric + hyphens
    if (!/^[a-z0-9-]+$/i.test(shopSegment)) return NextResponse.next();

    const { protocol, search } = request.nextUrl;
    const redirectUrl = `${protocol}//${shopSegment}.${BASE_DOMAIN}${rest}${search}`;
    return NextResponse.redirect(redirectUrl, { status: 301 });
}

/**
 * Rewrites the apex / www host (tradiz.fr, www.tradiz.fr) to the landing page:
 *   / → /landing
 *
 * Other paths (api, _next, etc.) are left untouched.
 */
function handleLandingHost(request: NextRequest): NextResponse | null {
    const { hostname, pathname, search } = request.nextUrl;
    if (!LANDING_HOSTS.has(hostname)) return null;

    // Only rewrite the root path to /landing; everything else passes through.
    if (pathname === '/') {
        const url = request.nextUrl.clone();
        url.pathname = '/landing';
        url.search = search;
        return NextResponse.rewrite(url);
    }

    return NextResponse.next();
}

/**
 * Rewrites clean URLs on the public storefront host (shop.tradiz.fr) to the
 * internal /site routes:
 *   /            → /site          (landing page listing all shops)
 *   /annette     → /site/annette  (individual shop catalogue)
 *   /gds         → /site/gds
 */
function handlePublicSiteHost(request: NextRequest): NextResponse | null {
    const { hostname, pathname, search } = request.nextUrl;
    const isLocal = LOCAL_HOSTS.has(hostname);
    if (hostname !== PUBLIC_SITE_HOST && !isLocal) return null;

    // Landing page: / → /site
    // On localhost, / is the POS app — don't rewrite it.
    if (pathname === '/' && !isLocal) {
        const url = request.nextUrl.clone();
        url.pathname = '/site';
        url.search = search;
        return NextResponse.rewrite(url);
    }

    // Shop page: /<shopId> → /site/<shopId>
    const match = pathname.match(/^\/([^/]+)(\/.*)?$/);
    if (match && !RESERVED_PATHS.has(match[1].toLowerCase())) {
        const shopId = match[1];
        // Validate shopId to prevent path traversal — only allow alphanumeric + hyphens
        if (!/^[a-z0-9-]+$/i.test(shopId)) return NextResponse.next();
        const rest = match[2] || '';
        const url = request.nextUrl.clone();
        url.pathname = `/site/${shopId}${rest}`;
        url.search = search;
        return NextResponse.rewrite(url);
    }

    return NextResponse.next();
}

export function proxy(request: NextRequest) {
    const legacy = handleLegacyHost(request);
    if (legacy) return legacy;

    const landing = handleLandingHost(request);
    if (landing) return landing;

    const publicSite = handlePublicSiteHost(request);
    if (publicSite) return publicSite;

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimisation)
         * - favicon.ico
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
