import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessService } from '../../core/services/access.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Role, RoleAdminsView } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-role-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CanDirective,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './role-list.component.html',
})
export class RoleListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly access = inject(AccessService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly store = new ListStore<Role>((query) => this.access.listRoles(query));
  readonly modalOpen = signal(false);
  readonly editing = signal<Role | null>(null);
  readonly saving = signal(false);

  private searchTimer?: ReturnType<typeof setTimeout>;

  /* ------------------------- Assign admins dialog ------------------------- */
  readonly assignRole = signal<Role | null>(null);
  readonly assignView = signal<RoleAdminsView | null>(null);
  readonly assignPicked = signal<Set<number>>(new Set());
  readonly assignSaving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    status: ['active'],
  });

  constructor() {
    this.store.reload();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  onSearch(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.patch({ search }), 350);
  }

  openModal(role: Role | null): void {
    this.editing.set(role);
    this.form.reset({
      name: role?.name ?? '',
      description: role?.description ?? '',
      status: role?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const payload = cleanPayload(this.form.getRawValue() as Record<string, unknown>) as Record<string, unknown>;
    const role = this.editing();
    this.saving.set(true);

    const request = role ? this.access.updateRole(role.id, payload) : this.access.createRole(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(role ? 'Role updated' : 'Role created');
        this.modalOpen.set(false);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the role', messageOf(error));
      },
    });
  }

  /** Opens the dialog with every admin ticked who holds the role now. */
  openAssign(role: Role): void {
    this.assignRole.set(role);
    this.assignView.set(null);
    this.access.roleAdmins(role.id).subscribe({
      next: (view) => {
        this.assignView.set(view);
        this.assignPicked.set(new Set(view.admins.filter((admin) => admin.holds).map((admin) => admin.id)));
      },
      error: (error: HttpErrorResponse) => {
        this.assignRole.set(null);
        this.toast.error('Could not load the admins', messageOf(error));
      },
    });
  }

  isPicked(id: number): boolean {
    return this.assignPicked().has(id);
  }

  togglePick(id: number): void {
    const next = new Set(this.assignPicked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.assignPicked.set(next);
  }

  /** Other roles the admin holds, for context next to their name. */
  otherRoles(admin: RoleAdminsView['admins'][number]): string {
    const roleId = this.assignRole()?.id;
    return admin.roles.filter((role) => role.id !== roleId).map((role) => role.name).join(', ');
  }

  saveAssign(): void {
    const role = this.assignRole();
    if (!role) return;
    this.assignSaving.set(true);
    this.access.syncRoleAdmins(role.id, [...this.assignPicked()]).subscribe({
      next: (result) => {
        this.assignSaving.set(false);
        this.toast.success(result.changed ? `Updated ${result.changed} admin(s)` : 'No changes');
        this.assignRole.set(null);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.assignSaving.set(false);
        this.toast.error('Could not update the assignments', messageOf(error));
      },
    });
  }

  toggleStatus(row: Role): void {
    this.access.toggleRoleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`${row.name} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async remove(row: Role): Promise<void> {
    if (!(await this.confirm.askDelete(`the role "${row.name}"`))) return;

    this.access.removeRole(row.id).subscribe({
      next: () => {
        this.toast.success('Role deleted');
        this.store.reloadAfterDelete();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the role', messageOf(error)),
    });
  }
}
