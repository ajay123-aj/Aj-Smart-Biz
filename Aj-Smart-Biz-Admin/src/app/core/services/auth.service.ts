import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser, MenuItem, PermissionAction, PermissionMap } from '../models/domain.model';
import { ApiService } from './api.service';
import { BrandingService } from './branding.service';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: AdminUser;
}

interface MeResult {
  user: AdminUser;
  permissions: PermissionMap;
  menus: MenuItem[];
}

const TOKEN_KEY = `${environment.storagePrefix}token`;
const REFRESH_KEY = `${environment.storagePrefix}refresh`;
const USER_KEY = `${environment.storagePrefix}user`;

/**
 * Company-scoped session. Besides the token it keeps the permission map and the
 * menu list returned by `/auth/me`, which together drive the sidebar and every
 * `*appCan` check in the templates.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly branding = inject(BrandingService);

  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly _user = signal<AdminUser | null>(readStoredUser());
  private readonly _permissions = signal<PermissionMap>({});
  private readonly _menus = signal<MenuItem[]>([]);
  private readonly _profileLoaded = signal(false);

  readonly user = this._user.asReadonly();
  readonly permissions = this._permissions.asReadonly();
  readonly menus = this._menus.asReadonly();
  readonly profileLoaded = this._profileLoaded.asReadonly();

  readonly isLoggedIn = computed(() => !!this._token());
  /** The main admin bypasses every permission check. */
  readonly isCompanyAdmin = computed(() => this._user()?.isCompanyAdmin === true);
  readonly companyName = computed(() => this._user()?.company?.name ?? 'My company');

  get token(): string | null {
    return this._token();
  }

  login(email: string, password: string): Observable<LoginResult> {
    return this.api.post<LoginResult>('/auth/admin/login', { email, password }).pipe(
      tap((result) => this.persist(result))
    );
  }

  /** Loads profile + permissions + menus; the shell waits on this before rendering nav. */
  loadProfile(): Observable<MeResult> {
    return this.api.get<MeResult>('/auth/me').pipe(
      tap((result) => {
        this._user.set(result.user);
        this._permissions.set(result.permissions ?? {});
        this._menus.set(result.menus ?? []);
        this._profileLoaded.set(true);
        localStorage.setItem(USER_KEY, JSON.stringify(result.user));
        // The signed-in company is the authority on branding from here on.
        // The admin's branch, when they have one, brands the session.
        if (result.user.company) this.branding.applyCompany(result.user.company, result.user.branch);
      })
    );
  }

  updateProfile(payload: Partial<AdminUser>): Observable<AdminUser> {
    return this.api.patch<AdminUser>('/auth/profile', payload).pipe(
      tap((user) => {
        this._user.set(user);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<null> {
    return this.api
      .post<null>('/auth/change-password', { currentPassword, newPassword, confirmPassword })
      .pipe(tap(() => this._user.update((user) => (user ? { ...user, mustChangePassword: false } : user))));
  }

  /** True when the signed-in admin may perform `action` on the menu `slug`. */
  can(slug: string, action: PermissionAction = 'canView'): boolean {
    if (this.isCompanyAdmin()) return true;
    return this._permissions()[slug]?.[action] === true;
  }

  logout(redirect = true): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this._permissions.set({});
    this._menus.set([]);
    this._profileLoaded.set(false);
    if (redirect) void this.router.navigate(['/login']);
  }

  private persist(result: LoginResult): void {
    localStorage.setItem(TOKEN_KEY, result.accessToken);
    localStorage.setItem(REFRESH_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    this._token.set(result.accessToken);
    this._user.set(result.user);
    if (result.user.company) this.branding.applyCompany(result.user.company, result.user.branch);
  }
}

function readStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}
