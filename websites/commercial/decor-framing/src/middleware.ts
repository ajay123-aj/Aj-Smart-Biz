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
 *   2. `X-Forwarded-Host` — the host the browser really used, behind a proxy,
 *   3. `Host`,
 *   4. `TENANT_DOMAIN` from the environment,
 *   5. the cookie that a `?domain=` override left behind. Last, so a real host
 *      always wins: pointing a new domain at this site must never serve whatever
 *      tenant was previewed in that browser earlier.
 *
 * **The real host outranks `TENANT_DOMAIN`, and that ordering is the whole
 * point of the file.** It used to be the other way round, on the reasoning that
 * a dev tunnel's host names no tenant so explicit configuration should win.
 * That reasoning holds only until somebody registers the tunnel host as a
 * domain — and then the pin silently swallows it: the row is added, the site
 * keeps serving whatever `TENANT_DOMAIN` says, and nothing anywhere reports a
 * problem. One deployment serving many domains is the product; a deployment
 * pinned to one tenant is the local-development convenience. The convenience
 * cannot outrank the product.
 *
 * `TENANT_DOMAIN` still works where it is actually needed, because a bare
 * `localhost` is in `NEUTRAL` below and never counts as a real host. So
 * `npm run dev` on localhost:4600 still resolves the tenant it is pinned to,
 * and the same deployment behind a tunnel or a real domain resolves by host.
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

  const domain = override || realHost || configured || remembered || host;

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
