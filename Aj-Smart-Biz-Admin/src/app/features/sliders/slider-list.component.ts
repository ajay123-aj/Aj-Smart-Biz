import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Branch, Slider } from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/** The branch filter's "company-wide only" option; the API spells it `none`. */
const COMPANY_WIDE = 'none';

@Component({
  selector: 'app-slider-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CanDirective,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
    ImageUploadComponent,
  ],
  templateUrl: './slider-list.component.html',
  styles: [
    `
      .thumb {
        width: 96px; height: 54px; border-radius: 6px;
        object-fit: cover; background: var(--surface-2);
        border: 1px solid var(--border);
      }
      .thumb-empty {
        width: 96px; height: 54px; border-radius: 6px;
        display: grid; place-items: center;
        background: var(--surface-2); border: 1px dashed var(--border-strong);
        color: var(--text-3); font-size: 16px;
      }
      .seq { display: flex; align-items: center; gap: 4px; }
      .seq-num { min-width: 22px; text-align: center; font-variant-numeric: tabular-nums; color: var(--text-2); }
      .slide-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .slide-sub { color: var(--text-3); font-size: 12px; max-width: 44ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `,
  ],
})
export class SliderListComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly company = inject(CompanyService);
  private readonly uploads = inject(UploadService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly store = new ListStore<Slider>((query) => this.api.list<Slider>('/my-company/sliders', query), {
    limit: 25,
  });
  readonly branches = signal<Branch[]>([]);
  readonly modalOpen = signal(false);
  readonly editing = signal<Slider | null>(null);
  readonly saving = signal(false);
  readonly reordering = signal(false);

  /** The filter currently applied — drives the hint under the table. */
  readonly branchFilter = signal<string>('');

  /**
   * Reordering only makes sense inside one list. Mixed together, "move up" past
   * a slide belonging to a different branch would mean nothing, so the arrows
   * appear only once the view is narrowed to a single branch.
   */
  readonly canReorder = computed(() => this.branchFilter() !== '');

  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    eyebrow: [''],
    subtitle: [''],
    image: [''],
    mobileImage: [''],
    ctaLabel: [''],
    ctaUrl: [''],
    branchId: [''],
    status: ['active'],
  });

  constructor() {
    this.store.reload();
    this.company.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      // The screen still works without them; the branch picker just stays empty.
      error: () => this.branches.set([]),
    });
  }

  imageUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  onSearch(event: Event): void {
    const search = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.store.patch({ search }), 350);
  }

  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.store.patch({ branchId: value });
  }

  /** "All branches" for a company-wide slide, otherwise the branch's name. */
  scopeOf(row: Slider): string {
    return row.branch?.name ?? 'All branches';
  }

  openModal(row: Slider | null): void {
    this.editing.set(row);
    this.form.reset({
      title: row?.title ?? '',
      eyebrow: row?.eyebrow ?? '',
      subtitle: row?.subtitle ?? '',
      image: row?.image ?? '',
      mobileImage: row?.mobileImage ?? '',
      ctaLabel: row?.ctaLabel ?? '',
      ctaUrl: row?.ctaUrl ?? '',
      // A new slide defaults to whatever the list is filtered to, so adding a
      // slide while looking at one branch does not silently land company-wide.
      branchId: String(row?.branchId ?? (row ? '' : this.branchFilterAsBranchId())),
      status: row?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  private branchFilterAsBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== COMPANY_WIDE ? filter : '';
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const raw = this.form.getRawValue() as Record<string, unknown>;
    const payload = cleanPayload(raw) as Record<string, unknown>;

    /**
     * `cleanPayload` drops empty strings, which is right for optional text but
     * wrong for the fields where "empty" is itself the instruction: clearing a
     * slide's image, or moving it back to every branch. Those are sent as an
     * explicit null, otherwise a removal is silently ignored by the update.
     */
    payload['branchId'] = raw['branchId'] ? Number(raw['branchId']) : null;
    (['image', 'mobileImage'] as const).forEach((field) => {
      payload[field] = raw[field] || null;
    });

    const row = this.editing();
    this.saving.set(true);

    const request = row
      ? this.api.put<Slider>(`/my-company/sliders/${row.id}`, payload)
      : this.api.post<Slider>('/my-company/sliders', payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(row ? 'Slide updated' : 'Slide created');
        this.modalOpen.set(false);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the slide', messageOf(error));
      },
    });
  }

  toggleStatus(row: Slider): void {
    this.api.patch(`/my-company/sliders/${row.id}/status`, {}).subscribe({
      next: () => {
        this.toast.success(`${row.title} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  /**
   * Moves one slide and sends the whole resulting order, so a shuffle cannot be
   * left half-applied if a request fails midway.
   */
  move(row: Slider, direction: -1 | 1): void {
    const items = [...this.store.items()];
    const from = items.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;

    [items[from], items[to]] = [items[to], items[from]];
    this.reordering.set(true);

    this.api.patch('/my-company/sliders/reorder', { ids: items.map((item) => item.id) }).subscribe({
      next: () => {
        this.reordering.set(false);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the slides', messageOf(error));
      },
    });
  }

  async remove(row: Slider): Promise<void> {
    if (!(await this.confirm.askDelete(`the slide "${row.title}"`))) return;

    this.api.delete(`/my-company/sliders/${row.id}`).subscribe({
      next: () => {
        this.toast.success('Slide deleted');
        this.store.reloadAfterDelete();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the slide', messageOf(error)),
    });
  }
}
