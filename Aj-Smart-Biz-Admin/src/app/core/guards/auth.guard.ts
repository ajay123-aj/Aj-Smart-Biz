import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ServerStatusService } from '../services/server-status.service';
import { ToastService } from '../services/toast.service';
import { PermissionAction } from '../models/domain.model';

/**
 * Blocks the shell until a token exists and the permission map has been loaded,
 * so `permissionGuard` on the child routes always has data to work with.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const status = inject(ServerStatusService);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.profileLoaded()) return true;

  return auth.loadProfile().pipe(
    map(() => true),
    catchError((error: HttpErrorResponse) => {
      /**
       * The API could not be reached at all.
       *
       * That is not a session problem, and sending the user to /login makes it
       * worse: `guestGuard` sees the token still in storage and sends them
       * straight back here, which fails again — a redirect loop that renders a
       * blank console and, because every navigation cancels the request it was
       * waiting on, never lets the interceptor report the outage either.
       *
       * So navigation is simply refused. The user stays where they are, the
       * status signal flips, and `App` puts the server-down screen over the
       * whole console until something answers.
       */
      if (error.status === 0) {
        status.markUnreachable();
        return of(false);
      }

      // A real answer that refused us: the session is over, so sign out.
      return of(router.createUrlTree(['/login']));
    })
  );
};

/** Keeps an already signed-in user away from the login screen. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.createUrlTree(['/dashboard']) : true;
};

/** Route-level menu permission check, e.g. `permissionGuard('role-management')`. */
export const permissionGuard =
  (slug: string, action: PermissionAction = 'canView'): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const toast = inject(ToastService);

    if (auth.can(slug, action)) return true;
    toast.error('Not allowed', 'Your role does not have access to that screen.');
    return router.createUrlTree(['/dashboard']);
  };

/** Forces a first-login password change before anything else is reachable. */
export const passwordChangeGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.user()?.mustChangePassword) return true;
  if (state.url.startsWith('/profile')) return true;
  return router.createUrlTree(['/profile'], { queryParams: { force: 1 } });
};
