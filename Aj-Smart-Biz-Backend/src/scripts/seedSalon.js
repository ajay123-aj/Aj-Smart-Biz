'use strict';

/**
 * **Aj Salon** — one complete tenant, end to end.
 *
 *     npm run db:seed:salon
 *
 * The company that the `themes/midnight` template was built against.
 * Everything that template renders arrives from the API, so everything that
 * template renders has to exist as **rows**: the salon itself, its plan, its
 * domain, its service menu, its retail shelf, its people, its reviews and its
 * articles. Not one line of it is written into the website.
 *
 * Nothing here is new platform behaviour. It writes through the same models and
 * the same `createCompany` service the super-admin console writes through, so a
 * tenant seeded by this script is indistinguishable from one somebody typed in
 * — which is the point. No controller, route, validator, model or service was
 * touched to make this work.
 *
 * **Idempotent.** Every row is matched first (a company by `code`, a service or
 * product by `slug`, a category by `name`) and only created when it is missing,
 * so re-running adds whatever is absent and leaves everything else — including
 * anything edited by hand in the admin — exactly where it is.
 *
 * The photographs are **generated placeholders**, written to `uploads/*` as
 * `seed-*.svg` and labelled as samples in the corner, exactly as
 * `seedCatalogue` and `seedBlog` do. They exist so a gallery, a thumbnail strip
 * and an image-count badge have something to show. Delete the `seed-` prefixed
 * files and they are gone.
 */

const { sequelize, ensureDatabaseExists } = require('../config/database');
const db = require('../models');
const { uniqueSlug, slugify } = require('../utils/slug');
const { writePlaceholder } = require('../utils/placeholderImage');
const logger = require('../utils/logger');
const { createCompany } = require('../services/company.service');
const functionalityService = require('../services/functionality.service');
const {
  STATUS,
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  PRODUCT_STOCK,
  STAT_MODE,
  STAT_UNIT,
  WHATSAPP_TYPE,
  TESTIMONIAL_MODE,
  TESTIMONIAL_REVIEW_TARGET,
  TESTIMONIAL_SOURCE,
  TESTIMONIAL_MODERATION,
  CONTACT_FORM_TARGET,
  BILLING_CYCLE,
  ORDER_MODE,
  SHARE_CHANNEL,
} = require('../constants');

/* ------------------------------------------------------------------ *
 * Who the tenant is
 * ------------------------------------------------------------------ */

/**
 * The host the black theme is served on.
 *
 * `salon.localhost` rather than `localhost`, and that is not cosmetic: the host
 * resolver strips the port before it looks a tenant up, so `localhost:4400` and
 * `localhost:4500` are the *same host* and could not name two companies. A
 * label in front of it is what separates them, and every browser resolves
 * `*.localhost` to the loopback without a hosts-file entry.
 */
const DOMAIN = 'salon.localhost';

