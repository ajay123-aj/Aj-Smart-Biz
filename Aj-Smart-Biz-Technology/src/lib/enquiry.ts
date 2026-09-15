import { CONTACT, SITE } from '@/config/site';

/**
 * Where a demo request goes.
 *
 * **It goes to WhatsApp or to email, not to a server.** This project has no API
 * of its own and does not call the platform's: the form composes a message from
 * what was typed and hands it to the visitor's own WhatsApp or mail app, so
 * nothing is stored anywhere and the enquiry lands in an inbox that is already
 * being read.
 *
 * That is a real trade and worth stating plainly. What it buys is a site that
 * works the moment it is deployed, with no endpoint to build, no database row
 * to own, and no table of strangers' phone numbers sitting behind a screen
 * nobody has written yet. What it costs is reporting — there is no list of who
 * enquired and no conversion funnel, because nothing was recorded.
 *
 * When that reporting is wanted, the change is one function: post this same
 * payload to a public endpoint on `Aj-Smart-Biz-Backend` instead of opening
 * `wa.me`. Everything above this line — the form, its fields, its validation —
 * stays as it is. See the README.
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
export function composeMessage(kind: EnquiryKind, values: EnquiryPayload): string {
  const opening =
    kind === 'demo'
      ? `Hi ${SITE.shortName}, I would like a free demo for my business.`
      : `Hi ${SITE.shortName}, I have a question.`;

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

/** A `wa.me` link carrying the composed message. */
export function whatsappHref(kind: EnquiryKind, values: EnquiryPayload): string {
  const text = composeMessage(kind, values);
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
}

/** The same message as a `mailto:`, for anyone without WhatsApp. */
export function mailtoHref(kind: EnquiryKind, values: EnquiryPayload): string {
  const subject =
    kind === 'demo'
      ? `Demo request${values.businessName.trim() ? ` — ${values.businessName.trim()}` : ''}`
      : 'Website enquiry';
  const body = composeMessage(kind, values);
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
