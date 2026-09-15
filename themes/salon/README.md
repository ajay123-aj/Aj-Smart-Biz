# Salon

Websites for companies whose business type is **Salon & Spa** — a treatment
menu with prices, a diary somebody can take a time in, and a retail shelf of the
products used at the basin.

| Template | Stack | Port | Notes |
| --- | --- | --- | --- |
| [black-theme](black-theme/) | Next.js 15 · App Router · TypeScript | 4500 | Near-black surfaces — home, menu, shop, journal, about, contact |

Each template is its own app. Add a second theme as a sibling folder rather than
a flag inside an existing one — which is exactly how this folder came to exist:
`black-theme` is [`../informational/white-theme`](../informational/white-theme)
with its surfaces inverted, not a switch inside it.

## Why a folder of its own

A company's `business_types` row decides which template it is served. Salon &
Spa is its own row — seeded by `npm run db:seed:salon` in the backend — because
the thing it sells is a **menu of treatments and a diary**, which is neither a
brochure nor a plain catalogue:

- services carry a duration and a slot capacity, so a card offers a *time*
  rather than only an enquiry,
- colour is priced from ("From ₹2,400"), because a bob and hair to the waist are
  not the same job,
- the shelf sits behind the chair — a shop that exists because the salon uses
  what it sells, rather than instead of the service list.

The white theme renders every one of those already. What this folder settles is
the **surface**, and which tenants get it.

## The tenant it was built against

**Aj Salon** (`salon.localhost`) — seeded, content and all, by:

```bash
cd Aj-Smart-Biz-Backend
npm run db:seed:salon
```

That script writes the company, its plan, its domain, its treatment menu, its
shelf, its people, its reviews and its articles as **rows**. Nothing it writes
lives in this folder, and nothing in this folder is specific to it: point the
same deployment at another salon's domain and it renders that salon instead.
