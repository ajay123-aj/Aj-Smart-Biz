'use server';

import { revalidatePath } from 'next/cache';
import {
  accountRequest,
  clearSession,
  publicRequest,
  writeSession,
} from '@/lib/session.server';
import type { AccountResult } from '@/lib/customer';

/**
 * Everything a customer does to their own account.
 *
 * Server Actions rather than route handlers, for the reason
 * `submit-service-enquiry` gives: this template has no API of its own, and a
 * route handler would be one. Here there is a second reason that decides it —
 * the session token lives in an **httpOnly cookie** that only the server can
 * read or write, so a client-side sign-in is not possible even in principle.
 *
 * They validate almost nothing. The API is the authority: it decides whether
 * this tenant runs accounts at all, whether a code is right, how many addresses
 * one customer may keep, and it rate limits by IP. A second opinion here would
 * only be a second thing to keep in step.
 */

/* ------------------------------------------------------------------ *
 * Signing in
 * ------------------------------------------------------------------ */

/**
 * The first step: a number, and whatever the shop knows about it.
 *
 * **Three outcomes, and the person chooses none of them.**
 *
 *   known           a code is sent and the page moves to the code step.
 *   not known       the page moves to **sign-up**, with the number already
 *                   filled in. Nobody is told a code is coming and left waiting
 *                   for a message that was never sent, and nobody has to work out
 *                   for themselves that they were supposed to register instead.
 *   barred          neither will help, so the page says to get in touch.
 *
 * A name in the form means the person is deliberately registering, so the
 * register route is called directly — it handles an existing number correctly
 * too, leaving the stored name alone.
 */
export async function startSignIn(
  _previous: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  const phone = text('phone');
  const name = text('name');
  const email = text('email');

  if (!phone) {
    return { status: 'error', message: 'Enter your mobile number.', step: 'phone' };
  }

  /**
   * Registering and signing in are the same journey from the customer's side, so
   * the form decides which route to call by whether a name was typed — rather
   * than making somebody choose between two tabs before they know which one they
   * are. A returning customer who types their name anyway lands on `register`,
   * which handles them correctly and leaves their stored name alone.
   */
  type Answer = { devCode?: string; registered?: boolean; blocked?: boolean };

  const result = name
    ? await publicRequest<Answer>('/auth/register', { name, phone, email: email || null })
    : await publicRequest<Answer>('/auth/request-otp', { phone });

  if (!result.ok) {
    return { status: 'error', message: result.message || 'That did not work. Please try again.', step: 'phone', phone };
  }

  /**
   * A number the shop does not know.
   *
   * Sent to the sign-up step rather than reported as an error: being new is not
   * a mistake, and the number they just typed is carried across so the first
   * thing they see on that form is the one field they have already filled in.
   */
  if (result.data?.registered === false) {
    return {
      status: 'success',
      message: 'We have not seen that number before — let us set you up.',
      step: 'register',
      phone,
      registered: false,
    };
  }

  /* Real, and barred. Neither signing in nor signing up will help. */
  if (result.data?.blocked) {
    return {
      status: 'error',
      message: result.message || 'That account cannot be used at the moment. Please contact us.',
      step: 'phone',
      phone,
      registered: true,
      blocked: true,
    };
  }

  return {
    status: 'success',
    message: result.message || 'We have sent you a code.',
    step: 'code',
    phone,
    registered: true,
    /* Present only while the API has no SMS gateway, and labelled as such by the
       page that prints it. */
    devCode: result.data?.devCode ?? null,
  };
}

/**
 * The code, and a session if it is right.
 *
 * On success the token goes straight into the httpOnly cookie and the account
 * pages are revalidated — without that, a freshly signed-in customer would land
 * on a profile page still rendered from the signed-out cache.
 */
export async function verifySignIn(
  previous: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const code = String(formData.get('code') ?? '').trim();
  const phone = String(formData.get('phone') ?? previous.phone ?? '').trim();

  if (!code) {
    return { ...previous, status: 'error', message: 'Enter the code we sent you.', step: 'code', phone };
  }

  const result = await publicRequest<{ accessToken?: string }>('/auth/verify', { phone, code });

  if (!result.ok || !result.data?.accessToken) {
    return {
      ...previous,
      status: 'error',
      /* The API's own wording, which is deliberately the same for a wrong code,
         an expired one and a number with no account. */
      message: result.message || 'That code is not right. Ask for a new one.',
      /* Present only while the shop has no SMS gateway — see `AccountResult`. */
      detail: result.errors?.[0]?.message ?? null,
      step: 'code',
      phone,
    };
  }

  await writeSession(result.data.accessToken);

  revalidatePath('/account');
  revalidatePath('/account/orders');

  return { status: 'success', message: result.message || 'Signed in.', step: 'done', phone };
}

export async function signOut(): Promise<void> {
  await clearSession();
  revalidatePath('/account');
  revalidatePath('/account/orders');
}

/* ------------------------------------------------------------------ *
 * Their details
 * ------------------------------------------------------------------ */

/**
 * The name and the email. **Not the phone** — it is the identity, the API
 * refuses it, and the form does not offer it.
 */
export async function saveProfile(
  _previous: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const result = await accountRequest('/me', 'PUT', {
    name: String(formData.get('name') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim() || null,
  });

  revalidatePath('/account');

  return {
    status: result.ok ? 'success' : 'error',
    message: result.ok ? 'Saved.' : result.message || 'That could not be saved.',
  };
}

/* ------------------------------------------------------------------ *
 * Their addresses
 * ------------------------------------------------------------------ */

/** Reads the address form once, so adding and editing cannot drift apart. */
function addressFrom(formData: FormData) {
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  return {
    label: text('label') || 'Home',
    contactName: text('contactName') || null,
    contactPhone: text('contactPhone') || null,
    line1: text('line1'),
    line2: text('line2') || null,
    landmark: text('landmark') || null,
    city: text('city'),
    pincode: text('pincode') || null,
    /* Only ever sent as `true`: a customer with addresses always has exactly one
       default, so demotion happens by promoting something else. */
    ...(formData.get('isDefault') ? { isDefault: true as const } : {}),
  };
}

export async function saveAddress(
  _previous: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const id = String(formData.get('id') ?? '').trim();
  const body = addressFrom(formData);

  if (!body.line1 || !body.city) {
    return { status: 'error', message: 'An address needs at least a street and a town.' };
  }

  const result = id
    ? await accountRequest(`/me/addresses/${id}`, 'PUT', body)
    : await accountRequest('/me/addresses', 'POST', body);

  revalidatePath('/account');

  return {
    status: result.ok ? 'success' : 'error',
    message: result.ok ? 'Address saved.' : result.message || 'That address could not be saved.',
  };
}

export async function removeAddress(
  _previous: AccountResult,
  formData: FormData
): Promise<AccountResult> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { status: 'error', message: 'Nothing to remove.' };

  const result = await accountRequest(`/me/addresses/${id}`, 'DELETE');
  revalidatePath('/account');

  return {
    status: result.ok ? 'success' : 'error',
    message: result.ok ? 'Address removed.' : result.message || 'That could not be removed.',
  };
}
