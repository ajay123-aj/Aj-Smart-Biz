import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { BrandingService } from '../core/services/branding.service';
import { ThemeService } from '../core/services/theme.service';
import { UploadService } from '../core/services/upload.service';
import { initials } from '../shared/utils';

/** Fallback icons per system menu slug when the API row has none. */
const ICONS: Record<string, string> = {
  dashboard: '📊',
  'company-details': '🏢',
  'my-plan': '💳',
  'lead-management': '🎯',
  'role-management': '🛡️',
  'menu-permission': '🔐',
  'admin-management': '👥',
  // Company Details submenus
  'company-profile': '🏢',
  'branch-management': '📍',
  'company-domains': '🌐',
  // The website's colours, not the console's light/dark switch.
  'company-theme': '🎨',
  'company-functionality': '🎛️',
  // Distinct from Gallery's frame: these are the hero slides.
  'slider-management': '🎞️',
  'company-service-categories': '🗂️',
  'company-blog': '📝',
  'company-about': '📄',
  'company-team': '👤',
  'company-gallery': '🖼️',
  'company-contact': '✉️',
  'company-features': '✨',
  'company-social': '🔗',
  'company-subscription': '💳',
};

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styles: [
    `
      .shell { display: flex; min-height: 100vh; }

      .sidebar {
        width: var(--sidebar-w);
        flex-shrink: 0;
        background: var(--surface);
        border-right: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        position: sticky;
        top: 0;
        height: 100vh;
        z-index: 40;
      }
      .brand { display: flex; align-items: center; gap: 10px; padding: 0 18px; height: var(--topbar-h); border-bottom: 1px solid var(--border); }
      .brand-mark {
        display: grid; place-items: center;
        width: 34px; height: 34px; border-radius: 9px;
        background: var(--brand-600); color: #fff; font-weight: 800; font-size: 13px; flex-shrink: 0;
      }
      .brand-logo {
        width: 34px; height: 34px; flex-shrink: 0;
        object-fit: contain; border-radius: 8px;
        background: var(--surface-2); padding: 2px;
      }
      .brand-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
      .brand-text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .brand-text small { color: var(--text-3); font-size: 11px; }

      .nav { flex: 1; overflow-y: auto; padding: 14px 10px; }
      .nav-group-label {
        display: block; padding: 6px 10px;
        font-size: 10.5px; font-weight: 700; letter-spacing: .07em;
        text-transform: uppercase; color: var(--text-3);
      }
      .nav-item {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 11px; margin-bottom: 2px;
        border-radius: var(--radius-sm);
        color: var(--text-2); font-weight: 550; font-size: 13.5px;
        text-decoration: none;
      }
      .nav-item:hover { background: var(--surface-3); color: var(--text); text-decoration: none; }
      .nav-item.active { background: var(--brand-600); color: #fff; }
      .nav-icon { width: 18px; text-align: center; }

      /* A parent with children is a button, not a link: it opens the group. */
      .nav-parent {
        width: 100%; border: none; background: none;
        font: inherit; cursor: pointer; text-align: left;
      }
      .nav-caret {
        margin-left: auto; font-size: 10px;
        color: var(--text-3); transition: transform .15s;
      }
      .nav-parent.open .nav-caret { transform: rotate(90deg); }
      /* The parent reads as active when a child of it is, so the section it
         belongs to is never in doubt. */
      .nav-parent.within { color: var(--text); background: var(--surface-3); }

      .nav-children {
        display: flex; flex-direction: column;
        margin: 2px 0 6px 20px; padding-left: 10px;
        border-left: 1px solid var(--border);
      }
      .nav-child {
        display: flex; align-items: center; gap: 9px;
        padding: 7px 10px; margin-bottom: 1px;
        border-radius: var(--radius-sm);
        color: var(--text-3); font-size: 13px; font-weight: 500;
        text-decoration: none;
      }
      .nav-child:hover { background: var(--surface-3); color: var(--text); }
      .nav-child.active { background: var(--brand-600); color: #fff; }
      .nav-child .nav-icon { width: 15px; font-size: 12px; }
      .sidebar-foot { padding: 12px 18px; border-top: 1px solid var(--border); }

      .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .topbar {
        height: var(--topbar-h);
        display: flex; align-items: center; gap: 10px;
        padding: 0 20px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        position: sticky; top: 0; z-index: 30;
      }
      .menu-btn { display: none; }
      .content { padding: 24px; flex: 1; max-width: 1500px; width: 100%; }

      .banner {
        padding: 10px 20px;
        background: var(--warning-bg);
        color: var(--warning);
        font-size: 13px;
        font-weight: 550;
        border-bottom: 1px solid var(--border);
      }
      .banner a { color: inherit; text-decoration: underline; margin-left: 6px; }

      .profile { position: relative; }
      .profile-btn {
        display: flex; align-items: center; gap: 9px;
        padding: 5px 9px 5px 5px;
        background: none; border: 1px solid transparent; border-radius: 999px;
        cursor: pointer; font: inherit; color: var(--text);
      }
      .profile-btn:hover { background: var(--surface-3); }
      .profile-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25; }
      .profile-text small { color: var(--text-3); font-size: 11px; }
      .menu {
        position: absolute; right: 0; top: calc(100% + 8px);
        min-width: 190px; padding: 6px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius); box-shadow: var(--shadow-lg);
      }
      .menu-item {
        display: block; width: 100%; text-align: left;
        padding: 9px 11px; border: none; background: none;
        border-radius: var(--radius-sm); color: var(--text);
        font: inherit; cursor: pointer; text-decoration: none;
      }
      .menu-item:hover { background: var(--surface-3); text-decoration: none; }
      .menu-item.danger { color: var(--danger); }

      .backdrop { display: none; }

      @media (max-width: 900px) {
        .sidebar { position: fixed; left: 0; top: 0; transform: translateX(-100%); transition: transform .2s; }
        .nav-open .sidebar { transform: none; box-shadow: var(--shadow-lg); }
        .nav-open .backdrop { display: block; position: fixed; inset: 0; background: rgb(15 23 42 / 45%); z-index: 35; }
        .menu-btn { display: inline-flex; }
        .content { padding: 16px; }
        .profile-text { display: none; }
      }
    `,
  ],
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);
  private readonly uploads = inject(UploadService);
  private readonly branding = inject(BrandingService);

  readonly navOpen = signal(false);
  readonly menuOpen = signal(false);

  readonly userInitials = computed(() => initials(this.auth.user()?.name));
  readonly companyInitials = computed(() => initials(this.auth.companyName()));
  /**
   * Logo, title and favicon all come from BrandingService — fed by AuthService
   * on login and every /auth/me, refreshed when Company Details is saved, and
   * restored from cache at bootstrap. Reading it here means editing the logo
   * updates the sidebar immediately.
   */
  readonly companyLogo = computed(
    () => this.branding.logoUrl() ?? this.uploads.toUrl(this.auth.user()?.company?.logo)
  );

  /**
   * The sidebar, two levels deep: menus with a route, in sequence, each with
   * whatever children the API sent under it.
   *
   * Nesting comes from the data rather than from a list held here — `/auth/me`
   * already reports `parentId`, and a submenu the role cannot see never
   * arrives, so nothing has to be filtered a second time.
   */
  readonly navItems = computed(() => {
    const menus = this.auth.menus().filter((menu) => !!menu.route);
    const decorate = (menu: (typeof menus)[number]) => ({
      slug: menu.slug,
      name: menu.name,
      route: menu.route as string,
      icon: menu.icon && menu.icon.length <= 3 ? menu.icon : (ICONS[menu.slug] ?? '•'),
    });

    const ids = new Set(menus.map((menu) => menu.id));
    return menus
      // A child whose parent did not come through is shown at the top level
      // rather than dropped — better an odd position than a missing screen.
      .filter((menu) => !menu.parentId || !ids.has(menu.parentId))
      .map((menu) => ({
        ...decorate(menu),
        children: menus.filter((child) => child.parentId === menu.id).map(decorate),
      }));
  });

  /** The current URL as a signal, so the nav can react to navigation. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /**
   * Whether a section contains the page being shown. Drives both the header's
   * own highlight and which section is open after a navigation.
   */
  within(item: { route: string }): boolean {
    return this.url().startsWith(item.route);
  }

  /**
   * Which parent is expanded. One at a time: two open sections at once makes a
   * short sidebar long.
   *
   * It follows the URL rather than being set once — entering a section opens
   * it, and moving inside it keeps it open — but the header can still close it,
   * which is why this is state and not a computed.
   */
  readonly openGroup = signal<string | null>(null);

  /**
   * The section the URL last pointed at. The sync below writes `openGroup` only
   * when this changes, which is the whole point of keeping it.
   *
   * Without it the sync fires on anything that recomputes `navItems` — the menu
   * list arriving, or arriving again after a token refresh — and each of those
   * would re-assert the URL's answer over the visitor's. That is felt as a
   * click that did nothing: the section is collapsed and reopened before the
   * next frame, and only a second click, after the page has settled, appears to
   * work. Writing on a real change only means a toggle always survives.
   */
  private lastSection: string | null | undefined = undefined;

  constructor() {
    effect(() => {
      const url = this.url();
      const section =
        this.navItems().find((item) => item.children.length && url.startsWith(item.route))?.route ?? null;

      if (section === this.lastSection) return;
      this.lastSection = section;
      this.openGroup.set(section);
    });
  }

  isOpen(item: { route: string; children: unknown[] }): boolean {
    return item.children.length > 0 && this.openGroup() === item.route;
  }

  toggleGroup(item: { route: string }): void {
    this.openGroup.update((open) => (open === item.route ? null : item.route));
  }
}
