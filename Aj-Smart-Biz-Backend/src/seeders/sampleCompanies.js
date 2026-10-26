'use strict';

/**
 * The five **sample companies** the super admin can create from Company
 * Management with one button, each a different shape of business, so every
 * part of a tenant website can be seen working without typing a tenant in:
 *
 *  1. `electronics`  a shop that also repairs: products *and* bookable services
 *  2. `events`       services only, mostly quoted: an enquiry-led business
 *  3. `ecommerce`    products only, ordered online over WhatsApp
 *  4. `info`         informational: pages, services, team and a blog, no shop
 *  5. `commercial`   the full set: a deep product tree, services, orders, blog
 *
 * The content is in exactly the shape the AI content creator returns (`site`,
 * `services`, `products`, `blog`), so it is written by the same code
 * (`aiContent.service` → `writeContent`) and nothing here duplicates a writer.
 *
 * Every company is fictional and says so in its description. Emails use the
 * reserved `.example` domain and hosts use `.localhost`, so nothing here can
 * reach or impersonate a real business.
 */

/* ------------------------------------------------------------------ *
 * Shorthands, so the catalogues below read as lists
 * ------------------------------------------------------------------ */

const service = (title, category, icon, price, summary, extra = {}) => ({
  title,
  category,
  icon,
  price,
  summary,
  highlights: [],
  bookable: false,
  featured: false,
  ...extra,
});

const product = (name, category, sku, price, summary, specs = [], extra = {}) => ({
  name,
  category,
  sku,
  price,
  summary,
  specs: specs.map(([label, value]) => ({ label, value })),
  highlights: [],
  stockStatus: 'in_stock',
  featured: false,
  ...extra,
});

const post = (title, author, tags, excerpt, paragraphs, featured = false) => ({
  title,
  author,
  tags,
  excerpt,
  body: paragraphs.join('\n\n'),
  featured,
});

/* ------------------------------------------------------------------ *
 * 1. Electronics
 * ------------------------------------------------------------------ */

