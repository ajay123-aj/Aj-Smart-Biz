import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessService } from '../../core/services/access.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Menu,
  Option,
  PERMISSION_ACTIONS,
  PermissionAction,
  PermissionRow,
} from '../../core/models/domain.model';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

type Tab = 'matrix' | 'menus';

const ACTION_LABELS: Record<PermissionAction, string> = {
  canView: 'View',
  canCreate: 'Create',
  canEdit: 'Edit',
  canDelete: 'Delete',
  canExport: 'Export',
};

@Component({
  selector: 'app-menu-permission',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CanDirective,
    PageHeaderComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './menu-permission.component.html',
  styles: [
    `
      .cell-check { width: 17px; height: 17px; accent-color: var(--brand-600); cursor: pointer; }
      .cell-check:disabled { cursor: not-allowed; opacity: .6; }
      .notice {
        margin: 16px;
        padding: 11px 14px;
        background: var(--info-bg);
        color: var(--info);
        border-radius: var(--radius-sm);
        font-size: 13px;
      }
      table.table th.text-center, table.table td.text-center { text-align: center; }
    `,
  ],
})
export class MenuPermissionComponent {
  private readonly fb = inject(FormBuilder);
  private readonly access = inject(AccessService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);

  readonly actions = PERMISSION_ACTIONS;
  readonly tab = signal<Tab>('matrix');

  readonly roles = signal<Option[]>([]);
  readonly selectedRoleId = signal<number | null>(null);
  readonly matrix = signal<{ role: { id: number; name: string; isSystem: boolean } } | null>(null);
  /** Working copy of the grid; only written back when the user saves. */
  readonly rows = signal<PermissionRow[]>([]);
  readonly loadingMatrix = signal(false);
  readonly savingMatrix = signal(false);

  readonly menus = signal<Menu[]>([]);
  readonly loadingMenus = signal(false);
  readonly menuModalOpen = signal(false);
  readonly editingMenu = signal<Menu | null>(null);
  readonly savingMenu = signal(false);

  /** Only menus that can be a parent — never the row being edited. */
  readonly menuOptions = computed(() =>
    this.menus()
      .filter((menu) => menu.id !== this.editingMenu()?.id)
      .map((menu) => ({ id: menu.id, name: menu.name }))
  );

