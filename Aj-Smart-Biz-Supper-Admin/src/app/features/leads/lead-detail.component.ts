import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Lead, LeadDetail, LeadVisit } from '../../core/models/domain.model';
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
 * One lead and every visit behind it, as the platform sees it.
 *
 * The tenant console's detail screen without its editable panel. That is the
 * whole difference, and it is deliberate: which stage a lead is at, and what
 * was learned on the phone, are a company's record of its own customer. The
 * platform reads them so a support conversation has something to look at, and
 * the API exposes no route through which this screen could write them.
 */
@Component({
  selector: 'app-super-lead-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, LeadStageBadgeComponent],
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
export class SuperLeadDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly lead = signal<Lead | null>(null);
  readonly visits = signal<LeadVisit[]>([]);

  /** Which visit rows are expanded. Ids rather than indexes — the list can reload. */
  readonly expanded = signal<Set<number>>(new Set());

  readonly title = computed(() => {
    const lead = this.lead();
    return lead ? whoLabel(lead) : 'Lead';
  });

  /** First touch and last touch, shown separately — they answer different questions. */
  readonly firstUtm = computed(() => entriesOf(this.lead()?.firstUtm));
  readonly lastUtm = computed(() => entriesOf(this.lead()?.lastUtm));

  constructor() {
    this.load(Number(this.route.snapshot.paramMap.get('id')));
  }

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
    this.api.get<LeadDetail>(`/super-admin/leads/${id}`).subscribe({
      next: (data) => {
        this.lead.set(data.lead);
        this.visits.set(data.visits ?? []);
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

  expandAll(): void {
    this.expanded.set(new Set(this.visits().map((visit) => visit.id)));
  }

  collapseAll(): void {
    this.expanded.set(new Set());
  }
}
