import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Company, Option } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { daysBetween, initials } from '../../shared/utils';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-company-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, PageHeaderComponent, PagerComponent, StatusBadgeComponent, TableStateComponent],
  templateUrl: './company-list.component.html',
})
export class CompanyListComponent {
  private readonly companies = inject(CompanyService);
  private readonly crud = inject(CrudFactory);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly store = new ListStore<Company>((query) => this.companies.list(query), {
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  readonly businessTypes = signal<Option[]>([]);
  readonly plans = signal<Option[]>([]);

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.store.reload();
    this.crud.for<Option>(MASTER_PATHS.businessTypes).dropdown().subscribe((rows) => this.businessTypes.set(rows));
    this.crud.for<Option>(MASTER_PATHS.plans).dropdown().subscribe((rows) => this.plans.set(rows));
  }

  value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  onSearch(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.patch({ search }), 350);
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  daysLeft(endDate: string): number {
    return daysBetween(endDate);
  }

  toggleStatus(row: Company): void {
    this.companies.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`${row.name} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async remove(row: Company): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${row.name}?`,
      message:
        'The company, its branches, roles and admins are soft deleted — nobody from this tenant will be able to sign in. You can restore it later.',
      confirmText: 'Delete company',
      danger: true,
    });
    if (!ok) return;

    this.companies.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Company deleted');
        this.store.reloadAfterDelete();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the company', messageOf(error)),
    });
  }
}
