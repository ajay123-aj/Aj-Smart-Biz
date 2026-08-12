import { FormGroup } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ListQuery } from '../core/models/api.model';
import { Status } from '../core/models/domain.model';
import { CrudClient } from '../core/services/crud.service';
import { ConfirmService } from '../core/services/confirm.service';
import { ToastService } from '../core/services/toast.service';
import { messageOf } from '../core/interceptors/auth.interceptor';
import { ListStore } from './list-store';
import { cleanPayload, touchAll } from './utils';

export interface CrudRow {
  id: number;
  name: string;
  status: Status;
}

export interface CrudPageConfig<T extends CrudRow> {
  client: CrudClient<T>;
  /** Singular, lower case — used in toasts and confirmations ("plan", "theme"). */
  label: string;
  toast: ToastService;
  confirm: ConfirmService;
  form: FormGroup;
  /** Maps a row onto form values; called with `null` for the create form. */
  toForm: (row: T | null) => Record<string, unknown>;
  /** Last chance to reshape the payload before it is sent. */
  toPayload?: (raw: Record<string, unknown>) => Record<string, unknown>;
  initialQuery?: ListQuery;
}

/**
 * List + modal-form behaviour shared by every master screen: paging, debounced
 * search, status filter, create/edit, status toggle and soft delete.
 * Components own an instance and supply only their template and form.
 */
export class CrudPage<T extends CrudRow> {
  readonly store: ListStore<T>;
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly editing = signal<T | null>(null);

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly config: CrudPageConfig<T>) {
    this.store = new ListStore<T>((query) => config.client.list(query), config.initialQuery ?? {});
  }

  get form(): FormGroup {
    return this.config.form;
  }

  load(): void {
    this.store.reload();
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.patch({ search: value }), 350);
  }

  onStatus(event: Event): void {
    this.store.patch({ status: (event.target as HTMLSelectElement).value });
  }

  openCreate(): void {
    this.editing.set(null);
    this.config.form.reset(this.config.toForm(null));
    this.modalOpen.set(true);
  }

  openEdit(row: T): void {
    this.editing.set(row);
    this.config.form.reset(this.config.toForm(row));
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editing.set(null);
  }

  save(): void {
    const form = this.config.form;
    if (form.invalid) {
      touchAll(form);
      return;
    }

    const raw = form.getRawValue() as Record<string, unknown>;
    const payload = (this.config.toPayload ? this.config.toPayload(raw) : cleanPayload(raw)) as Partial<T>;
    const current = this.editing();
    this.saving.set(true);

    const request = current
      ? this.config.client.update(current.id, payload)
      : this.config.client.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.config.toast.success(current ? `${this.titleLabel} updated` : `${this.titleLabel} created`);
        this.closeModal();
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.config.toast.error(`Could not save the ${this.config.label}`, messageOf(error));
      },
    });
  }

  toggleStatus(row: T): void {
    const next = row.status === 'active' ? 'inactive' : 'active';
    this.config.client.toggleStatus(row.id).subscribe({
      next: () => {
        this.config.toast.success(`${row.name} is now ${next}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.config.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async remove(row: T): Promise<void> {
    const ok = await this.config.confirm.askDelete(`the ${this.config.label} "${row.name}"`);
    if (!ok) return;

    this.config.client.remove(row.id).subscribe({
      next: () => {
        this.config.toast.success(`${this.titleLabel} deleted`);
        this.store.reloadAfterDelete();
      },
      error: (error: HttpErrorResponse) =>
        this.config.toast.error(`Could not delete the ${this.config.label}`, messageOf(error)),
    });
  }

  private get titleLabel(): string {
    return this.config.label.charAt(0).toUpperCase() + this.config.label.slice(1);
  }
}
