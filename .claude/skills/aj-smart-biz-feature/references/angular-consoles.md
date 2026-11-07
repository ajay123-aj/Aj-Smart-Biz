# Angular consoles — structure, format, recipe

Two apps with the same architecture (copied, not shared):
- `Aj-Smart-Biz-Supper-Admin` (SA, :4200) — platform; no RBAC; sidebar hard-coded.
- `Aj-Smart-Biz-Admin` (AD, :4300) — tenant; RBAC; sidebar from `/auth/me`.

Angular 22, standalone (no NgModule), zoneless default, RxJS 7.8, TypeScript 6. No UI/chart/state libraries. Prettier: `printWidth 100`, single quotes, Angular HTML parser. 2-space indent.

## Folder map (`src/app/`)

```
core/guards/auth.guard.ts          authGuard, guestGuard (+ AD: permissionGuard(slug, action), passwordChangeGuard)
core/interceptors/auth.interceptor.ts  Bearer, server-down, 401/403/5xx; exports messageOf(), isUnreachable()
core/models/api.model.ts           ApiResponse<T>, PageMeta, PagedResult<T>, ListQuery, EMPTY_META
core/models/domain.model.ts        all domain interfaces (extend AuditFields), literal-union enums
core/services/*.service.ts         providedIn: 'root'; ApiService, AuthService, CrudFactory/MASTER_PATHS, UploadService, CompanyService, ...
layout/shell.component.(ts|html)   sidebar + topbar + outlet
shared/list-store.ts               ListStore<T>: items/meta/loading/query signals; reload, setPage, setLimit, toggleSort, sortIcon
shared/crud-page.ts                CrudPage<T>: ListStore + modal/save/toggle/remove
shared/utils.ts                    touchAll, cleanPayload, formatMoney, ...
shared/can.directive.ts            (AD) *appCan
shared/ui/*                        modal, pager, table-state, status-badge, field-error, image-upload, plan-timer,
                                   limit-notice, page-header, confirm-dialog, toast-host, server-down
                                   (AD also feature-gate, icon-picker, image-gallery-upload, mini-chart)
features/<area>/<name>.component.(ts|html)   lazy-loaded, one folder per business area
src/styles.scss                    global design system: tokens (--brand-*, --surface*, --text*, --radius*, --shadow*) + primitives
```

## Component format (copy this shape)

```ts
@Component({
  selector: 'app-thing-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PageHeaderComponent, PagerComponent, StatusBadgeComponent,
            TableStateComponent, ModalComponent, FieldErrorComponent, CanDirective],
  templateUrl: './thing-list.component.html',
})
export class ThingListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly store = new ListStore<Thing>((query) => this.companies.listThings(query));
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<Thing | null>(null);
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    status: ['active'],
  });

  constructor() { this.store.reload(); }
  // save(): if invalid → touchAll(form); else subscribe({ next: toast.success + reload, error: e => toast.error('Could not save', messageOf(e)) })
  // async remove(row) { if (await this.confirm.askDelete(row.name)) ... }
}
```

Rules: `OnPush` always; `inject()` fields; load in constructor (no `ngOnInit`); signals/computed/effect; signal `input()`/`output()`; templates use `@if`/`@for (x of xs; track x.id)`/`@empty` only; reactive forms with `fb.nonNullable`; component CSS inline in `styles: [...]` using `var(--…)` only (budget 4 kB warn, 8 kB error); all HTTP through `ApiService`.

Template skeleton: `<app-page-header title subtitle>`(action buttons) → `.card` → `.card-head` search (`(input)` debounced 350 ms) → `.card-body.tight` → `<app-table-state>` → `.table-wrap > table.table` (`th.sortable (click)="store.toggleSort('name')"`) → `<app-pager [meta] (pageChange) (limitChange)>` → `@if (modalOpen()) { <app-modal [title] size (closed)> <form id="thing-form"> … <app-field-error [control] label/> </form> <ng-container footer> <button type="submit" form="thing-form" class="btn btn-primary">`.

Reference implementations: SA `features/masters/state-list.component.*` (CrudPage); AD `features/roles/role-list.component.*` (ListStore + appCan); AD Company Details editors `features/company/*-manager.component.*` (use `inject(CompanyContextService)` for `company()`, `canEdit()`, `branchOptions()`).

## Recipe: new screen

### Company Admin (AD)
1. Backend menu row exists (`defaultMenus.js`) — the sidebar only shows menus from `/auth/me`.
2. Model in `core/models/domain.model.ts` (or `thing.model.ts`), comment "Mirrors … in the API".
3. Service: section `/* ---- things ---- */` in `core/services/company.service.ts` calling `/admin/company/things`, or a dedicated service with `private readonly BASE = '/admin/company/things'`. Card lists: `cards<T>('things')` (extend the path union) or `new CardClient<T>(api, path)`.
4. Component under `features/things/` (or `features/company/things-manager.component.*` for a Company Details sub-page).
5. Route in `app.routes.ts` under the shell children:
   `{ path: 'things', canActivate: [permissionGuard('things')], title: 'Things', loadComponent: () => import('./features/things/thing-list.component').then((m) => m.ThingListComponent) }`
   Title is the page name only (CompanyTitleStrategy appends the company). Create routes: `permissionGuard('things', 'canCreate')`. Company Details sub-pages go under the `company` children. Literal paths before `:id`.
6. Write buttons: `*appCan="'things'; action: 'canCreate'"` (canEdit / canDelete likewise).
7. Plan-gated: `<app-feature-gate [feature]="…">` from `companies.functionalities()`; quota: `<app-limit-notice>`.
8. Optional emoji fallback in `ICONS` (`layout/shell.component.ts`), keyed by slug.

### Super Admin (SA)
1. Model + service against `/super-admin/...` (masters: add to `MASTER_PATHS` and use `inject(CrudFactory).for<T>(MASTER_PATHS.x)`).
2. Component (copy `state-list`), route child with title `'Things · Aj Smart Biz'`.
3. Add `{ label, route, icon }` to the right group in `navGroups` (`layout/shell.component.ts`).

Verify: `npx ng build` in each touched app.
