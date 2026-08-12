import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-host.component.html',
})
export class ToastHostComponent {
  readonly toastService = inject(ToastService);

  icon(kind: string): string {
    return { success: '✅', error: '⛔', warning: '⚠️', info: 'ℹ️' }[kind] ?? 'ℹ️';
  }
}
