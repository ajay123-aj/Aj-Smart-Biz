import type { Capability } from './api';

/**
 * Sorts the API's capability catalogue into the four outcomes a business owner
 * actually thinks in, so "what do I get?" reads as four answers rather than a
 * flat list of feature names.
 *
 * This is **presentation only**: which capabilities exist, what they are called
 * and what they do all still come from `GET /website/bootstrap`. This file only
 * says which heading a key sits under. A key it has never heard of (a new
 * feature added in the backend) is not lost — it lands in "And more", so the
 * site never hides something the platform sells.
 */
export const TONES = ['blue', 'green', 'orange', 'purple', 'pink'] as const;

export interface CapabilityGroup {
  key: string;
  title: string;
  summary: string;
  icon: string;
  /** The group's colour, used everywhere it appears. See `[data-tone]` in globals.css. */
  tone: 'blue' | 'green' | 'orange' | 'purple' | 'pink';
  items: Capability[];
}

const GROUPS: Omit<CapabilityGroup, 'items'>[] = [
  {
    key: 'website',
    title: 'Your website',
    summary: 'A professional site that tells people who you are and what you do.',
    icon: 'globe',
    tone: 'blue',
  },
  {
    key: 'sell',
    title: 'Sell online',
    summary: 'Show your products, take orders and get paid.',
    icon: 'shopping-cart',
    tone: 'green',
  },
  {
    key: 'stock',
    title: 'Stock & billing',
    summary: 'Know what is on the shelf and bill customers in seconds.',
    icon: 'receipt',
    tone: 'orange',
  },
  {
    key: 'leads',
    title: 'Leads & customers',
    summary: 'Never miss an enquiry, booking or returning customer.',
    icon: 'users',
    tone: 'purple',
  },
];

const GROUP_OF: Record<string, string> = {
  services: 'website',
  about_us: 'website',
  figures: 'website',
  team: 'website',
  gallery: 'website',
  contact_page: 'website',
  testimonials: 'website',
  features_benefits: 'website',
  blog: 'website',
  social_media: 'website',
  share_link: 'website',

  products: 'sell',
  orders: 'sell',
  whatsapp: 'sell',

  warehouse: 'stock',
  invoices: 'stock',

  customers: 'leads',
  service_enquiry: 'leads',
  service_booking: 'leads',
};

const OTHER: Omit<CapabilityGroup, 'items'> = {
  key: 'more',
  title: 'And more',
  summary: 'Extra tools added to the platform.',
  icon: 'sparkles',
    tone: 'pink',
};

/** Groups in display order; empty groups are dropped. */
export function groupCapabilities(capabilities: Capability[]): CapabilityGroup[] {
  const buckets = new Map<string, Capability[]>();
  for (const capability of capabilities) {
    const group = GROUP_OF[capability.key] ?? OTHER.key;
    buckets.set(group, [...(buckets.get(group) ?? []), capability]);
  }

  return [...GROUPS, OTHER]
    .map((group) => ({ ...group, items: buckets.get(group.key) ?? [] }))
    .filter((group) => group.items.length > 0);
}
