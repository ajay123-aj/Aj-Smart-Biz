# Websites

Tenant-facing public websites, one folder per **business type**. A company's
business type (`business_types` in the API) decides which template it is served,
and the domain it is served on decides *which company* the template renders —
resolved at launch through the same public API the admin console already uses.

```
websites/
├── informational/          Brochure sites — who the company is, what it does
│   └── white-theme/        Next.js · white theme · single page
└── commercial/             Transactional sites — catalogue, enquiries, orders
```

More business types get their own folder alongside these two as they are built.
Each template inside a business type is a self-contained app with its own
`package.json`, so they are deployed and versioned independently.

## How a site knows which company it is

Every template resolves its tenant the same way, and none of them is told at
build time who it belongs to:

1. The request arrives on the company's domain.
2. The app reads that host (`X-Forwarded-Host` behind a proxy, otherwise `Host`),
   with `?domain=` overriding it for local previews.
3. It calls `GET /api/v1/public/company-details?domain=<host>` — unauthenticated.
4. The API matches the host against `company_domain` (which may pin a **branch**,
   so `surat.acme.com` and `acme.com` can differ), falling back to matching the
   leading label against `companies.code`.
5. An unknown or inactive tenant gets platform defaults back rather than an
   error, so the site always renders.

One domain, one company, no per-tenant build.

**The API lives in the backend.** `/public/company-details` is defined in
`Aj-Smart-Biz-Backend/src/controllers/public.controller.js`, next to the
`/public/branding` endpoint the admin consoles use, and shares its host resolver.
The websites contain no API of their own — they only call it. Adding a field a
site needs means adding it there, once, for every template.

It answers with the company's public profile and nothing more: name, legal name,
tagline, logo, favicon, theme, business type, contact details, address, locale,
the pinned branch, the head office, every active branch, and the hero slides the
company manages in **Slider Management** — already ordered and already resolved
branch-wise. No GST or PAN number, no plan, subscription or admin data.

## Ports

| App | Port |
| --- | --- |
| `informational/white-theme` | 4400 |

Kept clear of the API (4000) and the two consoles (4200, 4300).

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
