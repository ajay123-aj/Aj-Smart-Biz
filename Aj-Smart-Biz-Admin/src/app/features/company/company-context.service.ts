import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Company } from '../../core/models/domain.model';

/**
 * The one company payload every Company Details screen shares.
 *
 * The sections used to be tabs on a single component, which loaded the company
 * once and handed pieces of it down. They are their own routes now, so
 * something has to outlive a single screen or every click would refetch. This
 * service is provided on the `/company` route: it is created when the section
 * is entered, shared by the layout and whichever child is showing, and thrown
 * away on the way out.
 *
 * It also carries the counts the children discover — a page that lists domains
 * knows how many there are before the company payload does — so the summary
 * cards can stay honest without another request.
 */
@Injectable()
export class CompanyContextService {
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly company = signal<Company | null>(null);
  readonly loading = signal(true);

  /**
   * The live branch count, written by the Branches section and read by the
   * summary card on Profile. The company payload only carries the count as it
   * was when the section was entered, so adding a branch and stepping back to
   * Profile would otherwise show the old number.
   */
  readonly branchCount = signal<number | null>(null);

  /** The API only lets the main admin write the company profile and its domains. */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  /** Branch management has its own permission, separate from Company Details. */
  readonly canViewBranches = computed(() => this.auth.can('branch-management'));

  /** Branches a domain can be pinned to. */
  readonly branchOptions = computed(() =>
    (this.company()?.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name }))
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.companies.get().subscribe({
      next: (company) => {
        this.company.set(company);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the company', messageOf(error));
      },
    });
  }

  /** After a profile save, so the header and summary cards agree with the form. */
  set(company: Company): void {
    this.company.set(company);
  }
}
