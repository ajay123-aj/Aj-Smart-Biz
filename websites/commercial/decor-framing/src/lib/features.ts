import { FEATURES_COPY } from '@/config/site';
import { fillCompany, type BenefitCard, type CompanyDetails } from './company';

/**
 * What the Features / Benefits section should say — the capabilities the
 * business offers, and what each one means for the person reading.
 *
 * Same job, and nearly the same shape, as `resolveAbout`: the page lays the
 * section out and this decides what goes in it. Where the two part company is
 * what happens when the tenant has written nothing.
 *
 * About has a fallback, because the platform holds facts about a company —
 * its name, its trade, its address — that a section can be built from. It holds
 * nothing whatever about a company's *capabilities*. So this returns `null`
 * rather than reaching for the template's own words, and the section is absent
 * from the page: a band of six claims about how a business works, written by
 * nobody who has met it, is worse than no band at all.
 *
 * `null` therefore covers every way a tenant can be not showing this section,
 * and the component needs to tell none of them apart:
 *
 *   - the plan does not grant `features_benefits`
 *   - the company has the switch off
 *   - the plan has stopped being served
 *   - the switch is on but every card is inactive or deleted
 *
 * The API decides all four and simply omits the block, which is the same rule
 * Team and Gallery follow.
 */
export interface ResolvedFeatures {
  eyebrow: string;
  title: string;
  lede: string;
  /** The label on the button under the lede. */
  cta: string;
  items: BenefitCard[];
}

/**
 * The section for this tenant, or `null` when there is none to show.
 *
 * `FEATURES_COPY` is read only as a floor under each field. The API fills them
 * from its own defaults already, so these apply to a block that arrived with
 * something blank — a heading of empty space is the one outcome worth spending
 * a fallback on.
 */
export function resolveFeatures(company: CompanyDetails): ResolvedFeatures | null {
  const benefits = company.features?.benefits ?? null;
  if (!benefits?.items?.length) return null;

  return {
    eyebrow: benefits.eyebrow?.trim() || FEATURES_COPY.eyebrow,
    title: fillCompany(benefits.title?.trim() || FEATURES_COPY.title, company),
    lede: fillCompany(benefits.lead?.trim() || FEATURES_COPY.lede, company),
    cta: benefits.ctaLabel?.trim() || FEATURES_COPY.cta,
    items: benefits.items.map((item) => ({
      ...item,
      title: fillCompany(item.title, company),
      body: item.body ? fillCompany(item.body, company) : null,
    })),
  };
}
