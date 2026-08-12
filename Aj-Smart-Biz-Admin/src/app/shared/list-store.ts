import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { EMPTY_META, ListQuery, PageMeta, PagedResult } from '../core/models/api.model';

/**
 * Paging / search / sort state for a list screen. Components own an instance,
 * bind to its signals and call the mutators; every mutator reloads.
 */
export class ListStore<T> {
  readonly items = signal<T[]>([]);
  readonly meta = signal<PageMeta>({ ...EMPTY_META });
  readonly loading = signal(false);
  readonly query = signal<ListQuery>({ page: 1, limit: 10 });

  constructor(
    private readonly loader: (query: ListQuery) => Observable<PagedResult<T>>,
    initial: ListQuery = {}
  ) {
    this.query.update((current) => ({ ...current, ...initial }));
  }

  reload(): void {
    this.loading.set(true);
    this.loader(this.query()).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.meta.set(result.meta);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Applies filters; anything other than a page change jumps back to page 1. */
  patch(partial: ListQuery, resetPage = true): void {
    this.query.update((current) => ({ ...current, ...partial, ...(resetPage ? { page: 1 } : {}) }));
    this.reload();
  }

  setPage(page: number): void {
    this.patch({ page }, false);
  }

  setLimit(limit: number): void {
    this.patch({ limit });
  }

  /** Click a column: asc -> desc -> asc on the same field, asc on a new one. */
  toggleSort(field: string): void {
    const { sortBy, sortOrder } = this.query();
    const nextOrder: 'asc' | 'desc' = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    this.patch({ sortBy: field, sortOrder: nextOrder });
  }

  sortIcon(field: string): string {
    const { sortBy, sortOrder } = this.query();
    if (sortBy !== field) return '';
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  }

  /** Re-fetches the current page, stepping back when the last row was removed. */
  reloadAfterDelete(): void {
    const page = this.query().page ?? 1;
    if (this.items().length === 1 && page > 1) this.setPage(page - 1);
    else this.reload();
  }
}
