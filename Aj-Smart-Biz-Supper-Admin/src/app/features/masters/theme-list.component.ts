import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Theme } from '../../core/models/domain.model';
import { CrudPage } from '../../shared/crud-page';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

@Component({
  selector: 'app-theme-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    PagerComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './theme-list.component.html',
  styles: [
    `
      .swatches { display: flex; align-items: center; gap: 6px; }
      .swatch { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--border); display: inline-block; }
      .preview { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-top: 4px; }
      .preview-bar { padding: 10px 14px; color: #fff; font-weight: 600; font-size: 13px; }
      .preview-body { padding: 14px; display: flex; gap: 8px; }
      .preview-chip { padding: 4px 12px; border-radius: 999px; color: #fff; font-size: 12px; font-weight: 600; }
    `,
  ],
})
export class ThemeListComponent {
  private readonly fb = inject(FormBuilder);

  readonly colorFields = [
    { key: 'primaryColor', label: 'Primary', required: true },
    { key: 'secondaryColor', label: 'Secondary', required: true },
    { key: 'accentColor', label: 'Accent', required: false },
    { key: 'textColor', label: 'Text', required: false },
    { key: 'backgroundColor', label: 'Background', required: false },
    { key: 'sidebarColor', label: 'Sidebar', required: false },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    code: [''],
    primaryColor: ['#2563eb', [Validators.required, Validators.pattern(HEX)]],
    secondaryColor: ['#0f172a', [Validators.required, Validators.pattern(HEX)]],
    accentColor: ['#22c55e', [Validators.pattern(HEX)]],
    textColor: ['#0f172a', [Validators.pattern(HEX)]],
    backgroundColor: ['#f8fafc', [Validators.pattern(HEX)]],
    sidebarColor: ['#ffffff', [Validators.pattern(HEX)]],
    fontFamily: [''],
    mode: ['light'],
    isDefault: [false],
    status: ['active'],
  });

  readonly page = new CrudPage<Theme>({
    client: inject(CrudFactory).for<Theme>(MASTER_PATHS.themes),
    label: 'theme',
    toast: inject(ToastService),
    confirm: inject(ConfirmService),
    form: this.form,
    toForm: (row) => ({
      name: row?.name ?? '',
      code: row?.code ?? '',
      primaryColor: row?.primaryColor ?? '#2563eb',
      secondaryColor: row?.secondaryColor ?? '#0f172a',
      accentColor: row?.accentColor ?? '#22c55e',
      textColor: row?.textColor ?? '#0f172a',
      backgroundColor: row?.backgroundColor ?? '#f8fafc',
      sidebarColor: row?.sidebarColor ?? '#ffffff',
      fontFamily: row?.fontFamily ?? '',
      mode: row?.mode ?? 'light',
      isDefault: row?.isDefault ?? false,
      status: row?.status ?? 'active',
    }),
    initialQuery: { sortBy: 'name', sortOrder: 'asc' },
  });

  constructor() {
    this.page.load();
  }
}
