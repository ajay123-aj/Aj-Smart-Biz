import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { BusinessType } from '../../core/models/domain.model';
import { CrudPage } from '../../shared/crud-page';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-business-type-list',
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
  templateUrl: './business-type-list.component.html',
})
export class BusinessTypeListComponent {
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: [''],
    icon: [''],
    description: [''],
    status: ['active'],
  });

  readonly page = new CrudPage<BusinessType>({
    client: inject(CrudFactory).for<BusinessType>(MASTER_PATHS.businessTypes),
    label: 'business type',
    toast: inject(ToastService),
    confirm: inject(ConfirmService),
    form: this.form,
    toForm: (row) => ({
      name: row?.name ?? '',
      slug: row?.slug ?? '',
      icon: row?.icon ?? '',
      description: row?.description ?? '',
      status: row?.status ?? 'active',
    }),
    initialQuery: { sortBy: 'name', sortOrder: 'asc' },
  });

  constructor() {
    this.page.load();
  }
}
