import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Backdrop + panel shell. Callers project the body and the footer:
 *
 *   <app-modal title="Edit plan" (closed)="close()">
 *     <form>...</form>
 *     <ng-container footer><button ...></ng-container>
 *   </app-modal>
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.component.html',
})
export class ModalComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Clicking the backdrop closes by default; forms with data can opt out. */
  readonly closeOnBackdrop = input(true);
  readonly closed = output<void>();

  onBackdrop(): void {
    if (this.closeOnBackdrop()) this.closed.emit();
  }
}
