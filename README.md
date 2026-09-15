# Aj Smart Biz

A multi-tenant business platform, plus the website that sells it.

| Project | Stack | Port | What it is |
| --- | --- | --- | --- |
| [Aj-Smart-Biz-Backend](Aj-Smart-Biz-Backend/) | Node.js · Express · Sequelize · MySQL | 4000 | One API serving both consoles |
| [Aj-Smart-Biz-Supper-Admin](Aj-Smart-Biz-Supper-Admin/) | Angular 22 | 4200 | Platform console — companies, plans, billing, masters |
| [Aj-Smart-Biz-Admin](Aj-Smart-Biz-Admin/) | Angular 22 | 4300 | Company workspace — branches, roles, permissions, admins |
| [themes](themes/) | Next.js 15 | 4400+ | Tenant-facing site templates, one folder per business type |
| [Aj-Smart-Biz-Technology](Aj-Smart-Biz-Technology/) | Next.js 15 | 4700 | The product website — what we sell, what it costs, book a demo |

---

## Run it

Three terminals. MySQL must be running; the API creates its own database.

```bash
# 1 — API
cd Aj-Smart-Biz-Backend && npm install && npm run dev

# 2 — platform console
cd Aj-Smart-Biz-Supper-Admin && npm install && npm start

# 3 — company workspace
cd Aj-Smart-Biz-Admin && npm install && npm start
```

No MySQL handy? `DB_DIALECT=sqlite npm run dev` runs the API against a single file instead.

> **On SQLite, schema changes rebuild tables.** SQLite has no real `ALTER`, so
> sequelize emulates it by copying a table and dropping the original. Three
> things go wrong with that, and boot now handles all three: foreign keys are
> suspended for the sync (a key pointing at the table blocks the `DROP`),
> `*_backup` tables left by an interrupted sync are cleared, and the composite
> unique on `company_functionalities` is shed — sequelize reads it back as a
> unique on `key` alone and recreates it that way, which then rejects the
> second feature any company switches on. The constraint is therefore declared
> on MySQL only; `findOrCreate` holds the invariant on both. MySQL does a real
> `ALTER TABLE` and is unaffected by any of it.

On first boot the API creates the schema, seeds the root super admin from
`.env.development` and prints its credentials, then seeds the seven system menus,
a few states, business types and a default theme.

Default: `superadmin@ajsmartbiz.com` / `Admin@123` — change these before deploying.

### The five-minute tour

1. Sign in at **:4200** as the super admin.
2. **Plan Management → Add plan** — set a price, billing cycle and the branch/admin quotas.
3. **Company Management → New company** — fill in the profile, the main admin and pick the plan you just made. Saving provisions the tenant and shows the generated admin password **once**; copy it.
4. Open the company to see its head-office branch, subscription and the payment that was recorded. **Company Plans** now lists that term with a live countdown — try **Renew** (it queues behind the running term) and **Upgrade** (it prices the credit for you).
5. Sign in at **:4300** with that admin. Set a new password when asked. **My Plan** shows the same term counting down, with the limits it was sold and what has been paid.
6. **Role Management → Add role**, then **Menu Permission** — tick what the role may see and do.
7. **Admin Management → Add admin** with that role. Sign in as them: the sidebar shows only the permitted menus.

---

## How the two portals stay apart

There is one API and one token format, but the token carries a `scope`
(`super_admin` or `admin`) that decides which half of the API it can reach. An
`admin` token also carries a `companyId`, and every tenant route derives the
company from the token rather than from anything the client sends — a company
admin has no way to address another tenant's data.

Inside a tenant, access is menu-based: `role_permissions` holds a
view/create/edit/delete/export flag for each (role, menu) pair. The API enforces
it per route; the Angular app uses the same data to build the sidebar, guard the
routes and hide individual buttons. The main admin created with the company
bypasses those checks and cannot be deleted or disabled.

## Plans and their lifecycle

A plan is sold to a company as a **subscription** — one dated, priced term. The
platform console at **:4200 → Company Plans** is where every company's term is
listed together, with a live countdown to its expiry and the moves it can make.

A term moves through six states, and only along the arrows:

```
                    ┌──────────► cancelled (final)
                    │
 pending ─────► active ─────► expired (final)
    │             ▲  │
    │             │  └──────► superseded (final, set only by a plan change)
    │             │
    │          suspended ────► expired / cancelled
    └──► cancelled
```

The API refuses anything else before it reaches the database, and every accepted
move is appended to `subscription_events` with the actor, the reason and the
before/after — so "why is this tenant suspended?" has an answer.

What each operation means:

| Operation | What happens |
| --- | --- |
| **Assign** | First term for a company. A future start date queues it as `pending` instead of cutting the current one short. |
| **Pre-renew** | Books the next term now, starting the day the current one ends. It sits `pending` and switches itself on. |
| **Renew now** | Closes the running term today and starts the new one. |
| **Upgrade / downgrade** | Mid-term move. Unused days come across as a credit; the old term becomes `superseded`, not `expired`, because it did not run its course. |
| **Suspend / resume** | Access stops, the term keeps its dates. |
| **Extend** | Pushes the end date out, charges nothing. |
| **Cancel / expire** | Ends the term. Both are final — a new term is the only way back. |
| **Reactivate** | Opens a fresh term on a finished subscription. |

Upgrades are priced by daily value, so a monthly plan and a yearly one compare
fairly: `credit = term total × remaining days ÷ term days`. `GET
/companies/:id/subscriptions/change-preview` returns those workings before
anything is written, and the console shows them in the confirm dialog.

Time is moved forward by a sweeper that runs on boot and hourly (and on demand
from **Run expiry check**): it starts terms whose date has arrived, closes terms
past their end date plus any grace days, and auto-renews the ones set to. Without
it a countdown would reach zero and the status would sit there unchanged.

Turning a company's plan off is a **suspension**, not a cancellation: the term
keeps its dates and its money, the tenant just stops getting in, and it can be
switched back on. That switch sits on the company's **Plan & transactions** tab,
next to the countdown.

Assigning or changing a plan is reachable from three places, all the same API:
the plan console, the company's **Plan & transactions** tab, and the **Plan**
section on **Edit company**. On the edit screen it has its own button and its own
confirmation, deliberately outside the profile form — pressing "Save changes" on
an address must never re-charge anyone.

### Plan limits

Limits are read from the **snapshot** on the subscription, not the live plan
row, so editing a plan never silently changes what an existing term allows.

One service answers both "how much is left?" and "may this be created?", and the
UI renders that answer rather than counting rows itself — so a greyed-out button
and a refused request can never tell different stories. **Add branch** and **Add
admin** are disabled with the reason on the button, a bar above the list
explaining it, and an *Upgrade your plan* action. The same guard runs server-side,
returning the identical wording, so a request that gets past the button still
fails readably.

Creating is refused for four reasons, and a plan-wide one outranks a per-metric
one — there is no point saying "3 branches left" when the plan is suspended:

| Reason | When |
| --- | --- |
| `limit_reached` | The plan's cap for that resource is used up |
| `expired` | The term ran out and was not renewed |
| `suspended` | The platform switched the plan off |
| `no_plan` | The company has never been on a plan |