const electronics = {
  key: 'electronics',
  label: 'Electronics shop & repairs',
  businessType: { name: 'Electronics', slug: 'electronics', icon: 'zap', description: 'Electronics retail, repairs and installation.' },
  company: {
    name: 'Volt Electronics (Sample)',
    code: 'SAMPLEELEC',
    description: 'Sample company: an electronics shop that also repairs and installs.',
    email: 'hello@electronics.sample.example',
    phone: '9000000001',
    city: 'Ahmedabad',
    addressLine1: '14 Relief Road',
    pincode: '380001',
  },
  domain: 'electronics.sample.localhost',
  admin: { name: 'Volt Admin', email: 'admin@electronics.sample.example' },
  orders: true,
  content: {
    site: {
      slides: [
        { eyebrow: 'Since 2012', title: 'Volt Electronics', subtitle: 'Phones, laptops, TVs and appliances, with the repair bench in the same building.', ctaLabel: 'Shop now', ctaTarget: 'products' },
        { eyebrow: 'Repairs', title: 'Fixed in our own workshop', subtitle: 'Screens, batteries and boards, quoted before we open anything.', ctaLabel: 'Book a repair', ctaTarget: 'services' },
        { eyebrow: 'Installation', title: 'We fit what we sell', subtitle: 'TV wall mounts, AC installation and home Wi-Fi set up properly the first time.', ctaLabel: 'See services', ctaTarget: 'services' },
      ],
      about: {
        title: 'A shop with a workbench',
        lead: 'We sell electronics and we repair them, which keeps us honest about what lasts.',
        body: 'Volt started as a two-person repair counter. Twelve years later we sell phones, laptops, televisions and home appliances, and the repair bench is still at the back of the shop.\n\nBecause we repair what we sell, we only stock brands we can get parts for. If something we sold you breaks, you bring it back to the people who sold it.\n\nEvery repair is quoted before work starts, and nothing is replaced without your say-so.',
      },
      contact: { title: 'Visit or message us', lead: 'Open every day 10am to 9pm. Bring the device and the charger.', formNote: 'We reply within the hour during opening times.' },
      features: {
        eyebrow: 'Why Volt',
        title: 'What you can count on',
        lead: '',
        items: [
          { icon: 'tools', title: 'Repairs in-house', body: 'Our own technicians, our own bench. Nothing is sent away.' },
          { icon: 'shield', title: 'Genuine warranty', body: 'Every product carries the full manufacturer warranty, registered for you.' },
          { icon: 'wallet', title: 'Quote first', body: 'You hear the price of a repair before any work begins.' },
          { icon: 'truck', title: 'Free city delivery', body: 'Free delivery and set-up inside the city on orders over ₹10,000.' },
          { icon: 'refresh', title: 'Exchange offers', body: 'Bring your old phone or TV and we will value it against the new one.' },
          { icon: 'headset', title: 'After-sales help', body: 'Call or WhatsApp us for help with anything you bought here.' },
        ],
      },
      figures: {
        eyebrow: 'By the numbers',
        title: 'Volt in numbers',
        lead: '',
        items: [
          { label: 'Years in business', sinceDate: '2012-06-01', suffix: '+' },
          { label: 'Devices repaired', value: '38,000', suffix: '+' },
          { label: 'Brands stocked', value: '40' },
        ],
      },
      team: {
        eyebrow: 'The team',
        title: 'Who you will meet',
        lead: '',
        members: [
          { name: 'Kiran Mehta', role: 'Founder', bio: 'Started the repair counter in 2012 and still diagnoses the hard ones.' },
          { name: 'Arjun Rao', role: 'Head Technician', bio: 'Board-level repair for phones and laptops.' },
        ],
      },
    },
    services: {
      page: { navLabel: 'Repairs', eyebrow: 'Repairs & installation', title: 'What we fix and fit', lead: 'Walk in or book a slot. Every repair is quoted first.', ctaLabel: 'Enquire' },
      categories: [
        { name: 'Phone Repair', description: 'Screens, batteries, charging ports and cameras.', icon: 'phone', featured: true },
        { name: 'Laptop Repair', description: 'Keyboards, screens, batteries, upgrades and data recovery.', icon: 'tools', featured: true },
        { name: 'Installation', description: 'TV mounting, AC fitting and home networks.', icon: 'zap', featured: true },
      ],
      items: [
        service('Phone Screen Replacement', 'Phone Repair', 'phone', 2499, 'Original-grade screens fitted in about an hour.', { durationMinutes: 60, bookable: true, featured: true, highlights: ['90-day warranty', 'Most models same day'] }),
        service('Phone Battery Replacement', 'Phone Repair', 'zap', 1499, 'A new battery and a health check, in 45 minutes.', { durationMinutes: 45, bookable: true }),
        service('Charging Port Repair', 'Phone Repair', 'tools', 899, 'Cleaned or replaced, tested with your own charger.', { durationMinutes: 45, bookable: true }),
        service('Laptop Diagnostics', 'Laptop Repair', 'lightbulb', 499, 'A full check and a written quote. Free if you go ahead with the repair.', { durationMinutes: 30, bookable: true, featured: true }),
        service('SSD & RAM Upgrade', 'Laptop Repair', 'rocket', 1200, 'Make an old laptop fast again. Price is fitting only; parts quoted separately.', { durationMinutes: 90, bookable: true, offerPrice: 999 }),
        service('Data Recovery', 'Laptop Repair', 'lock', null, 'From failed drives and dead laptops. Quoted after diagnosis.', { priceLabel: 'On quote' }),
        service('TV Wall Mounting', 'Installation', 'tools', 999, 'Bracket, drilling, cable tidy and tuning, at your home.', { durationMinutes: 90, bookable: true, featured: true }),
        service('Split AC Installation', 'Installation', 'zap', 1800, 'Standard installation with up to 3m of copper pipe.', { durationMinutes: 180, bookable: true }),
        service('Home Wi-Fi Setup', 'Installation', 'globe', 799, 'Router placement, mesh set-up and every device connected.', { durationMinutes: 60, bookable: true }),
      ],
    },
    products: {
      page: { navLabel: 'Shop', eyebrow: 'The shop', title: 'Electronics we stock and stand behind', lead: 'Full warranty on everything, registered for you at the counter.' },
      categories: [
        { name: 'Mobiles', description: 'Smartphones and accessories.', featured: true },
        { name: 'Smartphones', parent: 'Mobiles', description: 'Android and iPhone.' },
        { name: 'Mobile Accessories', parent: 'Mobiles', description: 'Chargers, cases and power banks.' },
        { name: 'Computers', description: 'Laptops and peripherals.', featured: true },
        { name: 'TV & Audio', description: 'Televisions, soundbars and speakers.', featured: true },
        { name: 'Home Appliances', description: 'Refrigerators, washing machines and ACs.' },
      ],
      items: [
        product('Galaxy A55 5G, 8/128 GB', 'Smartphones', 'MOB-A55-128', 38999, 'A mid-range phone with a flagship-class screen.', [['Display', '6.6" AMOLED, 120Hz'], ['Battery', '5000 mAh'], ['Storage', '128 GB']], { offerPrice: 35999, featured: true }),
        product('iPhone 15, 128 GB', 'Smartphones', 'MOB-IP15-128', 69900, 'The current iPhone, with USB-C.', [['Display', '6.1" OLED'], ['Storage', '128 GB']], { featured: true }),
        product('65W GaN Fast Charger', 'Mobile Accessories', 'ACC-GAN65', 2499, 'Charges a phone and a laptop from one plug.', [['Output', '65W'], ['Ports', '2× USB-C, 1× USB-A']]),
        product('20,000 mAh Power Bank', 'Mobile Accessories', 'ACC-PB20K', 1999, 'Two full phone charges, 22.5W fast charging.', [['Capacity', '20,000 mAh']], { offerPrice: 1599 }),
        product('IdeaPad Slim 5, Ryzen 7', 'Computers', 'LAP-IP5-R7', 62990, 'A light 14" laptop with all-day battery.', [['CPU', 'Ryzen 7 7730U'], ['RAM', '16 GB'], ['SSD', '512 GB']], { featured: true }),
        product('Wireless Keyboard & Mouse Combo', 'Computers', 'PER-KBM-01', 1799, 'Quiet keys and one USB receiver for both.'),
        product('55" 4K Google TV', 'TV & Audio', 'TV-55-4K', 42990, 'Dolby Vision and Atmos, with free wall mounting.', [['Size', '55 inch'], ['Resolution', '3840 × 2160']], { offerPrice: 39990, featured: true }),
        product('3.1 Channel Soundbar', 'TV & Audio', 'AUD-SB31', 18990, 'A dedicated centre channel for clearer dialogue.', [['Power', '360W']]),
        product('1.5 Ton 5-Star Inverter AC', 'Home Appliances', 'APP-AC15-5S', 44990, 'Low running cost, installation available.', [['Capacity', '1.5 ton'], ['Rating', '5 star']]),
        product('7 kg Front-Load Washing Machine', 'Home Appliances', 'APP-WM7-FL', 31990, 'Steam wash and a 1200 rpm spin.', [['Capacity', '7 kg']], { stockStatus: 'out_of_stock' }),
      ],
    },
    blog: {
      page: { navLabel: 'Tips', eyebrow: 'Tips', title: 'From the repair bench', lead: 'What we tell customers at the counter.' },
      posts: [
        post('Five habits that double your phone battery’s life', 'Arjun Rao', ['phones', 'batteries'], 'Most batteries we replace were worn out by charging habits, not age.', [
          'Lithium batteries wear fastest when they are full and hot. Charging overnight on a pillow is the worst of both.',
          'Keep the charge between roughly 20 and 80 percent when you can, and turn on your phone’s optimised charging setting.',
          'Use a good charger. Cheap ones run hot and deliver uneven current.',
          'Take the case off when gaming while charging. Heat is the enemy.',
        ], true),
        post('Repair or replace? How we decide', 'Kiran Mehta', ['repairs'], 'A simple rule we use before quoting any repair.', [
          'If a repair costs more than half the price of a comparable new device, we say so before we start.',
          'Age matters too: a five-year-old laptop may not get software updates much longer, however well it is repaired.',
          'Data is the exception. If what is on the device matters to you, we will always try to recover it first.',
        ]),
      ],
    },
  },
};

