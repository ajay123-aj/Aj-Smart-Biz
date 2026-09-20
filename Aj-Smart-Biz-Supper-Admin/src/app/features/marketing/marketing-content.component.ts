import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MarketingService } from '../../core/services/marketing.service';
import { ToastService } from '../../core/services/toast.service';
import {
  MARKETING_SECTIONS,
  MarketingContent,
  MarketingContentKey,
  MarketingSectionMeta,
} from '../../core/models/marketing.model';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/**
 * The writing on our own marketing site.
 *
 * **Why this edits JSON rather than showing a form per section.** Each of the
 * thirteen sections has a different shape — `hero` is a headline and two
 * buttons, `steps` is four cards, `about_page` is a list of paragraphs — so a
 * typed form would be thirteen forms, and every wording change on the site
 * would mean shipping a new one here. The payload is a JSON column for exactly
 * that reason, and this screen is honest about it.
 *
 * What it does instead of pretending otherwise:
 *
 *   - names every section in plain words and says where it appears, because
 *     `services_page` does not tell anybody which page they are changing;
 *   - parses on every keystroke and refuses to save invalid JSON, so the
 *     failure is caught here rather than becoming a section the site renders
 *     empty;
 *   - shows the keys the section currently has, which is the fastest way to see
 *     that you have just deleted one.
 *
 * The site treats every field as optional, so a mistake degrades to a missing
 * line rather than a broken page — but it is still a mistake nobody wants to
 * find by looking at the live site.
 */
@Component({
  selector: 'app-marketing-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
  ],
  templateUrl: './marketing-content.component.html',
})
export class MarketingContentComponent {
  private readonly service = inject(MarketingService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly sections = MARKETING_SECTIONS;
  readonly rows = signal<MarketingContent[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);

  /** The section open in the editor, or null when the modal is closed. */
  readonly editing = signal<MarketingSectionMeta | null>(null);

  readonly form = this.fb.nonNullable.group({
    label: [''],
    payload: ['', [Validators.required]],
    status: ['active'],
  });

  /**
   * The parse result, recomputed as they type.
   *
   * Held as a signal rather than checked on submit so the error appears while
   * the cursor is still near the mistake, and so Save can be disabled rather
   * than failing.
   */
  readonly parsed = signal<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }>({
    ok: false,
    error: 'Nothing to save yet.',
  });

  /** The top-level keys of whatever currently parses. Empty when it does not. */
  readonly payloadKeys = computed(() => {
    const result = this.parsed();
    return result.ok ? Object.keys(result.value) : [];
  });

  /**
   * The parse error, or ''.
   *
   * A computed rather than reading `parsed().error` in the template: Angular
   * templates cannot narrow a discriminated union, so the field is not
   * reachable there without this.
   */
  readonly parseError = computed(() => {
    const result = this.parsed();
    return result.ok ? '' : result.error;
  });

  readonly isValid = computed(() => this.parsed().ok);

  /** How many fields a stored section has. `Object.keys` is not template syntax. */
  fieldCount(row: MarketingContent): number {
    return Object.keys(row.payload ?? {}).length;
  }

  constructor() {
    this.form.controls.payload.valueChanges.subscribe((text) => this.parse(text));
    this.load();
  }

  private parse(text: string): void {
    const trimmed = (text ?? '').trim();
    if (!trimmed) {
      this.parsed.set({ ok: false, error: 'Nothing to save yet.' });
      return;
    }
    try {
      const value = JSON.parse(trimmed);
      /* An array or a string is valid JSON and not a section. The API refuses
         it too, but saying so here costs nothing and explains itself better. */
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        this.parsed.set({ ok: false, error: 'A section has to be an object — it must start with {.' });
        return;
      }
      this.parsed.set({ ok: true, value: value as Record<string, unknown> });
    } catch (error) {
      this.parsed.set({ ok: false, error: (error as Error).message });
    }
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.service.listContent().subscribe({
      next: (rows) => {
        this.rows.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** The stored row for a section, or undefined where none has been written. */
  rowFor(key: MarketingContentKey): MarketingContent | undefined {
    return this.rows().find((row) => row.key === key);
  }

  open(section: MarketingSectionMeta): void {
    const row = this.rowFor(section.key);
    this.editing.set(section);
    this.form.reset({
      label: row?.label ?? section.name,
      /* Two-space indent: this is read and edited by a person, and the API
         stores whatever object it parses to, so the whitespace costs nothing. */
      payload: JSON.stringify(row?.payload ?? {}, null, 2),
      status: row?.status ?? 'active',
    });
  }

  close(): void {
    this.editing.set(null);
  }

  save(): void {
    const section = this.editing();
    const result = this.parsed();
    if (!section || !result.ok) return;

    this.saving.set(true);
    this.service
      .saveContent(section.key, {
        payload: result.value,
        label: this.form.controls.label.value || null,
        status: this.form.controls.status.value,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success(`${section.name} saved`);
          this.close();
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }
}
