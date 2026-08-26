import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { FUNCTIONALITY_CATALOGUE_PATH } from '../../core/services/crud.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Branch,
  FeatureIconMeta,
  Functionality,
  FunctionalityCatalogue,
  ServiceCard,
  ServicesSettings,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { IconPickerComponent } from '../../shared/ui/icon-picker.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/** The key this whole screen is about. Written once rather than in eight places. */
const KEY = 'services' as const;

/** Matches `SERVICE_HIGHLIGHTS_MAX` in the API, which refuses a longer list. */
const HIGHLIGHTS_MAX = 6;

/**
 * The Services screen: what the business sells, priced and described in its own
 * words.
 *
 * The same two shapes of editing every website-content screen has — one form
 * for the section's own wording, saved whole, and a list of cards added one at
 * a time. What is different here is what a card carries, and each addition
 * earned its place by being the next question a visitor asks:
 *
 *   picture       a photograph of the actual work outsells any glyph, so the
 *                 icon becomes the fallback rather than the alternative
 *   inclusions    "what do I get for that" is the question after the name, and
 *                 answering it in a paragraph buries it
 *   price line    free text, never a number: a business that quotes per job and
 *                 one that charges per hour both have to fit
 *   featured      one or two services read first, given the wide cell
 *
 * The **menu name** field is here too, and nowhere else. Services is a page on
 * the website as well as a band on the home page, so it needs a name in the
 * nav, and — unlike About and Contact — it has no settings table of its own to
 * keep one in. Blank keeps the platform's name, exactly as theirs do.
 *
 * There is no starting set of services, deliberately. Every other seeded list
 * on the platform replaces wording the template used to invent; a service the
 * platform made up would be the business advertising work it may not do.
 */
