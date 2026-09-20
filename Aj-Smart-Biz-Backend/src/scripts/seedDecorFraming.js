'use strict';

/**
 * **AJ Home Decor & Framings** — one complete tenant, end to end.
 *
 *     npm run db:seed:decor
 *
 * The company that the `themes/atelier` template was built
 * against. Everything that template renders arrives from the API, so everything
 * that template renders has to exist as **rows**: the shop itself, its plan, its
 * domain, its framing services, its wall-art shelf, its people, its reviews and
 * its articles. Not one line of it is written into the website.
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
 * `seed-*.svg` and labelled as samples in the corner, exactly as `seedSalon`
 * and `seedCatalogue` do. They exist so a gallery, a thumbnail strip and an
 * image-count badge have something to show. Delete the `seed-` prefixed files
 * and they are gone.
 *
 * Read `seedSalon.js` beside this one. The two are deliberately the same script
 * with different rows in it: same helpers, same order, same three-gate report at
 * the end. Where this one differs it is because the *business* differs — a shop
 * that quotes a frame after seeing the piece prices differently from a salon
 * that charges ₹450 for a haircut — and each of those places says so.
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
 * The host the Atelier theme is served on.
 *
 * `decor.localhost` rather than `localhost`, and that is not cosmetic: the host
 * resolver strips the port before it looks a tenant up, so `localhost:4500` and
 * `localhost:4600` are the *same host* and could not name two companies. A
 * label in front of it is what separates them, and every browser resolves
 * `*.localhost` to the loopback without a hosts-file entry.
 */
const DOMAIN = 'decor.localhost';

const COMPANY = {
  name: 'AJ Home Decor & Framings',
  code: 'AJDECOR',
  legalName: 'AJ Home Decor & Framings LLP',
  description: 'Custom picture framing, mirrors and wall art, cut and joined in our own workshop.',
  email: 'hello@ajhomedecor.in',
  phone: '9825044101',
  alternatePhone: '9825044102',
  website: 'https://ajhomedecor.in',
  addressLine1: 'Shop 7, Sarthik Annexe',
  addressLine2: 'Off S G Highway, Prahladnagar',
  city: 'Ahmedabad',
  pincode: '380015',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
};

/**
 * The business type, which is what decides that this tenant is served the
 * commercial template rather than the salon or informational one. A row, not a
 * branch in any code — see `themes/README.md`.
 */
const BUSINESS_TYPE = { name: 'Home Decor & Framing', slug: 'home-decor-framing' };

/**
 * The theme, and the only place the Atelier's warm palette is a *tenant's*
 * choice rather than the template's.
 *
 * The template paints its own mat board; what a theme supplies is the colour
 * laid on top of it. On a light ground the brand has to be the **darker** of
 * the pair or a button stops reading as a button — the inverse of how the black
 * theme's gold pair is ordered — so `primaryColor` is walnut and
 * `secondaryColor` is the deeper walnut it goes to on hover. See the layout's
 * `themeVariables`.
 */
const THEME = {
  name: 'Aj Atelier',
  code: 'aj-atelier',
  primaryColor: '#7c4f28',
  secondaryColor: '#5e3a1c',
  accentColor: '#9a7038',
  textColor: '#221c15',
  backgroundColor: '#f5f0e6',
  sidebarColor: '#f1eade',
  mode: 'light',
};

/**
 * The plan, and the reason the site has anything on it at all.
 *
 * A feature reaches a visitor only when the **plan** grants it, the **company**
 * switches it on, and the plan is still being **served** — three gates, and this
 * is the first of them. A framing shop runs the whole surface: a price list for
 * the workshop, a diary for consultations and fittings, a shelf of wall art that
 * takes orders, accounts, reviews and a journal. So the plan carries every key
 * rather than a subset, and the seeder can then switch each one on below without
 * quietly widening an entitlement nobody sold.
 */
const PLAN = {
  name: 'Decor Complete',
  code: 'DECOR-COMPLETE',
  description: 'Everything a framing and decor shop needs on its website: price list, diary, shelf, reviews and journal.',
  price: 2999,
  currency: 'INR',
  billingCycle: BILLING_CYCLE.YEARLY,
  maxBranches: 3,
  maxAdmins: 5,
  maxUsers: 25,
  storageMb: 8192,
  functionalities: FUNCTIONALITY_VALUES,
  isPopular: true,
  sequence: 20,
};

/* ------------------------------------------------------------------ *
 * The hero
 * ------------------------------------------------------------------ */

/**
 * The slides, which replace the three every company is born with.
 *
 * `createCompany` seeds the platform's generic set so a brand new tenant never
 * has an empty carousel; a shop that has actually been set up should not still
 * be running them, so the defaults are retired rather than deleted — the same
 * thing a company would do in Slider Management.
 */
const SLIDES = [
  {
    eyebrow: 'Ahmedabad',
    title: 'AJ Home Decor & Framings',
    subtitle: 'Custom framing, mirrors and wall art. Cut, joined and glazed on the premises, by the person who quoted it.',
    ctaLabel: 'Get a frame quoted',
    ctaUrl: '/services',
    sequence: 1,
  },
  {
    eyebrow: 'The workshop',
    title: 'Nothing is quoted from a photograph',
    subtitle: 'Bring the piece in. We will hold three mouldings against it, cut a corner sample, and give you the number before anything is ordered.',
    ctaLabel: 'See what we do',
    ctaUrl: '/services',
    sequence: 2,
  },
  {
    eyebrow: 'On the wall',
    title: 'Prints, canvases and mirrors, framed and ready',
    subtitle: 'The wall art we frame for stock, in the same mouldings we use for commissions — hang it the day you take it home.',
    ctaLabel: 'Browse the shop',
    ctaUrl: '/products',
    sequence: 3,
  },
];

/* ------------------------------------------------------------------ *
 * The workshop's price list
 * ------------------------------------------------------------------ */

/**
 * Seven categories, which is the shape a framing price list actually takes.
 * Flat rather than nested: somebody who wants a degree certificate framed
 * should not have to open *Framing › Paper › Documents* to find out what it
 * costs.
 */
