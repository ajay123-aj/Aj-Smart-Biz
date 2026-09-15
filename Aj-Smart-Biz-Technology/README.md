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
| Where its content lives | the API (`/website/company-details`) | `src/content/` and `src/config/` |
| Has `middleware.ts` | yes, to resolve the tenant | **no** — nothing to resolve |
| Theme colours | the tenant's, injected at runtime | fixed |

A tenant template is one deployment serving many companies. This is one
deployment serving one company, which happens to be us. That is why it has no
tenant resolver, no `TENANT_DOMAIN`, no uploads proxy and no API calls.

---

## Where the content lives

Four files. Nothing else in the project holds copy or prices.

| File | What is in it |
| --- | --- |
| `src/content/plans.ts` | **The price list.** The only rupee figures in the project. |
| `src/content/capabilities.ts` | The product: what a customer's site can be built from. |
| `src/content/business-types.ts` | The trades we build for. |
| `src/config/site.ts` | Brand, contact details, and every piece of prose. |

`plans.ts` refers to capabilities **by key**, and `CapabilityKey` is a union
type — so a plan cannot promise something that does not exist, and a typo is a
build error rather than a chip that silently fails to render.

The home page's hero counts `business-types.ts` and `capabilities.ts` and reads
the cheapest plan out of `plans.ts`, so adding a trade or a feature updates the
first screen without anybody remembering to.

### ⚠ Replace the contact details before this goes live

`CONTACT` in `src/config/site.ts` is placeholder — `+91 90000 00000`,
`hello@ajsmartbiz.in`. They are deliberately obvious (`90000 00000` is not an
assignable Indian mobile number) so that shipping them by accident is loud. Every
phone link, WhatsApp link and mail link on the site reads from that one object,
so it is a single edit.

---

## Where the demo form goes

**Nowhere — by design, for now.**

`EnquiryForm` composes a message from what was typed and hands it to the
visitor's own WhatsApp or mail app (`src/lib/enquiry.ts`). Nothing is posted and
nothing is stored.

What that buys: a site that works the moment it is deployed, with no endpoint to
build, no table of strangers' phone numbers to own, and no admin screen to write
before anybody can read what came in.

What it costs: **no reporting.** There is no list of who enquired and no
conversion funnel, because nothing was recorded.

When that reporting is wanted, the change is contained:

1. Add a public endpoint to `Aj-Smart-Biz-Backend` — the `/website` module is
   the right home, since it is the platform's only unauthenticated surface.
2. Replace the two `href`s in `EnquiryForm` with a Server Action that posts the
   same payload.

The form, its fields and its validation do not change. `src/lib/enquiry.ts` has
the detail.

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

It is deliberately the inverse material of `themes/commercial/decor-framing`,
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
