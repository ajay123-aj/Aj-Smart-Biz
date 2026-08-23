import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CompanyContextService } from './company-context.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

/**
 * The frame around every Company Details section.
 *
 * Its whole job is to load the company once for the section — see
 * `CompanyContextService`, which this route provides — and to keep one header
 * above whichever child is showing, so moving between Domains and Gallery does
 * not feel like leaving the company behind.
 *
 * The sections were tabs on one screen until they became sidebar entries. The
 * tab strip is gone rather than duplicated: the sidebar is the navigation now,
 * and a second row of the same links under it would only disagree with it.
 */
@Component({
  selector: 'app-company-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, PageHeaderComponent],
  providers: [CompanyContextService],
  /*
   * The outlet is outside every `@if` on purpose.
   *
   * It used to sit in the branch that renders once the company has loaded,
   * which meant that on the first click into the section — when this component
   * is being created by the same navigation that is trying to activate a child
   * of it — there was no outlet to activate the child into. Only the header
   * appeared. A full page load hid it, because the router is already waiting on
   * the lazy chunk by then and the outlet wins the race.
   *
   * So the outlet is always in the DOM, and only the header waits.
   */
  template: `
    @if (ctx.company(); as c) {
      <app-page-header [title]="c.name" [subtitle]="section() + ' · ' + c.code" />
    } @else if (ctx.loading()) {
      <div class="skeleton" style="height:64px;margin-bottom:20px"></div>
    } @else {
      <div class="empty">
        <div class="empty-icon">🏢</div>
        <div>Your company could not be loaded. Refresh the page or sign in again.</div>
      </div>
    }

    <router-outlet />
  `,
})
export class CompanyLayoutComponent {
  readonly ctx = inject(CompanyContextService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * The section name for the subtitle, taken from the child route's own title
   * so it can never drift from the sidebar entry that led here.
   */
  readonly section = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.childTitle())
    ),
    { initialValue: 'Company Details' }
  );

  /**
   * The deepest route title below this one.
   *
   * Every `?.` here earns its place: this runs while the navigation that
   * created this component is still finishing, so a child route can exist
   * before its snapshot does. Reaching through an undefined snapshot threw,
   * and a throw in the title stream took the whole layout down with it — the
   * outlet never activated and the section came up blank.
   */
  private childTitle(): string {
    let route: ActivatedRoute | null = this.route;
    let title: string | undefined;

    while (route) {
      title = (route.snapshot?.title as string | undefined) ?? title;
      route = route.firstChild;
    }

    return title ?? 'Company Details';
  }
}
