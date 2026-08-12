import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import { Option, Status } from '../models/domain.model';
import { ApiService } from './api.service';

/**
 * The four master tables (states, business types, themes, plans) share one REST
 * shape, so they share one client. `MASTER_PATHS` names the endpoints.
 */
export class CrudClient<T> {
  constructor(private readonly api: ApiService, private readonly path: string) {}

  list(query: ListQuery = {}): Observable<PagedResult<T>> {
    return this.api.list<T>(this.path, query);
  }

  dropdown(): Observable<Option[]> {
    return this.api.get<Option[]>(`${this.path}/dropdown`);
  }

  getById(id: number): Observable<T> {
    return this.api.get<T>(`${this.path}/${id}`);
  }

  create(payload: Partial<T>): Observable<T> {
    return this.api.post<T>(this.path, payload);
  }

  update(id: number, payload: Partial<T>): Observable<T> {
    return this.api.put<T>(`${this.path}/${id}`, payload);
  }

  toggleStatus(id: number, status?: Status): Observable<{ id: number; status: Status }> {
    return this.api.patch<{ id: number; status: Status }>(`${this.path}/${id}/status`, status ? { status } : {});
  }

  remove(id: number): Observable<{ id: number }> {
    return this.api.delete<{ id: number }>(`${this.path}/${id}`);
  }

  restore(id: number): Observable<T> {
    return this.api.post<T>(`${this.path}/${id}/restore`);
  }
}

export const MASTER_PATHS = {
  states: '/masters/states',
  businessTypes: '/masters/business-types',
  themes: '/masters/themes',
  plans: '/masters/plans',
} as const;

/** Factory so a feature can do `crud.for<Plan>(MASTER_PATHS.plans)`. */
@Injectable({ providedIn: 'root' })
export class CrudFactory {
  private readonly api = inject(ApiService);
  private readonly cache = new Map<string, CrudClient<unknown>>();

  for<T>(path: string): CrudClient<T> {
    if (!this.cache.has(path)) this.cache.set(path, new CrudClient<unknown>(this.api, path));
    return this.cache.get(path) as CrudClient<T>;
  }
}
