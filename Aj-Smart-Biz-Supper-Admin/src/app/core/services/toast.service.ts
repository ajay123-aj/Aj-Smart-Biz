import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  private push(kind: ToastKind, title: string, detail?: string, ttl = 4500): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, title, detail }]);
    setTimeout(() => this.dismiss(id), ttl);
  }

  success(title: string, detail?: string): void { this.push('success', title, detail); }
  error(title: string, detail?: string): void { this.push('error', title, detail, 7000); }
  warning(title: string, detail?: string): void { this.push('warning', title, detail, 6000); }
  info(title: string, detail?: string): void { this.push('info', title, detail); }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}
