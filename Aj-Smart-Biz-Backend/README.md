# Aj-Smart-Biz-Backend

Node.js + Express + Sequelize API behind both Aj Smart Biz front ends.

- **Tables are created automatically** from the models on boot (`sequelize.sync`) — no manual migration step.
- **The root super admin is created automatically** on every boot from the `SUPER_ADMIN_*` env vars, if it does not already exist.
- **Two environments**: `.env.development` and `.env.production`, selected by `NODE_ENV`.
- **Everything is soft deleted** (`deleted_at`) — nothing is ever physically removed.

---

## Quick start

```bash
npm install
npm run dev            # NODE_ENV=development, reads .env.development
```

The API listens on `http://localhost:4000/api/v1`. On first boot it will:

1. `CREATE DATABASE IF NOT EXISTS` (MySQL only),
2. sync every table,
3. create the root super admin and print its credentials,
4. seed the eight system menus, a few Indian states, business types and a default theme,
5. give any company without slides the three default hero slides.

```
npm start              # NODE_ENV=production, reads .env.production
npm run db:sync        # sync the schema only  (add --force to drop and recreate)
npm run db:seed        # re-run the idempotent seeders
```

### Demo content

Four seeders that nobody runs by accident, because what they write is content a
business would be *claiming*. A product the platform invented is a shop
advertising stock it does not carry, with a price on it — so these are scripts
somebody runs on purpose, at a company they name, and none of them is part of
boot.

```
npm run db:seed:catalogue        # a demo catalogue into company 1
npm run db:seed:catalogue -- 3   # ...or into company 3
npm run db:seed:blog             # demo articles
npm run db:seed:salon            # Aj Salon — a whole tenant, end to end
```

`db:seed:salon` is the odd one out: rather than filling in content for a company
that already exists, it writes **one complete tenant** — the business type, the
theme, the plan, the company, its domain (`salon.localhost`), its treatment
menu, its retail shelf, its people, its reviews and its articles. It is the
company `websites/salon/black-theme` was built against, and it writes through
the same models and the same `createCompany` service the super-admin console
does. All four are idempotent, and all four write their images as `seed-*.svg`
placeholders under `uploads/`.

### Zero-setup option (no MySQL)

Set `DB_DIALECT=sqlite` and the API runs against a single file, which is handy for a
first look or for CI. Everything else behaves identically.

```bash
DB_DIALECT=sqlite DB_STORAGE=aj.sqlite npm run dev
```

---

## Environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` or `production`; picks the `.env.<env>` file |
| `PORT`, `API_PREFIX` | Listen port and route prefix (default `/api/v1`) |
| `DB_DIALECT` | `mysql` (default) or `sqlite` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection |
| `DB_STORAGE` | SQLite file path, when `DB_DIALECT=sqlite` |
| `DB_SYNC_MODE` | `alter` (default in dev), `force` (drop + recreate, dev only), `none` (recommended in prod) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Access token |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` | Refresh token |
| `SUPER_ADMIN_NAME/EMAIL/PHONE/PASSWORD` | Root account created on boot |
| `CORS_ORIGINS` | Comma-separated allow-list (defaults cover both dev servers) |
| `BCRYPT_SALT_ROUNDS` | Password hashing cost |
| `DEFAULT_COMPANY_ADMIN_PASSWORD` | Fallback when a main admin is created without one |
| `UPLOAD_DIR` | Where uploaded images are written (default `uploads/`) — point at a persistent volume in production |
| `UPLOAD_PUBLIC_PATH` | URL prefix the files are served under (default `/uploads`) |
| `UPLOAD_MAX_SIZE_MB` | Per-file limit (default 2) |

Production boot refuses to start with placeholder JWT secrets or `DB_SYNC_MODE=force`.

---

## One API, three consumers

Three things talk to this API, and each has a prefix of its own. A client needs
its base URL and its own prefix and nothing else: everything under that prefix is
something it may call, and everything it may call is under that prefix.

| Prefix | Consumer | Auth | Scope |
| --- | --- | --- | --- |
| `/website` | A tenant's public site (`websites/`) | None | The tenant is resolved from the request **host** |
| `/admin` | The company workspace (`Aj-Smart-Biz-Admin`) | `POST /auth/admin/login` | The token's own company, always |
| `/super-admin` | The platform console (`Aj-Smart-Biz-Supper-Admin`) | `POST /auth/super-admin/login` | Every tenant |

`/auth`, `/masters`, `/uploads` and `/health` sit outside those prefixes because
every consumer uses them — putting `/auth/admin/login` under `/admin` would mean
writing the same endpoint twice, and `/admin/masters/states` would be a path the
platform console has to know about.

**The guard belongs to the module, not to the route.** `authenticate` and the
scope check are applied once, in `modules/index.js`, so a route added inside a
module cannot be reachable by the wrong consumer through an omission. Tokens
carry a `scope`, so an admin token on `/super-admin` is a 403 and the reverse is
too.

Company admins are additionally gated per menu: every tenant route is wrapped in
`requirePermission('<menu-slug>', '<action>')`, which reads `role_permissions`.
The main admin (`is_company_admin`) bypasses those checks.

### Where the code lives

```
src/modules/
├── index.js                       mounts the four below, and owns the guards
├── shared/shared.routes.js        /health · /auth · /masters · /uploads
├── website/website.routes.js      /website/*      — unauthenticated
├── admin/admin.routes.js          /admin/*        — admin token
└── superadmin/superadmin.routes.js /super-admin/* — super-admin token
```

The resource routers in `src/routes/` are the building blocks; the modules
compose them and decide who may reach what.

---

## Docs

Swagger UI at **`/api/v1/docs`**, the raw spec at **`/api/v1/docs.json`**.

Both halves of it are generated rather than written twice:

- **Every route** is read off the Express router at boot (`docs/routeScanner`),
  so coverage cannot fall behind the code — if it is mounted it is documented.
- **Every request shape** is compiled from the **Joi validators the API already
  runs** (`joi-to-swagger`), so the documented body is the enforced body.

What is hand-written is the prose — the `@openapi` blocks next to the routes,
which explain what an endpoint is *for*. Those win over the scanned entry.

---

## API

All responses share one envelope:

```jsonc
{ "success": true, "message": "…", "data": …, "meta": { "total": 42, "page": 1, "limit": 10, "totalPages": 5, "hasNext": true } }
```

Errors: `{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "…" }] }`

List endpoints accept `?page=&limit=&search=&status=&sortBy=&sortOrder=`.

### Auth
| Method | Route | Notes |
| --- | --- | --- |
| POST | `/auth/super-admin/login` | Returns access + refresh token and the profile |
| POST | `/auth/admin/login` | Same, company scoped |
| POST | `/auth/refresh` | Scope is carried inside the refresh token |
| GET | `/auth/me` | For admins also returns `permissions` (by menu slug) and the visible `menus` |
| PATCH | `/auth/profile` | Name, phone, avatar |
| POST | `/auth/change-password` | Clears `must_change_password` |
| POST | `/auth/logout` | Stateless; a single place for clients to call |

### Masters — `/masters/{states,business-types,themes,plans}`
Reads are open to any authenticated user; writes are super admin only.

`GET /` · `GET /dropdown` · `GET /:id` · `POST /` · `PUT /:id` · `PATCH /:id/status` (plan active/inactive switch) · `DELETE /:id` · `POST /:id/restore`

Deletes are refused while rows are still referenced (a plan with an active
subscription, a state used by a company, the default theme).

**A theme row is a starting preset, not a company's theme.** It is shared — a
dozen tenants can point at one row, which is why editing one here reaches every
one of them. A company sets its own colours through
`PUT /admin/company/theme`, and those are laid over the preset key by key at
read time. See [Website theme](#website-theme).

### Companies — `/super-admin/companies`
| Method | Route | Notes |
| --- | --- | --- |
| GET | `/super-admin/companies` | Filters: `businessTypeId`, `stateId`, `planId`, `subscriptionStatus`; each row carries `activeSubscription` |
| POST | `/super-admin/companies` | **Provisions the whole tenant in one transaction** — see below |
| GET | `/super-admin/companies/:id` | Branches + contacts, subscription history, transactions, admins and a `summary` block |
| PUT | `/super-admin/companies/:id` | |
| PATCH | `/super-admin/companies/:id/status` | Deactivating blocks every admin of that tenant |
| DELETE | `/super-admin/companies/:id` | Soft deletes the company *and* its branches, contacts, roles, permissions, admins and tenant menus |
| POST | `/super-admin/companies/:id/restore` | Restores all of the above |
| GET/POST | `/super-admin/companies/:id/subscriptions` | List / assign-and-renew a plan |
| POST | `/super-admin/companies/:id/subscriptions/:subscriptionId/cancel` | |
| GET/POST | `/super-admin/companies/:id/transactions` | Paginated list / record a manual payment |
| * | `/super-admin/companies/:companyId/branches…` | Same branch routes as the tenant portal |

`POST /super-admin/companies` creates, in one transaction: the company → its head-office
branch → the `Company Admin` role with every permission → the main admin login →
optionally an active subscription and a paid transaction. If no password was
supplied for the main admin the API generates one and returns it **once** as
`mainAdminPassword`.

### Super admins — `/super-admin/super-admins`
`GET /` · `POST /` · `GET /:id` · `PUT /:id` · `PATCH /:id/status` · `PATCH /:id/reset-password` · `DELETE /:id`

The root account cannot be deleted, deactivated or demoted, and nobody can delete or disable themselves.

### Tenant portal
| Method | Route | Menu slug |
| --- | --- | --- |
| GET/PUT | `/admin/company` | `company-details` — writes are main-admin only, and `status`/`code`/plan fields are ignored |
| GET | `/admin/company/subscriptions`, `/admin/company/transactions` | `company-details` |
| GET/PUT/DELETE | `/admin/company/theme[?branchId=]` | `company-details` — the **own** website colours of one scope: the company, or one branch. Writes are main-admin only; `DELETE` drops that scope back to the level below |
| * | `/admin/company/branches`, `/admin/company/branches/:branchId/contacts` | `branch-management` |
| * | `/admin/company/sliders` | `slider-management` — each verb carries its own action right, so view-only roles cannot edit |
| * | `/admin/roles` | `role-management` |
| GET/PUT | `/roles/:roleId/permissions` | `menu-permission` — `PUT` replaces the whole matrix |
| * | `/admin/menus` (+ `/menus/tree`) | `menu-permission` — platform menus are read only for tenants |
| * | `/admin/admins` (+ `PATCH /admin/admins/:id/reset-password`) | `admin-management` |

### Website theme

Three sources, in descending authority, and they are not equal.

| | Where | Who writes it | Shared? |
| --- | --- | --- | --- |
| **The branch's own** | `branches.theme_config` | The tenant, with `?branchId=` | No — one branch only |
| **The company's own** | `companies.theme_config` | The tenant, under Company Details → Website theme | No — per company |
| **Preset** | `themes` | Super admin, under Masters | **Yes** — a dozen companies can point at one row |

Each level wins over the one below it **key by key**, so a branch that has only
ever set an accent colour keeps the company's primary and secondary rather than
losing them to two nulls. Where a key is set at no level, it comes back `null`
and the website template uses the design it shipped with.

The branch layer is only ever consulted when the **host resolved to a branch** —
see `company_domain`, which may pin one. This is the same chain
`/website/branding` already used for the logo and the favicon (pinned branch →
company → head office), which is deliberate: a visitor on the Surat domain
should not get Surat's logo above the company's colours.

That per-key merge is also what makes *reset* a real operation: clearing a field
puts it back on the level underneath, not on whatever the template happens to
default to. `DELETE /admin/company/theme?branchId=5` puts that branch back on
the company's colours; without the scope it puts the company back on its preset.

Only four keys are accepted — `primaryColor`, `secondaryColor`, `accentColor`
and `mode` — because those are the four a website template actually reads. The
`themes` table carries text, background, sidebar and font columns as well;
accepting those here would be storing settings that change nothing. Add one to
`WEBSITE_THEME_KEYS` in [`services/theme.service.js`](src/services/theme.service.js)
when a template starts reading it, and to `themeSave` in
[`validators/company.validator.js`](src/validators/company.validator.js) with it.

Both public endpoints — `/website/branding` and `/website/company-details` —
return the merged result under `theme`, so a template needs no knowledge of any
of this.

### Website — `/website`
No token. A tenant's own website reads everything it renders from here, and the
two login screens read their branding from it.

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/website/branding` | Tenant branding for the requesting host — what a login screen needs |
| GET | `/website/company-details` | The tenant's full public profile, its hero slides, and whether its plan still entitles it to be served |

The tenant is resolved from the request **Host** (`X-Forwarded-Host` behind a
proxy): first an active row in `company_domain`, then the leading label of the
host against `companies.code` — so `acme.ajsmartbiz.com` reaches the company with
code `ACME` even when no domain was configured. `?domain=` overrides the host,
which is how the app previews a tenant on `localhost`.

`/company-details` resolves the host exactly the same way and adds the rest of
the public profile: legal name, business type, contact details, address, locale,
the branch the domain is pinned to, the head office, every active branch, and the
hero slides for that host, and a `service` flag.

`service` is `{ active, reason }`, where `reason` is `expired`, `suspended` or
`no_plan` — the same set `quota.service` blocks branch and admin creation with,
so a company refused a branch in the console cannot have its website carry on
serving. It is deliberately coarse: no plan name, price, dates or renewal amount
reach a public endpoint. A website renders a holding page from it. It
returns **only what a company publishes about itself** — no GST or PAN number, no
plan, subscription, transaction or admin data, no counts — and, like
`/branding`, answers an unknown *or inactive* tenant with platform defaults
rather than an error, so neither route can be walked to enumerate tenants. It is
what the websites in [`../websites/`](../websites/) launch with.

When the matched domain is pinned to a branch, the response carries that
branch's `logo` and `favicon` (falling back to the company's when the branch has
none) plus a `branch` block — so `surat.acme.com` and `acme.com` can look
different. A deactivated branch falls back to company-wide branding.

Returns only what a login page needs — `name`, `description`, `logo`, `favicon`,
`code`, `branch` and the theme colours — never contact details, GST, plan or
counts. An unknown *or inactive* tenant gets the platform defaults with
`resolved: false` rather than an error, so the endpoint cannot be used to probe
which hosts or tenants exist. It has its own rate limit.

### Services, categories and appointments

A tenant's services are a price list with a page each, sorted into a tree, and -
where the company opts in - a diary somebody can take a time in.

**Prices are read in one order, everywhere**: `priceLabel` (free text) wins, then
the offer pair, then the plain `price`. A surveyor quoting per job keeps its
words; a salon charging ₹300 gets a number it can discount and report on. The
`showPrice` switch withholds both — the words and the figures — so the
switch cannot hide the prose and publish the number.

`company_service_categories` is a tree of its own rather than a corner of the
product one: they are sold separately, and `/products/bridal` and
`/services/bridal` are different pages that would otherwise fight over one slug.
The depth, cycle and nesting *logic* is shared — imported from
`catalogue.controller`, so a tree is a tree in one place.

- `GET|POST /admin/company/service-categories`, `PUT|PATCH|DELETE .../:id` —
  the taxonomy. Deleting one promotes its subcategories and unfiles its services;
  the response says how many of each.
- `features.services` now carries `categories`, `offers`, `home` and `counts`
  beside `items`, so the home page's three bands and the services page's filter
  are answered from the one payload.

#### Which buttons a card carries

Two **functionalities**, sold on top of `services` and switched on independently:

| `service_enquiry` | `service_booking` | What a card shows |
| --- | --- | --- |
| live | live | **Book a time** where the service allows it, an enquiry button elsewhere |
| — | live | **Book a time** only. Nothing else has a button |
| live | — | An enquiry button on every card |
| — | — | **No buttons at all** — the section is a price list |

The last row is a real product, not a broken state: a business that publishes
what it does and takes its calls on the number in the header. It is also the
cheapest thing a platform can sell, which is the reason these are grants rather
than settings — `services` on its own is a price list, and each button is
something a tenant buys.

Both are enforced twice. The template paints nothing, and the API **refuses an
enquiry or a booking sent anyway**: a website that only hides a form is a
suggestion.

`service_enquiry` is separate from `enquiryTarget`: one says whether an enquiry
can be made at all, the other where it goes. Switching the button off never takes
the diary with it — a booking is recorded through the enquiry's own route, so the
*route* must work, but the *button* is a separate question.

**Service Leads appears when either is granted.** An enquiry and a booking are
both rows on that screen, and a shop that bought only the diary still has a queue
to work through; gating the menu on `services` alone would show an empty inbox to
somebody selling a price list. `MENU_FUNCTIONALITY` therefore takes a list, and
any one of the keys will do.

Existing tenants are carried across by `ensureServiceGrants` on boot: every plan
that sells Services gains the enquiry, and a plan somebody was actually running a
diary on gains Appointments. Switch rows are created in the state the tenant was
already in — a button they had turned off stays off.

#### The diary

Booking is **off until a tenant switches it on**, because it is the only thing in
this section that makes a promise on the company's behalf: a slot a stranger
picks at 7pm on a Sunday is one somebody has to turn up for.

A slot is not a table. It is arithmetic over three facts the company already has
— the hours it works, the grid it cuts them into, and what is already booked
— and `services/booking.service.js` is the **one place** that does it. The
website asks it to paint a day and the write route asks it again inside the
booking transaction, so a time a visitor is shown is a time the API will accept,
and two people racing for the last chair cannot both be told yes.

- `GET /website/services/:slug/slots` — one day, every slot, with a `reason` on
  anything unavailable (`closed`, `past`, `full`, `overrun`), plus the next
  fortnight that has anything free. With no date it opens on the **next free
  day**, not today: a salon closing at one spends every afternoon otherwise
  showing an empty grid.
- `POST /website/service-leads` takes `bookingDate` + `bookingTime` and becomes a
  booking. **Signing in is required** when the tenant runs customer accounts —
  enforced in the API, not just hidden in the page — and a signed-in customer
  is never asked for their name: it comes off the account.
- `PATCH /admin/company/service-leads/:id/booking` confirms it, or declines it
  with a line the customer reads. Declining or cancelling hands the time straight
  back to the website.
- `GET /admin/company/service-leads/diary?date=` — the same rows in *time*
  order, which is the only order that answers "what does Thursday look like".

#### How many fit in one slot

The company sets one number — *bookings per slot* — on its booking settings, and
every service inherits it. That is the shop's own capacity said once: three
chairs, two vans, one treatment room. A service overrides it only where the
constraint is the **work** rather than the business (one colourist, one van), and
an override wins even when it is smaller.

The diary reports `booked`, `capacity` and `left` on every slot, so a website can
print *"2 of 3 left"* and grey out a time at the limit rather than refusing it
after somebody has typed their name. The count is the **worst slot across the
appointment's span**, not just its start: a 90-minute treatment on a 30-minute
grid occupies three, and a full one in the middle stops the booking however empty
its start looks.

Times are the **company's own**, stored as `HH:mm` and never converted. A visitor
in another time zone booking a haircut is booking it at the time printed on the
salon's door.

A booking's `bookingStatus` is deliberately not the enquiry's `stage`: one is a
fact the customer is waiting on, the other is a sales pipeline the company keeps
to itself. They move independently and are counted separately.

### Blog

A tenant's own articles, with a page each. Gated on the `blog` functionality like
every other section — absent from the website, from the menu and from the
console's sidebar unless the plan grants it.

What makes it unlike the other content sections is **time**. A post carries
`published_at`, which is both the date printed on it and the moment it becomes
visible, so a post is live when it is *active and its date has passed*. That pair
gives four states, and the API decides which rather than leaving the consoles to
work it out:

| state | means |
| --- | --- |
| `live` | active, date passed — on the website |
| `scheduled` | active, dated in the future. Saved, finished, invisible until then |
| `draft` | active, no date at all |
| `hidden` | taken off the site, keeping its date |

Scheduling therefore needs no scheduler and nothing to run: the same `WHERE`
that hides a draft hides next Monday's post until Monday.

- `GET|POST /admin/company/blog`, `PUT|DELETE /admin/company/blog/:id`,
  `PATCH /admin/company/blog/:id/status` — the writing desk. Paged, with
  `state`, `tag`, `branchId` and `search` filters, plus `/summary` and `/tags`.
- `GET /website/blog` — **the one paged public list on the platform**, and the
  one place the website fetches anything beyond `/website/company-details`.
  Services and products ride whole in the payload because they are as long as the
  business is wide; a blog accumulates, so the payload carries the latest six as
  cards and the archive asks for the rest a page at a time.
- `GET /website/blog/:slug` — one article with its body, plus the posts either
  side of it by date, so a reader who has finished one is offered the next
  without a second request.

Two rules worth knowing:

- **The slug never moves on its own.** Renaming a post does not regenerate it;
  changing the address is a deliberate act, because every link anyone has shared
  points at the old one.
- **The body is plain text, stored and rendered as plain text.** The website
  splits it into paragraphs and prints them, so nothing a tenant pastes in can
  become live HTML on a page a stranger is reading.

A post that exists but is not published yet answers **404**, not 403 — the
truthful answer, and the alternative would let anybody with the URL confirm that
a tenant has an article scheduled.

### Company domains — `company_domain`
A company can own several hosts, each optionally pinned to one of its branches
(`sub_company_id`).

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/super-admin/companies/:companyId/domains` · `/admin/company/domains` | List |
| POST | same | Add. The first one added becomes primary automatically |
| PUT | `…/domains/:id` | Edit host, branch pin, or promote to primary |
| PATCH | `…/domains/:id/status` | Activate / deactivate |
| DELETE | `…/domains/:id` | Remove |

A host is globally unique — it can only ever mean one tenant — is stored
lower-case, and must be a bare hostname (no scheme, port or path). Exactly one
domain per company is primary; promoting one demotes the rest, and the primary
cannot be cleared, deactivated or deleted while others exist. A pinned branch
must belong to the same company. `POST /companies` also accepts a `domain`
string as a convenience, which seeds the primary row.

On the tenant portal, reading domains needs the `company-details` view
permission but **writing them is restricted to the main admin**, since a domain
change alters who the tenant appears to be.

### File uploads — `/uploads`
Authenticated, both portals.

| Method | Route | Notes |
| --- | --- | --- |
| POST | `/uploads/:folder` | Multipart, field name `file`. Folders: `branch`, `company`, `avatar`, `misc` (anything else falls back to `misc`). Returns `{ path, url, filename, mimeType, size }` |
| POST | `/uploads/:folder?accept=ico` | Favicons — accepts **only** real `.ico` files |
| DELETE | `/uploads?path=…` | Drops a file that was uploaded but never saved onto a record |

Clients persist `path` (`/uploads/branch/abc.png`) — it survives a change of host —
and render `url`. Files are served read-only from `UPLOAD_PUBLIC_PATH`.

Only image MIME types are accepted (PNG, JPG, WEBP, GIF, SVG, ICO) and the stored
filename is generated, never taken from the client. The static route sends
`X-Content-Type-Options: nosniff`, a CSP that blocks scripts (so an SVG carrying
script cannot execute on our origin) and `Cross-Origin-Resource-Policy: cross-origin`
so the Angular apps — on a different port in development — can display the images.

`companies.logo` / `companies.favicon` and `branches.logo` / `branches.favicon`
hold these paths. Replacing either deletes the file it displaced, so orphans do
not accumulate; a soft-deleted record keeps its files so a restore is lossless.

**Favicons are `.ico` only.** Browsers report the MIME type for icons
inconsistently — `image/x-icon`, `image/vnd.microsoft.icon`, or plain
`application/octet-stream` — so `accept=ico` checks the extension *and* then
verifies the stored bytes begin with the ICO header `00 00 01 00`. A PNG renamed
to `.ico` is deleted and rejected.

### Dashboards
- `GET /dashboard/super-admin` — company counts (total / active / inactive / deleted), income (total, this month, last month, growth %), 12-month income series, companies per plan, recent companies and transactions.
- `GET /dashboard/admin` — admin counts (total / active / inactive), branches, roles, current plan with days remaining and quota limits.

---

## Guard rails worth knowing

- **Plan quotas** are enforced on write: creating a branch or an admin past the active plan's `max_branches` / `max_admins` returns `400` with a message naming the limit.
- **The head office branch** cannot be deleted or deactivated, and a branch with admins assigned refuses to be deleted.
- **The `Company Admin` role** cannot be deleted, deactivated, restricted or assigned by hand.
- **The main admin** cannot be deleted or deactivated, and its role cannot be changed.
- **Login is re-checked against the database on every request**, so deactivating a company, role or admin takes effect immediately rather than at token expiry.
- **Uniqueness** (company code and email, admin email, role name per company, menu slug) is enforced in the service layer rather than by unique indexes, because a soft-deleted row would otherwise keep holding the value.

---

## Layout

```
src/
  config/       env loading, Sequelize instance, dialect-aware SQL helpers
  constants/    status, billing cycle, payment mode, permission actions
  models/       14 Sequelize models + all associations
  validators/   Joi schemas (create and update kept separate — see the note in master.validator.js)
  services/     tenant provisioning, subscription activation, code/invoice generation
  controllers/  one per resource, plus a CRUD factory shared by the four masters
  routes/       route tables; branch routes are mounted under both portals
  middlewares/  auth + scope + permission, Joi validation, error normalisation
  seeders/      boot-time bootstrap (root super admin, system menus, reference data)
  scripts/      standalone db:sync / db:seed entry points
docs/schema.dbml   full schema, paste into dbdiagram.io
```
