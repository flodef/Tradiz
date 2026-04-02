import { NextRequest, NextResponse } from 'next/server';

const BASE_DOMAIN = 'tradiz.fr';
const LEGACY_HOST = `pos.${BASE_DOMAIN}`;

/**
 * Redirects legacy path-based shop URLs to subdomain-based URLs.
 * e.g. https://pos.tradiz.fr/annette        → https://annette.tradiz.fr/
 *      https://pos.tradiz.fr/annette/foo    → https://annette.tradiz.fr/foo
 *
 * Must NOT redirect API routes, Next.js internals, or static assets.
 */
export function proxy(request: NextRequest) {
    const { hostname, pathname } = request.nextUrl;

    if (hostname !== LEGACY_HOST) return NextResponse.next();

    // Match /shopId or /shopId/rest/of/path
    // Exclude Next.js internals and static assets
    const match = pathname.match(/^\/([^/]+)(\/.*)?$/);
    if (!match) return NextResponse.next();

    const [, shopSegment, rest = '/'] = match;

    // Don't redirect internal Next.js paths or API routes
    const skip = ['_next', 'api', 'favicon.ico', 'manifest.webmanifest'];
    if (skip.includes(shopSegment)) return NextResponse.next();

    const { protocol } = request.nextUrl;
    const redirectUrl = `${protocol}//${shopSegment}.${BASE_DOMAIN}${rest}`;

    return NextResponse.redirect(redirectUrl, { status: 301 });
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
