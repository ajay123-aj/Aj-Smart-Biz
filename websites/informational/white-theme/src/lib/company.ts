/**
 * The shape `GET /website/company-details` answers with, and the one helper both
 * halves of the app need.
 *
 * Nothing here talks to the API — the call lives in `company.server.ts`, and the
 * endpoint itself lives in the backend (`Aj-Smart-Biz-Backend`), not in this app.
 * This file is free of `next/headers` on purpose: the header, slider and footer
 * are client components and import their types from here.
 */

const FILES_URL = process.env.NEXT_PUBLIC_FILES_URL || '';

export interface CompanyTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  mode: string;
}

export interface CompanyAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  pincode: string | null;
}

export interface CompanyContact {
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  website: string | null;
}

export interface CompanyBranch {
  id: number;
  name: string;
  code: string;
  isMain: boolean;
  email: string | null;
  phone: string | null;
  address: CompanyAddress;
  latitude: string | number | null;
  longitude: string | number | null;
  openingTime: string | null;
  closingTime: string | null;
}

/**
 * One hero slide, managed by the tenant in the admin's Slider Management and
 * already resolved branch-wise and ordered by the API.
 */
export interface CompanySlide {
  id: number;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  /** Wide artwork for desktop. */
  image: string | null;
  /** Portrait crop for phones; falls back to `image` when the company left it empty. */
  mobileImage: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sequence: number;
}

/* ------------------------------------------------------------------ *
 * Optional functionality
 * ------------------------------------------------------------------ */

/**
 * What a WhatsApp number is for. The API resolves every type — a type the
 * company left empty falls back to its contact number — so `byType` always has
 * all four whenever the block is present at all.
 */
export type WhatsappType = 'inquiry' | 'contact' | 'support' | 'orders';

export type ShareChannel = 'copy' | 'whatsapp' | 'facebook' | 'x' | 'linkedin' | 'telegram' | 'email';

/** One publishable WhatsApp number, with its link already built by the API. */
export interface WhatsappNumber {
  type: WhatsappType;
  /** The company's own label, or the type's name. */
  label: string;
  /** Printable, e.g. `+91 9876543210`. */
  display: string;
  number: string;
  countryCode: string;
  defaultMessage: string | null;
  /** A complete `https://wa.me/…?text=…` link. Nothing here builds one. */
  href: string;
}

export interface WhatsappFeature {
  numbers: WhatsappNumber[];
  /** Every type, resolved — see the note on `WhatsappType`. */
  byType: Record<WhatsappType, WhatsappNumber>;
  /** The general-purpose number, for the floating bubble. */
  primary: WhatsappNumber;
}

export interface ShareLinkFeature {
  headline: string;
  /** `{company}` is filled in at render time. */
  message: string;
  channels: ShareChannel[];
}

/**
 * One figure in the band. The API has already done the arithmetic — a card
 * counting years from a date arrives as a finished string — so the template
 * renders `display` and never computes anything itself.
 */
export interface Figure {
  id: number;
  label: string;
  display: string;
}

/**
 * The band of figures, or `null` when this tenant is not showing one.
 *
 * Its own feature rather than part of `about`, which is where it used to live
 * and never belonged: the band opens the **home page**, which renders nothing
 * else the About block carries, and a company can want its numbers on show
 * without buying a written About page. Absent unless the plan grants `figures`,
 * the tenant switched it on, the plan is still being served, and at least one
 * figure resolves to something — the same rule Team and Gallery follow.
 *
 * `eyebrow`, `title` and `lead` are always present and never blank; the API
 * fills its own wording where the tenant wrote none.
 */
export interface FiguresFeature extends SectionCopy {
  items: Figure[];
}

export interface AboutFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** Blank lines separate paragraphs. */
  body: string;
}

export interface TeamMember {
  id: number;
  name: string;
  role: string | null;
  bio: string | null;
  /** Upload path; run through `toFileUrl` before use. */
  photo: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
}

/**
 * The words above a section's cards, as the API resolved them: the tenant's own
 * where they wrote any, the platform's wording where they did not. Always
 * present and never blank, so a template renders them without a fallback of its
 * own — the one in `config/site.ts` is only for an API too old to send these.
 */
export interface SectionCopy {
  eyebrow: string;
  title: string;
  lead: string;
}

export interface TeamFeature extends SectionCopy {
  members: TeamMember[];
}

