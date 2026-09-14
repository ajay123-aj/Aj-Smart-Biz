/**
 * A service enquiry's result shape, and where it starts.
 *
 * A plain module rather than part of the action, for the reason
 * `testimonial-submit.ts` gives: a `'use server'` file may export **async
 * functions and nothing else**, so a constant beside the action is a runtime
 * error rather than a build one — exactly the kind that ships.
 */

/** The two fields the form asks for. Nothing else is collected. */
export type EnquiryField = 'name' | 'phone';

/** What was typed, echoed back so a rejection does not empty the form. */
export type EnquiryValues = Partial<Record<EnquiryField, string>>;

export interface EnquiryState {
  status: 'idle' | 'success' | 'error';
  message: string;
  /** Field-level messages from the API, keyed by field name. */
  fieldErrors?: Partial<Record<EnquiryField, string>>;
  values?: EnquiryValues;
  /**
   * Where to send the visitor next, when the tenant is having enquiries handed
   * to WhatsApp as well as recorded.
   *
   * A link they click rather than a window opened for them. A popup opened
   * after an `await` has lost its user gesture and browsers block it, so the
   * reliable version is the honest one: confirm the enquiry, then offer the
   * chat as something to press.
   */
  whatsappHref?: string;
}

export const INITIAL_ENQUIRY_STATE: EnquiryState = { status: 'idle', message: '' };

/**
 * The `wa.me` link for an enquiry, composed from what the visitor typed.
 *
 * The one place in this template that builds a WhatsApp URL itself. Every other
 * one arrives finished from the API, which can do that because it knows the
 * whole message in advance; this one cannot exist until somebody has filled in
 * the form, so the API sends the number and the composing happens here.
 */
export function enquiryWhatsappHref(
  whatsapp: { number: string; countryCode: string },
  { service, company, name, phone }: { service: string; company: string; name: string; phone: string }
): string {
  const to = `${whatsapp.countryCode}${whatsapp.number}`.replace(/\D/g, '');
  const text = `Hi ${company}, I would like to enquire about ${service}.\n\nName: ${name}\nPhone: ${phone}`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
