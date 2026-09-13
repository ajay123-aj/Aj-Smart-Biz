import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListQuery, PagedResult } from '../models/api.model';
import {
  CompanyInsights,
  PlatformCustomer,
  PlatformCustomerSummary,
} from '../models/domain.model';
import { ApiService } from './api.service';

/**
 * What the platform can see across its tenants.
 *
 * Its own client rather than more methods on the company one, matching the API:
 * a cross-tenant read is a different question from anything done *to* a company,
 * and the endpoints behind it are deliberately separate so that neither can be
 * reached by accident from the other.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly api = inject(ApiService);

  /** Every customer on the platform. `companyId` narrows it to one tenant. */
  customers(query: ListQuery = {}): Observable<PagedResult<PlatformCustomer>> {
    return this.api.list<PlatformCustomer>('/super-admin/customers', query);
  }

  customerSummary(query: ListQuery = {}): Observable<PlatformCustomerSummary> {
    return this.api.get<PlatformCustomerSummary>('/super-admin/customers/summary', query);
  }

  /**
   * How one tenant is doing — sales, catalogue, stock, services and accounts, in
   * one request. Blocks they have not bought come back null; see `CompanyInsights`.
   */
  companyInsights(companyId: number, days = 30): Observable<CompanyInsights> {
    return this.api.get<CompanyInsights>(`/super-admin/companies/${companyId}/insights`, { days });
  }
}
