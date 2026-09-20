import { NextResponse, type NextRequest } from 'next/server';

/**
 * The tracking beacon's own endpoint, on this site's origin.
 *
 * The browser posts here and this forwards to `POST /website/track` on the
 * platform API. It would be shorter to have the page call the API directly, and
 * it would not work:
 *
 *  - **The API's address is a server secret by design.** `API_URL` is
 *    deliberately not a `NEXT_PUBLIC_` name — see `lib/api.ts` — because a
 *    value baked into the bundle points at whatever machine the *visitor* is
 *    on. `http://aj-smart-biz-backend:4000` is correct for this container and
 *    meaningless in a phone's browser.
 *  - **Cross-origin.** A direct call would need the API to run CORS for this
 *    site, for no benefit.
 *  - **The visitor's IP.** Only a server-side hop can state it truthfully; a
 *    browser cannot tell the API where it is calling from.
 *
 * The tenant templates in `themes/` have the same file pointing at
 * `/theme/leads`. The difference is everything this one does *not* do: there is
 * no tenant to resolve, because there is one marketing site and it is ours.
 */

/** Read at runtime, exactly as `lib/api.ts` reads it. Never inlined. */
const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

/** Nothing here is cacheable — every call is a distinct event. */
export const dynamic = 'force-dynamic';

/**
 * A tracking payload is small. The cap is here rather than only in the API so a
 * script on this origin cannot push megabytes through the proxy, and it is
 * generous enough that a legitimate beacon never approaches it.
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
   * The visitor's address, for the API to record.
   *
   * Taken as it arrived where a real proxy set it. The API runs behind
   * `trust proxy: 1`, so it reads the hop this header names as the client.
   */
  const forwardedFor = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? '';

  try {
    const response = await fetch(`${API_URL}/website/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
        /* The device parse is only as good as this header, so it is passed through. */
        'user-agent': request.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      /**
       * The page is not waiting on this and neither is the visitor. A slow or
       * unreachable API must not hold a connection open from every page load.
       */
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) return quiet('api declined');

    /**
     * Nothing useful comes back to the browser.
     *
     * The API answers with the ids it wrote, and none of them are the page's
     * business — a tracker that can read row ids is a tracker that can be used
     * to count other visitors. The device id the browser uses is the one it
     * generated itself, so there is nothing to adopt either.
     */
    return NextResponse.json(
      { tracked: true },
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
