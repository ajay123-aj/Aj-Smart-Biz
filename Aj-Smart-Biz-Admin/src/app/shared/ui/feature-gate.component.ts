import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Functionality } from '../../core/models/domain.model';

/**
 * The banner every website-content screen shows above its editor.
 *
 * There are three states worth telling apart, and the wording comes from the
 * API in all of them, so this banner and a refused request can never disagree:
 *
 *   not granted   the plan does not include it — the editor below is read only
 *   switched off  editable, but nothing reaches the website yet
 *   switched on,
 *   empty         entitled and on, but the section has nothing in it, so the
 *                 website still shows nothing — several sections are absent
 *                 rather than empty by design
 *   live          on the website right now
 *
 * A screen that is not granted still shows its content rather than an empty
 * page: a tenant that downgraded should be able to see what it wrote, and what
 * it would get back by upgrading.
 */
@Component({
  selector: 'app-feature-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (feature(); as item) {
      <div class="gate" [class.gate-block]="!item.granted" [class.gate-live]="item.active && item.published !== false">
        <span class="gate-icon" aria-hidden="true">{{
          item.active ? (item.published === false ? '○' : '✓') : item.granted ? '○' : '🔒'
        }}</span>

        <div class="gate-body">
          <div class="gate-title">
            <!--
              "Live" only when something is actually published. A section that
              is switched on but empty is absent from the website, and saying it
              is live is the one thing this banner exists to prevent.
            -->
            @if (item.active && item.published === false) {
              {{ item.name }} is switched on, but nothing is published yet
            } @else if (item.active) {
              {{ item.name }} is live on your website
            } @else if (!item.granted) {
              {{ item.name }} is not included in your plan
            } @else {
              {{ item.name }} is switched off
            }
          </div>

          @if (item.message) {
            <p class="gate-note">{{ item.message }}</p>
          }
        </div>

        <div class="gate-actions">
          @if (!item.granted) {
            <a class="btn btn-sm btn-primary" routerLink="/plan">View plans →</a>
          } @else if (!item.enabled) {
            <a class="btn btn-sm btn-ghost" routerLink="/company/functionality">
              Switch it on →
            </a>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .gate {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 13px 16px; margin-bottom: 18px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
      }
      .gate-live { border-color: var(--success); background: rgba(34, 197, 94, .07); }
      .gate-block { border-color: var(--warning); background: rgba(245, 158, 11, .07); }
      .gate-icon { flex: none; font-size: 15px; line-height: 1.5; }
      .gate-body { flex: 1; min-width: 0; }
      .gate-title { font-weight: 600; font-size: 13.5px; }
      .gate-note { margin: 3px 0 0; font-size: 12.5px; color: var(--text-3); line-height: 1.5; }
      .gate-actions { flex: none; }
    `,
  ],
})
export class FeatureGateComponent {
  readonly feature = input<Functionality | null>(null);
}
