import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, EMPTY_META, ListQuery, PageMeta, PagedResult } from '../models/api.model';

/**
 * Thin HttpClient wrapper that unwraps the `{ success, message, data, meta }`
 * envelope so components only ever see domain objects.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private toParams(query: ListQuery = {}): HttpParams {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params = params.set(key, String(value));
    });
    return params;
  }

  /** GET returning a paginated list plus its meta block. */
  list<T>(path: string, query: ListQuery = {}): Observable<PagedResult<T>> {
    return this.http
      .get<ApiResponse<T[]>>(`${this.base}${path}`, { params: this.toParams(query) })
      .pipe(map((res) => ({ items: res.data ?? [], meta: res.meta ?? { ...EMPTY_META } })));
  }

  /**
   * GET that keeps the envelope's `meta` alongside its `data`.
   *
   * For a paginated list whose payload is not simply the rows — the
   * testimonial queue sends the moderation counts with them, because a count
   * the browser works out from a filtered page is a count of that page. `list`
   * cannot carry those, and `get` throws the page away, so this returns both
   * halves and lets the caller decide what each is for.
   */
  getWithMeta<T>(path: string, query: ListQuery = {}): Observable<{ data: T; meta: PageMeta }> {
    return this.http
      .get<ApiResponse<T>>(`${this.base}${path}`, { params: this.toParams(query) })
      .pipe(map((res) => ({ data: res.data, meta: res.meta ?? { ...EMPTY_META } })));
  }

  get<T>(path: string, query: ListQuery = {}): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(`${this.base}${path}`, { params: this.toParams(query) })
      .pipe(map((res) => res.data));
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((res) => res.data));
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.put<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((res) => res.data));
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.patch<ApiResponse<T>>(`${this.base}${path}`, body).pipe(map((res) => res.data));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(`${this.base}${path}`).pipe(map((res) => res.data));
  }

  /** Same as `post` but keeps the envelope, for endpoints whose message matters. */
  postRaw<T>(path: string, body: unknown = {}): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(`${this.base}${path}`, body);
  }
}
