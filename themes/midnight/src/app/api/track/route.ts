import { NextResponse, type NextRequest } from 'next/server';
import { resolveDomain } from '@/lib/company.server';

/**
 * The tracking beacon's own endpoint, on this site's origin.
 *
 * The browser posts here and this forwards to the platform API's
 * `POST /theme/leads`. It would be shorter to have the page call the API
 * directly, and it would not work:
 *
 *  - **The API's address is a server secret by design.** `API_URL` is
 *    deliberately not a `NEXT_PUBLIC_` name — see the note in
 *    `company.server.ts` — because a value baked into the bundle points at
 *    whatever machine the *visitor* is on. `http://localhost:4000` is correct
 *    for the server and meaningless in a phone's browser.
 *  - **Cross-origin.** A direct call would need the API's CORS list to name
 *    every tenant domain on the platform, forever.
 *  - **The visitor's IP.** Only a server-side hop can state it truthfully;
 *    a browser cannot tell the API where it is calling from.
 *
 * This is the same shape the `/uploads` rewrite in `next.config.ts` uses, and
 * for the same reason: everything the visitor's browser talks to is this site.
 */

/** Read at runtime, exactly as `company.server.ts` reads it. Never inlined. */
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/** Nothing here is cacheable — every call is a distinct event. */
export const dynamic = 'force-dynamic';

/**
 * A tracking payload is small. The cap is here rather than only in the API so a
 * page on this origin cannot be used to push megabytes through the proxy, and
 * it is generous enough that a legitimate beacon never approaches it.
 */
const MAX_BODY_BYTES = 32 * 1024;

/** The response the browser gets when nothing was recorded. Never an error. */
const quiet = (reason: string) =>
  NextResponse.json({ tracked: false, reason }, { status: 200, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;

  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return quiet('payload too large');
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return quiet('unreadable payload');
  }

  /**
   * The tenant is decided here, not by the page.
   *
   * `resolveDomain` reads the answer `middleware.ts` already worked out — the
   * `?domain=` override, `TENANT_DOMAIN`, then the real host — which is what
   * makes the tracker work on localhost, where the browser's own hostname names
   * no tenant. Whatever the body claimed is replaced: a script on this page
   * must not be able to file visits against a different company.
   */
  const domain = await resolveDomain();

  /**
   * The visitor's address, for the API to record.
   *
   * `x-forwarded-for` is taken as it arrived if a real proxy set it, and
   * otherwise built from what Next resolved. The API runs behind
   * `trust proxy: 1`, so it reads the hop this header names as the client.
   */
  const forwardedFor = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';

  try {
    const response = await fetch(`${API_URL}/theme/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        /* So the API's own host resolution agrees with ours. */
        'x-forwarded-host': domain,
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        /* The device parse is only as good as this header, so it is passed through. */
        'user-agent': request.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify({ ...payload, domain }),
      cache: 'no-store',
      /**
       * The page is not waiting on this and neither is the visitor. A slow or
       * unreachable API must not hold a connection open from every page load.
       */
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return quiet('api declined');

    const body = (await response.json()) as { data?: { tracked?: boolean; deviceId?: string } };

    /**
     * Only the device id comes back to the browser, so a first-time visitor
     * whose storage was empty can adopt the id the server derived. Everything
     * else the API returned is the platform's business, not the page's.
     */
    return NextResponse.json(
      { tracked: body.data?.tracked ?? false, deviceId: body.data?.deviceId ?? null },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    /**
     * Swallowed, like every other failure on this path. Analytics must never be
     * able to break the page it is measuring, and there is nothing the visitor
     * could do about it in any case.
     */
    return quiet('api unreachable');
  }
}