The last three used to mean *unlimited*: the old guard only looked for an
`active` subscription and returned early when it found none, so a company with a
lapsed plan — or no plan at all — could create as many branches and admins as it
liked. They now block.

Branches and admins are metered. `maxUsers` and `storageMb` are shown on **My
Plan** because they are part of what was sold, but labelled as included amounts
rather than given a usage number the platform does not actually track yet.

### What the tenant sees

The company workspace at **:4300 → My Plan** is the read-only other half: the
active plan with the same countdown, each limit against what the company is
actually using (`3 of 5 admins`), the features it was sold, any renewal already
booked, and the full payment history. A suspended or expiring plan shows as a
banner rather than something the tenant can fix itself.

**Upgrading is a request, not a purchase.** The tenant browses the plan catalogue
— each card labelled *Upgrade* or *Downgrade* by the same daily-value comparison
the platform uses — and asks. That writes a `plan_requests` row and nothing else,
so a company can never grant itself higher limits. The request appears at the top
of the platform's plan console, where approving it is what actually applies the
plan, bills it and closes the old term. Rejecting leaves the tenant where they
are; either way they see the decision and any reply on their own screen. One
request may be open per company at a time.

`My Plan` is a system menu, so roles are granted it through **Menu Permission**
like any other. Tenants created before it existed are backfilled on boot: their
built-in *Company Admin* role picks up any system menu it is missing, while roles
the company built itself are left exactly as configured.

## Data model

33 tables — platform masters (states, business types, themes, plans), tenants
(companies, branches, branch contacts, company domains, sliders), website
content (company functionalities, WhatsApp numbers, About copy, About stats,
services, product categories, products, team members, gallery items,
testimonials, benefit cards, Contact page settings), billing (subscriptions,
subscription events, plan requests, transactions), the enquiry queue (service
leads) and identity (super admins, roles, menus, role permissions, admins).

The full schema is in [`Aj-Smart-Biz-Backend/docs/schema.dbml`](Aj-Smart-Biz-Backend/docs/schema.dbml)
— paste it into dbdiagram.io to view it or diff it against your own diagram.

Three conventions run through it:

- **Nothing is deleted.** Every table is paranoid; deleting a company soft deletes its branches, contacts, roles, permissions and admins together, and restoring it brings them all back. One deliberate exception: `company_functionalities` holds exactly one switch row per (company, feature) behind a unique index, and a soft-deleted row would occupy that slot invisibly — nothing deletes those rows anyway, because switching a feature off sets its `status`.
- **History is frozen.** A subscription snapshots the plan's terms at activation, so editing a plan later never rewrites what a company was actually sold.
- **Every transition is recorded.** Subscription statuses only change through one guarded function, which writes a `subscription_events` row on the way past.

## What was assumed

The dbdiagram.io link in the brief is a client-side app, so its contents could not
be read. The schema above was designed from the module list instead — worth
diffing against your diagram before going further. Two other choices worth
flagging:

- **MySQL** as the default dialect (SQLite is supported for local work).
- **Menu permission management sits with the company**, as specified. Companies can add their own menus on top of the seven platform ones; the platform menus are read only for them.

## Tenant branding by domain

`company_domain` maps hosts to tenants, so the company admin login screen brands
itself before anyone signs in. The API resolves the request Host against that
table — falling back to matching the leading label against the company code — and
returns the logo, name, description and favicon for the login page to render.

A domain can be pinned to a **branch** (`sub_company_id`), in which case that
branch's own logo and favicon are served, so `surat.acme.com` and `acme.com` can
look different. The endpoint is public but returns branding fields only, and an
unknown *or inactive* tenant gets platform defaults rather than an error, so it
cannot be used to enumerate tenants.

The public websites in [`themes/`](themes/) resolve their tenant the same
way, through a second endpoint built for them: `GET
/website/company-details?domain=<host>`. Where `/branding` returns just enough to
paint a login screen, this one returns the whole public profile — legal name,
business type, contact details, address, locale, the branch a domain is pinned
to, the head office and every active branch — while still withholding GST, PAN,
plan and admin data. A site reads the host it was served on, calls it before
rendering, and brands itself from the answer. Both endpoints live in the
backend; the websites define no API of their own. One deployment per business
type serves every company of that type — there is no per-tenant build.

## Website content: sliders

The hero on a tenant's website is theirs to edit. **Slider Management** in the
company workspace lists every slide with its image, copy, button and order, and
each slide is either **company-wide** or pinned to **one branch**.

Which slides a site shows follows the same fallback its logo already does:

```
branch-pinned domain ──► that branch's slides
                          └─ none of its own? ──► the company-wide slides
company-wide domain  ──► the company-wide slides
```

So `surat.acme.com` can run its own campaign without the head office losing
theirs, and a new branch site is never blank. Only `active` slides reach the
website, and the order is the one set in the admin — reordering sends the whole
list in a single call, so a shuffle cannot be left half-applied.

Every company starts with **three default slides**, created during provisioning
and backfilled on boot for tenants that predate the feature, so no website ever
serves an empty carousel. They are ordinary rows from that moment on.

A slide carries **two optional artworks**: a wide one for desktop and a portrait
crop for phones, because cropping a landscape hero to a phone's width throws away
its subject. The page renders them as a `<picture>`, so the browser picks one and
downloads only that one; a slide with no mobile artwork reuses the desktop file,
and a slide with no artwork at all sits on the plain white hero. Either way the
template lays a scrim over the image — weighted to the left on desktop, to the
top on a phone — so the headline stays readable without erasing the picture.

## Optional functionality

Some of what a website can do is sold, not given. Several things are, and they
are one mechanism rather than several bolted on — adding another means adding an
entry to `FUNCTIONALITY_CATALOGUE`, and nothing else enumerates them.

| Key | What it buys |
| --- | --- |
| `whatsapp` | WhatsApp buttons, per enquiry type |
| `share_link` | A share button so visitors can pass the site on |
| `services` | The services the business sells, as a band on the home page and a page of their own, each with an enquiry form behind its button |
| `about_us` | Writing the About section yourself, and its band of figures |
| `team` | A Team section listing the people |
| `gallery` | A Gallery section of the company's own photographs |
| `contact_page` | A Contact page with the tenant's own wording and an enquiry form |
| `features_benefits` | A Features / Benefits band the tenant writes, an icon per card |
| `products` | A product catalogue — nested categories, several photographs per product, real prices, and offers highlighted on the home page and a page of their own |
| `orders` | A cart on top of that catalogue — an *Add to cart* button on every product the company allows, a basket the visitor can change, and one button that sends the order to WhatsApp or to payment. Sold separately from `products`, and withheld without it |
| `warehouse` | Stock control on top of that — one or more warehouses, a running quantity per product in each, a ledger of every movement, and the analytics over both. It is also the only thing that can make a website's availability *true* rather than remembered |
| `customers` | Sign-in on the website — a mobile number and a one-time code, saved delivery addresses, and an order history. The shop gets a customer list rather than a pile of orders it has to group by phone number itself |

**Three switches, all of which must be on** before a visitor sees anything:

