import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Branch,
  CompanyStat,
  FiguresSettings,
  Functionality,
  StatMode,
  StatUnit,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/** The key this screen is about, written once rather than in five places. */
const KEY = 'figures' as const;

const UNITS: { value: StatUnit; label: string }[] = [
  { value: 'years', label: 'Years' },
  { value: 'months', label: 'Months' },
  { value: 'days', label: 'Days' },
];

/**
 * The Figures screen: a company's own numbers, and the words above them.
 *
 * This was the bottom half of the About screen until Figures became a
 * functionality in its own right, and the split is not filing: the band opens
 * the **home page**, which shows nothing else the About screen writes. A
 * company that wants its numbers on show without buying a written About page
 * can now have exactly that, and a plan can carry either without the other.
 *
 * Two kinds of editing, so two shapes — the same pair every card screen here
 * uses:
 *
 *  1. **The wording**, one form saved whole onto the functionality's settings.
 *     One heading for the set, so it is not branch-scoped: the same decision
 *     Team and Gallery already make about theirs.
 *  2. **The figures**, cards added, edited, reordered and deleted one at a
 *     time, and pinned to a branch or to the whole company. A tenant that wants
 *     five of them, or "Frames delivered" instead of "Projects delivered",
 *     should not be editing a fixed set of four slots.
 *
 * The `since_date` mode is the reason the band is worth having at all: a
 * hardcoded "12+ years" is wrong every January and nobody remembers to fix it.
 * A card that counts from a date is right forever.
 */