const SERVICE_CATEGORIES = [
  {
    name: 'Custom Picture Framing',
    icon: 'layers',
    featured: true,
    description: 'Photographs, prints, paintings and documents, framed to the piece rather than to a stock size.',
  },
  {
    name: 'Mounting & Mat Cutting',
    icon: 'tools',
    featured: true,
    description: 'Acid-free mounts cut on the bench, single, double or multi-aperture.',
  },
  {
    name: 'Glazing & Conservation',
    icon: 'shield',
    featured: true,
    description: 'Anti-glare, UV and museum glass, and the backing that decides how long a piece lasts.',
  },
  {
    name: 'Canvas & Restoration',
    icon: 'refresh',
    featured: true,
    description: 'Stretching, re-stretching, cleaning and the repairs a frame needs after a move.',
  },
  {
    name: 'Mirrors & Glass',
    icon: 'star',
    featured: true,
    description: 'Mirrors cut to size, framed, bevelled and hung.',
  },
  {
    name: 'Wall Styling & Installation',
    icon: 'map-pin',
    featured: true,
    description: 'Gallery walls planned on paper first, then measured, drilled and hung at your place.',
  },
  {
    name: 'Corporate & Bulk',
    icon: 'people',
    description: 'Offices, clinics, hotels and awards nights — the same work, at a schedule and a rate.',
  },
];

/**
 * Twenty-one services, written to exercise every shape a service card can take
 * rather than to be an exhaustive price list:
 *
 *  - a reduced price, so the card computes the saving and carries an offer flag
 *  - a free-text price (`priceLabel`), which is the only honest way to price a
 *    frame that depends on the size of the piece — with `onOffer` ticked by
 *    hand, the only way a business pricing that way can run an offer at all
 *  - bookable services with their own `slotCapacity`, because one framer at the
 *    bench takes one fitting at eleven whatever the shop can manage
 *  - enquiry-only services, for the work that has to be seen before it is
 *    quoted — restoration above all
 *  - featured services, which lead the band on the home page
 */
const SERVICES = [
  {
    title: 'Framing Consultation',
    category: 'Custom Picture Framing',
    icon: 'message',
    summary: 'Bring the piece in. Three mouldings, two mounts and a number, in about twenty minutes.',
    description:
      'Every frame starts with the work on the counter, because a moulding that looks right against a white wall in a photograph can be entirely wrong against the actual paper.\n\nWe will hold three profiles against it, cut a mount corner in two or three boards, and tell you what each combination costs before anything is ordered. Nothing is charged for this and nothing is booked in at the end of it unless you want it.',
    highlights: ['Free, and no obligation to book', 'Corner samples cut while you wait', 'The number before anything is ordered'],
    priceLabel: 'Free',
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
    featured: true,
  },
  {
    title: 'Photo & Print Framing, up to A3',
    category: 'Custom Picture Framing',
    icon: 'layers',
    summary: 'The everyday job: a print, a mount and glass, in a moulding off the wall behind the counter.',
    description:
      'Priced per frame rather than per hour, and the number covers the moulding, an acid-free mount, standard glass, backing, tape and the hanging fittings.\n\nThree working days is normal. If you need it for a Saturday, say so when you drop it in rather than when you collect it.',
    highlights: ['Acid-free mount included', 'Three working days, usually', 'Hanging fittings fitted, not handed over'],
    price: 1499,
    offerPrice: 1149,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
    featured: true,
  },
  {
    title: 'Large Format & Poster Framing',
    category: 'Custom Picture Framing',
    icon: 'layers',
    summary: 'A1, A0 and anything on a roll. Priced by the perimeter, quoted after we measure it flat.',
    priceLabel: 'From ₹2,400',
    durationMinutes: 45,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Certificate & Degree Framing',
    category: 'Custom Picture Framing',
    icon: 'award',
    summary: 'Convocation certificates, registrations and licences. Two days, and it will sit straight.',
    highlights: ['Never trimmed to fit a frame', 'Acid-free throughout', 'Matching sets for a wall of them'],
    price: 1200,
    offerPrice: 949,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Box Frames & Shadow Boxes',
    category: 'Custom Picture Framing',
    icon: 'tools',
    summary: 'For things with a thickness: medals, currency, a first pair of shoes, a folded flag.',
    description:
      'A deep frame is a different job from a flat one — the piece has to be held without being glued, and it has to be held in a way somebody can undo in twenty years.\n\nWe pin, sink or sleeve depending on what it is, and we will tell you which before you leave it with us. Nothing is stuck down with anything that cannot come off.',
    highlights: ['Nothing glued to the piece', 'Depth built to the object, not to a stock rebate', 'Reversible mounting, always'],
    priceLabel: 'From ₹3,200',
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 1,
    featured: true,
  },
  {
    title: 'Jersey & Memorabilia Framing',
    category: 'Custom Picture Framing',
    icon: 'shield',
    summary: 'A signed shirt, folded the way it is meant to hang, with the number showing.',
    priceLabel: 'From ₹4,500',
    durationMinutes: 90,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Oil & Acrylic Painting Framing',
    category: 'Custom Picture Framing',
    icon: 'star',
    summary: 'Open frames, float frames and slips. Unglazed, the way a painting is meant to be seen.',
    priceLabel: 'From ₹5,500',
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Acid-Free Mount Cutting',
    category: 'Mounting & Mat Cutting',
    icon: 'tools',
    summary: 'One aperture, bevelled at 45°, cut on the bench while you wait if the shop is quiet.',
    highlights: ['Conservation board, not paper-faced card', 'Bevel cut, never straight', 'Any colour on the rack, at one price'],
    price: 450,
    durationMinutes: 20,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Double & Multi-Aperture Mounts',
    category: 'Mounting & Mat Cutting',
    icon: 'layers',
    summary: 'Two boards for depth, or six openings for a set. Priced by the number of cuts.',
    priceLabel: 'From ₹900',
    durationMinutes: 45,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Dry Mounting & Flattening',
    category: 'Mounting & Mat Cutting',
    icon: 'refresh',
    summary: 'For a print that has lived in a tube. Heat-pressed flat, and it stays flat.',
    price: 700,
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Anti-Glare & UV Glazing',
    category: 'Glazing & Conservation',
    icon: 'shield',
    summary: 'For a wall facing a window. Cuts the reflection and most of what fades a print.',
    description:
      'Ordinary glass reflects the window opposite it and lets almost all the ultraviolet through. On a wall that gets afternoon light, that is the difference between a print that looks the same in ten years and one that has gone yellow in three.\n\nWe will tell you honestly when it is not worth it: a reproduction you can print again does not need conservation glass, and we would rather sell you the frame than the upgrade.',
    highlights: ['Blocks about 70% of UV', 'Reflection cut to almost nothing', 'Not recommended where it is not needed'],
    priceLabel: 'From ₹1,800',
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 2,
    featured: true,
  },
  {
    title: 'Museum Glass Upgrade',
    category: 'Glazing & Conservation',
    icon: 'star',
    summary: 'The one that disappears. For an original you would not be able to replace.',
    priceLabel: 'From ₹2,900',
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Acrylic Glazing for Large Pieces',
    category: 'Glazing & Conservation',
    icon: 'zap',
    summary: 'Half the weight of glass and it does not break in a lift. For anything over A1.',
    priceLabel: 'From ₹2,200',
    durationMinutes: 30,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Canvas Stretching on Bars',
    category: 'Canvas & Restoration',
    icon: 'tools',
    summary: 'A rolled canvas onto kiln-dried bars, keyed at the corners so it can be tightened later.',
    highlights: ['Kiln-dried stretcher bars', 'Keyed corners, so it can be re-tensioned', 'Staples at the back, never the side'],
    priceLabel: 'From ₹1,600',
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Re-Stretching & Re-Tensioning',
    category: 'Canvas & Restoration',
    icon: 'refresh',
    summary: 'For a canvas that has gone slack in the monsoon. An afternoon, usually.',
    price: 1400,
    offerPrice: 1100,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Artwork Cleaning & Restoration',
    category: 'Canvas & Restoration',
    icon: 'heart',
    /* Enquiry-only on purpose: a restoration quoted off a website by somebody
       who has not seen the damage is a quote that will be wrong. */
    summary: 'Seen first, quoted second. Surface dirt, foxing, tears and old tape.',
    description:
      'This is the one thing on the list we will not put a number against, and the reason is not caution — it is that the same-looking stain is a twenty-minute job or a four-week one depending on what is under it.\n\nSend a photograph by all means, but the quote comes after somebody has had the piece under a lamp. If it is beyond what a framer should attempt, we will say so and tell you who does it.',
    highlights: ['Assessed under a lamp, not from a photograph', 'Told plainly when it is beyond us', 'Written quote before any work starts'],
    priceLabel: 'On enquiry',
    durationMinutes: 45,
    bookable: false,
  },
  {
    title: 'Frame Repair & Re-Joining',
    category: 'Canvas & Restoration',
    icon: 'tools',
    summary: 'A corner that opened in a move, re-joined and touched in. Often the same day.',
    price: 700,
    durationMinutes: 45,
    bookable: true,
    slotCapacity: 2,
  },
  {
    title: 'Custom Cut & Framed Mirrors',
    category: 'Mirrors & Glass',
    icon: 'star',
    summary: 'Cut to your opening, bevelled if you want it, framed in the same mouldings as the art.',
    description:
      'Measure the wall, not the old mirror — we will come and do it if you would rather not, and the measurement is deducted from the job if you go ahead.\n\nAnything over four feet is fitted rather than handed over. A mirror that size hung on the wrong fixing is not a risk worth passing to a customer.',
    highlights: ['5mm float glass, bevelled to order', 'Safety-backed as standard', 'Fitted by us over four feet'],
    priceLabel: 'From ₹3,900',
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 1,
    featured: true,
  },
  {
    title: 'Gallery Wall Design',
    category: 'Wall Styling & Installation',
    icon: 'lightbulb',
    summary: 'Your pieces, laid out on paper to scale, before a single hole is drilled.',
    description:
      'Send the dimensions of the wall and photographs of what is going on it, and we will come back with two arrangements drawn to scale, with the gaps marked.\n\nIt is the cheapest part of the job and the one that decides whether the wall works. A good frame hung in the wrong place is still the wrong place.',
    highlights: ['Two arrangements, drawn to scale', 'Gaps and centre lines marked', 'Deducted from the job if we hang it'],
    price: 2500,
    offerPrice: 1999,
    durationMinutes: 60,
    bookable: true,
    slotCapacity: 1,
    featured: true,
  },
  {
    title: 'On-Site Measuring & Installation',
    category: 'Wall Styling & Installation',
    icon: 'map-pin',
    summary: 'We bring the level, the right fixings for your wall, and a drill that does not spread dust.',
    priceLabel: 'From ₹1,200',
    durationMinutes: 120,
    bookable: true,
    slotCapacity: 1,
  },
  {
    title: 'Corporate & Bulk Framing',
    category: 'Corporate & Bulk',
    icon: 'people',
    /* Quoted, never listed: the answer depends on the count, the sizes and how
       fast somebody needs it. */
    summary: 'Offices, clinics, hotels and awards nights. Quoted against a list, delivered to a date.',
    description:
      'Fifty identical certificates and fifty different photographs are not the same job, so a per-frame rate off a website would be wrong in one direction or the other.\n\nSend the list — sizes, counts and the date you need them by — and the quote comes back against it. We hold one bulk job on the bench at a time, which is why the date on the quote is a date rather than a hope.',
    highlights: ['Quoted against your actual list', 'One bulk job on the bench at a time', 'Delivered and hung, if you want that'],
    priceLabel: 'On enquiry',
    durationMinutes: 60,
    bookable: false,
    featured: true,
  },
];

