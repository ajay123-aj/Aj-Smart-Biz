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
  service: CompanyService;
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
