/**
 * Composing the message a visitor hands to WhatsApp or their mail app.
 *
 * **The enquiry is posted to the API first** — `POST /website/enquiries`, via
 * the server action in `app/actions/submit-enquiry.ts` — so there is a record
 * of who asked and a screen in the super admin console listing them. What is
 * here is the *second* half: once it is stored, the visitor is still offered
 * the WhatsApp handoff, because a message in a thread somebody is already
 * reading gets answered faster than a row in a table somebody has to open.
 *
 * Keeping both is deliberate. If the API is unreachable the form says so and
 * still offers these links, so an outage costs us the record rather than the
 * lead.
 *
 * Nothing in this file talks to a server; it only builds `href`s.
 */

/** Why they wrote. Only changes the first line of the message. */
export type EnquiryKind = 'demo' | 'contact';

export interface EnquiryPayload {
  name: string;
  businessName: string;
  phone: string;
  email: string;
  city: string;
  /** The trade they picked, or typed when nothing matched. */
  businessType: string;
  /** The plan they were looking at, by name. Empty when undecided. */
  plan: string;
  message: string;
}

export const EMPTY_ENQUIRY: EnquiryPayload = {
  name: '',
  businessName: '',
  phone: '',
  email: '',
  city: '',
  businessType: '',
  plan: '',
  message: '',
};

/**
 * The option shown when a visitor's trade is not in the list.
 *
 * Picking it swaps the select for a text box. Worth having rather than trimming
 * the list to "Other": what people type into that box is the list of trades
 * nobody has built for yet, and it arrives in the message.
 */
export const OTHER_BUSINESS_TYPE = '__other__';

/**
 * The message itself.
 *
 * Laid out as labelled lines rather than a paragraph, because it is read on a
 * phone by somebody who is about to call back and wants the number first. Blank
 * fields are dropped entirely — a message full of "City: —" is harder to scan
 * than a short one.
 */
export function composeMessage(
  kind: EnquiryKind,
  values: EnquiryPayload,
  /** From the API's `site` block. Defaulted so a blank one cannot read "Hi ,". */
  shortName = 'Aj Smart Biz'
): string {
  const opening =
    kind === 'demo'
      ? `Hi ${shortName}, I would like a free demo for my business.`
      : `Hi ${shortName}, I have a question.`;

  const lines: [string, string][] = [
    ['Name', values.name],
    ['Business', values.businessName],
    ['Type', values.businessType],
    ['City', values.city],
    ['Phone', values.phone],
    ['Email', values.email],
    ['Plan', values.plan],
  ];

  const details = lines
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value.trim()}`);

  const note = values.message.trim();

  return [opening, '', ...details, ...(note ? ['', note] : [])].join('\n');
}

/**
 * A `wa.me` link carrying the composed message.
 *
 * Returns undefined when no WhatsApp number is configured, so the caller can
 * drop the button rather than render one that opens `wa.me/undefined`.
 */
export function whatsappHref(
  kind: EnquiryKind,
  values: EnquiryPayload,
  whatsapp?: string,
  shortName?: string
): string | undefined {
  if (!whatsapp) return undefined;
  const text = composeMessage(kind, values, shortName);
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}

/** The same message as a `mailto:`, for anyone without WhatsApp. */
export function mailtoHref(
  kind: EnquiryKind,
  values: EnquiryPayload,
  email?: string,
  shortName?: string
): string | undefined {
  if (!email) return undefined;
  const subject =
    kind === 'demo'
      ? `Demo request${values.businessName.trim() ? ` — ${values.businessName.trim()}` : ''}`
      : 'Website enquiry';
  const body = composeMessage(kind, values, shortName);
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Whether there is enough here to act on.
 *
 * A name, and one of the two ways to reply. Which of those two is up to them —
 * a shop owner who wants a phone call should not have to invent an email
 * address — but neither is not accepted, because a message nobody can answer is
 * not an enquiry.
 */
export const canSend = (values: EnquiryPayload): boolean =>
  Boolean(values.name.trim()) && Boolean(values.phone.trim() || values.email.trim());
