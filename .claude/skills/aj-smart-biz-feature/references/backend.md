# Backend (Aj-Smart-Biz-Backend) — structure, format, recipe

CommonJS, `'use strict';` as the first line of every file. Express 4, Sequelize 6 (MySQL; SQLite for dev), Joi 17, JWT. 2-space indent, single quotes.

## Folder map (`src/`)

| Folder | Holds | Naming |
|---|---|---|
| `config/` | `env.js` (config), `database.js` (Sequelize: `underscored`, `freezeTableName`, `paranoid` global) | — |
| `constants/index.js` | Every enum `X` + `X_VALUES`, `X_CATALOGUE`, transition maps (`ORDER_TRANSITIONS`, `SUBSCRIPTION_TRANSITIONS`, `BOOKING_TRANSITIONS`), `FUNCTIONALITY`/`FUNCTIONALITY_CATALOGUE`, `NAV_PAGES`, `FEATURE_ICONS` | UPPER_SNAKE |
| `models/` | One factory per table; **associations only in `models/index.js`** | `companyThing.model.js`, model `CompanyThing`, table `company_things` |
| `validators/` | Joi `{ params?, query?, body? }`; primitives in `common.js` (`id`, `idParam`, `listQuery`, `statusBody`, `email`, `phone`, `hexColor`, `status`) | `thing.validator.js` |
| `middlewares/` | `auth.js` (`authenticate`, `authenticateOptional`, `superAdminOnly`, `adminOnly`, `customerOnly`, `companyAdminOnly`, `requirePermission`), `validate.js`, `errorHandler.js`, `upload.js` (`FOLDERS`) | — |
| `controllers/` | Handlers wrapped in `asyncHandler`; factories `crud.factory.js` (masters), `cardResource.factory.js` (ordered tenant card lists) | `thing.controller.js` |
| `services/` | Business rules + transactions (`subscription`, `quota`, `functionality`, `serviceState`, `order`, `stock`, `invoice`, `booking`, `storage`, `theme`, `analytics`, `company`, `companyDuplicate`, `aiContent`) | `thing.service.js` |
| `routes/` | Resource routers, `Router({ mergeParams: true })`; `myCompany.routes.js` composes `/admin/company/*` | `thing.routes.js` |
| `modules/` | One composed router per consumer, guard applied once in `modules/index.js` | `admin/admin.routes.js` … |
| `seeders/` | `bootstrap.js` (idempotent boot steps `ensureX()`), `defaultMenus.js` (menus, `MENU_INHERITS_PARENT`, `MENU_FUNCTIONALITY`) | — |
| `docs/` | Swagger: `routeScanner.js` (auto), `openapi.js` (`SCHEMA_SOURCES`) | — |
| `utils/` | `ApiError`, `asyncHandler`, `response` (`success`, `created`, `paginated`), `query` (`getPagination`, `mergeWhere`, `buildSearch`, `getSort`), `jwt`, `password`, `slug` (`uniqueSlug`), `logger` | — |

Module mounts (all under `/api/v1`): `/` shared (`/health`, `/auth`, `/masters`, `/uploads`), `/theme` (tenant public sites, tenant by host), `/website` (product site), `/admin` (authenticate + adminOnly), `/super-admin` (authenticate + superAdminOnly).

## Recipe: new tenant entity "thing"

1. **Constants** — `src/constants/index.js`
   ```js
   const THING_TYPE = { A: 'a', B: 'b' };
   const THING_TYPE_VALUES = Object.values(THING_TYPE);
   ```
   Export both. If sold separately: add `FUNCTIONALITY.THINGS = 'things'` and an entry in `FUNCTIONALITY_CATALOGUE` (key, name, icon, summary, description, sequence) — the plan form, validators and `company_functionalities.key` enum pick it up automatically.

2. **Model** — `src/models/companyThing.model.js`
   ```js
   'use strict';
   const { DataTypes } = require('sequelize');
   const { STATUS, STATUS_VALUES } = require('../constants');

   /** Why the table exists and the rules it keeps. */
   module.exports = (sequelize) =>
     sequelize.define(
       'CompanyThing',
       {
         id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
         companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
         branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // NULL = company-wide
         name: { type: DataTypes.STRING(150), allowNull: false },
         sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
         status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
         createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
         updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
       },
       { tableName: 'company_things', indexes: [{ fields: ['company_id'] }, { fields: ['status'] }] }
     );
   ```
   `paranoid: false` only for ledgers / child lines / switch rows. No unique indexes on business keys.