/* ------------------------------------------------------------------ *
 * The shop
 * ------------------------------------------------------------------ */

/**
 * What is on the shelves and the walls, nested where a decor shop genuinely
 * nests.
 *
 * Wall Art goes three deep — Wall Art › Framed Prints › Botanical & Nature —
 * because that is how somebody looking for one actually narrows it down, and
 * because a demo of a feature whose point is nesting should nest.
 */
const PRODUCT_CATEGORIES = [
  {
    name: 'Wall Art',
    icon: 'star',
    featured: true,
    description: 'Framed prints, canvases and triptychs, ready to hang the day you take them home.',
    children: [
      {
        name: 'Framed Prints',
        icon: 'layers',
        description: 'Giclée prints on cotton rag, mounted and framed in the shop.',
        children: [
          { name: 'Abstract & Modern', icon: 'spark', description: 'Form and colour, for a wall that needs quiet rather than a subject.' },
          { name: 'Botanical & Nature', icon: 'leaf', description: 'Pressed botanicals, birds and landscape studies.' },
        ],
      },
      {
        name: 'Canvas Paintings',
        icon: 'tools',
        description: 'Hand-painted and printed canvases, stretched on kiln-dried bars.',
      },
      {
        name: 'Traditional & Devotional',
        icon: 'heart',
        description: 'Pichwai, Madhubani, calligraphy and devotional pieces, framed conservatively.',
      },
    ],
  },
  {
    name: 'Photo Frames',
    icon: 'layers',
    featured: true,
    description: 'Ready-made frames in standard sizes, in the same profiles we cut to order.',
    children: [
      { name: 'Table Frames', icon: 'tag', description: 'Freestanding, for a desk, a mantel or a bedside.' },
      { name: 'Collage Sets', icon: 'people', description: 'Matched sets of six to twelve, sold with a layout sheet.' },
    ],
  },
  {
    name: 'Mirrors',
    icon: 'star',
    featured: true,
    description: 'Decorative, full length and bathroom, framed and safety-backed.',
    children: [
      { name: 'Decorative Wall Mirrors', icon: 'spark', description: 'Round, arched and ornate, for a hallway or above a console.' },
      { name: 'Full-Length Mirrors', icon: 'award', description: 'Leaners and wall-fixed, in wood and metal.' },
    ],
  },
  {
    name: 'Home Decor',
    icon: 'heart',
    featured: true,
    description: 'What goes on the wall beside the art, and on the surface underneath it.',
    children: [
      { name: 'Wall Clocks', icon: 'clock', description: 'Silent-sweep movements, in wood, metal and cane.' },
      { name: 'Vases & Showpieces', icon: 'spark', description: 'Ceramic, brass and terracotta, in sizes that suit a console.' },
      { name: 'Candle Stands & Lanterns', icon: 'zap', description: 'Brass and iron, for a mantel or a floor corner.' },
    ],
  },
  {
    name: 'Framing Materials',
    icon: 'tools',
    description: 'For artists and the trade: moulding by the length, board by the sheet, glass cut to size.',
  },
  {
    name: 'Hanging & Fittings',
    icon: 'shield',
    description: 'The hooks, wire, plugs and levels that decide whether it stays on the wall.',
  },
  {
    name: 'Gift Sets',
    icon: 'award',
    featured: true,
    description: 'Boxed frames, print-and-frame vouchers and gift cards, made up at the counter.',
  },
];

