import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Branch, Functionality, GalleryItem } from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * The Gallery tab: an ordered grid of images for the website.
 *
 * The image is the only required field — a gallery of untitled photographs is a
 * perfectly good gallery — so the form leads with the upload and treats title,
 * caption and alt text as things the tenant may or may not want.
 */
@Component({
  selector: 'app-gallery-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    FeatureGateComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
    ImageUploadComponent,
  ],
  templateUrl: './gallery-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .grid-cards {
        display: grid;
        /* Wide enough that the row of controls in the footer stays on one
           line — at 250px "Delete" dropped to a line of its own. */
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 14px;
      }
      .shot {
        display: flex; flex-direction: column;
        border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); overflow: hidden;
      }
      .shot-inactive { opacity: .62; background: var(--surface-2); }
      .shot-img {
        width: 100%; aspect-ratio: 4 / 3; object-fit: cover;
        background: var(--surface-2); display: block;
      }
      .shot-body { padding: 12px 13px; flex: 1; }
      .shot-title { font-weight: 600; font-size: 13.5px; }
      .shot-caption {
        margin: 4px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .shot-untitled { font-size: 13px; color: var(--text-3); font-style: italic; }
      .shot-foot {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 10px 13px; border-top: 1px solid var(--border);
      }
      .shot-foot .spacer { flex: 1; }
      .seq-num { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; min-width: 18px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
    `,
  ],
})
export class GalleryManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly uploads = inject(UploadService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly gallery = this.companies.cards<GalleryItem>('gallery');

  /**
   * Writes are the main admin's, as with the company profile and domains.
   * Read here rather than passed in: this is a routed page now, and the rule
   * was never the caller's to decide.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly items = signal<GalleryItem[]>([]);
  /** The branch filter currently applied; drives what a new card is pinned to. */
  readonly branchFilter = signal<string>('');
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<GalleryItem | null>(null);

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    image: ['', [Validators.required]],
    title: [''],
    caption: [''],
    altText: [''],
    status: ['active'],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === 'gallery') ?? null;
        this.feature.set(item);
        this.loading.set(false);
        if (item?.granted) {
          this.loadItems();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your gallery', messageOf(error));
      },
    });
  }

  private loadItems(): void {
    this.gallery.list(this.branchFilter() || undefined).subscribe({
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

  private reload(): void {
    this.loadItems();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  /**
   * Narrows the list to one scope. `none` is the company-wide cards, which the
   * API spells the same way.
   */
  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.reload();
  }

  /** "All branches" for a company-wide card, otherwise the branch name. */
  scopeOf(row: { branch?: { name: string } | null }): string {
    return row.branch?.name ?? 'All branches';
  }

  /**
   * A card added while the list is filtered to one branch belongs to that
   * branch — landing it company-wide would silently put it on every site.
   */
  private defaultBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  imageUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  /** What a screen reader will actually get, so the tenant can see the fallback. */
  altOf(row: GalleryItem): string {
    return row.altText || row.title || '(decorative — no alt text)';
  }

  open(row: GalleryItem | null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      image: row?.image ?? '',
      title: row?.title ?? '',
      caption: row?.caption ?? '',
      altText: row?.altText ?? '',
      status: row?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      if (!this.form.controls.image.value) {
        this.toast.error('An image is required', 'Upload a picture before saving.');
      }
      return;
    }

    const raw = this.form.getRawValue();
    const payload: Record<string, unknown> = {
      // Empty means company-wide, which is a real choice, so it goes as null.
      branchId: raw.branchId ? Number(raw.branchId) : null,
      image: raw.image,
      title: raw.title || null,
      caption: raw.caption || null,
      altText: raw.altText || null,
      status: raw.status,
    };

    const row = this.editing();
    this.saving.set(true);

    const request = row ? this.gallery.update(row.id, payload) : this.gallery.create(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Image updated' : 'Image added');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the image', messageOf(error));
      },
    });
  }

  toggle(row: GalleryItem): void {
    this.gallery.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`Image is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  move(row: GalleryItem, direction: -1 | 1): void {
    const items = [...this.items()];
    const from = items.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;

    [items[from], items[to]] = [items[to], items[from]];
    this.reordering.set(true);

    this.gallery.reorder(items.map((item) => item.id)).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the gallery', messageOf(error));
      },
    });
  }

  async remove(row: GalleryItem): Promise<void> {
    if (!(await this.confirm.askDelete(row.title ? `the image "${row.title}"` : 'this image'))) return;

    this.gallery.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Image deleted');
        this.loadItems();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the image', messageOf(error)),
    });
  }
}