export interface GalleryImage {
  id: number;
  /** Upload path; run through `toFileUrl` before use. */
  image: string;
  title: string | null;
  caption: string | null;
  /** Already falls back to the title; empty means decorative. */
  altText: string;
}

export interface GalleryFeature extends SectionCopy {
  items: GalleryImage[];
}

/* ------------------------------ testimonials ------------------------------ */

/** How the company runs its wall. See `TestimonialsFeature`. */
export type TestimonialMode = 'static' | 'dynamic';

/** Who wrote a review — the company itself, or one of its customers. */
export type TestimonialSource = 'admin' | 'visitor';

/**
 * One published review.
 *
 * Everything a stranger typed that is *not* here is the point: the API holds an
 * email, a phone number and the submitting IP against a visitor review, and
 * sends none of them. This is the whole of what may go on a page.
 */
export interface Testimonial {
  id: number;
  authorName: string;
  authorRole: string | null;
  /** Upload path; run through `toFileUrl` before use. */
  photo: string | null;
  /** Out of five, or null — a written review with no star is fine. */
  rating: number | null;
  body: string;
  source: TestimonialSource;
  /** `YYYY-MM-DD`. No time of day. */
  submittedAt: string | null;
}

/** The wording around the form, present only when the form is. */
export interface TestimonialForm {
  title: string;
  note: string;
  showRating: boolean;
}

/**
 * A review button that leaves the site — the company's Google Business page, a
 * directory listing, a form it runs itself.
 *
 * The alternative to `form`, never its companion: the API sends one of the two
 * and nulls the other, so there is no arrangement of settings that produces two
 * review buttons on one section.
 *
 * `url` is `http`/`https` and absolute, checked on the way out of the platform
 * rather than here — which is what makes it safe to hand straight to an
 * `href`.
 */
export interface TestimonialReviewLink {
  /** The label on the button. The same field that titles the dialog. */
  label: string;
  url: string;
}

/**
 * The Testimonials section, or `null` when this tenant has nothing to show.
 *
 * The mode is what the company chose in the admin, and it has already decided
 * what arrived in `items`:
 *
 *   static   the company's own wall, every approved review, in the order it
 *            arranged by hand. No form.
 *   dynamic  the ten most recent approved reviews, newest first, whoever wrote
 *            them — plus a button for the next one, which is either our own
 *            form or a link off the site. See `canSubmit` and `reviewLink`.
 *
 * The template does not re-derive any of that. It renders `items` in the order
 * given and shows the form when `canSubmit` says so, which is what stops the
 * two ever disagreeing with the API about what a tenant is running.
 */
export interface TestimonialsFeature {
  mode: TestimonialMode;
  eyebrow: string;
  title: string;
  lead: string;
  /**
   * Whether this site is collecting reviews **through its own form**. The only
   * cue to render the dialog — a section can be open for reviews and still
   * have no form here, because the company sends people somewhere else.
   */
  canSubmit: boolean;
  form: TestimonialForm | null;
  /**
   * The other destination for the review button, when the company chose one.
   * Mutually exclusive with `form`: at most one of the two is ever non-null.
   */
  reviewLink: TestimonialReviewLink | null;
  items: Testimonial[];
  /** Every approved review, not just the ones sent — see `items`. */
  total: number;
  /** One decimal place, e.g. `4.8`; null when nobody has left a star. */
  averageRating: number | null;
  ratingCount: number;
}

/* --------------------------- features / benefits -------------------------- */

/**
 * One benefit card — a capability the business offers, and what it is worth to
 * the person reading.
 *
 * `icon` names a glyph the template draws itself; see `FeaturesSection`, which
 * owns the artwork and falls back to `spark` for a name it does not know.
 *
 * Deliberately a plain `string` rather than the template's own `FeatureIcon`
 * union. The platform's library is the wider of the two — it can grow a glyph
 * before this template learns to draw it — and typing this field as the
 * narrower set would be claiming the opposite. The renderer is what narrows it,
 * which is also the only place that can.
 */
export interface BenefitCard {
  id: number;
  icon: string;
  title: string;
  /** Optional — a good heading can stand on its own. */
  body: string | null;
}

/**
 * The Features / Benefits band, or `null` when this tenant is not showing one.
 *
 * Absent unless the plan grants `features_benefits`, the tenant switched it on,
 * the plan is still being served and there is at least one active card — the
 * same rule Team and Gallery follow. There is deliberately no fallback to the
 * template's own six cards: the platform knows nothing factual about a tenant's
 * capabilities, so wording nobody wrote is wording nobody can stand behind.
 */