/**
 * Twenty-four products, chosen the same way the services were: to cover every
 * shape a card can take, not to be a stock list. A reduced price, a hand-ticked
 * offer that is not a reduction, a free-text price, out of stock, made to
 * order, featured items, and one thing filed nowhere — because a shop with a
 * few odds and ends behind the counter and no wish to sort them is ordinary.
 */
const PRODUCTS = [
  {
    name: 'Abstract Ochre Fields, A2 Framed Print',
    category: 'Abstract & Modern',
    sku: 'ART-ABS-OCH-A2',
    summary: 'Three bands of ochre and clay on cotton rag, in a 20mm oak profile.',
    description:
      'Printed here on 310gsm cotton rag with pigment inks, which is the difference between a print that holds its colour for decades and one that shifts in a summer.\n\nSupplied framed, glazed and wired, so it is on the wall the same evening. The mount is acid-free and the backing is sealed — the same specification we use on work people bring in.',
    highlights: ['310gsm cotton rag, pigment inks', '20mm solid oak, waxed', 'Acid-free mount, wired and ready to hang'],
    specs: [
      { label: 'Print size', value: 'A2 — 420 × 594 mm' },
      { label: 'Framed size', value: '540 × 715 mm' },
      { label: 'Moulding', value: 'Solid oak, 20 mm' },
      { label: 'Glazing', value: 'Clear float glass' },
    ],
    price: 4200,
    offerPrice: 3350,
    featured: true,
    images: 3,
  },
  {
    name: 'Monsoon Greys, A3 Framed Print',
    category: 'Abstract & Modern',
    sku: 'ART-ABS-MON-A3',
    summary: 'The quiet one. Greys and a single line of indigo, in a black ayous frame.',
    specs: [
      { label: 'Print size', value: 'A3 — 297 × 420 mm' },
      { label: 'Moulding', value: 'Ayous, matt black, 16 mm' },
    ],
    price: 2600,
    images: 2,
  },
  {
    name: 'Botanical Study Set of Three, A4',
    category: 'Botanical & Nature',
    sku: 'ART-BOT-SET3-A4',
    summary: 'Fern, palm and banana leaf, in matching white frames. Hang them 60mm apart.',
    highlights: ['Three matched frames', 'Layout sheet included', 'Archival mount in each'],
    specs: [
      { label: 'Print size', value: 'A4 × 3' },
      { label: 'Framed size', value: '320 × 420 mm each' },
      { label: 'Moulding', value: 'Ash, painted white, 18 mm' },
    ],
    price: 5400,
    offerPrice: 4450,
    featured: true,
    images: 3,
  },
  {
    name: 'Heron at Dawn, A2 Framed Print',
    category: 'Botanical & Nature',
    sku: 'ART-BOT-HRN-A2',
    summary: 'A single bird in a wash of morning. The one people buy for a stairwell.',
    price: 4100,
    images: 1,
  },
  {
    name: 'Pressed Fern, Double-Mounted A4',
    category: 'Botanical & Nature',
    sku: 'ART-BOT-FRN-A4',
    summary: 'A real pressed frond under glass, double-mounted for depth.',
    price: 2400,
    stockStatus: PRODUCT_STOCK.MADE_TO_ORDER,
    images: 2,
  },
  {
    name: 'Hand-Painted Canvas, 24 × 36 in',
    category: 'Canvas Paintings',
    sku: 'CNV-HP-2436',
    summary: 'Acrylic on cotton duck, stretched and keyed. Every one of them different.',
    description:
      'Painted by hand, so no two are the same and the photograph is of the one you will get — we photograph each canvas rather than using a sample shot.\n\nStretched on kiln-dried bars with keyed corners, which means it can be re-tensioned in a few years rather than replaced.',
    highlights: ['One of a kind, photographed individually', 'Kiln-dried keyed bars', 'Unglazed, as a painting should be'],
    specs: [
      { label: 'Size', value: '610 × 915 mm' },
      { label: 'Medium', value: 'Acrylic on cotton duck' },
      { label: 'Depth', value: '38 mm gallery wrap' },
    ],
    price: 12500,
    featured: true,
    images: 3,
  },
  {
    name: 'Textured Canvas Triptych, 3 × 16 in',
    category: 'Canvas Paintings',
    sku: 'CNV-TRI-16',
    summary: 'Three panels that read as one piece. Needs about five feet of wall.',
    priceLabel: 'From ₹9,800',
    images: 2,
  },
  {
    name: 'Pichwai Lotus Panel, Framed',
    category: 'Traditional & Devotional',
    sku: 'ART-TRD-PCH-01',
    summary: 'Printed on textured paper, framed in an antique-gold profile with a deep mount.',
    specs: [
      { label: 'Framed size', value: '600 × 900 mm' },
      { label: 'Moulding', value: 'Antique gold, 45 mm ornate' },
      { label: 'Glazing', value: 'Anti-glare' },
    ],
    price: 7800,
    featured: true,
    images: 2,
  },
  {
    name: 'Arabic Calligraphy Panel, Black & Brass',
    category: 'Traditional & Devotional',
    sku: 'ART-TRD-CAL-02',
    summary: 'Brushed brass lettering on black, in a slim shadow box.',
    price: 6400,
    images: 1,
  },
  {
    name: 'Solid Teak Table Frame, 5 × 7 in',
    category: 'Table Frames',
    sku: 'FRM-TBL-TEK-57',
    summary: 'Real teak, not veneer. Stands either way up and does not tip.',
    highlights: ['Solid teak, oiled', 'Portrait or landscape', 'Real glass, not styrene'],
    specs: [
      { label: 'Photo size', value: '5 × 7 in' },
      { label: 'Material', value: 'Solid teak' },
      { label: 'Glazing', value: 'Float glass' },
    ],
    price: 1250,
    images: 2,
  },
  {
    name: 'Brushed Brass Table Frame, 4 × 6 in',
    category: 'Table Frames',
    sku: 'FRM-TBL-BRS-46',
    summary: 'The one that goes on a desk and does not look like an office.',
    price: 980,
    offerPrice: 790,
    images: 1,
  },
  {
    name: 'Nine-Frame Collage Set, Black',
    category: 'Collage Sets',
    sku: 'FRM-COL-BLK-9',
    summary: 'Nine frames, three sizes, and a paper template so the holes go in once.',
    highlights: ['Paper hanging template included', 'Mixed 4×6, 5×7 and 8×10', 'Fittings and hooks in the box'],
    specs: [
      { label: 'Frames', value: '9 — three sizes' },
      { label: 'Wall needed', value: 'About 1.5 × 1.2 m' },
      { label: 'Finish', value: 'Matt black' },
    ],
    price: 3600,
    offerPrice: 2990,
    featured: true,
    images: 2,
  },
  {
    name: 'Six-Frame Collage Set, Natural Oak',
    category: 'Collage Sets',
    sku: 'FRM-COL-OAK-6',
    summary: 'The smaller set, for a landing or the wall beside a staircase.',
    price: 2700,
    images: 1,
  },
  {
    name: 'Arched Wall Mirror, 24 × 36 in',
    category: 'Decorative Wall Mirrors',
    sku: 'MIR-ARC-2436',
    summary: 'The arch everyone wants above a console. Safety-backed, fittings included.',
    description:
      'Five-millimetre float glass with a safety backing film, which is what stops a mirror this size becoming a floor full of glass if it ever comes down.\n\nThe frame is a 30mm metal profile in brushed brass or matt black. Hanging plates are fitted to the back before it leaves us — a mirror is not something to be handing somebody a bag of screws with.',
    highlights: ['5 mm float glass, safety backed', 'Hanging plates fitted, not supplied loose', 'Brushed brass or matt black'],
    specs: [
      { label: 'Size', value: '610 × 915 mm' },
      { label: 'Glass', value: '5 mm, safety backed' },
      { label: 'Frame', value: '30 mm metal' },
    ],
    price: 8900,
    offerPrice: 7450,
    featured: true,
    images: 3,
  },
  {
    name: 'Round Cane-Rimmed Mirror, 30 in',
    category: 'Decorative Wall Mirrors',
    sku: 'MIR-RND-CAN-30',
    summary: 'Woven cane over a mango wood rim. Light enough for a plasterboard wall.',
    price: 6200,
    stockStatus: PRODUCT_STOCK.OUT_OF_STOCK,
    images: 1,
  },
  {
    name: 'Full-Length Leaner Mirror, 30 × 70 in',
    category: 'Full-Length Mirrors',
    sku: 'MIR-FUL-LNR-3070',
    summary: 'Leans against the wall, with a strap so it stays leaning. Delivered, not couriered.',
    specs: [
      { label: 'Size', value: '760 × 1780 mm' },
      { label: 'Glass', value: '5 mm, bevelled 20 mm' },
      { label: 'Delivery', value: 'By us, inside Ahmedabad' },
    ],
    price: 16500,
    images: 2,
  },
  {
    name: 'Silent-Sweep Wall Clock, 14 in Walnut',
    category: 'Wall Clocks',
    sku: 'CLK-WLN-14',
    summary: 'A sweep movement, so there is no tick. The reason it costs more than the one downstairs.',
    highlights: ['Continuous sweep, silent', 'Solid walnut rim', 'Single AA, about a year'],
    price: 2900,
    images: 2,
  },
  {
    name: 'Brass & Cane Wall Clock, 12 in',
    category: 'Wall Clocks',
    sku: 'CLK-BRC-12',
    summary: 'Brass hands on a woven cane face. Reads better across a room than it photographs.',
    price: 3400,
    images: 1,
  },
  {
    name: 'Terracotta Bud Vase, Set of Three',
    category: 'Vases & Showpieces',
    sku: 'DEC-VAS-TER-3',
    summary: 'Three heights, unglazed outside, sealed inside so they actually hold water.',
    price: 1850,
    offerPrice: 1490,
    images: 2,
  },
  {
    name: 'Brass Diya Stand, 18 in',
    category: 'Candle Stands & Lanterns',
    sku: 'DEC-BRS-DIY-18',
    summary: 'Cast brass, weighted base. Ages to a colour you cannot buy new.',
    price: 4600,
    images: 1,
  },
  {
    name: 'Moulding Sample Box, 24 Profiles',
    category: 'Framing Materials',
    sku: 'MAT-MLD-SMP-24',
    summary: 'For architects and interior studios. Twenty-four corner samples in a case.',
    highlights: ['24 corner samples', 'Refundable against a first order', 'Reference codes on every piece'],
    price: 2500,
    images: 1,
  },
  {
    name: 'Conservation Mount Board, 32 × 40 in Sheet',
    category: 'Framing Materials',
    sku: 'MAT-BRD-CON-3240',
    /* Priced in free text, because the sheet price moves with the board colour
       and the quantity — and the offer therefore has to be the hand-ticked kind. */
    summary: 'Acid-free, buffered, forty-two colours on the rack. Sold by the sheet or cut.',
    priceLabel: 'From ₹680 a sheet',
    onOffer: true,
    offerLabel: '10% off from ten sheets',
    images: 1,
  },
  {
    name: 'Heavy-Duty Hanging Kit',
    category: 'Hanging & Fittings',
    sku: 'FIT-HNG-HD',
    summary: 'Plates, wire, plugs and a small level. Enough for four large frames.',
    price: 450,
    images: 1,
  },
  {
    name: 'AJ Home Decor Gift Card',
    category: 'Gift Sets',
    sku: 'GFT-CARD',
    /* Priced in free text, because the amount is whatever somebody puts on it —
       and the offer therefore has to be the hand-ticked kind. */
    summary: 'Any amount from ₹1,000. Valid a year, usable on framing and on the shop.',
    priceLabel: 'From ₹1,000',
    onOffer: true,
    offerLabel: '₹500 extra on ₹5,000',
    highlights: ['Valid twelve months', 'Spendable on framing and on stock', 'Made up at the counter'],
    images: 1,
  },
  {
    /* Filed nowhere on purpose. */
    name: 'Picture Light, 12 in Brass',
    category: null,
    sku: 'ACC-LGT-BRS-12',
    summary: 'Clips to the frame, warm LED, runs off a cell. For a piece on a dark wall.',
    price: 3200,
    images: 1,
  },
];

