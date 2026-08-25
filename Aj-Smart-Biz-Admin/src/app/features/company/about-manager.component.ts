import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { AboutSettings, AboutView, Functionality } from '../../core/models/domain.model';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';

/**
 * The About screen: the page's prose, per branch.
 *
 * One form saved as a whole, and nothing else. The band of figures was here
 * until Figures became a functionality of its own — it is sold, switched on
 * and written separately now, on its own screen, because it appears on the home
 * page where none of this copy does. See `FiguresManagerComponent`.
 *
 * What is left is branch-aware in a way the other website screens are not: a
 * branch either has its own copy or inherits the company-wide one, and the
 * banner at the top says which, because "nothing written here" and "the same as
 * everyone" look identical otherwise.
 */
@Component({
  selector: 'app-about-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, RouterLink, FeatureGateComponent],
  templateUrl: './about-manager.component.html',
  styles: [
    `
      :host { display: block; }

      /* Which site is being edited, above everything it affects. */
      .scope-bar {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 11px 14px; margin-bottom: 18px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
      }
      .scope-label { font-size: 13px; font-weight: 600; }
      .scope-note { font-size: 12.5px; color: var(--text-3); }
      .scope-note-own { color: var(--success); font-weight: 500; }

    `,
  ],
})
export class AboutManagerComponent {
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

  /**
   * Which scope is being edited: `null` is the company-wide copy, an id is one
   * branch. The form, the figures and the Save button all follow this one
   * signal, so there is never a doubt about what is being overwritten.
   */
  readonly scope = signal<number | null>(null);
  readonly view = signal<AboutView | null>(null);
  readonly branches = signal<{ id: number; name: string; code: string }[]>([]);
  /** False when the branch is inheriting the company-wide copy, not overriding it. */
  readonly overridden = computed(() => this.view()?.overridden ?? true);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** Both the plan grant and the main-admin rule have to allow it. */
  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  readonly form = this.fb.nonNullable.group({
    navLabel: [''],
    eyebrow: [''],
    title: [''],
    lead: [''],
    body: [''],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === 'about_us') ?? null;
        this.feature.set(item);
        this.loading.set(false);
        // Only worth fetching once the plan actually includes About.
        if (item?.granted) this.loadScope();
        else this.patchForm(null);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your About settings', messageOf(error));
      },
    });
  }

  /** Loads the copy for whichever scope is selected. */
  private loadScope(): void {
    this.companies.about(this.scope()).subscribe({
      next: (view) => {
        this.view.set(view);
        this.branches.set(view.branches ?? []);
        this.patchForm(view.copy);
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not load the About copy', messageOf(error)),
    });
  }

  /** Switching scope reloads the copy; nothing is carried across. */
  onScope(value: string): void {
    this.scope.set(value ? Number(value) : null);
    this.loadScope();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  scopeName(): string {
    const id = this.scope();
    if (!id) return 'all branches';
    return this.branches().find((branch) => branch.id === id)?.name ?? 'this branch';
  }

  private patchForm(copy: AboutSettings | null): void {
    this.form.reset({
      navLabel: copy?.navLabel ?? '',
      eyebrow: copy?.eyebrow ?? '',
      title: copy?.title ?? '',
      lead: copy?.lead ?? '',
      body: copy?.body ?? '',
    });
    if (!this.canEdit() || !this.feature()?.granted) this.form.disable();
    else this.form.enable();
  }

  reset(): void {
    this.patchForm(this.view()?.copy ?? null);
  }

  save(): void {
    const raw = this.form.getRawValue();
    this.saving.set(true);

    const branchId = this.scope();

    this.companies
      .saveAbout(branchId, {
        navLabel: raw.navLabel || null,
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        body: raw.body || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success(branchId ? `About saved for ${this.scopeName()}` : 'About section saved');
          this.loadScope();
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save the About section', messageOf(error));
        },
      });
  }

  /**
   * Drops this branch's override so it inherits again. Confirmed, because the
   * copy is deleted rather than hidden — and offered only for a branch, since
   * the company-wide copy has nothing above it to fall back to.
   */
  async clearOverride(): Promise<void> {
    const branchId = this.scope();
    if (!branchId) return;
    if (!(await this.confirm.askDelete(`the About copy for ${this.scopeName()}`))) return;

    this.companies.clearAbout(branchId).subscribe({
      next: () => {
        this.toast.success(`${this.scopeName()} now uses the company-wide About copy`);
        this.loadScope();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not clear the override', messageOf(error)),
    });
  }
}