@Component({
  selector: 'app-services-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    FeatureGateComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
    IconPickerComponent,
    ImageUploadComponent,
  ],
  templateUrl: './services-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      .grid-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 14px;
      }

      .svc {
        display: flex; flex-direction: column;
        border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); overflow: hidden;
      }
      .svc-inactive { opacity: .62; background: var(--surface-2); }
      /* A featured card is marked in the list the way the website marks it on
         the page, so the tenant is choosing against what a visitor sees. */
      .svc-featured { border-color: var(--brand-400, var(--brand-600)); }

      /* The photograph, at the aspect the website crops it to. */
      .svc-photo { display: block; width: 100%; height: 132px; object-fit: cover; background: var(--surface-2); }

      .svc-body { display: flex; gap: 12px; padding: 14px; flex: 1; }

      .svc-icon {
        flex: none; width: 40px; height: 40px; display: grid; place-items: center;
        border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border);
        color: var(--brand-600);
      }
      .svc-icon svg { width: 22px; height: 22px; }

      .svc-main { flex: 1; min-width: 0; }
      .svc-title { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .svc-text {
        margin: 4px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .svc-untitled { font-size: 12px; color: var(--text-3); font-style: italic; margin: 4px 0 0; }

      .svc-price {
        display: inline-block; margin-top: 8px; padding: 2px 8px; border-radius: 999px;
        background: var(--surface-2); border: 1px solid var(--border);
        font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums;
      }

      .svc-points { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; }
      .svc-points li { font-size: 11.5px; color: var(--text-3); display: flex; gap: 6px; }
      .svc-points .tick { color: var(--brand-600); flex: none; }

      .svc-foot {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 10px 13px; border-top: 1px solid var(--border);
      }
      .svc-foot .spacer { flex: 1; }
      .seq-num { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; min-width: 18px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      /* The inclusions editor: a row per line, with its own remove button. */
      .points-rows { display: grid; gap: 8px; }
      .points-row { display: flex; gap: 8px; align-items: center; }
      .points-row .input { flex: 1; }
    `,
  ],
})
export class ServicesManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly uploads = inject(UploadService);
  private readonly cards = this.companies.cards<ServiceCard>('services');

  /** The most inclusions one card may carry. The API refuses more. */
  readonly highlightsMax = HIGHLIGHTS_MAX;

  /**
   * Writes are the main admin's, as with the company profile and domains. This
   * screen carries prices, which is the strongest case on the platform for that
   * rule rather than an exception to it.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly items = signal<ServiceCard[]>([]);
  readonly icons = signal<FeatureIconMeta[]>([]);
  /** The branch filter currently applied; drives what a new card is pinned to. */
  readonly branchFilter = signal<string>('');
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<ServiceCard | null>(null);

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  /** The section's own wording, and the name its page carries in the menu. */
  readonly copyForm = this.fb.nonNullable.group({
    navLabel: [''],
    eyebrow: [''],
    title: [''],
    lead: [''],
    ctaLabel: [''],
    /** Where a submitted enquiry goes. See `EnquiryTarget`. */
    enquiryTarget: ['both'],
    formTitle: [''],
    formNote: [''],
  });

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    icon: ['spark', [Validators.required]],
    image: [''],
    title: ['', [Validators.required]],
    summary: [''],
    highlights: this.fb.array<FormControl<string>>([]),
    priceLabel: [''],
    /** Blank means "use the section's label" — see `ServiceCard.ctaLabel`. */
    ctaLabel: [''],
    featured: [false],
    status: ['active'],
  });

  get highlights(): FormArray<FormControl<string>> {
    return this.form.controls.highlights;
  }

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
        this.toast.error('Could not load your services', messageOf(error));
      },
    });
  }

  /**
   * The icon library, shared with the Features screen. Fetched separately
   * because nothing on this screen waits for it: a card lists its glyph by name
   * regardless, and the picker says so plainly if the list is empty.
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
   * `navLabel` is the exception and is filled from the raw value: the API sends
   * null when the tenant has never named the page, and the field shows the
   * platform's name as a placeholder rather than pretending it was typed.
   */
  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<ServicesSettings>;
    this.copyForm.reset({
      navLabel: settings.navLabel ?? '',
      eyebrow: settings.eyebrow ?? '',
      title: settings.title ?? '',
      lead: settings.lead ?? '',
      ctaLabel: settings.ctaLabel ?? '',
      enquiryTarget: settings.enquiryTarget ?? 'both',
      formTitle: settings.formTitle ?? '',
      formNote: settings.formNote ?? '',
    });
  }

  saveCopy(): void {
    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        navLabel: raw.navLabel || null,
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        ctaLabel: raw.ctaLabel || null,
        /* Never blank: it is a choice, not a piece of copy, and clearing it
           would land on the default rather than on what the tenant picked. */
        enquiryTarget: raw.enquiryTarget,
        formTitle: raw.formTitle || null,
        formNote: raw.formNote || null,
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

  /* ------------------------------ the services ----------------------------- */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /**
   * Narrows the list to one scope. `none` is the company-wide services, which
   * the API spells the same way.
   */
  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.loadItems();
  }

  /**
   * A service added while the list is filtered to one branch belongs to that
   * branch — landing it company-wide would put it on every site silently.
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

  imageUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  /* ------------------------------- inclusions ------------------------------ */

  addHighlight(value = ''): void {
    if (this.highlights.length >= HIGHLIGHTS_MAX) return;
    this.highlights.push(this.fb.nonNullable.control(value));
  }

  removeHighlight(index: number): void {
    this.highlights.removeAt(index);
  }

  private setHighlights(values: string[]): void {
    this.highlights.clear();
    values.forEach((value) => this.addHighlight(value));
  }

  /* --------------------------------- the form ------------------------------ */

  open(row: ServiceCard | null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      icon: row?.icon ?? 'spark',
      image: row?.image ?? '',
      title: row?.title ?? '',
      summary: row?.summary ?? '',
      priceLabel: row?.priceLabel ?? '',
      ctaLabel: row?.ctaLabel ?? '',
      featured: row?.featured ?? false,
      status: row?.status ?? 'active',
    });
    // `reset` does not resize a FormArray, so the rows are rebuilt by hand.
    // One empty row on a new service, so the field is visibly there to fill in.
    this.setHighlights(row?.highlights?.length ? row.highlights : row ? [] : ['']);
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
      image: raw.image || null,
      title: raw.title,
      summary: raw.summary || null,
      // Blank rows are dropped rather than refused — somebody filling in four
      // of six boxes should not get a validation error for the two they left.
      highlights: raw.highlights.map((line) => line.trim()).filter(Boolean),
      priceLabel: raw.priceLabel || null,
      /* Blank means "use the section's", so it goes as null rather than as an
         empty string that would render an empty button. */
      ctaLabel: raw.ctaLabel || null,
      featured: raw.featured,
      status: raw.status,
    };

    const row = this.editing();
    this.saving.set(true);

    const request = row ? this.cards.update(row.id, payload) : this.cards.create(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Service updated' : 'Service added');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the service', messageOf(error));
      },
    });
  }

  toggle(row: ServiceCard): void {
    this.cards.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`Service is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  move(row: ServiceCard, direction: -1 | 1): void {
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
        this.toast.error('Could not reorder the services', messageOf(error));
      },
    });
  }

  async remove(row: ServiceCard): Promise<void> {
    if (!(await this.confirm.askDelete(`the service "${row.title}"`))) return;

    this.cards.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Service deleted');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the service', messageOf(error)),
    });
  }
}
