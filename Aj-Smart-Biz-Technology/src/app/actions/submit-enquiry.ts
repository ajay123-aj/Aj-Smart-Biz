'use server';

import { submitEnquiry, type EnquiryResult } from '@/lib/api';
import type { EnquiryKind, EnquiryPayload } from '@/lib/enquiry';

/**
 * Sends one enquiry to the API, from the server.
 *
 * A server action rather than a `fetch` in the form, for one reason: `API_URL`
 * is a server-only variable on purpose — see `lib/api.ts` — so a browser has no
 * idea where the API is and should not be told. The form calls this, this calls
 * the API, and the API address never reaches the bundle.
 *
 * It also means the API sees the *server's* address rather than the visitor's,
 * which is worth knowing because the endpoint is rate limited per address. The
 * limit is 10 per 15 minutes in production, and every submission from this site
 * now counts against the same one. That is a real cap on a busy day and the
 * reason to raise it is here, not a reason to move the call into the browser —
 * doing that would publish the API origin and need CORS on top.
 *
 * Never throws. A failed send returns a result the form can render, because
 * losing what somebody typed to a stack trace is worse than telling them it did
 * not go through and leaving the WhatsApp button there.
 */
export async function submitEnquiryAction(
  kind: EnquiryKind,
  values: EnquiryPayload,
  source?: string,
  /** The browser's tracking id, where it had one. See `EnquiryForm`. */
  deviceId?: string | null
): Promise<EnquiryResult> {
  return submitEnquiry({
    kind,
    name: values.name.trim(),
    businessName: values.businessName.trim() || undefined,
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    city: values.city.trim() || undefined,
    businessType: values.businessType.trim() || undefined,
    plan: values.plan.trim() || undefined,
    message: values.message.trim() || undefined,
    source,
    deviceId: deviceId || undefined,
  });
}
