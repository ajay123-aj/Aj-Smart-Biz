# Commercial

Websites for companies whose business type is transactional — a catalogue,
pricing, enquiry or order flow rather than a brochure.

| Template | Port | For |
| --- | --- | --- |
| [`decor-framing/`](decor-framing) | 4600 | Framing workshops and home-decor shops — Gilt theme |

Another template goes in as its own folder (`commercial/<theme-name>/`),
following the same shape as the one above:

- self-contained Next.js app with its own `package.json` and port,
- tenant resolved at launch from the request domain via
  `GET /website/company-details?domain=<host>`,
- no per-tenant build.

## decor-framing

Built for **Home Decor & Framing** companies: a price list for the workshop, a
diary for consultations and fittings, a shop that takes orders, reviews and a
journal. Seed the tenant it was written against with
`npm run db:seed:decor` in the backend, then serve it on
`http://decor.localhost:4600`.

It shares its components, `lib/` and middleware with `salon/black-theme` and
differs in design language rather than palette — blurred white glass floating on
a fixed gradient wash, generous radii with pills on anything pressable, brass as
the only accent, and a hero that is an inset dark stage rather than a band. See
its [README](decor-framing/README.md) for the three themes side by side.