@Component({
  selector: 'app-figures-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    FeatureGateComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './figures-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      /* Which site's figures are being listed, above the list it changes. */
      .scope-bar {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 11px 14px; margin-bottom: 18px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
      }
      .scope-label { font-size: 13px; font-weight: 600; }
      .scope-note { font-size: 12.5px; color: var(--text-3); }

      .stat-row {
        display: flex; align-items: center; gap: 14px;
        padding: 12px 0; border-bottom: 1px solid var(--border);
      }
      .stat-row:last-of-type { border-bottom: 0; }

      /* The figure as the website will print it, so the tenant is editing
         against what a visitor sees rather than against raw fields. */
      .stat-figure {
        flex: none; min-width: 78px;
        font-size: 21px; font-weight: 750; letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }
      .stat-main { flex: 1; min-width: 0; }
      .stat-label { font-weight: 600; }
      .stat-note { font-size: 12px; color: var(--text-3); margin-top: 2px; }
      .stat-empty { padding: 20px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      .seq { display: flex; align-items: center; gap: 3px; flex: none; }
      .seq-num { min-width: 20px; text-align: center; font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; }

      .mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 4px; }
      @media (max-width: 620px) { .mode-grid { grid-template-columns: 1fr; } }
      .mode {
        display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
        padding: 11px 13px; border: 1px solid var(--border); border-radius: 9px;
        transition: border-color .15s, background .15s;
      }
      .mode:hover { border-color: var(--border-strong); }
      .mode-on { border-color: var(--primary); background: rgba(37, 99, 235, .05); }
      .mode input { margin-top: 2px; flex: none; }
      .mode-name { font-weight: 600; font-size: 13px; }
      .mode-hint { font-size: 11.5px; color: var(--text-3); line-height: 1.4; display: block; }

      .preview {
        margin-top: 10px; padding: 10px 13px;
        background: var(--surface-2); border-radius: 8px;
        font-size: 12.5px; color: var(--text-2);
      }
      .preview strong { font-size: 17px; font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class FiguresManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly stats = this.companies.cards<CompanyStat>('stats');

  /** Writes are the main admin's, as with the company profile and domains. */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly units = UNITS;

  readonly feature = signal<Functionality | null>(null);
  readonly cards = signal<CompanyStat[]>([]);
  readonly branches = signal<Branch[]>([]);

  /**
   * Which site's figures are listed: `null` is the company-wide band, an id is
   * one branch. Only the cards follow it — the wording above them is one
   * heading for the whole tenant, so it does not move when this does.
   */
  readonly scope = signal<number | null>(null);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<CompanyStat | null>(null);

  /** Both the plan grant and the main-admin rule have to allow it. */
  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  readonly copyForm = this.fb.nonNullable.group({
    eyebrow: [''],
    title: [''],
    lead: [''],
  });

  readonly statForm = this.fb.nonNullable.group({
    label: ['', [Validators.required, Validators.minLength(1)]],
    mode: ['fixed' as StatMode],
    value: [''],
    sinceDate: [''],
    unit: ['years' as StatUnit],
    prefix: [''],
    suffix: [''],
    status: ['active'],
  });

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
        // Only worth fetching once the plan actually includes Figures.
        if (item?.granted) {
          this.loadCards();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your figures', messageOf(error));
      },
    });
  }

  private loadBranches(): void {
    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  private loadCards(): void {
    // `'none'` asks for the company-wide figures specifically; omitting it
    // would return every scope's at once.
    this.stats.list(this.scope() ?? 'none').subscribe({
      next: (rows) => this.cards.set(rows),
      error: () => this.cards.set([]),
    });
  }

  /**
   * Filled from whatever the API resolved, so these fields show the words
   * actually on the website rather than empty boxes — the API fills its own
   * wording where the tenant wrote none. Clearing a field and saving therefore
   * puts the standard wording back.
   */
  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<FiguresSettings>;
    this.copyForm.reset({
      eyebrow: settings.eyebrow ?? '',
      title: settings.title ?? '',
      lead: settings.lead ?? '',
    });
  }

  saveCopy(): void {
    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        // Blank is a real choice — "use the standard wording" — so it goes as
        // null rather than being dropped from the payload.
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
      })
      .subscribe({
        next: (updated) => {
          this.savingCopy.set(false);
          this.feature.set(updated);
          this.patchCopyForm();
          this.toast.success('Saved — the words above your figures are updated');
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

  /* -------------------------------- scope -------------------------------- */

  onScope(value: string): void {
    this.scope.set(value ? Number(value) : null);
    this.loadCards();
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  scopeName(): string {
    const id = this.scope();
    if (!id) return 'all branches';
    return this.branches().find((branch) => branch.id === id)?.name ?? 'this branch';
  }

  /* ------------------------------- the cards ------------------------------ */

  /**
   * The figure exactly as the website will print it.
   *
   * Recomputed here rather than read from the API so the modal's preview
   * updates as the tenant types. The rule is the API's — prefix, the number,
   * suffix — and `sinceDate` counts whole units, so a date later today still
   * reads 0 rather than rounding up.
   */
  figureOf(row: Pick<CompanyStat, 'mode' | 'value' | 'sinceDate' | 'unit' | 'prefix' | 'suffix'>): string {
    const core = row.mode === 'since_date' ? String(this.elapsed(row.sinceDate, row.unit)) : String(row.value ?? '');
    if (!core) return '—';
    return `${row.prefix ?? ''}${core}${row.suffix ?? ''}`;
  }

  /** Calendar-aware, matching the API: a leap year must not tick over early. */
  private elapsed(from: string | null | undefined, unit: StatUnit): number {
    if (!from) return 0;
    const start = new Date(from);
    const now = new Date();
    if (Number.isNaN(start.getTime()) || start > now) return 0;

    if (unit === 'days') return Math.floor((now.getTime() - start.getTime()) / 86400000);

    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    months = Math.max(0, months);

    return unit === 'months' ? months : Math.floor(months / 12);
  }

  /** What the card is doing, in words, under its label in the list. */
  describe(row: CompanyStat): string {
    if (row.mode !== 'since_date') return 'Fixed figure';
    const unit = UNITS.find((entry) => entry.value === row.unit)?.label.toLowerCase() ?? row.unit;
    return row.sinceDate ? `Counts ${unit} since ${row.sinceDate.slice(0, 10)}` : `Counts ${unit} — no date set`;
  }

  /** Live preview inside the modal, from whatever is currently typed. */
  previewOf(): string {
    return this.figureOf(this.statForm.getRawValue());
  }

  modeIs(mode: StatMode): boolean {
    return this.statForm.controls.mode.value === mode;
  }

  setMode(mode: StatMode): void {
    this.statForm.controls.mode.setValue(mode);
    this.statForm.controls.mode.markAsDirty();
  }

  openCard(row: CompanyStat | null): void {
    this.editing.set(row);
    this.statForm.reset({
      label: row?.label ?? '',
      mode: row?.mode ?? 'fixed',
      value: row?.value ?? '',
      sinceDate: row?.sinceDate ? String(row.sinceDate).slice(0, 10) : '',
      unit: row?.unit ?? 'years',
      prefix: row?.prefix ?? '',
      suffix: row?.suffix ?? '',
      status: row?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  saveCard(): void {
    if (this.statForm.invalid) {
      touchAll(this.statForm);
      return;
    }

    const raw = this.statForm.getRawValue();

    // The mode decides which field carries the figure; the other is cleared
    // rather than left behind, so switching mode cannot resurrect a stale value.
    if (raw.mode === 'fixed' && !raw.value.trim()) {
      this.toast.error('A fixed figure needs a value', 'Type what the card should show, e.g. 250+');
      return;
    }
    if (raw.mode === 'since_date' && !raw.sinceDate) {
      this.toast.error('A counted figure needs a date', 'Pick the date it should count from.');
      return;
    }

    const payload: Record<string, unknown> = {
      // A figure added while looking at one branch belongs to that branch;
      // landing it company-wide would silently put it on every site.
      branchId: this.scope(),
      label: raw.label,
      mode: raw.mode,
      value: raw.mode === 'fixed' ? raw.value : null,
      sinceDate: raw.mode === 'since_date' ? raw.sinceDate : null,
      unit: raw.unit,
      prefix: raw.prefix || null,
      suffix: raw.suffix || null,
      status: raw.status,
    };

    const row = this.editing();
    this.saving.set(true);

    const request = row ? this.stats.update(row.id, payload) : this.stats.create(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Figure updated' : 'Figure added');
        this.loadCards();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the figure', messageOf(error));
      },
    });
  }

  toggleCard(row: CompanyStat): void {
    this.stats.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`${row.label} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadCards();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  /** Moves one card and sends the whole resulting order, like the sliders. */
  move(row: CompanyStat, direction: -1 | 1): void {
    const items = [...this.cards()];
    const from = items.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;

    [items[from], items[to]] = [items[to], items[from]];
    this.reordering.set(true);

    this.stats.reorder(items.map((item) => item.id)).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadCards();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the figures', messageOf(error));
      },
    });
  }

  async removeCard(row: CompanyStat): Promise<void> {
    if (!(await this.confirm.askDelete(`the figure "${row.label}"`))) return;

    this.stats.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Figure deleted');
        this.loadCards();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the figure', messageOf(error)),
    });
  }
}
