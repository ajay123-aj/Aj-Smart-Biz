import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';

/**
 * Mirrors the API's password rule, but reports exactly what is missing rather
 * than a generic "wrong format" — the difference between a user fixing their
 * password and giving up.
 */
export function strongPassword(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) return null;

  const missing: string[] = [];
  if (value.length < 8) missing.push('at least 8 characters');
  if (!/[a-z]/.test(value)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(value)) missing.push('an uppercase letter');
  if (!/\d/.test(value)) missing.push('a number');

  return missing.length ? { weakPassword: { missing } } : null;
}

/** Marks everything touched so validation messages appear on a failed submit. */
export function touchAll(group: FormGroup): void {
  Object.values(group.controls).forEach((control: AbstractControl) => {
    control.markAsTouched();
    control.updateValueAndValidity({ emitEvent: false });
    if (control instanceof FormGroup) touchAll(control);
  });
}

/**
 * Drops empty strings so a cleared optional input is sent as `null`
 * instead of `''`, which the Joi schemas would reject on typed fields.
 */
export function cleanPayload<T extends Record<string, unknown>>(value: T): Partial<T> {
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, item]) => {
    result[key] = item === '' ? null : item;
  });
  return result as Partial<T>;
}

/** Two initials for the avatar circle. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function formatMoney(value: number | string | null | undefined, currency = 'INR'): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** Compact form for dashboard tiles: 1.2L, 45.0K. */
export function compactMoney(value: number | string | null | undefined, currency = 'INR'): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return formatMoney(0, currency);
  const symbol = currency === 'INR' ? '₹' : '';
  if (Math.abs(amount) >= 10_000_000) return `${symbol}${(amount / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(amount) >= 100_000) return `${symbol}${(amount / 100_000).toFixed(2)}L`;
  if (Math.abs(amount) >= 1_000) return `${symbol}${(amount / 1_000).toFixed(1)}K`;
  return formatMoney(amount, currency);
}

export function daysBetween(from: string | Date, to: string | Date = new Date()): number {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return Math.ceil((start - end) / 86_400_000);
}

/** `2026-08` -> `Aug 26`, for the income chart axis. */
export function monthLabel(value: string): string {
  const [year, month] = value.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}
