# Aj Smart Biz Technology

The **product website** — the one that sells the platform.

```bash
npm install
npm run dev     # http://localhost:4700
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development. Watches files — use this while editing. |
| `npm run preview` | `build` then `start`. Use this to look at a production build. |
| `npm start` | Serves the **existing** `.next` build. Does **not** rebuild. |
| `npm run typecheck` | `tsc --noEmit`. |

Port **4700**, kept clear of the API (4000), the two consoles (4200, 4300) and
the tenant templates (4400–4600).

---

## What this is, and what it is not

This is not one of the templates in [`themes/`](../themes/), and the difference
is worth stating before anyone tries to reuse code between them.

|  | `themes/*` | this project |
| --- | --- | --- |
| Whose site is it | a **tenant's** — a salon, a shop | **ours** |
| Who does it describe | resolved from the host at request time | always Aj Smart Biz |
| Where its content lives | the API (`/theme/company-details`) | the API (`/website/bootstrap`) |
| Has `middleware.ts` | yes, to resolve the tenant | **no** — nothing to resolve |
| Theme colours | the tenant's, injected at runtime | fixed |

A tenant template is one deployment serving many companies. This is one
deployment serving one company, which happens to be us. That is why it has no
tenant resolver, no `TENANT_DOMAIN` and no uploads proxy.

It *does* call the API — that is the one row above where the two are now alike.
The difference is which prefix: a theme reads `/theme/*` and gets whichever
tenant the request host names; this reads `/website/*` and gets the same answer
every time, because there is only one of us.

---

## Where the content lives

**In the database, reached over the API. Not in this project.**

Every word on this site — the headlines, the price list, the capability list,
the trades and the FAQ — comes from `GET /website/bootstrap` and is edited in
the **super admin console**. `src/content/` and `src/config/site.ts` used to
hold it and have been deleted.

| What | Where it comes from | Edited in |
| --- | --- | --- |
| Headlines, page copy, contact details | `marketing_contents` | Super admin → Marketing |
| The price list | `plans` (only where `isPublic`) | Super admin → Plans |
| What a site can be built from | the API's functionality catalogue | code (`constants`) |
| The trades | `business_types` (only where `isPublic`) | Super admin → Business types |
| The FAQ | `marketing_faqs` | Super admin → Marketing |

`src/lib/api.ts` is the only file that talks to the API, and it holds the two
calls this site makes. **There is no database driver in this project** and there
must not be: `package.json` is `next`, `react` and `react-dom`. Two things
owning the same rows is the situation the API exists to prevent.

### `isPublic`, and why the pricing page is not "every active plan"

The `plans` table also holds plans built for one tenant and plans bundled with a
theme. Those are not a price list, so only rows flagged `isPublic` reach this
site. The flag defaults to **false**: a new plan is invisible here until
somebody says otherwise, which is the safe direction for a table that is mostly
not public. `business_types` works the same way.

### There is no fallback copy

If the API has never answered, a page renders an error rather than content.
That is deliberate — inventing wording would put a price on the page that nobody
agreed to. Once it *has* answered, Next serves the last good response for five
minutes and refreshes in the background (`REVALIDATE_SECONDS`), so a backend
restart or deploy is invisible to visitors.

The cost is that an edit takes up to five minutes to appear. That is the right
trade for a page read by strangers and edited a few times a year.

### ⚠ Replace the contact details before this goes live

The seeded `contact` section is placeholder — `+91 90000 00000`,
`hello@ajsmartbiz.in`. They are deliberately obvious (`90000 00000` is not an
assignable Indian mobile number) so that shipping them by accident is loud.
Every phone, WhatsApp and mail link on the site reads from that one section, so
it is a single edit **in the console** — not in this repository.

---

## Where the demo form goes

**To the API, and then to WhatsApp.**

Submitting posts to `POST /website/enquiries` through the server action in
`src/app/actions/submit-enquiry.ts`, so the enquiry is stored and appears in the
super admin console. The composed WhatsApp and mail links are then offered on
the confirmation, because a message in a thread somebody is already reading gets
answered faster than a row in a table somebody has to open.

**A failed send still shows those links.** The worst outcome is a person who
wanted a website and could not tell us, so an API that is down costs us the
record rather than the lead.

One thing to know about the rate limit: the post goes through a **server
action**, so the API sees this container's address rather than the visitor's.
The endpoint allows 10 per 15 minutes per address in production, and every
submission from this site counts against the same one. Raise it on the endpoint
if that bites — moving the call into the browser would publish the API origin
and need CORS on top.

---

## The theme

Glassmorphism on a dark ground — "aurora glass". It is documented at the top of
[`src/app/globals.css`](src/app/globals.css), which is the file to read before
changing any of it. In short:

- **The ground is dark and it is lit.** Three coloured blooms over near-black,
  fixed to the window rather than to the document. Glass reads as glass when the
  light it catches has somewhere to come from.
- **Every surface is the same sheet.** One `--glass` token, used for the header,
  the cards, the panels, the pricing table and the form fields.
- **Colour is a gradient, never a fill.** The violet→blue→teal ramp is text, a
  hairline, a glow, and one button per screen. The closing CTA band is the sole
  exception and says so in its own CSS.

It is deliberately the inverse material of `themes/atelier`,
which is white glass on warm paper. Those two get opened in adjacent tabs when
somebody is deciding whether to buy, and looking alike would make the whole
product look like one template with the colours swapped.

There is **no photography anywhere in this project**. The only picture is the
stylised browser frame in the hero, drawn in markup. A screenshot of a customer's
site is a promise about design; the promise this business makes is about the
running of it.

### Contrast

`--text` is near-white, `--text-muted` is the dimmest colour used for a sentence
anybody has to read, and `--text-faint` is for labels and metadata only — never a
paragraph. The accent ramp carries decoration and large display type; wherever
the accent has to be a *word*, it uses `--accent-text`, which is the readable
blue from the ramp's midpoint.

---

## Pages

| Route | What it does |
| --- | --- |
| `/` | The argument, in order: what this is, how the day goes, what stops being your job, what a site is made of, who it is for, what it costs, the questions, the ask. |
| `/services` | The full capability list with long descriptions, plus what is in every plan regardless. |
| `/plans` | The pricing table, the recharge argument and the FAQ. |
| `/demo` | The demo request. Accepts `?plan=<id>` from a pricing card. |
| `/about` | Why it works this way. Mostly prose. |
| `/contact` | WhatsApp, phone and email first; the form second. |

`/demo` is the only server-rendered route, because it reads `searchParams`.
Everything else is static.
