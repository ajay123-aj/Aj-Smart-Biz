/**
 * The brand, the contact details and every piece of prose on this site.
 *
 * The split across `config/` and `content/` is worth knowing before editing
 * anything:
 *
 *   config/site.ts       writing — headlines, the four steps, the FAQ, page
 *                        introductions, contact details.
 *   content/plans.ts     the price list. The only rupee figures in the project.
 *   content/capabilities the product itself: what a customer's site can be
 *                        made of, and the vocabulary `plans.ts` is written in.
 *   content/business-types  the trades we build for.
 *
 * If you are changing a *price*, it is not in this file.
 *
 * ⚠ **The contact block is placeholder.** The phone number, WhatsApp number,
 * email and address are the only things in the project that are not true yet,
 * and they are the first thing to replace before this site is served to
 * anybody. They are deliberately obvious — `90000 00000` is not an assignable
 * Indian mobile number — so shipping them by accident is loud rather than
 * quiet. Everything downstream reads them from here, so it is one edit.
 */

export interface NavLink {
  label: string;
  href: string;
}

export const SITE = {
  name: 'Aj Smart Biz Technology',
  /** Used in the header and footer, where the full name is too long to set. */
  shortName: 'Aj Smart Biz',
  title: 'Aj Smart Biz Technology — your business online by tomorrow',
  tagline: 'Websites for every kind of business, on a monthly recharge.',
  description:
    'We build your business website in one working day and run it for you — domain, hosting, security, backups and every edit included. You pay a monthly recharge. Nothing to install, nothing to renew, nobody to chase.',
};

/**
 * ⚠ Placeholder. See the note at the top of this file.
 *
 * `whatsapp` is digits only with the country code, because that is what
 * `wa.me` takes. `phoneHref` is separate from `phone` so the printed number can
 * be spaced for reading while the link stays dialable.
 */
export const CONTACT = {
  phone: '+91 90000 00000',
  phoneHref: '+919000000000',
  whatsapp: '919000000000',
  email: 'hello@ajsmartbiz.in',
  addressLine: 'Ahmedabad, Gujarat, India',
  hours: 'Monday to Saturday, 10am – 8pm IST',
};

