import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Observable, finalize, map, tap } from 'rxjs';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { ListQuery, PagedResult } from '../../core/models/api.model';
import { LeadStage, ServiceLead, ServiceLeadView,
  ServiceRevenue,
} from '../../core/models/domain.model';
import { numberOrNull, stageLabel } from '../../shared/utils';
import { ListStore } from '../../shared/list-store';
import { PagerComponent } from '../../shared/ui/pager.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { LeadStageBadgeComponent } from '../leads/lead-stage-badge.component';
import { BookingStatus, ServiceAnalytics } from '../../core/models/domain.model';
import { MiniChartComponent } from '../../shared/ui/mini-chart.component';

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
    MiniChartComponent,
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

      /* The revenue strip above the list. Four numbers somebody reads before
         deciding which enquiry to open. */
      .rev-strip {
        padding: 14px 15px; margin: 0 0 16px;
        border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
      }
      .rev-days { display: flex; gap: 4px; margin-bottom: 12px; }
      .rev-tab {
        padding: 3px 10px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--border); background: var(--surface);
        font-size: 11.5px; font-weight: 600; color: var(--text-2);
      }
      .rev-tab-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .rev-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
      .rev-label { display: block; font-size: 11.5px; font-weight: 600; color: var(--text-3); }
      .rev-value { display: block; margin-top: 2px; font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .rev-note { display: block; margin-top: 1px; font-size: 11px; color: var(--text-3); }
      .rev-warn .rev-value { color: var(--danger); }

      .note-cell {
        max-width: 28ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        font-size: 12px; color: var(--text-3);
      }
      .wa { font-size: 11.5px; color: var(--text-3); }

      /* The appointments, set apart from the stage counters by a rule rather
         than by colour: they are a different axis, not a different mood. */
      .count-sep { width: 1px; align-self: stretch; background: var(--border); margin: 0 2px; }
      .count-await { font-weight: 600; }

      /* The analytics panel: figures somebody reads before deciding what to do
         with their morning, so they are large and plain. */
      /* The count on the Enquiries tab: how many are in the queue, readable
         without opening it. */
      .tab-count {
        margin-left: 6px; padding: 1px 7px; border-radius: 999px;
        background: var(--surface-2); border: 1px solid var(--border);
        font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
      }

      .an-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
      .an { padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); }
      .an-label { display: block; font-size: 11.5px; font-weight: 600; color: var(--text-3); }
      .an-value { display: block; margin-top: 3px; font-size: 21px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .an-note { display: block; margin-top: 2px; font-size: 11.5px; color: var(--text-3); }

      .an-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 12px; }
      .an-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
      .panel { padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
      .panel-title { margin: 0 0 10px; font-size: 12.5px; font-weight: 600; color: var(--text-2); }

      .rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      .rank li { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; }
      .rank-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rank-num { font-weight: 700; font-variant-numeric: tabular-nums; }
      .rank-sub { color: var(--text-3); font-size: 11.5px; font-variant-numeric: tabular-nums; }

      .booking-when { font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .booking-row { display: flex; gap: 4px; align-items: center; margin-top: 3px; flex-wrap: wrap; }
      .btn-xs { padding: 2px 8px; font-size: 11.5px; }
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

  /**
   * The bookings filter, beside the stage one rather than folded into it.
   *
   * A booking's status and an enquiry's stage are **different axes** - a
   * confirmed appointment can still be `new` in the company's own pipeline - so
   * they filter independently and the counts are reported separately.
   */
  readonly activeBooking = computed(
    () => (this.store.query()['bookingStatus'] as BookingStatus | undefined) ?? null
  );

  readonly awaiting = computed(() => this.counts()?.awaitingBooking ?? 0);
  readonly confirmed = computed(() => this.counts()?.confirmedBooking ?? 0);

  /** True once any row on this page carries an appointment. */
  readonly anyBookings = computed(
    () => this.awaiting() > 0 || this.confirmed() > 0 || this.store.items().some((row) => row.bookingStatus)
  );

  /**
   * What is happening, as opposed to what it earned.
   *
   * Its own request beside the revenue strip, matching the API: one is the money
   * question a person opens on a Friday, the other is demand, conversion and how
   * much of the diary is being confirmed. Both share the window picker, because
   * reading two figures over two different fortnights is how a screen lies.
   */
  /**
   * Which half of this screen is showing.
   *
   * The queue and the figures are two jobs done at different moments: somebody
   * works the inbox on a Monday morning and reads the analysis on a Friday
   * afternoon. Stacked on one page the figures pushed the first unanswered
   * enquiry below the fold, which is the one row this screen exists to show.
   */
  readonly tab = signal<'queue' | 'analysis'>('queue');

  readonly analytics = signal<ServiceAnalytics | null>(null);
  readonly loadingAnalytics = signal(false);

  /** The daily series, as the chart wants them. */
  readonly enquirySeries = computed(() =>
    (this.analytics()?.daily ?? []).map((row) => ({ label: row.day, value: row.enquiries }))
  );
  readonly bookingSeries = computed(() =>
    (this.analytics()?.bookingDaily ?? []).map((row) => ({ label: row.day, value: row.bookings }))
  );

  /** True once this tenant has taken a booking at all - the diary half is hidden
      entirely for a shop that only takes questions. */
  /** The stage counts, with every stage present - the template indexes it. */
  readonly byStage = computed(() => this.analytics()?.byStage ?? ({} as Record<string, number>));

  readonly hasBookings = computed(() => (this.analytics()?.totals.bookings ?? 0) > 0);

  readonly deciding = signal<ServiceLead | null>(null);
  readonly decisionOpen = signal(false);
  readonly decisionSaving = signal(false);

  /**
   * Answering somebody who asked for a time.
   *
   * Its own small form rather than a field on the enquiry editor, matching the
   * API: that one moves a row through the company's private pipeline, and this
   * changes a fact the customer is waiting on and can read on their own page.
   */
  readonly decisionForm = this.fb.nonNullable.group({
    status: ['accepted'],
    response: [''],
  });

  readonly saving = signal(false);
  readonly editing = signal<ServiceLead | null>(null);
  readonly modalOpen = signal(false);

  /**
   * What a person may change about an enquiry.
   *
   * The stage and the note were always here. `amount` and the payment are the
   * two the shop actually needed: a service is priced in words on the website
   * because it cannot be priced in advance, so the figure only exists once
   * somebody has looked at the job — and until it is written down, "what are our
   * services earning" has no answer at all.
   */
  readonly form = this.fb.nonNullable.group({
    stage: ['new'],
    note: [''],
    /**
     * A **number** control, because the box is `type="number"`.
     *
     * Angular binds those with `NumberValueAccessor`, which writes a number once
     * somebody types and `null` when the box is cleared - never the empty string
     * this was declared with. Typing an amount therefore put a number where the
     * save handler expected a string, `.trim()` threw, and the request was never
     * sent: the spinner ran forever and nothing said why.
     */
    amount: this.fb.control<number | null>(null),
    paymentStatus: ['unpaid'],
    paymentReference: [''],
  });

  /** What the services are earning. Loaded beside the list, not inside it. */
  readonly revenue = signal<ServiceRevenue | null>(null);
  readonly revenueDays = signal(30);

  constructor() {
    /* The queue only. The figures are two more requests, and they are fetched
       when somebody opens the tab that shows them - see `openTab`. */
    this.store.reload();
  }

  /**
   * Opening the analysis is what fetches it, and only the first time.
   *
   * Flicking between the two tabs should not re-run two aggregate queries, and
   * nothing on them changes underneath somebody in the seconds they spend
   * looking. A write on the queue refreshes them anyway - see `save`.
   */
  openTab(tab: 'queue' | 'analysis'): void {
    this.tab.set(tab);
    if (tab === 'analysis' && !this.analytics() && !this.loadingAnalytics()) {
      this.loadRevenue();
      this.loadAnalytics();
    }
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
  /**
   * The revenue strip.
   *
   * Its own call rather than a field on the list: it is about the whole window,
   * and a figure that changed when somebody filtered to one stage would be a
   * figure about that filter rather than about the business.
   */
  private loadAnalytics(): void {
    this.loadingAnalytics.set(true);
    this.companies.serviceAnalytics({ days: this.revenueDays() }).subscribe({
      next: (data) => {
        this.loadingAnalytics.set(false);
        this.analytics.set(data);
      },
      /**
       * The list is the screen; the figures are the strip above it.
       *
       * A failure leaves whatever was last loaded in place rather than blanking
       * the panel: a strip that vanished the moment somebody saved an edit reads
       * as "the edit broke something", which is the opposite of true.
       */
      error: () => this.loadingAnalytics.set(false),
    });
  }

  private loadRevenue(): void {
    this.companies.serviceRevenue({ days: this.revenueDays() }).subscribe({
      next: (data) => this.revenue.set(data),
      /* Keep the last good figures rather than blanking the strip - see the note
         on the analytics loader. */
      error: () => undefined,
    });
  }

  setRevenueDays(days: number): void {
    this.revenueDays.set(days);
    this.loadRevenue();
    this.loadAnalytics();
  }

  /** Money, in the tenant's own currency. */
  money(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value);

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return String(amount);
    }
  }

  filterStage(stage: LeadStage | null): void {
    const next = this.activeStage() === stage ? null : stage;
    this.store.patch({ stage: next ?? undefined });
  }

  /** Clicking a booking counter filters to it; clicking the live one clears it. */
  filterBooking(status: BookingStatus | null): void {
    const next = this.activeBooking() === status ? null : status;
    this.store.patch({ bookingStatus: next ?? undefined });
  }

  /** The appointment, as a person reads it. `null` on a row that only asked. */
  bookingLabel(row: ServiceLead): string | null {
    if (!row.bookingStatus || !row.bookingDate) return null;

    const date = new Date(`${row.bookingDate}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return `${date} · ${row.bookingTime}${row.bookingMinutes ? ` · ${row.bookingMinutes} min` : ''}`;
  }

  openDecision(row: ServiceLead, status: BookingStatus): void {
    this.deciding.set(row);
    this.decisionForm.reset({ status, response: row.bookingResponse ?? '' });
    this.decisionOpen.set(true);
  }

  decide(): void {
    const row = this.deciding();
    if (!row) return;

    const raw = this.decisionForm.getRawValue();
    this.decisionSaving.set(true);

    this.companies
      .decideBooking(row.id, { status: raw.status as BookingStatus, response: raw.response || null })
      /* Same rule as the editor above: the button always comes back. */
      .pipe(finalize(() => this.decisionSaving.set(false)))
      .subscribe({
      next: () => {
        this.decisionSaving.set(false);
        this.decisionOpen.set(false);
        this.toast.success(
          raw.status === 'accepted'
            ? 'Appointment confirmed'
            : raw.status === 'declined'
              ? 'Appointment declined — the time is free again'
              : `Appointment ${raw.status}`
        );
        /* Confirming or declining moves the diary's own figures too. */
        if (this.analytics()) this.loadAnalytics();
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.decisionSaving.set(false);
        this.toast.error('Could not answer the booking', messageOf(error));
      },
    });
  }

  apply(partial: ListQuery): void {
    this.store.patch(partial);
  }

  /** The same words the badges use, so the box and the column agree. */
  stageLabel = stageLabel;

  /** `tel:` wants digits and a leading plus, not the spaces people type. */
  telHref(phone: string): string {
    const trimmed = String(phone ?? '').trim();
    const digits = trimmed.replace(/[^\d]/g, '');
    return trimmed.startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
  }

  open(row: ServiceLead): void {
    this.editing.set(row);
    this.form.reset({
      stage: row.stage ?? 'new',
      note: row.note ?? '',
      /* Empty means "nobody has quoted this yet", which is a real state and not
         the same as a quote of zero. */
      amount: numberOrNull(row.amount),
      paymentStatus: row.paymentStatus ?? 'unpaid',
      paymentReference: row.paymentReference ?? '',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    const row = this.editing();
    if (!row) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);

    this.companies
      .updateServiceLead(row.id, {
        stage: raw.stage as LeadStage,
        note: raw.note || null,
        /* An empty box clears it back to unquoted rather than sending a zero. */
        amount: numberOrNull(raw.amount),
        paymentStatus: raw.paymentStatus,
        paymentReference: raw.paymentReference || null,
      })
      /**
       * The button comes back **whatever happens**.
       *
       * `next` and `error` both reset it, but neither runs if the observable
       * merely completes - and a spinner that never stops is the one failure a
       * person cannot get out of without reloading the page. `finalize` is the
       * only place that covers all three endings.
       */
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success('Enquiry updated');

        /**
         * The list first, and on its own line.
         *
         * It is the thing the person is actually watching: they changed a stage,
         * and the row has to show it. Refreshing the figures first meant a save
         * that worked could still *look* like it had not, because anything that
         * threw on the way through the two figure calls would take the reload
         * with it.
         */
        this.store.reload();

        /* Then the figures, but only if they have been looked at: a quote or a
           payment moves them, and refreshing what nobody has opened is two
           requests for a screen that is not on. */
        if (this.analytics()) {
          this.loadRevenue();
          this.loadAnalytics();
        }
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