| | Who sets it | Where |
| --- | --- | --- |
| **granted** | the platform | `plans.functionalities` — ticked on the plan in **Plan Management** |
| **enabled** | the company | **Company Details → Functionality** |
| **served** | the platform | the plan has not expired and is not suspended |

`active = granted && enabled && served`, decided in one place
(`services/functionality.service.js`). The tenant's toggle renders that answer
rather than working it out, the write routes guard on it, and
`/website/company-details` embeds it — so a locked switch, a refused request and
a missing button on the website can never tell different stories.

### Switched on is not the same as published

`active` is entitlement, and entitlement is not content. Several sections are
**absent rather than empty** — Services, Team, Gallery, Features / Benefits, and
a static wall of Testimonials — so a company can clear all three switches and
still have nothing whatever on its website, because it has not written a card
yet. Services feels it hardest, having no seeded content at all by design.

The console used to say *On your website* the moment a switch was flipped, which
is the exact disagreement the rest of this section exists to prevent: the badge
claimed a section the site did not render, and a tenant meeting that reasonably
concludes the feature is broken. So the functionality endpoints now also report

```
published: false, contentCount: 0, reason: "empty"
```

and the card reads **Nothing published yet**, with the reason under it and an
**Add content →** button pointing at the screen where the cards are written. The
banner on that screen agrees — *switched on, but nothing is published yet*.

Two things deliberately do **not** change with it. `active` still means
entitlement, because the write routes are guarded on it and a tenant has to be
able to add the first card to a section that is empty by definition until they
do. And `activeKeys` is untouched, so the website goes on deciding emptiness
from the rows it is already loading. The counts are only asked for by the
console routes (`withContent`), so the public path pays nothing for them.

The grant is **snapshotted onto the subscription** at activation, exactly like
the branch and admin limits and for the same reason: dropping WhatsApp from a
plan must not switch it off under a term that was already sold.

**A feature that is not live is absent, not hidden.** `features.whatsapp` is
`null` in the API response, so the markup never contains the button at all —
hiding it with CSS would leave a lapsed tenant's WhatsApp number readable in the
page source.

### WhatsApp numbers are typed

A company publishes numbers tagged with what each is for, so the website puts
the right one on the right button rather than guessing:

| Type | Where it lands |
| --- | --- |
| `inquiry` | the enquiry buttons in the hero and the contact section |
| `contact` | the header button, the footer, and the floating chat bubble |
| `support` | the support link in the footer |
| `orders` | the order action in the contact section |

A type left empty **falls back to `contact`**, so filling in one number makes
every button work. The footer's support link is the one exception — it renders
only when it is genuinely a different number, or it would be a second copy of
the line above it.

Numbers are stored as a country code plus the national number. People paste
whatever is printed on their card, so an explicit `+91`, `0091` or leading `0`
is stripped on the way in; without that, `+91 76230 38598` saved against country
code `91` produced `wa.me/91917623038598`. A bare `919876543210` is left alone —
with no `+` there is nothing to say the leading `91` is a country code.

The API returns each number as a finished `https://wa.me/…?text=…` link, so no
template builds one.

### The share button

On a phone it opens the device's own share sheet (`navigator.share`), which
reaches apps a web link cannot. Everywhere else the visitor gets the channels
the company ticked — copy link, WhatsApp, Facebook, X, LinkedIn, Telegram,
email — with the company's own headline and message. The URL is read in the
browser rather than built from the tenant's domain, so sharing from a branch
host or a deep link passes on the address actually being looked at.

### Services

What the business sells, as opposed to why anyone should buy it. It is the
question a visitor arrives with, and until now the only answer a tenant's site
could give was whatever they had written into a slide.

It is a **band on the home page and a page of its own**, from one component and
one list. The home band shows the first four and links to the page; `/services`
shows all of them. Nothing about the copy differs between the two — only the
length — so a business cannot end up describing itself one way on the home page
and another a click later.

**A service is not a benefit card**, which is why it is not the same table. A
benefit is a reason to choose the business ("delivered when we said"); a service
is a thing it sells ("kitchen fitting, from ₹4,50,000"), and only one of the two
has a price. Each carries what its own argument needs:

| | What it holds |
| --- | --- |
| A photograph | Optional. A picture of the actual work outsells any glyph — but the icon is the **fallback**, not the alternative, so a card without one is still a finished card rather than an empty frame. |
| What's included | Up to six short lines, printed as a tick list. It is the question every visitor has after the name of the service, and answering it in a paragraph buries it. |
| A price line | **Free text, never a number** — `From ₹4,50,000`, `₹1,200/hour`, `On request`. A decimal column would have to invent a currency and a period, and would be wrong for everyone who prices per job or does not publish prices at all. |
| Featured | One or two services the company most wants read. The website gives a featured card the full row and lays it on its side, picture beside the words; `sequence` still decides the order. |

The glyphs come from the **same library the benefit cards use** — `FEATURE_ICONS`
— rather than a second set, so a site carrying both sections looks drawn by one
hand. The website draws them itself, and falls back to `spark` for a name it
does not recognise.

**There are no default services.** Every other seeded list on the platform
replaces wording the template used to invent — six benefit cards, four figures —
and seeding gives a tenant something to edit rather than a blank screen. This one
has no honest content to seed: a figure the platform made up is a wrong number,
but a *service* the platform made up is a business advertising work it may not
do, and a customer ringing up about it. So the section stays absent until the
company writes its first card.

**Empty withholds the page, not just the band.** Entitled, switched on and
nothing written is an ordinary state for a tenant on its first afternoon, and a
Services page with no services on it is worse than no Services page — so the
route 404s and the menu entry disappears with it. That is `content` on the
`NAV_PAGES` row, the first page to need it: the difference between "the plan
pays for this page" and "there is something on it". The menu is built from the
same payload the website renders, so a link here can never outlive the list.

**The page is renamed where the services are edited**, like About and Contact —
Company Details → Services has a *Menu name* field, so a studio can call it
*Work* and a clinic *Treatments*. It is the first page whose label lives on the
functionality's own `settings` blob rather than in a settings table, because the
section has only cards and no settings row to keep one in; see `NAV_LABEL_SOURCE`.

### Products, categories and offers

What the business **sells**, as opposed to the work it does. Services is priced
in words because a joiner quotes per job; a product is a *thing*, and a thing has
a number on it. That one difference is what the whole feature turns on: with a
number the platform can say what a visitor is saving, and everything about
offers follows from being able to compute that honestly.

It is four pages and three bands, from one payload:

| | What is on it |
| --- | --- |
| **`/products`** | Everything, filtered by category. One listing that filters rather than a page per category — the filter is visible and changeable, so somebody who landed on *Dining tables* can widen to *Furniture* without the back button, and there is one page to keep right rather than thirty. |
| **`/products/<slug>`** | One product: its photographs, price, what is included, a specifications table and the long description. Addressed by slug, so a shared link outlives a migration. |
| **`/categories`** | Every main category with its subcategories named on the tile. |
| **`/offers`** | Everything reduced today. |
| **The home page** | A band of categories, a band of offers and a band of the range — in that order, each with a *View all* link. Categories first because *what kind of thing do you sell* comes before *show me one*; offers before the full range because they are the argument for looking **now**. |

