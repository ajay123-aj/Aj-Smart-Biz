import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Branch, Functionality, SectionCopy, TeamMember } from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * The Team tab: the people the website lists.
 *
 * Deliberately its own list rather than a view over `admins`. The people a
 * business puts on its website and the people who can sign in to the workspace
 * are different sets — a founder who never logs in belongs here, a bookkeeper
 * with a login usually does not — and conflating them would either expose
 * accounts or force fake ones.
 */
@Component({
  selector: 'app-team-manager',
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
  templateUrl: './team-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      .grid-cards {
        display: grid;
        /* Wide enough that the row of controls in the footer stays on one
           line — at 250px "Delete" dropped to a line of its own. */
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 14px;
      }
      .member {
        display: flex; flex-direction: column;
        border: 1px solid var(--border); border-radius: 12px;
        padding: 16px; background: var(--surface);
      }
      .member-inactive { opacity: .62; background: var(--surface-2); }
      .member-head { display: flex; gap: 12px; align-items: flex-start; }
      .avatar {
        width: 52px; height: 52px; border-radius: 50%; flex: none;
        object-fit: cover; background: var(--surface-2); border: 1px solid var(--border);
      }
      .avatar-empty {
        width: 52px; height: 52px; border-radius: 50%; flex: none;
        display: grid; place-items: center;
        background: var(--surface-2); border: 1px dashed var(--border-strong);
        color: var(--text-3); font-weight: 700;
      }
      .member-name { font-weight: 650; line-height: 1.3; }
      .member-role { font-size: 12.5px; color: var(--text-3); }
      .member-bio {
        margin: 10px 0 0; font-size: 12.5px; color: var(--text-2); line-height: 1.55;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
      }
      .member-contact { margin-top: 8px; font-size: 12px; color: var(--text-3); word-break: break-all; }
      .member-foot {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);
      }
      .member-foot .spacer { flex: 1; }
      .seq-num { font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; min-width: 18px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
    `,
  ],
})
export class TeamManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly uploads = inject(UploadService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly team = this.companies.cards<TeamMember>('team');

  /**
   * Writes are the main admin's, as with the company profile and domains.
   * Read here rather than passed in: this is a routed page now, and the rule
   * was never the caller's to decide.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly members = signal<TeamMember[]>([]);
  /** The branch filter currently applied; drives what a new card is pinned to. */
  readonly branchFilter = signal<string>('');
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<TeamMember | null>(null);

  readonly savingCopy = signal(false);

  /**
   * The words above the section on the website. Saved as a whole and separately
   * from the cards, because they belong to the section rather than to any one
   * of them — the same split the About and Features screens use.
   */
  readonly copyForm = this.fb.nonNullable.group({
    eyebrow: [''],
    title: [''],
    lead: [''],
  });

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    name: ['', [Validators.required, Validators.minLength(1)]],
    role: [''],
    bio: [''],
    photo: [''],
    email: [''],
    phone: [''],
    linkedinUrl: [''],
    status: ['active'],
  });

  constructor() {
    this.load();
  }

  /**
   * Filled from whatever the API resolved, which means these fields show the
   * words actually on the website rather than empty boxes — the API sends its
   * own defaults where the company has written nothing. Clearing a field and
   * saving therefore puts the default back.
   */
  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<SectionCopy>;
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
      .saveFunctionalitySettings('team', {
        // Blank is a real choice — it means "use the standard wording" — so it
        // goes as null rather than being dropped from the payload.
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
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

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === 'team') ?? null;
        this.feature.set(item);
        this.patchCopyForm();
        this.loading.set(false);
        if (item?.granted) {
          this.loadMembers();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your team', messageOf(error));
      },
    });
  }

  private loadMembers(): void {
    this.team.list(this.branchFilter() || undefined).subscribe({
      next: (rows) => this.members.set(rows),
      error: () => this.members.set([]),
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
    this.loadMembers();
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

  photoUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  open(row: TeamMember | null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      name: row?.name ?? '',
      role: row?.role ?? '',
      bio: row?.bio ?? '',
      photo: row?.photo ?? '',
      email: row?.email ?? '',
      phone: row?.phone ?? '',
      linkedinUrl: row?.linkedinUrl ?? '',
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
    // Empty means "no photo" / "no contact line", which are real choices, so
    // they go as explicit nulls rather than being dropped from the payload.
    const payload: Record<string, unknown> = {
      // Empty means company-wide, which is a real choice, so it goes as null.
      branchId: raw.branchId ? Number(raw.branchId) : null,
      name: raw.name,
      role: raw.role || null,
      bio: raw.bio || null,
      photo: raw.photo || null,
      email: raw.email || null,
      phone: raw.phone || null,
      linkedinUrl: raw.linkedinUrl || null,
      status: raw.status,
    };

    const row = this.editing();
    this.saving.set(true);

    const request = row ? this.team.update(row.id, payload) : this.team.create(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Team member updated' : 'Team member added');
        this.loadMembers();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the team member', messageOf(error));
      },
    });
  }

  toggle(row: TeamMember): void {
    this.team.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`${row.name} is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadMembers();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  move(row: TeamMember, direction: -1 | 1): void {
    const items = [...this.members()];
    const from = items.findIndex((item) => item.id === row.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;

    [items[from], items[to]] = [items[to], items[from]];
    this.reordering.set(true);

    this.team.reorder(items.map((item) => item.id)).subscribe({
      next: () => {
        this.reordering.set(false);
        this.loadMembers();
      },
      error: (error: HttpErrorResponse) => {
        this.reordering.set(false);
        this.toast.error('Could not reorder the team', messageOf(error));
      },
    });
  }

  async remove(row: TeamMember): Promise<void> {
    if (!(await this.confirm.askDelete(`${row.name} from your team`))) return;

    this.team.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Team member deleted');
        this.loadMembers();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the team member', messageOf(error)),
    });
  }
}