/* ------------------------------------------------------------------ *
 * 2. Event management
 * ------------------------------------------------------------------ */

const events = {
  key: 'events',
  label: 'Event management',
  businessType: { name: 'Event Management', slug: 'event-management', icon: 'calendar', description: 'Weddings, corporate events and celebrations.' },
  company: {
    name: 'Utsav Events (Sample)',
    code: 'SAMPLEEVENT',
    description: 'Sample company: weddings, corporate events and private celebrations.',
    email: 'hello@events.sample.example',
    phone: '9000000002',
    city: 'Jaipur',
    addressLine1: '22 MI Road',
    pincode: '302001',
  },
  domain: 'events.sample.localhost',
  admin: { name: 'Utsav Admin', email: 'admin@events.sample.example' },
  content: {
    site: {
      slides: [
        { eyebrow: 'Weddings & events', title: 'Utsav Events', subtitle: 'From the first site visit to the last guest leaving, one team runs your day.', ctaLabel: 'Plan your event', ctaTarget: 'contact' },
        { eyebrow: 'Corporate', title: 'Conferences that run on time', subtitle: 'Venues, stages, AV and registration for 50 to 2,000 guests.', ctaLabel: 'See services', ctaTarget: 'services' },
        { eyebrow: 'Celebrations', title: 'Birthdays, anniversaries, sangeets', subtitle: 'Themed décor, entertainment and catering, without the stress.', ctaLabel: 'Get a quote', ctaTarget: 'contact' },
      ],
      about: {
        title: 'Events planned like projects',
        lead: 'Every event gets one coordinator, one budget sheet and one timeline you can see.',
        body: 'Utsav was founded by two people who had run hotel banquets for a decade and knew where events go wrong: too many vendors, nobody in charge, and a budget that grows every week.\n\nSo every event we run has a single coordinator from first call to final invoice, a shared budget you can see at any time, and a minute-by-minute run sheet for the day.\n\nWe work with a fixed group of décor, catering, sound and photography partners we have used for years, which is how we keep quality steady and quotes honest.',
      },
      contact: { title: 'Tell us about your event', lead: 'The date, the city, a rough guest count and the kind of event. We will call back with questions and ideas.', formNote: 'We respond within one working day.' },
      features: {
        eyebrow: 'Why Utsav',
        title: 'How we work',
        lead: '',
        items: [
          { icon: 'people', title: 'One coordinator', body: 'One person who knows every detail, from first call to final invoice.' },
          { icon: 'wallet', title: 'Open budgets', body: 'A shared budget sheet with every line item. No surprise extras.' },
          { icon: 'clock', title: 'Minute-by-minute run sheets', body: 'Every vendor gets the same timeline, so the day runs on time.' },
          { icon: 'award', title: 'Trusted vendors', body: 'Décor, catering and AV partners we have worked with for years.' },
        ],
      },
      figures: {
        eyebrow: 'Our record',
        title: 'Events delivered',
        lead: '',
        items: [
          { label: 'Events managed', value: '850', suffix: '+' },
          { label: 'Weddings', value: '320', suffix: '+' },
          { label: 'Years running events', sinceDate: '2015-01-15', suffix: '+' },
        ],
      },
    },
    services: {
      page: { navLabel: 'Services', eyebrow: 'What we do', title: 'Events we plan and run', lead: 'Most events are quoted after a short call. Packages are a starting point, never a limit.', ctaLabel: 'Get a quote' },
      categories: [
        { name: 'Weddings', description: 'Full planning, décor and coordination.', icon: 'heart', featured: true },
        { name: 'Corporate Events', description: 'Conferences, launches, offsites and award nights.', icon: 'chart', featured: true },
        { name: 'Private Celebrations', description: 'Birthdays, anniversaries and family functions.', icon: 'star', featured: true },
        { name: 'Production', description: 'Stage, sound, lighting and AV on their own.', icon: 'zap' },
      ],
      items: [
        service('Full Wedding Planning', 'Weddings', 'heart', null, 'Every function, every vendor, one coordinator.', { priceLabel: 'From ₹4,50,000', featured: true, highlights: ['Venue shortlisting and visits', 'Vendor booking and management', 'On-site team on every day'] }),
        service('Wedding Day Coordination', 'Weddings', 'calendar', 75000, 'You plan it, we run it on the day.', { featured: true }),
        service('Sangeet & Mehendi Décor', 'Weddings', 'spark', null, 'Themed stage and venue décor.', { priceLabel: 'From ₹1,20,000' }),
        service('Conference Management', 'Corporate Events', 'people', null, 'Venue, registration, stage, AV and hospitality.', { priceLabel: 'On quote', featured: true }),
        service('Product Launch', 'Corporate Events', 'rocket', null, 'Concept, staging, media and guest management.', { priceLabel: 'On quote' }),
        service('Team Offsite', 'Corporate Events', 'map-pin', 2500, 'Per person, including venue, activities and meals.', { priceLabel: '₹2,500 per person' }),
        service('Birthday Party Package', 'Private Celebrations', 'star', 35000, 'Theme décor, host, games and cake table for up to 50 guests.', { offerPrice: 29999, featured: true }),
        service('Anniversary Dinner', 'Private Celebrations', 'heart', 45000, 'An intimate dinner set-up with music and photography.'),
        service('Stage & Sound Hire', 'Production', 'zap', 40000, 'Stage, line-array sound and a technician for one day.'),
        service('Event Photography & Video', 'Production', 'layers', 30000, 'Two photographers and a videographer, per day.'),
      ],
    },
    blog: {
      page: { navLabel: 'Journal', eyebrow: 'Journal', title: 'Planning notes', lead: 'What we have learned from 850 events.' },
      posts: [
        post('How far ahead should you book a wedding planner?', 'Utsav Team', ['weddings', 'planning'], 'Earlier than you think for peak season, later than you fear otherwise.', [
          'For November to February weddings, popular venues book up 9 to 12 months ahead. That is the real deadline.',
          'Outside peak season, four to six months is usually enough for a full plan.',
          'Day-of coordination can be booked as late as a month before, once your vendors are confirmed.',
        ], true),
        post('The five lines that blow event budgets', 'Utsav Team', ['budgets'], 'Where costs creep, and how to hold them.', [
          'Décor changes after the design is signed off, extra guests, overtime at the venue, last-minute transport, and taxes nobody included.',
          'Agree the guest count early, put a change budget aside, and ask every vendor for a quote with tax included.',
        ]),
      ],
    },
  },
};