Only **Products** is in the site's menu. `/categories` and `/offers` are real
pages reached from where a visitor is already browsing — a five-product shop with
three catalogue entries in its header has a menu longer than its stock list.

#### Categories nest, and the tree is one table

"Main category" and "subcategory" are the same thing seen from different heights,
so they are one self-referencing table rather than two. A business that starts
with two levels asks for a third the week it takes on a second supplier; two
tables answer that with a migration, and a `parentId` answers it with a dropdown.

Three levels is the cap, and it is enforced on **re-parenting as well as on
create** — moving a two-level branch under a second-level category is how a
tenant reaches level four without ever creating one there. A category cannot be
moved under its own descendant either; that is the one move that produces a tree
no page can finish rendering.

**A product is filed in the deepest category that fits, and found from any of
them.** Somebody browsing *Furniture* gets the dining tables underneath it,
because the API sends each product its finished ancestry rather than a single id.
Nothing files anything twice.

**Deleting a category deletes the category and nothing else.** Its subcategories
are promoted to where it was and its products fall back to uncategorised — done
in one transaction and by hand, because these tables are paranoid, so the delete
is an `UPDATE` and the database's `ON DELETE SET NULL` never fires. The
confirmation says which, in those words, because neither consequence is obvious
and both are recoverable.

**An empty category is absent from the website**, pruned before the payload is
sent, so a heading on a live site always leads somewhere.

#### Price, offer price, and the label over both

Three fields, and the order they are read in is the whole of it:

| | |
| --- | --- |
| `price` | What it normally costs. |
| `offerPrice` | What it costs today, when that is less. **The discount is computed, never typed** — so a card can never advertise "30% off" beside two numbers that are 12% apart. An offer price at or above the normal one is refused at the door. |
| `priceLabel` | Free text that **overrides the display entirely** — `From ₹24,999`, `₹1,200/metre`, `On request`. A business that cannot publish one number keeps the catalogue; what it gives up is the arithmetic, and that is its own choice rather than the platform's. |

`onOffer` exists for exactly that case. Usually an offer is *derived* — there is
an offer price below the price — but a tenant pricing in words has no pair to
derive from and still runs offers, and "free fitting this month" is an offer no
percentage can express. **One function decides it** (`isOnOffer`), and the offers
band, the `/offers` page, the badge on every card and the console's Offers tab
all read that one answer — so a product can never be badged on a page it is
missing from.

Money is formatted from the tenant's own currency, not a hardcoded symbol.

#### Several photographs, in an order the tenant sets

The first is the card image everywhere in the catalogue, so the order is a
decision and the admin says so on the tile rather than leaving it to be
discovered. Up to eight; the detail page shows one large with a strip of
thumbnails under it, and **that gallery needs no JavaScript** — it is a
scroll-snapping track with anchors for thumbnails, because a product page is the
one most likely to be opened cold from a search result on a slow connection.

#### Where each console sees it

- **Company Details → Categories (:4300)** — the tree, with a product count on
  every row, a parent picker that refuses the row's own descendants, and the
  wording above the categories band.
- **Company Details → Products (:4300)** — the catalogue. The one screen in this
  section that pages, searches and filters, because a team has ten people and a
  catalogue has however many things the business sells. Tabs for *On offer*,
  *Featured* and *Hidden* are filters the API already answers. The price fields
  show what the card will say **while you type** — the one number on the form
  nobody can work out at a glance.
- **The website** — the three bands and the four pages above.

**The catalogue never rides along on pages that do not show it.** Anything handed
to a client component is serialised into the page's HTML, and the header is on
every page — so the header, the slider and the gallery are given the company
*without* the catalogue (`siteCompany`). A three-hundred-product shop would
otherwise put a quarter of a megabyte of product JSON into the markup of its
contact page.

### Cart and orders

The catalogue is the shop window; this is the counter. **It is a grant of its
own** (`orders`), sold on top of `products` and never instead of it — a showroom
that prices everything and takes its orders on the phone is a real business, and
it should not have to buy a cart to publish a price list. The reverse is not a
business: a cart with nothing to put in it is a button leading to an empty
basket, so the public payload withholds this block whenever the catalogue is
absent, including when the tenant simply has not published a product yet.

**Where an order goes is the company's choice**, set on Company Details →
Cart & orders:

| Setting | What happens |
| --- | --- |
| `whatsapp` | The basket is written out as a plain-text message and opened in the company's WhatsApp, ready to send — with the order number at the top of it. |
| `payment` | The visitor is sent to pay through the tenant's own UPI id or payment link, with the total already on it. The order still reaches WhatsApp alongside wherever a number is published, because a payment with no idea what was bought is not an order. |
| `none` | No cart and no order button anywhere on the site; the catalogue reads as a brochure with prices on it. A real setting rather than "switch the feature off" — the labels, the number and the payment details are all kept, so a shop pausing orders for a fortnight sets none of it up again. |

**A route with nothing behind it produces no cart at all.** Pointing orders at
WhatsApp with no published number, or at payment with no UPI id and no link,
withholds the whole block rather than painting a button that leads nowhere — the
line `publicServices` already takes on its enquiry button. The console says so
before it happens, so nobody finds out from their own website.

**The basket is optional too.** Switched off, a product is ordered one at a time:
the button says *Order now* and sends that single line straight away. A trade
counter selling one large thing at a time wants that; a shop selling six small
ones wants the basket.

**A product can be excluded.** `company_products.orderable` is on by default, so
switching the cart on puts a button on the whole catalogue rather than on
nothing; it is the exception that is worth setting — the made-to-measure item,
the thing priced *On request*, the display piece that is not for sale. An
out-of-stock product is never orderable whatever the flag says, and the API folds
the two into one boolean so no template can check one and forget the other.

**Every order is recorded**, and the mode above decides only what happens
*next*. That was not always true: the cart shipped without an orders table on the
same bargain Services' `whatsapp` target makes — the shop already has a phone,
and a queue nobody has open is a queue nobody packs. The bargain holds right up
until somebody asks *how many did we sell last month*, and then it does not hold
at all: a chat thread cannot be counted, filtered, or reconciled against a shelf.
So the record is the record and the message is the notification, which is the
conclusion `SERVICE_ENQUIRY_TARGET` reached with `both` as its default.

The *basket* still lives in the visitor's own browser until they send it — a
snapshot per line rather than a product id, so one filled last week does not have
to be re-resolved against a catalogue that has since changed.

**Nothing about money is read from the request.** The cart posts product ids and
quantities; every price on the resulting order comes from the tenant's own
catalogue at the moment it is placed. A body that could name its own price is a
shop that can be bought from at a price the customer chose.

### Order management

`GET /my-company/orders` and the **Orders** menu: the queue a shop works down
every morning, and — on the same screen, behind a tab — what it has come to.
One screen rather than two menu entries, because *how are we doing* is a question
asked **while** working through the morning's orders.

**Six steps, forward or cancelled, never backward.**

