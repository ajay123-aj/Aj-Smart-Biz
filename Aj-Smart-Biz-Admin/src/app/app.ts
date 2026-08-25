import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog.component';
import { ToastHostComponent } from './shared/ui/toast-host.component';
import { ServerDownComponent } from './shared/ui/server-down.component';
import { ServerStatusService } from './core/services/server-status.service';
import { BrandingService } from './core/services/branding.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ToastHostComponent, ConfirmDialogComponent, ServerDownComponent],
  templateUrl: './app.html',
})
export class App {
  /** Read in the template: with no API there is no console to show. */
  readonly status = inject(ServerStatusService);

  // Injected so the stored light/dark preference is applied on bootstrap.
  private readonly theme = inject(ThemeService);
  private readonly branding = inject(BrandingService);

  constructor() {
    // Paint the cached company's favicon and title straight away, so a hard
    // refresh of any page is branded before /auth/me has even been sent.
    this.branding.restore();
  }
}
