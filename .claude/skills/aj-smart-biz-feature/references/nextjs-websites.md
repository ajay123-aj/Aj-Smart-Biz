# Next.js websites — structure, format, recipe

Next.js 15 App Router, React 19, TypeScript strict, `@/*` → `src/*`. Plain CSS: `globals.css` tokens + co-located CSS Modules. No Tailwind, no UI library.

## Tenant themes (`themes/default`, `themes/midnight`, `themes/atelier`)

**All `.ts/.tsx` logic is identical across the three themes — apply every change to all three.** Only CSS (and `config/site.ts` fallback wording) differs.

```
src/middleware.ts            domain → x-tenant-domain header (?domain= → X-Forwarded-Host/Host → TENANT_DOMAIN → cookie)
src/app/layout.tsx           getCompanyDetails() once; brand colours → --brand/--brand-strong/--accent; CartProvider
src/app/<route>/page.tsx     guard chain + sections
src/app/actions/*.ts         'use server' writes (submit-order, submit-service-enquiry, book-service, submit-testimonial, account)
src/app/api/track/route.ts   beacon proxy → POST /theme/leads
src/app/uploads/[...path]/route.ts  image proxy to API origin
src/components/XSection.tsx + XSection.module.css
src/config/site.ts           fallback copy (X_COPY) and limits
src/lib/company.ts           CompanyDetails/SiteFeatures types, FALLBACK_COMPANY, helpers (toFileUrl, fillCompany, navOf, hasSection, siteCompany)
src/lib/company.server.ts    'server-only': resolveDomain(), getCompanyDetails()
src/lib/<feature>.ts         resolveX(company): ResolvedX | null   (pure view-model)
src/lib/<noun>-submit.ts     action state types/initial state
```

Data: one call `GET {API_URL}/theme/company-details?domain=` (`cache: 'no-store'`), memoised per render. `features.<key>` is `null` unless the plan grants it, the tenant enabled it and the plan is active.

### Page format
```tsx
export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();
  return anonymousMetadata(company) ?? { title: `Things · ${company.name}` };
}

export default async function ThingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const company = await getCompanyDetails();
  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.resolved) return <CompanyNotFound />;
  if (!company.service.active) return <PlanNotice company={company} />;
  const things = resolveThings(company);
  if (!things) notFound();
  const { page } = await searchParams;
  return <ThingsSection company={company} />;
}
```

### Section format
Async Server Component taking `{ company }`; calls `resolveX(company)`; `return null` when absent; uses global classes (`section`, `container`, `section-head`, `eyebrow`, `section-title`, `section-lede`, `card-surface`, `btn btn--primary`) + `styles.x`. Client components (`'use client'`) only for interaction, and receive `siteCompany(company)` (catalogue stripped).

### Server Action format
```ts
'use server';
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
export async function submitThing(prev: ThingState, formData: FormData): Promise<ThingState> {
  try {
    const res = await fetch(`${API_URL}/theme/things`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: await resolveDomain(), name: formData.get('name') }),
    });
    const json = await res.json();
    if (!json.success) {
      const fieldErrors: Partial<Record<ThingField, string>> = {};
      (json.errors ?? []).forEach((e) => { if (e.field && e.message) fieldErrors[e.field as ThingField] = e.message; });
      return { status: 'error', message: json.message, fieldErrors };
    }
    return { status: 'success', message: json.message };
  } catch { return { status: 'error', message: 'We could not send that just now. Please try again.' }; }
}
```
Never throw from actions; never send prices; signed-in calls add the customer Bearer token via `lib/session.server.ts`. Forms use `useActionState` + `useFormStatus`.

### Recipe: new website feature/page
1. Backend exposes `features.things` (null when not live) and, for a page, a `NAV_PAGES` row.
2. `lib/company.ts`: add the type to `SiteFeatures`, and `things: null` to `FALLBACK_COMPANY.features`.
3. `lib/things.ts`: `resolveThings(company)` with fallback copy from `config/site.ts` (`THINGS_COPY`, `{company}` placeholders via `fillCompany`).
4. `components/ThingsSection.tsx` + `.module.css` (per theme). Link to the page only if `hasSection(company, '/things')`.
5. `app/things/page.tsx` with the guard chain above; `params`/`searchParams` are Promises.
6. Large/paged data (like blog): `lib/things.server.ts` with `import 'server-only'`, fetch with `?domain=` and `no-store`, return null on 404.
7. Copy all `.ts/.tsx` to the other two themes; write their CSS (atelier cards use `--glass` + `backdrop-filter`; sticky elements use `--header-stack`; midnight is dark — use tokens, never literal colours; tint with `color-mix(in srgb, var(--brand) 8%, transparent)`).
8. `npm run typecheck && npm run build` in each theme; dev test via `http://salon.localhost:4500` or `?domain=<host>`.

## Product website (`Aj-Smart-Biz-Technology`)

- `src/lib/api.ts` is the **only** file that talks to the API: `getSite()` = `/website/bootstrap` (React `cache()`, `revalidate: 300`, tags, retry, last-good snapshot). All copy comes from `marketing_contents` (Super Admin → Our website → Content); every `SiteContent` field is optional and read with `?.`/`??`.
- New page: `src/app/<route>/page.tsx` (async; `generateMetadata` → `pageMetadata('/route', title, desc)`; `<PageHeader …/>` … `<CtaBand />`), `page.module.css`, add to `PUBLIC_ROUTES` in `lib/seo.ts`, nav links come from API content.
- New section: `components/XSection.tsx` calls `getSite()` itself, returns null on empty data.
- Writes: a `'use server'` action in `app/actions/` calling a `lib/api.ts` function that returns `{ ok, ... }`.
