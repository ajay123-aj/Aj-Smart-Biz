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
/**
 * What a **number input** actually holds, as a number or nothing.
 *
 * `<input type="number">` is bound by Angular's `NumberValueAccessor`, not the
 * default one, and it writes three different things into a control over its
 * life: the initial value the form was built with (often `''`), a real `number`
 * once somebody types, and `null` the moment the box is cleared.
 *
 * Every one of those has bitten this console at least once:
 *
 *   `''.trim()` on a number   threw inside a save handler, after the spinner was
 *                             already on - so the request was never sent and the
 *                             button stayed on "Saving…" forever
 *   `null === ''`             is false, so a cleared price went to the API as
 *                             `Number(null)` - zero - and published "₹0" instead
 *                             of clearing the figure
 *
 * So: one place that answers "what number is in this box, if any", and `null`
 * for every kind of empty. A cleared box is not a zero, and this is the
 * distinction the whole platform is careful about - a service with no price is
 * priced in words, and one priced at nothing is free.
 */
export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A pipeline word as a person reads it: `contacted` -> `Contacted`.
 *
 * One rule, because the same five words appear in three places on the enquiries
 * screen - the stage badge in the table, the counters above it, and the Stage
 * box in the editor - and the box was the odd one out, offering raw lowercase
 * keys beside columns that said "Contacted". Two vocabularies for one field
 * reads as two different fields.
 */
export function stageLabel(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

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
