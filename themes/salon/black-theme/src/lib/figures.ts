import { STATS_COPY } from '@/config/site';
import { fillCompany, type CompanyDetails, type Figure, type SectionCopy } from './company';

/**
 * The band of figures a site should show, or `null` when there is none.
 *
 * A resolver rather than a straight read of `company.features.figures` for one
 * reason: `{company}` in the heading has to be filled in, and that is the
 * template's job — the API does not know what name a given host resolved to any
 * more than it knows which theme is rendering. Everything else on the block is
 * already complete when it arrives, so this fills a placeholder and hands the
 * rest through unchanged.
 *
 * The absence is the whole entitlement check. The API omits `figures` when the
 * plan does not grant it, when the tenant has switched it off, when the plan
 * has stopped being served, and when every figure resolves to nothing — so a
 * caller that renders what this returns cannot get any of those four wrong.
 * There is deliberately no fallback set of figures: "250+ projects delivered"
 * is a claim, and the template has no business making it on a real business's
 * behalf. The *wording* above them is safe to supply and `STATS_COPY` does,
 * since a heading over a company's own numbers claims nothing the numbers do
 * not already claim.
 */
export interface ResolvedFigures extends SectionCopy {
  items: Figure[];
}

export function resolveFigures(company: CompanyDetails): ResolvedFigures | null {
  const figures = company.features?.figures;
  if (!figures?.items?.length) return null;

  return {
    /*
     * Field by field rather than `?? STATS_COPY`, so a block that arrives with
     * one field blank — an older API, a hand-edited row — does not lose the
     * other two to the fallback along with it.
     */
    eyebrow: figures.eyebrow?.trim() || STATS_COPY.eyebrow,
    title: fillCompany(figures.title?.trim() || STATS_COPY.title, company),
    lead: figures.lead?.trim() || STATS_COPY.lead,
    items: figures.items,
  };
}
