# Websites

Tenant-facing public websites, one folder per **business type**. A company's
business type (`business_types` in the API) decides which template it is served,
and the domain it is served on decides *which company* the template renders —
resolved at launch through the same public API the admin console already uses.

```
websites/
├── informational/          Brochure sites — who the company is, what it does
│   └── white-theme/        Next.js · white theme · single page
├── salon/                  Salons, studios and spas — treatment menu and diary
│   └── black-theme/        Next.js · black theme · menu, shop, journal
└── commercial/             Transactional sites — catalogue, enquiries, orders
    └── decor-framing/      Next.js · Gilt theme · framing, shop, journal
```

More business types get their own folder alongside these as they are built.
Each template inside a business type is a self-contained app with its own
`package.json`, so they are deployed and versioned independently.

A second **theme** is a sibling folder too, never a flag inside an existing one.
`salon/black-theme` is `informational/white-theme` with its surfaces inverted —
same components, same API calls, a different palette — and it is a separate app
precisely so neither can break the other. See its
[README](salon/black-theme/README.md) for what actually differs.

`commercial/decor-framing` goes further: same components and same API calls
again, but a different **design language** rather than a repaint — blurred white
glass on a fixed gradient ground, generous radii, brass as the only accent, and a
hero that is an inset dark stage instead of a band. Its
[README](commercial/decor-framing/README.md) sets the three of them side by
side.

## How a site knows which company it is

Every template resolves its tenant the same way, and none of them is told at
build time who it belongs to:

1. The request arrives on the company's domain.
2. The app reads that host (`X-Forwarded-Host` behind a proxy, otherwise `Host`),
   with `?domain=` overriding it for local previews.
3. It calls `GET /api/v1/website/company-details?domain=<host>` — unauthenticated.
4. The API matches the host against `company_domain` (which may pin a **branch**,
   so `surat.acme.com` and `acme.com` can differ), falling back to matching the
   leading label against `companies.code`.
5. An unknown or inactive tenant gets platform defaults back rather than an
   error, so the site always renders.

The full order `middleware.ts` applies is `?domain=` → `X-Forwarded-Host` →
`Host` → `TENANT_DOMAIN` → the cookie a previous `?domain=` left behind.

**`TENANT_DOMAIN` is a fallback, not a pin.** It used to outrank the real host,
on the reasoning that a dev tunnel's host names no tenant — which holds right up
until somebody registers that tunnel host as a domain. Then the row is added,
the site quietly keeps serving whatever `TENANT_DOMAIN` says, and nothing
reports a problem. One deployment serving many domains is the product; pinning a
deployment to one tenant is the local-development convenience, and the
convenience cannot outrank the product. A bare `localhost` is treated as naming
no tenant, so `npm run dev` still resolves the tenant it is configured for.

One domain, one company, no per-tenant build.

**The API lives in the backend.** `/website/company-details` is defined in
`Aj-Smart-Biz-Backend/src/controllers/public.controller.js`, next to the
`/website/branding` endpoint the admin consoles use, and shares its host resolver.
The websites contain no API of their own — they only call it. Adding a field a
site needs means adding it there, once, for every template.

It answers with the company's public profile and nothing more: name, legal name,
tagline, logo, favicon, theme, business type, contact details, address, locale,
the pinned branch, the head office, every active branch, and the hero slides the
company manages in **Slider Management** — already ordered and already resolved
branch-wise. No GST or PAN number, no plan, subscription or admin data.

## Running a template

| Command | What it does |
| --- | --- |
| `npm run dev` | Development. Watches files — use this while editing. |
| `npm run preview` | `build` then `start`. Use this to look at a production build. |
| `npm start` | Serves the **existing** `.next` build. Does **not** rebuild. |

> **`npm start` serves a snapshot.** `next start` loads the build that exists
> when it boots and never looks at your source again, so editing a component
> and reloading the page shows nothing — the API data changes, the markup does
> not. That is `npm run preview`'s whole reason for existing. In development,
> `npm run dev` avoids the problem entirely.

## Ports

| App | Port |
| --- | --- |
| `informational/white-theme` | 4400 |
| `salon/black-theme` | 4500 |
| `commercial/decor-framing` | 4600 |

Kept clear of the API (4000) and the two consoles (4200, 4300).

A port is not what separates two tenants, so two sites on one machine need two
**hosts** as well: the API's resolver strips the port before it matches, which
makes `localhost:4400` and `localhost:4500` the same host. Give each its own
label — `localhost`, `salon.localhost`, `decor.localhost` — in `company_domain`
and in each site's `TENANT_DOMAIN`. Browsers resolve `*.localhost` to the loopback with no
hosts-file entry.

## Serving a site from somewhere other than localhost

A tunnel (`*.devtunnels.ms`, ngrok), a phone on the LAN, or any real deployment
all have the same requirement: **nothing the browser is given may point at
`localhost`**, because there `localhost` is the visitor's own machine.

Templates therefore render company logos and favicons as relative `/uploads/...`
paths and proxy them to the API, so images ride on whatever host the visitor
used. `API_URL` — the server's own route to the API — stays absolute and is read
at runtime.

The tenant still has to be reachable by that host. Either map it in the admin's
**Domain manager** (`company_domain`), which is the real answer, or pin the
deployment with `TENANT_DOMAIN=<a mapped domain>` for a quick preview.