/* ------------------------------------------------------------------ *
 * 3. E-commerce
 * ------------------------------------------------------------------ */

const ecommerce = {
  key: 'ecommerce',
  label: 'E-commerce store',
  businessType: { name: 'E-commerce', slug: 'e-commerce', icon: 'tag', description: 'Online stores selling products.' },
  company: {
    name: 'Kapas Store (Sample)',
    code: 'SAMPLESHOP',
    description: 'Sample company: an online store for cotton clothing and home textiles.',
    email: 'hello@shop.sample.example',
    phone: '9000000003',
    city: 'Surat',
    addressLine1: 'Ring Road Textile Market',
    pincode: '395002',
  },
  domain: 'shop.sample.localhost',
  admin: { name: 'Kapas Admin', email: 'admin@shop.sample.example' },
  orders: true,
  content: {
    site: {
      slides: [
        { eyebrow: 'New season', title: 'Kapas Store', subtitle: 'Pure cotton clothing and home textiles, made in Surat.', ctaLabel: 'Shop now', ctaTarget: 'products' },
        { eyebrow: 'Home', title: 'Bedsheets that get softer', subtitle: '300-thread-count cotton, pre-washed so it never shrinks.', ctaLabel: 'Shop home', ctaTarget: 'products' },
        { eyebrow: 'Offer', title: 'Free shipping over ₹999', subtitle: 'Delivered across India in 3 to 6 days.', ctaLabel: 'Start shopping', ctaTarget: 'products' },
      ],
      about: {
        title: 'Cotton, from the mill to your door',
        lead: 'We make what we sell, so we know what goes into it.',
        body: 'Kapas began in a family weaving unit in Surat. Today we design, cut and stitch our own clothing and home textiles, and sell them straight to you.\n\nEverything is pure cotton, pre-washed and checked by hand before it is packed.',
      },
      contact: { title: 'Questions about an order?', lead: 'Message us with your order number and we will sort it out.', formNote: 'Replies within a few hours, Monday to Saturday.' },
      features: {
        eyebrow: 'Shopping with us',
        title: 'Easy from order to doorstep',
        lead: '',
        items: [
          { icon: 'truck', title: 'Free shipping over ₹999', body: 'Delivered across India in 3 to 6 working days.' },
          { icon: 'refresh', title: '15-day returns', body: 'Unworn and unwashed? Send it back within 15 days.' },
          { icon: 'leaf', title: '100% cotton', body: 'No blends, no polyester, pre-washed before it ships.' },
          { icon: 'message', title: 'Order on WhatsApp', body: 'Add to your bag and send the order in one message.' },
        ],
      },
    },
    products: {
      page: { navLabel: 'Shop', eyebrow: 'Shop', title: 'Everything in cotton', lead: 'Clothing and home textiles, made by us.' },
      categories: [
        { name: 'Women', description: 'Kurtas, tops and loungewear.', featured: true },
        { name: 'Men', description: 'Shirts, kurtas and loungewear.', featured: true },
        { name: 'Home Textiles', description: 'Bedsheets, towels and cushion covers.', featured: true },
        { name: 'Bedsheets', parent: 'Home Textiles', description: 'Single, double and king.' },
        { name: 'Towels', parent: 'Home Textiles', description: 'Bath and hand towels.' },
      ],
      items: [
        product('Block-Print Cotton Kurta', 'Women', 'W-KUR-BP01', 1299, 'Hand block-printed, straight cut, side pockets.', [['Fabric', '100% cotton'], ['Sizes', 'XS–XXL']], { offerPrice: 999, featured: true }),
        product('Relaxed Cotton Top', 'Women', 'W-TOP-RX02', 799, 'A loose, breathable everyday top.', [['Fabric', '100% cotton']]),
        product('Women’s Lounge Set', 'Women', 'W-LNG-SET', 1499, 'Top and pyjama in soft cotton jersey.', [['Fabric', 'Cotton jersey']], { featured: true }),
        product('Classic Oxford Shirt', 'Men', 'M-SHT-OX01', 1399, 'A crisp shirt that softens with every wash.', [['Fabric', '100% cotton oxford'], ['Fit', 'Regular']], { featured: true }),
        product('Men’s Short Kurta', 'Men', 'M-KUR-SH02', 1099, 'Mandarin collar, cotton slub.', [['Fabric', 'Cotton slub']], { offerPrice: 899 }),
        product('300 TC Double Bedsheet Set', 'Bedsheets', 'H-BED-D300', 1899, 'Double sheet and two pillow covers, pre-washed.', [['Size', '90" × 100"'], ['Thread count', '300']], { featured: true }),
        product('King Size Percale Bedsheet', 'Bedsheets', 'H-BED-K400', 2499, 'Cool, crisp percale for warm nights.', [['Size', '108" × 108"'], ['Thread count', '400']]),
        product('Bath Towel, Pack of 2', 'Towels', 'H-TWL-B2', 999, 'Thick 500 GSM terry that dries fast.', [['GSM', '500'], ['Size', '30" × 60"']]),
        product('Hand Towel Set of 4', 'Towels', 'H-TWL-H4', 699, 'Four soft hand towels in mixed colours.', [['GSM', '450']], { stockStatus: 'out_of_stock' }),
      ],
    },
  },
};