/* ------------------------------------------------------------------ *
 * Everything else the site renders
 * ------------------------------------------------------------------ */

/** The six benefit cards. Icons come from the platform's closed set. */
const FEATURES = [
  {
    icon: 'tools',
    title: 'Cut and joined here',
    body: 'The moulding is mitred, joined, glazed and fitted in our own workshop. Nothing is sent out, which is why the person who quoted it is the person answerable for it.',
  },
  {
    icon: 'message',
    title: 'The piece on the counter first',
    body: 'Nothing is quoted from a photograph. We hold three mouldings against the actual work, cut mount corners, and let you see the combination before it is ordered.',
  },
  {
    icon: 'shield',
    title: 'Acid-free as standard',
    body: 'Conservation board and sealed backing on every job, not as an upgrade. It costs us a little more and it is the difference between ten years and thirty.',
  },
  {
    icon: 'wallet',
    title: 'The number before the work',
    body: 'A written quote before anything is cut, and the number on it is the number on the bill. If we find something on the bench that changes it, we ring you rather than add it.',
  },
  {
    icon: 'calendar',
    title: 'Dates we can actually keep',
    body: 'One bulk job on the bench at a time and three working days on an ordinary frame. We would rather refuse a date than miss one you planned around.',
  },
  {
    icon: 'check',
    title: 'Hung, not handed over',
    body: 'Anything large is fitted at your place with the right plug for your wall. A frame propped against a skirting board is not a finished job.',
  },
];

