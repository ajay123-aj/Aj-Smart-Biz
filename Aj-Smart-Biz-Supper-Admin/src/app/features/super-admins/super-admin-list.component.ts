import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { CrudFactory } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { SuperAdmin } from '../../core/models/domain.model';
import { CrudPage } from '../../shared/crud-page';
import { initials, strongPassword } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-super-admin-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './super-admin-list.component.html',
})
export class SuperAdminListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  readonly resetTarget = signal<SuperAdmin | null>(null);
  readonly resetting = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['', [Validators.required, strongPassword]],
    role: ['staff'],
    status: ['active'],
  });

  readonly resetForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, strongPassword]],
  });

  readonly page = new CrudPage<SuperAdmin>({
    client: inject(CrudFactory).for<SuperAdmin>('/super-admins'),
    label: 'super admin',
    toast: inject(ToastService),
    confirm: inject(ConfirmService),
    form: this.form,
    toForm: (row) => ({
      name: row?.name ?? '',
      email: row?.email ?? '',
      phone: row?.phone ?? '',
      password: '',
      role: row?.role ?? 'staff',
      status: row?.status ?? 'active',
    }),
    // An untouched password field on edit must not be sent at all.
    toPayload: (raw) => {
      const payload: Record<string, unknown> = { ...raw, phone: raw['phone'] || null };
      if (!raw['password']) delete payload['password'];
      return payload;
    },
    initialQuery: { sortBy: 'name', sortOrder: 'asc' },
  });

  constructor() {
    this.page.load();
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  /** Password is mandatory when creating and optional when editing. */
  openCreate(): void {
    this.form.controls.password.setValidators([
      Validators.required, strongPassword,
    ]);
    this.form.controls.password.updateValueAndValidity();
    this.page.openCreate();
  }

  openEdit(row: SuperAdmin): void {
    this.form.controls.password.setValidators([strongPassword]);
    this.form.controls.password.updateValueAndValidity();
    this.page.openEdit(row);
  }

  openReset(row: SuperAdmin): void {
    this.resetForm.reset({ newPassword: '' });
    this.resetTarget.set(row);
  }

  submitReset(): void {
    const target = this.resetTarget();
    if (!target || this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.resetting.set(true);
    this.api
      .patch(`/super-admins/${target.id}/reset-password`, this.resetForm.getRawValue())
      .subscribe({
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
}
