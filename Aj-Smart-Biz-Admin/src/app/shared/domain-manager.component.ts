import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../core/services/api.service';
import { ConfirmService } from '../core/services/confirm.service';
import { ToastService } from '../core/services/toast.service';
import { messageOf } from '../core/interceptors/auth.interceptor';
import { CompanyDomain, Option } from '../core/models/domain.model';
import { FieldErrorComponent } from './ui/field-error.component';
import { ModalComponent } from './ui/modal.component';
import { StatusBadgeComponent } from './ui/status-badge.component';
import { TableStateComponent } from './ui/table-state.component';
import { touchAll } from './utils';

/** Bare hostname — no scheme, port or path. */
const HOSTNAME = /^(?!https?:)(?!.*\/)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Domain management for a company. `basePath` differs per portal —
 * `/companies/:id/domains` for the super admin, `/my-company/domains` for the
 * tenant — so the same panel serves both.
 */
@Component({
  selector: 'app-domain-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, StatusBadgeComponent, TableStateComponent, ModalComponent, FieldErrorComponent],
  templateUrl: './domain-manager.component.html',
})
export class DomainManagerComponent {
  /** `/companies/12/domains` or `/my-company/domains`. */
  readonly basePath = input.required<string>();
  /** Branches available to pin a domain to. */
  readonly branches = input<Option[]>([]);
  readonly canEdit = input(true);
  /** Emitted after every load so a host can keep its tab count in step. */
  readonly countChange = output<number>();

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly rows = signal<CompanyDomain[]>([]);
  readonly loading = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<CompanyDomain | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    domain: ['', [Validators.required, Validators.pattern(HOSTNAME)]],
    subCompanyId: [null as number | null],
    isPrimary: [false],
    status: ['active'],
  });

  constructor() {
    // A required input cannot be read while the component is being constructed,
    // so the first fetch waits for an effect — which also re-runs if the host
    // ever swaps the path.
    effect(() => {
      const path = this.basePath();
      if (path) this.fetch(path);
    });
  }

  /** Re-reads the current list; safe to call once the inputs are bound. */
  load(): void {
    this.fetch(this.basePath());
  }

  private fetch(path: string): void {
    this.loading.set(true);
    this.api.get<CompanyDomain[]>(path).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.countChange.emit(rows.length);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openModal(row: CompanyDomain | null): void {
    this.editing.set(row);
    this.form.reset({
      domain: row?.domain ?? '',
      subCompanyId: row?.subCompanyId ?? null,
      isPrimary: row?.isPrimary ?? false,
      status: row?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const payload = this.form.getRawValue();
    const row = this.editing();
    this.saving.set(true);

    const request = row
      ? this.api.put<CompanyDomain>(`${this.basePath()}/${row.id}`, payload)
      : this.api.post<CompanyDomain>(this.basePath(), payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(row ? 'Domain updated' : 'Domain added');
        this.modalOpen.set(false);
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the domain', messageOf(error));
      },
    });
  }

  makePrimary(row: CompanyDomain): void {
    this.api.put<CompanyDomain>(`${this.basePath()}/${row.id}`, { isPrimary: true }).subscribe({
      next: () => {
        this.toast.success(`${row.domain} is now the primary domain`);
        this.load();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not update the domain', messageOf(error)),
    });
  }

  toggleStatus(row: CompanyDomain): void {
    this.api.patch(`${this.basePath()}/${row.id}/status`, {}).subscribe({
      next: () => {
        this.toast.success(`${row.domain} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.load();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async remove(row: CompanyDomain): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${row.domain}?`,
      message: 'That host will stop resolving to this company and its login screen will fall back to platform branding.',
      confirmText: 'Delete domain',
      danger: true,
    });
    if (!ok) return;

    this.api.delete(`${this.basePath()}/${row.id}`).subscribe({
      next: () => {
        this.toast.success('Domain deleted');
        this.load();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the domain', messageOf(error)),
    });
  }
}