/** The band of figures. One counts from a date, so it is right next year too. */
const STATS = [
  { label: 'Years on S G Highway', mode: STAT_MODE.SINCE_DATE, unit: STAT_UNIT.YEARS, sinceDate: '2012-08-01', suffix: '+', sequence: 1 },
  { label: 'Frames off the bench', mode: STAT_MODE.FIXED, value: '31,000', suffix: '+', sequence: 2 },
  { label: 'Moulding profiles in stock', mode: STAT_MODE.FIXED, value: '240', sequence: 3 },
  { label: 'Work that comes back to us', mode: STAT_MODE.FIXED, value: '88', suffix: '%', sequence: 4 },
];

const TEAM = [
  {
    name: 'Ajay Mistry',
    role: 'Founder & Master Framer',
    bio: 'Twenty-two years at a bench, and still cuts the difficult mounts himself because he will not run a workshop he has stopped working in.',
  },
  {
    name: 'Nilofer Vohra',
    role: 'Conservation Framer',
    bio: 'Does the work that has to last: documents, originals and anything on paper older than the person who brought it in.',
  },
  {
    name: 'Rakesh Parmar',
    role: 'Workshop Lead',
    bio: 'Runs the saw and the joiner. If a corner is open by half a millimetre he will find it before you do.',
  },
  {
    name: 'Shruti Kapadia',
    role: 'Interiors & Wall Styling',
    bio: 'Plans the gallery walls. Will talk you out of hanging nine frames where five would be better, and will be right.',
  },
  {
    name: 'Imran Shaikh',
    role: 'Installation & Glass',
    bio: 'Fifteen years of mirrors and large glass, and the person who taught the rest of us which fixing a hollow wall actually needs.',
  },
];

const GALLERY = [
  { title: 'Wedding album spread, box framed', caption: 'Two prints and the invitation card, sunk into a 45mm box with an acid-free spacer.' },
  { title: 'Gallery wall of eleven, Prahladnagar', caption: 'Drawn to scale first. Every hole went in once, which is the whole point of drawing it.' },
  { title: 'Convocation set of four', caption: 'Matched mouldings and one mount colour across all four, so the wall reads as a set.' },
  { title: 'Signed jersey, deep box', caption: 'Folded to show the number, pinned rather than glued, and reversible in twenty years.' },
  { title: 'Pichwai on textured paper', caption: 'Antique gold, a deep cream mount and anti-glare glass, for a wall opposite a window.' },
  { title: 'Arched mirror above a console', caption: 'Cut to the opening, bevelled, and fitted on plates by us — nobody was handed a bag of screws.' },
  { title: 'Canvas re-stretched after a move', caption: 'Slack across the middle when it came in. Keyed out and re-tensioned in an afternoon.' },
  { title: 'The moulding wall', caption: 'Two hundred and forty profiles, which is the part of the shop people photograph.' },
];

/** Six reviews the shop entered itself, so they are born approved. */
const TESTIMONIALS = [
  {
    authorName: 'Meghna Trivedi',
    authorRole: 'Prahladnagar',
    rating: 5,
    body: 'They drew the wall to scale before touching a drill, and the eleven frames went up in one afternoon with eleven holes. Every other quote I had was somebody with a hammer and an opinion.',
  },
  {
    authorName: 'Dr Samir Kothari',
    authorRole: 'Clinic, Satellite',
    rating: 5,
    body: 'Forty-two certificates, one list, one date. They came back with a quote against the list rather than a rate per frame, and delivered on the day they said.',
  },
  {
    authorName: 'Arjun Nair',
    rating: 5,
    body: 'I went in wanting museum glass because I had read about it. They asked what the print was, told me it was a reproduction I could reprint for nine hundred rupees, and sold me the ordinary glazing. That is why I have been back four times.',
  },
  {
    authorName: 'Falguni Desai',
    authorRole: 'Bought a mirror, stayed for the wall',
    rating: 4,
    body: 'The arched mirror is exactly right and it was fitted properly. The wait was three weeks rather than the two I was told, which is the only reason this is not five stars.',
  },
  {
    authorName: 'Hetal Shah',
    authorRole: 'Interior designer',
    rating: 5,
    body: 'I send every client here. The sample box alone saves me two site visits, and I have never had a corner come back open.',
  },
  {
    authorName: 'Vikram Bhatt',
    rating: 5,
    body: 'My grandfather’s photograph had tape on it from 1978. They took the tape off, told me honestly what could and could not be fixed, and framed it so it will outlast me.',
  },
];

