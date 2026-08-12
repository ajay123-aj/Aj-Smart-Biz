import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessService } from '../../core/services/access.service';
import { CompanyService } from '../../core/services/company.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { CompanyAdmin, Option, QuotaView } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload, initials, touchAll, strongPassword } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { LimitNoticeComponent } from '../../shared/ui/limit-notice.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-admin-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    CanDirective,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
    LimitNoticeComponent,
  ],
  templateUrl: './admin-list.component.html',
})
export class AdminListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly access = inject(AccessService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly auth = inject(AuthService);

  readonly store = new ListStore<CompanyAdmin>((query) => this.access.listAdmins(query));
  readonly roles = signal<Option[]>([]);
  readonly branches = signal<Option[]>([]);

  readonly modalOpen = signal(false);
  readonly editing = signal<CompanyAdmin | null>(null);
  readonly saving = signal(false);
  readonly generated = signal<{ name: string; email: string; password: string } | null>(null);

  readonly resetTarget = signal<CompanyAdmin | null>(null);
  readonly resetting = signal(false);

  /** What the plan still allows; the API's answer, rendered rather than re-derived. */
  readonly quota = signal<QuotaView | null>(null);
  readonly adminLimit = computed(() => this.quota()?.metrics?.admins ?? null);
  readonly canAddAdmin = computed(() => this.adminLimit()?.canCreate ?? true);

  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    roleId: [null as number | null, [Validators.required]],
    branchId: [null as number | null],
    password: ['', [strongPassword]],
    status: ['active'],
  });

  readonly resetForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, strongPassword]],
  });

  constructor() {
    this.store.reload();
    this.loadQuota();
    this.access.roleOptions().subscribe((rows) => this.roles.set(rows));
    this.companies
      .listBranches({ limit: 100, status: 'active' })
      .subscribe((result) => this.branches.set(result.items.map((branch) => ({ id: branch.id, name: branch.name }))));
  }

  /** Re-read after any create or delete: the headroom just moved. */
  private loadQuota(): void {
    this.access.adminQuota().subscribe({
      next: (data) => this.quota.set(data),
      error: () => this.quota.set(null),
    });
  }

  /** The built-in company admin role is never assignable by hand. */
  assignableRoles(): Option[] {
    return this.roles().filter((role) => role.name !== 'Company Admin');
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  onSearch(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.patch({ search }), 350);
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  openModal(admin: CompanyAdmin | null): void {
    // Editing an existing admin is always allowed; only adding consumes quota.
    if (!admin && !this.canAddAdmin()) {
      this.toast.warning('Admin limit reached', this.adminLimit()?.message ?? undefined);
      return;
    }
    this.editing.set(admin);
    this.form.reset({
      name: admin?.name ?? '',
      email: admin?.email ?? '',
      phone: admin?.phone ?? '',
      roleId: admin?.roleId ?? null,
      branchId: admin?.branchId ?? null,
      password: '',
      status: admin?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const raw = this.form.getRawValue();
    const admin = this.editing();
    this.saving.set(true);

    if (admin) {
      const payload = cleanPayload({
        name: raw.name,
        email: raw.email,
        phone: raw.phone,
        roleId: raw.roleId,
        branchId: raw.branchId,
        status: raw.status,
      }) as Record<string, unknown>;

      this.access.updateAdmin(admin.id, payload).subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Admin updated');
          this.modalOpen.set(false);
          this.store.reload();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not update the admin', messageOf(error));
        },
      });
      return;
    }

    const payload: Record<string, unknown> = {
      name: raw.name,
      email: raw.email,
      phone: raw.phone || null,
      roleId: raw.roleId,
      branchId: raw.branchId,
      ...(raw.password ? { password: raw.password } : {}),
    };

    this.access.createAdmin(payload).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.toast.success('Admin created');
        this.modalOpen.set(false);
        this.store.reload();
        this.loadQuota();
        if (created.generatedPassword) {
          this.generated.set({ name: created.name, email: created.email, password: created.generatedPassword });
        }
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not create the admin', messageOf(error));
      },
    });
  }

  toggleStatus(row: CompanyAdmin): void {
    this.access.toggleAdminStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`${row.name} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async remove(row: CompanyAdmin): Promise<void> {
    if (!(await this.confirm.askDelete(`the admin "${row.name}"`))) return;

    this.access.removeAdmin(row.id).subscribe({
      next: () => {
        this.toast.success('Admin deleted');
        this.store.reloadAfterDelete();
        this.loadQuota();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the admin', messageOf(error)),
    });
  }

  openReset(row: CompanyAdmin): void {
    this.resetForm.reset({ newPassword: '' });
    this.resetTarget.set(row);
  }

  submitReset(): void {
    const target = this.resetTarget();
    if (!target || this.resetForm.invalid) {
      touchAll(this.resetForm);
      return;
    }

    this.resetting.set(true);
    this.access.resetAdminPassword(target.id, this.resetForm.getRawValue().newPassword).subscribe({
      next: () => {
        this.resetting.set(false);
        this.toast.success(`Password reset for ${target.name}`);
        this.resetTarget.set(null);
      },
      error: (error: HttpErrorResponse) => {
        this.resetting.set(false);
        this.toast.error('Could not reset the password', messageOf(error));
      },
    });
  }

  copy(creds: { name: string; email: string; password: string }): void {
    void navigator.clipboard
      ?.writeText(`Name: ${creds.name}\nEmail: ${creds.email}\nPassword: ${creds.password}`)
      .then(() => this.toast.success('Credentials copied'));
  }
}
