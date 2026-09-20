'use server';

import { readSession, publicRequest } from '@/lib/session.server';
import { resolveDomain } from '@/lib/company.server';
import type { BookingState, DiaryView } from '@/lib/booking';

/**
 * The two things the booking panel does: read a day of the diary, and take a
 * slot in it.
 *
 * Server Actions rather than `fetch` from the browser, for the reason every
 * other write here is one: this template has no API of its own, the API's
 * address never reaches the page, and the customer's token lives in an httpOnly
 * cookie that no script can read. The panel is a client component only because
 * picking a day is interactive — the calls it makes still happen on the server.
 *
 * Neither validates anything the API will validate again. The API decides
 * whether this tenant takes bookings, whether the service is one that can be
 * booked, whether the slot is still free and whether a sign-in is required. A
 * second opinion here would be a second thing to keep in step, and the one that
 * drifted would be the one a visitor saw.
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * One day of a service's diary.
 *
 * `null` for every kind of failure - no diary here, no such service, the API
 * unreachable. The panel shows "nothing free" rather than an error, because from
 * the visitor's side those are the same fact: there is no time to take.
 */
export async function loadDiary(slug: string, date?: string): Promise<DiaryView | null> {
  const domain = await resolveDomain();
  const query = new URLSearchParams({ domain });
  if (date) query.set('date', date);

  try {
    const response = await fetch(
      `${API_URL}/theme/services/${encodeURIComponent(slug)}/slots?${query.toString()}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: DiaryView | null };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Take a slot.
 *
 * The customer's session is attached when there is one, which is what lets the
 * API fill in the name and the number from the account - and what lets it refuse
 * the booking outright on a shop that runs accounts and has nobody signed in.
 * The name and phone in the form are sent only for a shop that does not.
 */
export async function bookSlot(_previous: BookingState, formData: FormData): Promise<BookingState> {
  const text = (field: string) => String(formData.get(field) ?? '').trim();

  const serviceId = Number(formData.get('serviceId'));
  const bookingDate = text('date');
  const bookingTime = text('time');

  if (!Number.isInteger(serviceId) || serviceId <= 0 || !bookingDate || !bookingTime) {
    return { status: 'error', message: 'Pick a day and a time first.' };
  }

  const token = await readSession();

  /**
   * Signed in, so the booking goes with the token and the API reads the name off
   * the account. Not signed in, and the form's own fields travel instead - which
   * the API accepts only on a shop that does not run customer accounts.
   */
  if (token) {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/theme/service-leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domain: await resolveDomain(),
          serviceId,
          bookingDate,
          bookingTime,
          sourceUrl: text('sourceUrl') || undefined,
        }),
        cache: 'no-store',
      });
    } catch {
      return { status: 'error', message: 'We could not reach the shop just now. Please try again.' };
    }

    const payload = (await response.json().catch(() => null)) as
      | { success?: boolean; message?: string; data?: { booking?: BookingState['booking'] } }
      | null;

    if (!response.ok || !payload?.success) {
      return {
        status: 'error',
        message: payload?.message || 'That time could not be booked. Please pick another.',
      };
    }

    return {
      status: 'success',
      message: payload.message ?? '',
      booking: payload.data?.booking ?? null,
    };
  }

  const result = await publicRequest<{ booking?: BookingState['booking'] }>('/service-leads', {
    serviceId,
    bookingDate,
    bookingTime,
    name: text('name'),
    phone: text('phone'),
    sourceUrl: text('sourceUrl') || undefined,
  });

  if (!result.ok) {
    return {
      status: 'error',
      message: result.message || 'That time could not be booked. Please pick another.',
    };
  }

  return { status: 'success', message: result.message, booking: result.data?.booking ?? null };
}
