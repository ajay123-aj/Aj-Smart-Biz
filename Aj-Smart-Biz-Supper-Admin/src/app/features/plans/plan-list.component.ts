import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { CrudFactory, FUNCTIONALITY_CATALOGUE_PATH, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import {
  BillingCycle,
  FunctionalityCatalogue,
  FunctionalityKey,
  FunctionalityMeta,
  Plan,
} from '../../core/models/domain.model';
import { CrudPage } from '../../shared/crud-page';
import { formatMoney } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

const CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'lifetime', label: 'Lifetime' },
];

/** What follows the price on a card: "₹999 / month". */
const CYCLE_SUFFIX: Record<BillingCycle, string> = {
  monthly: '/ month',
  quarterly: '/ quarter',
  half_yearly: '/ 6 months',
  yearly: '/ year',
  lifetime: 'one-time',
};

/** The sort menu above the cards; the cards have no column headers to click. */
const SORT_OPTIONS = [
  { value: 'sequence:asc', label: 'Display order' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'name:asc', label: 'Name: A to Z' },
  { value: 'created_at:desc', label: 'Newest first' },
];

/** Functionality names a card shows before "+ n more". */
const CHIP_LIMIT = 6;

@Component({
  selector: 'app-plan-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './plan-list.component.html',
  styles: [
    `
      /* ------------------------------ toolbar ------------------------------ */
      .plan-toolbar { flex-wrap: wrap; gap: 10px; justify-content: flex-start; }
      .plan-toolbar .input { flex: 1 1 220px; max-width: 320px; }
      .plan-toolbar .select { width: auto; flex: 0 0 auto; }

      /* -------------------------------- cards -------------------------------- */
      .plan-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
        gap: 16px;
        padding: 20px;
      }
      .plan-card {
        position: relative;
        display: flex; flex-direction: column; gap: 14px;
        padding: 20px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        transition: box-shadow .2s, border-color .2s, transform .2s;
      }
      .plan-card:hover { box-shadow: var(--shadow-lg); border-color: var(--border-strong); transform: translateY(-2px); }
      .plan-card.is-popular { border-color: var(--brand-500); box-shadow: 0 0 0 1px var(--brand-500), var(--shadow); }
      .plan-card.is-inactive { background: var(--surface-2); }
      .plan-card.is-inactive .plan-amount, .plan-card.is-inactive h3 { color: var(--text-2); }

      .plan-ribbon {
        position: absolute; top: -11px; left: 20px;
        padding: 3px 10px; border-radius: 999px;
        background: var(--brand-600); color: #fff;
        font-size: 11px; font-weight: 700; letter-spacing: .02em;
      }

      .plan-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .plan-title { min-width: 0; }
      .plan-title h3 { margin: 0; font-size: 17px; line-height: 1.3; word-break: break-word; }
      .plan-code { display: inline-block; margin-top: 4px; font-size: 11px; color: var(--text-3); background: var(--surface-3); padding: 1px 6px; border-radius: 5px; }
      .plan-status { display: flex; align-items: center; flex: none; }

      .plan-desc {
        margin: -4px 0 0; color: var(--text-2); font-size: 13px; line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }

      .plan-price { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
      .plan-amount { font-size: 28px; font-weight: 800; letter-spacing: -.02em; color: var(--text); line-height: 1; }
      .plan-cycle { color: var(--text-3); font-size: 13px; font-weight: 500; }
      .plan-price-notes { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 22px; margin-top: -8px; font-size: 13px; }

      .plan-limits {
        display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
        margin: 0; border: 1px solid var(--border); border-radius: var(--radius);
        overflow: hidden; background: var(--surface-2);
      }
      .plan-limits > div { padding: 9px 6px; text-align: center; min-width: 0; }
      .plan-limits > div + div { border-left: 1px solid var(--border); }
      .plan-limits dt { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-3); font-weight: 600; }
      .plan-limits dd { margin: 3px 0 0; font-size: 15px; font-weight: 700; color: var(--text); white-space: nowrap; }

      .plan-visibility { display: flex; gap: 8px; flex-wrap: wrap; }
      .plan-flag {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 10px; border-radius: 999px;
        font-size: 12px; font-weight: 600;
        background: var(--surface-3); color: var(--text-3);
      }
      .plan-flag.on { background: var(--success-bg); color: var(--success); }

      .plan-features-head { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
      .plan-bar { height: 6px; margin: 6px 0 10px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
      .plan-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--brand-500), var(--brand-700)); }
      .plan-chips { display: flex; flex-wrap: wrap; gap: 5px; }
      .plan-chip {
        padding: 2px 9px; border-radius: 999px;
        border: 1px solid var(--border); background: var(--surface);
        font-size: 11.5px; color: var(--text-2); line-height: 1.6;
      }
      .plan-chip-more { cursor: pointer; border-style: dashed; color: var(--brand-600); font: inherit; font-size: 11.5px; }
      .plan-chip-more:hover { border-color: var(--brand-500); }

      .plan-foot {
        display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;
        margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border);
      }
      .plan-usage { font-size: 13px; color: var(--text-2); }
      .plan-expiring { color: var(--warning); font-weight: 600; }
      .plan-actions { display: flex; gap: 6px; }

      /* ------------------------------- switch ------------------------------- */
      .switch { position: relative; display: inline-block; width: 38px; height: 21px; margin-right: 8px; vertical-align: middle; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; inset: 0; cursor: pointer;
        background: var(--border-strong); border-radius: 999px; transition: background .2s;
      }
      .slider::before {
        content: ''; position: absolute;
        width: 15px; height: 15px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%; transition: transform .2s;
      }
      .switch input:checked + .slider { background: var(--success); }
      .switch input:checked + .slider::before { transform: translateX(17px); }

      /* Functionality grants — a card per feature rather than a bare checkbox
         list, because each one needs a line explaining what it does. */
      .grant-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 10px;
        margin-bottom: 6px;
      }
      .grant {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 12px 14px; cursor: pointer;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface);
        transition: border-color .15s, background .15s, box-shadow .15s;
      }
      .grant:hover { border-color: var(--border-strong); }
      .grant-on { border-color: var(--brand-500); background: color-mix(in srgb, var(--brand-500) 8%, var(--surface)); }
      .grant input { margin-top: 3px; flex: none; }
      .grant-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .grant-name { font-weight: 600; }
      .grant-summary { font-size: 12px; color: var(--text-3); line-height: 1.45; }
      .grant-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    `,
  ],
})
export class PlanListComponent {
  private readonly fb = inject(FormBuilder);

