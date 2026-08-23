import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyContextService } from './company-context.service';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { AuthService } from '../../core/services/auth.service';
import { BrandingService } from '../../core/services/branding.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Company, Option } from '../../core/models/domain.model';
import { cleanPayload, daysBetween, touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

/**
 * The company's own record: name, contact, branding and address.
 *
 * The first of the Company Details sections and the one `/company` lands on.
 * Everything else under Company Details is about the public website; this is
 * the tenant itself, so it also carries the summary cards.
 */
@Component({
  selector: 'app-company-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    StatusBadgeComponent,
    FieldErrorComponent,
    ImageUploadComponent,
  ],
  templateUrl: './company-profile.component.html',
})
export class CompanyProfileComponent {
  readonly ctx = inject(CompanyContextService);
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly crud = inject(CrudFactory);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingService);

  readonly states = signal<Option[]>([]);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    legalName: [''],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required]],
    alternatePhone: [''],
    website: ['', [Validators.pattern(/^https?:\/\/.+/)]],
    gstNumber: [''],
    panNumber: [''],
    logo: [null as string | null],
    favicon: [null as string | null],
    description: [''],
    addressLine1: [''],
    addressLine2: [''],
    stateId: [null as number | null],
    city: [''],
    pincode: [''],
  });

  constructor() {
    this.crud.for<Option>(MASTER_PATHS.states).dropdown().subscribe((rows) => this.states.set(rows));

    /**
     * The context may already hold the company, or may still be fetching it —
     * this screen can be entered either way, so it fills the form from the
     * signal rather than from a load of its own.
     */
    effect(() => {
      const company = this.ctx.company();
      if (company) this.patch(company);
    });
  }

  private patch(company: Company): void {
    this.form.patchValue({
      name: company.name,
      legalName: company.legalName ?? '',
      email: company.email,
      phone: company.phone,
      alternatePhone: company.alternatePhone ?? '',
      website: company.website ?? '',
      gstNumber: company.gstNumber ?? '',
      panNumber: company.panNumber ?? '',
      logo: company.logo ?? null,
      favicon: company.favicon ?? null,
      description: company.description ?? '',
      addressLine1: company.addressLine1 ?? '',
      addressLine2: company.addressLine2 ?? '',
      stateId: company.stateId ?? null,
      city: company.city ?? '',
      pincode: company.pincode ?? '',
    });
    if (!this.ctx.canEdit()) this.form.disable();
  }

  reset(): void {
    const company = this.ctx.company();
    if (company) this.patch(company);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    this.saving.set(true);
    const payload = cleanPayload(this.form.getRawValue() as Record<string, unknown>);

    this.companies.update(payload as Record<string, unknown>).subscribe({
      next: (company) => {
        this.saving.set(false);
        this.ctx.set(company);
        // Repaint the tab icon, title and sidebar logo right away rather than
        // waiting for the next sign-in. Keep the admin's branch in front of the
        // company, as it is after login.
        this.branding.applyCompany(company, this.auth.user()?.branch);
        this.toast.success('Company details updated');
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not update the company', messageOf(error));
      },
    });
  }

  daysLeft(endDate: string): number {
    return Math.max(0, daysBetween(endDate));
  }
}
