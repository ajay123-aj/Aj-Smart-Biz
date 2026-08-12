import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AdminDashboard } from '../../core/models/domain.model';
import { CanDirective } from '../../shared/can.directive';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PlanTimerComponent } from '../../shared/ui/plan-timer.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { initials } from '../../shared/utils';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, PageHeaderComponent, PlanTimerComponent, StatusBadgeComponent, CanDirective],
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
      .meter { height: 7px; margin-top: 6px; background: var(--surface-3); border-radius: 99px; overflow: hidden; }
      .meter-fill { height: 100%; background: var(--brand-600); border-radius: 99px; }
    `,
  ],
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly data = signal<AdminDashboard | null>(null);
  readonly loading = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<AdminDashboard>('/dashboard/admin').subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  usage(used: number, limit: number | null): number {
    if (!limit) return 0;
    return Math.min(100, (used / limit) * 100);
  }
}
