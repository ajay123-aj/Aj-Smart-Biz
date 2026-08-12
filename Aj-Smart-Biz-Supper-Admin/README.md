# Aj-Smart-Biz-Supper-Admin

Platform console for Aj Smart Biz. Angular 22 — standalone components, zoneless
change detection, signals and the new `@if` / `@for` control flow throughout.

```bash
npm install
npm start          # http://localhost:4200, talks to http://localhost:4000/api/v1
npm run build      # production bundle in dist/
```

Sign in with the credentials the API prints on its first boot
(`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`).

---

## Modules

| Route | What it does |
| --- | --- |
| `/dashboard` | Total companies (active / inactive / deleted) and total income, plus a 12-month income chart, plan mix, expiring subscriptions, newest companies and latest transactions |
| `/companies` | Searchable, filterable tenant list (business type, plan, status) with plan badge and renewal countdown |
| `/companies/new` | Create a company — profile, address, main admin and starting plan in one form |
| `/companies/:id` | Detail view: **Overview**, **Branches** (add / edit / delete), **Domains** (map hosts, optionally to a branch), **Plan & transactions** (assign or renew a plan, cancel it, record a payment), **Admins** |
| `/companies/:id/edit` | Edit the tenant profile, **login-screen branding** and status |
| `/plans` | Plan CRUD with an inline active/inactive switch, quotas and a feature list |
| `/super-admins` | Platform staff CRUD plus password reset; the root account is protected in the UI |
| `/states`, `/business-types`, `/themes` | Master data CRUD; the theme form has a live palette preview |
| `/profile` | Own profile and password change |

Every list supports debounced search, column sorting, page-size selection and
paging. Every delete is a soft delete and goes through a confirmation dialog.

### Login-screen branding

The company form has a **Login screen branding** section — description, logo and
favicon — and the company's hosts live on its **Domains** tab. Aj-Smart-Biz-Admin
resolves the tenant from the hostname it is opened on and renders exactly these,
so mapping `acme.ajsmartbiz.com` means the login page served from that host shows
Acme's logo, name, description and favicon.

A domain can be pointed at a **branch** instead of the whole company, in which
case that branch's own logo and favicon are served — `surat.acme.com` and
`acme.com` can look different. One domain per company is the primary. Map nothing
at all and the tenant code is still matched against the first part of the host
(`acme.…` finds code `ACME`).

Favicons must be real `.ico` files — the API verifies the bytes, not just the
extension.

### Creating a company

One request provisions the whole tenant: company → head-office branch →
`Company Admin` role with full permissions → main admin login → optional plan and
payment. If the main admin password is left blank the API generates one, and the
UI shows it once in a copyable dialog — that is the only time it is visible.

---

## Structure

```
src/app/
  core/
    models/       API envelope + domain types
    services/     ApiService (unwraps the envelope), AuthService, CompanyService,
                  CrudFactory (one client for all four master tables),
                  ToastService, ConfirmService, ThemeService
    interceptors/ bearer token + error-to-message normalisation
    guards/       authGuard / guestGuard
  shared/
    ui/           modal, pager, toast host, confirm dialog, status badge,
                  page header, table state, field error
    list-store.ts paging / search / sort state for a list screen
    crud-page.ts  list + modal-form controller shared by the master screens
    utils.ts      money and date formatting, form helpers
  layout/         sidebar + topbar shell
  features/       auth, dashboard, companies, plans, super-admins, masters, profile
```

`ListStore` and `CrudPage` are why the four master screens are short: they own
the paging, search, create/edit modal, status toggle and delete flow, so each
screen only declares its table markup and its form.

## Branding

The console is the platform, not a tenant, so it always wears the Aj Smart Biz
mark. `BrandingService.apply()` runs at bootstrap and sets the favicon on every
page, login screen included — an inline SVG, so there is no asset to ship. Its
accent differs from the tenant console's, which makes the two obvious apart in a
row of browser tabs.

## Styling

One global stylesheet (`src/styles.scss`) holds the design tokens and the
primitives (buttons, forms, tables, cards, modals, badges). Colours are CSS
custom properties, so the dark theme behind the topbar toggle is a token swap and
nothing else. Components add only their own layout on top.

## Configuration

`src/environments/environment.development.ts` points at `http://localhost:4000/api/v1`.
The production file uses a relative `/api/v1`, which assumes the API is served
from the same origin (reverse proxy). Change `apiUrl` there if it is not.
