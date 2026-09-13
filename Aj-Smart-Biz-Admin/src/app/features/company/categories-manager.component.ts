import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  ProductCategory,
  ProductsSettings,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { IconPickerComponent } from '../../shared/ui/icon-picker.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/** The key this whole screen is about. */
const KEY = 'products' as const;

/** Matches `CATEGORY_DEPTH_MAX` in the API, which refuses anything deeper. */
const DEPTH_MAX = 3;

/** One category, flattened, with the depth the picker indents it by. */
interface FlatCategory {
  row: ProductCategory;
  depth: number;
  /** True when this row is the last of its siblings — the tree guides use it. */
  last: boolean;
}

/**
 * The Categories screen: how a company sorts what it sells.
 *
 * A tree rather than a list, and that is the whole difference between this
 * screen and the eight beside it. Three things follow from it:
 *
 *   the rows are nested   a subcategory is shown under its parent, indented,
 *                         because a flat list of forty names sorted
 *                         alphabetically tells nobody what is under what
 *   the form has a parent a category is created *somewhere*, and the picker
 *                         refuses to offer the row's own descendants, because
 *                         moving a branch under itself is the one move that
 *                         produces a tree no page can finish rendering
 *   delete explains       deleting a category promotes its subcategories and
 *                         unfiles its products rather than deleting either, and
 *                         the confirmation says so in those words
 *
 * The wording above the categories band on the website is edited here too. It
 * is saved as part of the whole `products` settings blob — merged with whatever
 * the Products screen holds, so saving one never clears the other.
 */
