import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { ServerStatusService } from '../services/server-status.service';
import { FieldError } from '../models/api.model';

/** Attaches the bearer token and turns API errors into a single readable message. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const status = inject(ServerStatusService);

  const token = auth.token;
  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    /**
     * Anything that answers proves the API is there — including an error
     * response, which is why this is on the success path *and* below. It is
     * what lets the console recover on its own when the server comes back.
     */
    tap(() => status.markReachable()),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        /**
         * No connection at all. One screen says so — see `ServerDownComponent`
         * — rather than one toast per failed request: a screen firing six calls
         * used to raise six identical notices down the side of an empty console.
         */
        status.markUnreachable();
      } else if (error.status === 401) {
        status.markReachable();
        // Skip the toast on the login screen: the form shows the message itself.
        if (!req.url.includes('/auth/') || req.url.includes('/auth/me')) {
          toast.warning('Session expired', 'Please sign in again.');
        }
        auth.logout();
      } else if (error.status === 403) {
        status.markReachable();
        toast.error('Not allowed', messageOf(error));
      } else if (error.status >= 500) {
        status.markReachable();
        toast.error('Server error', messageOf(error));
      } else {
        status.markReachable();
      }
      return throwError(() => error);
    })
  );
};

/** Flattens `{ message, errors: [{ field, message }] }` into one string. */
export function messageOf(error: HttpErrorResponse): string {
  const body = error.error as { message?: string; errors?: FieldError[] } | undefined;
  if (body?.errors?.length) {
    return body.errors.map((item) => `${item.field}: ${item.message}`).join(', ');
  }
  return body?.message || error.message || 'Something went wrong';
}
