import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
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
  imports: [RouterLink, DatePipe, DecimalPipe, PageHeaderComponent, PlanTimerComponent, StatusBadgeComponent, CanDirective],
  templateUrl: './dashboard.component.html',
  /*
   * No `styles:` block.
   *
   * `.tile`, `.stat` and `.meter` used to live here, which is why the four other
   * screens marked up with those same classes rendered their figures unstyled —
   * Angular scopes a component's CSS, so nothing outside this file could see
   * them. They are design-system primitives now; see `styles.scss`. This page is
   * the plainest consumer of them and should need no CSS of its own.
   */
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly data = signal<AdminDashboard | null>(null);

  /**
   * Money, in the tenant's own currency.
   *
   * The dashboard has no order rows to read a currency off, so it uses the
   * platform's default — which is what every figure on it is denominated in
   * today. When multi-currency tenants exist this reads it from the company
   * profile instead, and nothing else on the page changes.
   */
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
  readonly loading = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.get<AdminDashboard>('/admin/dashboard').subscribe({
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
