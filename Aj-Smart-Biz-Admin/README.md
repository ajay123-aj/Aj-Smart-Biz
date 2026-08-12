# Aj-Smart-Biz-Admin

The company workspace. One admin signs in and only ever sees their own company's
data — the tenant is taken from the token, never from the client. Angular 22,
standalone, zoneless, signal-based.

```bash
npm install
npm start          # http://localhost:4300, talks to http://localhost:4000/api/v1
npm run build      # production bundle in dist/
```

Sign in with the main-admin credentials shown when the super admin created the
company.

### Tenant-branded login screen

Before anyone signs in, the login page calls `GET /public/branding` and the API
resolves the tenant from the **hostname the browser used** — an active row in
`company_domain`, otherwise the leading label of the host against the company
code. It then renders that company's logo, name and description and swaps the
browser tab's favicon and title.

A domain mapped to a **branch** shows that branch's logo and favicon instead, so
each location can have its own login screen. Domains are managed on the
**Domains** tab of Company Details; reading them needs the `company-details`
permission, changing them is main-admin only.

### Setting your own branding

**Company Details → Company profile** carries a *Branding* block: company logo,
favicon (`.ico` only) and description. Saving applies them immediately — the tab
icon, the tab title and the sidebar logo all repaint without a reload, because
the form feeds `BrandingService` straight from the update response.

The same fields exist on the super admin's company form, so a tenant can be set
up centrally and then adjust its own branding afterwards.

### Which logo and favicon win

**On the login screen** — nobody is signed in, so the host decides:

1. the branch a **branch-pinned domain** points at;
2. otherwise the **company**;
3. otherwise the **head office** branch, so a company that only branded its main
   branch still gets a branded login screen;
4. otherwise the **platform mark**.

**After signing in** — the person decides:

1. the admin's **own branch**, so staff at a location see that location's
   branding;
2. otherwise the **company**;
3. otherwise whatever the host had already resolved.

Signing in merges rather than replaces, so a company with no images of its own
keeps what the host resolved instead of dropping back to the platform mark. The
merge only inherits from the cache when the tenant code matches, so one
company's branding can never bleed into another's session on a shared browser.

### Branding on every page

The resolved company — name, description, logo, favicon — is cached in
`localStorage` under `ajsb_ad_company`, and `BrandingService.restore()` applies
it at bootstrap. A hard refresh of any deep link therefore paints the right
favicon and tab title immediately, rather than only after `/auth/me` answers.
Login and every `/auth/me` refresh the cache, so the signed-in company always
wins over whatever the host resolved to.

Tab titles read `Page · Company` ("Admin Management · Acme Retail"). That needs a
`TitleStrategy`: the router sets a route's own title on every navigation, which
would otherwise wipe the company name after the first page. Routes therefore
carry only the page name and `CompanyTitleStrategy` appends the company.

With no company resolved — signed out on an unmapped host — both the favicon and
the title fall back to the Aj Smart Biz platform mark, an inline SVG that needs
no asset file.

On `localhost` there is no tenant subdomain, so append `?domain=acme.ajsmartbiz.com`
to preview a specific tenant; the choice is remembered for the session.

**An unmapped host keeps the last company this browser used.** Resolving to
nothing — `localhost` in development, or a tenant whose domain is not configured
yet — would otherwise blank the login screen of a returning user, so the cached
company is kept rather than replaced with platform branding. Only a genuinely
first-time visitor on an unmapped host sees the neutral Aj Smart Biz screen.

Branding failures never block the form. After sign-in the tab title and favicon
follow the company on the token, whatever host the app was opened from.

---

## Modules

| Route | Menu slug | What it does |
| --- | --- | --- |
| `/dashboard` | `dashboard` | Total admins (active / inactive), branches, roles, current plan with days remaining and a quota usage bar |
| `/company` | `company-details` | Tabbed: **Company profile** (editable by the main admin), **Branches** (add, edit incl. logo/favicon upload, activate/deactivate, delete), **Domains** (map hosts to the company or one of its branches), **Plan & billing** |
| `/company/branches/:id` | `branch-management` | Branch details and its contacts — add, edit, delete, mark primary |
| `/roles` | `role-management` | Role list — create, edit, activate/deactivate, delete; shows how many admins hold each role |
| `/menu-permissions` | `menu-permission` | **Role permissions** grid (view / create / edit / delete / export per menu) and **Menus** CRUD |
| `/admins` | `admin-management` | Admin list — create with a generated password, edit, reset password, activate/deactivate, delete |
| `/profile` | — | Own profile and password change |

