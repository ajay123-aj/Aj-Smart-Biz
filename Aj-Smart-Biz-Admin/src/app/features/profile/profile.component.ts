import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { initials, touchAll, strongPassword } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  if (!confirmPassword) return null;
  return newPassword === confirmPassword ? null : { mismatch: true };
};

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, PageHeaderComponent, FieldErrorComponent],
  templateUrl: './profile.component.html',
  styles: [
    `
      .notice {
        margin-bottom: 18px;
        padding: 12px 16px;
        background: var(--warning-bg);
        color: var(--warning);
        border-radius: var(--radius);
        font-size: 13.5px;
        font-weight: 550;
      }
    `,
  ],
})
export class ProfileComponent {
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly savingProfile = signal(false);
  readonly savingPassword = signal(false);
  /** Set when the shell redirected here because of `mustChangePassword`. */
  readonly forced = signal(this.route.snapshot.queryParamMap.get('force') === '1');

  readonly profileForm = this.fb.nonNullable.group({
    name: [this.auth.user()?.name ?? '', [Validators.required, Validators.minLength(2)]],
    phone: [this.auth.user()?.phone ?? ''],
    avatar: [this.auth.user()?.avatar ?? ''],
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, strongPassword]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch }
  );

  initialsOf(name: string | undefined): string {
    return initials(name);
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      touchAll(this.profileForm);
      return;
    }

    this.savingProfile.set(true);
    this.auth.updateProfile(this.profileForm.getRawValue()).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.toast.success('Profile updated');
      },
      error: (error: HttpErrorResponse) => {
        this.savingProfile.set(false);
        this.toast.error('Could not update the profile', messageOf(error));
      },
    });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      touchAll(this.passwordForm);
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);

    this.auth.changePassword(currentPassword, newPassword, confirmPassword).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        this.toast.success('Password changed');
        if (this.forced()) {
          this.forced.set(false);
          void this.router.navigate(['/dashboard']);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.savingPassword.set(false);
        this.toast.error('Could not change the password', messageOf(error));
      },
    });
  }
}
