---
name: aj-smart-biz-feature
description: Use whenever adding or changing functionality in the Aj Smart Biz repo — a new feature, entity, table, endpoint, admin screen, menu, plan functionality, website section/page, or theme change — in Aj-Smart-Biz-Backend (Express/Sequelize), Aj-Smart-Biz-Admin or Aj-Smart-Biz-Supper-Admin (Angular 22), themes/* or Aj-Smart-Biz-Technology (Next.js 15). Gives the project's folder structure, code format, naming, and the exact end-to-end file checklist so new code matches existing patterns.
---

# Aj Smart Biz — adding functionality

Aj Smart Biz is a multi-tenant SaaS: one Express API serves two Angular consoles and Next.js websites. Before writing code, **read the existing sibling file you are imitating** (paths below) — this skill tells you where to look and which rules are non-negotiable; the code is the final authority.

## 1. Map of the repo

| App | Path | Port | Role |
|---|---|---|---|
| API | `Aj-Smart-Biz-Backend/` | 4000 | All data and business rules, `/api/v1` |
| Super Admin | `Aj-Smart-Biz-Supper-Admin/` | 4200 | Platform console (companies, plans, subscriptions, masters, marketing CMS) |
| Company Admin | `Aj-Smart-Biz-Admin/` | 4300 | Tenant workspace (website content, orders, stock, invoices, roles) |
| Tenant websites | `themes/{default,midnight,atelier}/` | 4400/4500/4600 | Same logic ×3, only CSS differs |
| Product website | `Aj-Smart-Biz-Technology/` | 4700 | Sells the platform; content from `/website/*` |

Deep reference: `README.md` (root, product behaviour) and `docs/source/10-Developer-Guide-Coding-Standards.html`.

## 2. Non-negotiable rules

1. **API-first, no hardcoded data.** Anything a client displays comes from a backend endpoint. Never bake tenant content, lists or copy into a template.
2. **Constants are the catalogue.** Enums (`X` + `X_VALUES`), `*_CATALOGUE`, transition maps and limits live only in `Aj-Smart-Biz-Backend/src/constants/index.js`. Frontend types mirror them with a comment "Mirrors `X` in the API".
3. **Tenant from the token.** In controllers use the local `resolveCompanyId(req)` helper (admin → `req.auth.companyId`, super admin → `req.params.companyId`). Never accept `companyId` from an admin's body. Scope every query by company; foreign ids → 404.
4. **Guard at the module.** Mount routes inside the right module (`src/modules/{admin,superadmin,theme,website,shared}`); add `requirePermission('<menu-slug>', action)` per route for tenant screens. No ad-hoc auth.
5. **One decision, one function.** Reuse `functionality.service` (entitlement: `active = granted ∧ enabled ∧ served`, `assertGranted` on writes), `quota.service`, `serviceState.service`, `isOnOffer`, etc. Never re-derive these in a controller or UI.
6. **Money and history server-side.** Prices computed from the catalogue; snapshot onto orders/invoices/subscriptions; state changes go through the transition maps.
7. **Soft delete by default** (`paranoid`), ledgers/switch rows excepted. Uniqueness checked in code, not DB unique indexes.
8. **Absent, not empty.** A website feature not live is `null` in the public payload and its section/page is not rendered (`notFound()` for pages).
9. **Themes are triplets.** Copy `.ts/.tsx` changes verbatim to all three `themes/*`; write each `.module.css` per design.
10. **Comment the why.** Match the existing JSDoc style that explains business reasons.

## 3. Workflow

1. **Locate the closest existing feature** and read it end to end (good templates: warehouse/stock, blog, catalogue, sliders, team via `cardResource.factory.js`).
2. **Decide the surface**: tenant console (`/admin`), platform console (`/super-admin`), public tenant site (`/theme`), product site (`/website`). Is it a sellable plan feature (new `FUNCTIONALITY` key)?
3. **Backend first** → follow `references/backend.md` (constants → model → index.js → validator → service → controller → routes → mount → menu seed → upload folder → Swagger → bootstrap backfill).
4. **Consoles** → `references/angular-consoles.md` (model → service → component → route + guard → menu → gates).
5. **Websites** → `references/nextjs-websites.md` (types → resolver → section → page → action; all three themes).
6. **Verify** (section 4) and **update docs**: root `README.md` feature section, `Aj-Smart-Biz-Backend/docs/schema.dbml`, `docs/source/*.html` then `node docs/build-pdf.js`.

## 4. Verify before saying done

- API: `cd Aj-Smart-Biz-Backend && DB_DIALECT=sqlite npm run dev` boots cleanly (alter-sync + bootstrap), endpoints visible and working in `http://localhost:4000/api/v1/docs`; check permission 403, foreign-tenant 404, validation 400.
- Consoles: `npx ng build` in each touched Angular app — no errors, style budget respected.
- Websites: `npm run typecheck && npm run build` in each touched Next.js app. After `next dev` testing, rebuild so `npm start` still works.
- Walk `references/checklist.md`.

## 5. Quick facts

- Response envelope `{ success, message, data, meta?, errors?[{field,message}] }` via `utils/response.js` (`success`, `created`, `paginated`); errors via `utils/ApiError.js`.
- List query: `page, limit(≤200), search, status, sortBy, sortOrder`; helpers `getPagination`, `mergeWhere`, `buildSearch`, `getSort` (`utils/query.js`).
- Permission actions: `canView canCreate canEdit canDelete canExport`. Main admin (`isCompanyAdmin`) and super admins bypass.
- DB columns snake_case (`underscored: true`); JS attributes camelCase; tenant tables `company_*`.
- Schema changes apply by `sequelize.sync({ alter: true })` on boot — there are no migrations.
- Literal routes (`/summary`, `/reorder`, `/analytics`, `/quota`) must be declared before `/:id`.
