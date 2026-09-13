import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import {
  Customer,
  CustomerDetail,
  CustomerSummary,
} from '../../core/models/domain.model';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * The people who buy, as opposed to the things they bought.
 *
 * ### What this screen cannot do
 *
 * **There is no *Add customer* button, and no password to reset.** An account is
 * made by the person it belongs to, signing in to the website with their own
 * number — one a shop could manufacture would be a row nobody consented to,
 * attached to somebody's phone number. And there is no password anywhere on the
 * platform to reset: sign-in is a one-time code to the mobile.
 *
 * **The phone number is not editable.** It is the identity: changing it would
 * move the account to a different person and take their order history with it,
 * and it is also how they sign in, so an edit would lock them out of an account
 * they still hold the number for. The form says so rather than showing a greyed
 * box with no explanation, which is the thing people ring up about.
 *
 * ### What it is for
 *
 * Looking somebody up before the phone is answered. Which is why the search
 * covers the name, the phone **and** the email, why the row carries what they
 * have spent, and why opening one shows their addresses and their orders in the
 * same request rather than behind two more clicks.
 */
@Component({
  selector: 'app-customer-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, ModalComponent, PagerComponent, StatusBadgeComponent],
  templateUrl: './customer-list.component.html',
  styles: [
    `
      :host { display: block; }

      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 16px; }
      .kpi { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .kpi-value { margin-top: 3px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .kpi-note { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }

      .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
      .filters .grow { flex: 1; min-width: 200px; }

      .mono { font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }
      .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
      .muted-sm { font-size: 11.5px; color: var(--text-3); }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .detail-grid { grid-template-columns: 1fr; } }

      .addresses { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      .address {
        padding: 10px 12px; border-radius: 10px;
        border: 1px solid var(--border); background: var(--surface-2);
        font-size: 12.5px; line-height: 1.55;
      }
      .address .tag {
        display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px;
        background: var(--surface-3, var(--surface)); font-size: 10.5px; font-weight: 700;
      }

      .orders { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .orders th, .orders td { padding: 7px 8px; border-bottom: 1px solid var(--border); text-align: left; }
      .orders th { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .orders td.n { text-align: right; font-variant-numeric: tabular-nums; }

      .note-box {
        margin-top: 6px; padding: 9px 12px; border-radius: 8px;
        background: var(--surface-2); border: 1px solid var(--border);
        font-size: 12px; line-height: 1.55;
      }
    `,
  ],
})
export class CustomerListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly items = signal<Customer[]>([]);
  readonly meta = signal<PageMeta>(EMPTY_META);
  readonly summary = signal<CustomerSummary | null>(null);
  readonly current = signal<CustomerDetail | null>(null);

  readonly loading = signal(true);
  readonly listing = signal(false);
  readonly saving = signal(false);
  readonly detailOpen = signal(false);

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly page = signal(1);
  readonly limit = signal(25);

  /** A correction and a note. The phone is absent on purpose — see the class note. */
  readonly form = this.fb.nonNullable.group({
    name: [''],
    email: [''],
    notes: [''],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);

    this.companies.customerSummary().subscribe({
      next: (view) => {
        this.summary.set(view);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your customers', messageOf(error));
      },
    });

    this.loadItems();
  }

  private query(): ListQuery {
    const query: ListQuery = { page: this.page(), limit: this.limit() };
    if (this.search().trim()) query['search'] = this.search().trim();
    if (this.statusFilter()) query['status'] = this.statusFilter();
    return query;
  }

  private loadItems(): void {
    this.listing.set(true);
    this.companies.listCustomers(this.query()).subscribe({
      next: (result) => {
        this.listing.set(false);
        this.items.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.listing.set(false);
        this.items.set([]);
        this.meta.set(EMPTY_META);
        this.toast.error('Could not load the customers', messageOf(error));
      },
    });
  }

  private refreshSummary(): void {
    this.companies.customerSummary().subscribe({
      next: (view) => this.summary.set(view),
      error: () => undefined,
    });
  }

  /* -------------------------------- filters ------------------------------- */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private refilter(): void {
    this.page.set(1);
    this.loadItems();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.refilter();
  }

  onStatus(value: string): void {
    this.statusFilter.set(value);
    this.refilter();
  }

  onPage(page: number): void {
    this.page.set(page);
    this.loadItems();
  }

  /* -------------------------------- detail -------------------------------- */

  open(row: Customer): void {
    /* Re-read rather than trusting the list row: the list carries no addresses
       and no orders, and somebody else may have changed things since. */
    this.companies.getCustomer(row.id).subscribe({
      next: (detail) => {
        this.current.set(detail);
        this.form.reset({
          name: detail.customer.name,
          email: detail.customer.email ?? '',
          notes: detail.customer.notes ?? '',
        });
        this.detailOpen.set(true);
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not open that customer', messageOf(error)),
    });
  }

  save(): void {
    const detail = this.current();
    if (!detail || !this.canEdit()) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);

    this.companies
      .updateCustomer(detail.customer.id, {
        name: raw.name.trim(),
        email: raw.email.trim() || null,
        notes: raw.notes.trim() || null,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.current.set({ ...detail, customer: updated });
          this.toast.success('Customer updated');
          this.loadItems();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save that', messageOf(error));
        },
      });
  }

  /**
   * Bar somebody, or let them back.
   *
   * Says out loud what it does **not** do: barring a customer is not the same as
   * pretending they never bought anything, and somebody expecting the orders to
   * disappear with them would be surprised by the sales figures a week later.
   */
  async toggle(row: Customer): Promise<void> {
    if (!this.canEdit()) return;

    const barring = row.status === 'active';

    if (barring) {
      const agreed = await this.confirm.ask({
        title: `Bar ${row.name}?`,
        message:
          'They will not be able to sign in or place an order. Everything they have already ordered stays exactly as it is.',
        confirmText: 'Bar them',
        danger: true,
      });
      if (!agreed) return;
    }

    this.companies.toggleCustomer(row.id).subscribe({
      next: () => {
        this.toast.success(barring ? `${row.name} can no longer sign in` : `${row.name} can sign in again`);
        this.loadItems();
        this.refreshSummary();

        const detail = this.current();
        if (detail?.customer.id === row.id) {
          this.current.set({
            ...detail,
            customer: { ...detail.customer, status: barring ? 'inactive' : 'active' },
          });
        }
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change that', messageOf(error)),
    });
  }

  async remove(row: Customer): Promise<void> {
    if (!this.canEdit()) return;

    const agreed = await this.confirm.ask({
      title: `Remove ${row.name}?`,
      message:
        'Their account goes, and their orders stay — with the name and number still on each, so your sales figures do not move. If they sign up again with the same number, this account comes back.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!agreed) return;

    this.companies.deleteCustomer(row.id).subscribe({
      next: () => {
        this.toast.success('Customer removed');
        this.detailOpen.set(false);
        this.loadItems();
        this.refreshSummary();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not remove them', messageOf(error)),
    });
  }

  /* -------------------------------- display ------------------------------- */

  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return String(value);
    }
  }
}
