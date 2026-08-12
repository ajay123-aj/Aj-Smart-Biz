import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { tap } from 'rxjs';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { UploadService } from '../../core/services/upload.service';
import { Branch, Option, QuotaView } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { LimitNoticeComponent } from '../../shared/ui/limit-notice.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-branch-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CanDirective,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
    ImageUploadComponent,
    LimitNoticeComponent,
  ],
  templateUrl: './branch-manager.component.html',
  styles: [
    `
      .logo-cell {
        width: 34px; height: 34px; flex-shrink: 0;
        border-radius: 8px; overflow: hidden;
        border: 1px solid var(--border);
        background: var(--surface-2);
        display: grid; place-items: center;
      }
      .logo-cell img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }
      .logo-fallback { font-weight: 700; font-size: 13px; color: var(--text-3); }
    `,
  ],
})
export class BranchManagerComponent {
  /** Emitted after every load so the host tab can show a live count. */
  readonly countChange = output<number>();

  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly crud = inject(CrudFactory);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly uploads = inject(UploadService);

  readonly store = new ListStore<Branch>((query) =>
    this.companies.listBranches(query).pipe(tap((result) => this.countChange.emit(result.meta.total)))
  );
  readonly states = signal<Option[]>([]);
  readonly modalOpen = signal(false);
  readonly editing = signal<Branch | null>(null);
  readonly saving = signal(false);

  /**
   * What the plan still allows. The API decides; this screen only renders that
   * decision, so the button and the guard can never disagree.
   */
  readonly quota = signal<QuotaView | null>(null);
  readonly branchLimit = computed(() => this.quota()?.metrics?.branches ?? null);
  readonly canAddBranch = computed(() => this.branchLimit()?.canCreate ?? true);

  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    code: [''],
    logo: [null as string | null],
    favicon: [null as string | null],
    phone: [''],
    email: ['', [Validators.email]],
    gstNumber: [''],
    addressLine1: [''],
    stateId: [null as number | null],
    city: [''],
    pincode: [''],
    openingTime: [''],
    closingTime: [''],
    status: ['active'],
  });

  constructor() {
    this.store.reload();
    this.loadQuota();
    this.crud.for<Option>(MASTER_PATHS.states).dropdown().subscribe((rows) => this.states.set(rows));
  }

  /** Re-read after any create or delete: the headroom just moved. */
  private loadQuota(): void {
    this.companies.branchQuota().subscribe({
      next: (data) => this.quota.set(data),
      error: () => this.quota.set(null),
    });
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  logoUrl(branch: Branch): string | null {
    return this.uploads.toUrl(branch.logo);
  }

  onSearch(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.patch({ search }), 350);
  }

  openModal(branch: Branch | null): void {
    // Editing an existing branch is always allowed; only adding consumes quota.
    if (!branch && !this.canAddBranch()) {
      this.toast.warning('Branch limit reached', this.branchLimit()?.message ?? undefined);
      return;
    }
    this.editing.set(branch);
    this.form.reset({
      name: branch?.name ?? '',
      code: branch?.code ?? '',
      logo: branch?.logo ?? null,
      favicon: branch?.favicon ?? null,
      phone: branch?.phone ?? '',
      email: branch?.email ?? '',
      gstNumber: branch?.gstNumber ?? '',
      addressLine1: branch?.addressLine1 ?? '',
      stateId: branch?.stateId ?? null,
      city: branch?.city ?? '',
      pincode: branch?.pincode ?? '',
      openingTime: branch?.openingTime?.slice(0, 5) ?? '',
      closingTime: branch?.closingTime?.slice(0, 5) ?? '',
      status: branch?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const payload = cleanPayload(this.form.getRawValue() as Record<string, unknown>) as Record<string, unknown>;
    const branch = this.editing();
    this.saving.set(true);

    const request = branch
      ? this.companies.updateBranch(branch.id, payload)
      : this.companies.createBranch(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(branch ? 'Branch updated' : 'Branch added');
        this.modalOpen.set(false);
        this.store.reload();
        this.loadQuota();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the branch', messageOf(error));
      },
    });
  }

  toggleStatus(row: Branch): void {
    this.companies.toggleBranchStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`${row.name} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async remove(row: Branch): Promise<void> {
    if (!(await this.confirm.askDelete(`the branch "${row.name}"`))) return;

    this.companies.removeBranch(row.id).subscribe({
      next: () => {
        this.toast.success('Branch deleted');
        this.store.reloadAfterDelete();
        this.loadQuota();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the branch', messageOf(error)),
    });
  }
}
