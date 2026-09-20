import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ListQuery, PageMeta } from '../../core/models/api.model';
import {
  ENQUIRY_STATUSES,
  MarketingEnquiry,
  MarketingEnquiryStatus,
} from '../../core/models/marketing.model';
import { MarketingService } from '../../core/services/marketing.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/**
 * People who have asked us to build them a website.
 *
 * **These are not leads.** A lead belongs to a tenant and is somebody who wants
 * to buy from *them*; everybody here wants to buy from us and has no company on
 * the platform yet. That is why this screen sits next to the marketing site's
 * content rather than in Lead Management, and why there is no company column.
 *
 * Every field except status and note is a stranger's typing, submitted through
 * a form with no token. `businessName` is not a business that exists and
 * `email` is not an address anybody has confirmed — the screen shows them as a
 * message, which is what they are.
 */
@Component({
  selector: 'app-marketing-enquiry-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PageHeaderComponent,
    PagerComponent,
    TableStateComponent,
    ModalComponent,
  ],
  templateUrl: './marketing-enquiry-list.component.html',
})
export class MarketingEnquiryListComponent {
  private readonly service = inject(MarketingService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly statuses = ENQUIRY_STATUSES;

  readonly rows = signal<MarketingEnquiry[]>([]);
  readonly meta = signal<PageMeta>({ total: 0, page: 1, limit: 20, totalPages: 1, hasNext: false });
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);

  /** The enquiry open in the detail panel. */
  readonly viewing = signal<MarketingEnquiry | null>(null);

  readonly filters = this.fb.nonNullable.group({
    search: [''],
    kind: [''],
    status: [''],
  });

  /** Our own note and where it has got to. Nothing the sender wrote is editable. */
  readonly form = this.fb.nonNullable.group({
    status: ['new'],
    note: [''],
  });

  private query: ListQuery = { page: 1, limit: 20 };

  constructor() {
    this.load();
  }

  load(page = this.query.page ?? 1): void {
    this.loading.set(true);
    this.failed.set(false);

    const { search, kind, status } = this.filters.getRawValue();
    this.query = { page, limit: 20, search, kind, status };

    this.service.listEnquiries(this.query).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.meta.set(result.meta);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Filters always reset to page one — page 3 of a new filter is rarely meant. */
  applyFilters(): void {
    this.load(1);
  }

  clearFilters(): void {
    this.filters.reset({ search: '', kind: '', status: '' });
    this.load(1);
  }

  view(row: MarketingEnquiry): void {
    this.viewing.set(row);
    this.form.reset({ status: row.status, note: row.note ?? '' });
  }

  close(): void {
    this.viewing.set(null);
  }

  save(): void {
    const row = this.viewing();
    if (!row) return;

    this.saving.set(true);
    const { status, note } = this.form.getRawValue();

    this.service
      .updateEnquiry(row.id, { status: status as MarketingEnquiryStatus, note: note || null })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Enquiry updated');
          this.close();
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }

  /** Colours the status chip. New is the one that needs somebody to act. */
  statusClass(status: MarketingEnquiryStatus): string {
    switch (status) {
      case 'new':
        return 'badge badge-warning';
      case 'contacted':
        return 'badge badge-info';
      case 'converted':
        return 'badge badge-success';
      default:
        return 'badge';
    }
  }

  /**
   * The best way to reach them, for the list column.
   *
   * One of phone or email is guaranteed by the API — it refuses a submission
   * with neither — so this never renders empty.
   */
  contactOf(row: MarketingEnquiry): string {
    return row.phone || row.email || '—';
  }
}
