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
4. seed the seven system menus, a few Indian states, business types and a default theme.

```
npm start              # NODE_ENV=production, reads .env.production
npm run db:sync        # sync the schema only  (add --force to drop and recreate)
npm run db:seed        # re-run the idempotent seeders
```

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

## Two portals, one API

Tokens carry a `scope`, so a token from one portal can never be used on the other.

| Scope | Issued by | Reaches |
| --- | --- | --- |
| `super_admin` | `POST /auth/super-admin/login` | `/companies`, `/super-admins`, `/dashboard/super-admin`, master writes |
| `admin` | `POST /auth/admin/login` | `/my-company`, `/roles`, `/menus`, `/admins`, `/dashboard/admin` |

Company admins are additionally gated per menu: every tenant route is wrapped in
`requirePermission('<menu-slug>', '<action>')`, which reads `role_permissions`.
The main admin (`is_company_admin`) bypasses those checks.

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

### Companies — super admin
| Method | Route | Notes |
| --- | --- | --- |
| GET | `/companies` | Filters: `businessTypeId`, `stateId`, `planId`, `subscriptionStatus`; each row carries `activeSubscription` |
| POST | `/companies` | **Provisions the whole tenant in one transaction** — see below |
| GET | `/companies/:id` | Branches + contacts, subscription history, transactions, admins and a `summary` block |
| PUT | `/companies/:id` | |
| PATCH | `/companies/:id/status` | Deactivating blocks every admin of that tenant |
| DELETE | `/companies/:id` | Soft deletes the company *and* its branches, contacts, roles, permissions, admins and tenant menus |
| POST | `/companies/:id/restore` | Restores all of the above |
| GET/POST | `/companies/:id/subscriptions` | List / assign-and-renew a plan |
| POST | `/companies/:id/subscriptions/:subscriptionId/cancel` | |
| GET/POST | `/companies/:id/transactions` | Paginated list / record a manual payment |
| * | `/companies/:companyId/branches…` | Same branch routes as the tenant portal |

`POST /companies` creates, in one transaction: the company → its head-office
branch → the `Company Admin` role with every permission → the main admin login →
optionally an active subscription and a paid transaction. If no password was
supplied for the main admin the API generates one and returns it **once** as
`mainAdminPassword`.

### Super admins — `/super-admins`
`GET /` · `POST /` · `GET /:id` · `PUT /:id` · `PATCH /:id/status` · `PATCH /:id/reset-password` · `DELETE /:id`

The root account cannot be deleted, deactivated or demoted, and nobody can delete or disable themselves.

### Tenant portal
| Method | Route | Menu slug |
| --- | --- | --- |
| GET/PUT | `/my-company` | `company-details` — writes are main-admin only, and `status`/`code`/plan fields are ignored |
| GET | `/my-company/subscriptions`, `/my-company/transactions` | `company-details` |
| * | `/my-company/branches`, `/my-company/branches/:branchId/contacts` | `branch-management` |
| * | `/roles` | `role-management` |
| GET/PUT | `/roles/:roleId/permissions` | `menu-permission` — `PUT` replaces the whole matrix |
| * | `/menus` (+ `/menus/tree`) | `menu-permission` — platform menus are read only for tenants |
| * | `/admins` (+ `PATCH /admins/:id/reset-password`) | `admin-management` |

### Public — `/public`
No token; the login screen calls this before anyone has signed in.

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/public/branding` | Tenant branding for the requesting host |

The tenant is resolved from the request **Host** (`X-Forwarded-Host` behind a
proxy): first an active row in `company_domain`, then the leading label of the
host against `companies.code` — so `acme.ajsmartbiz.com` reaches the company with
code `ACME` even when no domain was configured. `?domain=` overrides the host,
which is how the app previews a tenant on `localhost`.

When the matched domain is pinned to a branch, the response carries that
branch's `logo` and `favicon` (falling back to the company's when the branch has
none) plus a `branch` block — so `surat.acme.com` and `acme.com` can look
different. A deactivated branch falls back to company-wide branding.

Returns only what a login page needs — `name`, `description`, `logo`, `favicon`,
`code`, `branch` and the theme colours — never contact details, GST, plan or
counts. An unknown *or inactive* tenant gets the platform defaults with
`resolved: false` rather than an error, so the endpoint cannot be used to probe
which hosts or tenants exist. It has its own rate limit.

### Company domains — `company_domain`
A company can own several hosts, each optionally pinned to one of its branches
(`sub_company_id`).

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/companies/:companyId/domains` · `/my-company/domains` | List |
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