/* ------------------------------------------------------------------ *
 * 4. Informational
 * ------------------------------------------------------------------ */

const info = {
  key: 'info',
  label: 'Informational company website',
  businessType: { name: 'Consulting & Services', slug: 'consulting', icon: 'lightbulb', description: 'Professional and consulting firms.' },
  company: {
    name: 'Northwind Consulting (Sample)',
    code: 'SAMPLEINFO',
    description: 'Sample company: an informational website for a business consulting firm.',
    email: 'hello@consulting.sample.example',
    phone: '9000000004',
    city: 'Pune',
    addressLine1: '5th Floor, Baner Business Park',
    pincode: '411045',
  },
  domain: 'consulting.sample.localhost',
  admin: { name: 'Northwind Admin', email: 'admin@consulting.sample.example' },
  content: {
    site: {
      slides: [
        { eyebrow: 'Business consulting', title: 'Northwind Consulting', subtitle: 'We help growing companies fix their finances, systems and teams.', ctaLabel: 'What we do', ctaTarget: 'services' },
        { eyebrow: 'Our approach', title: 'Advice you can act on Monday', subtitle: 'Short engagements, written plans, and help putting them in place.', ctaLabel: 'About us', ctaTarget: 'about' },
      ],
      about: {
        title: 'Practical consulting for growing companies',
        lead: 'Founded in 2016 by people who ran businesses before advising them.',
        body: 'Northwind works with companies of 20 to 500 people that have outgrown the way they started: spreadsheets that run the finances, processes that live in one person’s head, and teams that grew faster than their structure.\n\nWe start with a two-week diagnostic, write down what we find and what we would change, and then help you put it in place. Most engagements last three months.\n\nWe do not sell software, and we do not take commissions from anyone we recommend.',
      },
      contact: { title: 'Start a conversation', lead: 'Tell us a little about your company and what is getting in the way.', formNote: 'A partner replies within two working days.' },
      features: {
        eyebrow: 'Why Northwind',
        title: 'How we are different',
        lead: '',
        items: [
          { icon: 'target', title: 'Fixed scope, fixed fee', body: 'You know the cost before we start.' },
          { icon: 'check', title: 'Written recommendations', body: 'Every engagement ends with a plan your team can follow without us.' },
          { icon: 'shield', title: 'Independent', body: 'No software resale, no referral commissions.' },
          { icon: 'people', title: 'Partners do the work', body: 'The people you meet are the people who work on your business.' },
        ],
      },
      figures: {
        eyebrow: 'Track record',
        title: 'Northwind so far',
        lead: '',
        items: [
          { label: 'Clients advised', value: '140', suffix: '+' },
          { label: 'Years in practice', sinceDate: '2016-04-01', suffix: '+' },
          { label: 'Clients who came back', value: '72', suffix: '%' },
        ],
      },
      team: {
        eyebrow: 'Partners',
        title: 'Who you will work with',
        lead: '',
        members: [
          { name: 'Meera Kulkarni', role: 'Managing Partner', bio: 'Former CFO of a 300-person manufacturer. Leads finance and planning work.' },
          { name: 'Rohan Desai', role: 'Partner, Operations', bio: 'Fifteen years running operations in logistics and retail.' },
          { name: 'Sana Sheikh', role: 'Partner, People', bio: 'Builds hiring, review and pay structures for growing teams.' },
        ],
      },
    },
    services: {
      page: { navLabel: 'Services', eyebrow: 'Services', title: 'How we help', lead: 'Fixed-scope engagements, quoted after a first conversation.', ctaLabel: 'Enquire' },
      categories: [
        { name: 'Finance', description: 'Budgets, cash flow and reporting.', icon: 'chart', featured: true },
        { name: 'Operations', description: 'Processes, systems and supply chain.', icon: 'layers', featured: true },
        { name: 'People', description: 'Structure, hiring and performance.', icon: 'people', featured: true },
      ],
      items: [
        service('Business Diagnostic', 'Finance', 'target', 75000, 'Two weeks, a written report and a 90-day plan.', { featured: true, highlights: ['Interviews with your leadership', 'Review of finances and processes', 'Written 90-day plan'] }),
        service('Cash Flow & Budgeting', 'Finance', 'wallet', null, 'A rolling 13-week cash forecast and an annual budget your team can maintain.', { priceLabel: 'On quote', featured: true }),
        service('Management Reporting', 'Finance', 'chart', null, 'A monthly dashboard that tells you what matters.', { priceLabel: 'On quote' }),
        service('Process Mapping', 'Operations', 'layers', null, 'Write down how work actually gets done, then simplify it.', { priceLabel: 'On quote', featured: true }),
        service('Systems Selection', 'Operations', 'globe', null, 'Choose an ERP or CRM without a vendor in the room.', { priceLabel: 'On quote' }),
        service('Organisation Design', 'People', 'people', null, 'Roles, reporting lines and decision rights for the next stage.', { priceLabel: 'On quote' }),
        service('Hiring Framework', 'People', 'check', null, 'Scorecards and interview loops that hire consistently.', { priceLabel: 'On quote' }),
      ],
    },
    blog: {
      page: { navLabel: 'Insights', eyebrow: 'Insights', title: 'Notes for growing companies', lead: 'Short, practical, and written by the partners.' },
      posts: [
        post('Why every company over 30 people needs a cash forecast', 'Meera Kulkarni', ['finance'], 'Profit tells you how you did. Cash tells you whether you survive next quarter.', [
          'Most growing companies we meet are profitable and short of cash at the same time. Growth eats cash: stock, receivables and hiring all come before revenue.',
          'A 13-week rolling forecast, updated every Monday, is the simplest fix. It takes an hour a week once it is set up.',
          'The point is not accuracy. It is seeing the squeeze six weeks before it arrives, when you still have choices.',
        ], true),
        post('Write the process down before you buy software', 'Rohan Desai', ['operations'], 'Software makes a good process faster and a bad one more expensive.', [
          'Before choosing any system, map how the work is done today, with the people who do it.',
          'You will usually find steps nobody needs. Remove them first, then pick software that fits what remains.',
        ]),
        post('Three questions for every new role', 'Sana Sheikh', ['people', 'hiring'], 'Answer these before writing a job description.', [
          'What will this person have achieved in twelve months? Who will they work with every day? What decisions can they make without asking?',
          'If you cannot answer all three, the role is not ready to hire for.',
        ]),
      ],
    },
  },
};

