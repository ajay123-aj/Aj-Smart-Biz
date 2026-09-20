'use strict';

/**
 * The writing on our own marketing site, as it stood when it moved out of the
 * Technology project and into the database.
 *
 * **This file is a starting point, not the source of truth.** Once seeded, the
 * copy is edited in the super admin console and this file stops being read:
 * `runMarketingSeed` skips any section that already has a row, so re-running
 * it cannot overwrite something somebody has since rewritten. Deleting a section
 * in the console and re-seeding is how the original wording comes back.
 *
 * Generated from `Aj-Smart-Biz-Technology/src/config/site.ts` rather than retyped,
 * so the words are exactly the ones that were on the site.
 *
 * Each entry is `[label, payload]`: the label is for whoever edits the section in
 * the console and is never rendered, the payload is the section itself.
 */

const MARKETING_CONTENT = {
  "site": [
    "Brand and titles",
    {
      "name": "Aj Smart Biz Technology",
      "shortName": "Aj Smart Biz",
      "title": "Aj Smart Biz Technology — your business online by tomorrow",
      "tagline": "Websites for every kind of business, on a monthly recharge.",
      "description": "We build your business website in one working day and run it for you — domain, hosting, security, backups and every edit included. You pay a monthly recharge. Nothing to install, nothing to renew, nobody to chase.",
      "navLinks": [
        {
          "label": "Home",
          "href": "/"
        },
        {
          "label": "What you get",
          "href": "/services"
        },
        {
          "label": "Plans",
          "href": "/plans"
        },
        {
          "label": "About",
          "href": "/about"
        },
        {
          "label": "Contact",
          "href": "/contact"
        }
      ]
    }
  ],
  "contact": [
    "Phone, WhatsApp, email, address",
    {
      "phone": "+91 90000 00000",
      "phoneHref": "+919000000000",
      "whatsapp": "919000000000",
      "email": "hello@ajsmartbiz.in",
      "addressLine": "Ahmedabad, Gujarat, India",
      "hours": "Monday to Saturday, 10am – 8pm IST"
    }
  ],
  "hero": [
    "Home page hero",
    {
      "eyebrow": "Any business · Any trade · One day",
      "title": "Your business,",
      "titleAccent": "online by tomorrow.",
      "body": "Tell us what you do. We build your website, put it on your own domain, and hand you a dashboard to run it from. Then we keep it running — hosting, security, backups, edits, all of it — for one monthly recharge.",
      "primaryCta": {
        "label": "Book a free demo",
        "href": "/demo"
      },
      "secondaryCta": {
        "label": "See the plans",
        "href": "/plans"
      },
      "assurances": [
        "No setup fee, no contract, no notice period",
        "Hosting, domain, SSL and backups are ours to worry about",
        "Stop the recharge and it pauses — your content stays"
      ]
    }
  ],
  "steps": [
    "How it works",
    {
      "eyebrow": "How it works",
      "title": "Four steps. One working day.",
      "lede": "Most of it happens on a phone call. You do not need a brief, a logo file, or any idea what a domain is — the parts you do not have, we write with you.",
      "items": [
        {
          "icon": "message-circle",
          "title": "Tell us about the business",
          "body": "A fifteen-minute call, on WhatsApp if that is easier. What you do, who buys it, where you are, and what you want people to do when they land on the page."
        },
        {
          "icon": "sparkles",
          "title": "We build it the same day",
          "body": "Our team writes the pages, sets the design to your colours, adds your services and photographs, and points your domain at it. You send nothing but what you already have."
        },
        {
          "icon": "check",
          "title": "You look at it before anyone else",
          "body": "We send a private link. Change anything — wording, prices, pictures, the order of it. Nothing is public until you say the word."
        },
        {
          "icon": "bolt",
          "title": "Live, and looked after",
          "body": "It goes live on your domain. From then on your recharge covers hosting, security, backups, updates and every edit you ask for. We do not disappear after launch — that is the whole product."
        }
      ]
    }
  ],
  "promises": [
    "What you never think about again",
    {
      "eyebrow": "What you never think about again",
      "title": "The boring half is ours.",
      "lede": "Every one of these is a bill, a renewal or an emergency for a business running its own website. On a recharge, they are simply not your problem.",
      "items": [
        {
          "icon": "globe",
          "title": "Domain and DNS",
          "body": "We buy it, point it, renew it and keep it in your name. Already own one? We move it across at no cost."
        },
        {
          "icon": "server",
          "title": "Hosting and uptime",
          "body": "No server to rent, no plan to size, no invoice in a currency you do not use. We watch it; you do not."
        },
        {
          "icon": "lock",
          "title": "SSL and security",
          "body": "The padlock, renewed automatically, forever. Patches and updates applied by us, the day they are out."
        },
        {
          "icon": "refresh",
          "title": "Backups",
          "body": "Taken daily and kept off the server. If something goes wrong we put it back, and you usually hear about it afterwards."
        },
        {
          "icon": "edit",
          "title": "Edits and changes",
          "body": "New price, new photo, new branch, a festival offer. Send it on WhatsApp. Done the same day, at no extra cost."
        },
        {
          "icon": "headset",
          "title": "A person who answers",
          "body": "Not a ticket queue in another timezone. The same small team, on the same number, during working hours."
        }
      ]
    }
  ],
  "recharge": [
    "Why the money works this way",
    {
      "eyebrow": "The plan",
      "title": "One recharge. Like a phone connection.",
      "lede": "You are not buying a website and then discovering what it costs to keep. You are paying for a website that is running, the same way you pay for a line that is connected.",
      "points": [
        {
          "title": "No lump sum to find",
          "body": "The traditional quote is fifteen to fifty thousand rupees before anything exists, and then hosting, domain and \"change requests\" on top. Here there is nothing up front."
        },
        {
          "title": "One number, everything in it",
          "body": "Hosting, domain, SSL, backups, support and your edits are inside the recharge. There is no second invoice and no line item you did not expect."
        },
        {
          "title": "Stop whenever you like",
          "body": "No contract and no notice. Stop the recharge and the site pauses rather than vanishing — your content, your domain and your data stay where they are, and one payment brings it back."
        },
        {
          "title": "Upgrade the month you need to",
          "body": "Opened a second branch, or want to start taking orders? Move up a plan for that month, and back down when the season ends. Nothing is rebuilt either way."
        }
      ]
    }
  ],
  "cta": [
    "The band that closes every page",
    {
      "eyebrow": "Free demo",
      "title": "See your own business on it first.",
      "body": "Tell us your trade and we will show you the site we would build — before you pay for anything and before you commit to anything.",
      "primary": {
        "label": "Book a free demo",
        "href": "/demo"
      }
    }
  ],
  "services_page": [
    "What you get",
    {
      "eyebrow": "What you get",
      "title": "Everything on this list, switched on when you need it.",
      "lede": "These are the parts a website can be built from. Which of them your plan includes is on the Plans page — and every one of them is managed by us, from your dashboard, without you touching a line of anything.",
      "capabilitiesTitle": "The building blocks",
      "capabilitiesLede": "Each one is a section of your website and a screen in your dashboard. Switch one on and it appears; switch it off and it is gone from the site entirely.",
      "alwaysTitle": "In every plan, including the smallest",
      "always": [
        {
          "icon": "bolt",
          "title": "Built in one working day",
          "body": "Not a queue, not a sprint. The day after your call."
        },
        {
          "icon": "phone",
          "title": "Works on every phone",
          "body": "Designed for the small screen first, because that is where your customers are."
        },
        {
          "icon": "chart",
          "title": "Found on Google",
          "body": "Titles, descriptions, sitemap and speed done properly from the start."
        },
        {
          "icon": "shield",
          "title": "Your domain, your name",
          "body": "Registered to you. If you ever leave, you take it with you."
        },
        {
          "icon": "refresh",
          "title": "Unlimited edits",
          "body": "Send a change on WhatsApp. Done the same working day."
        },
        {
          "icon": "users",
          "title": "A dashboard of your own",
          "body": "See what is on the site, what has changed, and who has been enquiring."
        }
      ]
    }
  ],
  "plans_page": [
    "Plans page intro",
    {
      "eyebrow": "Plans",
      "title": "Pick the size. Change it any month.",
      "lede": "Every plan is a monthly recharge with everything in it — hosting, domain, SSL, backups, support and your edits. No setup fee, no contract, no notice period.",
      "footnote": "Prices are per business, in Indian rupees, and include the running costs. GST is charged where applicable. Moving between plans takes effect from your next recharge and never rebuilds your site."
    }
  ],
  "demo_page": [
    "Free demo page",
    {
      "eyebrow": "Free demo",
      "title": "Show me what mine would look like.",
      "lede": "Fill this in and we will call you back, usually the same working day. On the call we will show you a real site built for your trade, tell you what it would cost, and answer the awkward questions. There is nothing to pay and nothing to sign.",
      "expectations": [
        {
          "title": "We call you back",
          "body": "Same working day, in working hours. On WhatsApp if you prefer."
        },
        {
          "title": "We show you a real one",
          "body": "Not a slideshow — a working site for a business like yours, on a phone."
        },
        {
          "title": "You decide afterwards",
          "body": "No obligation, no follow-up campaign, no card details taken."
        }
      ],
      "typesTitle": "Built for any trade",
      "typesLede": "These are the kinds of business already running on the platform. Yours not listed? Say so on the form — we have not met a trade we could not build for."
    }
  ],
  "about_page": [
    "About us",
    {
      "eyebrow": "About us",
      "title": "A small team that runs websites for people who have a business to run.",
      "lede": "Aj Smart Biz Technology exists because of a pattern we kept seeing: a business pays for a website once, it works for a year, then the hosting lapses, the developer has moved on, and nobody knows the password. Three years later it is a dead link on a visiting card.",
      "body": [
        "So we stopped selling websites and started running them. Everything that used to be a separate bill — the hosting, the domain, the certificate, the backups, the person you call when it breaks — is inside one monthly recharge, and all of it stays our job for as long as you are with us.",
        "That changes what we are paid to do. A studio paid once is paid to finish. We are paid to keep your site working, which means answering on a Saturday, taking the backup nobody asked for, and rewriting the page that was not bringing in calls.",
        "It also changes what you have to know. You do not need to understand DNS, or SSL, or what a CMS is. You need to be able to say \"put the new price up\" and have it happen. That is the whole interface."
      ],
      "valuesTitle": "How we work",
      "values": [
        {
          "icon": "clock",
          "title": "One day, and we mean the day",
          "body": "If we cannot build it tomorrow we will tell you on the call, before you have paid for anything."
        },
        {
          "icon": "wallet",
          "title": "No surprise invoices",
          "body": "The recharge is the price. Edits are not billable, support is not billable, and there is no setup fee to discover later."
        },
        {
          "icon": "lock",
          "title": "Your things stay yours",
          "body": "Your domain is in your name and your content is exportable. We would rather keep you because leaving is easy."
        },
        {
          "icon": "quote",
          "title": "We say no",
          "body": "If a website is not what your business needs this month, we will tell you that instead of selling you one."
        }
      ]
    }
  ],
  "contact_page": [
    "Contact page",
    {
      "eyebrow": "Contact",
      "title": "Talk to a person.",
      "lede": "Questions about a plan, an existing site, or whether any of this is right for you. We answer on WhatsApp fastest, and the number below is a phone, not a queue.",
      "formTitle": "Send us a message"
    }
  ],
  "faq_intro": [
    "FAQ heading",
    {
      "eyebrow": "Questions",
      "title": "The things everyone asks."
    }
  ]
};

