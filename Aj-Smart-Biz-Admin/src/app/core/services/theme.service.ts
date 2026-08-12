import { Injectable, effect, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const KEY = `${environment.storagePrefix}theme`;
export type UiTheme = 'light' | 'dark';

/** Light/dark switch: writes `data-theme` on <html>, which the token sheet keys off. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<UiTheme>((localStorage.getItem(KEY) as UiTheme) ?? 'light');

  constructor() {
    effect(() => {
      const value = this.theme();
      document.documentElement.setAttribute('data-theme', value);
      localStorage.setItem(KEY, value);
    });
  }

  toggle(): void {
    this.theme.update((value) => (value === 'light' ? 'dark' : 'light'));
  }
}
