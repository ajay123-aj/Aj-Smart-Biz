import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyContextService } from './company-context.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { WebsiteThemeView } from '../../core/models/domain.model';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';

/** The same rule the API validates with — a 3- or 6-digit hex colour. */
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The Website theme section: the colours this company's public website is
 * painted with.
 *
 * **This screen edits the company's own colours, not a shared theme.** The
 * platform keeps a catalogue of theme presets, and a preset can be serving a
 * dozen tenants at once — so editing one to recolour a single website would
 * recolour all of them. What is saved here goes to this company's own record
 * and is laid over the preset field by field, which is why every control below
 * can be cleared individually: an empty field is not "no colour", it is "use
 * whatever the preset says".
 *
 * **Branch-aware**, on the same rule as the About and Contact editors. A branch
 * with its own domain can carry its own colours; one with none inherits the
 * company's. So the full chain is branch -> company -> preset, each winning key
 * by key, and the bar at the top says which scope is being edited and what it
 * is inheriting from.
 *
 * Four colours and nothing more, because four is what the website templates
 * actually read. The preset rows carry text, background, sidebar and font
 * columns as well; offering controls for those would be offering settings that
 * change nothing until a template starts reading them.
 *
 * Writes are the main admin's, like the company profile and the domains — this
 * changes what every visitor sees on the public internet under the company's
 * own name.
 */
