import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Observable, map, tap } from 'rxjs';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { ListQuery, PagedResult } from '../../core/models/api.model';
import { LeadStage, ServiceLead, ServiceLeadView } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { PagerComponent } from '../../shared/ui/pager.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { LeadStageBadgeComponent } from '../leads/lead-stage-badge.component';

/**
 * Service Leads — the people who asked to be called back about a service.
 *
 * The platform's first inbox, and the reason it is a screen of its own rather
 * than a tab of Company Details: that section is the company describing itself,
 * and this is a queue somebody works through on a Monday morning.
 *
 * **Not Lead Management.** That screen is one row per device that opened the
 * website — traffic, with a stage bolted on so it can be worked. Nobody in it
 * ever asked to be contacted. Everybody in this one did, and said what about.
 * The two share `LeadStage` deliberately, so a company has one vocabulary for
 * "I have rung them" rather than two.
 *
 * What a person does here is move an enquiry along and write down what
 * happened, so those are the only two things the API accepts. The name and the
 * number are a record of what somebody typed, and a screen that let them be
 * rewritten would turn that into a note about what someone thinks happened.
 */
@Component({
  selector: 'app-service-lead-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PagerComponent,
    PageHeaderComponent,
    TableStateComponent,
    ModalComponent,
    LeadStageBadgeComponent,
  ],
  templateUrl: './service-lead-list.component.html',
  styles: [
    `
      :host { display: block; }

      .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }

      /* The counters run cold to warm along the pipeline, like the badges, so
         the shape of the queue reads without anybody parsing the words. */
      .counts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
      .count {
        display: flex; align-items: baseline; gap: 8px;
        padding: 9px 14px; border-radius: 999px;
        border: 1px solid var(--border); background: var(--surface);
        cursor: pointer; font: inherit; font-size: 13px; color: var(--text-2);
        transition: border-color .15s, background .15s, color .15s;
      }
      .count:hover { border-color: var(--brand-400, var(--brand-600)); color: var(--text); }
      .count-on { border-color: var(--brand-600); background: var(--brand-50, var(--surface-2)); color: var(--text); font-weight: 600; }
      .count-n { font-weight: 700; font-variant-numeric: tabular-nums; }

      .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .who-name { font-weight: 600; }
      .phone { font-variant-numeric: tabular-nums; white-space: nowrap; }
      .phone a { color: var(--brand-600); }

      .svc { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .svc-gone { font-size: 11.5px; color: var(--text-3); font-style: italic; }

      .note-cell {
        max-width: 28ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 12px; color: var(--text-3);
      }
      .wa { font-size: 11.5px; color: var(--text-3); }
    `,
  ],
})
export class ServiceLeadListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  /**
   * The counts and the filter lists arrive with the page, so they are captured
   * from the same response rather than fetched again — and they describe the
   * whole queue, not the open filter. See `ServiceLeadView`.
   */
  readonly view = signal<ServiceLeadView | null>(null);

  /**
   * The store only knows about rows and paging, so the counts and the filter
   * lists are lifted off the same response on the way past rather than fetched
   * a second time — which is also what keeps them describing the whole queue
   * instead of the page that happens to be open.
   */
  readonly store = new ListStore<ServiceLead>(
    (query: ListQuery): Observable<PagedResult<ServiceLead>> =>
      this.companies.listServiceLeads(query).pipe(
        tap((result) => this.view.set(result.data)),
        map((result) => ({ items: result.data.items, meta: result.meta }))
      ),
    { limit: 10 }
  );

  readonly stages = computed(() => this.view()?.stages ?? []);
  readonly services = computed(() => this.view()?.services ?? []);
  readonly counts = computed(() => this.view()?.counts ?? null);
  readonly activeStage = computed(() => (this.store.query()['stage'] as LeadStage | undefined) ?? null);

  readonly saving = signal(false);
  readonly editing = signal<ServiceLead | null>(null);
  readonly modalOpen = signal(false);

  readonly form = this.fb.nonNullable.group({ stage: ['new'], note: [''] });

  constructor() {
    this.store.reload();
  }

  reload(): void {
    this.store.reload();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Clicking a counter filters to it, and clicking the live one clears it. */
  filterStage(stage: LeadStage | null): void {
    const next = this.activeStage() === stage ? null : stage;
    this.store.patch({ stage: next ?? undefined });
  }

  apply(partial: ListQuery): void {
    this.store.patch(partial);
  }

  /** `tel:` wants digits and a leading plus, not the spaces people type. */
  telHref(phone: string): string {
    const trimmed = String(phone ?? '').trim();
    const digits = trimmed.replace(/[^\d]/g, '');
    return trimmed.startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
  }

  open(row: ServiceLead): void {
    this.editing.set(row);
    this.form.reset({ stage: row.stage ?? 'new', note: row.note ?? '' });
    this.modalOpen.set(true);
  }

  save(): void {
    const row = this.editing();
    if (!row) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);

    this.companies.updateServiceLead(row.id, { stage: raw.stage as LeadStage, note: raw.note || null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success('Enquiry updated');
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not update the enquiry', messageOf(error));
      },
    });
  }

  async remove(row: ServiceLead): Promise<void> {
    if (!(await this.confirm.askDelete(`the enquiry from ${row.name}`))) return;

    this.companies.removeServiceLead(row.id).subscribe({
      next: () => {
        this.toast.success('Enquiry deleted');
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the enquiry', messageOf(error)),
    });
  }
}