### Permissions drive the whole UI

`/auth/me` returns the permission map and the menu list for the signed-in admin.
Those flow into three places:

- **the sidebar** — rendered from the returned menus, so a role only ever sees what it may open;
- **`permissionGuard`** on each route, which bounces a hand-typed URL back to the dashboard;
- **`*appCan`**, a structural directive that hides individual buttons:

```html
<button *appCan="'admin-management'; action: 'canCreate'">＋ Add admin</button>
```

The main admin (`isCompanyAdmin`) bypasses all three. The API enforces the same
rules independently, so hiding a button is a convenience, not the control.

### The permission grid

`/menu-permissions` edits a working copy and only writes on save. Two rules are
applied as you tick boxes, mirroring what the API considers sensible: granting
any action implies **View**, and clearing **View** clears the rest of the row.
The built-in `Company Admin` role is shown read only — it always has full access.

### Where branches live

Branch management is a **tab on Company Details**, not a sidebar entry. The
`branch-management` menu still exists — it is how a role is granted branch
view/create/edit/delete rights in the permission matrix — but it carries no
route, so the sidebar skips it and the tab only appears for roles that may view
it. `/company/branches` redirects to `/company`; the branch detail page (for
contacts) is still its own route.

### Branch branding

The branch add/edit form takes a **logo** and a **favicon**. `ImageUploadComponent`
is a `ControlValueAccessor`, so it binds like any other field:

```html
<app-image-upload formControlName="logo" folder="branch" />
<app-image-upload formControlName="favicon" folder="branch" variant="favicon" />
```

The file uploads the moment it is picked (click or drag-and-drop), with a local
preview shown immediately and a progress bar while it transfers. The control's
value is the returned path, so saving the branch only persists a string.

Abandoned uploads are cleaned up rather than left on disk: replacing or clearing
an image that this session uploaded deletes it, and replacing an image already on
a saved branch is handled by the API when the record updates. Type and size are
checked in the browser for a fast message, and again by the API, which is what
actually enforces them.

### First sign in

An admin created with a generated password carries `mustChangePassword`. A route
guard redirects them to `/profile` until they set a new one, and a banner in the
shell explains why.

---

## Forms

`FieldErrorComponent` renders the first validation message for a control. It
subscribes to `AbstractControl.events` rather than reading `errors`/`touched`
directly inside a `computed` — those are plain properties, not signals, so a
computed over them would cache its first value and the message would never
appear.

Password fields use the `strongPassword` validator from `shared/utils`, which
mirrors the API's rule but reports what is missing ("needs an uppercase letter
and a number") instead of a generic format error.

## Structure

```
src/app/
  core/
    models/       API envelope + domain types, permission action list
    services/     ApiService, AuthService (token + permissions + menus),
                  CompanyService (/my-company), AccessService (roles, menus,
                  permissions, admins), Toast/Confirm/Theme
    interceptors/ bearer token + error-to-message normalisation
    guards/       authGuard (also primes permissions), guestGuard,
                  permissionGuard, passwordChangeGuard
  shared/
    ui/           modal, pager, toast host, confirm dialog, status badge,
                  page header, table state, field error
    can.directive.ts   *appCan
    list-store.ts      paging / search / sort state
    utils.ts           formatting and form helpers
  layout/         shell; the sidebar is built from the API's menu list
  features/       auth, dashboard, company, roles, permissions, admins, profile
```

The `core/`, `shared/ui/` and `styles.scss` layers are shared with
Aj-Smart-Biz-Supper-Admin, so both consoles look and behave alike.

## Configuration

`src/environments/environment.development.ts` points at `http://localhost:4000/api/v1`.
The production file uses a relative `/api/v1`. Both apps keep their session under
separate `localStorage` prefixes (`ajsb_ad_` here, `ajsb_sa_` there), so you can
run them side by side on one machine without one signing the other out.
