import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { ContactFormTarget, ContactSettings, ContactView, Functionality } from '../../core/models/domain.model';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';

/**
 * The Contact tab: whether the website has a Contact page, and how it reads.
 *
 * Gated by `contact_page` on the same rule as About, Team and Gallery — the
 * plan grants it, the company switches it on, and only then does the website
 * serve the page and show it in the nav. This screen decides its wording and
 * which blocks appear; the addresses, phone numbers and opening hours on it
 * still come from the company profile and its branches.
 *
 * Branch-aware on the same rule as the rest: a branch with no settings of its
 * own inherits the company-wide ones, and the bar at the top says which.
 */
@Component({
  selector: 'app-contact-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, FeatureGateComponent],
  templateUrl: './contact-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .scope-bar {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 11px 14px; margin-bottom: 18px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
      }
      .scope-label { font-size: 13px; font-weight: 600; }
      .scope-note { font-size: 12.5px; color: var(--text-3); }
      .scope-note-own { color: var(--success); font-weight: 500; }

      .note {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 12px 15px; margin-bottom: 20px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
        font-size: 12.5px; color: var(--text-3); line-height: 1.55;
      }
      .note-icon { flex: none; }

      /* The form target as two cards, because each needs a line of explanation. */
      .target-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .target {
        display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
        padding: 12px 14px; border: 1px solid var(--border); border-radius: 9px;
        transition: border-color .15s, background .15s;
      }
      .target:hover { border-color: var(--border-strong); }
      .target-on { border-color: var(--primary); background: rgba(37, 99, 235, .05); }
      .target input { margin-top: 2px; flex: none; }
      .target-name { font-weight: 600; font-size: 13px; }
      .target-hint { font-size: 11.5px; color: var(--text-3); line-height: 1.4; display: block; }

      .switch-row {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 14px 0; border-top: 1px solid var(--border);
      }
      .switch-row:last-of-type { border-bottom: 1px solid var(--border); }
      .switch-body { flex: 1; min-width: 0; }
      .switch-name { font-weight: 600; font-size: 13.5px; }
      .switch-hint { font-size: 12.5px; color: var(--text-3); margin-top: 2px; line-height: 1.5; }

      .switch { position: relative; display: inline-block; width: 38px; height: 21px; flex: none; margin-top: 2px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .switch .track {
        position: absolute; inset: 0; cursor: pointer;
        background: var(--border-strong); border-radius: 999px; transition: background .2s;
      }
      .switch .track::before {
        content: ''; position: absolute;
        width: 15px; height: 15px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%; transition: transform .2s;
      }
      .switch input:checked + .track { background: var(--success); }
      .switch input:checked + .track::before { transform: translateX(17px); }
      .switch input:disabled + .track { cursor: not-allowed; opacity: .5; }
    `,
  ],
})
export class ContactManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  /**
   * Writes are the main admin's, as with the company profile and domains.
   * Read here rather than passed in: this is a routed page now, and the rule
   * was never the caller's to decide.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly view = signal<ContactView | null>(null);
  readonly branches = signal<{ id: number; name: string; code: string }[]>([]);
  readonly scope = signal<number | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** False when this branch is inheriting rather than overriding. */
  readonly overridden = computed(() => this.view()?.overridden ?? true);

  /** Both the plan grant and the main-admin rule have to allow it. */
  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  readonly form = this.fb.nonNullable.group({
    navLabel: [''],
    eyebrow: [''],
    title: [''],
    lead: [''],
    showForm: [true],
    formTarget: ['email' as ContactFormTarget],
    formNote: [''],
    showLocations: [true],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === 'contact_page') ?? null;
        this.feature.set(item);
        this.loading.set(false);
        // Only worth fetching once the plan actually includes the page.
        if (item?.granted) this.loadScope();
        else this.patch(null);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your contact settings', messageOf(error));
      },
    });
  }

  /** Loads the settings for whichever scope is selected. */
  private loadScope(): void {
    this.companies.contact(this.scope()).subscribe({
      next: (view) => {
        this.view.set(view);
        this.branches.set(view.branches ?? []);
        this.patch(view.settings);
      },
      error: (error: HttpErrorResponse) =>
        this.toast.error('Could not load your contact settings', messageOf(error)),
    });
  }

  private patch(settings: ContactSettings | null): void {
    this.form.reset({
      navLabel: settings?.navLabel ?? '',
      eyebrow: settings?.eyebrow ?? '',
      title: settings?.title ?? '',
      lead: settings?.lead ?? '',
      showForm: settings?.showForm ?? true,
      formTarget: settings?.formTarget ?? 'email',
      formNote: settings?.formNote ?? '',
      showLocations: settings?.showLocations ?? true,
    });
    if (!this.writable()) this.form.disable();
    else this.form.enable();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  onScope(value: string): void {
    this.scope.set(value ? Number(value) : null);
    this.loadScope();
  }

  scopeName(): string {
    const id = this.scope();
    if (!id) return 'all branches';
    return this.branches().find((branch) => branch.id === id)?.name ?? 'this branch';
  }

  targetIs(target: ContactFormTarget): boolean {
    return this.form.controls.formTarget.value === target;
  }

  setTarget(target: ContactFormTarget): void {
    this.form.controls.formTarget.setValue(target);
    this.form.controls.formTarget.markAsDirty();
  }

  toggle(control: 'showForm' | 'showLocations', value: boolean): void {
    this.form.controls[control].setValue(value);
    this.form.controls[control].markAsDirty();
  }

  reset(): void {
    this.patch(this.view()?.settings ?? null);
  }

  save(): void {
    const raw = this.form.getRawValue();
    const branchId = this.scope();
    this.saving.set(true);

    this.companies
      .saveContact(branchId, {
        navLabel: raw.navLabel || null,
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        showForm: raw.showForm,
        formTarget: raw.formTarget,
        formNote: raw.formNote || null,
        showLocations: raw.showLocations,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success(branchId ? `Contact page saved for ${this.scopeName()}` : 'Contact page saved');
          this.loadScope();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save the contact settings', messageOf(error));
        },
      });
  }

  /** Drops a branch override so it inherits the company-wide settings again. */
  async clearOverride(): Promise<void> {
    const branchId = this.scope();
    if (!branchId) return;
    if (!(await this.confirm.askDelete(`the contact settings for ${this.scopeName()}`))) return;

    this.companies.clearContact(branchId).subscribe({
      next: () => {
        this.toast.success(`${this.scopeName()} now uses the company-wide contact settings`);
        this.loadScope();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not clear the override', messageOf(error)),
    });
  }
}
