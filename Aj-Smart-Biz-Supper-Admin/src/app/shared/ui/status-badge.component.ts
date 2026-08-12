import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const TONES: Record<string, string> = {
  active: 'success',
  success: 'success',
  inactive: 'muted',
  pending: 'info',
  /** Queued to start later — informational, not a problem. */
  scheduled: 'info',
  suspended: 'warning',
  expired: 'warning',
  failed: 'danger',
  cancelled: 'danger',
  /** Replaced mid-term by an upgrade or downgrade; nothing went wrong. */
  superseded: 'muted',
  refunded: 'info',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-badge.component.html',
})
export class StatusBadgeComponent {
  readonly value = input.required<string | null | undefined>();

  readonly tone = computed(() => TONES[String(this.value() ?? '').toLowerCase()] ?? 'muted');
  readonly label = computed(() => {
    const raw = String(this.value() ?? '—').replace(/_/g, ' ');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });
}