/** In the order these actually get asked on a call, not alphabetically. */
const MARKETING_FAQS = [
  {
    "question": "Is it really live in one day?",
    "answer": "One working day from the call, for a standard site with the content you already have. If you want twenty product pages photographed and written from scratch, that takes longer — and we will say so on the call rather than after you have paid.",
    "sequence": 10
  },
  {
    "question": "What happens if I stop the recharge?",
    "answer": "The site pauses: visitors see a short holding page instead of your content. Nothing is deleted — your pages, pictures, enquiries and domain stay exactly as they were, and paying the next recharge brings it all back within minutes. We do not hold your work hostage and there is no reactivation fee.",
    "sequence": 20
  },
  {
    "question": "Do I own my domain?",
    "answer": "Yes, and it is registered in your name from the start. If you ever move to somebody else you take it with you, and we will help with the transfer rather than making it difficult.",
    "sequence": 30
  },
  {
    "question": "Is there a setup fee or a contract?",
    "answer": "Neither. Nothing is due before your site is built, there is no minimum term, and there is no notice period. You are one month in at all times.",
    "sequence": 40
  },
  {
    "question": "Can I make changes myself?",
    "answer": "Yes — you get a dashboard for your prices, photographs, offers and enquiries. Most owners send changes to us on WhatsApp instead, which is included, and that is completely fine.",
    "sequence": 50
  },
  {
    "question": "My business is unusual. Will this work?",
    "answer": "Almost certainly. The platform is built around what a business has to say rather than what it sells — services, prices, people, proof, contact — and that is the same shape for a dental clinic and a steel trader. Tell us the trade on the demo form and we will say honestly if it is not a fit.",
    "sequence": 60
  },
  {
    "question": "Can I take orders or bookings?",
    "answer": "Yes, on the plans that include them. Bookings come with real slots and timings, and orders arrive as orders — on your dashboard and on WhatsApp — rather than as an email you have to decipher.",
    "sequence": 70
  },
  {
    "question": "What if I already have a website?",
    "answer": "We will look at it and tell you whether it is worth moving. If it is, we rebuild it on the platform and switch your domain over with no downtime, usually in the same one day.",
    "sequence": 80
  }
];

