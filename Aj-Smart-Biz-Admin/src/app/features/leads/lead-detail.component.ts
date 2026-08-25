import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Lead, LeadDetail, LeadVisit, LEAD_STAGES } from '../../core/models/domain.model';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload } from '../../shared/utils';
import { LeadStageBadgeComponent } from './lead-stage-badge.component';
import {
  deviceIcon,
  deviceLabel,
  entriesOf,
  machineLabel,
  pageLabel,
  placeLabel,
  sizeLabel,
  sourceLabel,
  whoLabel,
} from './lead-format';

/**
 * One lead, and every visit behind it.
 *
 * What the list's View action opens. The list row is a roll-up of a device —
 * latest browser, latest place, first-touch campaign — and this is the history
 * that roll-up was computed from, plus every field the browser reported that a
 * table cell had no room for.
 *
 * A route rather than a modal, so a visit worth discussing has a URL worth
 * pasting into a message.
 *
 * Only one thing here is editable, and it is the only thing that is an opinion:
 * what the company has decided about this person. Everything else is a record
 * of something that happened and is presented as read-only, because it is.
 */
@Component({
  selector: 'app-lead-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, TitleCasePipe, RouterLink, ReactiveFormsModule, CanDirective, LeadStageBadgeComponent],
  templateUrl: './lead-detail.component.html',
  styles: [
    `
      .lead-head { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; margin-bottom: 20px; }
      .lead-head h1 { font-size: 22px; margin: 0; }
      .device-id {
        font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
        font-size: 12px; color: var(--text-3); word-break: break-all;
      }

      .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px 20px; }
      .fact { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .fact-label { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); }
      .fact-value { font-size: 13.5px; color: var(--text); word-break: break-word; }
      .fact-value.mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }

      .kv { display: flex; flex-wrap: wrap; gap: 6px; }
      .kv-pair {
        display: inline-flex; gap: 5px; align-items: baseline;
        padding: 3px 8px; border-radius: 999px;
        background: var(--surface-3); font-size: 12px;
      }
      .kv-key { color: var(--text-3); }
      .kv-val { color: var(--text); font-weight: 600; word-break: break-all; }

      .visit {
        border: 1px solid var(--border); border-radius: var(--radius-sm);
        margin-bottom: 10px; overflow: hidden;
      }
      .visit-head {
        display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
        width: 100%; padding: 11px 14px;
        background: none; border: none; font: inherit; color: inherit;
        cursor: pointer; text-align: left;
      }
      .visit-head:hover { background: var(--surface-3); }
      .visit-when { min-width: 168px; font-weight: 600; }
      .visit-page { color: var(--text-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .visit-caret { color: var(--text-3); transition: transform .15s; }
      .visit-head.open .visit-caret { transform: rotate(90deg); }
      .visit-body { padding: 14px; border-top: 1px solid var(--border); background: var(--surface-2); }
      .visit-section + .visit-section { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--border); }
      .visit-section h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-3); margin: 0 0 9px; }
    `,
  ],
})
export class LeadDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly lead = signal<Lead | null>(null);
  readonly visits = signal<LeadVisit[]>([]);
  readonly stages = LEAD_STAGES;

  /** Which visit rows are expanded. Ids rather than an index — the list can reload. */
  readonly expanded = signal<Set<number>>(new Set());

  readonly form = this.fb.nonNullable.group({
    stage: ['new'],
    name: [''],
    email: [''],
    phone: [''],
    notes: [''],
  });

  /** The lead's headline, recomputed as the name is filled in. */
  readonly title = computed(() => {
    const lead = this.lead();
    return lead ? whoLabel(lead) : 'Lead';
  });

  /**
   * Every campaign parameter the first visit carried, first touch and last
   * touch shown separately — they answer different questions and a screen that
   * showed one would silently answer neither. See the API's `lead.model.js`.
   */
  readonly firstUtm = computed(() => entriesOf(this.lead()?.firstUtm));
  readonly lastUtm = computed(() => entriesOf(this.lead()?.lastUtm));

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.load(id);
  }

  /* ---------------- Formatting, shared with the list ---------------- */

  readonly who = whoLabel;
  readonly device = deviceLabel;
  readonly deviceIcon = deviceIcon;
  readonly machine = machineLabel;
  readonly place = placeLabel;
  readonly source = sourceLabel;
  readonly size = sizeLabel;
  readonly page = pageLabel;
  readonly entries = entriesOf;

  private load(id: number): void {
    this.loading.set(true);
    this.api.get<LeadDetail>(`/admin/company/leads/${id}`).subscribe({
      next: (data) => {
        this.lead.set(data.lead);
        this.visits.set(data.visits ?? []);
        this.form.patchValue({
          stage: data.lead.stage,
          name: data.lead.name ?? '',
          email: data.lead.email ?? '',
          phone: data.lead.phone ?? '',
          notes: data.lead.notes ?? '',
        });
        // The most recent visit starts open: it is why the screen was opened.
        if (data.visits?.length) this.expanded.set(new Set([data.visits[0].id]));
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.toast.error('Could not load the lead', messageOf(error));
        this.loading.set(false);
      },
    });
  }

  isExpanded(visitId: number): boolean {
    return this.expanded().has(visitId);
  }

  toggle(visitId: number): void {
    const next = new Set(this.expanded());
    if (next.has(visitId)) next.delete(visitId);
    else next.add(visitId);
    this.expanded.set(next);
  }

  /** Opens all of them, for reading a long history in one pass. */
  expandAll(): void {
    this.expanded.set(new Set(this.visits().map((visit) => visit.id)));
  }

  collapseAll(): void {
    this.expanded.set(new Set());
  }

  save(): void {
    const lead = this.lead();
    if (!lead || this.saving()) return;

    this.saving.set(true);
    this.api.patch<Lead>(`/admin/company/leads/${lead.id}`, cleanPayload(this.form.getRawValue())).subscribe({
      next: (updated) => {
        this.lead.set({ ...lead, ...updated });
        this.saving.set(false);
        this.toast.success('Lead updated');
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the lead', messageOf(error));
      },
    });
  }
}