export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'What you get', href: '/services' },
  { label: 'Plans', href: '/plans' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */

export const HERO = {
  eyebrow: 'Any business · Any trade · One day',
  /** Split so the second half can take the accent gradient. */
  title: 'Your business,',
  titleAccent: 'online by tomorrow.',
  body:
    'Tell us what you do. We build your website, put it on your own domain, and hand you a dashboard to run it from. Then we keep it running — hosting, security, backups, edits, all of it — for one monthly recharge.',
  primaryCta: { label: 'Book a free demo', href: '/demo' },
  secondaryCta: { label: 'See the plans', href: '/plans' },
  /** Three lines under the buttons, each a thing an owner has actually worried about. */
  assurances: [
    'No setup fee, no contract, no notice period',
    'Hosting, domain, SSL and backups are ours to worry about',
    'Stop the recharge and it pauses — your content stays',
  ],
};

/**
 * How the day goes.
 *
 * Four steps because that is how many there are, not because four fills a row.
 * The third is the one that matters to the person reading: they see the site
 * before anyone else does, and nothing goes live until they say so.
 */
export const STEPS = {
  eyebrow: 'How it works',
  title: 'Four steps. One working day.',
  lede:
    'Most of it happens on a phone call. You do not need a brief, a logo file, or any idea what a domain is — the parts you do not have, we write with you.',
  items: [
    {
      icon: 'message-circle',
      title: 'Tell us about the business',
      body:
        'A fifteen-minute call, on WhatsApp if that is easier. What you do, who buys it, where you are, and what you want people to do when they land on the page.',
    },
    {
      icon: 'sparkles',
      title: 'We build it the same day',
      body:
        'Our team writes the pages, sets the design to your colours, adds your services and photographs, and points your domain at it. You send nothing but what you already have.',
    },
    {
      icon: 'check',
      title: 'You look at it before anyone else',
      body:
        'We send a private link. Change anything — wording, prices, pictures, the order of it. Nothing is public until you say the word.',
    },
    {
      icon: 'bolt',
      title: 'Live, and looked after',
      body:
        'It goes live on your domain. From then on your recharge covers hosting, security, backups, updates and every edit you ask for. We do not disappear after launch — that is the whole product.',
    },
  ],
};

/**
 * The six jobs that stop being the customer's.
 *
 * This is the site's actual argument, so it is stated as relief rather than as
 * a feature list: every line names something that used to be their problem.
 */
export const PROMISES = {
  eyebrow: 'What you never think about again',
  title: 'The boring half is ours.',
  lede:
    'Every one of these is a bill, a renewal or an emergency for a business running its own website. On a recharge, they are simply not your problem.',
  items: [
    {
      icon: 'globe',
      title: 'Domain and DNS',
      body: 'We buy it, point it, renew it and keep it in your name. Already own one? We move it across at no cost.',
    },
    {
      icon: 'server',
      title: 'Hosting and uptime',
      body: 'No server to rent, no plan to size, no invoice in a currency you do not use. We watch it; you do not.',
    },
    {
      icon: 'lock',
      title: 'SSL and security',
      body: 'The padlock, renewed automatically, forever. Patches and updates applied by us, the day they are out.',
    },
    {
      icon: 'refresh',
      title: 'Backups',
      body: 'Taken daily and kept off the server. If something goes wrong we put it back, and you usually hear about it afterwards.',
    },
    {
      icon: 'edit',
      title: 'Edits and changes',
      body: 'New price, new photo, new branch, a festival offer. Send it on WhatsApp. Done the same day, at no extra cost.',
    },
    {
      icon: 'headset',
      title: 'A person who answers',
      body: 'Not a ticket queue in another timezone. The same small team, on the same number, during working hours.',
    },
  ],
};

/**
 * Why the money works the way it does.
 *
 * The one objection worth meeting head-on: "monthly" sounds more expensive than
 * "one payment" until somebody adds up what the one payment did not include.
 */
export const RECHARGE = {
  eyebrow: 'The plan',
  title: 'One recharge. Like a phone connection.',
  lede:
    'You are not buying a website and then discovering what it costs to keep. You are paying for a website that is running, the same way you pay for a line that is connected.',
  points: [
    {
      title: 'No lump sum to find',
      body:
        'The traditional quote is fifteen to fifty thousand rupees before anything exists, and then hosting, domain and "change requests" on top. Here there is nothing up front.',
    },
    {
      title: 'One number, everything in it',
      body:
        'Hosting, domain, SSL, backups, support and your edits are inside the recharge. There is no second invoice and no line item you did not expect.',
    },
    {
      title: 'Stop whenever you like',
      body:
        'No contract and no notice. Stop the recharge and the site pauses rather than vanishing — your content, your domain and your data stay where they are, and one payment brings it back.',
    },
    {
      title: 'Upgrade the month you need to',
      body:
        'Opened a second branch, or want to start taking orders? Move up a plan for that month, and back down when the season ends. Nothing is rebuilt either way.',
    },
  ],
};

/** The band that closes every page. */
export const CTA = {
  eyebrow: 'Free demo',
  title: 'See your own business on it first.',
  body:
    'Tell us your trade and we will show you the site we would build — before you pay for anything and before you commit to anything.',
  primary: { label: 'Book a free demo', href: '/demo' },
};

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

export const SERVICES_PAGE = {
  eyebrow: 'What you get',
  title: 'Everything on this list, switched on when you need it.',
  lede:
    'These are the parts a website can be built from. Which of them your plan includes is on the Plans page — and every one of them is managed by us, from your dashboard, without you touching a line of anything.',
  capabilitiesTitle: 'The building blocks',
  capabilitiesLede:
    'Each one is a section of your website and a screen in your dashboard. Switch one on and it appears; switch it off and it is gone from the site entirely.',
  /**
   * What is in every plan, whatever else is not.
   *
   * Separate from `capabilities.ts` on purpose: these are properties of how the
   * business works rather than features a plan grants, so no plan lists them
   * and no plan can leave them out.
   */
  alwaysTitle: 'In every plan, including the smallest',
  always: [
    { icon: 'bolt', title: 'Built in one working day', body: 'Not a queue, not a sprint. The day after your call.' },
    { icon: 'phone', title: 'Works on every phone', body: 'Designed for the small screen first, because that is where your customers are.' },
    { icon: 'chart', title: 'Found on Google', body: 'Titles, descriptions, sitemap and speed done properly from the start.' },
    { icon: 'shield', title: 'Your domain, your name', body: 'Registered to you. If you ever leave, you take it with you.' },
    { icon: 'refresh', title: 'Unlimited edits', body: 'Send a change on WhatsApp. Done the same working day.' },
    { icon: 'users', title: 'A dashboard of your own', body: 'See what is on the site, what has changed, and who has been enquiring.' },
  ],
};

export const PLANS_PAGE = {
  eyebrow: 'Plans',
  title: 'Pick the size. Change it any month.',
  lede:
    'Every plan is a monthly recharge with everything in it — hosting, domain, SSL, backups, support and your edits. No setup fee, no contract, no notice period.',
  footnote:
    'Prices are per business, in Indian rupees, and include the running costs. GST is charged where applicable. Moving between plans takes effect from your next recharge and never rebuilds your site.',
};

export const DEMO_PAGE = {
  eyebrow: 'Free demo',
  title: 'Show me what mine would look like.',
  lede:
    'Fill this in and we will call you back, usually the same working day. On the call we will show you a real site built for your trade, tell you what it would cost, and answer the awkward questions. There is nothing to pay and nothing to sign.',
  expectations: [
    { title: 'We call you back', body: 'Same working day, in working hours. On WhatsApp if you prefer.' },
    { title: 'We show you a real one', body: 'Not a slideshow — a working site for a business like yours, on a phone.' },
    { title: 'You decide afterwards', body: 'No obligation, no follow-up campaign, no card details taken.' },
  ],
  typesTitle: 'Built for any trade',
  typesLede:
    'These are the kinds of business already running on the platform. Yours not listed? Say so on the form — we have not met a trade we could not build for.',
};

export const ABOUT_PAGE = {
  eyebrow: 'About us',
  title: 'A small team that runs websites for people who have a business to run.',
  lede:
    'Aj Smart Biz Technology exists because of a pattern we kept seeing: a business pays for a website once, it works for a year, then the hosting lapses, the developer has moved on, and nobody knows the password. Three years later it is a dead link on a visiting card.',
  body: [
    'So we stopped selling websites and started running them. Everything that used to be a separate bill — the hosting, the domain, the certificate, the backups, the person you call when it breaks — is inside one monthly recharge, and all of it stays our job for as long as you are with us.',
    'That changes what we are paid to do. A studio paid once is paid to finish. We are paid to keep your site working, which means answering on a Saturday, taking the backup nobody asked for, and rewriting the page that was not bringing in calls.',
    'It also changes what you have to know. You do not need to understand DNS, or SSL, or what a CMS is. You need to be able to say "put the new price up" and have it happen. That is the whole interface.',
  ],
  valuesTitle: 'How we work',
  values: [
    {
      icon: 'clock',
      title: 'One day, and we mean the day',
      body: 'If we cannot build it tomorrow we will tell you on the call, before you have paid for anything.',
    },
    {
      icon: 'wallet',
      title: 'No surprise invoices',
      body: 'The recharge is the price. Edits are not billable, support is not billable, and there is no setup fee to discover later.',
    },
    {
      icon: 'lock',
      title: 'Your things stay yours',
      body: 'Your domain is in your name and your content is exportable. We would rather keep you because leaving is easy.',
    },
    {
      icon: 'quote',
      title: 'We say no',
      body: 'If a website is not what your business needs this month, we will tell you that instead of selling you one.',
    },
  ],
};

export const CONTACT_PAGE = {
  eyebrow: 'Contact',
  title: 'Talk to a person.',
  lede:
    'Questions about a plan, an existing site, or whether any of this is right for you. We answer on WhatsApp fastest, and the number below is a phone, not a queue.',
  formTitle: 'Send us a message',
};

/**
 * The FAQ.
 *
 * Ordered by what actually gets asked on the call rather than by what is most
 * flattering to answer — which is why the second question is about what happens
 * when you stop paying.
 */
export const FAQ = {
  eyebrow: 'Questions',
  title: 'The things everyone asks.',
  items: [
    {
      q: 'Is it really live in one day?',
      a: 'One working day from the call, for a standard site with the content you already have. If you want twenty product pages photographed and written from scratch, that takes longer — and we will say so on the call rather than after you have paid.',
    },
    {
      q: 'What happens if I stop the recharge?',
      a: 'The site pauses: visitors see a short holding page instead of your content. Nothing is deleted — your pages, pictures, enquiries and domain stay exactly as they were, and paying the next recharge brings it all back within minutes. We do not hold your work hostage and there is no reactivation fee.',
    },
    {
      q: 'Do I own my domain?',
      a: 'Yes, and it is registered in your name from the start. If you ever move to somebody else you take it with you, and we will help with the transfer rather than making it difficult.',
    },
    {
      q: 'Is there a setup fee or a contract?',
      a: 'Neither. Nothing is due before your site is built, there is no minimum term, and there is no notice period. You are one month in at all times.',
    },
    {
      q: 'Can I make changes myself?',
      a: 'Yes — you get a dashboard for your prices, photographs, offers and enquiries. Most owners send changes to us on WhatsApp instead, which is included, and that is completely fine.',
    },
    {
      q: 'My business is unusual. Will this work?',
      a: 'Almost certainly. The platform is built around what a business has to say rather than what it sells — services, prices, people, proof, contact — and that is the same shape for a dental clinic and a steel trader. Tell us the trade on the demo form and we will say honestly if it is not a fit.',
    },
    {
      q: 'Can I take orders or bookings?',
      a: 'Yes, on the plans that include them. Bookings come with real slots and timings, and orders arrive as orders — on your dashboard and on WhatsApp — rather than as an email you have to decipher.',
    },
    {
      q: 'What if I already have a website?',
      a: 'We will look at it and tell you whether it is worth moving. If it is, we rebuild it on the platform and switch your domain over with no downtime, usually in the same one day.',
    },
  ],
};