/** The price list. See the note in `marketing.js` on why a seeder never updates one. */
const MARKETING_PLANS = [
  {
    "code": "starter",
    "name": "Starter",
    "description": "One business, one website, live tomorrow. Everything needed to be found, understood and phoned.",
    "price": 499,
    "currency": "INR",
    "billingCycle": "monthly",
    "maxBranches": 1,
    "maxAdmins": 1,
    "storageMb": 1024,
    "features": [
      "Live in one working day",
      "Domain, hosting, SSL and backups included",
      "Unlimited edits — you ask, we publish",
      "Works on every phone, indexed by Google",
      "Support on WhatsApp, 10am to 8pm"
    ],
    "includes": [
      "about",
      "services",
      "contact",
      "whatsapp",
      "share",
      "figures"
    ],
    "isPopular": false,
    "sequence": 10
  },
  {
    "code": "growth",
    "name": "Growth",
    "description": "For a business that has to be chosen, not just found — proof, pictures and people, and the enquiries they produce.",
    "price": 999,
    "currency": "INR",
    "billingCycle": "monthly",
    "maxBranches": 2,
    "maxAdmins": 3,
    "storageMb": 4096,
    "features": [
      "Everything in Starter",
      "Up to 2 branches, each with its own page",
      "Gallery, team and customer reviews",
      "Enquiry form, with every lead on your dashboard",
      "Monthly report: who visited, from where, on what"
    ],
    "includes": [
      "about",
      "services",
      "contact",
      "whatsapp",
      "share",
      "figures",
      "team",
      "gallery",
      "reviews",
      "benefits",
      "enquiries",
      "blog"
    ],
    "isPopular": true,
    "sequence": 20
  },
  {
    "code": "business",
    "name": "Business",
    "description": "A website that takes work in: a bookable diary, a catalogue with prices, and orders that arrive as orders.",
    "price": 1999,
    "currency": "INR",
    "billingCycle": "monthly",
    "maxBranches": 5,
    "maxAdmins": 8,
    "storageMb": 10240,
    "features": [
      "Everything in Growth",
      "Up to 5 branches",
      "Online bookings with real slots and timings",
      "Product catalogue, offers and online orders",
      "Customer accounts with order and booking history",
      "Priority support, same working day"
    ],
    "includes": [
      "about",
      "services",
      "contact",
      "whatsapp",
      "share",
      "figures",
      "team",
      "gallery",
      "reviews",
      "benefits",
      "enquiries",
      "blog",
      "bookings",
      "products",
      "orders",
      "customers"
    ],
    "isPopular": false,
    "sequence": 30
  },
  {
    "code": "enterprise",
    "name": "Enterprise",
    "description": "Many branches, real stock, and a team running all of it — everything we can do, with none of it switched off.",
    "price": 3999,
    "currency": "INR",
    "billingCycle": "monthly",
    "maxBranches": 25,
    "maxAdmins": 25,
    "storageMb": 51200,
    "features": [
      "Everything in Business",
      "Up to 25 branches, each with its own site",
      "Warehouses and live stock across branches",
      "Staff roles and permissions",
      "A named account manager"
    ],
    "includes": [
      "about",
      "services",
      "contact",
      "whatsapp",
      "share",
      "figures",
      "team",
      "gallery",
      "reviews",
      "benefits",
      "enquiries",
      "blog",
      "bookings",
      "products",
      "orders",
      "customers",
      "stock"
    ],
    "isPopular": false,
    "sequence": 40
  }
];

