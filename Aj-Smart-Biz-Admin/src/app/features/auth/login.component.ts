import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { BrandingService } from '../../core/services/branding.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { initials, touchAll } from '../../shared/utils';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldErrorComponent],
  templateUrl: './login.component.html',
  styles: [
    `
      .auth { display: grid; grid-template-columns: 1.05fr 1fr; min-height: 100vh; }
      .auth-art {
        background: linear-gradient(150deg, #0f766e 0%, #0d9488 50%, #22c55e 100%);
        color: #fff;
        padding: 56px 52px;
        display: flex; flex-direction: column; justify-content: center; gap: 14px;
      }
      .auth-art h1 { font-size: 32px; }
      .auth-art p { color: rgb(255 255 255 / 84%); max-width: 44ch; margin: 0; }
      .auth-art ul { margin: 22px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
      .auth-art li { color: rgb(255 255 255 / 88%); font-size: 14px; }
      .brand-mark {
        display: grid; place-items: center;
        width: 52px; height: 52px; border-radius: 14px;
        background: rgb(255 255 255 / 18%); font-weight: 800; font-size: 18px; margin-bottom: 10px;
      }
      .auth-panel { display: grid; place-items: center; padding: 32px 20px; background: var(--surface-2); }
      .auth-form { width: 100%; max-width: 400px; }
      .auth-form h2 { font-size: 20px; }

      .brand-logo {
        max-width: 190px; max-height: 76px;
        object-fit: contain; object-position: left;
        margin-bottom: 14px;
      }

      .panel-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
      .panel-brand img { width: 44px; height: 44px; object-fit: contain; border-radius: 9px; flex-shrink: 0; }
      .panel-brand h2 { font-size: 19px; line-height: 1.25; }
      .alert {
        padding: 10px 13px; margin-bottom: 16px;
        background: var(--danger-bg); color: var(--danger);
        border-radius: var(--radius-sm); font-size: 13px;
      }
      .pw { position: relative; }
      .pw-toggle {
        position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
        border: none; background: none; cursor: pointer; padding: 6px 8px; font-size: 15px;
      }
      @media (max-width: 860px) { .auth { grid-template-columns: 1fr; } .auth-art { display: none; } }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  readonly branding = inject(BrandingService);

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly company = this.branding.branding;
  readonly brandInitials = computed(() => initials(this.company().name));

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    // Resolves the tenant from the hostname and applies its logo, name,
    // description, favicon and accent colour. Never blocks the form.
    this.branding.load().subscribe();
  }

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);

    // Chain /auth/me so permissions and menus are ready before the shell renders.
    this.auth
      .login(email, password)
      .pipe(switchMap(() => this.auth.loadProfile()))
      .subscribe({
        next: ({ user }) => {
          this.loading.set(false);
          this.toast.success(`Welcome back, ${user.name}`);
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
          void this.router.navigateByUrl(returnUrl);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(messageOf(error));
        },
      });
  }
}
