import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Functionality,
  FunctionalityKey,
  ShareChannel,
  ShareLinkSettings,
  WhatsappNumber,
  WhatsappType,
  WhatsappTypeMeta,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * Channels the share button can offer, with the label the tenant picks them by.
 * The API validates against its own list; this only names them for the UI.
 */
const SHARE_CHANNELS: { key: ShareChannel; name: string; hint: string }[] = [
  { key: 'copy', name: 'Copy link', hint: 'Copies the page address to the clipboard' },
  { key: 'whatsapp', name: 'WhatsApp', hint: 'Opens WhatsApp with the link and your message' },
  { key: 'facebook', name: 'Facebook', hint: 'Facebook share dialog' },
  { key: 'x', name: 'X', hint: 'Post composer on X' },
  { key: 'linkedin', name: 'LinkedIn', hint: 'LinkedIn share dialog' },
  { key: 'telegram', name: 'Telegram', hint: 'Forward the link on Telegram' },
  { key: 'email', name: 'Email', hint: "Opens the visitor's mail app" },
];

/**
 * The Functionality tab on Company Details.
 *
 * One card per optional feature, all built the same way — a switch, a status
 * line and a settings panel — so WhatsApp and the share button read as two
 * instances of one thing rather than two bolt-ons.
 *
 * Nothing here decides whether a feature is live. `granted`, `enabled` and
 * `active` all come from the API, which is the same answer its write routes
 * enforce and its public endpoint publishes, so a locked switch, a refused
 * request and a missing button on the website always agree about why.
 */