/** The trades the demo form offers. */
const MARKETING_BUSINESS_TYPES = [
  {
    "name": "Retail shop",
    "slug": "retail-shop",
    "icon": "shopping-bag",
    "description": "A catalogue, prices, offers, and orders arriving on WhatsApp instead of in a queue."
  },
  {
    "name": "Salon & spa",
    "slug": "salon-spa",
    "icon": "scissors",
    "description": "A treatment menu, a real booking diary, and the reviews that keep it full."
  },
  {
    "name": "Restaurant & cafe",
    "slug": "restaurant-cafe",
    "icon": "utensils",
    "description": "Menus that change, photographs that sell them, and a table booking without an app."
  },
  {
    "name": "Clinic & healthcare",
    "slug": "clinic-healthcare",
    "icon": "heart-pulse",
    "description": "Services, timings, doctors on duty, and an appointment request that reaches reception."
  },
  {
    "name": "Gym & fitness",
    "slug": "gym-fitness",
    "icon": "dumbbell",
    "description": "Memberships, class timetables, trainers, and a trial booking that lands on your phone."
  },
  {
    "name": "Education & coaching",
    "slug": "education-coaching",
    "icon": "graduation-cap",
    "description": "Courses, batches, faculty and results — with an admission enquiry parents will finish."
  },
  {
    "name": "Real estate",
    "slug": "real-estate",
    "icon": "building-2",
    "description": "Listings with galleries, locality pages, and a site-visit request per property."
  },
  {
    "name": "Construction & interiors",
    "slug": "construction-interior",
    "icon": "hard-hat",
    "description": "Projects as portfolios — before and after, materials, the team, and a quotation request."
  },
  {
    "name": "Professional services",
    "slug": "professional-services",
    "icon": "briefcase",
    "description": "CAs, advocates, consultants and agencies — credentials, services, a consultation request."
  },
  {
    "name": "Automobile",
    "slug": "automobile",
    "icon": "car",
    "description": "Showrooms, garages and detailers — a service menu, a diary, and the pickup you offer."
  },
  {
    "name": "Travel & hospitality",
    "slug": "travel-hospitality",
    "icon": "plane",
    "description": "Packages, rooms and itineraries, with an enquiry that arrives before they change their mind."
  },
  {
    "name": "Events & photography",
    "slug": "events-photography",
    "icon": "camera",
    "description": "A gallery that loads fast on a phone, priced packages, and a date-availability enquiry."
  },
  {
    "name": "Decor & framing",
    "slug": "decor-framing",
    "icon": "layers",
    "description": "A price list for the bench, a diary, and a shelf that takes orders."
  },
  {
    "name": "Manufacturing & trading",
    "slug": "manufacturing-trading",
    "icon": "factory",
    "description": "Ranges, specifications, certifications, and a bulk enquiry that reaches sales."
  }
];

module.exports = {
  MARKETING_CONTENT,
  MARKETING_FAQS,
  MARKETING_PLANS,
  MARKETING_BUSINESS_TYPES,
};
