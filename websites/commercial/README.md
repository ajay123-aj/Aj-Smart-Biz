# Commercial

Websites for companies whose business type is transactional — a catalogue,
pricing, enquiry or order flow rather than a brochure.

Nothing is built here yet. The first template goes in as its own folder
(`commercial/<theme-name>/`), following the same shape as
[`../informational/white-theme`](../informational/white-theme):

- self-contained Next.js app with its own `package.json` and port,
- tenant resolved at launch from the request domain via
  `GET /public/branding?domain=<host>`,
- no per-tenant build.
