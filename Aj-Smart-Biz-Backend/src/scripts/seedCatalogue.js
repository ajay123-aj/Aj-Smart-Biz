'use strict';

/**
 * Demo catalogue for one tenant — an electrical goods retailer.
 *
 *     npm run db:seed:catalogue            # company 1
 *     npm run db:seed:catalogue -- 3       # company 3
 *
 * **Deliberately not part of `runBootstrap`, and deliberately not run on boot.**
 * Every other seeder on the platform fills in content the template would
 * otherwise invent — six benefit cards, four figures, three hero slides — and
 * those are safe because they are wording a tenant edits. A *product* the
 * platform made up is a business advertising stock it does not carry, with a
 * price on it, and a customer arriving with the wrong money. Which is the same
 * reason there are no default services. So this is a script somebody runs on
 * purpose, at a company they name, to see the catalogue working.
 *
 * Idempotent by slug: re-running adds whatever is missing and leaves the rest
 * alone, so it is safe against a database somebody has already edited by hand.
 *
 * The photographs are **generated placeholders**, written to `uploads/product`
 * and `uploads/category` as `seed-*.svg` and labelled as samples in the corner.
 * They exist so the gallery, the thumbnail strip and the image-count badge have
 * something to show. Delete the `seed-` prefixed files in those two folders and
 * they are gone.
 */

const { sequelize, ensureDatabaseExists } = require('../config/database');
const db = require('../models');
const { uniqueSlug, slugify } = require('../utils/slug');
const { writePlaceholder } = require('../utils/placeholderImage');
const logger = require('../utils/logger');
const { STATUS, FUNCTIONALITY, PRODUCT_STOCK } = require('../constants');

/* ------------------------------------------------------------------ *
 * The tree
 * ------------------------------------------------------------------ */

/**
 * Six main categories, nested where a real electrical catalogue nests.
 *
 * Lighting goes three deep — Lighting › Indoor › LED Bulbs — because that is
 * genuinely how the trade sorts it, and because a demo of a feature whose whole
 * point is nesting should actually nest.
 */
