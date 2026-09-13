import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformService } from '../../core/services/platform.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import { PlatformCustomer, PlatformCustomerSummary } from '../../core/models/domain.model';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { formatMoney } from '../../shared/utils';

/**
 * Every customer on the platform, across every tenant.
 *
 * ### Why the operator gets this at all
 *
 * Two reasons, and both are about running the platform rather than about the
 * people in the list. **Support**: a tenant rings up saying a customer cannot
 * sign in, and the first question is whether that account exists and which
 * company it belongs to. **Billing and product**: how many tenants have actually
 * turned customer accounts into customers is the difference between a feature
 * that is sold and one that is used.
 *
 * ### What is deliberately not here
 *
 * No addresses, no order lines, and **nothing can be edited**. The operator has a
 * legitimate interest in how many customers a tenant has and what they are worth;
 * where a particular person lives is the tenant's business with their customer,
 * and nothing about running a platform requires reading it. Barring somebody is
 * the tenant's decision too, taken on their own Customers screen.
 *
 * That restraint is the whole design of this screen, which is why it is a table
 * with no actions column rather than a copy of the tenant's version.
 */
@Component({
  selector: 'app-platform-customer-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, PageHeaderComponent, PagerComponent],
  template: `
    <app-page-header
      title="Customers"
      subtitle="Everyone with an account on a tenant's website"
    />

    <section class="card">
      <div class="card-body">
        @if (summary(); as s) {
          <div class="kpis">
            <div class="kpi">
              <div class="kpi-label">Accounts</div>
              <div class="kpi-value">{{ s.total }}</div>
              <div class="kpi-note">{{ s.active }} can sign in</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Across</div>
              <div class="kpi-value">{{ s.companies }}</div>
              <!-- The number that says whether the feature is used or merely
                   sold: how many tenants have turned accounts into customers. -->
              <div class="kpi-note">companies with any</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Joined this month</div>
              <div class="kpi-value">{{ s.joinedLast30 }}</div>
              <div class="kpi-note">in the last 30 days</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">Barred</div>
              <div class="kpi-value">{{ s.inactive }}</div>
              <div class="kpi-note">by their own shop</div>
            </div>
          </div>
        }

        <p class="tiny muted" style="margin: 0 0 14px; max-width: 72ch">
          Read only. Addresses and order lines stay with the tenant, and barring somebody is their
          decision &mdash; taken on their own Customers screen.
        </p>

        <div class="filters">
          <input
            class="input"
            type="search"
            style="flex:1;min-width:220px"
            placeholder="Name, mobile number or email"
            [value]="search()"
            (change)="onSearch($any($event.target).value)"
          />
        </div>

        @if (loading()) {
          <div class="skeleton" style="height: 260px"></div>
        } @else if (!items().length) {
          <p class="empty-note">
            @if (search()) { Nobody matches that. } @else { No customer accounts on the platform yet. }
          </p>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Company</th>
                  <th>Mobile</th>
                  <th style="text-align:right">Orders</th>
                  <th style="text-align:right">Spent</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (row of items(); track row.id) {
                  <tr>
                    <td>
                      <span class="strong">{{ row.name }}</span>
                      @if (row.email) {
                        <div class="tiny muted">{{ row.email }}</div>
                      }
                    </td>
                    <td>
                      @if (row.company) {
                        <!-- The support journey starts here: whose customer is
                             this, and what else is going on at that company. -->
                        <a [routerLink]="['/companies', row.company.id]">{{ row.company.name }}</a>
                      } @else {
                        <span class="muted">&mdash;</span>
                      }
                    </td>
                    <td class="mono">{{ row.phone }}</td>
                    <td style="text-align:right">{{ row.orders }}</td>
                    <td style="text-align:right">{{ money(row.spent) }}</td>
                    <td class="tiny muted">{{ row.createdAt | date: 'd MMM y' }}</td>
                    <td>{{ row.status }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pager [meta]="meta()" (pageChange)="onPage($event)" />
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host { display: block; }

      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 16px; }
      .kpi { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .kpi-value { margin-top: 3px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .kpi-note { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }

      .filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }
      .mono { font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
    `,
  ],
})
export class PlatformCustomerListComponent {
  private readonly platform = inject(PlatformService);
  private readonly toast = inject(ToastService);

  readonly items = signal<PlatformCustomer[]>([]);
  readonly meta = signal<PageMeta>(EMPTY_META);
  readonly summary = signal<PlatformCustomerSummary | null>(null);
  readonly loading = signal(true);

  readonly search = signal('');
  readonly page = signal(1);

  constructor() {
    this.load();
  }

  private load(): void {
    this.platform.customerSummary().subscribe({
      next: (data) => this.summary.set(data),
      error: () => this.summary.set(null),
    });

    this.loadItems();
  }

  private loadItems(): void {
    this.loading.set(true);

    const query: ListQuery = { page: this.page(), limit: 25 };
    if (this.search().trim()) query['search'] = this.search().trim();

    this.platform.customers(query).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.items.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.items.set([]);
        this.meta.set(EMPTY_META);
        this.toast.error('Could not load customers', messageOf(error));
      },
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    /* Any change of filter goes back to page one — page four of the old filter
       is nowhere. */
    this.page.set(1);
    this.loadItems();
  }

  onPage(page: number): void {
    this.page.set(page);
    this.loadItems();
  }

  money(value: number | null | undefined): string {
    return formatMoney(value, 'INR');
  }
}