| | |
| --- | --- |
| `pending` | it arrived, nobody has looked at it |
| `confirmed` | accepted — and where stock is **reserved**, if it is being tracked |
| `packed` | picked and boxed. It earns its own step because it is the one that takes the time and the one a customer rings up about |
| `dispatched` | it left — and where reserved stock actually **comes off** |
| `delivered` | terminal |
| `cancelled` | terminal, and it **puts stock back** |

Backward is refused outright. An order that has been dispatched has left the
building, and a console that could put it back to `packed` would be one where the
stock ledger and the order list tell different stories about the same box; a
mistake is fixed by cancelling and re-entering, which leaves both of them saying
what actually happened. **The status change and its stock effect are one
transaction**, so a reservation that cannot be met leaves the order exactly where
it was.

**Payment is a second axis, not a seventh status.** They move independently: cash
on delivery dispatches unpaid every day of the week, and UPI up front pays for an
order nobody has packed. One list would force every business into one of those
two shapes.

**There is no *Add order* button and no delete.** The only writer is the public
website — an order that could be typed in would make the list a place where
"somebody bought this" and "somebody typed this in" are indistinguishable, and
one that could be deleted would make every revenue figure provisional. The
*lines* are read-only for the same reason: an order records what was bought at
what price, and a console that could rewrite that turns every sales report into
an opinion. What a shop legitimately changes after the fact — which warehouse,
a delivery charge agreed on the phone, its own notes — it can.

**A total that cannot include everything says so.** A catalogue may price in
words, and those lines are real parts of real orders that cannot be added up.
`unpricedItems` counts them, and every screen prints "₹18,400 plus 2 items to be
quoted" rather than a total that quietly under-counts. Nothing anywhere treats a
missing price as zero.

### Warehouse and stock

Sold separately again (`warehouse`), for the reason `orders` sits on top of
`products`: a shop can take orders all day and count its stock on a clipboard,
and plenty do. What this buys is the counting.

**A warehouse is not a branch.** A branch is a place the business trades from —
it has a website, an address on the Contact page, its own team. A warehouse is a
place things are *kept*, and the two are not the same cardinality: three shops
can run out of one central store, or one shop can have a stockroom and an
overflow unit across town. `branchId` says which shop a store serves where that is
true, which is what lets an order placed on the Surat site default to the right
shelf.

**A level and a ledger, and both are kept on purpose.**
`company_stock_movements` is the truth — every receipt, issue and correction, in
order, never edited. `company_stock` is the running total of it, written in the
same transaction, because summing the ledger would be correct and would get
slower every week on the one query the platform runs most: *is this in stock*,
asked once per product per page load by a public website. Each movement stamps
the resulting `balanceAfter`, which makes any drift between the two locatable to
the movement where it started.

**The ledger is append-only.** No update route, no delete route. A mistake is
corrected by a `correction` movement recording that a count disagreed, which
leaves both the error and the fix visible — the whole difference between a stock
system and a number in a spreadsheet.

**Direction comes from the reason**, never from the request: a receipt goes in, a
breakage goes out, a stock count is an adjustment. Asking for both is asking
somebody to contradict themselves. Which means `quantity` means two things, and
the console says so beside the box because nobody reads it anywhere else — *how
many arrived*, except on a count where it is *how many there are now*.

**`sale` and `transfer` cannot be typed in.** Both are written by the platform in
pairs, alongside something else that has to be true at the same moment: an order
that was dispatched, a unit that received what another one sent. A ledger that
let them be entered on their own ends up holding a sale against no order, and a
warehouse that shipped to nowhere.

**Reserved is not moved.** Confirming an order promises stock; dispatching it
issues it. Only the second writes a movement, because only the second is a thing
that physically happened. *Available* is `quantity - reserved`, and it is what
everything compares against — a box that is physically present and already sold
to somebody else is not one a stranger can buy.

**This is what makes a website's availability true.** A product with
`trackInventory` on takes its `in_stock` / `out_of_stock` from the shelf instead
of from a flag somebody remembered to set, so the site stops selling it the
moment the last one leaves the building. Still one of the three words rather than
a count, which is the platform's long-standing position: a visitor needs to know
whether to ring up, and a number the platform cannot keep true is worse there
than no number.

### Customer accounts

The first functionality that gives **the public** something to sign in to, which
is why it is sold apart from the cart: plenty of shops want an order button and
no wish to run a membership list, and every account is a name and a phone number
the tenant then holds.

**The mobile number is the identity, and there is no password.** Not a shortcut
— a password is a thing to forget, to reset over email, to store safely and to
be blamed for when it leaks, and the entire value of the account is remembering
an address and an order history. A phone number is the one identifier this kind
of shop already has for every customer, already prints on every order, and
already rings when something goes wrong. Sign-in is a six-digit code to it.

Numbers are **normalised on every route**: `+91 98250 11223`, `098250 11223` and
`9825011223` are one customer rather than three. A shop with three accounts for
one person has a list that cannot be counted, a sign-in that sometimes finds the
wrong history, and an order filed under a number nobody will search for.

**Unique per company, not per platform.** The same person buying from two shops
here is two customers — they are two businesses, and one has no business knowing
what the other sold.

#### Until an SMS gateway is connected

There is none yet, so `sendOtp` stands in for one: every code is
`CUSTOMER_OTP_DEV_CODE`, which defaults to **123456** and is read from the
environment. The API returns it in the response **labelled as a development
code**, and the sign-in page prints it with that label rather than pretending a
message was sent.

That is deliberate and it is confined to one function. A real random code with
nothing to deliver it would make sign-in impossible rather than secure — which
is worse for a feature nobody could then test. When a provider is added,
`hasSmsGateway()` returns true, that function generates and sends a real code and
stops returning one, and **nothing else changes**: not the routes, not the
expiry, not the attempt counting, not the website.

#### One field to begin with, and the shop decides what happens next

The sign-in form asks for the **number** and nothing else. `request-otp` answers
with `registered`, and the page goes where that says:

| | |
| --- | --- |
| known | the code step, with a code already sent |
| not known | the **sign-up** step, with the number already filled in |
| barred | neither will help, so it says to get in touch |

Nobody is asked whether they have an account before they know, nobody is told a
code is coming and left waiting for a message that was never sent, and nobody has
to work out for themselves that they were supposed to register instead.

**That `registered` exists at all is a deliberate trade.** The route originally
answered identically either way, which meant it could not be used to test which
numbers a shop has. It can now. Three things keep that bounded, and they are why
this is a trade rather than a hole:

- the **rate limit** on the route, which is what makes working through a list of
  numbers impractical rather than merely rude;
- it reveals only *that* an account exists — never a name, an email or an order,
  all of which still need a code from that person's own phone;
- a **barred** customer reads as `registered`, so the answer cannot be used to
  work out who a shop has shut out, and cannot be used to get a fresh account on
  a number the shop deliberately stopped.

`verify` is unchanged: no account, wrong code and expired code still say the same
thing. Knowing an account exists is a long way from being able to open it.

#### Addresses

Several per customer, because people have several. Home, work, and a parent's
address at the weekend — the last is the one that makes a single-address design
annoying. Exactly one is the default, and the checkout starts there.

**An address is copied onto the order as text, never referenced by it.** People
move and correct typos; an order that resolved its address through a join would
silently start claiming it was delivered somewhere it never went. Which also
makes deleting one safe: the orders that went there still say so.