export interface BenefitsFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The button under the lede, rendered only where there is a Contact page. */
  ctaLabel: string;
  items: BenefitCard[];
}

/* -------------------------------- services -------------------------------- */

/**
 * One service the business sells.
 *
 * Next to a `BenefitCard` this looks like the same thing with more fields on
 * it, and it is not. A benefit is a reason to choose the business; a service is
 * a thing it sells, and only one of the two has a price. They are two different
 * arguments and they are made in two different bands.
 *
 * `icon` is a plain string for the reason `BenefitCard.icon` is: the platform's
 * library is the wider set and can grow a glyph before this template learns to
 * draw it. `Glyph` narrows it, and falls back to `spark`.
 */
export interface ServiceItem {
  id: number;
  icon: string;
  /**
   * A photograph of the work. Null on most cards — the icon is what a service
   * without one falls back to, so the card is never short of a picture.
   */
  image: string | null;
  title: string;
  summary: string | null;
  /** What is included. Always an array — the API normalises it, never null. */
  highlights: string[];
  /** Free text, never a number: `From ₹45,000`, `On request`, `£60/hour`. */
  priceLabel: string | null;
  /**
   * This service's own button label, or null to use the section's.
   *
   * Null rather than pre-filled, so a company that changes the section's label
   * still changes every card that never deliberately overrode it.
   */
  ctaLabel: string | null;
  /** Read this one first. The section gives it the wide cell. */
  featured: boolean;
}

/** Where a submitted enquiry goes. The company's setting, decided by the API. */
export type EnquiryTarget = 'whatsapp' | 'admin' | 'both';

/**
 * What the enquiry button on a service card does.
 *
 * `null` on the section when it can do nothing — the company pointed it at
 * WhatsApp and published no number — and the card then renders no button at
 * all rather than a dialog that goes nowhere.
 *
 * `records` and `opensWhatsapp` are the two questions the template actually
 * asks, sent as answers rather than as a `target` it would have to interpret.
 * `target` is still here because a third state would otherwise be invisible to
 * anyone reading a payload.
 */
export interface ServiceEnquiry {
  target: EnquiryTarget;
  /** Whether a submission is recorded on the platform. */
  records: boolean;
  /** Whether the visitor is handed the message to send. */
  opensWhatsapp: boolean;
  /** The dialog's heading, and the line under it. Both the tenant's. */
  title: string;
  note: string;
  /**
   * The number to compose against, in parts. Not a finished `wa.me` link,
   * because the message cannot exist until the visitor has typed their name —
   * the one place this template builds a WhatsApp URL itself.
   */
  whatsapp: { number: string; countryCode: string } | null;
}

/**
 * The Services section, or `null` when this tenant is not showing one.
 *
 * Absent unless the plan grants `services`, the tenant switched it on, the plan
 * is still being served **and** at least one service is active — the same rule
 * Team, Gallery and the benefit cards follow. The `/services` route and the
 * menu entry are decided by exactly the same answer, so a link to that page
 * never outlives the content on it.
 *
 * There is deliberately no fallback. The platform knows a company's name, trade
 * and address; it knows nothing about what that company actually sells, and a
 * list of invented services is a business advertising work it may not do.
 */
export interface ServicesFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The button on each card, unless the card carries a label of its own. */
  ctaLabel: string;
  /**
   * What that button does, or `null` when it can do nothing. See
   * `ServiceEnquiry` — absence is the whole check, as everywhere else.
   */
  enquiry: ServiceEnquiry | null;
  items: ServiceItem[];
}

/**
 * Optional functionality this tenant is entitled to **right now**.
 *
 * A key is `null` unless the plan granted it, the company switched it on, and
 * the plan is still being served — the API decides all three, so the template
 * renders on presence alone and never has to ask why something is missing.
 */