3. **Register** — `src/models/index.js`: `const CompanyThing = require('./companyThing.model')(sequelize);`, then
   `Company.hasMany(CompanyThing, { foreignKey: 'companyId', as: 'things', onDelete: 'CASCADE' }); CompanyThing.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });` (Branch likewise; use `SET NULL`/`constraints:false` for money/history references). Add to the exported `db`.

4. **Validator** — `src/validators/thing.validator.js`: shared `fields` map; `create` adds `.required()`/defaults; `update = { params: idParam, body: Joi.object(fields).min(1) }` (**no defaults**); `list = { query: listQuery({ ...filters }) }`.

5. **Service** (only if real rules) — `src/services/thing.service.js`: plain `async function`s exported at the bottom, accept `{ transaction }`, throw `ApiError`, check transitions against constants.

6. **Controller** — `src/controllers/thing.controller.js`: copy the local `resolveCompanyId(req)` helper from a sibling controller (e.g. `branch.controller.js`), `asyncHandler`, scoped `findOrFail` (404), `functionalityService.assertGranted(companyId, FUNCTIONALITY.X)` on writes, `createdBy/updatedBy: req.auth.id`, `removeUploadedFile` when an image is replaced, responses via `success/created/paginated` with messages like `'Thing created successfully'`. Ordered card lists: use `cardResource.factory.js` instead (see `routes/functionality.routes.js` `cardRouter`).

7. **Routes** — `src/routes/thing.routes.js`
   ```js
   const router = require('express').Router({ mergeParams: true });
   const may = (action) => requirePermission('things', action);
   router.get('/', may('canView'), validate(schema.list), controller.list);
   /** Before `/:id`, or "reorder" would be read as an id. */
   router.patch('/reorder', may('canEdit'), validate(schema.reorder), controller.reorder);
   router.post('/', may('canCreate'), validate(schema.create), controller.create);
   router.put('/:id', may('canEdit'), validate(schema.update), controller.update);
   router.patch('/:id/status', may('canEdit'), validate(master.statusBody), controller.toggleStatus);
   router.delete('/:id', may('canDelete'), validate(master.idParam), controller.remove);
   module.exports = router;
   ```

8. **Mount** — tenant: `src/routes/myCompany.routes.js` (→ `/admin/company/things`) or `src/modules/admin/admin.routes.js`. Website-content settings use `websiteSettingsGuard`. Super admin: `src/modules/superadmin/superadmin.routes.js` or nested in `src/routes/company.routes.js` as `/:companyId/things`. Public: `src/modules/theme/theme.routes.js` with a rate limiter; tenant via `resolveTenantByHost` in `public.controller.js`.

9. **Public payload** (website feature) — expose in `/theme/company-details` through `functionality.service` / `public.controller.js` as `features.things`, `null` unless active; branch fallback (branch rows → company rows). Page? add a `NAV_PAGES` row (key, href, label, settings?, functionality, content?).

10. **Menu** — `src/seeders/defaultMenus.js`: `{ name: 'Things', slug: 'things', icon: 'box', route: '/things', sequence: N, parent?: 'company-details' }`; add slug to `MENU_INHERITS_PARENT` if part of its parent's screen; to `MENU_FUNCTIONALITY` (`things: FUNCTIONALITY.THINGS`) if plan-gated. Boot upserts it and grants all Company Admin roles.

11. **Uploads** — new image folder → `FOLDERS` in `src/middlewares/upload.js`.

12. **Swagger** — `@openapi` JSDoc above routes for prose; register Joi schemas in `SCHEMA_SOURCES` (`src/docs/openapi.js`): `ThingCreate: pick(thingValidator.create)`.

13. **Extras** — data backfill: idempotent `ensureX()` in `seeders/bootstrap.js` added to `runBootstrap`; duplicate-company support: `companyDuplicate.service.js` + `DUPLICATE_SECTION`; dashboard counts: `controllers/dashboard.controller.js`; demo data: `src/scripts/seedX.js` + npm script.

## Errors and responses
```js
throw ApiError.badRequest('Readable sentence the UI can show', errors);
return paginated(res, result, { page, limit }, 'Thing list fetched successfully');
return created(res, 'Thing created successfully', row);
return success(res, { message: 'Thing updated successfully', data: row });
```
