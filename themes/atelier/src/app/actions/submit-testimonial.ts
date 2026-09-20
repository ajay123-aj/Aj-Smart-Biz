'use server';

import { revalidatePath } from 'next/cache';
import { resolveDomain } from '@/lib/company.server';
import type { SubmitState, SubmitValues, TestimonialField } from '@/lib/testimonial-submit';

/**
 * Carries a visitor's review to the API.
 *
 * A Server Action rather than a route handler, and deliberately: this template
 * has no API of its own — every other thing it needs, it asks the backend for —
 * and a route handler would be one. It also keeps `API_URL` where it belongs.
 * The browser never learns the API's address, never calls it, and cannot be
 * given a `localhost` origin that means the visitor's own machine, which is the
 * rule the whole deployment story rests on (see the README in `themes/`).
 *
 * The action validates nothing beyond what it takes to give the person in front
 * of it a useful message. The API is the authority — it decides whether this
 * tenant is collecting reviews at all, refuses anything short or empty, rate
 * limits by IP, and parks every submission as `pending` regardless of what was
 * sent. Re-implementing any of that here would only create a second opinion.
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ApiError {
  field?: string;
  message?: string;
}

export async function submitTestimonial(
  _previous: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  const text = (name: TestimonialField) => String(formData.get(name) ?? '').trim();

  /**
   * Everything typed, kept aside before anything can reject it. Handed back on
   * failure so the form can restore itself — see `SubmitState.values`.
   */
  const values: SubmitValues = {
    authorName: text('authorName'),
    authorEmail: text('authorEmail'),
    authorPhone: text('authorPhone'),
    body: text('body'),
  };

  const rating = Number(formData.get('rating'));
  const body = {
    /**
     * The tenant, resolved server-side from the host this page was served on —
     * the same answer `getCompanyDetails` uses. Not a field on the form, so a
     * review cannot be aimed at a company whose website the writer never
     * visited. The API resolves the host itself as well and would ignore a
     * mismatch; this is what makes it work on a dev server, where the host is
     * `localhost` and names nobody.
     */
    domain: await resolveDomain(),
    authorName: values.authorName,
    authorEmail: values.authorEmail || null,
    authorPhone: values.authorPhone || null,
    rating: Number.isInteger(rating) && rating > 0 ? rating : null,
    body: values.body,
  };

  let response: Response;
  try {
    response = await fetch(`${API_URL}/theme/testimonials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // The API being unreachable is not the visitor's fault and not their
    // problem to solve, so the message says what to do rather than what broke.
    return {
      status: 'error',
      message: 'We could not send that just now. Please try again in a moment.',
      values,
    };
  }

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; message?: string; errors?: ApiError[] }
    | null;

  if (!response.ok || !payload?.success) {
    /**
     * Field messages are passed through as the API worded them — it is the one
     * that knows a review has to run to twenty characters — and shown against
     * the field rather than as one line at the top, so a long form does not
     * have to be re-read to find the problem.
     */
    const fieldErrors: Partial<Record<TestimonialField, string>> = {};
    (payload?.errors ?? []).forEach((error) => {
      if (error.field && error.message) {
        fieldErrors[error.field as TestimonialField] = error.message;
      }
    });

    return {
      status: 'error',
      message: payload?.message || 'That could not be sent. Please check the form and try again.',
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
      values,
    };
  }

  /**
   * Nothing new is on the page — the review is pending, and pending reviews are
   * not published — but the section shows a running total and an average, and a
   * visitor who has just written one is exactly the person who will look. The
   * page is re-rendered so those are current rather than left as they were when
   * the page was first served.
   */
  revalidatePath('/');

  return {
    status: 'success',
    message: payload.message || 'Thank you — your review has been sent to us.',
  };
}
