import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MarketingService } from '../../core/services/marketing.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { Status } from '../../core/models/domain.model';
import { MarketingFaq } from '../../core/models/marketing.model';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/**
 * The questions on the marketing site's FAQ.
 *
 * Its own screen rather than a section of the content editor, because this is
 * the one part of the site's writing that is a *list of uniform things*: every
 * entry is a question and an answer, the order matters, and entries get added
 * one at a time. That is a table, and it means editing one question does not
 * mean being shown the JSON of every other question at the same time.
 *
 * Not a `CrudPage`: the API has no status toggle, restore or pagination for
 * these — it returns the lot, in sequence order — so most of that machinery
 * would be methods that 404.
 */
@Component({
  selector: 'app-marketing-faq',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SlicePipe,
    ReactiveFormsModule,
    PageHeaderComponent,
    StatusBadgeComponent,
    TableStateComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './marketing-faq.component.html',
})
export class MarketingFaqComponent {
  private readonly service = inject(MarketingService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<MarketingFaq[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly saving = signal(false);

  /** null = closed, 'new' = adding, a row = editing that one. */
  readonly editing = signal<MarketingFaq | 'new' | null>(null);

  readonly form = this.fb.nonNullable.group({
    question: ['', [Validators.required, Validators.minLength(5)]],
    answer: ['', [Validators.required, Validators.minLength(5)]],
    sequence: [0, [Validators.required, Validators.min(0)]],
    /* Typed, or `getRawValue()` hands the service a plain `string`. */
    status: ['active' as Status],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.service.listFaqs().subscribe({
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

  /** The title on the modal, which is also how the template knows the mode. */
  get isNew(): boolean {
    return this.editing() === 'new';
  }

  open(row?: MarketingFaq): void {
    this.editing.set(row ?? 'new');
    this.form.reset({
      question: row?.question ?? '',
      answer: row?.answer ?? '',
      /**
       * New questions land at the end, in tens.
       *
       * Tens rather than ones so a question can be slipped between two others
       * without renumbering the list — the site orders by this and nothing
       * else depends on the values being contiguous.
       */
      sequence: row?.sequence ?? (this.rows().length + 1) * 10,
      status: row?.status ?? 'active',
    });
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
    const body = this.form.getRawValue();
    const request =
      current === 'new'
        ? this.service.createFaq(body)
        : this.service.updateFaq(current.id, body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(current === 'new' ? 'Question added' : 'Question saved');
        this.close();
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  /**
   * Removes a question for good.
   *
   * Confirmed because it is not reversible from this console — the API soft
   * deletes, so the row survives in the database, but nothing here brings it
   * back. The wording points at the reversible alternative rather than just
   * asking "are you sure".
   */
  async remove(row: MarketingFaq): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Remove this question?',
      message:
        `“${row.question}” will be removed from the website and from this list. ` +
        'To take it off the site but keep it here, set its status to inactive instead.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;

    this.service.removeFaq(row.id).subscribe({
      next: () => {
        this.toast.success('Question removed');
        this.load();
      },
    });
  }

  /** Flips active/inactive without opening the editor. */
  toggleStatus(row: MarketingFaq): void {
    const status: Status = row.status === 'active' ? 'inactive' : 'active';
    this.service.updateFaq(row.id, { status }).subscribe({
      next: () => {
        this.toast.success(status === 'active' ? 'Question shown' : 'Question hidden');
        this.load();
      },
    });
  }
}