At checkout a signed-in customer **picks one** instead of typing it again, and
what is sent is an **id** — checked against that customer's own addresses by the
API, which then writes its own formatting of it onto the order. A body that could
name any address id would be a way of reading other people's addresses back out
of an order confirmation.

#### Their order history

`/account/orders`, with the lines on every order — a history showing only a date
and a total is one nobody can check against what actually arrived, which is the
commonest reason somebody opens it.

Each order carries **two tags, never one**. *Where it went* is the shop's order
mode at the time, snapshotted, so a shop that switches from WhatsApp to card
payments next month does not relabel what somebody already bought. *Whether it is
paid* is the other axis entirely. Folding them into one badge is what makes an
order history unreadable.

The shop's private notes and the order's provenance are stripped on the way out:
harmless-looking, and none of the customer's business.

#### The session

The token lives in an **httpOnly cookie** the browser cannot read, and every
authenticated call is made from the server — which is why the account pages are
Server Components and Server Actions rather than client `fetch`. An expired
session is treated as *signed out* rather than as an error: somebody whose only
problem is that a month has passed should see a sign-in form, not a wall of red.

#### What the console can and cannot do

**Company Details → Customers** lists them with what they have spent, and opens
one to show their addresses and their orders in a single request.

There is **no *Add customer*** button: an account is made by the person it belongs
to, and one a shop could manufacture would be a row nobody consented to attached
to somebody's phone number. The **phone number is not editable** — it is the
identity and the sign-in, so an edit would both move the account to a different
person and lock the original out. The screen says so rather than showing a greyed
box, which is the thing people ring up about.

Barring somebody stops them signing in and ordering. **Their orders stay exactly
where they are**: barring a customer is not the same as pretending they never
bought anything, and the sales figures must not move because a shop fell out with
one.

### Analytics

Two endpoints — `/my-company/orders/analytics` and
`/my-company/stock/analytics` — over a **closed list of windows** (7, 30, 90 or
365 days). Closed because each is a query the database has to answer quickly, and
because "the last 3,650 days" is a report nobody reads and every tenant would
eventually ask for.

Three rules they both keep:

- **Cancelled orders are not sales.** Every revenue figure excludes them. The
  status breakdown includes them, because that one has to add up to what actually
  arrived.
- **The series is gap-filled by the API.** Every day in the window comes back,
  with zeroes where nothing happened — otherwise a chart drawn straight from a
  `GROUP BY day` shows a fortnight of trading as four bars in a row and lies
  about the shape of the week. Doing it server-side means the three consoles do
  not each have to get the timezone arithmetic right.
- **Two stock valuations, and the honest caveat on the second.** `retailValue` is
  the stock at what the catalogue sells it for; `costValue` is what it was bought
  for, from the costs typed onto receipts. `costCoverage` reports what share of
  the stock actually has a cost behind it, so nobody reads a partial valuation as
  complete.

The console draws them as **hand-written SVG** — no charting library. What is
needed is a row of rectangles with a baseline, which is forty lines that inherit
the console's colours, against a dependency that would be the largest thing in
the bundle and would bring its own theming system to fight with. The bars start
at zero, always: a baseline at the minimum makes a 3% change look like a
collapse, which is the most common way a chart lies.

### The enquiry form, and where it goes

A service card's button opens a short form — **a name and a mobile number, and
nothing else**. No email, no address, no message box: it is a callback request
rather than a brief, and every extra field on it is another reason to abandon
it. What the enquiry is *about* comes from the card it was sent from, which the
visitor has already read.

**Every button is named by the tenant.** The section sets one label — *Enquire*,
*Get a quote*, *Book a slot* — and any single service can override it, so a
company can run "Enquire" everywhere and "Book a fitting" on the one card that
wants it. Blank on a card means "use the section's", so changing the section's
label still changes every card that never deliberately overrode it.

**Where a submission goes is the company's choice**, set on Company Details →
Services:

| Setting | What happens |
| --- | --- |
| **WhatsApp and Service Leads** | Recorded here *and* the customer is offered WhatsApp with the message composed. The default, because it is the only one that loses nothing: the row is the record, the message is the notification. |
| **Service Leads only** | Recorded here. Nothing leaves the platform. |
| **WhatsApp only** | Handed to WhatsApp and stored nowhere — the same bargain the Contact page's form makes. |

`whatsapp` needs a published Inquiry number to be worth offering. Without one the
API degrades *both* to *Service Leads only* — the record is the half worth
keeping — and on *WhatsApp only* it withholds the button entirely, because a
chat with nobody is worse than no button. One function decides it
(`serviceEnquiryTarget`) and both the website's payload and the public write
route read it, so the form a visitor is shown and the request the API accepts
can never disagree.

**The WhatsApp link is the one this template builds itself.** Every other one
arrives finished from the API, which can do that because it knows the whole
message in advance. This one cannot exist until somebody has typed their name,
so the API sends the number and the composing happens on the site. It is offered
as a link to press rather than a window opened automatically: a popup opened
after an `await` has lost its user gesture and gets blocked.

### Service Leads

The queue those enquiries land in — a **top-level menu**, not a Company Details
submenu, for the same reason Lead Management is one: that section is the company
describing itself, and this is a queue somebody works through on a Monday
morning. It is the platform's first inbox.

**It is not Lead Management.** That screen is one row per *device* that opened
the website — traffic, assembled from tracking, with a stage bolted on so a
salesperson can work it. Nobody in it ever asked to be contacted. Everybody here
did, and said what about. One row per *asking* rather than per person: the same
customer enquiring about framing in March and about restoration in June is two
enquiries, and collapsing them would lose the second behind the first one's
stage. The two share `LEAD_STAGE` deliberately — a company should not have to
learn two vocabularies for "I have rung them".

What a person does here is move an enquiry along and write down what happened,
so those are the only two things the API accepts. **What the visitor typed
cannot be edited**: a name and a number are a record of what happened, and
letting them be rewritten would turn that into a note about what someone thinks
happened. There is no create route either — the only writer is the public
website, or the list would be a place where "somebody asked us" and "somebody
typed this in" are indistinguishable.

Two details the screen turns on. The counts come from the API and describe the
whole queue rather than the open filter, because a count derived from a filtered
page would read zero on the very tab that needed it. And a row records whether
the visitor was *also* handed the message to send, because on the default
setting the company may well have heard from them already — a screen that showed
every enquiry as untouched would have somebody ringing people who messaged them
ten minutes ago.

The menu is dropped for a tenant whose plan does not grant Services: no form on
the website means nothing to work through. Switching Services **off** is a
different thing and keeps it, because they still need to reach what has already
been sent.

### About us: the section, and its figures

The About section is on every site — it is part of the template — so this
functionality does not add it, it lets the company **write** it. Which means a
tenant without the feature still gets an About section, built from what the
platform already knows:

| | Heading | Body | Figures |
| --- | --- | --- | --- |
| **With the feature** | the company's own | the company's own | the company's own |
| **Without it** | `Who <company> is` | the company's `description`, plus where it is based | none |
| **No tenant at all** | template placeholder | template placeholder | none |

