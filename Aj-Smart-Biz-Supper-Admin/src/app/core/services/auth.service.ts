import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SuperAdmin } from '../models/domain.model';
import { ApiService } from './api.service';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: SuperAdmin;
}

const TOKEN_KEY = `${environment.storagePrefix}token`;
const REFRESH_KEY = `${environment.storagePrefix}refresh`;
const USER_KEY = `${environment.storagePrefix}user`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly _user = signal<SuperAdmin | null>(readStoredUser());

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());
  /** Root has the extra privileges the UI hides for staff accounts. */
  readonly isRoot = computed(() => this._user()?.isRoot === true);

  get token(): string | null {
    return this._token();
  }

  login(email: string, password: string): Observable<LoginResult> {
    return this.api
      .post<LoginResult>('/auth/super-admin/login', { email, password })
      .pipe(tap((result) => this.persist(result)));
  }

  /** Re-reads the profile so a role or status change lands without a re-login. */
  loadProfile(): Observable<{ user: SuperAdmin }> {
    return this.api.get<{ user: SuperAdmin }>('/auth/me').pipe(
      tap(({ user }) => {
        this._user.set(user);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      })
    );
  }

  updateProfile(payload: Partial<SuperAdmin>): Observable<SuperAdmin> {
    return this.api.patch<SuperAdmin>('/auth/profile', payload).pipe(
      tap((user) => {
        this._user.set(user);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<null> {
    return this.api.post<null>('/auth/change-password', { currentPassword, newPassword, confirmPassword });
  }

  logout(redirect = true): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    if (redirect) void this.router.navigate(['/login']);
  }

  private persist(result: LoginResult): void {
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    localStorage.setItem(REFRESH_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    this._token.set(result.accessToken);
    this._user.set(result.user);
  }
}

function readStoredUser(): SuperAdmin | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SuperAdmin) : null;
  } catch {
    return null;
  }
}