/** Four articles. One is scheduled ahead, which is an ordinary state to be in. */
const BLOG_POSTS = [
  {
    title: 'Why we will not quote a frame from a photograph',
    excerpt: 'A moulding that looks right on a screen is a moulding nobody has held against the actual paper.',
    author: 'Ajay Mistry',
    tags: ['framing', 'how we work'],
    daysAgo: 5,
    featured: true,
    body:
      'We are asked for a price over WhatsApp most days, and we almost always say bring it in.\n\n' +
      'The reason is not that we want the footfall. It is that three things decide a frame and a photograph shows none of them: the actual colour of the paper, which is never what a phone camera says it is; the thickness and the state of the edges, which decide whether it can be mounted or has to be float-mounted; and the weight, which decides the moulding as much as taste does.\n\n' +
      'A number given without those is a number that changes at the counter, and a quote that changes at the counter is worse than no quote at all.\n\n' +
      'What we will do from a photograph is tell you the range — whether you are in fifteen hundred rupees or six thousand — so you know whether it is worth the trip. That much is honest. The rest is not.',
  },
  {
    title: 'Anti-glare, UV or museum glass: which one your wall actually needs',
    excerpt: 'Three upgrades are sold as one. They solve different problems, and most walls need at most one of them.',
    author: 'Nilofer Vohra',
    tags: ['glazing', 'conservation'],
    daysAgo: 17,
    body:
      'Anti-glare stops you seeing the window behind you. UV stops the light fading what is in the frame. Museum glass does both and costs about three times as much. They are routinely sold as though they were the same upgrade.\n\n' +
      'Start with the wall, not the piece. A wall that faces a window at any time of day is a UV problem. A wall opposite a window, or under a downlight, is a reflection problem. A north-facing wall in a corridor is usually neither, and ordinary glass is the right answer.\n\n' +
      'Then ask what is inside. If the piece can be reprinted, UV protection is money spent on something replaceable. If it is an original, a photograph with no negative, or a document, it cannot be reprinted and the glass is the cheapest insurance you will ever buy.\n\n' +
      'The one combination we argue against is museum glass over a poster. We will sell it if you insist, and we will tell you first that we think it is a waste.',
  },
  {
    title: 'Hanging a gallery wall: draw it before you drill it',
    excerpt: 'Every wall that has gone wrong went wrong at the same step — somebody started with the first nail instead of the last frame.',
    author: 'Shruti Kapadia',
    tags: ['styling', 'installation'],
    daysAgo: 31,
    body:
      'A gallery wall is a layout problem that people try to solve with a hammer.\n\n' +
      'Lay every frame on the floor first, in the arrangement you think you want, and photograph it from a chair. You will change it twice before you like it, and changing it on the floor costs nothing.\n\n' +
      'Then the three rules that do most of the work. Keep the gaps equal and small — 50 to 70 millimetres between frames, not the hand-span most people leave. Put the centre of the whole arrangement at about 145 centimetres from the floor, which is eye level for most people standing. And let one edge line up: either the tops, the bottoms or a vertical through the middle. A wall with no line anywhere in it reads as a mistake however good the frames are.\n\n' +
      'Cut paper templates, tape them up, and live with them for a day. Then drill.',
  },
  {
    title: 'What a framing consultation is actually for',
    excerpt: 'It is not a sales meeting. It is where the mount width, the glass and the date are settled, and where we tell you what not to spend on.',
    author: 'Ajay Mistry',
    tags: ['framing', 'how we work'],
    /* Dated ahead: nothing appears on the site before its `publishedAt`, and a
       tenant with something scheduled for next week is an ordinary state. */
    daysAgo: -8,
    body:
      'People arrive at a consultation expecting to choose a frame. What the twenty minutes is really for is everything around it.\n\n' +
      'How wide the mount should be — which is almost always wider than people expect, and is what makes a small piece look considered rather than cramped. Whether the piece should be behind the mount or floating on top of it. What the wall behind it is painted, because a warm white mount on a cool white wall looks grey. Whether anything needs to be reversible, and how quickly you need it.\n\n' +
      'It is also where we tell you what not to buy. Roughly one visit in five ends with somebody spending less than they walked in expecting to, usually because they had been told they needed conservation glazing for something that will never see direct light.\n\n' +
      'Bring the piece, bring a photograph of the wall, and bring the date it has to be ready by. Twenty minutes settles all of it.',
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
        name: 'Ajay Mistry',
        email: 'ajay@ajhomedecor.in',
        phone: COMPANY.phone,
      },
      subscription: { planId: plan.id, autoRenew: true, remarks: 'Seeded by db:seed:decor' },
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
 * escalation here, only the configuration a shop would do on its first
 * afternoon.
 */
const SETTINGS = {
  [FUNCTIONALITY.SERVICES]: {
    navLabel: 'Framing',
    eyebrow: 'The workshop',
    title: 'What {company} does at the bench',
    lead: 'Framing, mounting, glazing, mirrors and the wall itself. A fixed price means that is what it costs; anything priced "from" depends on the size of the piece, and you will have the number in writing before anything is cut.',
    ctaLabel: 'Ask about this',
    bookLabel: 'Book a slot',
    enquiryTarget: 'both',
    formTitle: 'Ask about this',
    formNote: 'Leave your name and number and we will call back — same day, usually within the hour.',
    categoriesEyebrow: 'The workshop',
    categoriesTitle: 'Start with what you are framing',
    categoriesLead: 'Framing, mounts, glazing, canvas, mirrors and the wall. Pick one to see everything in it.',
    offersEyebrow: 'This month',
    offersTitle: 'On offer right now',
    offersLead: 'Reduced for a while, mostly on the jobs that fill a quiet week. Prices go back up when the offer ends.',
    booking: {
      enabled: true,
      days: [1, 2, 3, 4, 5, 6],
      openTime: '10:30',
      closeTime: '19:30',
      slotMinutes: 30,
      slotCapacity: 2,
      leadHours: 4,
      horizonDays: 30,
      note: 'Pick a time and we will confirm it. Bring the piece — a consultation without it is a conversation we will have to have again.',
    },
  },

  [FUNCTIONALITY.PRODUCTS]: {
    navLabel: 'Shop',
    eyebrow: 'On the wall',
    title: 'Framed and ready to hang',
    lead: 'Wall art, mirrors, frames and decor, framed in the shop in the same mouldings we cut to order. Ask at the counter about anything you cannot see — most of it we can get in a week.',
    categoriesEyebrow: 'Browse',
    categoriesTitle: 'Shop by room, or by what it is',
    categoriesLead: 'Wall art, photo frames, mirrors, decor and the materials, if you frame your own.',
    offersEyebrow: 'Reduced',
    offersTitle: 'On offer this month',
    offersLead: 'Current reductions. Prices go back up when the offer ends.',
    ctaLabel: 'View details',
  },

  [FUNCTIONALITY.ORDERS]: {
    mode: ORDER_MODE.WHATSAPP,
    cart: true,
    addToCartLabel: 'Add to order',
    buyNowLabel: 'Order now',
    cartTitle: 'Your order',
    cartNote: 'Send your order and we will confirm what is in stock and the final total before anything is charged. Collect from the shop, or delivered and hung inside Ahmedabad.',
    submitLabel: 'Send order',
    whatsappType: WHATSAPP_TYPE.ORDERS,
    messageIntro: 'Hello AJ Home Decor, I would like to order:',
    requireName: true,
    requirePhone: true,
    requireAddress: true,
    minOrderAmount: 1000,
  },

  [FUNCTIONALITY.BLOG]: {
    navLabel: 'Journal',
    eyebrow: 'The journal',
    title: 'What we end up explaining at the counter',
    lead: 'The same answers we give across the counter, written down so you do not have to take our word for it on the spot.',
    showAuthor: true,
  },

  [FUNCTIONALITY.TEAM]: {
    eyebrow: 'At the bench',
    title: 'Who will be doing the work',
    lead: 'Five of us, and the person who quotes your job is one of the five who will cut it.',
  },

  [FUNCTIONALITY.GALLERY]: {
    eyebrow: 'The work',
    title: 'What has gone out of here and onto a wall',
    lead: 'Photographed on the bench before it left, and a few of them again on the wall they were made for.',
  },

  [FUNCTIONALITY.FIGURES]: {
    eyebrow: 'By the numbers',
    title: 'What {company} has to show for it',
    lead: 'Thirteen years on the same stretch of road, and a wall of mouldings that has been added to every one of them.',
  },

  [FUNCTIONALITY.FEATURES]: {
    eyebrow: 'Why here',
    title: 'What you can count on',
    lead: 'Six things we do the same way on every job, whether it is one frame or fifty.',
  },

  [FUNCTIONALITY.TESTIMONIALS]: {
    eyebrow: 'Reviews',
    title: 'What people say once it is on the wall',
    lead: '',
    /* Open to customers: a framing shop lives on word of mouth, and a wall only
       the shop can write on is a brochure. Submissions still arrive pending. */
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
   * `defaultSliders` ships, so a slide the shop has since edited is no longer
   * one of them and is left alone. Done before the shop's own slides are
   * written rather than after, because the first default is titled with the
   * company's name and this shop's opening slide is too: retiring afterwards
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
     * pale rectangle reads as a photograph nobody has replaced yet. The hero
     * here sits *inside a mount* — see the template's `Slider.module.css` — and
     * a pale rectangle in the window of a mount reads as a framing job nobody
     * finished. A slide with no image sits on the template's own wash, which is
     * what that wash is for; the shop uploads its own in Slider Management and
     * the scrim takes over.
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
    eyebrow: 'The workshop',
    title: 'A bench, a wall of mouldings, and a saw that gets used every day',
    lead: 'Open since 2012, and still run by the person who cuts the difficult mounts.',
    body:
      'AJ Home Decor & Framings started as a two-metre bench at the back of a stationery shop, on the understanding that we would rather frame four things properly than nine of them quickly. Thirteen years later there is a workshop behind the counter and two hundred and forty profiles on the wall, and the understanding has not changed.\n\n' +
      'Everything here follows from one rule: nothing is quoted before somebody has seen it. It is why we ask people to bring the piece in, why a written quote comes before anything is cut, and why we will talk you out of an upgrade we do not think your wall needs.\n\n' +
      'We cut, join, mount, glaze and fit on the premises. Nothing is sent out, which is slower on a busy week and the only way we have found to be answerable for a corner that opens two years later.\n\n' +
      'If something we made is not sitting right, bring it back. We have re-cut mounts for people who bought the frame from us in 2015, and we will keep doing it.',
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
    title: 'Talk to AJ Home Decor & Framings',
    lead: 'Tell us what you are framing and roughly how big it is, and send a photograph if you have one. For a wall, send the wall too — it saves a visit.',
    showForm: true,
    formTarget: CONTACT_FORM_TARGET.WHATSAPP,
    formNote: 'We answer between 10:30am and 7:30pm, Monday to Saturday, usually within the hour.',
    showLocations: true,
  });
  created.contactPage = 1;
}