The middle row is the point. A real business that has not bought the feature is
**not** given the template's invented prose — "we are a small team that prefers
finishing things" is a claim, and it is not the platform's to make on someone
else's behalf. Nor is `250+ projects delivered`, which is why the stat band is
absent rather than filled with defaults.

**Figures count themselves.** Each card is one of two modes:

| Mode | The figure is | Good for |
| --- | --- | --- |
| `fixed` | whatever the company typed — `250+`, `98%` | things only they know |
| `since_date` | counted from a date, every time the page renders | `Years in business` |

A hardcoded "12+ years" is wrong every January and nobody remembers to fix it. A
`since_date` card counting years from `2012-06-01` renders `14+` today and `15+`
next June with no one touching it. The arithmetic is calendar-aware — whole
units only, so a business founded on 29 February does not tick over a day early.

The label is editable on every card, so a frame shop shows `Frames delivered`
rather than being stuck with `Projects delivered`, and cards are added, edited,
reordered and deleted freely. Four are seeded the first time About is switched
on, counting from the company record's own creation date, so the band is never
an empty row — the tenant corrects the founding date to the real one.

### About is a page, not a band

`/about` is its own route, and the header's **About us** links to it. The
story, the figures, the team and the gallery live there together — they mean
more next to each other than wedged between "what we do" and a contact form —
and the home page keeps the hero, the services, the reasons and the contact.

Because the nav now spans two pages, its anchors are written `/#services`
rather than `#services`: a bare hash on `/about` would look for a section that
is not on that page and do nothing.

### Team and Gallery

Both are ordered lists of cards with the same moves — add, edit, reorder,
activate, delete — and both are **absent from the page** unless the tenant is
entitled to them *and* has put something in them. An empty Team section is worse
than no Team section, so a granted-but-empty feature still renders nothing.

The nav agrees: `Team` and `Gallery` links appear only when those sections did,
because the header, the footer and the page all ask the same function.

Team members are deliberately **not** a view over `admins`. The people a
business publishes and the people who can sign in to the workspace are different
sets — a founder who never logs in belongs on the website, a bookkeeper with a
login usually does not — and conflating them would either expose account details
or force fake accounts. Contact details on a team card are optional and the form
says plainly that they are published.

Gallery images need only the image. Titles and captions are optional, and alt
text falls back to the title; an image with neither is marked decorative rather
than given a meaningless description.

### Features / Benefits

The band of reasons to choose a business — what it offers, and what each thing
is worth to the person reading. It was the template's own copy until now: the
same six paragraphs on every site the platform served, about businesses the
words had never met. This functionality is what makes it the tenant's.

It follows the Team and Gallery rule rather than the About one, and the
difference is the whole argument. About falls back to something built from the
company profile, because the platform holds facts — a name, a trade, a city —
that a section can honestly be built from. It holds nothing whatever about a
company's **capabilities**. So there is no fallback here: switched off, not
granted, or granted with nothing written, the band is **absent from the page**,
and the template's old six cards are gone rather than waiting behind a flag.

**Icons are chosen, not uploaded.** Each card carries a glyph named from the
platform's library — `FEATURE_ICONS` in the backend constants, around thirty
of them grouped by what they say (trust, support, speed, value, results). The
website draws them itself from that name: one line weight, one 24-unit box, no
request. Which is the point — six cards of uploaded artwork look like six
uploads, and six of these look like a set.

The name is the contract and the drawing is not. The API refuses to save a key
that is not in the library, both consoles render the picker from
`GET /masters/functionalities` so neither keeps a list that can go stale, and
every renderer falls back to `spark` for a name it does not recognise — so a
glyph added to the platform before a template is redeployed shows the wrong
picture at worst, never a hole in a card.

Six cards are seeded the first time the section is switched on, so a tenant
finds the words they already had and edits them rather than facing a blank
screen. Ordinary rows from that moment on: rewrite them, reorder them, delete
them all. The section's heading, lede and button label are one short block saved
with the functionality's settings, and clearing a field asks for the platform's
wording back rather than leaving a blank heading.

### The template writes nothing

"What we do" and "Why us" are gone as *the template's*. They were the last two
blocks of its own invented copy, and with About, Team, Gallery and Contact all
tenant-written, they were the only thing on a live site that a real business had
not said about itself.

"Why us" has since come back as something a company writes — see Features /
Benefits above — which is the same principle rather than a reversal of it: the
band is on a site because a tenant filled it in, and absent from every site that
has not.

What that leaves is three pages, each entirely the tenant's: a **home page** of
their hero slides and a closing invitation, **`/about`** with their story,
figures, people and work, and **`/contact`**. Slide buttons that still pointed at
the removed anchors are repointed on boot — see `ensureSlideLinks` — because a
dead button on a live website is not something to leave until somebody notices.

### Contact is a page too

`/contact` is its own route, and the header's **Contact** links to it. It sits
behind `contact_page` on the same rule as About, Team and Gallery: the plan
grants it, the company switches it on, and only then is the page served.

Switched off, it is **absent rather than empty**. The API sends no settings, the
route answers 404, and every link to it disappears at once — the header, the
footer's Explore column, the closing bands on the home and About pages, and any
slide button aimed at it. Nothing on the site points at a page that is not
there. Writing stays refused without the grant, but *reading* the settings does
not: a tenant that downgraded can still see the wording it wrote, and what
upgrading would bring back.

**Company Details → Contact page** sets the eyebrow, heading and intro, whether
the enquiry form appears, where it sends people, and whether the locations
appear. Everything factual on the page — addresses, phone numbers, opening
hours, map links — still comes from the company profile and its branches.

**The enquiry form has no inbox behind it, on purpose.** A visitor fills it in
and the button hands the composed message to their own WhatsApp or mail app.
The platform never stores other people's enquiries, and nothing ends up sitting
unread in a table nobody has built a screen for — the tenant already has an
inbox and a phone, and this fills them. Pointed at WhatsApp with no Inquiry
number set, the form is hidden rather than shown with a button that goes
nowhere.

The home page keeps a closing band that links here, rather than ending in a
form and a table of addresses — and that link, too, is dropped when the page is
not being published.

### The menu is the tenant's, and the API builds it

The website's menu is not a list in the template. `/website/company-details`
returns a `nav` array — one entry per page **this** tenant is publishing,
already named the way they named it — and the header and footer render exactly
what arrives:

```json
"nav": [
  { "key": "home",    "href": "/",        "label": "Home" },
  { "key": "about",   "href": "/about",   "label": "Our studio" },
  { "key": "contact", "href": "/contact", "label": "Reach us" }
]
```

**A page is renamed where the page is edited.** Company Details → About us has
a *Menu name* field, and so does Contact page. Blank keeps the template's name,
so a tenant who never opens the field sees no difference. It is branch-aware
like everything else: a branch site can call the same page something else.

**A page the plan does not pay for is not in the array**, so the template needs
no rule of its own about what to hide — `hasSection` answers from `nav` rather
than from a list kept in step by hand.

**Adding a page later is one row.** `NAV_PAGES` in the backend constants names
each page, where it takes its label from, and which functionality it needs:

