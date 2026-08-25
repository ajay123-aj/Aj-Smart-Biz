import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LeadStage } from '../../core/models/domain.model';

/**
 * A lead's stage as a coloured pill.
 *
 * Not `app-status-badge`: that one maps subscription and transaction words, and
 * a lead's vocabulary does not overlap with either — `new` there means a
 * brand-new subscription and reads as informational, whereas here it means
 * nobody has rung this person yet, which is the one state the screen exists to
 * make obvious.
 *
 * The colours run cold to warm along the pipeline, so the shape of a company's
 * funnel is readable from the column alone without anyone reading the words.
 */
const TONES: Record<LeadStage, string> = {
  new: 'info',
  contacted: 'warning',
  qualified: 'brand',
  converted: 'success',
  lost: 'muted',
};

@Component({
  selector: 'app-lead-stage-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge badge-{{ tone() }}">{{ label() }}</span>`,
})
export class LeadStageBadgeComponent {
  readonly value = input.required<LeadStage | null | undefined>();

  readonly tone = computed(() => TONES[this.value() as LeadStage] ?? 'muted');
  readonly label = computed(() => {
    const raw = String(this.value() ?? 'new');
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });
}
