import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { FUNCTIONALITY_CATALOGUE_PATH } from '../../core/services/crud.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Branch,
  FeatureCard,
  FeatureIconMeta,
  FeaturesSettings,
  Functionality,
  FunctionalityCatalogue,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { IconPickerComponent } from '../../shared/ui/icon-picker.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/** The key this whole screen is about. Written once rather than in six places. */
const KEY = 'features_benefits' as const;

/**
 * The Features / Benefits tab: what the business offers, and what each thing is
 * worth to the person reading it.
 *
 * Two shapes of editing on one screen, the same split the About tab uses. The
 * section's heading and lede are one form saved as a whole — they belong to the
 * section, not to any card, so they ride on the functionality's settings. The
 * benefits themselves are cards, added and reordered one at a time, because a
 * company with four reasons to choose it should not be filling in six slots.
 *
 * The band used to be six paragraphs of template copy, identical on every site
 * the platform served. Switching this on is what makes it the company's own —
 * and switching it off is what takes the section off the website altogether
 * rather than putting the template's words back.
 *
 * The icon is the part worth the trouble: a key from the platform's library
 * rather than an upload, so a tenant's cards look like a set and the website
 * can draw them itself. The library comes from the API — see `IconPicker` — so
 * this screen never offers a glyph the site cannot render.
 */
@Component({
  selector: 'app-features-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    FeatureGateComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
    IconPickerComponent,
  ],
  templateUrl: './features-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      .grid-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 14px;
      }

      .benefit {
        display: flex; flex-direction: column;
        border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); overflow: hidden;
      }
      .benefit-inactive { opacity: .62; background: var(--surface-2); }
      .benefit-body { display: flex; gap: 12px; padding: 14px; flex: 1; }

      /* The glyph at the size the website prints it, so the tenant is choosing
         against what a visitor sees rather than against a name in a list. */
      .benefit-icon {
        flex: none; width: 40px; height: 40px; display: grid; place-items: center;
        border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border);
        color: var(--brand-600);
      }
      .benefit-icon svg { width: 22px; height: 22px; }

      .benefit-main { flex: 1; min-width: 0; }
      .benefit-title { font-weight: 600; font-size: 13.5px; }
      .benefit-text {
        margin: 4px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
      }
      .benefit-untitled { font-size: 12px; color: var(--text-3); font-style: italic; margin: 4px 0 0; }

      .benefit-foot {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 10px 13px; border-top: 1px solid var(--border);
      }
      .benefit-foot .spacer { flex: 1; }
      .seq-num { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; min-width: 18px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
    `,
  ],
})
export class FeaturesManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly cards = this.companies.cards<FeatureCard>('features');

  /**
   * Writes are the main admin's, as with the company profile and domains.
   * Read here rather than passed in: this is a routed page, and the rule was
   * never the caller's to decide.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly items = signal<FeatureCard[]>([]);
  readonly icons = signal<FeatureIconMeta[]>([]);
  /** The branch filter currently applied; drives what a new card is pinned to. */
  readonly branchFilter = signal<string>('');
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<FeatureCard | null>(null);

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  /** The section's own wording. Saved as a whole, separately from the cards. */
  readonly copyForm = this.fb.nonNullable.group({
    eyebrow: [''],
    title: [''],
    lead: [''],
    ctaLabel: [''],
  });

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    icon: ['spark', [Validators.required]],
    title: ['', [Validators.required]],
    body: [''],
    status: ['active'],
  });

  constructor() {
    this.load();
    this.loadIcons();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === KEY) ?? null;
        this.feature.set(item);
        this.patchCopyForm();
        this.loading.set(false);
        if (item?.granted) {
          this.loadItems();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your benefits', messageOf(error));
      },
    });
  }

  /**
   * The icon library. Fetched separately from everything else because nothing
   * on the screen depends on it having arrived: the cards list their glyph by
   * name regardless, and the picker says so plainly if the list is empty.
   */
  private loadIcons(): void {
    this.api.get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH).subscribe({
      next: (catalogue) => this.icons.set(catalogue.featureIcons ?? []),
      error: () => this.icons.set([]),
    });
  }

  private loadItems(): void {
    this.cards.list(this.branchFilter() || undefined).subscribe({
      next: (rows) => this.items.set(rows),
      error: () => this.items.set([]),
    });
  }

  private loadBranches(): void {
    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      // The screen still works without them; the branch picker just stays empty.
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  /**
   * The wording form, filled from whatever the API resolved.
   *
   * The API answers with the platform's defaults where a company has written
   * nothing, so these fields show the words that are actually on the website
   * rather than empty boxes. Clearing one and saving puts the default back.
   */
  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<FeaturesSettings>;
    this.copyForm.reset({
      eyebrow: settings.eyebrow ?? '',
      title: settings.title ?? '',
      lead: settings.lead ?? '',
      ctaLabel: settings.ctaLabel ?? '',
    });
  }

  saveCopy(): void {
    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        ctaLabel: raw.ctaLabel || null,
      })
      .subscribe({
        next: (updated) => {
          this.savingCopy.set(false);
          this.feature.set(updated);
          this.patchCopyForm();
          this.toast.success('Section wording saved');
        },
        error: (error: HttpErrorResponse) => {
          this.savingCopy.set(false);
          this.toast.error('Could not save the wording', messageOf(error));
        },
      });
  }

  resetCopy(): void {
    this.patchCopyForm();
  }

  /* ------------------------------- the cards ------------------------------ */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /**
   * Narrows the list to one scope. `none` is the company-wide cards, which the
   * API spells the same way.
   */
  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.loadItems();
  }

  /**
   * A card added while the list is filtered to one branch belongs to that
   * branch — landing it company-wide would silently put it on every site.
   */
  private defaultBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  /** The glyph's drawing, or nothing if this catalogue does not list it. */
  pathsOf(icon: string): string[] {
    return this.icons().find((entry) => entry.key === icon)?.paths ?? [];
  }

  /** Its name, falling back to the raw key so a retired glyph still reads. */
  labelOf(icon: string): string {
    return this.icons().find((entry) => entry.key === icon)?.label ?? icon;
  }

  open(row: FeatureCard | null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      icon: row?.icon ?? 'spark',
      title: row?.title ?? '',
      body: row?.body ?? '',
      status: row?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const raw = this.form.getRawValue();
    const payload: Record<string, unknown> = {
      // Empty means company-wide, which is a real choice, so it goes as null.
      branchId: raw.branchId ? Number(raw.branchId) : null,
      icon: raw.icon,
      title: raw.title,
      body: raw.body || null,
      status: raw.status,
    };

    const row = this.editing();
    this.saving.set(true);

    const request = row ? this.cards.update(row.id, payload) : this.cards.create(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Benefit updated' : 'Benefit added');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the benefit', messageOf(error));
      },
    });
  }

  toggle(row: FeatureCard): void {
    this.cards.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`Benefit is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  move(row: FeatureCard, direction: -1 | 1): void {
    const items = [...this.items()];
    const from = items.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;

    [items[from], items[to]] = [items[to], items[from]];
    this.reordering.set(true);

    this.cards.reorder(items.map((item) => item.id)).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the benefits', messageOf(error));
      },
    });
  }

  async remove(row: FeatureCard): Promise<void> {
    if (!(await this.confirm.askDelete(`the benefit "${row.title}"`))) return;

    this.cards.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Benefit deleted');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the benefit', messageOf(error)),
    });
  }
}