  readonly cycles = CYCLES;
  readonly sortOptions = SORT_OPTIONS;
  readonly chipLimit = CHIP_LIMIT;

  /** Plans whose functionality list has been opened past the first few. */
  private readonly expanded = signal<ReadonlySet<number>>(new Set());

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    code: [''],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    discountPrice: [null as number | null],
    currency: ['INR'],
    billingCycle: ['monthly' as BillingCycle],
    durationDays: [null as number | null],
    trialDays: [0, [Validators.min(0)]],
    maxBranches: [1, [Validators.min(1)]],
    maxAdmins: [1, [Validators.min(1)]],
    maxUsers: [5, [Validators.min(1)]],
    storageMb: [1024, [Validators.min(1)]],
    features: [''],
    /**
     * The keys this plan grants. One array control rather than a checkbox per
     * feature, so the catalogue can grow without the form changing shape.
     */
    functionalities: [[] as FunctionalityKey[]],
    isPopular: [false],
    isPublic: [false],
    showInAdmin: [false],
    sequence: [0],
    status: ['active'],
  });

  readonly page = new CrudPage<Plan>({
    client: inject(CrudFactory).for<Plan>(MASTER_PATHS.plans),
    label: 'plan',
    toast: inject(ToastService),
    confirm: inject(ConfirmService),
    form: this.form,
    toForm: (row) => ({
      name: row?.name ?? '',
      code: row?.code ?? '',
      description: row?.description ?? '',
      price: Number(row?.price ?? 0),
      discountPrice: row?.discountPrice != null ? Number(row.discountPrice) : null,
      currency: row?.currency ?? 'INR',
      billingCycle: row?.billingCycle ?? 'monthly',
      durationDays: row?.durationDays ?? null,
      trialDays: row?.trialDays ?? 0,
      maxBranches: row?.maxBranches ?? 1,
      maxAdmins: row?.maxAdmins ?? 1,
      maxUsers: row?.maxUsers ?? 5,
      storageMb: row?.storageMb ?? 1024,
      features: (row?.features ?? []).join('\n'),
      functionalities: [...(row?.functionalities ?? [])],
      isPopular: row?.isPopular ?? false,
      isPublic: row?.isPublic ?? false,
      showInAdmin: row?.showInAdmin ?? false,
      sequence: row?.sequence ?? 0,
      status: row?.status ?? 'active',
    }),
    // The textarea holds one feature per line; the API expects a string array.
    toPayload: (raw) => ({
      ...raw,
      code: raw['code'] || null,
      description: raw['description'] || null,
      features: String(raw['features'] ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      // Sent even when empty — that is how a functionality is taken off a plan.
      functionalities: [...((raw['functionalities'] as FunctionalityKey[]) ?? [])],
    }),
    initialQuery: { sortBy: 'sequence', sortOrder: 'asc' },
  });

  /** The platform's own list, so this screen never hard-codes the features. */
  readonly functionalities = signal<FunctionalityMeta[]>([]);

  constructor() {
    this.page.load();
    inject(ApiService)
      .get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH)
      .subscribe({
        next: (catalogue) => this.functionalities.set(catalogue.functionalities ?? []),
        // The rest of the plan form still works; only the grant picker is empty.
        error: () => this.functionalities.set([]),
      });
  }

  /** Whether the plan currently open in the form grants `key`. */
  grants(key: FunctionalityKey): boolean {
    return (this.form.controls.functionalities.value ?? []).includes(key);
  }

  /**
   * Ticking a box rewrites the whole array rather than mutating it in place: the
   * control has to see a new reference before it marks itself dirty.
   */
  toggleGrant(key: FunctionalityKey, checked: boolean): void {
    const current = this.form.controls.functionalities.value ?? [];
    const next = checked ? [...new Set([...current, key])] : current.filter((entry) => entry !== key);
    this.form.controls.functionalities.setValue(next);
    this.form.controls.functionalities.markAsDirty();
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** What a plan grants, by name, for the list column. */
  grantNames(row: Plan): string[] {
    const keys = row.functionalities ?? [];
    return this.functionalities()
      .filter((entry) => keys.includes(entry.key))
      .map((entry) => entry.name);
  }

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  cycleLabel(value: BillingCycle): string {
    return CYCLES.find((cycle) => cycle.value === value)?.label ?? value;
  }

  cycleSuffix(value: BillingCycle): string {
    return CYCLE_SUFFIX[value] ?? value;
  }

  /** How much the offer price takes off, as a whole percentage; 0 when it is not a reduction. */
  savingPercent(row: Plan): number {
    const price = Number(row.price);
    const offer = Number(row.discountPrice);
    if (!price || !offer || offer >= price) return 0;
    return Math.round(((price - offer) / price) * 100);
  }

  /** Storage in the unit people think in: 512 MB, 2 GB, 1.5 GB. */
  storage(mb: number): string {
    if (mb < 1024) return `${mb} MB`;
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }

  grantPercent(row: Plan): number {
    const total = this.functionalities().length;
    return total ? Math.round((this.grantNames(row).length / total) * 100) : 0;
  }

  isExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  toggleExpanded(id: number): void {
    const next = new Set(this.expanded());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded.set(next);
  }

  visibleGrants(row: Plan): string[] {
    const names = this.grantNames(row);
    return this.isExpanded(row.id) ? names : names.slice(0, CHIP_LIMIT);
  }

  hiddenGrantCount(row: Plan): number {
    return this.grantNames(row).length - this.visibleGrants(row).length;
  }

  onSort(event: Event): void {
    const [sortBy, sortOrder] = (event.target as HTMLSelectElement).value.split(':');
    this.page.store.patch({ sortBy, sortOrder: sortOrder as 'asc' | 'desc' });
  }
}
