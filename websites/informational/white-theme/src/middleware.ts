import { NextResponse, type NextRequest } from 'next/server';

/**
 * Works out which tenant this request is for, before the page renders, and hands
 * the answer to the app on `x-tenant-domain`.
 *
 * The order matches `BrandingService.resolveHost()` in Aj-Smart-Biz-Admin, so a
 * domain behaves the same on the website as it does on the login screen:
 *
 *   1. `?domain=` on the URL — an explicit override, remembered afterwards so it
 *      survives navigation (the admin keeps it in sessionStorage; a cookie is the
 *      server-rendered equivalent).
 *   2. `TENANT_DOMAIN` from the environment — an operator pinning this deployment
 *      to one tenant. Explicit configuration beats a guessed host, which is what
 *      makes it usable behind a dev tunnel, where the host is the tunnel's own
 *      name and names no tenant.
 *   3. `X-Forwarded-Host` — the host the browser really used, behind a proxy,
 *   4. `Host`,
 *   5. the cookie that a `?domain=` override left behind. Last, so a real host
 *      always wins: pointing a new domain at this site must never serve whatever
 *      tenant was previewed in that browser earlier.
 *
 * Middleware is the only place this can happen: a Server Component may read
 * cookies but may not set them, and the override has to stick.
 */

const COOKIE = 'tenant_domain';

/** Strips the port and lower-cases; `Acme.Test:4400` -> `acme.test`. */
const normaliseHost = (value: string | null | undefined): string =>
  String(value || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

/** Hosts that never identify a tenant, so a bare dev server falls through. */
const NEUTRAL = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '']);

export function middleware(request: NextRequest) {
  const override = normaliseHost(request.nextUrl.searchParams.get('domain'));
  const remembered = normaliseHost(request.cookies.get(COOKIE)?.value);
  const forwarded = normaliseHost(request.headers.get('x-forwarded-host'));
  const host = normaliseHost(request.headers.get('host'));
  const configured = normaliseHost(process.env.TENANT_DOMAIN);

  const realHost = [forwarded, host].find((value) => value && !NEUTRAL.has(value));

  const domain = override || configured || realHost || remembered || host;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-domain', domain);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Remember an explicit override for the rest of the visit, exactly as the
  // admin does. Session-scoped: no expiry, so it goes when the browser closes.
  if (override) {
    response.cookies.set(COOKIE, override, { path: '/', sameSite: 'lax', httpOnly: true });
  }

  return response;
}

export const config = {
  // Pages only — not Next's own assets, not the static files we serve ourselves,
  // and not the proxied company uploads.
  matcher: ['/((?!_next/static|_next/image|uploads/|favicon.svg).*)'],
};
