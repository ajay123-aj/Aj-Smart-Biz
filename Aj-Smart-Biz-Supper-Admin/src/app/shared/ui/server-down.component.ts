import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ServerStatusService } from '../../core/services/server-status.service';

/**
 * Replaces the console when the API cannot be reached.
 *
 * It takes the whole screen rather than sitting in a corner. Every table, count
 * and menu in this app comes from the API, so with it gone the console behind
 * this would be empty forms and blank lists — which reads as broken software.
 * Saying plainly that the server is unreachable is both more honest and more
 * useful, and it is the difference between "this app is broken" and "start the
 * API".
 *
 * Retry re-issues whatever the app was doing rather than reloading the page:
 * the token and the current route survive, so a recovered connection puts the
 * user back where they were instead of at the dashboard. The status signal
 * flips back on its own as soon as anything answers, so this disappears
 * without being dismissed.
 */
@Component({
  selector: 'app-server-down',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="panel">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6.5h16M4 12h16M4 17.5h9" />
            <path d="m16.5 15.5 5 5M21.5 15.5l-5 5" />
          </svg>
        </span>

        <h1>Cannot reach the server</h1>
        <p>
          The console could not connect to the Aj Smart Biz API. Nothing you have
          done is lost &mdash; this screen goes as soon as the connection is back.
        </p>

        <button type="button" class="btn btn-primary" [disabled]="retrying()" (click)="retry()">
          {{ retrying() ? 'Trying…' : 'Try again' }}
        </button>

        <p class="hint">
          If you are running this locally, start the API with
          <code>npm run dev</code> in the backend project.
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .wrap {
        position: fixed; inset: 0; z-index: 9000;
        display: grid; place-items: center; padding: 24px;
        background: var(--bg, #f6f7fb);
      }
      .panel {
        max-width: 460px; width: 100%; text-align: center;
        padding: 40px 34px 32px;
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e5e7eb);
        border-radius: 16px;
        box-shadow: 0 18px 50px rgba(20, 20, 40, .1);
      }
      .mark {
        display: grid; place-items: center;
        width: 58px; height: 58px; margin: 0 auto 20px;
        border-radius: 50%;
        color: var(--text-3, #6b7280);
        background: var(--surface-2, #f3f4f6);
      }
      .mark svg { width: 26px; height: 26px; }
      h1 { margin: 0; font-size: 20px; }
      p { margin: 12px 0 0; color: var(--text-2, #4b5563); font-size: 14px; line-height: 1.6; }
      .btn { margin-top: 22px; }
      .hint {
        margin-top: 20px; padding-top: 16px;
        border-top: 1px solid var(--border, #e5e7eb);
        color: var(--text-3, #6b7280); font-size: 12.5px;
      }
      code {
        padding: 1px 5px; border-radius: 4px;
        background: var(--surface-2, #f3f4f6); font-size: 12px;
      }
    `,
  ],
})
export class ServerDownComponent {
  private readonly status = inject(ServerStatusService);
  readonly retrying = signal(false);

  /**
   * A reload is the honest retry here.
   *
   * The alternative — re-running whatever request failed — would need every
   * screen to expose a way to re-issue itself, and would still leave the app
   * holding half-loaded state from before the outage. A reload re-runs the
   * whole bootstrap against a server that is either back or not, and the token
   * is in localStorage so nobody is signed out by it.
   */
  retry(): void {
    this.retrying.set(true);
    // Optimistic: if the reload is refused because the API is still down, the
    // interceptor sets it straight back.
    this.status.markReachable();
    window.location.reload();
  }
}
