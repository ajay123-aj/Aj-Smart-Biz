import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Promise-based confirmation. `ConfirmDialogComponent` renders whatever sits in
 * `state`, so any component can `await confirm.ask(...)` without local markup.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly state = signal<ConfirmState | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.state.set({ confirmText: 'Confirm', cancelText: 'Cancel', ...options, resolve });
    });
  }

  /** Shorthand for the delete confirmations every list screen needs. */
  askDelete(label: string): Promise<boolean> {
    return this.ask({
      title: `Delete ${label}?`,
      message: `This will remove ${label}. The record is soft deleted and can be restored later.`,
      confirmText: 'Delete',
      danger: true,
    });
  }

  answer(value: boolean): void {
    const current = this.state();
    this.state.set(null);
    current?.resolve(value);
  }
}
