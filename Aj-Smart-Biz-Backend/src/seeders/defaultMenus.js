'use strict';

const { FUNCTIONALITY } = require('../constants');

/**
 * System menus (company_id = NULL) shared by every tenant. They drive the
 * Aj-Smart-Biz-Admin sidebar and the role permission matrix. Companies may add
 * their own menus on top; those carry their own company_id.
 *
 * `parent` names another entry's slug. The seeder resolves it to `parent_id`
 * after the rows exist, so order in this file does not matter.
 */
const menus = [
  { name: 'Dashboard', slug: 'dashboard', icon: 'grid', route: '/dashboard', sequence: 1 },
  { name: 'Company Details', slug: 'company-details', icon: 'building', route: '/company', sequence: 2 },
  /**
   * The tenant's own read-only view of the plan it is on: what is active, how
   * long it has left, what the limits are and what has been paid. Plans are
   * sold and changed by the platform, so this menu grants no write actions.
   */
  { name: 'My Plan', slug: 'my-plan', icon: 'credit-card', route: '/plan', sequence: 3 },
  /**
   * Everyone who has opened the company's public website, one row per device.
   *
   * A top-level menu rather than a child of Company Details: that section is
   * the company describing itself, and this is the company reading about other
   * people. Different screen, different staff, different permission.
   *
   * Its own sequence puts it above the administration menus, because a sales
   * team opens it daily and nobody opens Role Management twice.
   */
  { name: 'Lead Management', slug: 'lead-management', icon: 'target', route: '/leads', sequence: 4 },
  { name: 'Role Management', slug: 'role-management', icon: 'shield', route: '/roles', sequence: 5 },
  { name: 'Menu Permission', slug: 'menu-permission', icon: 'list-checks', route: '/menu-permissions', sequence: 6 },
  { name: 'Admin Management', slug: 'admin-management', icon: 'users', route: '/admins', sequence: 7 },

  /* ------------------------------------------------------------------ *
   * Company Details submenus
   *
   * These were tabs on one screen. They are their own sidebar entries now,
   * nested under Company Details, so a tenant can reach any of them in one
   * click and land on a URL worth bookmarking.
   * ------------------------------------------------------------------ */
  { name: 'Company profile', slug: 'company-profile', icon: 'building', route: '/company/profile', sequence: 21, parent: 'company-details' },
  /**
   * Branches keep their own slug and therefore their own permission row: a role
   * can already be denied branch access while keeping the rest of Company
   * Details, and moving the screen into the sidebar must not quietly undo that.
   */
  { name: 'Branches', slug: 'branch-management', icon: 'map-pin', route: '/company/branches', sequence: 22, parent: 'company-details' },
  { name: 'Domains', slug: 'company-domains', icon: 'globe', route: '/company/domains', sequence: 23, parent: 'company-details' },
  { name: 'Functionality', slug: 'company-functionality', icon: 'toggle-right', route: '/company/functionality', sequence: 24, parent: 'company-details' },
  /**
   * Hero slides for the company's public website. Branch-aware like the rest of
   * the section, and grantable on its own — same rule as Branches.
   */
  { name: 'Slider', slug: 'slider-management', icon: 'film', route: '/company/sliders', sequence: 25, parent: 'company-details' },
  { name: 'About us', slug: 'company-about', icon: 'file-text', route: '/company/about', sequence: 26, parent: 'company-details' },
  /**
   * The band of figures, and the words above it. Its own entry rather than a
   * block on the About screen: it is its own functionality now, sold and
   * switched on separately, and a tenant whose plan carries one of the two but
   * not the other must not find it half-hidden inside the other's page.
   */
  { name: 'Figures', slug: 'company-figures', icon: 'bar-chart-3', route: '/company/figures', sequence: 27, parent: 'company-details' },
  { name: 'Team', slug: 'company-team', icon: 'users', route: '/company/team', sequence: 28, parent: 'company-details' },
  { name: 'Gallery', slug: 'company-gallery', icon: 'image', route: '/company/gallery', sequence: 29, parent: 'company-details' },
  { name: 'Contact page', slug: 'company-contact', icon: 'mail', route: '/company/contact', sequence: 30, parent: 'company-details' },
  { name: 'Features / Benefits', slug: 'company-features', icon: 'sparkles', route: '/company/features', sequence: 31, parent: 'company-details' },
  /**
   * Customer reviews. Unlike the rest of the section this screen is a queue as
   * well as an editor — a review a stranger wrote sits here until someone
   * approves it — which is why it is worth its own entry rather than a tab.
   */
  { name: 'Testimonials', slug: 'company-testimonials', icon: 'quote', route: '/company/testimonials', sequence: 32, parent: 'company-details' },
  { name: 'Plan & billing', slug: 'company-subscription', icon: 'credit-card', route: '/company/subscription', sequence: 33, parent: 'company-details' },
];

/**
 * Submenus that are not grantable in their own right: they are parts of one
 * screen, governed by the permission on their parent.
 *
 * A role that can view Company Details can view all of them; a role that
 * cannot, sees none. They are therefore left out of the permission matrix, and
 * `/auth/me` resolves their visibility from the parent.
 *
 * `branch-management` is deliberately absent from this list. It has its own
 * permission row and always has, so it keeps deciding for itself.
 */
const MENU_INHERITS_PARENT = new Set([
  'company-profile',
  'company-domains',
  'company-functionality',
  'company-about',
  'company-figures',
  'company-team',
  'company-gallery',
  'company-contact',
  'company-features',
  'company-testimonials',
  'company-subscription',
]);

/**
 * Submenus that exist only because the plan pays for them.
 *
 * A tenant whose plan does not include About us has nothing to write there, so
 * the entry is left out of the sidebar rather than shown leading to a locked
 * editor. Being switched **off** is not the same thing and does not hide it:
 * that is the tenant's own choice, made on the Functionality screen, and they
 * need the way back to what they wrote.
 *
 * Only the entries listed here can disappear. Company profile, Branches,
 * Domains, Functionality, Slider and Plan & billing are part of every plan.
 */
const MENU_FUNCTIONALITY = {
  'company-about': FUNCTIONALITY.ABOUT_US,
  'company-figures': FUNCTIONALITY.FIGURES,
  'company-team': FUNCTIONALITY.TEAM,
  'company-gallery': FUNCTIONALITY.GALLERY,
  'company-contact': FUNCTIONALITY.CONTACT_PAGE,
  'company-testimonials': FUNCTIONALITY.TESTIMONIALS,
  'company-features': FUNCTIONALITY.FEATURES,
};

module.exports = { menus, MENU_INHERITS_PARENT, MENU_FUNCTIONALITY };
