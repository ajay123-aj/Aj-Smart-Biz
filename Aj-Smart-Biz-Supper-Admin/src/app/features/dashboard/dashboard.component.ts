import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { SuperAdminDashboard } from '../../core/models/domain.model';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { compactMoney, formatMoney, monthLabel } from '../../shared/utils';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, PageHeaderComponent, StatusBadgeComponent],
  templateUrl: './dashboard.component.html',
  styles: [
    `
      .tile {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 18px;
        box-shadow: var(--shadow-sm);
      }
      .tile-top { display: flex; align-items: center; gap: 10px; }
      .tile-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; font-size: 16px; }
      .tile-label { font-size: 12.5px; font-weight: 600; color: var(--text-2); }
      .tile-value { font-size: 27px; font-weight: 700; letter-spacing: -0.02em; margin: 12px 0 10px; }
      .tile-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

      .chart { display: flex; align-items: flex-end; gap: 10px; height: 210px; padding-top: 18px; }
      .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; min-width: 0; }
      .chart-value { color: var(--text-2); font-weight: 600; white-space: nowrap; font-size: 10.5px; }
      .chart-bar {
        width: 100%; max-width: 42px; min-height: 3px;
        background: linear-gradient(180deg, var(--brand-500), var(--brand-700));
        border-radius: 5px 5px 2px 2px;
      }
      .chart-axis { white-space: nowrap; font-size: 10.5px; }

      .plan-row { margin-bottom: 14px; }
      .plan-row:last-child { margin-bottom: 0; }
      .meter { height: 7px; margin-top: 6px; background: var(--surface-3); border-radius: 99px; overflow: hidden; }
      .meter-fill { height: 100%; background: var(--brand-600); border-radius: 99px; }

      @media (max-width: 1000px) {
        :host ::ng-deep section.grid { grid-template-columns: 1fr !important; }
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly api = inject(ApiService);

  readonly data = signal<SuperAdminDashboard | null>(null);
  readonly loading = signal(false);

  /** Tallest bar defines the 100% mark of the income chart. */
  private readonly peak = computed(() =>
    Math.max(1, ...(this.data()?.monthlyIncome ?? []).map((point) => point.total))
  );
  private readonly planTotal = computed(() =>
    Math.max(1, (this.data()?.companiesByPlan ?? []).reduce((sum, row) => sum + row.total, 0))
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<SuperAdminDashboard>('/dashboard/super-admin').subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  money(value: number | string, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  compact(value: number, currency = 'INR'): string {
    return value === 0 ? '—' : compactMoney(value, currency);
  }

  monthName(value: string): string {
    return monthLabel(value);
  }

  barHeight(value: number): number {
    return Math.max(2, (value / this.peak()) * 100);
  }

  planShare(value: number): number {
    return (value / this.planTotal()) * 100;
  }

  absGrowth(value: number): string {
    return Math.abs(value).toFixed(1);
  }

  chartSummary(): string {
    const points = this.data()?.monthlyIncome ?? [];
    if (!points.length) return 'No income data';
    return `Monthly income from ${monthLabel(points[0].month)} to ${monthLabel(points[points.length - 1].month)}`;
  }
}
