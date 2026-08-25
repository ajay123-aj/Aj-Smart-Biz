import { Injectable, computed, signal } from '@angular/core';

/**
 * Whether the API is answering.
 *
 * One signal, written only by the HTTP interceptor — every request that
 * completes says "reachable", and every request that fails to connect at all
 * (`HttpErrorResponse.status === 0`) says it is not. Nothing else sets it,
 * because nothing else knows: a 401 or a 500 means the API answered, and an
 * answer is not an outage.
 *
 * The console reads it in one place, `App`, and swaps the whole screen. That is
 * deliberately blunt: with no API there is no data, no permissions and no menu,
 * so a partly-rendered console is a screen full of empty tables that reads as
 * broken software rather than as a service that is down.
 */
@Injectable({ providedIn: 'root' })
export class ServerStatusService {
  private readonly _reachable = signal(true);

  readonly reachable = this._reachable.asReadonly();
  readonly unreachable = computed(() => !this._reachable());

  /** Set from the interceptor when a request could not reach the API at all. */
  markUnreachable(): void {
    this._reachable.set(false);
  }

  /**
   * Set from the interceptor whenever anything answers — including an error
   * response, which still proves the API is there. That is what lets the
   * console recover on its own the moment the server comes back, without a
   * reload and without polling.
   */
  markReachable(): void {
    if (!this._reachable()) this._reachable.set(true);
  }
}
