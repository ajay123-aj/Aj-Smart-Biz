import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';

type ErrorFormatter = (error: Record<string, unknown>, label: string) => string;

const MESSAGES: Record<string, ErrorFormatter> = {
  required: (_error, label) => `${label} is required`,
  email: (_error, label) => `${label} must be a valid email`,
  minlength: (error, label) => `${label} must be at least ${error['requiredLength']} characters`,
  maxlength: (error, label) => `${label} must be at most ${error['requiredLength']} characters`,
  min: (error, label) => `${label} must be ${error['min']} or more`,
  max: (error, label) => `${label} must be ${error['max']} or less`,
  pattern: (_error, label) => `${label} is not in the expected format`,
  mismatch: () => 'Passwords do not match',
  weakPassword: (error, label) => `${label} needs ${listOf((error['missing'] as string[]) ?? [])}`,
};

/** "a, b and c" — reads better than a bare comma list in a validation message. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? 'to be stronger';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * Shows the first validation message for a control once it has been touched.
 *
 * `errors`, `touched` and `dirty` are plain properties on a reactive form
 * control, not signals — a `computed` over them would read once and cache
 * forever, so the message would never appear. `AbstractControl.events` emits on
 * value, status, touched and pristine changes, so it is used to drive a version
 * signal that the computed depends on.
 */
@Component({
  selector: 'app-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-error.component.html',
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl | null>();
  readonly label = input('This field');

  /** Bumped whenever the bound control reports any change. */
  private readonly version = signal(0);

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      if (!control) return;
      const subscription = control.events.subscribe(() => this.version.update((v) => v + 1));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  readonly message = computed(() => {
    this.version(); // re-evaluate whenever the control changes
    const control = this.control();
    if (!control || !control.errors || !(control.touched || control.dirty)) return null;

    const [key, value] = Object.entries(control.errors)[0];
    const format = MESSAGES[key];
    const detail = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    return format ? format(detail, this.label()) : `${this.label()} is invalid`;
  });
}