@Component({
  selector: 'app-functionality-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [ReactiveFormsModule, StatusBadgeComponent, ModalComponent, FieldErrorComponent],
  templateUrl: './functionality-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .feature {
        border: 1px solid var(--border);
        border-radius: 12px;
        margin-bottom: 14px;
        background: var(--surface);
        overflow: hidden;
      }
      .feature-live { border-color: var(--success); }
      .feature-locked { background: var(--surface-2); }

      .feature-head {
        display: flex; align-items: flex-start; gap: 14px;
        padding: 16px 18px;
      }
      .feature-icon {
        flex: none; width: 40px; height: 40px; border-radius: 10px;
        display: grid; place-items: center; font-size: 19px;
        background: var(--surface-2); border: 1px solid var(--border);
      }
      .feature-live .feature-icon { background: rgba(34, 197, 94, .12); border-color: rgba(34, 197, 94, .35); }
      .feature-main { flex: 1; min-width: 0; }
      .feature-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .feature-name { font-weight: 600; font-size: 15px; }
      .feature-summary { color: var(--text-3); font-size: 13px; margin-top: 3px; line-height: 1.5; }
      .feature-reason { font-size: 12px; margin-top: 8px; color: var(--text-3); }
      .feature-reason-block { color: var(--warning); }

      .feature-actions { display: flex; align-items: center; gap: 10px; flex: none; }

      /* Same switch the plan console uses, so the two consoles look related. */
      .switch { position: relative; display: inline-block; width: 38px; height: 21px; vertical-align: middle; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .switch .track {
        position: absolute; inset: 0; cursor: pointer;
        background: var(--border-strong); border-radius: 999px; transition: background .2s;
      }
      .switch .track::before {
        content: ''; position: absolute;
        width: 15px; height: 15px; left: 3px; bottom: 3px;
        background: #fff; border-radius: 50%; transition: transform .2s;
      }
      .switch input:checked + .track { background: var(--success); }
      .switch input:checked + .track::before { transform: translateX(17px); }
      .switch input:disabled + .track { cursor: not-allowed; opacity: .5; }

      .feature-body { border-top: 1px solid var(--border); padding: 16px 18px; }
      .feature-body-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
      .feature-body-note { font-size: 12px; color: var(--text-3); margin: 0 0 14px; line-height: 1.5; }

      .wa-row {
        display: flex; align-items: center; gap: 12px;
        padding: 11px 0; border-bottom: 1px solid var(--border);
      }
      .wa-row:last-child { border-bottom: 0; }
      .wa-type { flex: none; width: 92px; }
      .wa-main { flex: 1; min-width: 0; }
      .wa-number { font-variant-numeric: tabular-nums; font-weight: 600; }
      .wa-note {
        font-size: 12px; color: var(--text-3);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46ch;
      }
      .wa-empty { padding: 18px 0; text-align: center; color: var(--text-3); font-size: 13px; }

      .channel-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px;
      }
      .channel {
        display: flex; gap: 9px; align-items: flex-start; cursor: pointer;
        padding: 9px 11px; border: 1px solid var(--border); border-radius: 9px;
        transition: border-color .15s, background .15s;
      }
      .channel:hover { border-color: var(--border-strong); }
      .channel-on { border-color: var(--primary); background: rgba(37, 99, 235, .05); }
      .channel input { margin-top: 2px; flex: none; }
      .channel-name { font-weight: 500; font-size: 13px; }
      .channel-hint { font-size: 11.5px; color: var(--text-3); line-height: 1.4; }
    `,
  ],
})
export class FunctionalityManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);

  /**
   * Writes are the main admin's, as with the company profile and domains.
   * Read here rather than passed in: this is a routed page now, and the rule
   * was never the caller's to decide.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());
  /** So the tab header can show how many features are live. */
  readonly activeChange = output<number>();

  readonly shareChannels = SHARE_CHANNELS;

  readonly items = signal<Functionality[]>([]);
  readonly loading = signal(true);
  /** Which feature's settings panel is open; only one at a time. */
  readonly openKey = signal<FunctionalityKey | null>(null);
  /** The key currently being switched, so only its own switch goes busy. */
  readonly toggling = signal<FunctionalityKey | null>(null);
  readonly saving = signal(false);

  /* ------------------------------ whatsapp ------------------------------ */
  readonly numbers = signal<WhatsappNumber[]>([]);
  readonly whatsappTypes = signal<WhatsappTypeMeta[]>([]);
  readonly numberModalOpen = signal(false);
  readonly editingNumber = signal<WhatsappNumber | null>(null);

  readonly numberForm = this.fb.nonNullable.group({
    type: ['inquiry' as WhatsappType, [Validators.required]],
    countryCode: ['91', [Validators.required]],
    number: ['', [Validators.required, Validators.minLength(6)]],
    label: [''],
    defaultMessage: [''],
    status: ['active'],
  });

  /* ----------------------------- share link ----------------------------- */
  readonly shareForm = this.fb.nonNullable.group({
    headline: [''],
    message: [''],
    channels: [[] as ShareChannel[]],
  });

  readonly shareLink = computed(() => this.items().find((item) => item.key === 'share_link') ?? null);
  readonly whatsapp = computed(() => this.items().find((item) => item.key === 'whatsapp') ?? null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        this.items.set(view.items ?? []);
        this.loading.set(false);
        this.activeChange.emit((view.activeKeys ?? []).length);
        this.patchShareForm();
        // Only worth fetching once the plan actually includes WhatsApp.
        if (this.whatsapp()?.granted) this.loadNumbers();
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your functionality', messageOf(error));
      },
    });
  }

  private loadNumbers(): void {
    this.companies.whatsappNumbers().subscribe({
      next: (view) => {
        this.numbers.set(view.items ?? []);
        this.whatsappTypes.set(view.types ?? []);
      },
      // The card still renders; the list just stays empty.
      error: () => this.numbers.set([]),
    });
  }

  private patchShareForm(): void {
    const settings = (this.shareLink()?.settings ?? {}) as ShareLinkSettings;
    this.shareForm.reset({
      headline: settings.headline ?? '',
      message: settings.message ?? '',
      channels: [...(settings.channels ?? [])],
    });
  }

  /* ------------------------------- switches ------------------------------ */

  panelOpen(key: FunctionalityKey): boolean {
    return this.openKey() === key;
  }

  togglePanel(key: FunctionalityKey): void {
    this.openKey.set(this.openKey() === key ? null : key);
  }

  /**
   * The pill next to the name. `active` is the only state that means "a visitor
   * can see this"; everything else says why not, in the API's own words.
   */
  stateLabel(item: Functionality): string {
    if (item.active) return 'active';
    if (!item.granted) return 'not in plan';
    if (!item.enabled) return 'inactive';
    return item.reason ?? 'inactive';
  }

  toggle(item: Functionality): void {
    if (!this.canEdit() || !item.granted) return;

    this.toggling.set(item.key);
    this.companies.toggleFunctionality(item.key).subscribe({
      next: (updated) => {
        this.toggling.set(null);
        this.items.update((rows) => rows.map((row) => (row.key === updated.key ? updated : row)));
        this.activeChange.emit(this.items().filter((row) => row.active).length);
        this.toast.success(`${updated.name} switched ${updated.enabled ? 'on' : 'off'}`);
      },
      error: (error: HttpErrorResponse) => {
        this.toggling.set(null);
        this.toast.error('Could not change the functionality', messageOf(error));
      },
    });
  }

  /* ----------------------------- share link ------------------------------ */

  channelOn(channel: ShareChannel): boolean {
    return (this.shareForm.controls.channels.value ?? []).includes(channel);
  }

  toggleChannel(channel: ShareChannel, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.shareForm.controls.channels.value ?? [];
    // A new array, or the control never marks itself dirty.
    const next = checked ? [...new Set([...current, channel])] : current.filter((entry) => entry !== channel);
    this.shareForm.controls.channels.setValue(next);
    this.shareForm.controls.channels.markAsDirty();
  }

  saveShare(): void {
    const raw = this.shareForm.getRawValue();
    this.saving.set(true);

    this.companies
      .saveFunctionalitySettings('share_link', {
        headline: raw.headline || null,
        message: raw.message || null,
        channels: raw.channels,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.items.update((rows) => rows.map((row) => (row.key === updated.key ? updated : row)));
          this.patchShareForm();
          this.toast.success('Share link settings saved');
        },
        error: (error: HttpErrorResponse) => {
          this.saving.set(false);
          this.toast.error('Could not save the share settings', messageOf(error));
        },
      });
  }

  resetShare(): void {
    this.patchShareForm();
  }

  /* ------------------------------ whatsapp ------------------------------- */

  typeName(type: WhatsappType): string {
    return this.whatsappTypes().find((entry) => entry.key === type)?.name ?? type;
  }

  typePlacement(type: WhatsappType): string {
    return this.whatsappTypes().find((entry) => entry.key === type)?.placement ?? '';
  }

  /** `+91 9876543210`, the way it is printed on the website. */
  display(row: WhatsappNumber): string {
    return `+${row.countryCode} ${row.number}`;
  }

  /**
   * Types with no number of their own. Worth naming, because each one silently
   * falls back to the contact number rather than disappearing.
   */
  readonly unsetTypes = computed(() => {
    const used = new Set(this.numbers().map((row) => row.type));
    return this.whatsappTypes().filter((entry) => !used.has(entry.key));
  });

  openNumber(row: WhatsappNumber | null): void {
    this.editingNumber.set(row);
    this.numberForm.reset({
      type: row?.type ?? this.firstUnsetType(),
      countryCode: row?.countryCode ?? '91',
      number: row?.number ?? '',
      label: row?.label ?? '',
      defaultMessage: row?.defaultMessage ?? '',
      status: row?.status ?? 'active',
    });
    this.numberModalOpen.set(true);
  }

  /** Adding a number defaults to a type that has none yet, which is usually the intent. */
  private firstUnsetType(): WhatsappType {
    return this.unsetTypes()[0]?.key ?? this.whatsappTypes()[0]?.key ?? 'inquiry';
  }

  /**
   * Prefills the message this type is meant to open with, so a tenant that has
   * nothing particular to say still gets a sensible one.
   */
  useSuggestedMessage(): void {
    const type = this.numberForm.controls.type.value;
    const suggested = this.whatsappTypes().find((entry) => entry.key === type)?.defaultMessage ?? '';
    this.numberForm.controls.defaultMessage.setValue(suggested);
    this.numberForm.controls.defaultMessage.markAsDirty();
  }

  saveNumber(): void {
    if (this.numberForm.invalid) {
      touchAll(this.numberForm);
      return;
    }

    const raw = this.numberForm.getRawValue();
    const payload: Record<string, unknown> = {
      type: raw.type,
      countryCode: raw.countryCode,
      number: raw.number,
      // Empty means "use the type's own name" and "open with a blank box"; both
      // are real choices, so they go as null rather than being dropped.
      label: raw.label || null,
      defaultMessage: raw.defaultMessage || null,
      status: raw.status,
    };

    const row = this.editingNumber();
    this.saving.set(true);

    const request = row
      ? this.companies.updateWhatsappNumber(row.id, payload)
      : this.companies.createWhatsappNumber(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.numberModalOpen.set(false);
        this.toast.success(row ? 'WhatsApp number updated' : 'WhatsApp number added');
        this.loadNumbers();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the number', messageOf(error));
      },
    });
  }

  toggleNumber(row: WhatsappNumber): void {
    this.companies.toggleWhatsappNumber(row.id).subscribe({
      next: () => {
        this.toast.success(`Number is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.loadNumbers();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  async removeNumber(row: WhatsappNumber): Promise<void> {
    if (!(await this.confirm.askDelete(`the ${this.typeName(row.type)} number ${this.display(row)}`))) return;

    this.companies.removeWhatsappNumber(row.id).subscribe({
      next: () => {
        this.toast.success('WhatsApp number deleted');
        this.loadNumbers();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the number', messageOf(error)),
    });
  }
}
