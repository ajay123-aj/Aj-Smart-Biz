import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import {
  Branch,
  Functionality,
  Product,
  ProductCategory,
  ProductsSettings,
  ProductStock,
} from '../../core/models/domain.model';
import { numberOrNull, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ImageGalleryUploadComponent } from '../../shared/ui/image-gallery-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

const KEY = 'products' as const;

/** Matches the API's own caps, which refuse anything longer. */
const IMAGES_MAX = 8;
const HIGHLIGHTS_MAX = 6;
const SPECS_MAX = 20;

/** Which slice of the catalogue the screen is showing. */
type Tab = 'all' | 'offers' | 'featured' | 'hidden';

/**
 * The Products screen: everything the business sells.
 *
 * The one screen in Company Details that **pages**. Every other list here is
 * short and edited as a whole — ten team members, thirty photographs — and this
 * one is however many things the business stocks, so it searches, filters and
 * pages like the Admin and Lead screens rather than like its neighbours.
 *
 * Three things it carries that no other content screen does:
 *
 *   several photographs   ordered, the first being the card image everywhere.
 *                         See `ImageGalleryUploadComponent` for why that is not
 *                         just an array of the single-image control.
 *   real prices           a number, an offer number, and a free-text override
 *                         for a business that cannot publish either. The form
 *                         computes the discount live, because a tenant typing
 *                         an offer price wants to know what it says on the card
 *                         before they save it, not after.
 *   specifications        label/value pairs printed as a table on the product
 *                         page — the part people compare between two products
 *                         rather than read.
 *
 * The wording for the catalogue and offers bands lives here; the categories
 * band's is on the Categories screen. Both save the whole settings blob merged,
 * so neither clears the other.
 */
