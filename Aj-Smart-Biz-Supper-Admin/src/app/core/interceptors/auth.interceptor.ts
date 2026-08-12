import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { FieldError } from '../models/api.model';

/** Attaches the bearer token and turns API errors into a single readable message. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);

  const token = auth.token;
  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        toast.error('Cannot reach the server', 'Check that the Aj Smart Biz API is running.');
      } else if (error.status === 401) {
        // Skip the toast on the login screen: the form shows the message itself.
        if (!req.url.includes('/auth/') || req.url.includes('/auth/me')) {
          toast.warning('Session expired', 'Please sign in again.');
        }
        auth.logout();
      } else if (error.status === 403) {
        toast.error('Not allowed', messageOf(error));
      } else if (error.status >= 500) {
        toast.error('Server error', messageOf(error));
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