const CATEGORIES = [
  {
    name: 'Lighting',
    icon: 'lightbulb',
    featured: true,
    description: 'Bulbs, panels and fittings for every room, indoors and out.',
    children: [
      {
        name: 'Indoor Lighting',
        icon: 'lightbulb',
        description: 'Everything that goes inside the house.',
        children: [
          { name: 'LED Bulbs', icon: 'lightbulb', description: 'B22 and E27 bulbs, 5W to 20W.' },
          { name: 'Panel Lights', icon: 'layers', description: 'Recessed and surface panels, round and square.' },
        ],
      },
      {
        name: 'Outdoor Lighting',
        icon: 'globe',
        description: 'Weatherproof fittings for gates, yards and signage.',
        children: [
          { name: 'Flood Lights', icon: 'zap', description: 'From 20W to 200W, IP65 rated.' },
        ],
      },
    ],
  },
  {
    name: 'Switches & Sockets',
    icon: 'zap',
    featured: true,
    description: 'Modular plates, switches and plug points in white and matte black.',
    children: [
      { name: 'Modular Switches', icon: 'zap', description: 'One-way, two-way and bell push, 6A to 20A.' },
      { name: 'Sockets & Plug Points', icon: 'zap', description: 'Two-pin, three-pin and USB combination sockets.' },
    ],
  },
  {
    name: 'Fans',
    icon: 'refresh',
    featured: true,
    description: 'Ceiling, wall and exhaust fans, including BLDC models.',
    children: [
      { name: 'Ceiling Fans', icon: 'refresh', description: '1200mm and 1400mm sweep, decorative and economy.' },
      { name: 'Exhaust Fans', icon: 'refresh', description: 'Kitchen and bathroom extraction, 150mm to 250mm.' },
    ],
  },
  {
    name: 'Wires & Cables',
    icon: 'layers',
    description: 'FR and FRLS house wiring in every standard gauge.',
    children: [
      { name: 'House Wiring Cable', icon: 'layers', description: '0.75 to 6 sq mm, 90m coils.' },
    ],
  },
  {
    name: 'Circuit Protection',
    icon: 'shield',
    description: 'MCBs, RCCBs and the boards to mount them in.',
    children: [
      { name: 'MCBs & RCCBs', icon: 'shield', description: 'Single, double and four pole, 6A to 63A.' },
      { name: 'Distribution Boards', icon: 'shield', description: '4-way to 16-way, single and double door.' },
    ],
  },
  {
    name: 'Appliances',
    icon: 'tools',
    description: 'Water heaters and stabilizers, fitted if you want them.',
    children: [
      { name: 'Water Heaters', icon: 'tools', description: 'Instant and storage geysers, 3L to 25L.' },
      { name: 'Voltage Stabilizers', icon: 'shield', description: 'For air conditioners, fridges and televisions.' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * The stock
 * ------------------------------------------------------------------ */

/**
 * Twenty-two products, chosen to exercise every shape the catalogue supports
 * rather than to be an exhaustive price list:
 *
 *  - a reduced price, so the discount is computed and the badge reads `-25%`
 *  - a free-text price with `onOffer` ticked, which is the only way a business
 *    that prices per metre can run an offer at all
 *  - an offer that is not a reduction at all — `2 for 1`, `Free installation`
 *  - featured items, which lead the home page's product band
 *  - out of stock and made to order, so those badges have something to sit on
 *  - one product filed nowhere, because a company with nine things and no wish
 *    to sort them is an ordinary tenant
 *
 * `category` names the deepest category it belongs in. A visitor browsing
 * *Lighting* still finds an LED bulb filed under *Lighting › Indoor › LED Bulbs*.
 */
const PRODUCTS = [
  {
    name: '9W LED Bulb, Cool White',
    category: 'LED Bulbs',
    sku: 'LED-B22-9W',
    summary: 'B22 pin base, 900 lumens, 6500K. The one most houses run everywhere.',
    description:
      'A straight replacement for a 60W incandescent at a tenth of the running cost.\n\nDriver is surge protected to 4kV, which matters more on rural feeders than the wattage does. Two year replacement warranty over the counter — bring the bulb, take a new one.',
    highlights: ['Two year over-the-counter warranty', '4kV surge protected driver', 'No flicker on low voltage'],
    specs: [
      { label: 'Wattage', value: '9W' },
      { label: 'Base', value: 'B22 pin' },
      { label: 'Colour temperature', value: '6500K cool white' },
      { label: 'Luminous flux', value: '900 lm' },
      { label: 'Warranty', value: '2 years' },
    ],
    price: 149,
    offerPrice: 109,
    featured: true,
    images: 2,
  },
  {
    name: '12W LED Bulb, Warm White',
    category: 'LED Bulbs',
    sku: 'LED-E27-12W',
    summary: 'E27 screw base, 1200 lumens, 3000K. For living rooms and bedrooms.',
    highlights: ['Two year warranty', 'Dimmable on trailing-edge dimmers'],
    specs: [
      { label: 'Wattage', value: '12W' },
      { label: 'Base', value: 'E27 screw' },
      { label: 'Colour temperature', value: '3000K warm white' },
      { label: 'Luminous flux', value: '1200 lm' },
    ],
    price: 229,
    images: 1,
  },
  {
    name: '15W Round Panel Light',
    category: 'Panel Lights',
    sku: 'PNL-R-15W',
    summary: 'Recessed, 145mm cut-out. Slim enough for a false ceiling with ducting above it.',
    description:
      'Aluminium body, so it runs cooler than the plastic ones and lasts longer in a closed ceiling.\n\nComes with the driver and the spring clips. Cut-out is 145mm; the trim covers a rough edge up to 160mm.',
    highlights: ['145mm cut-out', 'Aluminium body', 'Driver included'],
    specs: [
      { label: 'Wattage', value: '15W' },
      { label: 'Cut-out', value: '145 mm' },
      { label: 'Body', value: 'Die-cast aluminium' },
      { label: 'Colour temperature', value: '6500K' },
    ],
    price: 449,
    offerPrice: 349,
    images: 3,
  },
  {
    name: '50W LED Flood Light, IP65',
    category: 'Flood Lights',
    sku: 'FLD-50W',
    summary: 'Gate, yard and signage lighting. Sealed against monsoon rain.',
    highlights: ['IP65 sealed', 'Toughened glass front', 'Adjustable yoke mount'],
    specs: [
      { label: 'Wattage', value: '50W' },
      { label: 'Ingress protection', value: 'IP65' },
      { label: 'Beam angle', value: '120°' },
      { label: 'Warranty', value: '2 years' },
    ],
    price: 1290,
    stockStatus: PRODUCT_STOCK.MADE_TO_ORDER,
    images: 1,
  },
  {
    name: '6A One-Way Modular Switch',
    category: 'Modular Switches',
    sku: 'MOD-SW-6A',
    summary: 'Single module, white. The switch that goes in every room of every job.',
    highlights: ['Silver alloy contacts', 'Rated 40,000 operations', 'Fits all standard plates'],
    specs: [
      { label: 'Rating', value: '6A, 240V' },
      { label: 'Modules', value: '1M' },
      { label: 'Finish', value: 'Glossy white' },
    ],
    price: 89,
    offerPrice: 69,
    featured: true,
    images: 2,
  },
  {
    name: '16A Two-Way Modular Switch',
    category: 'Modular Switches',
    sku: 'MOD-SW-16A-2W',
    summary: 'For stairs and long corridors — switch the same light from both ends.',
    specs: [
      { label: 'Rating', value: '16A, 240V' },
      { label: 'Modules', value: '1M' },
      { label: 'Type', value: 'Two-way' },
    ],
    price: 165,
    images: 1,
  },
  {
    name: '6A/16A Combination Socket',
    category: 'Sockets & Plug Points',
    sku: 'MOD-SKT-616',
    summary: 'Takes a two-pin and a three-pin plug in the same opening. Shuttered.',
    highlights: ['Child-safety shutters', 'Accepts 6A and 16A pins', '2M'],
    specs: [
      { label: 'Rating', value: '6A / 16A' },
      { label: 'Modules', value: '2M' },
      { label: 'Safety', value: 'Shuttered' },
    ],
    price: 245,
    images: 1,
  },
  {
    name: 'USB Charging Socket, Twin Port',
    category: 'Sockets & Plug Points',
    sku: 'MOD-USB-2P',
    summary: 'Two USB-A ports at 3.1A total, in a 2M modular plate.',
    highlights: ['3.1A shared across both ports', 'No adapter left in the socket'],
    specs: [
      { label: 'Output', value: '5V, 3.1A total' },
      { label: 'Ports', value: '2 × USB-A' },
      { label: 'Modules', value: '2M' },
    ],
    price: 699,
    offerPrice: 549,
    images: 2,
  },
  {
    name: '1200mm BLDC Ceiling Fan',
    category: 'Ceiling Fans',
    sku: 'FAN-BLDC-1200',
    summary: 'Runs at 28W flat out. Pays for itself against an induction fan in about two years.',
    description:
      'A BLDC motor draws roughly a third of what an ordinary induction fan draws for the same air delivery, and it will run on an inverter for hours rather than minutes.\n\nComes with the remote. Five speeds, and it remembers the last one after a power cut.',
    highlights: ['28W at full speed', 'Remote with five speeds', 'Runs well on an inverter', '3 year motor warranty'],
    specs: [
      { label: 'Sweep', value: '1200 mm' },
      { label: 'Power', value: '28W' },
      { label: 'Air delivery', value: '220 m³/min' },
      { label: 'Motor', value: 'BLDC' },
      { label: 'Warranty', value: '3 years' },
    ],
    price: 3499,
    offerPrice: 2799,
    featured: true,
    images: 3,
  },
  {
    name: '1400mm Ceiling Fan, Economy',
    category: 'Ceiling Fans',
    sku: 'FAN-IND-1400',
    summary: 'Ordinary induction motor, larger sweep. For halls and shop floors.',
    specs: [
      { label: 'Sweep', value: '1400 mm' },
      { label: 'Power', value: '78W' },
      { label: 'Air delivery', value: '260 m³/min' },
    ],
    price: 1899,
    images: 1,
  },
  {
    name: '150mm Exhaust Fan',
    category: 'Exhaust Fans',
    sku: 'EXH-150',
    summary: 'Bathroom extraction. Fits a standard 6 inch opening.',
    highlights: ['Detachable grille for cleaning', 'Low noise bearing'],
    specs: [
      { label: 'Sweep', value: '150 mm' },
      { label: 'Power', value: '30W' },
      { label: 'Speed', value: '2400 RPM' },
    ],
    price: 949,
    onOffer: true,
    offerLabel: 'Free installation',
    images: 1,
  },
  {
    name: '250mm Kitchen Exhaust Fan',
    category: 'Exhaust Fans',
    sku: 'EXH-250',
    summary: 'Heavy duty, for a kitchen that actually gets used.',
    specs: [
      { label: 'Sweep', value: '250 mm' },
      { label: 'Power', value: '55W' },
      { label: 'Body', value: 'Metal' },
    ],
    price: 1750,
    stockStatus: PRODUCT_STOCK.OUT_OF_STOCK,
    images: 1,
  },
  {
    name: '1.5 sq mm FR House Wire, 90m',
    category: 'House Wiring Cable',
    sku: 'WIR-1.5-90',
    summary: 'Lighting circuits and fan points. Flame retardant, 90 metre coil.',
    description:
      'Electrolytic grade copper, annealed and bunched, with FR PVC insulation rated to 70°C.\n\nSold by the coil over the counter, or cut to length if you tell us what you need.',
    highlights: ['99.97% electrolytic copper', 'FR insulation, 70°C rated', 'ISI marked'],
    specs: [
      { label: 'Cross section', value: '1.5 sq mm' },
      { label: 'Length', value: '90 m' },
      { label: 'Conductor', value: 'Annealed bare copper' },
      { label: 'Insulation', value: 'FR PVC' },
    ],
    price: 1180,
    images: 2,
  },
  {
    name: '2.5 sq mm FR House Wire, 90m',
    category: 'House Wiring Cable',
    sku: 'WIR-2.5-90',
    summary: 'Power circuits and 16A sockets. The gauge most plug points want.',
    specs: [
      { label: 'Cross section', value: '2.5 sq mm' },
      { label: 'Length', value: '90 m' },
      { label: 'Insulation', value: 'FR PVC' },
    ],
    price: 1890,
    offerPrice: 1650,
    images: 1,
  },
  {
    name: '4 sq mm FRLS House Wire',
    category: 'House Wiring Cable',
    sku: 'WIR-4-FRLS',
    summary: 'For air conditioner and geyser runs. Low smoke as well as flame retardant.',
    /* Priced by the metre, so the numbers are left empty and the label carries
       it — and the offer has to be the hand-ticked kind. */
    priceLabel: '₹42 per metre',
    onOffer: true,
    offerLabel: '10% off over 50m',
    specs: [
      { label: 'Cross section', value: '4 sq mm' },
      { label: 'Insulation', value: 'FRLS PVC' },
      { label: 'Sold as', value: 'Cut to length' },
    ],
    images: 1,
  },
  {
    name: '32A Double Pole MCB',
    category: 'MCBs & RCCBs',
    sku: 'MCB-DP-32',
    summary: 'C-curve, 10kA breaking capacity. For a geyser or an AC circuit.',
    highlights: ['10kA breaking capacity', 'C curve', 'DIN rail mount'],
    specs: [
      { label: 'Rating', value: '32A' },
      { label: 'Poles', value: 'Double pole' },
      { label: 'Curve', value: 'C' },
      { label: 'Breaking capacity', value: '10 kA' },
    ],
    price: 720,
    images: 1,
  },
  {
    name: '40A 30mA RCCB',
    category: 'MCBs & RCCBs',
    sku: 'RCCB-40-30',
    summary: 'Earth leakage protection for the whole board. The one that saves a life.',
    description:
      'Trips on a 30mA leakage to earth, which is below the threshold that stops a heart.\n\nIt is not a substitute for an MCB and does not protect against overload — it goes upstream of them, not instead of them.',
    highlights: ['30mA sensitivity', 'Test button on the front', 'Two pole'],
    specs: [
      { label: 'Rating', value: '40A' },
      { label: 'Sensitivity', value: '30 mA' },
      { label: 'Poles', value: 'Two pole' },
    ],
    price: 2450,
    offerPrice: 1990,
    featured: true,
    images: 2,
  },
  {
    name: '8-Way Distribution Board, Double Door',
    category: 'Distribution Boards',
    sku: 'DB-8W-DD',
    summary: 'Powder coated steel, IP43. Takes eight single-pole modules.',
    specs: [
      { label: 'Ways', value: '8' },
      { label: 'Door', value: 'Double' },
      { label: 'Ingress protection', value: 'IP43' },
      { label: 'Material', value: 'Powder coated CRCA steel' },
    ],
    price: 1650,
    images: 1,
  },
  {
    name: '16-Way Distribution Board',
    category: 'Distribution Boards',
    sku: 'DB-16W',
    summary: 'For a full house or a small shop. Room for an RCCB and fifteen MCBs.',
    price: 2890,
    stockStatus: PRODUCT_STOCK.MADE_TO_ORDER,
    images: 1,
  },
  {
    name: '15L Storage Water Heater',
    category: 'Water Heaters',
    sku: 'GEY-15L',
    summary: 'Glass-lined tank, five star rated. Fitted the same week if you want.',
    description:
      'Glass-lined inner tank with a magnesium anode, which is what stops hard water eating the element.\n\nFive year tank warranty, two on the element. We will fit it and test the earthing — ask at the counter.',
    highlights: ['5 year tank warranty', 'Magnesium anode for hard water', 'Five star rated', 'Fitting available'],
    specs: [
      { label: 'Capacity', value: '15 litres' },
      { label: 'Power', value: '2000W' },
      { label: 'Pressure', value: '8 bar' },
      { label: 'Warranty', value: '5 years tank, 2 years element' },
    ],
    price: 8990,
    offerPrice: 7490,
    featured: true,
    images: 3,
  },
  {
    name: '3L Instant Water Heater',
    category: 'Water Heaters',
    sku: 'GEY-3L',
    summary: 'Over a kitchen sink or a small bathroom. Hot in under a minute.',
    specs: [
      { label: 'Capacity', value: '3 litres' },
      { label: 'Power', value: '3000W' },
    ],
    price: 3450,
    images: 1,
  },
  {
    name: '4kVA Voltage Stabilizer',
    category: 'Voltage Stabilizers',
    sku: 'STB-4KVA',
    summary: 'For a 1.5 ton air conditioner. Works down to 130V.',
    highlights: ['130V to 290V working range', 'Time delay on restart', 'Wall mounted'],
    specs: [
      { label: 'Capacity', value: '4 kVA' },
      { label: 'Input range', value: '130V – 290V' },
      { label: 'Suits', value: 'Up to 1.5 ton AC' },
    ],
    price: 4290,
    images: 1,
  },
  {
    /* Filed nowhere on purpose — a tenant with a handful of odds and ends and no
       wish to sort them is an ordinary case, and the catalogue renders it. */
    name: 'Insulated Screwdriver Set, 6 Piece',
    category: null,
    sku: 'TL-SD-6',
    summary: 'VDE rated to 1000V. Flat and Phillips, in a roll.',
    specs: [
      { label: 'Pieces', value: '6' },
      { label: 'Rating', value: 'VDE 1000V' },
    ],
    price: 890,
    images: 1,
  },
];

/* ------------------------------------------------------------------ *
 * Writing it
 * ------------------------------------------------------------------ */

/**
 * Finds or creates one category, and returns its id.
 *
 * Matched on slug rather than name, because the slug is what the website
 * addresses it by and what a second run would collide on.
 */
async function upsertCategory(companyId, node, parentId, sequence, created) {
  const slug = slugify(node.name);
  const existing = await db.CompanyCategory.findOne({ where: { companyId, slug } });
  if (existing) return existing.id;

  const row = await db.CompanyCategory.create({
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

  created.categories += 1;
  return row.id;
}

/** Walks the tree depth-first, so a parent always exists before its children. */
async function seedCategories(companyId, nodes, parentId, created, byName) {
  let sequence = 1;

  for (const node of nodes) {
    const id = await upsertCategory(companyId, node, parentId, sequence, created);
    byName.set(node.name, id);
    sequence += 1;

    if (node.children?.length) {
      await seedCategories(companyId, node.children, id, created, byName);
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

    created.products += 1;
    sequence += 1;
  }
}

/**
 * The switch, so the catalogue actually reaches the website.
 *
 * Only the tenant's own half — the plan's grant is the platform's to give, and a
 * script that quietly widened a company's plan would be doing something nobody
 * asked it to. If the plan does not carry `products` this says so and stops
 * short of the website rather than forcing it.
 */
async function ensureSwitchedOn(companyId) {
  const [row] = await db.CompanyFunctionality.findOrCreate({
    where: { companyId, key: FUNCTIONALITY.PRODUCTS },
    defaults: { companyId, key: FUNCTIONALITY.PRODUCTS, status: STATUS.ACTIVE },
  });

  if (row.status !== STATUS.ACTIVE) await row.update({ status: STATUS.ACTIVE });
}

(async () => {
  try {
    const companyId = Number(process.argv[2]) || 1;

    await ensureDatabaseExists();
    await sequelize.authenticate();

    const company = await db.Company.findByPk(companyId);
    if (!company) throw new Error(`No company with id ${companyId}`);

    logger.info(`Seeding the demo catalogue into "${company.name}" (id ${companyId})`);

    const created = { categories: 0, products: 0 };
    const byName = new Map();

    await seedCategories(companyId, CATEGORIES, null, created, byName);
    await seedProducts(companyId, byName, created);
    await ensureSwitchedOn(companyId);

    const totals = {
      categories: await db.CompanyCategory.count({ where: { companyId } }),
      products: await db.CompanyProduct.count({ where: { companyId } }),
    };

    logger.info(
      `Added ${created.categories} categories and ${created.products} products ` +
      `(company now has ${totals.categories} and ${totals.products})`
    );

    /* The grant is the platform's, so this reports rather than changes it. */
    const functionalityService = require('../services/functionality.service');
    const item = await functionalityService.getFunctionality(companyId, FUNCTIONALITY.PRODUCTS);
    if (!item?.active) {
      logger.warn(
        `The catalogue will NOT show on the website yet: ${item?.message ?? 'products is not live'}`
      );
    } else {
      logger.info('The catalogue is live on this tenant’s website.');
    }

    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
