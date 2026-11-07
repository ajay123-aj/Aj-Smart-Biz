import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ListQuery, PageMeta, PagedResult } from '../models/api.model';
import {
  Invoice,
  InvoiceInput,
  InvoiceMeta,
  InvoiceProduct,
  InvoiceSummary,
  InvoiceAccess,
  InvoiceAnalysis,
  InvoiceScope,
} from '../models/invoice.model';

const BASE = '/admin/company/invoices';

/** Counter invoices. Every figure is recomputed by the API; the screen only previews. */
@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly api = inject(ApiService);

  meta(): Observable<InvoiceMeta> {
    return this.api.get<InvoiceMeta>(`${BASE}/meta`);
  }

  summary(scope: InvoiceScope = 'mine'): Observable<InvoiceSummary> {
    return this.api.get<InvoiceSummary>(`${BASE}/summary`, { scope });
  }

  /** What this admin may see: their own invoices, or everyone's, and the analysis. */
  access(): Observable<InvoiceAccess> {
    return this.api.get<InvoiceAccess>(`${BASE}/access`);
  }

  /** Product-wise, admin-wise and revenue analysis of issued invoices. */
  analysis(query: ListQuery = {}): Observable<InvoiceAnalysis> {
    return this.api.get<InvoiceAnalysis>(`${BASE}/analysis`, query);
  }

  products(query: ListQuery = {}): Observable<{ data: InvoiceProduct[]; meta: PageMeta }> {
    return this.api.getWithMeta<InvoiceProduct[]>(`${BASE}/products`, query);
  }

  list(query: ListQuery = {}): Observable<PagedResult<Invoice>> {
    return this.api.list<Invoice>(BASE, query);
  }

  get(id: number): Observable<Invoice> {
    return this.api.get<Invoice>(`${BASE}/${id}`);
  }

  create(body: InvoiceInput): Observable<Invoice> {
    return this.api.post<Invoice>(BASE, body);
  }

  update(id: number, body: InvoiceInput): Observable<Invoice> {
    return this.api.put<Invoice>(`${BASE}/${id}`, body);
  }

  issue(id: number): Observable<Invoice> {
    return this.api.post<Invoice>(`${BASE}/${id}/issue`);
  }

  recordPayment(id: number, body: { amountPaid: number; paymentMode: string | null; paymentReference: string }): Observable<Invoice> {
    return this.api.patch<Invoice>(`${BASE}/${id}/payment`, body);
  }

  cancel(id: number, reason: string): Observable<Invoice> {
    return this.api.post<Invoice>(`${BASE}/${id}/cancel`, { reason });
  }

  remove(id: number): Observable<unknown> {
    return this.api.delete(`${BASE}/${id}`);
  }
}
