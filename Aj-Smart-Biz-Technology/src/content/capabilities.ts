/**
 * What a website built on Aj Smart Biz can be made of.
 *
 * Each entry is one section of a customer's site and one screen in their
 * dashboard. `plans.ts` refers to these by key, so this file is the vocabulary
 * the price list is written in — and the reason a plan cannot promise something
 * that does not exist.
 *
 * `CapabilityKey` is a union rather than `string` on purpose: a typo in a plan's
 * `includes` is then a build error instead of a chip that silently fails to
 * render. Adding a capability means adding it here first, which is the right
 * order anyway.
 *
 * The keys mirror the platform's own functionality catalogue in
 * `Aj-Smart-Biz-Backend/src/constants` — the list the super admin ticks onto a
 * plan. Kept in step by hand today, and the obvious thing to serve from the API
 * later; see the README.
 */

export type CapabilityKey =
  | 'about'
  | 'services'
  | 'contact'
  | 'whatsapp'
  | 'share'
  | 'figures'
  | 'team'
  | 'gallery'
  | 'reviews'
  | 'benefits'
  | 'enquiries'
  | 'bookings'
  | 'products'
  | 'orders'
  | 'customers'
  | 'stock'
  | 'blog';

export interface Capability {
  key: CapabilityKey;
  name: string;
  /** A name from the glyph library — see `components/Glyph.tsx`. */
  icon: string;
  /** One line, for a card. */
  summary: string;
  /** The detail, shown on the Services page only. */
  description: string;
}

export const CAPABILITIES: Capability[] = [
  {
    key: 'services',
    name: 'Services',
    icon: 'briefcase',
    summary: 'What your business does, written and priced by you.',
    description:
      'A card per service with a picture or an icon, what is included, and an optional price line. The menu name is yours, so a studio can call it Work and a clinic can call it Treatments.',
  },
  {
    key: 'about',
    name: 'About us',
    icon: 'file-text',
    summary: 'Your story, in your own words, per branch where it differs.',
    description:
      'Your own heading, introduction and paragraphs, written once or written differently for each branch when a branch needs to say something of its own.',
  },
  {
    key: 'contact',
    name: 'Contact page',
    icon: 'mail',
    summary: 'Addresses, timings, a map and a form that reaches you.',
    description:
      'Every branch with its own address, phone and opening hours, plus an enquiry form that lands wherever you want it — your inbox, your WhatsApp, or your dashboard.',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    icon: 'message-circle',
    summary: 'A chat button on every page, pointed at the right number.',
    description:
      'A floating chat button and inline "WhatsApp us" actions, each going to the number you set for that kind of conversation — sales to one phone, service to another.',
  },
  {
    key: 'share',
    name: 'Share link',
    icon: 'share-2',
    summary: 'So a happy customer can pass your website on.',
    description:
      'A share action that uses the phone’s own share sheet where it exists, and copy-link plus per-channel links everywhere else.',
  },
  {
    key: 'figures',
    name: 'Your numbers',
    icon: 'bar-chart-3',
    summary: 'Years in business, customers served, projects done.',
    description:
      'A band of figures with your own labels. A figure can be fixed, or counted from a date — so "Years in business" is right next year without anyone editing it.',
  },
  {
    key: 'team',
    name: 'Team',
    icon: 'users',
    summary: 'The people, because people are what gets chosen.',
    description:
      'A photograph, a name, a role and a line of their own for each person, ordered the way you want them introduced.',
  },
  {
    key: 'gallery',
    name: 'Gallery',
    icon: 'image',
    summary: 'Your work, at a size that still loads on a weak signal.',
    description:
      'Photographs grouped how you like, compressed and sized by us so a gallery of fifty pictures still opens quickly on a phone with two bars.',
  },
  {
    key: 'reviews',
    name: 'Reviews',
    icon: 'quote',
    summary: 'Ratings and words from real customers, approved by you.',
    description:
      'Customers can leave a review from the site. Nothing appears until you approve it, so the page is proof rather than a risk.',
  },
  {
    key: 'benefits',
    name: 'Why choose us',
    icon: 'sparkles',
    summary: 'The reasons to pick you over the shop down the road.',
    description:
      'A short grid of what you do differently — each with an icon, a heading and a line. The section most likely to turn a browser into a call.',
  },
  {
    key: 'enquiries',
    name: 'Enquiries',
    icon: 'inbox',
    summary: 'Every enquiry recorded, none of them lost in a mailbox.',
    description:
      'Enquiries arrive on your dashboard and on WhatsApp, tagged with which service the person was reading when they asked — so you know what to talk about before you call.',
  },
  {
    key: 'bookings',
    name: 'Appointments',
    icon: 'calendar',
    summary: 'A real diary, with your slots and your timings.',
    description:
      'Customers pick from slots you actually have free, per branch and per service. You confirm or move a booking from the dashboard, and they are told.',
  },
  {
    key: 'products',
    name: 'Products',
    icon: 'package',
    summary: 'A catalogue with categories, prices and offers.',
    description:
      'Products in categories, with photographs, prices, variants and an offers section. Priced or on enquiry, your choice per product.',
  },
  {
    key: 'orders',
    name: 'Cart & orders',
    icon: 'shopping-cart',
    summary: 'Orders that arrive as orders, not as a confusing email.',
    description:
      'A basket, a checkout and an order that lands on your dashboard with the items, the quantities, the address and a number you can call.',
  },
  {
    key: 'customers',
    name: 'Customer accounts',
    icon: 'user-round',
    summary: 'Your regulars sign in and see their own history.',
    description:
      'Customers sign in with a one-time code on their phone and see their past orders, bookings and addresses — so a repeat order takes two taps.',
  },
  {
    key: 'stock',
    name: 'Warehouse & stock',
    icon: 'warehouse',
    summary: 'Live stock across branches, so you never oversell.',
    description:
      'Stock per warehouse and per branch, moved and adjusted from the dashboard, with the website showing what is actually available right now.',
  },
  {
    key: 'blog',
    name: 'Blog',
    icon: 'newspaper',
    summary: 'Articles that bring you search traffic month after month.',
    description:
      'Posts with pictures, tags and proper titles and descriptions, which is the cheapest way to keep arriving in search results for the questions your customers type.',
  },
];
