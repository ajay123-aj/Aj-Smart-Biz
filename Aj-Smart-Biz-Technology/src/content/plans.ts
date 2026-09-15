/**
 * The price list.
 *
 * **This is the one file to edit when a price changes**, and it is the only
 * place in the project where a rupee figure appears. Nothing here is computed
 * from anything else and nothing else computes from it beyond the helpers in
 * `lib/format.ts`, so a change made here is a change everywhere the number is
 * shown — the home page, the plans page and the plan picker on the demo form.
 *
 * Every plan is **monthly**, and that is the product rather than a pricing
 * experiment: the promise on this site is a recharge, like a phone connection,
 * with no year of hosting bought up front and nothing to cancel. A yearly plan
 * added later is another entry in this array with a different `billingCycle`,
 * not a change to anything that reads it.
 *
 * Two lists per plan, and they are deliberately different things:
 *
 *   `highlights`  the sales argument, in the customer's words. Ticked.
 *   `includes`    which capabilities from `capabilities.ts` this plan switches
 *                 on, by key. Shown as chips. An unknown key is dropped rather
 *                 than rendered raw, so retiring a capability removes it from
 *                 every card at once — see `lib/catalogue.ts`.
 */

import type { CapabilityKey } from './capabilities';

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

export interface Plan {
  /** Stable, and used in `/demo?plan=` — changing one invalidates old links. */
  id: string;
  name: string;
  tagline: string;
  /** In rupees. The list price. */
  price: number;
  /** Set to charge less than `price`; the card then shows the saving. */
  discountPrice?: number;
  currency: string;
  billingCycle: BillingCycle;
  limits: {
    branches: number;
    logins: number;
    /** In megabytes. Rendered as GB above 1024 — see `formatStorage`. */
    storageMb: number;
  };
  highlights: string[];
  includes: CapabilityKey[];
  /** At most one. A second "most popular" is a shop with two loudest items. */
  isPopular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline:
      'One business, one website, live tomorrow. Everything needed to be found, understood and phoned.',
    price: 499,
    currency: 'INR',
    billingCycle: 'monthly',
    limits: { branches: 1, logins: 1, storageMb: 1024 },
    highlights: [
      'Live in one working day',
      'Domain, hosting, SSL and backups included',
      'Unlimited edits — you ask, we publish',
      'Works on every phone, indexed by Google',
      'Support on WhatsApp, 10am to 8pm',
    ],
    includes: ['about', 'services', 'contact', 'whatsapp', 'share', 'figures'],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline:
      'For a business that has to be chosen, not just found — proof, pictures and people, and the enquiries they produce.',
    price: 999,
    currency: 'INR',
    billingCycle: 'monthly',
    limits: { branches: 2, logins: 3, storageMb: 4096 },
    isPopular: true,
    highlights: [
      'Everything in Starter',
      'Up to 2 branches, each with its own page',
      'Gallery, team and customer reviews',
      'Enquiry form, with every lead on your dashboard',
      'Monthly report: who visited, from where, on what',
    ],
    includes: [
      'about',
      'services',
      'contact',
      'whatsapp',
      'share',
      'figures',
      'team',
      'gallery',
      'reviews',
      'benefits',
      'enquiries',
      'blog',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tagline:
      'A website that takes work in: a bookable diary, a catalogue with prices, and orders that arrive as orders.',
    price: 1999,
    currency: 'INR',
    billingCycle: 'monthly',
    limits: { branches: 5, logins: 8, storageMb: 10240 },
    highlights: [
      'Everything in Growth',
      'Up to 5 branches',
      'Online bookings with real slots and timings',
      'Product catalogue, offers and online orders',
      'Customer accounts with order and booking history',
      'Priority support, same working day',
    ],
    includes: [
      'about',
      'services',
      'contact',
      'whatsapp',
      'share',
      'figures',
      'team',
      'gallery',
      'reviews',
      'benefits',
      'enquiries',
      'blog',
      'bookings',
      'products',
      'orders',
      'customers',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline:
      'Many branches, real stock, and a team running all of it — everything we can do, with none of it switched off.',
    price: 3999,
    currency: 'INR',
    billingCycle: 'monthly',
    limits: { branches: 25, logins: 25, storageMb: 51200 },
    highlights: [
      'Everything in Business',
      'Up to 25 branches, each with its own site',
      'Warehouses and live stock across branches',
      'Staff roles and permissions',
      'A named account manager',
    ],
    includes: [
      'about',
      'services',
      'contact',
      'whatsapp',
      'share',
      'figures',
      'team',
      'gallery',
      'reviews',
      'benefits',
      'enquiries',
      'blog',
      'bookings',
      'products',
      'orders',
      'customers',
      'stock',
    ],
  },
];