@Component({
  selector: 'app-theme-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, FieldErrorComponent],
  templateUrl: './theme-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .note {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 12px 15px; margin-bottom: 20px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
        font-size: 12.5px; color: var(--text-3); line-height: 1.55;
      }
      .note-icon { flex: none; }

      .scope-bar {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        padding: 11px 14px; margin-bottom: 18px;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--surface-2);
      }
      .scope-label { font-size: 13px; font-weight: 600; }
      .scope-note { font-size: 12.5px; color: var(--text-3); }
      .scope-note-own { color: var(--success); font-weight: 500; }

      .colors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      @media (max-width: 720px) { .colors { grid-template-columns: minmax(0, 1fr); } }

      /* A swatch, the hex field and a reset, on one row. */
      .color-row { display: flex; align-items: center; gap: 10px; }
      .color-row input[type='color'] {
        flex: none; width: 42px; height: 38px; padding: 2px;
        border: 1px solid var(--border); border-radius: 9px;
        background: var(--surface); cursor: pointer;
      }
      .color-row input[type='text'] { flex: 1; min-width: 0; font-family: var(--font-mono, monospace); }
      .color-row button {
        flex: none; padding: 7px 10px; font-size: 12px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--surface); color: var(--text-3); cursor: pointer;
      }
      .color-row button:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text); }
      .color-row button:disabled { opacity: .4; cursor: not-allowed; }

      .field-hint { font-size: 11.5px; color: var(--text-3); margin-top: 4px; line-height: 1.45; }
      .inheriting { color: var(--text-3); }
      .own { color: var(--success); font-weight: 500; }

      /* The preview. Not a rendering of the website — a reminder of what the
         three colours are for, so nobody has to publish to find out. */
      .preview {
        margin-top: 22px;
        border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
      }
      .preview-bar {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 13px 16px; color: #fff; font-weight: 600; font-size: 13.5px;
      }
      .preview-eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; }
      .preview-body { padding: 20px 18px; display: flex; flex-direction: column; gap: 12px; }
      .preview-title { font-size: 19px; font-weight: 800; letter-spacing: -.02em; }
      .preview-actions { display: flex; gap: 9px; flex-wrap: wrap; }
      .preview-btn { padding: 8px 17px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
      .preview-btn-ghost { background: transparent; border: 1px solid currentColor; }

      .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
      .actions .spacer { flex: 1; }
    `,
  ],
})
export class ThemeManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  readonly ctx = inject(CompanyContextService);

  readonly view = signal<WebsiteThemeView | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** Which site is being edited: `null` is the company-wide theme. */
  readonly scope = signal<number | null>(null);
  readonly branches = computed(() => this.view()?.branches ?? []);
  readonly scopeName = computed(
    () => this.branches().find((branch) => branch.id === this.scope())?.name ?? 'This branch'
  );

  /** The main-admin rule, the same one the profile and the domains follow. */
  readonly canEdit = computed(() => this.ctx.canEdit());

  /**
   * True when at least one colour belongs to the scope being edited rather than
   * to the level below it — this company's own rather than the preset's, or
   * this branch's own rather than the company's.
   */
  readonly overridden = computed(() => this.view()?.overridden ?? false);

  readonly preset = computed(() => this.view()?.preset ?? null);

  /**
   * What this scope falls back to when its own values are cleared: the
   * company's colours for a branch, the preset for the company itself.
   *
   * The per-field hints read this rather than `preset`, which is the whole
   * reason the API sends it — on a branch, "following the preset" would be a
   * lie whenever the company has set colours of its own.
   */
  readonly inherited = computed(() => this.view()?.inherited ?? null);

  /**
   * The colour controls, in the order they matter.
   *
   * `role` is what the field actually does to a website, in the template's own
   * words. An admin picking colours needs to know that "secondary" is the
   * pressed state of a button rather than a second brand colour, and the only
   * place that can be said is next to the control.
   */
  readonly colorFields = [
    {
      key: 'primaryColor' as const,
      label: 'Primary',
      role: 'The brand colour. Buttons, the logo disc, and every shadow the page casts.',
    },
    {
      key: 'secondaryColor' as const,
      label: 'Secondary',
      role: 'The darker half of the pair — a pressed button, the footer, a dark hero.',
    },
    {
      key: 'accentColor' as const,
      label: 'Accent',
      role: 'The highlight. Section eyebrows, offer badges, the active slide marker.',
    },
  ];

  readonly form = this.fb.nonNullable.group({
    primaryColor: ['', [Validators.pattern(HEX)]],
    secondaryColor: ['', [Validators.pattern(HEX)]],
    accentColor: ['', [Validators.pattern(HEX)]],
    mode: ['' as '' | 'light' | 'dark'],
  });

  constructor() {
    this.load();
  }

  /** Switches scope and reloads — a branch's colours are a different record. */
  onScope(value: string): void {
    this.scope.set(value ? Number(value) : null);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.websiteTheme(this.scope()).subscribe({
      next: (view) => {
        this.apply(view);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your website theme', messageOf(error));
      },
    });
  }

  /**
   * Fills the form with the **effective** colours, not just this scope's own.
   *
   * That is the whole point of showing what it inherits: a field left on an
   * inherited value should show that value, so an admin can see what the site
   * looks like today rather than an empty box next to a colour that is clearly
   * being used. `isOwn` below is what still distinguishes the two.
   */
  private apply(view: WebsiteThemeView): void {
    this.view.set(view);
    this.form.reset({
      primaryColor: view.effective?.primaryColor ?? '',
      secondaryColor: view.effective?.secondaryColor ?? '',
      accentColor: view.effective?.accentColor ?? '',
      mode: view.effective?.mode ?? '',
    });
    if (!this.canEdit()) this.form.disable();
  }

  /** True when this field carries the scope's own value rather than an inherited one. */
  isOwn(key: 'primaryColor' | 'secondaryColor' | 'accentColor' | 'mode'): boolean {
    const own = this.view()?.own;
    return Boolean(own && own[key]);
  }

  /**
   * What this field would fall back to, for the hint under it.
   *
   * The company's colour on a branch, the preset's on the company — which is
   * why it reads `inherited` rather than `preset`. Naming it after the preset
   * would have been wrong the moment a branch was editable.
   */
  inheritedValue(key: 'primaryColor' | 'secondaryColor' | 'accentColor' | 'mode'): string | null {
    return this.inherited()?.[key] ?? null;
  }

  /** What the scope inherits *from*, in words, for the hints and the buttons. */
  inheritedFrom(): string {
    return this.scope() ? 'the company colours' : this.preset()?.name ? 'the preset' : 'the template default';
  }

  /**
   * The value to hand `<input type="color">`, which has no concept of "unset"
   * and renders `#000000` for anything it cannot parse.
   *
   * Falling back to the inherited colour rather than to black means the swatch
   * beside an empty field shows the colour the site is actually using — the
   * same thing the text box shows — instead of a black square that looks like a
   * choice somebody made.
   */
  swatch(key: 'primaryColor' | 'secondaryColor' | 'accentColor'): string {
    const typed = this.form.controls[key].value;
    if (HEX.test(typed)) return typed;
    return this.inheritedValue(key) ?? '#000000';
  }

  /** The colour picker writes straight through to the text field. */
  pick(key: 'primaryColor' | 'secondaryColor' | 'accentColor', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.form.controls[key].setValue(value);
    this.form.controls[key].markAsDirty();
  }

  /**
   * Clears one field so it follows the level below again.
   *
   * Blank rather than the inherited literal value, because those are different
   * things: pasting the hex in would pin this scope to that colour forever, and
   * a later change one level down would no longer reach it. Empty means
   * "follow whatever is underneath", which is what the button says.
   */
  clearField(key: 'primaryColor' | 'secondaryColor' | 'accentColor' | 'mode'): void {
    this.form.controls[key].setValue('' as never);
    this.form.controls[key].markAsDirty();
  }

  save(): void {
    if (!this.canEdit() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    // Sent whole, blanks included: the API treats a blank as "unset" and drops
    // it, which is what makes a cleared field fall back to the level below.
    this.companies.saveWebsiteTheme(this.form.getRawValue(), this.scope()).subscribe({
      next: (view) => {
        this.saving.set(false);
        this.apply(view);
        const where = this.scope() ? this.scopeName() : 'Website';
        this.toast.success(
          view.overridden ? `${where} theme saved` : `${where} theme now follows ${this.inheritedFrom()}`
        );
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save your website theme', messageOf(error));
      },
    });
  }

  async reset(): Promise<void> {
    if (!this.canEdit() || !this.overridden()) return;

    const onBranch = Boolean(this.scope());
    const ok = await this.confirm.ask({
      title: onBranch ? `Reset ${this.scopeName()}?` : 'Reset to the preset?',
      message: onBranch
        ? `${this.scopeName()} will discard its own colours and follow the company colours again.`
        : this.preset()?.name
          ? `Your own colours will be discarded and the website will go back to the "${this.preset()?.name}" preset.`
          : 'Your own colours will be discarded and the website will go back to the template defaults.',
      confirmText: 'Reset',
      danger: true,
    });
    if (!ok) return;

    this.saving.set(true);
    this.companies.resetWebsiteTheme(this.scope()).subscribe({
      next: (view) => {
        this.saving.set(false);
        this.apply(view);
        this.toast.success(
          onBranch ? `${this.scopeName()} follows the company colours again` : 'Website theme reset to the preset'
        );
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not reset your website theme', messageOf(error));
      },
    });
  }
}
