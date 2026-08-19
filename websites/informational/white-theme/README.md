# Informational · White theme

A single-page brochure website on a white surface. It is **not** built per
tenant: the same deployment serves every informational company, and works out
which one it is from the domain the request arrived on.

- Next.js 15 (App Router) · React 19 · TypeScript
- Plain CSS with CSS Modules — no UI framework, no CSS build step beyond Next's
- Header · hero slider · about · services · why us · contact · footer
- The hero slider is **content the company owns** — see below

## Run it

```bash
npm install
cp .env.example .env.local     # already present after the first checkout
npm run dev                    # http://localhost:4400
```

The API (`Aj-Smart-Biz-Backend`, port 4000) should be running. It does not have
to be — the site renders with platform defaults if the call fails — but nothing
will be branded.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on 4400 |
| `npm run build` | Production build |
| `npm start` | Serve the production build on 4400 |
| `npm run typecheck` | `tsc --noEmit` |

## Company details at launch

[`src/lib/company.server.ts`](src/lib/company.server.ts) calls
`GET /api/v1/public/company-details?domain=<host>`. **That endpoint lives in the
backend**, in `Aj-Smart-Biz-Backend/src/controllers/public.controller.js` — this
site defines no API of its own, it only calls one.

The call happens once, in [`src/app/layout.tsx`](src/app/layout.tsx), before
anything is sent to the browser:

```
request on acme.com
  → middleware.ts            ?domain= → cookie → X-Forwarded-Host → Host → TENANT_DOMAIN
  → GET /public/company-details?domain=acme.com
  → { resolved, name, legalName, description, logo, favicon, theme,
      businessType, contact, address, locale, branch, headOffice, branches,
      sliders }
  → layout: tab title, favicon, --brand variables
  → header, slider, sections, footer all read that one result
```

`generateMetadata` calls the same function; Next dedupes the two `fetch`es
within a request, so the API is hit **once per page render**.

The call is `cache: 'no-store'` on purpose. Next's default is to write the
response into `.next/cache` and go on serving it — across restarts and deploys —
which for tenant branding means a company that changes its logo or name in the
admin keeps seeing the old one, and a response captured against one database can
be replayed against another. Branding must be live, so it is fetched every
render, exactly as the admin's login screen does.

If the API is unreachable the site falls back to platform defaults rather than
failing to render — an informational page has to paint either way.

### Which domain the site asks about

[`src/middleware.ts`](src/middleware.ts) decides, in the same order as
`BrandingService.resolveHost()` in the admin console:

1. `?domain=` on the URL — and it is **remembered** afterwards, so it survives
   navigation (the admin keeps it in sessionStorage; a cookie is the
   server-rendered equivalent),
2. that cookie,
3. `X-Forwarded-Host` — the browser's real host, behind a proxy,
4. `Host`,
5. `TENANT_DOMAIN` from `.env.local`, for local work where none of the above
   names a tenant.

A real host always beats a remembered override, so pointing a new domain at the
site never serves whatever tenant was last previewed in that browser.

So `http://localhost:4400/?domain=acme.com` previews a tenant exactly the way
`http://localhost:4300/?domain=acme.com` does on the admin login screen.

### What the endpoint returns — and what it does not

Everything a company publishes about itself: name, legal name, tagline, logo,
favicon, theme, business type, email, phone, alternate phone, website, address,
currency, timezone, the branch this domain is pinned to, the head office and
every active branch.

It returns **no** GST or PAN number, no plan, subscription, transaction or admin
data and no counts — it is public and unauthenticated. An unknown *or inactive*
tenant gets platform defaults rather than an error, so it cannot be walked to
enumerate tenants.

`branch` is the pinned branch and nothing else — null on a company-wide host — so
the header can tell "this domain is the Surat branch" from "this is the company".
`headOffice` is always there to fall back on. [`src/lib/contact.ts`](src/lib/contact.ts)
applies that order: company field → branch → head office → the placeholders in
[`src/config/site.ts`](src/config/site.ts), which appear only when a host
resolved to no tenant at all.

## The hero slider

Slides come from the API, not from this repo. A company edits them in the
admin's **Slider Management**; `/public/company-details` returns the active ones
for the requested host, already ordered and already resolved branch-wise — a
branch-pinned domain gets that branch's slides, falling back to the company-wide
ones when it has none of its own.

[`Slider.tsx`](src/components/Slider.tsx) renders whatever comes back, and falls
back to the template copy in [`site.ts`](src/config/site.ts) only when there is
nothing to render: a host that matched no tenant, or a tenant whose slides are
all deactivated. The hero is the first thing on the page, so it is never empty.

