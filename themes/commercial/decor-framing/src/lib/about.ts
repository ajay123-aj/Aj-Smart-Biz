import { ABOUT_FALLBACK } from '@/config/site';
import { fillCompany, type CompanyDetails } from './company';

/**
 * What the About page should say, whichever of three sources it comes from.
 *
 * Lives here rather than in the page so the resolution order is written down
 * once and is testable on its own — the page's job is to lay it out.
 *
 *   1. the tenant's own copy, when the plan grants About and it is switched on
 *   2. the company profile — its description and where it is based — when not
 *   3. the template's placeholder prose, only when the host resolved to no
 *      tenant at all and there is nothing to say about anybody
 *
 * The figures are deliberately not here any more. They are their own feature
 * with their own block on the payload — see `resolveFigures` — because they
 * are shown on the home page, which resolves no About copy at all.
 */
export interface ResolvedAbout {
  eyebrow: string;
  title: string;
  lead: string;
  paragraphs: string[];
  /** True when the tenant actually wrote this, rather than it being derived. */
  authored: boolean;
}

export function resolveAbout(company: CompanyDetails): ResolvedAbout {
  const about = company.features?.about ?? null;

  const paragraphs = (about?.body ?? '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  /**
   * The company's own description is the honest fallback lead: it is what the
   * business says about itself everywhere else on the platform. Only a host
   * that matched no tenant falls all the way through to the template's copy.
   */
  const lead =
    about?.lead?.trim() ||
    company.description?.trim() ||
    (company.resolved ? '' : ABOUT_FALLBACK.lead);

  /**
   * Without the feature there is no body, so the page would be a heading and
   * one line. A resolved tenant gets a sentence built from what the platform
   * actually knows — where it is based — rather than invented prose.
   */
  const derived =
    paragraphs.length > 0
      ? []
      : company.resolved
        ? [placeFromProfile(company)].filter((line): line is string => Boolean(line))
        : [...ABOUT_FALLBACK.paragraphs];

  return {
    eyebrow: about?.eyebrow?.trim() || ABOUT_FALLBACK.eyebrow,
    title: fillCompany(about?.title?.trim() || ABOUT_FALLBACK.title, company),
    lead,
    paragraphs: [...paragraphs, ...derived],
    authored: Boolean(about),
  };
}

/** "Working out of Ahmedabad, Gujarat." — only when the profile actually says so. */
function placeFromProfile(company: CompanyDetails): string | null {
  const branch = company.branch ?? company.headOffice;
  const address = branch?.address ?? company.address;
  const place = [address?.city, address?.state].filter(Boolean).join(', ');
  if (!place) return null;

  const count = company.branches.length;
  return count > 1
    ? `Working out of ${place}, with ${count} locations in all.`
    : `Working out of ${place}.`;
}
