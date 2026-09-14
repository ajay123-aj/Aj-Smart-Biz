import 'server-only';
import { cookies } from 'next/headers';
import { resolveDomain } from './company.server';
import type { Account, CustomerOrder, ServiceEnquiryRecord } from './customer';

/**
 * The customer's session, and every call that needs it.
 *
 * ### The token never reaches the browser
 *
 * It lives in an **httpOnly cookie**, which means no script on the page can read
 * it — not this template's, and not one that got onto the page some other way.
 * Every authenticated call is made from the server, with the token attached
 * here, and the browser only ever sees the answer.
 *
 * That is the whole reason these are Server Actions and Server Components rather
 * than `fetch` from a client component. It also keeps `API_URL` where it belongs:
 * the browser never learns the API's address and cannot be handed a `localhost`
 * origin that means the visitor's own machine.
 *
 * ### Scoped to the tenant, twice
 *
 * The cookie name carries no tenant, but the **token does** — the API issues it
 * with the company inside and checks it on every request. The cookie is also
 * `sameSite: 'lax'` and path-wide, so it travels with ordinary navigation and
 * not with a cross-site form post.
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const COOKIE = 'customer_session';

/**
 * Thirty days.
 *
 * Long, deliberately: the point of the account is not typing an address again,
 * and a shopper signed out every week would type it about as often as a guest.
 * The token itself expires on the API's own schedule regardless, so this is a
 * ceiling rather than a promise.
 */
const MAX_AGE = 60 * 60 * 24 * 30;

export async function readSession(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

/** Only callable from a Server Action or a Route Handler — Next forbids it elsewhere. */
export async function writeSession(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    /* On in production, off on a plain-http dev server — a `secure` cookie is
       simply not stored there, which would make sign-in appear to do nothing. */
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * A call to the API as the signed-in customer.
 *
 * Returns `null` when there is no session **or the API rejects the one there
 * is** — an expired token is the same thing as being signed out, as far as every
 * page here is concerned, and treating it as an error would show a wall of red
 * to somebody whose only problem is that a month has passed.
 *
 * The caller then renders the signed-out state, which is always a real state
 * rather than a failure.
 */
async function callAsCustomer<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; data: T | null; message: string }> {
  const token = await readSession();
  if (!token) return { ok: false, data: null, message: 'Not signed in' };

  let response: Response;

  try {
    response = await fetch(`${API_URL}/website${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, data: null, message: 'We could not reach your account just now.' };
  }

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; message?: string; data?: T }
    | null;

  return {
    ok: response.ok && Boolean(payload?.success),
    data: payload?.data ?? null,
    message: payload?.message ?? '',
  };
}

/** The account, or `null` for a visitor who is not signed in. */
export async function getAccount(): Promise<Account | null> {
  const result = await callAsCustomer<Account>('/me');
  return result.ok ? result.data : null;
}

/** Their order history, newest first. Empty rather than null on a failure. */
export async function getMyOrders(): Promise<CustomerOrder[]> {
  const result = await callAsCustomer<CustomerOrder[]>('/me/orders');
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

/** Their service enquiries, newest first. Empty rather than null on a failure. */
export async function getMyServices(): Promise<ServiceEnquiryRecord[]> {
  const result = await callAsCustomer<ServiceEnquiryRecord[]>('/me/services');
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

/**
 * Anything else the account pages need to write.
 *
 * Exported so the Server Actions can reuse the token handling rather than each
 * one re-reading the cookie and re-deciding what an expired session means.
 */
export async function accountRequest<T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown
): Promise<{ ok: boolean; data: T | null; message: string }> {
  return callAsCustomer<T>(path, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * An **unauthenticated** call to the website module, for the three sign-in
 * routes — there is no session yet, by definition.
 *
 * The tenant rides along as `domain`, resolved server-side from the host this
 * page was served on: the same answer `getCompanyDetails` uses, and not
 * something the browser supplies, so a sign-in cannot be aimed at a shop whose
 * website the sender never opened.
 */
export async function publicRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: T | null; message: string; errors?: { message?: string }[] }> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/website${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ domain: await resolveDomain(), ...body }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, data: null, message: 'We could not reach the shop just now. Please try again.' };
  }

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; message?: string; data?: T; errors?: { message?: string }[] }
    | null;

  return {
    ok: response.ok && Boolean(payload?.success),
    data: payload?.data ?? null,
    message: payload?.message ?? '',
    /* Carried through for the sign-in page: while the shop has no SMS gateway the
       API says why it refused, and swallowing that here would put the one useful
       line out of reach of the only screen that can show it. */
    errors: payload?.errors,
  };
}
