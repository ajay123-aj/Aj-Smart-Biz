'use server';

import { resolveDomain } from '@/lib/company.server';
import {
  enquiryWhatsappHref,
  type EnquiryField,
  type EnquiryState,
  type EnquiryValues,
} from '@/lib/service-enquiry';

/**
 * Carries a service enquiry to the API.
 *
 * A Server Action rather than a route handler, for the reason
 * `submit-testimonial` gives: this template has no API of its own, and a route
 * handler would be one. It also keeps `API_URL` where it belongs — the browser
 * never learns the API's address, never calls it, and cannot be handed a
 * `localhost` origin that means the visitor's own machine.
 *
 * It validates nothing beyond what it takes to give the person in front of it a
 * useful message. The API is the authority: it decides whether this tenant is
 * collecting enquiries at all, whether the service is one of theirs and
 * published, and it rate limits by IP. A second opinion here would only be a
 * second thing to keep in step.
 */

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface ApiFieldError {
  field?: string;
  message?: string;
}

export async function submitServiceEnquiry(
  _previous: EnquiryState,
  formData: FormData
): Promise<EnquiryState> {
  const text = (name: string) => String(formData.get(name) ?? '').trim();

  /** Everything typed, kept aside before anything can reject it. */
  const values: EnquiryValues = { name: text('name'), phone: text('phone') };

  const serviceId = Number(formData.get('serviceId'));
  /** Only for composing the WhatsApp message; the API takes the title from its own row. */
  const serviceTitle = text('serviceTitle');
  const companyName = text('companyName');
  const sourceUrl = text('sourceUrl');

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return { status: 'error', message: 'Something went wrong — please reload the page and try again.', values };
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/website/service-leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        /**
         * The tenant, resolved server-side from the host this page was served
         * on — the same answer `getCompanyDetails` uses. Not a field on the
         * form, so an enquiry cannot be aimed at a company whose website the
         * sender never opened. The API resolves the host itself as well; this
         * is what makes it work on a dev server, where the host names nobody.
         */
        domain: await resolveDomain(),
        serviceId,
        name: values.name,
        phone: values.phone,
        sourceUrl: sourceUrl || null,
      }),
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
    | { success?: boolean; message?: string; errors?: ApiFieldError[]; data?: { whatsapp?: { number: string; countryCode: string } | null } }
    | null;

  if (!response.ok || !payload?.success) {
    /* Field messages as the API worded them, shown against the field rather
       than as one line at the top. */
    const fieldErrors: Partial<Record<EnquiryField, string>> = {};
    (payload?.errors ?? []).forEach((error) => {
      if (error.field && error.message) fieldErrors[error.field as EnquiryField] = error.message;
    });

    return {
      status: 'error',
      message: payload?.message || 'That could not be sent. Please check the form and try again.',
      fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : undefined,
      values,
    };
  }

  /**
   * The API returns a number only when this tenant has enquiries going to
   * WhatsApp *as well as* being recorded. Composing the link here rather than
   * in the browser keeps the one piece of message-building in the same place as
   * the rest of the submission.
   */
  const whatsapp = payload?.data?.whatsapp ?? null;

  return {
    status: 'success',
    message: payload?.message || 'Thank you — we have your details and will be in touch.',
    whatsappHref: whatsapp
      ? enquiryWhatsappHref(whatsapp, {
        service: serviceTitle,
        company: companyName,
        name: values.name ?? '',
        phone: values.phone ?? '',
      })
      : undefined,
  };
}
