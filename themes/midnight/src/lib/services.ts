import { SERVICES_COPY } from '@/config/site';
import {
  fillCompany,
  type CompanyDetails,
  type ServiceBooking,
  type ServiceCategoryNode,
  type ServiceItem,
  type ServicesFeature,
} from './company';

/**
 * What the Services section should say — the things the business sells, and
 * what each of them is and costs.
 *
 * The same job as `resolveFeatures`, and it takes the same hard line on
 * fallbacks, for a stronger reason. About has a fallback because the platform
 * holds facts about a company — its name, its trade, its city — that a section
 * can honestly be built from. It holds nothing about what a company *sells*,
 * and a service nobody offers is not a weak section: it is a business
 * advertising work it may not do, and a customer ringing up about it.
 *
 * So this returns `null` rather than reaching for wording of its own, and
 * `null` covers every way a tenant can be not showing services — the component
 * needs to tell none of them apart:
 *
 *   - the plan does not grant `services`
 *   - the company has the switch off
 *   - the plan has stopped being served
 *   - the switch is on but every service is inactive or deleted
 *
 * The API decides all four and omits the block, which is the same rule Team,
 * Gallery and the benefit cards follow. It is also what decides the `/services`
 * route and the menu entry, so the page, the link and the band can never
 * disagree about whether this tenant publishes services.
 */
export interface ResolvedServices {
  eyebrow: string;
  title: string;
  lede: string;
  /** The label on each card's button, where the card has none of its own. */
  cta: string;
  /** What that button does, or null when it can do nothing. */
  enquiry: ServicesFeature['enquiry'];
  /** What is being rendered here, after any limit was applied. */
  items: ServiceItem[];
  /** Everything the tenant publishes, before the limit. */
  total: number;
  /** True when `items` is a shortened list and there is more to see. */
  truncated: boolean;

  /** The taxonomy, already pruned of anything empty by the API. */
  categories: ServiceCategoryNode[];
  /** The services on offer, featured first. */
  offers: ServiceItem[];
  /** The diary, or null when this tenant is not taking appointments. */
  booking: ServiceBooking | null;

  /* The two other bands' wording. Held here rather than in the components so
     that the page, the band and the archive all say the same thing. */
  categoriesEyebrow: string;
  categoriesTitle: string;
  categoriesLede: string;
  offersEyebrow: string;
  offersTitle: string;
  offersLede: string;
}

/**
 * The section for this tenant, or `null` when there is none to show.
 *
 * `limit` shortens the list without changing anything else about it — the home
 * page shows the first few and links to the page, the page itself passes no
 * limit. Deliberately a count rather than a variant: a section that reworded
 * itself per page is exactly what `CtaBand` was written to undo, so the copy is
 * the same in both places and only the length differs.
 *
 * `SERVICES_COPY` is read only as a floor under each field. The API fills them
 * from its own defaults already, so these apply to a block that arrived with
 * something blank — a heading of empty space is the one outcome worth spending
 * a fallback on.
 */