  readonly menuForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    icon: [''],
    route: [''],
    parentId: [null as number | null],
    sequence: [0],
    status: ['active'],
  });

  constructor() {
    this.access.roleOptions().subscribe((rows) => {
      this.roles.set(rows);
      // `/roles` links here with ?roleId=… so the grid opens on the right role.
      const fromQuery = Number(this.route.snapshot.queryParamMap.get('roleId'));
      const initial = Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : rows[0]?.id;
      if (initial) this.loadMatrix(initial);
    });
    this.loadMenus();
  }

  label(action: PermissionAction): string {
    return ACTION_LABELS[action];
  }

  /* ---------------------------- permissions ---------------------------- */

  selectRole(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!value) {
      this.selectedRoleId.set(null);
      this.matrix.set(null);
      this.rows.set([]);
      return;
    }
    this.loadMatrix(value);
  }

  private loadMatrix(roleId: number): void {
    this.selectedRoleId.set(roleId);
    this.loadingMatrix.set(true);
    this.access.getPermissions(roleId).subscribe({
      next: (result) => {
        this.matrix.set({ role: result.role });
        this.rows.set(result.permissions.map((row) => ({ ...row })));
        this.loadingMatrix.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadingMatrix.set(false);
        this.toast.error('Could not load the permissions', messageOf(error));
      },
    });
  }

  toggleCell(menuId: number, action: PermissionAction, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.rows.update((rows) =>
      rows.map((row) => {
        if (row.menuId !== menuId) return row;
        const next = { ...row, [action]: checked };
        // Any grant implies visibility; removing view removes everything else.
        if (checked && action !== 'canView') next.canView = true;
        if (!checked && action === 'canView') {
          PERMISSION_ACTIONS.forEach((item) => (next[item] = false));
        }
        return next;
      })
    );
  }

  toggleColumn(action: PermissionAction): void {
    const allChecked = this.rows().every((row) => row[action]);
    this.rows.update((rows) =>
      rows.map((row) => {
        const next = { ...row, [action]: !allChecked };
        if (!allChecked && action !== 'canView') next.canView = true;
        if (allChecked && action === 'canView') PERMISSION_ACTIONS.forEach((item) => (next[item] = false));
        return next;
      })
    );
  }

  setAll(value: boolean): void {
    this.rows.update((rows) =>
      rows.map((row) => {
        const next = { ...row };
        PERMISSION_ACTIONS.forEach((action) => (next[action] = value));
        return next;
      })
    );
  }

  savePermissions(): void {
    const roleId = this.selectedRoleId();
    if (!roleId) return;

    // Only rows with at least one flag are worth persisting.
    const permissions = this.rows()
      .filter((row) => PERMISSION_ACTIONS.some((action) => row[action]))
      .map((row) => ({
        menuId: row.menuId,
        canView: row.canView,
        canCreate: row.canCreate,
        canEdit: row.canEdit,
        canDelete: row.canDelete,
        canExport: row.canExport,
      }));

    this.savingMatrix.set(true);
    this.access.syncPermissions(roleId, permissions).subscribe({
      next: () => {
        this.savingMatrix.set(false);
        this.toast.success('Permissions updated', 'Affected admins see the change on their next sign in.');
      },
      error: (error: HttpErrorResponse) => {
        this.savingMatrix.set(false);
        this.toast.error('Could not save the permissions', messageOf(error));
      },
    });
  }

  /* -------------------------------- menus ------------------------------- */

  private loadMenus(): void {
    this.loadingMenus.set(true);
    this.access.listMenus({ limit: 100, sortBy: 'sequence', sortOrder: 'asc' }).subscribe({
      next: (result) => {
        this.menus.set(result.items);
        this.loadingMenus.set(false);
      },
      error: () => this.loadingMenus.set(false),
    });
  }

  openMenuModal(menu: Menu | null): void {
    this.editingMenu.set(menu);
    this.menuForm.reset({
      name: menu?.name ?? '',
      slug: menu?.slug ?? '',
      icon: menu?.icon ?? '',
      route: menu?.route ?? '',
      parentId: menu?.parentId ?? null,
      sequence: menu?.sequence ?? this.menus().length + 1,
      status: menu?.status ?? 'active',
    });
    this.menuModalOpen.set(true);
  }

  saveMenu(): void {
    if (this.menuForm.invalid) {
      touchAll(this.menuForm);
      return;
    }

    const payload = cleanPayload(this.menuForm.getRawValue() as Record<string, unknown>) as Record<string, unknown>;
    const menu = this.editingMenu();
    this.savingMenu.set(true);

    const request = menu ? this.access.updateMenu(menu.id, payload) : this.access.createMenu(payload);
    request.subscribe({
      next: () => {
        this.savingMenu.set(false);
        this.toast.success(menu ? 'Menu updated' : 'Menu created');
        this.menuModalOpen.set(false);
        this.loadMenus();
        // The new menu becomes a row in the grid, so reload it too.
        const roleId = this.selectedRoleId();
        if (roleId) this.loadMatrix(roleId);
      },
      error: (error: HttpErrorResponse) => {
        this.savingMenu.set(false);
        this.toast.error('Could not save the menu', messageOf(error));
      },
    });
  }

  async removeMenu(menu: Menu): Promise<void> {
    if (!(await this.confirm.askDelete(`the menu "${menu.name}"`))) return;

    this.access.removeMenu(menu.id).subscribe({
      next: () => {
        this.toast.success('Menu deleted');
        this.loadMenus();
        const roleId = this.selectedRoleId();
        if (roleId) this.loadMatrix(roleId);
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the menu', messageOf(error)),
    });
  }
}
