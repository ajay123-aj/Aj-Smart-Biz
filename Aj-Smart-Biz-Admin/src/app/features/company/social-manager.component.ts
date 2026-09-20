import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  CompanySocialLink,
  Functionality,
  SOCIAL_PLATFORMS,
  SocialPlatform,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/** The key this screen is about, written once rather than in five places. */
const KEY = 'social_media' as const;

/**
 * The social profiles the website footer links to.
 *
 * One list, not branch-scoped, and that is a decision rather than an omission:
 * a company's Instagram account belongs to the company, not to one of its
 * shops. Team and Gallery scope by branch because a branch genuinely has its
 * own people and its own photographs; a social account almost never does, and
 * offering the choice would invite somebody to file the only account against
 * one branch and wonder why it vanished from every other site.
 *
 * Unlike most card screens there is no wording to edit above the list — the
 * footer shows icons and nothing else — so this is the list on its own.
 *
 * Editing is gated on the plan **granting** the feature, not on it being
 * switched on: a company should be able to fix a broken link while the row is
 * hidden, exactly as it can fix a typo in a Team card. What it cannot do is
 * fill in something it was never sold.
 */
@Component({
  selector: 'app-social-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    ReactiveFormsModule,
    FeatureGateComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './social-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .link-row {
        display: flex; align-items: center; gap: 14px;
        padding: 12px 0; border-bottom: 1px solid var(--border);
      }
      .link-row:last-of-type { border-bottom: 0; }

      /* The platform, which is what the eye scans this list for. */
      .link-platform {
        flex: none; min-width: 108px;
        font-weight: 600; font-size: 13.5px;
      }
      .link-main { flex: 1; min-width: 0; }
      /* URLs are long and must not push the row's controls off screen. */
      .link-url {
        font-size: 12.5px; color: var(--text-2);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .link-note { font-size: 12px; color: var(--text-3); margin-top: 2px; }
      .link-empty { padding: 20px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      .seq { display: flex; align-items: center; gap: 3px; flex: none; }
      .seq-num {
        min-width: 20px; text-align: center;
        font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px;
      }

      .preview {
        margin-top: 10px; padding: 10px 13px;
        background: var(--surface-2); border-radius: 8px;
        font-size: 12.5px; color: var(--text-2);
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class SocialManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly links = this.companies.cards<CompanySocialLink>('social-links');

  /** Writes are the main admin's, as with the company profile and domains. */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly platforms = SOCIAL_PLATFORMS;

  readonly feature = signal<Functionality | null>(null);
  readonly cards = signal<CompanySocialLink[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** null = closed, 'new' = adding, a row = editing that one. */
  readonly editing = signal<CompanySocialLink | 'new' | null>(null);

  readonly form = this.fb.nonNullable.group({
    platform: ['facebook' as SocialPlatform, [Validators.required]],
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/i)]],
    label: [''],
  });

  /** What the footer's tooltip will say, so they edit against the result. */
  readonly previewLabel = computed(() => {
    const typed = this.form.controls.label.value?.trim();
    if (typed) return typed;
    const platform = this.form.controls.platform.value;
    return SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === KEY) ?? null;
        this.feature.set(item);
        this.loading.set(false);
        /* Only worth fetching once the plan actually includes the feature. */
        if (item?.granted) this.loadCards();
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your social links', messageOf(error));
      },
    });
  }

  private loadCards(): void {
    this.links.list().subscribe({
      next: (rows) => this.cards.set(rows),
      error: () => this.cards.set([]),
    });
  }

  get isNew(): boolean {
    return this.editing() === 'new';
  }

  nameOf(platform: SocialPlatform): string {
    return SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
  }

  open(row?: CompanySocialLink): void {
    this.editing.set(row ?? 'new');
    this.form.reset({
      platform: row?.platform ?? 'facebook',
      url: row?.url ?? '',
      label: row?.label ?? '',
    });
  }

  close(): void {
    this.editing.set(null);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const current = this.editing();
    if (!current) return;

    const { platform, url, label } = this.form.getRawValue();
    const payload = {
      platform,
      url: url.trim(),
      label: label.trim() || null,
      /**
       * New links land at the end, in tens, so one can be slipped between two
       * others without renumbering — the same convention the FAQ uses.
       */
      ...(current === 'new' ? { sequence: (this.cards().length + 1) * 10 } : {}),
    };

    this.saving.set(true);
    const request =
      current === 'new' ? this.links.create(payload) : this.links.update(current.id, payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(current === 'new' ? 'Link added' : 'Link saved');
        this.close();
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error(messageOf(error));
      },
    });
  }

  toggle(row: CompanySocialLink): void {
    this.links.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(row.status === 'active' ? 'Link hidden' : 'Link shown');
        this.load();
      },
      error: (error: HttpErrorResponse) => this.toast.error(messageOf(error)),
    });
  }

  async remove(row: CompanySocialLink): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove this link?',
      message:
        `The ${this.nameOf(row.platform)} icon will disappear from your website footer. ` +
        'To hide it but keep the address, switch it off instead.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;

    this.links.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Link removed');
        this.load();
      },
      error: (error: HttpErrorResponse) => this.toast.error(messageOf(error)),
    });
  }

  /**
   * Moves one link up or down.
   *
   * Sends the whole order rather than two ids: the endpoint takes a list and
   * renumbers from it, which is what makes the result the same whatever state
   * the sequence numbers were in beforehand.
   */
  move(row: CompanySocialLink, delta: -1 | 1): void {
    const rows = [...this.cards()];
    const from = rows.findIndex((r) => r.id === row.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;

    [rows[from], rows[to]] = [rows[to], rows[from]];
    /* Optimistic, so the row moves under the cursor rather than after a hop. */
    this.cards.set(rows);

    this.links.reorder(rows.map((r) => r.id)).subscribe({
      next: () => this.toast.success('Order saved'),
      error: (error: HttpErrorResponse) => {
        this.toast.error(messageOf(error));
        /* Put it back: the server is the truth about what the order now is. */
        this.load();
      },
    });
  }
}
