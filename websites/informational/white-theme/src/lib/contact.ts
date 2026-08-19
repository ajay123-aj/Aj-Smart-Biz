import { CONTACT_FALLBACK } from '@/config/site';
import {
  formatAddress,
  formatTime,
  type CompanyDetails,
} from './company';

export interface SiteContact {
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  website: string | null;
  address: string | null;
  hours: string | null;
  /** True when nothing above came from the API, so the page can say so. */
  placeholder: boolean;
}

/**
 * What the contact block and footer should show.
 *
 * The company's own details win. Where the company left a field empty the branch
 * fills it in — the one this domain is pinned to, otherwise the head office — so
 * a tenant that put its phone number on a branch and not on the company record
 * still gets a usable footer. Only when a host resolved to no tenant at all do
 * the template's placeholders appear.
 */
export function siteContact(company: CompanyDetails): SiteContact {
  const branch = company.branch ?? company.headOffice;

  const email = company.contact.email ?? branch?.email ?? null;
  const phone = company.contact.phone ?? branch?.phone ?? null;
  const address = formatAddress(branch?.address) ?? formatAddress(company.address);

  const opening = formatTime(branch?.openingTime);
  const closing = formatTime(branch?.closingTime);
  const hours = opening && closing ? `${opening} – ${closing}` : null;

  if (!company.resolved && !email && !phone && !address) {
    return { ...CONTACT_FALLBACK, alternatePhone: null, website: null, placeholder: true };
  }

  return {
    email: email ?? CONTACT_FALLBACK.email,
    phone: phone ?? CONTACT_FALLBACK.phone,
    alternatePhone: company.contact.alternatePhone,
    website: company.contact.website,
    address: address ?? CONTACT_FALLBACK.address,
    hours: hours ?? CONTACT_FALLBACK.hours,
    placeholder: false,
  };
}
