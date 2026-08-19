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

18 tables — platform masters (states, business types, themes, plans), tenants
(companies, branches, branch contacts, company domains, sliders), billing
(subscriptions, subscription events, plan requests, transactions) and identity
(super admins, roles, menus, role permissions, admins).

The full schema is in [`Aj-Smart-Biz-Backend/docs/schema.dbml`](Aj-Smart-Biz-Backend/docs/schema.dbml)
— paste it into dbdiagram.io to view it or diff it against your own diagram.

Three conventions run through it:

- **Nothing is deleted.** Every table is paranoid; deleting a company soft deletes its branches, contacts, roles, permissions and admins together, and restoring it brings them all back.
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
/public/company-details?domain=<host>`. Where `/branding` returns just enough to
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

## When a plan lapses, the website stops

A tenant's plan is what pays for its website, so `/public/company-details`
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
the Company Details tabs, adding a domain through the UI, a company setting its
own favicon and that favicon appearing on every page and surviving a reload,
with console errors and page exceptions treated as failures.

Both apps build clean in development and production.
"# Aj-Smart-Biz" 
