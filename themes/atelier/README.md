# Commercial · Decor & Framing (Gilt theme)

A framing and home-decor website: glass panels floating on a warm gradient
ground, with brass as the only accent. It is **not** built per tenant: the same
deployment serves every Home Decor & Framing company, and works out which one it
is from the domain the request arrived on.

> **This used to be the Atelier theme** — mount board, square corners, `3px
> double` rules and a display serif. That design was replaced wholesale; the
> components, the markup, the `lib/` and the API calls are untouched, and only
> the stylesheets changed. Where a note below explains why something is the way
> it is, it usually says what the Atelier version did and why this one does not.

- Next.js 15 (App Router) · React 19 · TypeScript
- Plain CSS with CSS Modules — no UI framework, no CSS build step beyond Next's
- Home · framing · shop · journal · about · contact, plus a page per service,
  product, category and article
- Every word and every price on it comes from the API — see
  [What is in the database](#what-is-in-the-database)

## What this is, next to the other two themes

`default` and `midnight` are one design with its
surfaces inverted. This is a **third design** on the same machinery: the
components, the `lib/`, the API calls and the middleware were copied from the
black theme and not forked from it, and what changed is the design language
laid over them.

| | White theme | Black theme | **Gilt** |
| --- | --- | --- | --- |
| Ground | warm cream | near-black | **a fixed gradient wash** — gold and brand blooms over white→stone |
| Panels | white at 72% over cream | white at 4% over near-black | **blurred white glass**, 78%→50% down a 155° gradient |
| Corners | `1.5rem` | `1.5rem` | **`1.35rem` card · `1.75rem` panel · pill on anything you press** |
| Buttons | pills | pills | **pills, sentence case**, plus one gold gradient |
| Headings | grotesque, 800 | grotesque, 800 | **grotesque, 800** — no display face at all |
| Separators | one hairline | one hairline | **none** — a panel edge and a shadow do the work |
| Card on hover | fill lightens | glass brightens | **it rises 6px and its shadow grows** |
| Hero artwork | bleeds to the edge | bleeds to the edge | **an inset rounded card, white copy on a dark scrim** |
| Band texture | — | grid + radial glow | **a gold bloom off the top-right corner of the panel** |
| Full-bleed elements | header, bands, footer | header, bands, footer | **the footer, and nothing else** |

Four decisions carry the rest, and each carries its reasoning in the file that
makes it:

- **The page has a ground, and things float on it** —
  [`globals.css`](src/app/globals.css). `body` is a fixed wash: a gold bloom off
  the top-left, a colder brand bloom off the top-right, over a white-to-stone
  gradient. `background-attachment: fixed` is load-bearing — scroll a page of
  glass over a wash that scrolls with it and nothing behind the glass ever
  changes, which is the whole effect gone. Everything above it is `--glass` and
  `--glass-blur`, named once and read everywhere.
- **Corners are generous, and pressable things are pills.** `--radius-sm`,
  `--radius` and `--radius-lg` are the tile, card and panel radii;
  `--radius-pill` is stated separately so a button can never be re-cornered by a
  change to the tile radius. Every card, button, badge and chip in the template
  already read those tokens, so the shape change was mostly four values.
- **The hero is a dark stage** —
  [`Slider.module.css`](src/components/Slider.module.css). An inset rounded card
  with the artwork bled to its edges, a left-to-right black scrim, white copy and
  a slow Ken Burns push. It is the one place a global class is overridden
  wholesale: `.eyebrow`, `.btn--primary` and `.btn--ghost` are all defined for a
  light ground and all restated at the bottom of that file, because a slide comes
  from the API and does not know what it is sitting on. Product photographs get
  the tile treatment instead in
  [`ProductCard.module.css`](src/components/ProductCard.module.css) — a rounded
  picture held off the card edge by a margin, concentric with the card around it.
- **Gold is the only accent, and it is never a surface.** `--accent` sets
  eyebrows, the `.btn--gold` gradient, the active slide marker, the offer badge
  and the footer column headings. It is never a page background and never body
  text: at 4.5:1 on white it is not a colour anyone can read a paragraph in, and
  keeping it to decoration is what makes it look like metal.

Two more things worth knowing before editing a stylesheet here:

- **`--panel`, `--panel-hover` and `--hairline` *are* the card.** Seven modules
  build their card out of those three tokens and nothing else, which is why the
  card could change material without any of them being touched — the tokens now
  resolve to glass. Each of those modules pairs them with `backdrop-filter`,
  which cannot live in a custom property because it has to be declared on the
  element that does the blurring.
- **Brand-tinted shadows use `color-mix`, never `rgba()` on a hard-coded
  triplet.** A tenant overriding `--brand` in the layout then gets shadows in
  their own colour for free, where a triplet would have left every page casting
  the default charcoal.

### The one full-bleed element

The footer. Everything above it floats, and a page of floating things has to land
on something or it simply stops — so the footer is a charcoal slab running edge
to edge, and it is the only surface in the template that reads as ground rather
than as glass. That is also why it restates its own type colours as literal
alphas on white: every colour token here is written for dark text on a light
surface, and the alternative was a second inverted set that exactly one element
reads.

### `--header-stack`

The header floats clear of the top edge, so it occupies `--header-height` **plus**
`--header-gap`. Anything that pins itself under the header — the catalogue
filter, the services filter, the product summary, the About index rail — must
clear the sum, and `--header-stack` is that sum. Using `--header-height` there
leaves the element tucked 14px beneath the bar, which is exactly the kind of bug
that only shows up once somebody scrolls.

## Run it

```bash
npm install
cp .env.example .env.local     # already present after the first checkout
npm run dev                    # http://localhost:4600
```

The API (`Aj-Smart-Biz-Backend`, port 4000) should be running, and the tenant
should be seeded — see below. The site renders with platform defaults if the
call fails, but nothing will be branded.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on 4600 |
| `npm run build` | Production build |
| `npm start` | Serve the **existing** production build on 4600 — does not rebuild |
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
npm run db:seed:decor
```

That writes **AJ Home Decor & Framings** and everything on its website as
ordinary rows, through the same models and the same `createCompany` service the
super-admin console writes through:

| | Rows |
| --- | --- |
| Business type | `Home Decor & Framing` — what decides this tenant is served this template |
| Theme | `Aj Atelier` — walnut on board, `mode: light` |
| Plan & subscription | `Decor Complete`, active, granting every functionality |
| Domain | `decor.localhost`, primary |
| Price list | 7 service categories, 21 services — durations, slot capacities, offers |
| Shop | 7 top-level categories (19 with children, three deep), 25 products |
| Sections | about, contact page, 4 figures, 6 benefits, 5 team, 8 gallery, 6 reviews |
| Journal | 4 articles — 3 published, 1 dated ahead |
| WhatsApp | 3 numbers: the shop, quotes & site visits, shop orders |

It is idempotent: re-running adds whatever is missing and leaves everything
else — including anything edited in the admin — alone.

The seeder is **data only**. It adds no endpoint, changes no controller, model,
route or service, and touches neither console.

Read it beside [`seedSalon.js`](../../../Aj-Smart-Biz-Backend/src/scripts/seedSalon.js).
The two are deliberately the same script with different rows in it; where this
one differs it is because the business differs — a shop that quotes a frame
after seeing the piece prices differently from a salon that charges ₹450 for a
haircut, which is why most of this price list is `priceLabel` rather than a
number.

## Company details at launch

[`src/lib/company.server.ts`](src/lib/company.server.ts) calls
`GET /api/v1/website/company-details?domain=<host>`. **That endpoint lives in the
backend**, in `Aj-Smart-Biz-Backend/src/controllers/public.controller.js` — this
site defines no API of its own, it only calls one.

The call happens once, in [`src/app/layout.tsx`](src/app/layout.tsx), before
anything is sent to the browser:

```
request on decor.localhost
  → middleware.ts            ?domain= → cookie → X-Forwarded-Host → Host → TENANT_DOMAIN
  → GET /website/company-details?domain=decor.localhost
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

`TENANT_DOMAIN=decor.localhost` is set in `.env.local` for local work, and it
has to be a label in front of `localhost` rather than `localhost` itself: **the
host resolver strips the port** before matching, so `localhost:4500` and
`localhost:4600` are the same host and could not name two different companies.
Every browser resolves `*.localhost` to the loopback with no hosts-file entry,
so `http://decor.localhost:4600` works as it stands.

`http://localhost:4600/?domain=decor.localhost` previews the same tenant without
touching `.env.local`.

## Theming

The glass, the gradient ground, the radii, the shadows and the type scale are
fixed — that is what makes this the Gilt theme. The company's theme only replaces
the colour laid on top of them:

| Variable | Source |
| --- | --- |
| `--brand` | `theme.primaryColor` — the *darker* of the pair here |
| `--brand-strong` | `theme.secondaryColor` — darker still, for hover |
| `--accent` | `theme.accentColor` — eyebrows, the gold button, the slide marker, the offer badge |

A company with no theme keeps the charcoal-and-brass in
[`globals.css`](src/app/globals.css).

Because every brand-tinted shadow in the template is a `color-mix` on `--brand`
rather than an `rgba()` on a fixed triplet, a tenant that sets `primaryColor`
gets the page casting shadows in their own colour too, not just their buttons.

A theme whose `primaryColor` is light will produce a pale button with pale type
on it, because `--brand-contrast` is fixed by the template rather than sent by
the API. That is the black theme's constraint in reverse, and the reason
`Aj Atelier` exists as a theme row rather than the tenant being left on
`Aj Midnight`. The row is still named after the theme it was created for; what it
carries is a colour, and the colour is still the right one.

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
labelled as samples. It deliberately writes **none for the hero**: a flat
placeholder rectangle filling a 560px-tall stage is the largest thing on the
page, and a sample image at that size reads as the shop's own work. A seeded
slide has no artwork and falls back to the dark charcoal-and-gold wash in
[`Slider.module.css`](src/components/Slider.module.css) until the shop uploads
one — which is why the hero copy is white whether or not a photograph exists.

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
│   ├── globals.css       Gilt tokens and shared primitives
│   ├── services/         The workshop's price list, and a page per service
│   ├── products/         The shop, and a page per product
│   ├── blog/             The journal, and a page per article
│   ├── about/ contact/   Pages the tenant writes in the admin
│   └── offers/ categories/
├── components/           Header, Slider, sections, cart, booking, footer
├── config/site.ts        The only copy the API does not own — fallbacks for an
│                         unresolved host
├── lib/                  The API calls and the types they return
└── middleware.ts         Which domain this request is for
```
