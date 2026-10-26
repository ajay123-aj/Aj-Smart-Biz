import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MarketingService } from '../../core/services/marketing.service';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Company, Status } from '../../core/models/domain.model';
import { MarketingTemplate, TemplateDesign, TemplateDesignKey } from '../../core/models/marketing.model';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/**
 * The Templates page on the marketing site: which demo companies it shows,
 * in which design, and where each one's live demo is.
 *
 * An entry is only a pointer. The card on the website reads the business
 * type, colours, headline, services and live sections from the company
 * itself, so the way to change what a card shows is to change the demo
 * company; this screen only decides which ones appear and how they are
 * introduced.
 */
@Component({
  selector: 'app-marketing-template',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './marketing-template.component.html',
})
export class MarketingTemplateComponent {
  private readonly service = inject(MarketingService);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<MarketingTemplate[]>([]);
  readonly designs = signal<TemplateDesign[]>([]);
  readonly companyOptions = signal<Company[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);

  /** null = closed, 'new' = adding, a row = editing that one. */
  readonly editing = signal<MarketingTemplate | 'new' | null>(null);

  readonly form = this.fb.nonNullable.group({
    companyId: [null as number | null, [Validators.required]],
    design: ['default' as TemplateDesignKey, [Validators.required]],
    title: ['', [Validators.maxLength(150)]],
    summary: ['', [Validators.maxLength(400)]],
    demoUrl: ['', [Validators.pattern(/^https?:\/\/.+/), Validators.maxLength(255)]],
    featured: [false],
    sequence: [0, [Validators.required, Validators.min(0)]],
    status: ['active' as Status],
  });

  /** The design picked in the form, for the line of explanation under it. */
  readonly designValue = signal<TemplateDesignKey>('default');
  readonly pickedDesign = computed(() => this.designs().find((design) => design.key === this.designValue()) ?? null);

  constructor() {
    this.load();
    this.form.controls.design.valueChanges.subscribe((value) => this.designValue.set(value));
    // Every company, by name, for the picker. Sample and demo companies are
    // ordinary companies, so they are in this list too.
    this.companies.list({ limit: 100, sortBy: 'name', sortOrder: 'asc' }).subscribe({
      next: (result) => this.companyOptions.set(result.items),
    });
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.service.listTemplates().subscribe({
      next: (result) => {
        this.rows.set(result.items ?? []);
        this.designs.set(result.designs ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  designName(key: string): string {
    return this.designs().find((design) => design.key === key)?.name ?? key;
  }

  get isNew(): boolean {
    return this.editing() === 'new';
  }

  open(row?: MarketingTemplate): void {
    this.editing.set(row ?? 'new');
    this.form.reset({
      companyId: row?.companyId ?? null,
      design: row?.design ?? 'default',
      title: row?.title ?? '',
      summary: row?.summary ?? '',
      demoUrl: row?.demoUrl ?? '',
      featured: row?.featured ?? false,
      // Tens, as on the FAQ, so an entry can be slipped between two others.
      sequence: row?.sequence ?? (this.rows().length + 1) * 10,
      status: row?.status ?? 'active',
    });
    this.designValue.set(this.form.controls.design.value);
  }

  close(): void {
    this.editing.set(null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const current = this.editing();
    if (!current) return;

    this.saving.set(true);
    const raw = this.form.getRawValue();
    const body: Partial<MarketingTemplate> = {
      ...raw,
      companyId: Number(raw.companyId),
      // Blank means "use the company's own", which the API stores as null.
      title: raw.title.trim() || null,
      summary: raw.summary.trim() || null,
      demoUrl: raw.demoUrl.trim() || null,
    };
    const request = current === 'new' ? this.service.createTemplate(body) : this.service.updateTemplate(current.id, body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(current === 'new' ? 'Template added' : 'Template saved');
        this.close();
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  async remove(row: MarketingTemplate): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove this template?',
      message:
        `“${row.title || row.company?.name}” will be taken off the website's Templates page. ` +
        'The demo company itself is not changed. To hide it for now, set it inactive instead.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;

    this.service.removeTemplate(row.id).subscribe({
      next: () => {
        this.toast.success('Template removed');
        this.load();
      },
    });
  }

  toggleStatus(row: MarketingTemplate): void {
    const status: Status = row.status === 'active' ? 'inactive' : 'active';
    this.service.updateTemplate(row.id, { status }).subscribe({
      next: () => {
        this.toast.success(status === 'active' ? 'Template shown' : 'Template hidden');
        this.load();
      },
    });
  }
}
