import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { touchAll } from '../../shared/utils';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FieldErrorComponent],
  templateUrl: './login.component.html',
  styles: [
    `
      .auth { display: grid; grid-template-columns: 1.05fr 1fr; min-height: 100vh; }
      .auth-art {
        background: linear-gradient(150deg, #1e3a8a 0%, #2563eb 55%, #0ea5e9 100%);
        color: #fff;
        padding: 56px 52px;
        display: flex; flex-direction: column; justify-content: center; gap: 14px;
      }
      .auth-art h1 { font-size: 34px; }
      .auth-art p { color: rgb(255 255 255 / 82%); max-width: 44ch; margin: 0; }
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

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.loading.set(true);

    this.auth.login(email, password).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.toast.success(`Welcome back, ${result.user.name}`);
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
