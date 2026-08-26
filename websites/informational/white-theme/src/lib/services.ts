import { SERVICES_COPY } from '@/config/site';
import { fillCompany, type CompanyDetails, type ServiceItem, type ServicesFeature } from './company';

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
export function resolveServices(company: CompanyDetails, limit?: number): ResolvedServices | null {
  const services = company.features?.services ?? null;
  const all = services?.items ?? [];
  if (!all.length) return null;

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
  };
}