/* ------------------------------------------------------------------ *
 * 5. Full commercial
 * ------------------------------------------------------------------ */

const commercial = {
  key: 'commercial',
  label: 'Full commercial business',
  businessType: { name: 'Retail & Wholesale', slug: 'retail-wholesale', icon: 'truck', description: 'Retailers and wholesalers with a full catalogue.' },
  company: {
    name: 'Grihasthi Home Mart (Sample)',
    code: 'SAMPLECOMM',
    description: 'Sample company: a full commercial home and kitchen store with a deep catalogue, services and online orders.',
    email: 'hello@homemart.sample.example',
    phone: '9000000005',
    city: 'Vadodara',
    addressLine1: 'Alkapuri Main Road',
    pincode: '390007',
  },
  domain: 'homemart.sample.localhost',
  admin: { name: 'Grihasthi Admin', email: 'admin@homemart.sample.example' },
  orders: true,
  content: {
    site: {
      slides: [
        { eyebrow: 'Home & kitchen', title: 'Grihasthi Home Mart', subtitle: 'Everything for the kitchen, the dining table and the home, under one roof.', ctaLabel: 'Shop the store', ctaTarget: 'products' },
        { eyebrow: 'This month', title: 'Kitchen upgrade sale', subtitle: 'Up to 25% off cookware and small appliances.', ctaLabel: 'See offers', ctaTarget: 'products' },
        { eyebrow: 'Services', title: 'Modular kitchens, measured and fitted', subtitle: 'Free home measurement and a 3D design before you decide.', ctaLabel: 'Book a visit', ctaTarget: 'services' },
      ],
      about: {
        title: 'A home store since 1998',
        lead: 'Three generations, one store, and a catalogue of over 2,000 products.',
        body: 'Grihasthi opened in 1998 as a steel utensil shop. Today we sell cookware, appliances, dining, storage and home décor, both retail and wholesale to hotels and caterers.\n\nWe also design and fit modular kitchens and wardrobes, with our own carpenters and installers.\n\nOrder in store, on the phone, or online through WhatsApp, and we deliver across the city.',
      },
      contact: { title: 'Visit the store', lead: 'Open 10am to 9pm, closed Tuesdays. Wholesale enquiries welcome.', formNote: 'We reply the same day.' },
      features: {
        eyebrow: 'Why Grihasthi',
        title: 'Why families and businesses buy here',
        lead: '',
        items: [
          { icon: 'tag', title: 'Wholesale prices', body: 'Bulk rates for hotels, caterers and housing societies.' },
          { icon: 'truck', title: 'City-wide delivery', body: 'Free delivery on orders above ₹1,500.' },
          { icon: 'shield', title: 'Brand warranties', body: 'Full manufacturer warranty on every appliance.' },
          { icon: 'tools', title: 'Fitted by us', body: 'Our own team measures and installs kitchens and wardrobes.' },
          { icon: 'refresh', title: '7-day exchange', body: 'Exchange anything unused within a week.' },
          { icon: 'message', title: 'Order on WhatsApp', body: 'Build your basket online and send it in one message.' },
        ],
      },
      figures: {
        eyebrow: 'Since 1998',
        title: 'Grihasthi in numbers',
        lead: '',
        items: [
          { label: 'Years serving homes', sinceDate: '1998-03-01', suffix: '+' },
          { label: 'Products in store', value: '2,000', suffix: '+' },
          { label: 'Kitchens fitted', value: '1,100', suffix: '+' },
          { label: 'Business customers', value: '260' },
        ],
      },
      team: {
        eyebrow: 'The family',
        title: 'Who runs the store',
        lead: '',
        members: [
          { name: 'Harish Patel', role: 'Founder', bio: 'Opened the store in 1998 and still handles wholesale accounts.' },
          { name: 'Nisha Patel', role: 'Kitchen Design Lead', bio: 'Has designed more than 600 modular kitchens.' },
        ],
      },
    },
    services: {
      page: { navLabel: 'Services', eyebrow: 'Design & fitting', title: 'Kitchens, wardrobes and installation', lead: 'Measured at your home, designed in 3D, fitted by our own team.', ctaLabel: 'Book a visit' },
      categories: [
        { name: 'Modular Furniture', description: 'Kitchens and wardrobes made to measure.', icon: 'layers', featured: true },
        { name: 'Installation', description: 'Appliance and fixture installation.', icon: 'tools', featured: true },
      ],
      items: [
        service('Free Home Measurement', 'Modular Furniture', 'map-pin', 0, 'A designer visits, measures and talks through ideas.', { durationMinutes: 60, bookable: true, featured: true, priceLabel: 'Free' }),
        service('Modular Kitchen Design & Fitting', 'Modular Furniture', 'layers', null, '3D design, factory-made cabinets and installation.', { priceLabel: 'From ₹1,80,000', featured: true }),
        service('Wardrobe Design & Fitting', 'Modular Furniture', 'layers', null, 'Sliding or hinged, with internal fittings to suit.', { priceLabel: 'From ₹65,000' }),
        service('Chimney & Hob Installation', 'Installation', 'tools', 1200, 'Fitting, ducting and a demonstration.', { durationMinutes: 120, bookable: true }),
        service('Water Purifier Installation', 'Installation', 'tools', 499, 'Wall mounting and plumbing connection.', { durationMinutes: 60, bookable: true }),
      ],
    },
    products: {
      page: { navLabel: 'Store', eyebrow: 'The store', title: 'Shop by department', lead: 'Retail and wholesale. Ask about bulk prices.' },
      categories: [
        { name: 'Kitchen', description: 'Cookware, appliances and tools.', featured: true },
        { name: 'Cookware', parent: 'Kitchen', description: 'Pans, pressure cookers and kadais.' },
        { name: 'Pressure Cookers', parent: 'Cookware', description: 'Aluminium, steel and induction-ready.' },
        { name: 'Non-Stick Cookware', parent: 'Cookware', description: 'Pans, tawas and kadais.' },
        { name: 'Kitchen Appliances', parent: 'Kitchen', description: 'Mixers, kettles and induction cooktops.' },
        { name: 'Dining', description: 'Dinnerware, glassware and serving.', featured: true },
        { name: 'Dinner Sets', parent: 'Dining', description: 'Ceramic, melamine and steel.' },
        { name: 'Glassware', parent: 'Dining', description: 'Tumblers and serving jugs.' },
        { name: 'Storage', description: 'Containers, racks and organisers.', featured: true },
        { name: 'Home Décor', description: 'Clocks, lamps and wall art.' },
      ],
      items: [
        product('5 L Stainless Steel Pressure Cooker', 'Pressure Cookers', 'KIT-PC-SS5', 2890, 'Induction-ready, with a 10-year warranty.', [['Capacity', '5 litres'], ['Material', 'Stainless steel']], { featured: true }),
        product('3 L Aluminium Pressure Cooker', 'Pressure Cookers', 'KIT-PC-AL3', 1450, 'The everyday cooker for a small family.', [['Capacity', '3 litres']], { offerPrice: 1199 }),
        product('Non-Stick Cookware Set, 3 Pieces', 'Non-Stick Cookware', 'KIT-NS-SET3', 2999, 'Fry pan, tawa and kadai with glass lid.', [['Pieces', '3'], ['Induction', 'Yes']], { offerPrice: 2249, featured: true }),
        product('Granite Dosa Tawa, 28 cm', 'Non-Stick Cookware', 'KIT-NS-TW28', 1299, 'Granite-finish coating, cool-touch handle.', [['Diameter', '28 cm']]),
        product('750W Mixer Grinder, 3 Jars', 'Kitchen Appliances', 'KIT-MG-750', 3999, 'Wet, dry and chutney jars, 5-year motor warranty.', [['Power', '750W'], ['Jars', '3']], { featured: true }),
        product('1.5 L Electric Kettle', 'Kitchen Appliances', 'KIT-EK-15', 999, 'Auto shut-off, stainless steel body.', [['Capacity', '1.5 litres']]),
        product('Induction Cooktop 2000W', 'Kitchen Appliances', 'KIT-IC-2000', 2499, 'Seven preset menus and a timer.', [['Power', '2000W']], { offerPrice: 1999 }),
        product('Ceramic Dinner Set, 33 Pieces', 'Dinner Sets', 'DIN-DS-C33', 4999, 'Microwave-safe, serves six.', [['Pieces', '33'], ['Material', 'Ceramic']], { featured: true }),
        product('Steel Thali Set of 6', 'Dinner Sets', 'DIN-TH-S6', 2399, 'Heavy-gauge steel thalis with bowls and glasses.', [['Pieces', '30']]),
        product('Glass Tumblers, Set of 6', 'Glassware', 'DIN-GL-T6', 599, 'Toughened glass, dishwasher-safe.'),
        product('Airtight Container Set of 12', 'Storage', 'STO-AC-12', 1499, 'Stackable, BPA-free, mixed sizes.', [['Pieces', '12']], { featured: true }),
        product('Stainless Steel Kitchen Rack', 'Storage', 'STO-RK-SS3', 3499, 'Three-tier rack for jars and appliances.', [['Tiers', '3']], { priceLabel: null }),
        product('Wooden Wall Clock', 'Home Décor', 'DEC-CL-W30', 1199, 'Silent sweep movement, 30 cm.', [['Diameter', '30 cm']]),
        product('Bulk Catering Kadai, 20 L', 'Cookware', 'KIT-CK-20', null, 'Heavy aluminium for caterers and hotels.', [['Capacity', '20 litres']], { priceLabel: 'Wholesale price on request', stockStatus: 'made_to_order' }),
      ],
    },
    blog: {
      page: { navLabel: 'Blog', eyebrow: 'Blog', title: 'Kitchen and home guides', lead: 'Buying advice from the store floor.' },
      posts: [
        post('Steel or aluminium: which pressure cooker should you buy?', 'Harish Patel', ['cookware', 'buying guide'], 'It depends on your stove and how you cook.', [
          'Aluminium heats quickly and costs less, but it does not work on induction and can react with sour foods.',
          'Stainless steel lasts decades, works on every stove, and is easier to keep clean. It costs more and heats a little slower.',
          'If you have an induction cooktop, or plan to buy one, choose steel.',
        ], true),
        post('Planning a modular kitchen: the work triangle', 'Nisha Patel', ['kitchens', 'design'], 'The one layout rule worth following.', [
          'The sink, the stove and the refrigerator should form a triangle with no side shorter than 1.2 m or longer than 2.7 m.',
          'Too far apart and you walk all day; too close and two people cannot cook together.',
          'We plan every kitchen around this triangle before choosing a single cabinet.',
        ]),
      ],
    },
  },
};

module.exports = [electronics, events, ecommerce, info, commercial];