```js
{ key: 'contact', href: '/contact', label: 'Contact',
  settings: 'contact', functionality: 'contact_page' }
```

Add a row, add a `navLabel` column to whatever settings table the page has, and
it appears in the menu, renameable, gated and branch-aware. Neither the website
nor the console has to be taught about it separately.

### All of it is branch-aware

About, its figures, the team, the gallery, the benefit cards and the Contact
page settings all follow the fallback the sliders have always used, and it is
now the only one in the product:

```
branch-pinned domain ──► that branch's own content
                          └─ none of its own? ──► the company-wide content
company-wide domain  ──► the company-wide content
```

So `surat.acme.com` can introduce its own people and show its own work, and a
branch that has written nothing is **inheriting** rather than blank. A
company-wide host never shows a branch's content — a visitor to `acme.com`
should not meet the Surat team.

The console says which: the About screen has an **Editing About for** selector,
and a branch with no copy of its own is labelled as inheriting, with saving
described as *giving this branch its own*. Dropping the override puts it back to
inheriting. The company-wide copy cannot be cleared — there is nothing above it
to fall back to.

Team, Gallery, Features and the figures each get a branch filter and a **Shows
on** field, the same pair Slider Management has. A card added while the list is filtered to
one branch belongs to that branch, rather than silently landing on every site.

### Company Details is a section, not a screen

Its parts used to be nine tabs on one page. They are **submenus in the sidebar**
now, nested under Company Details:

| Submenu | Route | Permission | Needs a plan grant |
| --- | --- | --- | --- |
| Company profile | `/company/profile` | `company-details` | — |
| Branches | `/company/branches` | `branch-management` | — |
| Domains | `/company/domains` | `company-details` | — |
| Functionality | `/company/functionality` | `company-details` | — |
| Slider | `/company/sliders` | `slider-management` | — |
| Services | `/company/services` | `company-details` | `services` |
| Categories | `/company/categories` | `company-details` | `products` |
| Products | `/company/products` | `company-details` | `products` |
| About us | `/company/about` | `company-details` | `about_us` |
| Team | `/company/team` | `company-details` | `team` |
| Gallery | `/company/gallery` | `company-details` | `gallery` |
| Contact page | `/company/contact` | `company-details` | `contact_page` |
| Features / Benefits | `/company/features` | `company-details` | `features_benefits` |
| Plan & billing | `/company/subscription` | `company-details` | — |

Each is a real route, so it can be linked to and bookmarked — the "switch it on"
button on a locked section goes straight to `/company/functionality` rather than
opening a page and then a tab. `/company` redirects to the profile, and the old
`/sliders` redirects to `/company/sliders`.

**A submenu the plan does not pay for is not in the sidebar.** The ones with a
grant in the last column above are dropped from `/auth/me` when the running subscription does
not grant them, so a tenant is not offered a screen it cannot use. Being
switched **off** is a different thing and does *not* hide the entry: that is the
tenant's own choice, made on the Functionality screen, and they need the way
back to what they wrote. The grant comes from the subscription snapshot, so
editing a plan mid-term does not silently add screens to a live tenant — a plan
change does.

**The nesting is data, not a list in the frontend.** `menus.parent_id` has always
existed; these are the first rows to use it, and `/auth/me` reports it, so the
sidebar renders whatever tree the API sends.

**Permissions did not change.** Eight of the nine follow their parent: they are
parts of one screen, so a role that can view Company Details can view all of
them, and one that cannot sees none. They are left out of the permission matrix
for that reason — a checkbox that cannot actually deny anything is worse than no
checkbox. **Branches is the exception and keeps its own row**, because it always
had one: a role can be given Company Details without it, and moving the screen
into the sidebar must not quietly undo that.

The company payload is loaded once for the whole section, by the layout that
frames it — see `CompanyContextService` — so moving between submenus costs no
extra request.

### Where each console sees it

- **Plan Management (:4200)** — a card per feature on the plan form, and a column showing what each plan grants. Unlike the free-text `features` list beside it, these are validated against the platform's own keys.
- **Company Details → Slider (:4300)** — hero slides for the public website, company-wide or pinned to one branch. Grantable on its own, like Branches.
- **Company Details → Services (:4300)** — a card per service with its picture, its inclusions and its price, plus the section's wording and the name its page carries in the website's menu.
- **Service Leads (:4300)** — the queue of people who filled in the form on a service card: who, what they asked about, where it has got to and what was done. A menu of its own, dropped for a plan that does not grant Services.
- **Company Details → Functionality (:4300)** — a card per feature with a switch, the reason it is not live when it is not, and its settings panel: the typed number list for WhatsApp, the channels and copy for the share button. The switch is locked, with the reason on it, when the plan does not grant the feature.
- **Company Details → About us / Team / Gallery / Contact page (:4300)** — one submenu each, always present. About us and Contact page each carry the **Menu name** for their page, which is how the website's menu is renamed. A banner at the top says whether the section is live, switched off, or not in the plan, in the API's own words; where it is not granted the editor below is read only rather than hidden, so a tenant can see what it wrote and what upgrading would bring back. Each is scoped to a branch or to the company as a whole.
- **The website** — `/about` carries About, Team and Gallery; `/contact` is its own page; the home page carries the rest.
- **My Plan (:4300)** — what the current term was sold, and what each plan in the catalogue would unlock.

## When a plan lapses, the website stops

A tenant's plan is what pays for its website, so `/website/company-details`
reports whether the platform will still serve it:

```
service: { active: false, reason: "expired" | "suspended" | "no_plan" }
```

Those are the platform's own reasons — the identical set `quota.service` refuses
branch and admin creation with — so a company blocked in the console cannot have
its public site carry on as though nothing happened.

The site then renders a **holding page instead of its content**, not a banner
over it. Both the page and the layout make that decision: skipping the content in
the layout alone still leaves it readable in the streamed RSC payload, which
would defeat the point. The tenant's logo, name and real contact details stay, so
a visitor who followed a link sees "back shortly" rather than "wrong address",
and the page is `noindex` so a week's lapse cannot leave *This website is
offline* as the company's search result.

The wording lives in the template, in `src/config/site.ts`, one block per
reason — a lapsed plan reads differently from a company that was never put on one
("coming soon", not "renew"). Nothing on the page names a plan, a price or a
date: the API does not return them, and a company's billing position is not its
customers' business.

**This is retroactive.** Any company without a running subscription — including
one that simply never had a plan assigned — gets the holding page as soon as this
is deployed. Check `subscriptions` before shipping it at a live tenant.

## Verification

The API was exercised end to end against a live database — **188 checks over five
passes** covering both login flows, tenant provisioning, plan quotas, the
permission matrix, soft-delete cascade and restore, both dashboards, image
uploads, ICO validation, domain resolution and the guard rails (root account
protection, head-office branch, main admin, system role, cross-tenant isolation).

Both consoles were then driven in a real browser (Chrome via puppeteer-core)
against their **production** bundles — **63 further checks** covering sign-in,
the Company Details submenus, adding a domain through the UI, a company setting its
own favicon and that favicon appearing on every page and surviving a reload,
with console errors and page exceptions treated as failures.

Both apps build clean in development and production.
"# Aj-Smart-Biz" 