const COMPANY = {
  name: 'Aj Salon',
  code: 'AJSALON',
  legalName: 'Aj Salon & Studio LLP',
  description: 'Hair, skin and nails, by appointment.',
  email: 'hello@ajsalon.in',
  phone: '9825012345',
  alternatePhone: '9825012346',
  website: 'https://ajsalon.in',
  addressLine1: '2nd Floor, Iscon Emporio',
  addressLine2: 'Off S G Highway, Satellite',
  city: 'Ahmedabad',
  pincode: '380015',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

/**
 * The business type, which is what decides that this tenant is served the salon
 * template rather than the informational one. A row, not a branch in any code —
 * see `themes/README.md`.
 */
const BUSINESS_TYPE = { name: 'Salon & Spa', slug: 'salon-spa' };

/**
 * The theme, and the only place the black surface is a *tenant's* choice rather
 * than the template's.
 *
 * The template paints its own near-blacks; what a theme supplies is the accent
 * on top of them, and on a dark ground that accent has to be the **lighter** of
 * the pair or a button stops reading as a button. So `primaryColor` is the gold
 * and `secondaryColor` is a lighter gold for the hover — the inverse of how the
 * white theme's charcoal pair is ordered. See the layout's `themeVariables`.
 */
const THEME = {
  name: 'Aj Midnight',
  code: 'aj-midnight',
  primaryColor: '#e0b973',
  secondaryColor: '#f2d9a3',
  accentColor: '#d8b45f',
  textColor: '#f4f2ee',
  backgroundColor: '#09090b',
  sidebarColor: '#141418',
  mode: 'dark',
};

/**
 * The plan, and the reason the site has anything on it at all.
 *
 * A feature reaches a visitor only when the **plan** grants it, the **company**
 * switches it on, and the plan is still being **served** — three gates, and this
 * is the first of them. A salon runs the whole surface: a price list, a diary,
 * a retail shelf that takes orders, accounts, reviews and a blog. So the plan
 * carries every key rather than a subset, and the seeder can then switch each
 * one on below without quietly widening an entitlement nobody sold.
 */
const PLAN = {
  name: 'Salon Complete',
  code: 'SALON-COMPLETE',
  description: 'Everything a salon needs on its website: menu, diary, shelf, reviews and journal.',
  price: 2499,
  currency: 'INR',
  billingCycle: BILLING_CYCLE.YEARLY,
  maxBranches: 3,
  maxAdmins: 5,
  maxUsers: 25,
  storageMb: 8192,
  functionalities: FUNCTIONALITY_VALUES,
  isPopular: true,
  sequence: 10,
};

/* ------------------------------------------------------------------ *
 * The hero
 * ------------------------------------------------------------------ */

/**
 * The slides, which replace the three every company is born with.
 *
 * `createCompany` seeds the platform's generic set so a brand new tenant never
 * has an empty carousel; a salon that has actually been set up should not still
 * be running them, so the defaults are retired rather than deleted — the same
 * thing a company would do in Slider Management.
 */
const SLIDES = [
  {
    eyebrow: 'Ahmedabad',
    title: 'Aj Salon',
    subtitle: 'Hair, skin and nails, by appointment. One stylist from the consultation to the last check in the mirror.',
    ctaLabel: 'Book a time',
    ctaUrl: '/services',
    sequence: 1,
  },
  {
    eyebrow: 'Colour',
    title: 'Balayage, gloss and global',
    subtitle: 'Colour is quoted after a strand test, never before one. What we tell you at the basin is what you pay at the counter.',
    ctaLabel: 'See the menu',
    ctaUrl: '/services',
    sequence: 2,
  },
  {
    eyebrow: 'On the shelf',
    title: 'What we use, you can take home',
    subtitle: 'The same shampoos, masks and serums we work with at the basin — nothing on the shelf that is not used in the chair.',
    ctaLabel: 'Browse the shelf',
    ctaUrl: '/products',
    sequence: 3,
  },
];

/* ------------------------------------------------------------------ *
 * The service menu
 * ------------------------------------------------------------------ */

/**
 * Seven categories, which is the shape a salon menu actually takes. Flat rather
 * than nested: a treatment list is browsed, not drilled into, and a visitor
 * looking for a haircut should not have to open *Hair › Cutting › Ladies*.
 */
const SERVICE_CATEGORIES = [
  {
    name: 'Hair Cut & Styling',
    icon: 'spark',
    featured: true,
    description: 'Cuts, blow-dries and finishing, for every length and texture.',
  },
  {
    name: 'Hair Colour',
    icon: 'star',
    featured: true,
    description: 'Global colour, highlights, balayage and root touch-ups, always after a strand test.',
  },
  {
    name: 'Hair Treatments',
    icon: 'leaf',
    featured: true,
    description: 'Keratin, botox, smoothening and the repair work that comes after them.',
  },
  {
    name: 'Skin & Facials',
    icon: 'heart',
    featured: true,
    description: 'Cleanups, facials and peels, chosen after a look at the skin rather than from a list.',
  },
  {
    name: 'Nails',
    icon: 'tag',
    featured: true,
    description: 'Manicures, pedicures, gel and extensions.',
  },
  {
    name: 'Spa & Massage',
    icon: 'clock',
    featured: true,
    description: 'Head, back and full-body massage, and the hammam table.',
  },
  {
    name: 'Bridal & Occasion',
    icon: 'award',
    description: 'Trials, the day itself, and everyone standing beside you.',
  },
];

/**
 * Twenty-one services, written to exercise every shape a service card can take
 * rather than to be an exhaustive price list:
 *
 *  - a reduced price, so the card computes the saving and carries an offer flag
 *  - a free-text price (`priceLabel`), which is the only honest way to price
 *    colour that depends on length — with `onOffer` ticked by hand, the only
 *    way a business pricing that way can run an offer at all
 *  - bookable services with their own `slotCapacity`, because one colourist in
 *    a three-chair salon takes one booking at ten whatever the shop can manage
 *  - enquiry-only services, for the work that has to be quoted after a look
 *  - featured services, which lead the band on the home page
 */
const SERVICES = [
  {
    title: 'Ladies Hair Cut & Blow Dry',
    category: 'Hair Cut & Styling',
    icon: 'spark',
    summary: 'A consultation first, then the cut, then a blow-dry you could walk out with any day of the week.',
    description:
      'Every cut starts dry, with your hair the way you actually wear it, because a wet head tells us nothing about how it falls.\n\nWe will talk about how much time you are willing to give it in the morning — that is the single thing that decides whether a shape works on you or only in the chair.',
    highlights: ['Dry consultation before anything is cut', 'Wash, cut and blow-dry', 'Finishing products explained, never pushed'],
    price: 1200,
    offerPrice: 899,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 3,
    featured: true,
  },
  {
    title: 'Mens Hair Cut',
    category: 'Hair Cut & Styling',
    icon: 'spark',
    summary: 'Scissor or machine, finished with a hot towel and a proper neck shave.',
    highlights: ['Hot towel finish', 'Neck and outline shaved clean'],
    price: 450,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 3,
    featured: true,
  },
  {
    title: 'Kids Hair Cut',
    category: 'Hair Cut & Styling',
    icon: 'heart',
    summary: 'Under twelve, in a chair that turns, with nobody in a hurry.',
    price: 350,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Blow Dry & Styling',
    category: 'Hair Cut & Styling',
    icon: 'zap',
    summary: 'Straight, waved or blown out — for an evening, not for a photograph.',
    priceLabel: 'From ₹600',
    durationMinutes: 45,
    bookable: true,
    slotCapacity: 3,
  },
  {
    title: 'Global Hair Colour',
    category: 'Hair Colour',
    icon: 'star',
    summary: 'One shade, root to tip. Ammonia-free on request, quoted by length after a strand test.',
    description:
      'Priced by length rather than by the hour, because a bob and hair to the waist are not the same job and pretending otherwise is how a quote at the basin becomes an argument at the counter.\n\nWe run a strand test on a first visit and tell you the number before the colour is mixed. If the test says the result will not hold, we say so and suggest something that will.',
    highlights: ['Strand test on the first visit', 'Quoted before the colour is mixed', 'Ammonia-free on request'],
    priceLabel: 'From ₹2,400',
    onOffer: true,
    offerLabel: '20% off on weekdays',
    durationMinutes: 120,
    bookable: true,
    slotCapacity: 1,
    featured: true,
  },
  {
    title: 'Root Touch-Up',
    category: 'Hair Colour',
    icon: 'refresh',
    summary: 'Greys covered at the parting and the hairline. Every four to six weeks, usually.',
    price: 1400,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Balayage',
    category: 'Hair Colour',
    icon: 'spark',
    summary: 'Hand-painted, grown out softly, so the line is never a line.',
    description:
      'Painted freehand rather than foiled, which is what lets it grow out without a shelf. Expect it to take most of a morning, and expect to come back in four months rather than four weeks.\n\nA gloss two weeks later is included — it is the difference between colour that stays expensive-looking and colour that turns brassy by the second wash.',
    highlights: ['Hand painted, no foils', 'Gloss two weeks later included', 'Grows out without a line'],
    priceLabel: 'From ₹5,500',
    durationMinutes: 180,
    bookable: true,
    slotCapacity: 1,
    featured: true,
  },
  {
    title: 'Highlights & Lowlights',
    category: 'Hair Colour',
    icon: 'layers',
    summary: 'Foiled, in as few or as many as the shape needs.',
    priceLabel: 'From ₹3,200',
    durationMinutes: 150,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Hair Gloss & Toner',
    category: 'Hair Colour',
    icon: 'star',
    summary: 'Takes the brass out and puts the shine back. Twenty minutes, no lift.',
    price: 1100,
    offerPrice: 850,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Keratin Smoothening',
    category: 'Hair Treatments',
    icon: 'leaf',
    summary: 'Frizz gone for three to five months. Priced by length, quoted after we see the hair.',
    description:
      'Not straightening — the curl is still yours, it simply stops fighting the weather. Hair stays down and unwashed for three days afterwards, which is worth planning around.\n\nWe will not put keratin over a colour done in the last fortnight, and we will say so rather than take the booking.',
    highlights: ['Lasts three to five months', 'Sulphate-free aftercare included', 'Not booked within two weeks of colour'],
    priceLabel: 'From ₹4,500',
    durationMinutes: 180,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Hair Botox Repair',
    category: 'Hair Treatments',
    icon: 'shield',
    summary: 'For hair that has been bleached one time too many. Rebuilds rather than coats.',
    priceLabel: 'From ₹3,800',
    durationMinutes: 120,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Deep Conditioning Hair Spa',
    category: 'Hair Treatments',
    icon: 'leaf',
    summary: 'Mask, steam and a head massage. The one to book after a summer of chlorine.',
    price: 1500,
    offerPrice: 1150,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 2,
    featured: true,
  },
  {
    title: 'Anti-Dandruff Scalp Treatment',
    category: 'Hair Treatments',
    icon: 'shield',
    summary: 'A course rather than a single sitting — we will tell you honestly how many.',
    price: 1800,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Classic Clean-Up',
    category: 'Skin & Facials',
    icon: 'heart',
    summary: 'Cleanse, exfoliate, extract, mask. Half an hour, once a month.',
    price: 900,
    durationMinutes: 45,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Hydrating Facial',
    category: 'Skin & Facials',
    icon: 'leaf',
    summary: 'For skin that has been sitting under air conditioning since March.',
    price: 2200,
    offerPrice: 1750,
    durationMinutes: 75,
    bookable: true,
    slotCapacity: 2,
    featured: true,
  },
  {
    title: 'Anti-Ageing Facial',
    category: 'Skin & Facials',
    icon: 'star',
    summary: 'Peptides and massage, with a serum chosen after looking at the skin rather than from a list.',
    price: 3200,
    durationMinutes: 90,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Chemical Peel Consultation',
    category: 'Skin & Facials',
    icon: 'message',
    /* Enquiry-only on purpose: a peel booked by a stranger at 7pm on a Sunday
       is one somebody has to talk them out of on Monday. */
    summary: 'A conversation first. Peels are not booked off a website, they are booked after a patch test.',
    priceLabel: 'Consultation free',
    durationMinutes: 30,
    bookable: false,
  },
  {
    title: 'Gel Manicure',
    category: 'Nails',
    icon: 'tag',
    summary: 'Shaped, cuticles tidied, two coats and a top. Two weeks, properly.',
    price: 1200,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Spa Pedicure',
    category: 'Nails',
    icon: 'leaf',
    summary: 'Soak, scrub, callus work and a massage to the knee.',
    price: 1400,
    offerPrice: 1100,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Head, Neck & Shoulder Massage',
    category: 'Spa & Massage',
    icon: 'clock',
    summary: 'Thirty minutes, oil or dry, for whatever the desk has been doing to you.',
    price: 800,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Bridal Package',
    category: 'Bridal & Occasion',
    icon: 'award',
    /* Quoted, never listed: the answer depends on the date, the party and how
       many trials somebody wants. */
    summary: 'Trial, the morning itself, and the people standing beside you. Quoted after we have talked about the date.',
    description:
      'Every bridal booking starts with a trial, and the trial is where the price is settled — a look decided over a phone call is a look nobody has seen on you.\n\nWe hold one bride a day. That is not a sales line: two on a morning means one of them is being hurried.',
    highlights: ['One bride a day, held', 'Trial before anything is quoted', 'Party of any size, at the venue or here'],
    priceLabel: 'On enquiry',
    durationMinutes: 240,
    bookable: false,
    featured: true,
  },
];

/* ------------------------------------------------------------------ *
 * The retail shelf
 * ------------------------------------------------------------------ */

/**
 * The shop behind the chair, nested where a salon shelf genuinely nests.
 *
 * Hair Care goes three deep — Hair Care › Shampoo & Conditioner › Colour-Safed
 * — because that is how somebody looking for one actually narrows it down, and
 * because a demo of a feature whose point is nesting should nest.
 */
const PRODUCT_CATEGORIES = [
  {
    name: 'Hair Care',
    icon: 'leaf',
    featured: true,
    description: 'Everything that goes on at the basin: shampoo, conditioner, masks and oils.',
    children: [
      {
        name: 'Shampoo & Conditioner',
        icon: 'leaf',
        description: 'Sulphate-free, colour-safe and clarifying, in salon sizes.',
        children: [
          { name: 'Colour-Safe', icon: 'star', description: 'Gentle enough not to strip a colour you paid for.' },
          { name: 'Anti-Dandruff', icon: 'shield', description: 'Medicated and everyday, for scalps that flake.' },
        ],
      },
      {
        name: 'Masks & Treatments',
        icon: 'heart',
        description: 'Weekly masks, bond builders and leave-in repair.',
      },
      {
        name: 'Hair Oils & Serums',
        icon: 'spark',
        description: 'Pre-wash oils and finishing serums, light enough for fine hair.',
      },
    ],
  },
  {
    name: 'Styling',
    icon: 'zap',
    featured: true,
    description: 'What we finish with in the chair, in the sizes you can take home.',
    children: [
      { name: 'Heat Protection', icon: 'shield', description: 'Sprays and creams to put on before the dryer, not after.' },
      { name: 'Sprays, Waxes & Gels', icon: 'spark', description: 'Hold that brushes out rather than setting like a helmet.' },
    ],
  },
  {
    name: 'Skin Care',
    icon: 'heart',
    featured: true,
    description: 'Cleansers, serums, moisturisers and the sunscreen we actually nag people about.',
    children: [
      { name: 'Cleansers & Toners', icon: 'leaf', description: 'Gel, cream and micellar, for every skin type.' },
      { name: 'Serums & Moisturisers', icon: 'star', description: 'Vitamin C, niacinamide and hyaluronic acid.' },
      { name: 'Sunscreen', icon: 'shield', description: 'SPF 50, in textures that do not sit white on the skin.' },
    ],
  },
  {
    name: 'Nail Care',
    icon: 'tag',
    description: 'Polish, treatments and the files worth owning.',
  },
  {
    name: 'Tools & Brushes',
    icon: 'tools',
    description: 'Brushes, combs, dryers and straighteners, the same ones we use.',
  },
  {
    name: 'Gift Sets',
    icon: 'award',
    featured: true,
    description: 'Boxed sets and gift cards, made up at the counter.',
  },
];

/**
 * Twenty-four products, chosen the same way the services were: to cover every
 * shape a card can take, not to be a stock list. A reduced price, a hand-ticked
 * offer that is not a reduction, a free-text price, out of stock, made to
 * order, featured items, and one thing filed nowhere — because a salon with a
 * few odds and ends behind the counter and no wish to sort them is ordinary.
 */
const PRODUCTS = [
  {
    name: 'Colour-Safe Shampoo, 300ml',
    category: 'Colour-Safe',
    sku: 'SHP-CS-300',
    summary: 'Sulphate-free, pH 5.5. The one we send home with every colour client.',
    description:
      'Sulphates are what strip a fresh colour in the first three washes, and this has none.\n\nIt lathers less than you are used to, which is the point rather than a fault — a low lather is the only way to wash colour-treated hair without opening the cuticle every time.',
    highlights: ['Sulphate and paraben free', 'pH 5.5, colour-safe', 'Salon size, roughly 60 washes'],
    specs: [
      { label: 'Size', value: '300 ml' },
      { label: 'Hair type', value: 'Colour treated' },
      { label: 'Free from', value: 'Sulphates, parabens' },
      { label: 'pH', value: '5.5' },
    ],
    price: 950,
    offerPrice: 725,
    featured: true,
    images: 2,
  },
  {
    name: 'Colour-Safe Conditioner, 300ml',
    category: 'Colour-Safe',
    sku: 'CND-CS-300',
    summary: 'The other half of the pair. Mid-lengths and ends only — never the scalp.',
    highlights: ['Detangles without weighing hair down', 'Use on lengths, not roots'],
    specs: [
      { label: 'Size', value: '300 ml' },
      { label: 'Hair type', value: 'Colour treated' },
    ],
    price: 1050,
    images: 1,
  },
  {
    name: 'Clarifying Shampoo, 250ml',
    category: 'Shampoo & Conditioner',
    sku: 'SHP-CLR-250',
    summary: 'Once a fortnight, to take off everything the other six washes left behind.',
    highlights: ['Removes product and hard-water build-up', 'Not for the week a colour was done'],
    specs: [
      { label: 'Size', value: '250 ml' },
      { label: 'Use', value: 'Once every 10–14 days' },
    ],
    price: 780,
    images: 1,
  },
  {
    name: 'Ketoconazole Anti-Dandruff Shampoo, 200ml',
    category: 'Anti-Dandruff',
    sku: 'SHP-AD-200',
    summary: 'Medicated. Twice a week for a month, then once. Not an everyday shampoo.',
    highlights: ['Ketoconazole 2%', 'Leave on the scalp for five minutes', 'Course, not a habit'],
    specs: [
      { label: 'Size', value: '200 ml' },
      { label: 'Active', value: 'Ketoconazole 2%' },
      { label: 'Frequency', value: 'Twice weekly, four weeks' },
    ],
    price: 640,
    images: 1,
  },
  {
    name: 'Bond Repair Mask, 250ml',
    category: 'Masks & Treatments',
    sku: 'MSK-BND-250',
    summary: 'For hair that has been lifted more than twice. Ten minutes, once a week.',
    description:
      'Bleach breaks the bonds inside the hair shaft; conditioner coats the outside of it. This is the first of those two jobs, which is why it is not a conditioner and does not replace one.\n\nUse it on a weekly wash for a month after a big lift, then drop to a fortnight.',
    highlights: ['Rebuilds bonds rather than coating them', 'Ten minutes, no heat needed', 'Weekly after bleach, then fortnightly'],
    specs: [
      { label: 'Size', value: '250 ml' },
      { label: 'Leave on', value: '10 minutes' },
      { label: 'Best for', value: 'Bleached and highlighted hair' },
    ],
    price: 1850,
    offerPrice: 1490,
    featured: true,
    images: 3,
  },
  {
    name: 'Weekly Hydration Mask, 200ml',
    category: 'Masks & Treatments',
    sku: 'MSK-HYD-200',
    summary: 'The gentler one. For dry hair that has not been coloured.',
    price: 1200,
    images: 1,
  },
  {
    name: 'Leave-In Repair Cream, 150ml',
    category: 'Masks & Treatments',
    sku: 'LIC-RPR-150',
    summary: 'A walnut of it on damp lengths before the dryer. Nothing on the roots.',
    highlights: ['No rinse', 'Detangles and protects to 180°C'],
    price: 890,
    images: 1,
  },
  {
    name: 'Pre-Wash Hair Oil, 100ml',
    category: 'Hair Oils & Serums',
    sku: 'OIL-PRE-100',
    summary: 'Coconut, castor and rosemary. An hour before a wash, or overnight if you can.',
    highlights: ['Cold pressed', 'Warm it before it goes on', 'An hour ahead is enough'],
    specs: [
      { label: 'Size', value: '100 ml' },
      { label: 'Base', value: 'Coconut and castor' },
    ],
    price: 560,
    images: 2,
  },
  {
    name: 'Finishing Hair Serum, 75ml',
    category: 'Hair Oils & Serums',
    sku: 'SRM-FIN-75',
    summary: 'Two drops, on the ends, on dry hair. Three drops is one too many.',
    price: 720,
    offerPrice: 599,
    images: 1,
  },
  {
    name: 'Argan Hair Oil, 50ml',
    category: 'Hair Oils & Serums',
    sku: 'OIL-ARG-50',
    summary: 'Light enough for fine hair, which most oils are not.',
    price: 1150,
    stockStatus: PRODUCT_STOCK.OUT_OF_STOCK,
    images: 1,
  },
  {
    name: 'Heat Protection Spray, 200ml',
    category: 'Heat Protection',
    sku: 'HPS-200',
    summary: 'To 230°C. The single cheapest thing you can do for hair you straighten.',
    highlights: ['Protects to 230°C', 'Spray on damp hair, not dry', 'No alcohol'],
    specs: [
      { label: 'Size', value: '200 ml' },
      { label: 'Protects to', value: '230 °C' },
    ],
    price: 680,
    featured: true,
    images: 2,
  },
  {
    name: 'Blow Dry Primer Cream, 150ml',
    category: 'Heat Protection',
    sku: 'BDP-150',
    summary: 'Heat protection and hold in one, for hair too thick for a spray.',
    price: 820,
    images: 1,
  },
  {
    name: 'Flexible Hold Hairspray, 250ml',
    category: 'Sprays, Waxes & Gels',
    sku: 'SPR-FLX-250',
    summary: 'Brushes out. Which is the whole difference between a finish and a helmet.',
    price: 640,
    onOffer: true,
    offerLabel: 'Two for ₹1,000',
    images: 1,
  },
  {
    name: 'Matte Styling Wax, 75g',
    category: 'Sprays, Waxes & Gels',
    sku: 'WAX-MAT-75',
    summary: 'Short hair, no shine. Warm it between the palms first.',
    price: 550,
    images: 1,
  },
  {
    name: 'Sea Salt Texture Spray, 200ml',
    category: 'Sprays, Waxes & Gels',
    sku: 'SPR-SLT-200',
    summary: 'Grip and a bit of wave, on second-day hair.',
    price: 720,
    images: 1,
  },
  {
    name: 'Gentle Gel Cleanser, 150ml',
    category: 'Cleansers & Toners',
    sku: 'CLN-GEL-150',
    summary: 'Twice a day, and it will not leave skin squeaking.',
    highlights: ['pH balanced', 'No fragrance', 'Suits oily and combination skin'],
    price: 740,
    images: 1,
  },
  {
    name: 'Micellar Cleansing Water, 200ml',
    category: 'Cleansers & Toners',
    sku: 'CLN-MIC-200',
    summary: 'First cleanse, for a face that has had makeup on it all day.',
    price: 590,
    images: 1,
  },
  {
    name: 'Vitamin C Serum 10%, 30ml',
    category: 'Serums & Moisturisers',
    sku: 'SRM-VC-30',
    summary: 'Mornings, under sunscreen. Ten percent, because twenty is how people end up irritated.',
    description:
      'L-ascorbic acid at 10% in an opaque pump bottle, which matters more than the number on the front — vitamin C oxidises in daylight, and a clear dropper bottle is a serum going brown on your shelf.\n\nStart every other morning for a fortnight. If it stings, it is too strong for you and we will swap it.',
    highlights: ['10% L-ascorbic acid', 'Opaque airless pump', 'Mornings, always under SPF'],
    specs: [
      { label: 'Size', value: '30 ml' },
      { label: 'Active', value: 'L-ascorbic acid 10%' },
      { label: 'Use', value: 'Morning, before sunscreen' },
      { label: 'Shelf life', value: '3 months once opened' },
    ],
    price: 1650,
    offerPrice: 1290,
    featured: true,
    images: 3,
  },
  {
    name: 'Niacinamide 5% Serum, 30ml',
    category: 'Serums & Moisturisers',
    sku: 'SRM-NIA-30',
    summary: 'Evenings. For open pores and the marks a spot leaves behind.',
    price: 1250,
    images: 1,
  },
  {
    name: 'Oil-Free Gel Moisturiser, 50ml',
    category: 'Serums & Moisturisers',
    sku: 'MST-GEL-50',
    summary: 'Sits under makeup without pilling, which is a low bar most fail.',
    price: 980,
    images: 1,
  },
  {
    name: 'Matte Sunscreen SPF 50 PA++++, 50ml',
    category: 'Sunscreen',
    sku: 'SPF-MAT-50',
    summary: 'No white cast, no shine. Two fingers, every morning, indoors as well.',
    highlights: ['SPF 50, PA++++', 'No white cast on Indian skin tones', 'Reapply every three hours outdoors'],
    specs: [
      { label: 'Size', value: '50 ml' },
      { label: 'Protection', value: 'SPF 50 PA++++' },
      { label: 'Finish', value: 'Matte' },
    ],
    price: 890,
    featured: true,
    images: 2,
  },
  {
    name: 'Cuticle Oil Pen',
    category: 'Nail Care',
    sku: 'NL-CUT-PEN',
    summary: 'In a handbag, used at traffic lights. That is genuinely how it works best.',
    price: 350,
    images: 1,
  },
  {
    name: 'Ceramic Round Brush, 45mm',
    category: 'Tools & Brushes',
    sku: 'BRS-CER-45',
    summary: 'The one the blow-dry is actually done with. Holds heat, so the shape sets.',
    price: 1100,
    stockStatus: PRODUCT_STOCK.MADE_TO_ORDER,
    images: 1,
  },
  {
    name: 'Aj Salon Gift Card',
    category: 'Gift Sets',
    sku: 'GFT-CARD',
    /* Priced in free text, because the amount is whatever somebody puts on it —
       and the offer therefore has to be the hand-ticked kind. */
    summary: 'Any amount from ₹1,000. Valid a year, usable on services and on the shelf.',
    priceLabel: 'From ₹1,000',
    onOffer: true,
    offerLabel: '₹500 extra on ₹5,000',
    highlights: ['Valid twelve months', 'Spendable on services and products', 'Made up at the counter'],
    images: 1,
  },
  {
    /* Filed nowhere on purpose. */
    name: 'Satin Pillowcase',
    category: null,
    sku: 'ACC-PLW-SAT',
    summary: 'Less friction than cotton, so a blow-dry survives the night.',
    price: 990,
    images: 1,
  },
];

/* ------------------------------------------------------------------ *
 * Everything else the site renders
 * ------------------------------------------------------------------ */

/** The six benefit cards. Icons come from the platform's closed set. */
const FEATURES = [
  {
    icon: 'message',
    title: 'A consultation, every single time',
    body: 'Nothing is cut, coloured or treated before somebody has looked at your hair dry and asked what your mornings are like.',
  },
  {
    icon: 'people',
    title: 'One pair of hands',
    body: 'The stylist who consults is the stylist who works. You keep the same person from the first appointment to the tenth.',
  },
  {
    icon: 'wallet',
    title: 'The number before the work',
    body: 'Colour is quoted after a strand test and before the bowl is mixed. What you are told at the basin is what you pay at the counter.',
  },
  {
    icon: 'leaf',
    title: 'What we use, you can buy',
    body: 'Nothing sits on our shelf that is not used at our basin. If we would not put it on your hair, we will not sell it to you.',
  },
  {
    icon: 'calendar',
    title: 'Appointments that are held',
    body: 'One bride a morning, three chairs an hour. We would rather turn a booking away than hurry the one already in the chair.',
  },
  {
    icon: 'check',
    title: 'A fortnight to say so',
    body: 'If a cut or a colour is not sitting right, come back within fourteen days and we will put it right at no charge.',
  },
];

/** The band of figures. One counts from a date, so it is right next year too. */
const STATS = [
  { label: 'Years on S G Highway', mode: STAT_MODE.SINCE_DATE, unit: STAT_UNIT.YEARS, sinceDate: '2014-03-01', suffix: '+', sequence: 1 },
  { label: 'Regulars on the book', mode: STAT_MODE.FIXED, value: '4,200', suffix: '+', sequence: 2 },
  { label: 'Who come back', mode: STAT_MODE.FIXED, value: '91', suffix: '%', sequence: 3 },
  { label: 'Chairs, never more', mode: STAT_MODE.FIXED, value: '6', sequence: 4 },
];

const TEAM = [
  {
    name: 'Anjali Joshi',
    role: 'Founder & Creative Director',
    bio: 'Trained in London, twenty years behind a chair, and still cuts four days a week because she will not run a salon she has stopped working in.',
  },
  {
    name: 'Rehan Qureshi',
    role: 'Senior Colourist',
    bio: 'Does the balayage. Will talk you out of going platinum in one sitting, and will be right.',
  },
  {
    name: 'Meera Patel',
    role: 'Senior Stylist',
    bio: 'Curls and fine hair — the two everyone else finds difficult. Ask her about a fringe before you cut one yourself.',
  },
  {
    name: 'Dr Sneha Rao',
    role: 'Consulting Aesthetician',
    bio: 'Runs the skin side. Every peel and every course of facials goes past her before it is booked.',
  },
  {
    name: 'Farida Shaikh',
    role: 'Nail & Spa Lead',
    bio: 'Fifteen years of gel and pedicures, and the person who taught the rest of us to file in one direction.',
  },
];

const GALLERY = [
  { title: 'Balayage, four months grown out', caption: 'Painted in March, photographed in July. No line, which is the whole point.' },
  { title: 'Soft bob, fine hair', caption: 'Cut dry, so the weight sits where it falls rather than where it looked wet.' },
  { title: 'Bridal, morning of', caption: 'Trial in April, the day itself in November, same stylist both times.' },
  { title: 'Copper gloss', caption: 'Twenty minutes at the basin after a colour that had gone brassy by the second wash.' },
  { title: 'Curls, cut dry', caption: 'Never cut wet. A curl shrinks by a third and you cannot see where it wants to sit.' },
  { title: 'Keratin, before and after', caption: 'The curl is still there — it just stopped arguing with the monsoon.' },
  { title: 'Gel manicure, almond', caption: 'Shaped, cuticles tidied, two coats and a top. A fortnight, properly.' },
  { title: 'The colour bar', caption: 'Where everything is mixed, and where the quote is given before it is.' },
];

/** Six reviews the salon entered itself, so they are born approved. */
const TESTIMONIALS = [
  {
    authorName: 'Priya Desai',
    authorRole: 'Regular since 2019',
    rating: 5,
    body: 'Rehan told me it would take two sittings to get where I wanted, and he was right. Every other place had promised it in one. I would rather be told the truth and wait.',
  },
  {
    authorName: 'Kavita Menon',
    authorRole: 'Bride, November 2025',
    rating: 5,
    body: 'They hold one bride a morning and you can feel it. Nobody was rushing, nobody was looking at the clock, and the trial in April is exactly what I got on the day.',
  },
  {
    authorName: 'Rahul Shah',
    rating: 5,
    body: 'I came in for a cut and left having been talked out of a treatment I had already decided to pay for. That is why I have come back every six weeks since.',
  },
  {
    authorName: 'Sneha Iyer',
    authorRole: 'Fine hair, difficult fringe',
    rating: 4,
    body: 'Meera is the first person who has cut my fringe without me hating it for a fortnight afterwards. The wait for her is long, and worth it.',
  },
  {
    authorName: 'Aditi Verma',
    rating: 5,
    body: 'The quote at the basin was the number on the bill. After three years of salons where it never was, that alone is worth the drive.',
  },
  {
    authorName: 'Nikhil Bhatt',
    authorRole: 'Every four weeks',
    rating: 5,
    body: 'Same chair, same barber, hot towel, out in half an hour. I have not had to explain what I want since 2022.',
  },
];

/** Four articles. One is scheduled ahead, which is an ordinary state to be in. */
const BLOG_POSTS = [
  {
    title: 'How to make a salon colour last past the third wash',
    excerpt: 'The sulphates in an ordinary shampoo strip colour faster than sunlight does. Here is what actually holds it.',
    author: 'Rehan Qureshi',
    tags: ['colour', 'aftercare'],
    daysAgo: 6,
    featured: true,
    body:
      'Almost every colour we see fading early is fading at the basin at home rather than in the chair here.\n\n' +
      'Sulphates are detergents. They are excellent at removing oil, and they are just as good at removing the pigment sitting in a freshly opened cuticle. For the first fortnight after a colour, that cuticle has not fully closed — which is why the first three washes cost you more colour than the next thirty.\n\n' +
      'Four things hold a colour, in the order they matter: a sulphate-free shampoo, water that is warm rather than hot, a gloss at week two, and washing less often than you think you need to. None of them is a product we have invented to sell you.\n\n' +
      'If your colour is still going brassy after all four, it is the water, not the hair. Hard water is the thing nobody mentions, and a clarifying wash once a fortnight is the fix.',
  },
  {
    title: 'Why we cut curls dry, and always will',
    excerpt: 'A curl shrinks by a third when it dries. Cutting it wet is cutting a shape nobody will ever see.',
    author: 'Meera Patel',
    tags: ['cutting', 'curls'],
    daysAgo: 19,
    body:
      'Wet hair is long, straight and heavy. Dry curly hair is none of those things.\n\n' +
      'Cut a curl wet and you are choosing a length that will not exist by the time the client stands up — anything from a quarter to a third shorter, and unevenly, because no two curls on one head shrink by the same amount.\n\n' +
      'Cutting dry takes longer and it is harder to do quickly, which is the honest reason most salons do not. We take curls one section at a time, cut each curl where it actually sits, and check the shape standing up rather than in the chair.\n\n' +
      'The practical consequence for you: come in with your hair the way you wear it. Not washed that morning, not tied back, not straightened "so it is easier to cut". We need to see the problem to solve it.',
  },
  {
    title: 'Sunscreen, and the two fingers nobody uses',
    excerpt: 'Almost everyone applies about a quarter of what the SPF on the bottle was tested with.',
    author: 'Dr Sneha Rao',
    tags: ['skin', 'aftercare'],
    daysAgo: 34,
    body:
      'An SPF 50 tested in a laboratory is tested at 2mg per square centimetre. In practice, most people apply somewhere near a quarter of that, and a quarter of the quantity is nowhere near a quarter of the protection.\n\n' +
      'The two-finger rule is the simplest fix: a line of sunscreen along the length of your index and middle fingers is roughly the right amount for a face and neck. It will feel like too much the first week. That feeling is the point.\n\n' +
      'Indoors counts. Window glass stops UVB and lets UVA straight through, and UVA is the half that does the ageing. If you sit by a window all day, you are being exposed all day.\n\n' +
      'And reapply — every three hours outdoors. A morning application is a morning of protection, not a day of it.',
  },
  {
    title: 'What a bridal trial is actually for',
    excerpt: 'It is not a rehearsal. It is where the price, the timing and the answer to "will this hold for fourteen hours" are settled.',
    author: 'Anjali Joshi',
    tags: ['bridal'],
    /* Dated ahead: nothing appears on the site before its `publishedAt`, and a
       tenant with something scheduled for next week is an ordinary state. */
    daysAgo: -9,
    body:
      'Brides book a trial expecting to look at a hairstyle. What the trial is really for is everything around it.\n\n' +
      'How long the hair takes to set, whether it holds through a humid afternoon, how the jewellery sits against it, whether the dupatta pulls it, and how early somebody has to be here on the morning — none of those can be answered off a photograph, and all of them decide the day.\n\n' +
      'It is also where the quote is settled, which is why we do not give a number before one. A look decided over a phone call is a look nobody has seen on your hair.\n\n' +
      'Bring the jewellery, bring the dupatta, and bring the photograph you have been carrying around. We will tell you honestly which parts of it will work on your hair and which parts belong to somebody with different hair.',
  },
];

/* ------------------------------------------------------------------ *
 * Masters
 * ------------------------------------------------------------------ */

/** Finds or creates a row, matched on one column, and says which it did. */
async function findOrMake(model, where, defaults, created, bucket) {
  const existing = await model.findOne({ where });
  if (existing) return existing;

  const row = await model.create({ ...where, ...defaults });
  if (bucket) created[bucket] = (created[bucket] ?? 0) + 1;
  return row;
}

/* ------------------------------------------------------------------ *
 * The tenant
 * ------------------------------------------------------------------ */

/**
 * The company, its head office, its admin login and its first subscription —
 * all through `createCompany`, which is the same call the super-admin console
 * makes. Nothing here reaches into a table that service already owns.
 */
async function ensureCompany({ businessType, theme, plan, state, created }) {
  const existing = await db.Company.findOne({ where: { code: COMPANY.code } });
  if (existing) return { company: existing, password: null };

  const result = await createCompany(
    {
      ...COMPANY,
      businessTypeId: businessType.id,
      themeId: theme.id,
      stateId: state?.id ?? null,
      domain: DOMAIN,
      mainAdmin: {
        name: 'Anjali Joshi',
        email: 'anjali@ajsalon.in',
        phone: COMPANY.phone,
      },
      subscription: { planId: plan.id, autoRenew: true, remarks: 'Seeded by db:seed:salon' },
    },
    null
  );

  created.company = 1;
  return { company: result.company, password: result.mainAdminPassword };
}

/**
 * The domain, for a company that already existed when this ran.
 *
 * A host maps to exactly one tenant, so a row pointing somewhere else is
 * reported rather than repointed — silently moving a live domain from one
 * company to another is not something a seeder should decide.
 */
async function ensureDomain(companyId, created) {
  const existing = await db.CompanyDomain.findOne({ where: { domain: DOMAIN } });
  if (existing) {
    if (existing.companyId !== companyId) {
      logger.warn(`"${DOMAIN}" is already mapped to company ${existing.companyId} — leaving it alone`);
    }
    return;
  }

  await db.CompanyDomain.create({ companyId, domain: DOMAIN, isPrimary: true, status: STATUS.ACTIVE });
  created.domains = (created.domains ?? 0) + 1;
}

/**
 * The tenant's half of every switch.
 *
 * Only the tenant's half: the plan's grant is the platform's to give, and this
 * script gave it deliberately above by writing `PLAN.functionalities`. Turning
 * a switch on for a key the plan never carried would change nothing on the
 * website anyway — the API checks all three gates — so there is no hidden
 * escalation here, only the configuration a salon would do on its first
 * afternoon.
 */
const SETTINGS = {
  [FUNCTIONALITY.SERVICES]: {
    navLabel: 'Menu',
    eyebrow: 'The menu',
    title: 'What {company} does',
    lead: 'Hair, skin, nails and the spa table. Prices are what you will actually pay; anything priced "from" depends on length, and we will tell you the number before we start.',
    ctaLabel: 'Enquire',
    bookLabel: 'Book a time',
    enquiryTarget: 'both',
    formTitle: 'Ask about this',
    formNote: 'Leave your name and number and we will call back — same day, usually within the hour.',
    categoriesEyebrow: 'The menu',
    categoriesTitle: 'Start with what you came for',
    categoriesLead: 'Hair, colour, treatments, skin, nails and spa. Pick one to see everything in it.',
    offersEyebrow: 'This month',
    offersTitle: 'On offer right now',
    offersLead: 'Reduced for a while, mostly on weekdays when the chairs are quieter. Prices go back up when the offer ends.',
    booking: {
      enabled: true,
      days: [1, 2, 3, 4, 5, 6, 0],
      openTime: '10:00',
      closeTime: '20:00',
      slotMinutes: 30,
      slotCapacity: 3,
      leadHours: 3,
      horizonDays: 45,
      note: 'Pick a time and we will confirm it. A colour or a treatment may need longer than the slot suggests — we will call if it does.',
    },
  },

  [FUNCTIONALITY.PRODUCTS]: {
    navLabel: 'Shop',
    eyebrow: 'On the shelf',
    title: 'What we use, and what you can take home',
    lead: 'Nothing here that is not used at our basin. Ask at the counter about anything you cannot see — most of it we can get in a week.',
    categoriesEyebrow: 'Browse',
    categoriesTitle: 'Shop by shelf',
    categoriesLead: 'Hair, styling, skin, nails and the tools worth owning.',
    offersEyebrow: 'Reduced',
    offersTitle: 'On offer this month',
    offersLead: 'Current reductions. Prices go back up when the offer ends.',
    ctaLabel: 'View details',
  },

  [FUNCTIONALITY.ORDERS]: {
    mode: ORDER_MODE.WHATSAPP,
    cart: true,
    addToCartLabel: 'Add to bag',
    buyNowLabel: 'Order now',
    cartTitle: 'Your bag',
    cartNote: 'Send your order and we will confirm what is in stock and the final total before anything is charged. Collect at the counter, or delivered inside Ahmedabad.',
    submitLabel: 'Send order',
    whatsappType: WHATSAPP_TYPE.ORDERS,
    messageIntro: 'Hello Aj Salon, I would like to order:',
    requireName: true,
    requirePhone: true,
    requireAddress: true,
    minOrderAmount: 500,
  },

  [FUNCTIONALITY.BLOG]: {
    navLabel: 'Journal',
    eyebrow: 'The journal',
    title: 'What we have been telling people in the chair',
    lead: 'The same answers we give at the basin, written down so you do not have to remember them.',
    showAuthor: true,
  },

  [FUNCTIONALITY.TEAM]: {
    eyebrow: 'The chairs',
    title: 'Who will be doing the work',
    lead: 'Six chairs, and the same pair of hands every time you come back.',
  },

  [FUNCTIONALITY.GALLERY]: {
    eyebrow: 'The work',
    title: 'What has walked out of here',
    lead: 'Photographed on the day, and a few of them again four months later, which is the harder test.',
  },

  [FUNCTIONALITY.FIGURES]: {
    eyebrow: 'By the numbers',
    title: 'What {company} has to show for it',
    lead: 'Eleven years on the same stretch of road, and most of the same people still in the chairs.',
  },

  [FUNCTIONALITY.FEATURES]: {
    eyebrow: 'Why here',
    title: 'What you can count on',
    lead: 'Six things we do the same way every time, whoever is in the chair.',
  },

  [FUNCTIONALITY.TESTIMONIALS]: {
    eyebrow: 'Reviews',
    title: 'What people say afterwards',
    lead: '',
    /* Open to customers: a salon lives on reviews, and a wall only the salon can
       write on is a brochure. Submissions still arrive pending. */
    mode: TESTIMONIAL_MODE.DYNAMIC,
    reviewTarget: TESTIMONIAL_REVIEW_TARGET.FORM,
    formTitle: 'Write a review',
    formNote: 'Your review reaches us first and appears here once we have published it.',
    showRating: true,
  },

  [FUNCTIONALITY.SHARE_LINK]: {
    headline: 'Share this page',
    message: 'Have a look at {company}',
    channels: [SHARE_CHANNEL.COPY, SHARE_CHANNEL.WHATSAPP, SHARE_CHANNEL.FACEBOOK, SHARE_CHANNEL.X],
  },
};

async function ensureFunctionalities(companyId, created) {
  for (const key of FUNCTIONALITY_VALUES) {
    const [row, made] = await db.CompanyFunctionality.findOrCreate({
      where: { companyId, key },
      defaults: { companyId, key, status: STATUS.ACTIVE, settings: SETTINGS[key] ?? null },
    });

    if (made) created.functionalities = (created.functionalities ?? 0) + 1;

    /* A row that already exists keeps whatever the tenant configured — only a
       switch left off is turned on, and only where this script wrote settings
       and nobody has since. */
    if (row.status !== STATUS.ACTIVE) await row.update({ status: STATUS.ACTIVE });
    if (!row.settings && SETTINGS[key]) await row.update({ settings: SETTINGS[key] });
  }
}

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

async function seedSliders(companyId, created) {
  /**
   * The platform's three starter slides, retired rather than deleted — exactly
   * what a company would do in Slider Management once it has written its own.
   *
   * Matched on the **eyebrow and title together**, which is the pairing
   * `defaultSliders` ships, so a slide the salon has since edited is no longer
   * one of them and is left alone. Done before the salon's own slides are
   * written rather than after, because the first default is titled with the
   * company's name and the salon's opening slide is too: retiring afterwards
   * would take the new one down with the old.
   */
  const retired = await db.Slider.update(
    { status: STATUS.INACTIVE },
    {
      where: {
        companyId,
        status: STATUS.ACTIVE,
        title: ['Work that holds up', 'People, not ticket numbers', COMPANY.name],
        eyebrow: ['Welcome', 'Built on trust', 'Here when you need us'],
      },
    }
  );
  if (retired[0]) created.slidersRetired = retired[0];

  for (const slide of SLIDES) {
    /* Eyebrow as well as title, for the reason above — the retired welcome
       slide shares this one's title and must not be mistaken for it. */
    const existing = await db.Slider.findOne({
      where: { companyId, title: slide.title, eyebrow: slide.eyebrow },
    });
    if (existing) continue;

    /**
     * No artwork, deliberately — the one place this seeder declines to write a
     * placeholder.
     *
     * Everywhere else a generated placeholder is a thumbnail in a card, and a
     * pale rectangle reads as a photograph nobody has replaced yet. The hero is
     * full-bleed behind the headline, and a pale rectangle there reads as a
     * broken dark theme. A slide with no image sits on the template's own wash,
     * which is what that wash is for; the salon uploads its own in Slider
     * Management and the scrim takes over.
     */
    await db.Slider.create({ ...slide, companyId, branchId: null, status: STATUS.ACTIVE });
    created.sliders = (created.sliders ?? 0) + 1;
  }
}

async function seedAbout(companyId, created) {
  const existing = await db.CompanyAbout.findOne({ where: { companyId, branchId: null } });
  if (existing) return;

  await db.CompanyAbout.create({
    companyId,
    branchId: null,
    navLabel: 'About us',
    eyebrow: 'About us',
    title: 'Six chairs on S G Highway',
    lead: 'Open since 2014, and still run by the person who cuts in chair one.',
    body:
      'Aj Salon started as three chairs above a bookshop, on the understanding that we would rather do four heads properly than nine of them quickly. Eleven years later there are six chairs, and that is the number we have decided to stop at.\n\n' +
      'Everything here follows from one rule: the person who consults is the person who works. It is why appointments are held rather than stacked, why colour is quoted after a strand test instead of over the phone, and why we will talk you out of a treatment we do not think will hold.\n\n' +
      'We train our own stylists rather than hiring finished ones, which is slow and occasionally expensive and the only way we have found to keep a standard the same across six chairs.\n\n' +
      'If something we did is not sitting right two weeks later, come back and we will put it right. That has been the deal since the bookshop.',
  });
  created.about = 1;
}

async function seedContactPage(companyId, created) {
  const existing = await db.CompanyContact.findOne({ where: { companyId, branchId: null } });
  if (existing) return;

  await db.CompanyContact.create({
    companyId,
    branchId: null,
    navLabel: 'Contact',
    eyebrow: 'Come and see us',
    title: 'Talk to Aj Salon',
    lead: 'Tell us roughly what you are after and when suits you. For colour, say how long your hair is and when it was last done — it saves a phone call.',
    showForm: true,
    formTarget: CONTACT_FORM_TARGET.WHATSAPP,
    formNote: 'We answer between 10am and 8pm, usually within the hour.',
    showLocations: true,
  });
  created.contactPage = 1;
}

async function seedWhatsapp(companyId, created) {
  const numbers = [
    {
      type: WHATSAPP_TYPE.CONTACT,
      number: '9825012345',
      label: 'Front desk',
      defaultMessage: 'Hello Aj Salon, I would like to ask about an appointment.',
      sequence: 1,
    },
    {
      type: WHATSAPP_TYPE.INQUIRY,
      number: '9825012347',
      label: 'Bookings & bridal',
      defaultMessage: 'Hello Aj Salon, I would like to enquire about a booking.',
      sequence: 2,
    },
    {
      type: WHATSAPP_TYPE.ORDERS,
      number: '9825012348',
      label: 'Retail counter',
      defaultMessage: 'Hello Aj Salon, I would like to place an order from the shelf.',
      sequence: 3,
    },
  ];

  for (const entry of numbers) {
    await findOrMake(
      db.CompanyWhatsapp,
      { companyId, type: entry.type },
      { ...entry, countryCode: '91', status: STATUS.ACTIVE },
      created,
      'whatsapp'
    );
  }
}

async function seedStats(companyId, created) {
  for (const stat of STATS) {
    await findOrMake(
      db.CompanyStat,
      { companyId, label: stat.label },
      { ...stat, branchId: null, status: STATUS.ACTIVE },
      created,
      'stats'
    );
  }
}

async function seedFeatures(companyId, created) {
  let sequence = 1;
  for (const feature of FEATURES) {
    await findOrMake(
      db.CompanyFeature,
      { companyId, title: feature.title },
      { ...feature, branchId: null, sequence, status: STATUS.ACTIVE },
      created,
      'features'
    );
    sequence += 1;
  }
}

async function seedTeam(companyId, created) {
  let sequence = 1;
  for (const member of TEAM) {
    await findOrMake(
      db.CompanyTeamMember,
      { companyId, name: member.name },
      {
        ...member,
        branchId: null,
        photo: writePlaceholder('team', member.name),
        sequence,
        status: STATUS.ACTIVE,
      },
      created,
      'team'
    );
    sequence += 1;
  }
}

async function seedGallery(companyId, created) {
  let sequence = 1;
  for (const item of GALLERY) {
    await findOrMake(
      db.CompanyGalleryItem,
      { companyId, title: item.title },
      {
        ...item,
        branchId: null,
        image: writePlaceholder('gallery', item.title),
        altText: item.title,
        sequence,
        status: STATUS.ACTIVE,
      },
      created,
      'gallery'
    );
    sequence += 1;
  }
}

async function seedTestimonials(companyId, created) {
  let sequence = 1;
  for (const review of TESTIMONIALS) {
    await findOrMake(
      db.CompanyTestimonial,
      { companyId, authorName: review.authorName },
      {
        ...review,
        branchId: null,
        /* The salon's own copy, so it is born approved — asking a business to
           approve its own words would be a queue with one person on both ends. */
        source: TESTIMONIAL_SOURCE.ADMIN,
        moderation: TESTIMONIAL_MODERATION.APPROVED,
        moderatedAt: new Date(),
        sequence,
        status: STATUS.ACTIVE,
      },
      created,
      'testimonials'
    );
    sequence += 1;
  }
}

async function seedServiceCategories(companyId, created, byName) {
  let sequence = 1;

  for (const node of SERVICE_CATEGORIES) {
    const slug = slugify(node.name);
    let row = await db.CompanyServiceCategory.findOne({ where: { companyId, slug } });

    if (!row) {
      row = await db.CompanyServiceCategory.create({
        companyId,
        branchId: null,
        parentId: null,
        name: node.name,
        slug: await uniqueSlug(db.CompanyServiceCategory, companyId, node.name),
        description: node.description ?? null,
        image: writePlaceholder('service-category', node.name),
        icon: node.icon ?? 'spark',
        featured: Boolean(node.featured),
        sequence,
        status: STATUS.ACTIVE,
      });
      created.serviceCategories = (created.serviceCategories ?? 0) + 1;
    }

    byName.set(node.name, row.id);
    sequence += 1;
  }
}

async function seedServices(companyId, byName, created) {
  let sequence = 1;

  for (const item of SERVICES) {
    const slug = slugify(item.title);
    const existing = await db.CompanyService.findOne({ where: { companyId, slug } });
    if (existing) {
      sequence += 1;
      continue;
    }

    const categoryId = item.category ? byName.get(item.category) ?? null : null;
    if (item.category && !categoryId) {
      logger.warn(`No service category "${item.category}" for "${item.title}" — filing it uncategorised`);
    }

    await db.CompanyService.create({
      companyId,
      branchId: null,
      categoryId,
      title: item.title,
      slug: await uniqueSlug(db.CompanyService, companyId, item.title),
      icon: item.icon ?? 'spark',
      image: writePlaceholder('service', item.title),
      summary: item.summary ?? null,
      description: item.description ?? null,
      highlights: item.highlights ?? [],
      price: item.price ?? null,
      offerPrice: item.offerPrice ?? null,
      priceLabel: item.priceLabel ?? null,
      onOffer: Boolean(item.onOffer),
      durationMinutes: item.durationMinutes ?? null,
      bookable: Boolean(item.bookable),
      slotCapacity: item.slotCapacity ?? null,
      showPrice: true,
      ctaLabel: item.ctaLabel ?? null,
      featured: Boolean(item.featured),
      sequence,
      status: STATUS.ACTIVE,
    });

    created.services = (created.services ?? 0) + 1;
    sequence += 1;
  }
}

/** Walks the product tree depth-first, so a parent always exists before its children. */
async function seedProductCategories(companyId, nodes, parentId, created, byName) {
  let sequence = 1;

  for (const node of nodes) {
    const slug = slugify(node.name);
    let row = await db.CompanyCategory.findOne({ where: { companyId, slug } });

    if (!row) {
      row = await db.CompanyCategory.create({
        companyId,
        branchId: null,
        parentId,
        name: node.name,
        slug: await uniqueSlug(db.CompanyCategory, companyId, node.name),
        description: node.description ?? null,
        image: writePlaceholder('category', node.name),
        icon: node.icon ?? 'spark',
        featured: Boolean(node.featured),
        sequence,
        status: STATUS.ACTIVE,
      });
      created.productCategories = (created.productCategories ?? 0) + 1;
    }

    byName.set(node.name, row.id);
    sequence += 1;

    if (node.children?.length) {
      await seedProductCategories(companyId, node.children, row.id, created, byName);
    }
  }
}

async function seedProducts(companyId, byName, created) {
  let sequence = 1;

  for (const item of PRODUCTS) {
    const slug = slugify(item.name);
    const existing = await db.CompanyProduct.findOne({ where: { companyId, slug } });
    if (existing) {
      sequence += 1;
      continue;
    }

    const categoryId = item.category ? byName.get(item.category) ?? null : null;
    if (item.category && !categoryId) {
      logger.warn(`No category "${item.category}" for "${item.name}" — filing it uncategorised`);
    }

    /* One placeholder per image slot. The first is the card image everywhere,
       which is why they are numbered rather than shuffled. */
    const images = Array.from({ length: item.images ?? 1 }, (_, index) =>
      writePlaceholder('product', item.name, index === 0 ? '' : `-${index + 1}`)
    );

    await db.CompanyProduct.create({
      companyId,
      branchId: null,
      categoryId,
      name: item.name,
      slug: await uniqueSlug(db.CompanyProduct, companyId, item.name),
      sku: item.sku ?? null,
      summary: item.summary ?? null,
      description: item.description ?? null,
      images,
      highlights: item.highlights ?? [],
      specs: item.specs ?? [],
      price: item.price ?? null,
      offerPrice: item.offerPrice ?? null,
      priceLabel: item.priceLabel ?? null,
      onOffer: Boolean(item.onOffer),
      offerLabel: item.offerLabel ?? null,
      stockStatus: item.stockStatus ?? PRODUCT_STOCK.IN_STOCK,
      ctaLabel: null,
      featured: Boolean(item.featured),
      sequence,
      status: STATUS.ACTIVE,
    });

    created.products = (created.products ?? 0) + 1;
    sequence += 1;
  }
}

async function seedBlog(companyId, created) {
  for (const post of BLOG_POSTS) {
    const slug = slugify(post.title);
    const existing = await db.CompanyBlogPost.findOne({ where: { companyId, slug } });
    if (existing) continue;

    /* A negative `daysAgo` is a post dated ahead — scheduled, and absent from
       the site until its date arrives. */
    const publishedAt = new Date();
    publishedAt.setDate(publishedAt.getDate() - post.daysAgo);

    await db.CompanyBlogPost.create({
      companyId,
      branchId: null,
      slug: await uniqueSlug(db.CompanyBlogPost, companyId, post.title),
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      coverImage: writePlaceholder('blog', post.title),
      author: post.author,
      tags: post.tags ?? [],
      publishedAt,
      featured: Boolean(post.featured),
      status: STATUS.ACTIVE,
    });

    created.blog = (created.blog ?? 0) + 1;
  }
}

/* ------------------------------------------------------------------ *
 * Run it
 * ------------------------------------------------------------------ */

(async () => {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();

    const created = {};

    const businessType = await findOrMake(
      db.BusinessType,
      { slug: BUSINESS_TYPE.slug },
      {
        name: BUSINESS_TYPE.name,
        icon: 'spark',
        description: 'Salons, studios and spas — a treatment menu, a diary and a retail shelf.',
        status: STATUS.ACTIVE,
      },
      created,
      'businessTypes'
    );

    const theme = await findOrMake(
      db.Theme,
      { code: THEME.code },
      { ...THEME, isDefault: false, status: STATUS.ACTIVE },
      created,
      'themes'
    );

    const plan = await findOrMake(
      db.Plan,
      { code: PLAN.code },
      { ...PLAN, status: STATUS.ACTIVE },
      created,
      'plans'
    );

    /* Gujarat, for the address on the footer and the contact page. Matched
       rather than created: the state list is the platform's master data. */
    const state = await db.State.findOne({ where: { code: 'GJ' } });
    if (!state) logger.warn('No state with code GJ — the address will render without one');

    const { company, password } = await ensureCompany({ businessType, theme, plan, state, created });
    logger.info(`Seeding Aj Salon into "${company.name}" (id ${company.id})`);

    await ensureDomain(company.id, created);
    await ensureFunctionalities(company.id, created);

    await seedSliders(company.id, created);
    await seedAbout(company.id, created);
    await seedContactPage(company.id, created);
    await seedWhatsapp(company.id, created);
    await seedStats(company.id, created);
    await seedFeatures(company.id, created);
    await seedTeam(company.id, created);
    await seedGallery(company.id, created);
    await seedTestimonials(company.id, created);

    const serviceCategoryIds = new Map();
    await seedServiceCategories(company.id, created, serviceCategoryIds);
    await seedServices(company.id, serviceCategoryIds, created);

    const productCategoryIds = new Map();
    await seedProductCategories(company.id, PRODUCT_CATEGORIES, null, created, productCategoryIds);
    await seedProducts(company.id, productCategoryIds, created);

    await seedBlog(company.id, created);

    const written = Object.entries(created)
      .filter(([, count]) => count)
      .map(([name, count]) => `${count} ${name}`)
      .join(', ');
    logger.info(written ? `Wrote ${written}` : 'Nothing to write — everything was already there');

    if (password) {
      logger.info(`Admin login: anjali@ajsalon.in / ${password}  (shown once, not stored in clear)`);
    }

    /**
     * The three gates, reported rather than assumed. A switch this script turned
     * on still shows nothing if the plan lapsed or the section is empty, and the
     * tenant would rather be told that here than find out on the website.
     */
    const { items } = await functionalityService.getFunctionalities(company.id, { withContent: true });
    const dark = items.filter((item) => !item.published && item.contentCount !== null);
    if (dark.length) {
      dark.forEach((item) => logger.warn(`"${item.name}" is not on the website: ${item.reason}`));
    } else {
      logger.info('Every content section is live on this tenant’s website.');
    }

    logger.info(`Serve it: cd themes/midnight && npm run dev  →  http://localhost:4500`);
    logger.info(`The site resolves this tenant from TENANT_DOMAIN=${DOMAIN} in its .env.local`);

    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
