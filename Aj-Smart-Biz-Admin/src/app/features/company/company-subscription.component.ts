import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CompanyContextService } from './company-context.service';
import { CompanyService } from '../../core/services/company.service';
import { Transaction } from '../../core/models/domain.model';
import { formatMoney } from '../../shared/utils';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * What this tenant has been sold and what it has paid.
 *
 * Read only by design: plans are sold and changed by the platform, so the
 * screen reports rather than edits. The fuller picture — limits, usage and the
 * expiry countdown — lives on My Plan, which this links to rather than repeats.
 */
@Component({
  selector: 'app-company-subscription',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, StatusBadgeComponent],
  template: `
    <div class="card">
      <div class="card-head">
        <h3>Subscription history</h3>
        <a class="btn btn-sm btn-ghost" routerLink="/plan">💳 Open My Plan →</a>
      </div>
      <div class="card-body tight">
        @if (!ctx.company()?.subscriptions?.length) {
          <div class="empty"><div class="empty-icon">💳</div><div>No plan has been assigned yet</div></div>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Plan</th><th>Period</th><th class="text-right">Total</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (sub of ctx.company()?.subscriptions; track sub.id) {
                  <tr>
                    <td class="strong">{{ sub.plan?.name ?? sub.planSnapshot?.name ?? '—' }}</td>
                    <td class="tiny muted nowrap">
                      {{ sub.startDate | date: 'dd MMM yyyy' }} → {{ sub.endDate | date: 'dd MMM yyyy' }}
                    </td>
                    <td class="text-right strong nowrap">{{ money(sub.totalAmount, sub.currency) }}</td>
                    <td><app-status-badge [value]="sub.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="card-head" style="border-top:1px solid var(--border)"><h3>Payments</h3></div>
      <div class="card-body tight">
        @if (transactions().length === 0) {
          <div class="empty"><div class="empty-icon">🧾</div><div>No payments recorded</div></div>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr><th>Invoice</th><th>Plan</th><th>Paid on</th><th class="text-right">Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                @for (txn of transactions(); track txn.id) {
                  <tr>
                    <td class="strong">{{ txn.invoiceNo }}</td>
                    <td class="muted">{{ txn.plan?.name || '—' }}</td>
                    <td class="tiny muted nowrap">{{ txn.paidAt | date: 'dd MMM yyyy' }}</td>
                    <td class="text-right strong nowrap">{{ money(txn.totalAmount, txn.currency) }}</td>
                    <td><app-status-badge [value]="txn.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        <p class="tiny muted" style="padding:12px 16px;margin:0">
          Plans and payments are managed by the platform. Contact your account manager to upgrade.
        </p>
      </div>
    </div>
  `,
})
export class CompanySubscriptionComponent {
  readonly ctx = inject(CompanyContextService);
  private readonly companies = inject(CompanyService);

  readonly transactions = signal<Transaction[]>([]);

  constructor() {
    this.companies.transactions({ limit: 50 }).subscribe({
      next: (result) => this.transactions.set(result.items),
      error: () => undefined,
    });
  }

  money(value: number | string, currency = 'INR'): string {
    return formatMoney(value, currency);
  }
}