@Component({
  selector: 'app-products-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    FeatureGateComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
    ImageGalleryUploadComponent,
    PagerComponent,
  ],
  templateUrl: './products-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      .form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) {
        .form-grid, .form-grid-3 { grid-template-columns: 1fr; }
      }

      .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
      .filters .grow { flex: 1; min-width: 180px; }

      .tabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 0 14px; }
      .tab {
        padding: 5px 12px; border-radius: 999px; cursor: pointer;
        border: 1px solid var(--border); background: var(--surface);
        font-size: 12.5px; font-weight: 600; color: var(--text-2);
      }
      .tab-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }

      .grid-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 14px;
      }

      .prod {
        display: flex; flex-direction: column;
        border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); overflow: hidden;
      }
      .prod-inactive { opacity: .62; background: var(--surface-2); }
      .prod-featured { border-color: var(--brand-400, var(--brand-600)); }

      .prod-photo { position: relative; }
      .prod-photo img { display: block; width: 100%; height: 150px; object-fit: cover; background: var(--surface-2); }
      .prod-photo .none {
        display: grid; place-items: center; height: 150px;
        background: var(--surface-2); color: var(--text-3); font-size: 12px;
      }
      /* How many more there are, so the tenant knows the gallery took them. */
      .shots {
        position: absolute; right: 6px; bottom: 6px;
        padding: 1px 7px; border-radius: 999px;
        background: rgba(0,0,0,.62); color: #fff; font-size: 10.5px; font-weight: 700;
      }
      .offer-flag {
        position: absolute; left: 6px; top: 6px;
        padding: 2px 8px; border-radius: 999px;
        background: var(--danger); color: #fff; font-size: 11px; font-weight: 700;
      }

      .prod-body { padding: 12px 13px; flex: 1; }
      .prod-name { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .prod-text {
        margin: 4px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .prod-sku { font-size: 11px; color: var(--text-3); font-family: var(--font-mono, monospace); }

      .prices { display: flex; align-items: baseline; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
      .price-now { font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
      .price-was { color: var(--text-3); text-decoration: line-through; font-size: 12px; font-variant-numeric: tabular-nums; }
      .price-words { font-size: 12.5px; font-weight: 600; color: var(--text-2); }

      .prod-foot {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 10px 13px; border-top: 1px solid var(--border);
      }
      .prod-foot .spacer { flex: 1; }
      .seq-num { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; min-width: 18px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      /* The live discount readout under the price fields. */
      .discount-note {
        margin: 6px 0 0; padding: 7px 10px; border-radius: 8px;
        background: var(--surface-2); border: 1px solid var(--border);
        font-size: 12px; color: var(--text-2);
      }
      .discount-note strong { color: var(--brand-600); }

      .rows { display: grid; gap: 8px; }
      .row-line { display: flex; gap: 8px; align-items: center; }
      .row-line .input { flex: 1; }
      .row-line .input-label { flex: 0 0 34%; }
    `,
  ],
})
export class ProductsManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly uploads = inject(UploadService);

  readonly imagesMax = IMAGES_MAX;
  readonly highlightsMax = HIGHLIGHTS_MAX;
  readonly specsMax = SPECS_MAX;

  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly items = signal<Product[]>([]);
  readonly meta = signal<PageMeta>(EMPTY_META);
  readonly categories = signal<{ id: number; label: string }[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly listing = signal(false);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<Product | null>(null);

  /** The filters, held as signals so the list reloads from one place. */
  readonly tab = signal<Tab>('all');
  readonly search = signal('');
  readonly branchFilter = signal<string>('');
  readonly categoryFilter = signal<string>('');
  readonly page = signal(1);
  readonly limit = signal(25);

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  /** The catalogue's own wording, the offers wording, and the page's menu name. */
  readonly copyForm = this.fb.nonNullable.group({
    navLabel: [''],
    eyebrow: [''],
    title: [''],
    lead: [''],
    ctaLabel: [''],
    offersEyebrow: [''],
    offersTitle: [''],
    offersLead: [''],
  });

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    categoryId: [''],
    name: ['', [Validators.required]],
    slug: [''],
    sku: [''],
    summary: [''],
    description: [''],
    images: this.fb.nonNullable.control<string[]>([]),
    highlights: this.fb.array<FormControl<string>>([]),
    specs: this.fb.array<FormGroup<{ label: FormControl<string>; value: FormControl<string> }>>([]),
    price: [''],
    offerPrice: [''],
    priceLabel: [''],
    onOffer: [false],
    offerLabel: [''],
    stockStatus: ['in_stock' as ProductStock],
    ctaLabel: [''],
    featured: [false],
    /**
     * Whether it may go in a basket, when the company is taking orders at all.
     *
     * Defaults to on, so switching the cart on puts a button on the whole
     * catalogue rather than on nothing. It is the exception that is worth
     * setting: the made-to-measure item, the thing priced in words, the display
     * piece that is not for sale. An out-of-stock product is never orderable
     * whatever this says — the API folds the two together.
     */
    orderable: [true],
    status: ['active'],
  });

  get highlights(): FormArray<FormControl<string>> {
    return this.form.controls.highlights;
  }

  get specs(): FormArray<FormGroup<{ label: FormControl<string>; value: FormControl<string> }>> {
    return this.form.controls.specs;
  }

  constructor() {
    this.load();
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
          this.loadCategories();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your products', messageOf(error));
      },
    });
  }

  /**
   * The filters, assembled in one place.
   *
   * The tabs are filters rather than a fifth thing: "Offers" is `onOffer=true`
   * and "Hidden" is `status=inactive`, both of which the API already answers.
   * Deriving them here means the tab a person clicks and the rows they get are
   * one decision rather than two that can drift.
   */
  private query(): ListQuery {
    const query: ListQuery = { page: this.page(), limit: this.limit() };

    if (this.search().trim()) query['search'] = this.search().trim();
    if (this.branchFilter()) query['branchId'] = this.branchFilter();
    if (this.categoryFilter()) query['categoryId'] = this.categoryFilter();

    if (this.tab() === 'offers') query['onOffer'] = true;
    if (this.tab() === 'featured') query['featured'] = true;
    if (this.tab() === 'hidden') query['status'] = 'inactive';

    return query;
  }

  private loadItems(): void {
    this.listing.set(true);
    this.companies.listProducts(this.query()).subscribe({
      next: (result) => {
        this.listing.set(false);
        this.items.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.listing.set(false);
        this.items.set([]);
        this.meta.set(EMPTY_META);
        this.toast.error('Could not load the products', messageOf(error));
      },
    });
  }

  /**
   * The category picker's options, indented to show the tree.
   *
   * Flattened here because a `<select>` cannot nest, and indentation is the only
   * way a dropdown can say "Dining tables is inside Furniture" — which matters,
   * because two categories in different branches of the tree may well share a
   * name.
   */
  private loadCategories(): void {
    this.companies.categoryTree().subscribe({
      next: (tree) => this.categories.set(flattenOptions(tree)),
      error: () => this.categories.set([]),
    });
  }

  private loadBranches(): void {
    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<ProductsSettings>;
    this.copyForm.reset({
      navLabel: settings.navLabel ?? '',
      eyebrow: settings.eyebrow ?? '',
      title: settings.title ?? '',
      lead: settings.lead ?? '',
      ctaLabel: settings.ctaLabel ?? '',
      offersEyebrow: settings.offersEyebrow ?? '',
      offersTitle: settings.offersTitle ?? '',
      offersLead: settings.offersLead ?? '',
    });
  }

  /** Merged with the stored blob, so the Categories screen's wording survives. */
  saveCopy(): void {
    const current = (this.feature()?.settings ?? {}) as Partial<ProductsSettings>;
    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        ...current,
        navLabel: raw.navLabel || null,
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        ctaLabel: raw.ctaLabel || null,
        offersEyebrow: raw.offersEyebrow || null,
        offersTitle: raw.offersTitle || null,
        offersLead: raw.offersLead || null,
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

  /* -------------------------------- filters ------------------------------- */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Any filter change goes back to page one — page four of the old filter is nowhere. */
  private refilter(): void {
    this.page.set(1);
    this.loadItems();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.refilter();
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.refilter();
  }

  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.refilter();
  }

  onCategoryFilter(value: string): void {
    this.categoryFilter.set(value);
    this.refilter();
  }

  onPage(page: number): void {
    this.page.set(page);
    this.loadItems();
  }

  onLimit(limit: number): void {
    this.limit.set(limit);
    this.refilter();
  }

  /* --------------------------------- cards -------------------------------- */

  imageUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  /** The card image — the first photograph, which is what the website uses too. */
  coverOf(row: Product): string | null {
    return this.imageUrl(row.images?.[0] ?? null);
  }

  /**
   * What the price boxes hold, if anything.
   *
   * The shared `numberOrNull` now. This screen had the only correct copy of it;
   * three others had written their own, and two of those threw the moment
   * somebody typed a figure. One implementation is the point of moving it.
   */
  private num(value: number | string | null | undefined): number | null {
    return numberOrNull(value);
  }

  /**
   * On offer, decided exactly as the API decides it: a reduced price, **or** the
   * flag a tenant pricing in words ticks by hand. Two rules would eventually
   * disagree, and the one place that would show is a badge on a live website.
   */
  isOnOffer(row: Product): boolean {
    if (row.onOffer) return true;
    const price = this.num(row.price);
    const offer = this.num(row.offerPrice);
    return price !== null && offer !== null && offer < price;
  }

  /** The saving as a whole percentage, or null when there is no pair to compare. */
  discountOf(row: Product): number | null {
    const price = this.num(row.price);
    const offer = this.num(row.offerPrice);
    if (price === null || offer === null || price <= 0 || offer >= price) return null;
    return Math.round(((price - offer) / price) * 100);
  }

  /** What the badge on the card says — the tenant's own words win. */
  offerBadge(row: Product): string | null {
    if (!this.isOnOffer(row)) return null;
    if (row.offerLabel) return row.offerLabel;
    const percent = this.discountOf(row);
    return percent === null ? 'Offer' : `-${percent}%`;
  }

  priceNow(row: Product): number | null {
    return this.num(row.offerPrice) ?? this.num(row.price);
  }

  /** Only when it is actually struck through — the old price, above the new one. */
  priceWas(row: Product): number | null {
    const price = this.num(row.price);
    const offer = this.num(row.offerPrice);
    return price !== null && offer !== null && offer < price ? price : null;
  }

  stockLabel(status: ProductStock): string {
    if (status === 'out_of_stock') return 'Out of stock';
    if (status === 'made_to_order') return 'Made to order';
    return 'In stock';
  }

  /* ------------------------- the live discount readout --------------------- */

  /**
   * Bumped by the price fields on every keystroke.
   *
   * A reactive form is not a signal, so a `computed` reading `getRawValue()`
   * would be evaluated once and never again. This is what gives it something to
   * depend on — cheaper and with less to unwind than a `valueChanges`
   * subscription and an effect.
   */
  readonly priceTick = signal(0);

  /**
   * What the card will say, computed while the tenant types.
   *
   * The alternative is saving, looking at the website and coming back — and the
   * number this produces is the one thing on the form nobody can work out at a
   * glance. It reads the form's own controls rather than a copy, so it cannot
   * describe a state the form is not in.
   */
  readonly livePricing = computed(() => {
    this.priceTick();
    const raw = this.form.getRawValue();
    const price = this.num(raw.price);
    const offer = this.num(raw.offerPrice);

    if (raw.priceLabel) {
      return { kind: 'words' as const, text: raw.priceLabel };
    }
    if (price !== null && offer !== null && offer < price) {
      return {
        kind: 'offer' as const,
        percent: Math.round(((price - offer) / price) * 100),
        saved: price - offer,
      };
    }
    if (price !== null && offer !== null) {
      return { kind: 'bad' as const };
    }
    return { kind: 'plain' as const, price };
  });

  onPriceInput(): void {
    this.priceTick.update((n) => n + 1);
  }

  /* ------------------------------- inclusions ----------------------------- */

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

  /* ----------------------------- specifications --------------------------- */

  addSpec(label = '', value = ''): void {
    if (this.specs.length >= SPECS_MAX) return;
    this.specs.push(
      this.fb.nonNullable.group({
        label: this.fb.nonNullable.control(label),
        value: this.fb.nonNullable.control(value),
      })
    );
  }

  removeSpec(index: number): void {
    this.specs.removeAt(index);
  }

  private setSpecs(rows: { label: string; value: string }[]): void {
    this.specs.clear();
    rows.forEach((row) => this.addSpec(row.label, row.value));
  }

  /* --------------------------------- the form ------------------------------ */

  private defaultBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  private defaultCategoryId(): string {
    const filter = this.categoryFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  open(row: Product | null): void {
    this.editing.set(row);

    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      categoryId: String(row?.categoryId ?? (row ? '' : this.defaultCategoryId())),
      name: row?.name ?? '',
      slug: row?.slug ?? '',
      sku: row?.sku ?? '',
      summary: row?.summary ?? '',
      description: row?.description ?? '',
      images: row?.images ?? [],
      price: row?.price === null || row?.price === undefined ? '' : String(row.price),
      offerPrice: row?.offerPrice === null || row?.offerPrice === undefined ? '' : String(row.offerPrice),
      priceLabel: row?.priceLabel ?? '',
      onOffer: row?.onOffer ?? false,
      offerLabel: row?.offerLabel ?? '',
      stockStatus: row?.stockStatus ?? 'in_stock',
      ctaLabel: row?.ctaLabel ?? '',
      featured: row?.featured ?? false,
      /* `?? true` rather than `|| true`: a stored `false` is the company saying
         this one is not for sale, and treating it as "never set" would put it
         back on the counter every time somebody opened the product. */
      orderable: row?.orderable ?? true,
      status: row?.status ?? 'active',
    });

    // `reset` does not resize a FormArray, so both are rebuilt by hand. One
    // empty row on a new product, so the field is visibly there to fill in.
    this.setHighlights(row?.highlights?.length ? row.highlights : row ? [] : ['']);
    this.setSpecs(row?.specs?.length ? row.specs : row ? [] : [{ label: '', value: '' }]);

    this.onPriceInput();
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const raw = this.form.getRawValue();
    const price = this.num(raw.price);
    const offerPrice = this.num(raw.offerPrice);

    /**
     * The same rule the API enforces, checked here so the message arrives before
     * the round trip rather than after it. An offer at or above the normal price
     * is not an offer, and a card advertising a 0% saving is worse than no badge.
     */
    if (price !== null && offerPrice !== null && offerPrice >= price) {
      this.toast.error(
        'That is not an offer',
        'The offer price has to be lower than the normal price.'
      );
      return;
    }

    const row = this.editing();

    const payload: Record<string, unknown> = {
      branchId: raw.branchId ? Number(raw.branchId) : null,
      categoryId: raw.categoryId ? Number(raw.categoryId) : null,
      name: raw.name,
      sku: raw.sku || null,
      summary: raw.summary || null,
      description: raw.description || null,
      images: raw.images ?? [],
      // Blank rows are dropped rather than refused — filling in four of six
      // boxes should not produce a validation error for the two left alone.
      highlights: raw.highlights.map((line) => line.trim()).filter(Boolean),
      specs: raw.specs
        .map((spec) => ({ label: (spec.label ?? '').trim(), value: (spec.value ?? '').trim() }))
        .filter((spec) => spec.label && spec.value),
      price,
      offerPrice,
      priceLabel: raw.priceLabel || null,
      onOffer: raw.onOffer,
      offerLabel: raw.offerLabel || null,
      stockStatus: raw.stockStatus,
      ctaLabel: raw.ctaLabel || null,
      featured: raw.featured,
      orderable: raw.orderable,
      status: raw.status,
    };

    // Only when the tenant deliberately changed it — see the Categories screen.
    if (raw.slug && raw.slug !== row?.slug) payload['slug'] = raw.slug;

    this.saving.set(true);
    const request = row
      ? this.companies.updateProduct(row.id, payload)
      : this.companies.createProduct(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Product updated' : 'Product added');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the product', messageOf(error));
      },
    });
  }

  toggle(row: Product): void {
    this.companies.toggleProduct(row.id).subscribe({
      next: () => {
        this.toast.success(`Product is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  /**
   * Reordering moves a product within the page being looked at.
   *
   * The call sends the ids of this page in their new order, and the API assigns
   * 1..n across them. On page one that is the catalogue's own order; deeper in,
   * it shuffles within the page — which is the honest behaviour for a list this
   * long, and why the hint under the grid says the order is what the website
   * uses.
   */
  move(row: Product, direction: -1 | 1): void {
    const items = [...this.items()];
    const from = items.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;

    [items[from], items[to]] = [items[to], items[from]];
    this.reordering.set(true);

    this.companies.reorderProducts(items.map((item) => item.id)).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the products', messageOf(error));
      },
    });
  }

  async remove(row: Product): Promise<void> {
    if (!(await this.confirm.askDelete(`the product "${row.name}"`))) return;

    this.companies.removeProduct(row.id).subscribe({
      next: () => {
        this.toast.success('Product deleted');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the product', messageOf(error)),
    });
  }
}

/** The category tree as indented `<select>` options — a dropdown cannot nest. */
function flattenOptions(nodes: ProductCategory[], depth = 0): { id: number; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flattenOptions(node.children ?? [], depth + 1),
  ]);
}
