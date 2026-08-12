import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { CrudFactory, MASTER_PATHS } from '../../core/services/crud.service';
import { AuthService } from '../../core/services/auth.service';
import { BrandingService } from '../../core/services/branding.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { Company, Option, Transaction } from '../../core/models/domain.model';
import { cleanPayload, daysBetween, formatMoney, touchAll } from '../../shared/utils';
import { BranchManagerComponent } from './branch-manager.component';
import { DomainManagerComponent } from '../../shared/domain-manager.component';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

type Tab = 'profile' | 'branches' | 'domains' | 'subscription';

@Component({
  selector: 'app-company-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    PageHeaderComponent,
    StatusBadgeComponent,
    FieldErrorComponent,
    ImageUploadComponent,
    DomainManagerComponent,
    BranchManagerComponent,
  ],
  templateUrl: './company-details.component.html',
})
export class CompanyDetailsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly crud = inject(CrudFactory);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingService);

  readonly company = signal<Company | null>(null);
  readonly transactions = signal<Transaction[]>([]);
  readonly states = signal<Option[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly tab = signal<Tab>('profile');
  /** Live counts from the panels; the company payload only has the initial ones. */
  readonly domainCount = signal<number | null>(null);
  readonly branchCount = signal<number | null>(null);
  /** Branch management is a tab here rather than a sidebar entry. */
  readonly canViewBranches = computed(() => this.auth.can('branch-management'));

  /** The API only lets the main admin write the company profile and its domains. */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());
  /** Branches a domain can be pinned to. */
  readonly branchOptions = computed(() =>
    (this.company()?.branches ?? []).map((branch) => ({ id: branch.id, name: branch.name }))
  );

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
    this.load();
    this.companies.transactions({ limit: 50 }).subscribe({
      next: (result) => this.transactions.set(result.items),
      error: () => undefined,
    });
  }

  private load(): void {
    this.loading.set(true);
    this.companies.get().subscribe({
      next: (company) => {
        this.company.set(company);
        this.patch(company);
        if (!this.canEdit()) this.form.disable();
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load the company', messageOf(error));
      },
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
  }

  reset(): void {
    const company = this.company();
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
        this.company.set(company);
        // Repaint the tab icon, title and sidebar logo right away rather than
        // waiting for the next sign-in.
        // Keep the admin's branch in front of the company, as it is after login.
        this.branding.applyCompany(company, this.auth.user()?.branch);
        this.toast.success('Company details updated');
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not update the company', messageOf(error));
      },
    });
  }

  money(value: number | string, currency = 'INR'): string {
    return formatMoney(value, currency);
  }

  daysLeft(endDate: string): number {
    return Math.max(0, daysBetween(endDate));
  }
}