export interface SiteFeatures {
  whatsapp: WhatsappFeature | null;
  shareLink: ShareLinkFeature | null;
  /**
   * The tenant's own About copy. `null` is not "no About section" — that
   * section is part of the template — but "fall back to the company profile".
   * See `AboutSection`, which is the one place that decides.
   */
  about: AboutFeature | null;
  /** The band of figures. See `FiguresFeature` — absent is the whole check. */
  figures: FiguresFeature | null;
  team: TeamFeature | null;
  gallery: GalleryFeature | null;
  /**
   * Customer reviews. Absent unless the plan grants `testimonials`, the tenant
   * switched it on and the plan is still being served — and additionally absent
   * on a `static` wall with nothing on it yet, exactly like Team and Gallery. A
   * `dynamic` section survives being empty: the form is the point of it.
   */
  testimonials: TestimonialsFeature | null;
  /**
   * What the business offers, in the tenant's own words. Absent unless the plan
   * grants it, the tenant switched it on and wrote at least one card — so a
   * site that is not carrying the section simply has no block here.
   */
  benefits: BenefitsFeature | null;
  /**
   * What the business sells, in its own words. Absent unless the plan grants
   * it, the tenant switched it on and wrote at least one service — the same
   * signal the `/services` route and its menu entry are built on.
   */
  services: ServicesFeature | null;
}

/**
 * How the Contact page reads. Never null: the page is not gated, so a tenant
 * that has never opened the screen still gets a working one from the defaults.
 */
export interface ContactPage {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The enquiry form has no server — it hands off to WhatsApp or a mail app. */
  showForm: boolean;
  formTarget: 'email' | 'whatsapp';
  formNote: string;
  showLocations: boolean;
}

/** Why a tenant's website is not being served. `null` when it is. */
export type ServiceReason = 'expired' | 'suspended' | 'no_plan';

/**
 * Whether this tenant's plan still entitles it to be served. Coarse on purpose —
 * the API withholds plan names, prices and dates from a public endpoint.
 */
export interface CompanyService {
  active: boolean;
  reason: ServiceReason | null;
}

export interface CompanyDetails {
  /** False when the domain matched no tenant — the platform defaults are returned. */
  resolved: boolean;
  /** The domain that was actually sent to the API. */
  host: string;
  code: string | null;
  name: string;
  legalName: string | null;
  description: string | null;
  logo: string | null;
  favicon: string | null;
  businessType: { id: number; name: string; slug: string | null } | null;
  theme: CompanyTheme | null;
  contact: CompanyContact;
  address: CompanyAddress;
  locale: { currency: string | null; timezone: string | null };
  /** The branch this domain is pinned to — null on a company-wide host. */
  branch: CompanyBranch | null;
  /** The head office, always present for a resolved tenant with branches. */
  headOffice: CompanyBranch | null;
  branches: CompanyBranch[];
  /** Active hero slides for this host, in the order the company arranged them. */
  sliders: CompanySlide[];
  /**
   * The menu, built by the API: one entry per page this tenant is publishing,
   * already named the way they named it. The template renders it as sent —
   * a page added to the platform later appears here and needs no change to
   * the site.
   */
  nav: NavEntry[];
  /** Optional functionality this tenant may show today. */
  features: SiteFeatures;
  /**
   * How the Contact page reads, or `null` when this tenant is not showing one:
   * the plan does not include `contact_page`, or the switch is off. The page
   * and its nav link disappear rather than rendering empty.
   */
  contactPage: ContactPage | null;
  service: CompanyService;
}

export interface NavEntry {
  /** Stable across renames — `home`, `about`, `contact`. */
  key: string;
  href: string;
  label: string;
}

const EMPTY_ADDRESS: CompanyAddress = {
  line1: null, line2: null, city: null, state: null, stateCode: null, country: null, pincode: null,
};

/** Used when the API is unreachable, so a network blip never blanks the site. */
export const FALLBACK_COMPANY: CompanyDetails = {
  resolved: false,
  host: '',
  code: null,
  name: 'Aj Smart Biz',
  legalName: null,
  description: null,
  logo: null,
  favicon: null,
  businessType: null,
  theme: null,
  contact: { email: null, phone: null, alternatePhone: null, website: null },
  address: EMPTY_ADDRESS,
  locale: { currency: null, timezone: null },
  branch: null,
  headOffice: null,
  branches: [],
  sliders: [],
  /**
   * With no answer from the API there is no tenant to name anything, so the
   * menu falls back to the template's own — see `NAV_LINKS`. Home only: the
   * other pages have nothing to show without a tenant behind them.
   */
  nav: [{ key: 'home', href: '/', label: 'Home' }],
  /**
   * No optional functionality without an answer from the API. Unlike `service`
   * below, the safe fallback here is "show nothing": a WhatsApp button with no
   * number behind it is worse than no button.
   */
  features: {
    whatsapp: null,
    shareLink: null,
    about: null,
    figures: null,
    team: null,
    gallery: null,
    testimonials: null,
    benefits: null,
    services: null,
  },
  /** Same rule as `features`: with no answer from the API, show nothing. */
  contactPage: null,
  /**
   * An unreachable API must not take every tenant's site down with it. The
   * holding page is for a plan the platform has actually stopped serving, not
   * for a network blip, so the fallback stays "serve the site".
   */
  service: { active: true, reason: null },
};

