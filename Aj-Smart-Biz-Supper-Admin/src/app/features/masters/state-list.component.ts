import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { State } from '../../core/models/domain.model';
import { CrudPage } from '../../shared/crud-page';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

@Component({
  selector: 'app-state-list',
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
  templateUrl: './state-list.component.html',
})
export class StateListComponent {
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    code: [''],
    gstCode: [''],
    country: ['India', [Validators.required]],
    status: ['active'],
  });

  readonly page = new CrudPage<State>({
    client: inject(CrudFactory).for<State>(MASTER_PATHS.states),
    label: 'state',
    toast: inject(ToastService),
    confirm: inject(ConfirmService),
    form: this.form,
    toForm: (row) => ({
      name: row?.name ?? '',
      code: row?.code ?? '',
      gstCode: row?.gstCode ?? '',
      country: row?.country ?? 'India',
      status: row?.status ?? 'active',
    }),
    initialQuery: { sortBy: 'name', sortOrder: 'asc' },
  });

  constructor() {
    this.page.load();
  }
}
