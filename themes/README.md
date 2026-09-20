# Themes

The **tenant site templates** — one folder per *look*, flat. A company's theme
decides which of these it is served, and the domain it is served on decides
*which company* the template renders — resolved at launch through the same
public API the admin console already uses.

```
themes/
├── default/     Light, airy. The one a tenant gets unless it picks otherwise.
├── midnight/    Near-black surfaces. `default` with its surfaces inverted.
└── atelier/     Blurred white glass on a gradient ground, brass accents.
```

> **These used to be filed under business type** — `informational/white-theme`,
> `salon/black-theme`, `commercial/decor-framing` — and that turned out to be
> the wrong axis. A theme is a *look*, and a look is not the property of a
> trade: a salon that wants the light theme and a framing workshop that wants
> the dark one were both fighting the folder they were in. The templates
> themselves never depended on it — every one of them renders whatever the API
> sends, whatever the tenant's business type is — so flattening cost nothing
> and removed a category that was making a promise the code did not keep.

The platform's own site — the one that *sells* this — is a separate project at
[`Aj-Smart-Biz-Technology/`](../Aj-Smart-Biz-Technology/), and it is
deliberately not one of these: it has no tenant, resolves no host, and is
nobody's theme.

## The three

| Theme | Port | Package | Surface |
| --- | --- | --- | --- |
| [`default/`](default) | 4400 | `aj-smart-biz-theme-default` | Light. Header, hero slider, sections, footer. |
| [`midnight/`](midnight) | 4500 | `aj-smart-biz-theme-midnight` | Near-black. Home, services, shop, journal, about, contact. |
| [`atelier/`](atelier) | 4600 | `aj-smart-biz-theme-atelier` | Blurred white glass on a fixed gradient, brass as the only accent, hero as an inset dark stage. |

`midnight` is `default` with its surfaces inverted — same components, same API
calls, a different palette. `atelier` goes further: same components and API
calls again, but a different **design language** rather than a repaint. Each is
a separate app precisely so none of them can break the others.

Every template is self-contained — its own `package.json`, its own port, its own
Dockerfile — so they are built, versioned and deployed independently. A fourth
theme is a fourth folder here, never a flag inside an existing one.

## What they all share

- **No per-tenant build.** One image serves every company on that theme.
- **The tenant is resolved at request time** from the host, through
  `GET /theme/company-details?domain=<host>` — see each template's
  `lib/company.server.ts`.
- **`API_URL` is a server-only variable.** It is deliberately not a
  `NEXT_PUBLIC_` name: a value inlined into the browser bundle would point at
  whatever machine the *visitor* is on.
- **Nothing is hard-coded per company.** Colours, copy, menu, sections and
  contact details all arrive from the API.

## Tenants to develop against

Each is seeded as **rows**, not as anything in these folders — point the same
deployment at another company's domain and it renders that company instead.

```bash
cd Aj-Smart-Biz-Backend
npm run db:seed:salon    # Aj Salon        → salon.localhost:4500
npm run db:seed:decor    # a framing shop  → decor.localhost:4600
```