async function seedWhatsapp(companyId, created) {
  const numbers = [
    {
      type: WHATSAPP_TYPE.CONTACT,
      number: '9825044101',
      label: 'The shop',
      defaultMessage: 'Hello AJ Home Decor, I would like to ask about framing something.',
      sequence: 1,
    },
    {
      type: WHATSAPP_TYPE.INQUIRY,
      number: '9825044103',
      label: 'Quotes & site visits',
      defaultMessage: 'Hello AJ Home Decor, I would like a quote for a framing job.',
      sequence: 2,
    },
    {
      type: WHATSAPP_TYPE.ORDERS,
      number: '9825044104',
      label: 'Shop orders',
      defaultMessage: 'Hello AJ Home Decor, I would like to place an order from the shop.',
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
        /* The shop's own copy, so it is born approved — asking a business to
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
        icon: 'layers',
        description: 'Framing workshops and decor shops — a price list for the bench, a diary and a shelf that takes orders.',
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
    logger.info(`Seeding AJ Home Decor & Framings into "${company.name}" (id ${company.id})`);

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
      logger.info(`Admin login: ajay@ajhomedecor.in / ${password}  (shown once, not stored in clear)`);
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

    logger.info('Serve it: cd themes/atelier && npm run dev  →  http://localhost:4600');
    logger.info(`The site resolves this tenant from TENANT_DOMAIN=${DOMAIN} in its .env.local`);

    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
