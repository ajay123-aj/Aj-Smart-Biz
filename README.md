# Aj Smart Biz

A multi-tenant business platform in three projects.

| Project | Stack | Port | What it is |
| --- | --- | --- | --- |
| [Aj-Smart-Biz-Backend](Aj-Smart-Biz-Backend/) | Node.js · Express · Sequelize · MySQL | 4000 | One API serving both consoles |
| [Aj-Smart-Biz-Supper-Admin](Aj-Smart-Biz-Supper-Admin/) | Angular 22 | 4200 | Platform console — companies, plans, billing, masters |
| [Aj-Smart-Biz-Admin](Aj-Smart-Biz-Admin/) | Angular 22 | 4300 | Company workspace — branches, roles, permissions, admins |
| [websites](websites/) | Next.js 15 | 4400+ | Tenant-facing public websites, one template per business type |

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

25 tables — platform masters (states, business types, themes, plans), tenants
(companies, branches, branch contacts, company domains, sliders), website
content (company functionalities, WhatsApp numbers, About copy, About stats,
team members, gallery items, Contact page settings), billing (subscriptions,
subscription events, plan requests, transactions) and identity (super admins,
roles, menus, role permissions, admins).

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

The public websites in [`websites/`](websites/) resolve their tenant the same
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
| `about_us` | Writing the About section yourself, and its band of figures |
| `team` | A Team section listing the people |
| `gallery` | A Gallery section of the company's own photographs |
| `contact_page` | A Contact page with the tenant's own wording and an enquiry form |
| `features_benefits` | A Features / Benefits band the tenant writes, an icon per card |

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
