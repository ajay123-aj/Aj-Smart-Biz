import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Branch, BranchContact } from '../../core/models/domain.model';
import { CanDirective } from '../../shared/can.directive';
import { cleanPayload, initials, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

@Component({
  selector: 'app-branch-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CanDirective,
    PageHeaderComponent,
    StatusBadgeComponent,
    ModalComponent,
    FieldErrorComponent,
  ],
  templateUrl: './branch-detail.component.html',
  styles: [
    `
      .branding { display: flex; gap: 22px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
      .brand-slot { display: flex; flex-direction: column; gap: 6px; }
      .brand-box {
        width: 84px; height: 84px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-2);
        display: grid; place-items: center;
        overflow: hidden;
      }
      .brand-box img { width: 100%; height: 100%; object-fit: contain; padding: 8px; }
      .brand-box img.favicon { padding: 26px; }
      .empty-box { color: var(--text-3); }
    `,
  ],
})
export class BranchDetailComponent {
  readonly id = input.required<string>();

  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly uploads = inject(UploadService);

  readonly branch = signal<Branch | null>(null);
  readonly contacts = signal<BranchContact[]>([]);
  readonly loading = signal(true);
  readonly modalOpen = signal(false);
  readonly editing = signal<BranchContact | null>(null);
  readonly saving = signal(false);

  readonly branchId = computed(() => Number(this.id()));

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    designation: [''],
    department: [''],
    phone: ['', [Validators.required]],
    alternatePhone: [''],
    email: ['', [Validators.email]],
    notes: [''],
    isPrimary: [false],
    status: ['active'],
  });

  constructor() {
    effect(() => {
      const branchId = this.branchId();
      if (!Number.isFinite(branchId)) return;
      this.load(branchId);
    });
  }

  private load(branchId: number): void {
    this.loading.set(true);
    this.companies.getBranch(branchId).subscribe({
      next: (branch) => {
        this.branch.set(branch);
        this.contacts.set(branch.contacts ?? []);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the branch', messageOf(error));
        void this.router.navigate(['/company']);
      },
    });
  }

  private refreshContacts(): void {
    this.companies.listContacts(this.branchId()).subscribe({
      next: (rows) => this.contacts.set(rows),
      error: () => undefined,
    });
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  logoUrl(branch: Branch): string | null {
    return this.uploads.toUrl(branch.logo);
  }

  faviconUrl(branch: Branch): string | null {
    return this.uploads.toUrl(branch.favicon);
  }

  addressOf(branch: Branch): string {
    return [branch.addressLine1, branch.addressLine2, branch.city, branch.pincode].filter(Boolean).join(', ') || '—';
  }

  openModal(contact: BranchContact | null): void {
    this.editing.set(contact);
    this.form.reset({
      name: contact?.name ?? '',
      designation: contact?.designation ?? '',
      department: contact?.department ?? '',
      phone: contact?.phone ?? '',
      alternatePhone: contact?.alternatePhone ?? '',
      email: contact?.email ?? '',
      notes: contact?.notes ?? '',
      isPrimary: contact?.isPrimary ?? false,
      status: contact?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const payload = cleanPayload(this.form.getRawValue() as Record<string, unknown>) as Record<string, unknown>;
    const contact = this.editing();
    this.saving.set(true);

    const request = contact
      ? this.companies.updateContact(this.branchId(), contact.id, payload)
      : this.companies.createContact(this.branchId(), payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(contact ? 'Contact updated' : 'Contact added');
        this.modalOpen.set(false);
        this.refreshContacts();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the contact', messageOf(error));
      },
    });
  }

  async remove(contact: BranchContact): Promise<void> {
    if (!(await this.confirm.askDelete(`the contact "${contact.name}"`))) return;

    this.companies.removeContact(this.branchId(), contact.id).subscribe({
      next: () => {
        this.toast.success('Contact deleted');
        this.refreshContacts();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the contact', messageOf(error)),
    });
  }
}
