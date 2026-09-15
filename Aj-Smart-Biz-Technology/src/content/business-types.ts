/**
 * The trades we build for.
 *
 * The claim on this site is that it will build for any business, and the honest
 * way to make a claim like that is to show a list and then say plainly what
 * happens when yours is not on it — which is what the last tile in the grid and
 * the "Something else" option on the demo form are for.
 *
 * The first three mirror the templates that actually exist in `themes/`
 * (informational, salon, decor-framing). The rest are served on the
 * informational template until they earn one of their own, which is a real
 * distinction and not a marketing one: adding a trade here promises a website,
 * not a bespoke design.
 */

export interface BusinessType {
  slug: string;
  name: string;
  /** A name from the glyph library — see `components/Glyph.tsx`. */
  icon: string;
  description: string;
}

export const BUSINESS_TYPES: BusinessType[] = [
  {
    slug: 'retail-shop',
    name: 'Retail shop',
    icon: 'shopping-bag',
    description: 'A catalogue, prices, offers, and orders arriving on WhatsApp instead of in a queue.',
  },
  {
    slug: 'salon-spa',
    name: 'Salon & spa',
    icon: 'scissors',
    description: 'A treatment menu, a real booking diary, and the reviews that keep it full.',
  },
  {
    slug: 'restaurant-cafe',
    name: 'Restaurant & cafe',
    icon: 'utensils',
    description: 'Menus that change, photographs that sell them, and a table booking without an app.',
  },
  {
    slug: 'clinic-healthcare',
    name: 'Clinic & healthcare',
    icon: 'heart-pulse',
    description: 'Services, timings, doctors on duty, and an appointment request that reaches reception.',
  },
  {
    slug: 'gym-fitness',
    name: 'Gym & fitness',
    icon: 'dumbbell',
    description: 'Memberships, class timetables, trainers, and a trial booking that lands on your phone.',
  },
  {
    slug: 'education-coaching',
    name: 'Education & coaching',
    icon: 'graduation-cap',
    description: 'Courses, batches, faculty and results — with an admission enquiry parents will finish.',
  },
  {
    slug: 'real-estate',
    name: 'Real estate',
    icon: 'building-2',
    description: 'Listings with galleries, locality pages, and a site-visit request per property.',
  },
  {
    slug: 'construction-interior',
    name: 'Construction & interiors',
    icon: 'hard-hat',
    description: 'Projects as portfolios — before and after, materials, the team, and a quotation request.',
  },
  {
    slug: 'professional-services',
    name: 'Professional services',
    icon: 'briefcase',
    description: 'CAs, advocates, consultants and agencies — credentials, services, a consultation request.',
  },
  {
    slug: 'automobile',
    name: 'Automobile',
    icon: 'car',
    description: 'Showrooms, garages and detailers — a service menu, a diary, and the pickup you offer.',
  },
  {
    slug: 'travel-hospitality',
    name: 'Travel & hospitality',
    icon: 'plane',
    description: 'Packages, rooms and itineraries, with an enquiry that arrives before they change their mind.',
  },
  {
    slug: 'events-photography',
    name: 'Events & photography',
    icon: 'camera',
    description: 'A gallery that loads fast on a phone, priced packages, and a date-availability enquiry.',
  },
  {
    slug: 'decor-framing',
    name: 'Decor & framing',
    icon: 'layers',
    description: 'A price list for the bench, a diary, and a shelf that takes orders.',
  },
  {
    slug: 'manufacturing-trading',
    name: 'Manufacturing & trading',
    icon: 'factory',
    description: 'Ranges, specifications, certifications, and a bulk enquiry that reaches sales.',
  },
];
