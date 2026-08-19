import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  'branch-management': '📍',
  'role-management': '🛡️',
  'menu-permission': '🔐',
  'admin-management': '👥',
  'slider-management': '🖼️',
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

  /** Menus with a route, ordered by sequence, with an icon fallback. */
  readonly navItems = computed(() =>
    this.auth
      .menus()
      .filter((menu) => !!menu.route)
      .map((menu) => ({
        slug: menu.slug,
        name: menu.name,
        route: menu.route as string,
        icon: menu.icon && menu.icon.length <= 3 ? menu.icon : (ICONS[menu.slug] ?? '•'),
      }))
  );
}
