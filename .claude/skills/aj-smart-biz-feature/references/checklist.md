# Definition of done — Aj Smart Biz feature

## Backend
- [ ] Enums/keys added to `src/constants/index.js` (with `_VALUES`), not duplicated elsewhere
- [ ] Model file + registration + associations in `src/models/index.js` + added to `db`
- [ ] Joi validators: create (required/defaults), update (`.min(1)`, no defaults), list
- [ ] Controller uses `resolveCompanyId(req)`, scoped look-ups (404 for foreign ids), `createdBy/updatedBy`
- [ ] Plan-gated writes call `functionalityService.assertGranted`
- [ ] Multi-step writes in one transaction; history snapshotted; state changes via transition maps
- [ ] Routes: guard → validate → handler; literal paths before `/:id`; mounted in the correct module
- [ ] Menu row in `seeders/defaultMenus.js` (+ `MENU_INHERITS_PARENT` / `MENU_FUNCTIONALITY` if relevant)
- [ ] Upload folder added to `FOLDERS` if images
- [ ] Swagger `@openapi` prose + `SCHEMA_SOURCES` entries
- [ ] Public payload returns `null` for non-live features; `NAV_PAGES` row for new pages
- [ ] Backfill `ensureX()` in `bootstrap.js` if existing tenants need data
- [ ] API boots on SQLite; endpoints checked for 200 / 400 / 403 / 404

## Consoles
- [ ] Types mirror API constants
- [ ] Service methods only via `ApiService`
- [ ] Component: OnPush, signals, `@if/@for`, reactive form, `app-field-error`, toast + `messageOf`
- [ ] Route registered (AD: `permissionGuard`; SA: `navGroups` entry)
- [ ] AD write buttons wrapped in `*appCan`; feature-gate / limit-notice where relevant
- [ ] `npx ng build` passes (style budget)

## Websites
- [ ] Same `.ts/.tsx` in all three themes; CSS per theme with tokens only
- [ ] Page guard chain + `notFound()` when feature absent; section returns null when empty
- [ ] Client components receive `siteCompany(company)`
- [ ] Server Actions return state, never throw, never send prices
- [ ] `npm run typecheck && npm run build` pass; rebuild after `next dev`

## Docs
- [ ] Root `README.md` feature section
- [ ] `Aj-Smart-Biz-Backend/docs/schema.dbml`
- [ ] `docs/source/*.html` updated and `node docs/build-pdf.js` re-run