@Component({
  selector: 'app-categories-manager',
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
  templateUrl: './categories-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      /* The tree. Rows rather than cards: the shape of the list is the
         information here, and cards in a grid would destroy it. */
      .tree { display: grid; gap: 6px; }

      .node {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 12px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface);
      }
      .node-inactive { opacity: .62; background: var(--surface-2); }
      .node-featured { border-color: var(--brand-400, var(--brand-600)); }

      /* One indent per level, with a guide so a deep row is still readable. */
      .node-depth-1 { margin-left: 0; }
      .node-depth-2 { margin-left: 26px; }
      .node-depth-3 { margin-left: 52px; }
      .node-depth-2::before, .node-depth-3::before {
        content: '';
        position: absolute; margin-left: -18px; width: 12px;
        border-top: 1px solid var(--border-strong);
      }

      .node-art {
        flex: none; width: 38px; height: 38px; border-radius: 9px; overflow: hidden;
        display: grid; place-items: center;
        background: var(--surface-2); border: 1px solid var(--border); color: var(--brand-600);
      }
      .node-art img { width: 100%; height: 100%; object-fit: cover; }
      .node-art svg { width: 20px; height: 20px; }

      .node-main { flex: 1; min-width: 0; }
      .node-name { font-weight: 600; font-size: 13.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .node-slug { font-size: 11px; color: var(--text-3); font-family: var(--font-mono, monospace); }
      .node-text {
        margin: 3px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
      }

      .node-tools { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .seq-num { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; min-width: 18px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      .count-pill {
        padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
        background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
        font-variant-numeric: tabular-nums;
      }
      .count-zero { color: var(--warning, var(--text-3)); }
    `,
  ],
})
export class CategoriesManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly uploads = inject(UploadService);
  private readonly client = this.companies.categories();

  readonly depthMax = DEPTH_MAX;

  /** Writes are the main admin's, as everywhere else in Company Details. */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly tree = signal<ProductCategory[]>([]);
  readonly icons = signal<FeatureIconMeta[]>([]);
  readonly branchFilter = signal<string>('');
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<ProductCategory | null>(null);

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  /**
   * The tree flattened for rendering, depth-first, so the template can paint one
   * row per category without recursing — a recursive template needs a component
   * of its own, and this list is short enough that flattening is honest.
   */
  readonly flat = computed(() => flatten(this.tree()));

  /** Every category as one option, indented, for the parent picker. */
  readonly parentOptions = computed(() => {
    const editing = this.editing();
    // The row itself and everything under it: offering either is offering a cycle.
    const forbidden = editing ? new Set(subtreeIds(this.tree(), editing.id)) : new Set<number>();

    return this.flat()
      .filter((entry) => !forbidden.has(entry.row.id))
      /* A category at the deepest level cannot take children, so it is not
         offered as a parent — better than accepting the choice and having the
         API refuse it after the tenant has filled in the rest of the form. */
      .filter((entry) => entry.depth < DEPTH_MAX)
      .map((entry) => ({
        id: entry.row.id,
        label: `${'— '.repeat(entry.depth - 1)}${entry.row.name}`,
      }));
  });

  /** The wording above the categories band on the website. */
  readonly copyForm = this.fb.nonNullable.group({
    categoriesEyebrow: [''],
    categoriesTitle: [''],
    categoriesLead: [''],
  });

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    parentId: [''],
    name: ['', [Validators.required]],
    slug: [''],
    description: [''],
    image: [''],
    icon: ['spark', [Validators.required]],
    featured: [false],
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
          this.loadTree();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your categories', messageOf(error));
      },
    });
  }

  private loadIcons(): void {
    this.api.get<FunctionalityCatalogue>(FUNCTIONALITY_CATALOGUE_PATH).subscribe({
      next: (catalogue) => this.icons.set(catalogue.featureIcons ?? []),
      error: () => this.icons.set([]),
    });
  }

  private loadTree(): void {
    this.companies.categoryTree(this.branchFilter() || undefined).subscribe({
      next: (rows) => this.tree.set(rows),
      error: () => this.tree.set([]),
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
      categoriesEyebrow: settings.categoriesEyebrow ?? '',
      categoriesTitle: settings.categoriesTitle ?? '',
      categoriesLead: settings.categoriesLead ?? '',
    });
  }

  /**
   * Saves the categories wording **merged into the whole settings blob**.
   *
   * The API replaces a functionality's settings wholesale, and the catalogue's
   * blob is shared with the Products screen — which holds the product wording,
   * the offers wording, the button label and the page's menu name. Sending only
   * these three fields would clear the other seven, so what is already resolved
   * is sent back alongside them.
   */
  saveCopy(): void {
    const current = (this.feature()?.settings ?? {}) as Partial<ProductsSettings>;
    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        ...current,
        categoriesEyebrow: raw.categoriesEyebrow || null,
        categoriesTitle: raw.categoriesTitle || null,
        categoriesLead: raw.categoriesLead || null,
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

  /* ------------------------------ the tree -------------------------------- */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.loadTree();
  }

  private defaultBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  pathsOf(icon: string): string[] {
    return this.icons().find((entry) => entry.key === icon)?.paths ?? [];
  }

  labelOf(icon: string): string {
    return this.icons().find((entry) => entry.key === icon)?.label ?? icon;
  }

  imageUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  /* -------------------------------- the form ------------------------------ */

  /**
   * `parent` pre-fills the picker, which is what the **+ Subcategory** button on
   * a row does — adding one under the category you are looking at should not
   * mean finding it again in a dropdown.
   */
  open(row: ProductCategory | null, parent: ProductCategory | null = null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? parent?.branchId ?? (row ? '' : this.defaultBranchId())),
      parentId: String(row?.parentId ?? parent?.id ?? ''),
      name: row?.name ?? '',
      slug: row?.slug ?? '',
      description: row?.description ?? '',
      image: row?.image ?? '',
      icon: row?.icon ?? 'spark',
      featured: row?.featured ?? false,
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
    const row = this.editing();

    const payload: Record<string, unknown> = {
      branchId: raw.branchId ? Number(raw.branchId) : null,
      parentId: raw.parentId ? Number(raw.parentId) : null,
      name: raw.name,
      description: raw.description || null,
      image: raw.image || null,
      icon: raw.icon,
      featured: raw.featured,
      status: raw.status,
    };

    /**
     * The slug is only sent when the tenant typed one.
     *
     * On a new category there is nothing to send and the API generates it. On an
     * edit, sending the unchanged value back would be harmless but sending a
     * *changed* name without it must not rewrite the URL — so the field is only
     * included when it actually differs from what is stored, which is the tenant
     * deliberately changing the address.
     */
    if (raw.slug && raw.slug !== row?.slug) payload['slug'] = raw.slug;

    this.saving.set(true);
    const request = row ? this.client.update(row.id, payload) : this.client.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Category updated' : 'Category added');
        this.loadTree();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the category', messageOf(error));
      },
    });
  }

  toggle(row: ProductCategory): void {
    this.client.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`Category is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadTree();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  /**
   * Moves a category within its own siblings.
   *
   * The reorder call takes ids and assigns 1..n, so it is sent the whole sibling
   * group rather than the whole tree — sending everything would renumber a
   * second-level list against a first-level one and shuffle branches the tenant
   * never touched.
   */
  move(row: ProductCategory, direction: -1 | 1): void {
    const siblings = this.siblingsOf(row);
    const from = siblings.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= siblings.length) return;

    [siblings[from], siblings[to]] = [siblings[to], siblings[from]];
    this.reordering.set(true);

    this.client.reorder(siblings.map((item) => item.id)).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadTree();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the categories', messageOf(error));
      },
    });
  }

  /** True when this row is the first or last of its own siblings. */
  isFirst(row: ProductCategory): boolean {
    return this.siblingsOf(row)[0]?.id === row.id;
  }

  isLast(row: ProductCategory): boolean {
    const siblings = this.siblingsOf(row);
    return siblings[siblings.length - 1]?.id === row.id;
  }

  private siblingsOf(row: ProductCategory): ProductCategory[] {
    const find = (nodes: ProductCategory[]): ProductCategory[] | null => {
      if (nodes.some((node) => node.id === row.id)) return [...nodes];
      for (const node of nodes) {
        const found = find(node.children ?? []);
        if (found) return found;
      }
      return null;
    };
    return find(this.tree()) ?? [row];
  }

  /**
   * Deleting says what it will actually do.
   *
   * Not "are you sure" — the tenant already knows they clicked delete. What they
   * do not know is that the four things filed under this category are about to
   * become uncategorised rather than disappear, and that its two subcategories
   * move up rather than go with it. Both are recoverable states, and neither is
   * obvious.
   */
  async remove(row: ProductCategory): Promise<void> {
    const children = row.children?.length ?? 0;
    const products = row.productCount ?? 0;

    const consequences = [
      children ? `${children} subcategor${children === 1 ? 'y moves' : 'ies move'} up a level` : '',
      products ? `${products} product${products === 1 ? '' : 's'} become uncategorised` : '',
    ].filter(Boolean);

    const message = consequences.length
      ? `the category "${row.name}" — ${consequences.join(', and ')}. Nothing is deleted with it.`
      : `the category "${row.name}"`;

    if (!(await this.confirm.askDelete(message))) return;

    this.client.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Category deleted');
        this.loadTree();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the category', messageOf(error)),
    });
  }
}

/** Depth-first, so a parent is always immediately above its children. */
function flatten(nodes: ProductCategory[], depth = 1): FlatCategory[] {
  return nodes.flatMap((node, index) => [
    { row: node, depth, last: index === nodes.length - 1 },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

/** A category's id and every id under it — what a parent picker must not offer. */
function subtreeIds(nodes: ProductCategory[], id: number): number[] {
  const collect = (node: ProductCategory): number[] => [
    node.id,
    ...(node.children ?? []).flatMap(collect),
  ];

  const find = (list: ProductCategory[]): ProductCategory | null => {
    for (const node of list) {
      if (node.id === id) return node;
      const found = find(node.children ?? []);
      if (found) return found;
    }
    return null;
  };

  const node = find(nodes);
  return node ? collect(node) : [id];
}
