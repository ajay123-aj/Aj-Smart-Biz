/**
 * The shape `GET /public/company-details` answers with, and the one helper both
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
 * One figure in the About band. The API has already done the arithmetic — a
 * card counting years from a date arrives as a finished string — so the
 * template renders `display` and never computes anything itself.
 */
export interface AboutStat {
  id: number;
  label: string;
  display: string;
}

export interface AboutFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** Blank lines separate paragraphs. */
  body: string;
  stats: AboutStat[];
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

export interface TeamFeature {
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

export interface GalleryFeature {
  items: GalleryImage[];
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
  team: TeamFeature | null;
  gallery: GalleryFeature | null;
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
  features: { whatsapp: null, shareLink: null, about: null, team: null, gallery: null },
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