Per slide the API supplies an eyebrow, title, subtitle, up to two background
artworks and an optional button (which appears only when it has both a label and
a link).

The artworks are rendered as a `<picture>`: `mobileImage` is offered under
`max-width: 640px` and `image` is the `<img>` fallback, so the browser chooses
one and fetches only that — a phone never downloads the desktop file. A slide
with no `mobileImage` reuses the desktop artwork; one with no artwork at all sits
on the plain white hero.

Over an image the hero lays a white scrim, because the copy is dark text on a
light theme and has to stay readable over a busy photograph. It is weighted to
the **left** on desktop, where the copy sits beside the picture, and to the
**top** on a phone, where it sits above it — a flat wash strong enough for the
headline would erase the artwork a company deliberately uploaded.

## When the plan has lapsed

`company.service.active` says whether the platform is still serving this tenant.
When it is false, [`page.tsx`](src/app/page.tsx) returns
[`PlanNotice`](src/components/PlanNotice.tsx) and nothing else, and
[`layout.tsx`](src/app/layout.tsx) drops the header, footer and skip link.

Both halves matter. Hiding the content in the layout alone would still render the
page into the streamed RSC payload, where the whole site stays readable to anyone
who looks at the response — so the page has to decline to render it and the
layout has to decline to frame it. The layout also adds `noindex, nofollow`, so a
temporary lapse cannot become the company's search result.

Copy lives in `PLAN_NOTICE` in [`src/config/site.ts`](src/config/site.ts), one
block per reason (`expired`, `suspended`, `no_plan`) plus the renew link, and
`{company}` is filled in at render time. Only genuine contact details are printed
here — unlike the live site's footer, this page never falls back to the
template's placeholders, because it is read by the company's own customers.

If the API is unreachable the site stays **served**: a holding page is for a plan
the platform actually stopped, not for a network blip.

## Logos and favicons

Company images are stored as paths (`/uploads/company/logo.png`) and served by
the API. The site renders them **relative**, and Next proxies `/uploads/*` to the
API (see `rewrites` in [next.config.ts](next.config.ts)).

That indirection is the point. Handing the browser
`http://localhost:4000/uploads/...` only works when the browser is on the same
machine as the API — it breaks the moment the site is reached over a dev tunnel,
from a phone on the LAN, or from anywhere in production, because `localhost`
then means the *visitor's* machine and the logo silently fails to load. Proxying
keeps every image on whatever host the visitor actually used.

Set `NEXT_PUBLIC_FILES_URL` only when uploads are served from their own public
origin, such as a CDN.

## Configuration: what is read when

| Variable | Read | Notes |
| --- | --- | --- |
| `API_URL` | **runtime** | Where the server reaches the API. Must be absolute. Change and restart — no rebuild. |
| `TENANT_DOMAIN` | **runtime** | Pins this deployment to one tenant. |
| `BACKEND_ORIGIN` | build | Uploads proxy target. Defaults to the origin of `API_URL` at build time. |
| `NEXT_PUBLIC_FILES_URL` | build | Inlined into the bundle, because client components use it. |

Anything named `NEXT_PUBLIC_*` is **inlined when the app is built** — setting it
at `next start` does nothing. That is why `API_URL` deliberately does not carry
that prefix: the browser never calls the API, so there is no reason to bake the
address in.

## Theming

The white surfaces are fixed — that is what makes this the white theme. The
company's theme only replaces the accent:

| Variable | Source |
| --- | --- |
| `--brand` | `theme.primaryColor` |
| `--brand-strong` | `theme.secondaryColor` |
| `--brand-soft` | `theme.accentColor` at 10% |

A company with no theme keeps the default blue.

## Content

Everything the API does not supply — nav labels, slides, services, stats,
contact placeholders — lives in [`src/config/site.ts`](src/config/site.ts).
Slide copy may use `{company}` and `{tagline}`, filled in from the resolved
tenant at render time.

## Layout

```
src/
├── app/
│   ├── layout.tsx        Launch-time company call, metadata, theme vars, chrome
│   ├── page.tsx          The single page — slider + four sections
│   ├── page.module.css
│   └── globals.css       White theme tokens and shared primitives
├── components/
│   ├── Header.tsx        Sticky header, tenant logo, mobile sheet
│   ├── Slider.tsx        Auto-advancing hero, pauses on interaction
│   └── Footer.tsx        Company block, links, contact
├── config/site.ts        Copy the API does not own
├── lib/
│   ├── company.ts        Response types + formatting helpers (client-safe)
│   ├── company.server.ts The call to the backend's company-details endpoint
│   └── contact.ts        company → branch → head office → placeholder
└── middleware.ts         Which domain this request is for
```