/** Turns a stored path (`/uploads/company/abc.png`) into something `<img src>` can use. */
export function toFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${FILES_URL}${path}`;
}

/** `4th Floor, Trade House, Ring Road, Surat, Gujarat 395002` — blanks dropped. */
export function formatAddress(address: CompanyAddress | null | undefined): string | null {
  if (!address) return null;
  const cityLine = [address.city, address.state].filter(Boolean).join(', ');
  const parts = [
    address.line1,
    address.line2,
    [cityLine, address.pincode].filter(Boolean).join(' ') || null,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length ? parts.join(', ') : null;
}

/** `09:30:00` -> `9:30 am`; anything unexpected is passed through untouched. */
export function formatTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/** Strips a scheme so `https://acme.test` reads as `acme.test` in the page. */
export const displayUrl = (url: string | null | undefined): string | null =>
  url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;

/** `+91 98765 43210` -> `+919876543210`, for a `tel:` href. */
export const telHref = (phone: string | null | undefined): string | null =>
  phone ? phone.replace(/[^\d+]/g, '') : null;

/** Fills `{company}` in copy the tenant wrote in the admin. */
export const fillCompany = (text: string, company: CompanyDetails): string =>
  text.replace(/\{company\}/g, company.name);

/**
 * The WhatsApp number a given button should use, or `null` when the feature is
 * not live for this tenant — which is the template's only cue not to render it.
 *
 * Optional chaining throughout because an older API, or an unreachable one,
 * leaves the block off entirely rather than sending an empty one.
 */
export const whatsappFor = (
  company: CompanyDetails,
  type: WhatsappType
): WhatsappNumber | null => company.features?.whatsapp?.byType?.[type] ?? company.features?.whatsapp?.primary ?? null;

/**
 * The number the company actually set for this type — no fallback.
 *
 * `whatsappFor` is right for a button that must work: an enquiry link reaching
 * the general line is better than no enquiry link. It is wrong for a button
 * that only earns its place by being *different*, such as a separate "support"
 * link in the footer, which would otherwise render as a second copy of the
 * contact link pointing at the same number.
 */
export const whatsappSetFor = (
  company: CompanyDetails,
  type: WhatsappType
): WhatsappNumber | null =>
  company.features?.whatsapp?.numbers?.find((entry) => entry.type === type) ?? null;

/** The share configuration, or `null` when the tenant may not show one. */
export const shareLinkOf = (company: CompanyDetails): ShareLinkFeature | null =>
  company.features?.shareLink ?? null;

/**
 * Whether a conditional section is actually on the page.
 *
 * The nav has to agree with what was rendered — a "Team" link that scrolls to
 * nothing is worse than no link — and both read this, so they cannot drift.
 */
export const hasSection = (company: CompanyDetails, href: string): boolean => {
  if (href === '#team') return Boolean(company.features?.team?.members?.length);
  if (href === '#gallery') return Boolean(company.features?.gallery?.items?.length);
  /**
   * A `dynamic` section renders with no reviews at all — the form is the
   * section — so presence of the block is the test here, not a row count.
   */
  if (href === '#testimonials') return Boolean(company.features?.testimonials);
  /**
   * Pages are decided by the API now — a withheld page is simply not in `nav` —
   * so anything with a real path is answered from there rather than by a rule
   * kept in step by hand.
   */
  if (href.startsWith('/')) return navOf(company).some((entry) => entry.href === href);
  return true;
};

/**
 * The menu to render. The API's, when it answered; the template's otherwise.
 *
 * A tenant whose plan is being served always has at least Home, so an empty
 * array means the API said nothing useful and the fallback is the honest
 * answer rather than a site with no navigation at all.
 */
export const navOf = (company: CompanyDetails): NavEntry[] =>
  company.nav?.length ? company.nav : FALLBACK_COMPANY.nav;
