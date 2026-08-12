import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { BillingCycle, Plan } from '../../core/models/domain.model';
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
    `,
  ],
})
export class PlanListComponent {
  private readonly fb = inject(FormBuilder);

  readonly cycles = CYCLES;

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
    isPopular: [false],
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
      isPopular: row?.isPopular ?? false,
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
    }),
    initialQuery: { sortBy: 'sequence', sortOrder: 'asc' },
  });

  constructor() {
    this.page.load();
  }

  money(value: number | string | null | undefined, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  cycleLabel(value: BillingCycle): string {
    return CYCLES.find((cycle) => cycle.value === value)?.label ?? value;
  }
}
