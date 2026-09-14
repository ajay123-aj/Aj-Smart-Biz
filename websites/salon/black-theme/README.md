# Salon · Black theme

A salon website on a near-black surface. It is **not** built per tenant: the
same deployment serves every Salon & Spa company, and works out which one it is
from the domain the request arrived on.

- Next.js 15 (App Router) · React 19 · TypeScript
- Plain CSS with CSS Modules — no UI framework, no CSS build step beyond Next's
- Home · menu · shop · journal · about · contact, plus a page per service,
  product, category and article
- Every word and every price on it comes from the API — see
  [What is in the database](#what-is-in-the-database)

## What this is, next to the white theme

The same template with its surfaces inverted. It was copied from
[`../../informational/white-theme`](../../informational/white-theme) and not
forked from it: same components, same `lib/`, same API calls, same middleware.
Everything that differs is colour, and almost all of the colour is in one file.

| | White theme | Black theme |
| --- | --- | --- |
| Ground | warm cream (`#f2f0ec`) | near-black (`#09090b`) |
| Panels | white at 72% over cream | **white at 4%** over near-black |
| Brand role | dark charcoal button, white type | light gold button, near-black type |
| Hero scrim over a photo | white, weighted left | **black**, same stops, same angle |
| Semantic reds and greens | dark enough to read on white | lifted to read on black |

The alpha changes; the colour does not. That is why the glass surfaces and
hairlines throughout the module stylesheets are still `rgba(255, 255, 255, …)` —
white at 4% over black is the same trick as white at 72% over cream.

Three things needed real decisions rather than a value swap, and each carries
its reasoning in the file that makes it:

- **`--brand-contrast` flips to near-black.** On a dark ground the brand colour
  has to be the *lighter* of the pair or a filled button stops reading as an
  action. Every button on the site already read this token, so flipping it was
  the whole change — see [`globals.css`](src/app/globals.css).
- **The hero scrim goes black** — [`Slider.module.css`](src/components/Slider.module.css).
  A scrim separates the copy from the picture, so it has to be the ground's
  colour. White here would have erased both.
- **`color-scheme: dark` on `<html>`.** Without it a dark page gets a white
  scrollbar and white native form controls.

[`StatsGrid.module.css`](src/components/StatsGrid.module.css) needed **nothing**,
because it already read on tokens rather than literals. That is the standard the
rest of the theme is held to.

## Run it

```bash
npm install
cp .env.example .env.local     # already present after the first checkout
npm run dev                    # http://localhost:4500
```

The API (`Aj-Smart-Biz-Backend`, port 4000) should be running, and the tenant
should be seeded — see below. The site renders with platform defaults if the
call fails, but nothing will be branded.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on 4500 |
| `npm run build` | Production build |
| `npm start` | Serve the **existing** production build on 4500 — does not rebuild |
| `npm run preview` | `build` then `start` |
| `npm run typecheck` | `tsc --noEmit` |

> **`npm start` serves a snapshot.** `next start` loads the build that exists
> when it boots and never looks at your source again, so editing a component and
> reloading shows nothing — the API data changes, the markup does not. Use
> `npm run dev` while editing, `npm run preview` to look at a production build.

## What is in the database

Nothing this site shows is written into this repository. Seed the tenant it was
built against with:

```bash
cd ../../../Aj-Smart-Biz-Backend
npm run db:seed:salon
```

That writes **Aj Salon** and everything on its website as ordinary rows, through
the same models and the same `createCompany` service the super-admin console
writes through:

| | Rows |
| --- | --- |
| Business type | `Salon & Spa` — what decides this tenant is served this template |
| Theme | `Aj Midnight` — gold on black, `mode: dark` |
| Plan & subscription | `Salon Complete`, active, granting every functionality |
| Domain | `salon.localhost`, primary |
| Service menu | 7 categories, 21 services — durations, slot capacities, offers |
| Retail shelf | 6 top-level categories (16 with children), 25 products |
| Sections | about, contact page, 4 figures, 6 benefits, 5 team, 8 gallery, 6 reviews |
| Journal | 4 articles — 3 published, 1 dated ahead |
| WhatsApp | 3 numbers: front desk, bookings, retail counter |

It is idempotent: re-running adds whatever is missing and leaves everything
else — including anything edited in the admin — alone.

The seeder is **data only**. It adds no endpoint, changes no controller, model,
route or service, and touches neither console.

## Company details at launch

[`src/lib/company.server.ts`](src/lib/company.server.ts) calls
`GET /api/v1/website/company-details?domain=<host>`. **That endpoint lives in the
backend**, in `Aj-Smart-Biz-Backend/src/controllers/public.controller.js` — this
site defines no API of its own, it only calls one.

The call happens once, in [`src/app/layout.tsx`](src/app/layout.tsx), before
anything is sent to the browser:

```
request on salon.localhost
  → middleware.ts            ?domain= → cookie → X-Forwarded-Host → Host → TENANT_DOMAIN
  → GET /website/company-details?domain=salon.localhost
  → { resolved, name, logo, favicon, theme, businessType, contact, address,
      locale, branch, branches, sliders, features, contactPage, nav, service }
  → layout: tab title, favicon, --brand variables
  → header, slider, every section and the footer read that one result
```

`generateMetadata` calls the same function; Next dedupes the two `fetch`es
within a request, so the API is hit **once per page render**. The call is
`cache: 'no-store'` on purpose — branding and prices have to be live, so a
company that changes either in the admin sees it on the next page load.

### Which domain the site asks about

[`src/middleware.ts`](src/middleware.ts) decides, in order: `?domain=` on the
URL (remembered afterwards in a cookie), that cookie, `X-Forwarded-Host`,
`Host`, then `TENANT_DOMAIN` from `.env.local`. A real host always beats a
remembered override.

`TENANT_DOMAIN=salon.localhost` is set in `.env.local` for local work, and it
has to be a label in front of `localhost` rather than `localhost` itself: **the
host resolver strips the port** before matching, so `localhost:4400` and
`localhost:4500` are the same host and could not name two different companies.
Every browser resolves `*.localhost` to the loopback with no hosts-file entry,
so `http://salon.localhost:4500` works as it stands.

`http://localhost:4500/?domain=salon.localhost` previews the same tenant without
touching `.env.local`.

## Theming

The near-black surfaces are fixed — that is what makes this the black theme. The
company's theme only replaces the accent:

| Variable | Source |
| --- | --- |
| `--brand` | `theme.primaryColor` — the *lighter* of the pair here |
| `--brand-strong` | `theme.secondaryColor` — lighter still, for hover |
| `--accent` | `theme.accentColor` — eyebrows and hairlines |

A company with no theme keeps the gold in [`globals.css`](src/app/globals.css).

A theme whose `primaryColor` is dark will produce a dark button with dark type
on it, because `--brand-contrast` is fixed by the template rather than sent by
the API. That is the same constraint the white theme has in reverse, and the
reason `Aj Midnight` exists as a theme row rather than the tenant being left on
`Aj Default`.

## Configuration: what is read when

| Variable | Read | Notes |
| --- | --- | --- |
| `API_URL` | **runtime** | Where the server reaches the API. Must be absolute. Change and restart — no rebuild. |
| `TENANT_DOMAIN` | **runtime** | Pins this deployment to one tenant. |
| `BACKEND_ORIGIN` | build | Uploads proxy target. Defaults to the origin of `API_URL` at build time. |
| `NEXT_PUBLIC_FILES_URL` | build | Inlined into the bundle, because client components use it. |

Anything named `NEXT_PUBLIC_*` is **inlined when the app is built** — setting it
at `next start` does nothing. `API_URL` deliberately does not carry that prefix:
the browser never calls the API, so there is no reason to bake the address in.

## Logos and images

Company images are stored as paths (`/uploads/company/logo.png`) and served by
the API. The site renders them **relative**, and Next proxies `/uploads/*` to the
API (see `rewrites` in [next.config.ts](next.config.ts)), so every image rides on
whatever host the visitor actually used — which is the only thing that works over
a dev tunnel, from a phone on the LAN, or in production.

The seeder writes generated `seed-*.svg` placeholders for cards and thumbnails,
labelled as samples. It deliberately writes **none for the hero**: a pale
rectangle is a plausible unreplaced thumbnail in a card and a broken dark theme
behind a headline, so a seeded slide has no artwork and sits on the template's
own wash until the salon uploads one.

## When the plan has lapsed

`company.service.active` says whether the platform is still serving this tenant.
When it is false, [`page.tsx`](src/app/page.tsx) returns
[`PlanNotice`](src/components/PlanNotice.tsx) and nothing else, and
[`layout.tsx`](src/app/layout.tsx) drops the header, footer and skip link.

Both halves matter: hiding the content in the layout alone would still render the
page into the streamed RSC payload, where the whole site stays readable to anyone
who looks. The layout also adds `noindex, nofollow`, so a temporary lapse cannot
become the company's search result.

## Layout

```
src/
├── app/
│   ├── layout.tsx        Launch-time company call, metadata, theme vars, chrome
│   ├── page.tsx          Home — slider and every band the tenant publishes
│   ├── globals.css       Black theme tokens and shared primitives
│   ├── services/         The menu, and a page per service
│   ├── products/         The shelf, and a page per product
│   ├── blog/             The journal, and a page per article
│   ├── about/ contact/   Pages the tenant writes in the admin
│   └── offers/ categories/
├── components/           Header, Slider, sections, cart, booking, footer
├── config/site.ts        The only copy the API does not own — fallbacks for an
│                         unresolved host
├── lib/                  The API calls and the types they return
└── middleware.ts         Which domain this request is for
```