export function resolveServices(
  company: CompanyDetails,
  limit?: number,
  options: { variant?: 'all' | 'offers'; category?: string | null } = {}
): ResolvedServices | null {
  const services = company.features?.services ?? null;
  if (!services?.items?.length) return null;

  /**
   * Which list this is.
   *
   * `offers` is the band a salon wants read first, and it is a **subset of the
   * same items** rather than a second source - the API partitions them, so a
   * service cannot be on the offers band and missing from the price list.
   */
  const source = options.variant === 'offers' ? services.offers ?? [] : services.items;
  if (!source.length) return null;

  /**
   * A category filter, matched against the whole **path** rather than the leaf.
   *
   * Picking `Hair` shows everything under `Hair › Colour` too, which is what a
   * visitor means by it. A slug that names nothing falls through to the full
   * list rather than to an empty page: a stale link somebody shared should show
   * the shop, not a dead end.
   */
  const filtered = options.category
    ? source.filter((item) => item.categoryPath?.some((step) => step.slug === options.category))
    : source;
  const all = filtered.length ? filtered : source;

  const items = typeof limit === 'number' && limit > 0 ? all.slice(0, limit) : all;

  return {
    eyebrow: services!.eyebrow?.trim() || SERVICES_COPY.eyebrow,
    title: fillCompany(services!.title?.trim() || SERVICES_COPY.title, company),
    lede: fillCompany(services!.lead?.trim() || SERVICES_COPY.lede, company),
    cta: services!.ctaLabel?.trim() || SERVICES_COPY.cta,
    /* Passed through as sent. Whether the button can do anything is the API's
       answer, not something to re-derive from a number here. */
    enquiry: services!.enquiry ?? null,
    items: items.map((item) => ({
      ...item,
      title: fillCompany(item.title, company),
      summary: item.summary ? fillCompany(item.summary, company) : null,
      // Normalised by the API already; guarded here too, because a card printing
      // a tick list is one `.map` away from taking the page down with it.
      highlights: Array.isArray(item.highlights) ? item.highlights.filter(Boolean) : [],
      /* Trimmed here so a label of spaces falls back to the section's rather
         than rendering as a button with nothing on it. */
      ctaLabel: item.ctaLabel?.trim() || null,
    })),
    total: all.length,
    truncated: items.length < all.length,

    categories: services.categories ?? [],
    offers: services.offers ?? [],
    /* Passed through as sent. Whether a slot can be taken is the API's answer,
       not something to re-derive from a set of opening hours here. */
    booking: services.booking ?? null,

    categoriesEyebrow: services.categoriesEyebrow?.trim() || SERVICES_COPY.categoriesEyebrow,
    categoriesTitle: fillCompany(services.categoriesTitle?.trim() || SERVICES_COPY.categoriesTitle, company),
    categoriesLede: fillCompany(services.categoriesLead?.trim() || SERVICES_COPY.categoriesLede, company),
    offersEyebrow: services.offersEyebrow?.trim() || SERVICES_COPY.offersEyebrow,
    offersTitle: fillCompany(services.offersTitle?.trim() || SERVICES_COPY.offersTitle, company),
    offersLede: fillCompany(services.offersLead?.trim() || SERVICES_COPY.offersLede, company),
  };
}

/**
 * What a service costs, resolved in the **one** order every surface reads it in.
 *
 * Three fields, three answers, and the order is the whole of the rule:
 *
 *  1. `priceLabel` wins outright. A business that wrote "From ₹4,999" meant it,
 *     and a number printed beside those words would contradict them.
 *  2. Then the offer pair - today's price, with the old one struck through.
 *  3. Then the plain price.
 *
 * `null` means the tenant is not publishing a price for this service at all,
 * which is a real state and not a missing one: the API withholds both the words
 * and the figures when `showPrice` is off. The card then shows nothing rather
 * than "₹0".
 */
export function servicePrice(
  item: ServiceItem,
  company: CompanyDetails
): { now: string; was: string | null; words: boolean; saving: number | null } | null {
  if (item.priceLabel) return { now: item.priceLabel, was: null, words: true, saving: null };

  const money = (value: number) => formatMoney(value, company);

  if (item.offerPrice !== null && item.price !== null && item.offerPrice < item.price) {
    return { now: money(item.offerPrice), was: money(item.price), words: false, saving: item.discountPercent };
  }

  if (item.price !== null) return { now: money(item.price), was: null, words: false, saving: null };

  return null;
}

/**
 * Money in the tenant's own currency, formatted where the server can and printed
 * plainly where it cannot.
 *
 * `Intl` is given the company's currency and a fixed `en-IN` locale rather than
 * the reader's: a price formatted per-visitor renders differently on the server
 * and in the browser, which React reports as a hydration mismatch.
 */
export function formatMoney(value: number, company: CompanyDetails): string {
  const currency = company.locale?.currency || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return String(value);
  }
}

/** How long an appointment takes, said the way a person would. */
export function durationLabel(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
  return rest ? `${hourPart} ${rest} min` : hourPart;
}

/** One service by slug, or null. The detail page's only lookup. */
export function findService(company: CompanyDetails, slug: string): ServiceItem | null {
  return company.features?.services?.items?.find((item) => item.slug === slug) ?? null;
}

/** Every category as a flat list, parents before children - for a filter row. */
export function flattenCategories(nodes: ServiceCategoryNode[], depth = 0): { node: ServiceCategoryNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flattenCategories(node.children ?? [], depth + 1)]);
}
