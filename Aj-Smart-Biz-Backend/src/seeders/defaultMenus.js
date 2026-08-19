'use strict';

/**
 * System menus (company_id = NULL) shared by every tenant. They drive the
 * Aj-Smart-Biz-Admin sidebar and the role permission matrix. Companies may add
 * their own menus on top; those carry their own company_id.
 */
module.exports = [
  { name: 'Dashboard', slug: 'dashboard', icon: 'grid', route: '/dashboard', sequence: 1 },
  { name: 'Company Details', slug: 'company-details', icon: 'building', route: '/company', sequence: 2 },
  /**
   * The tenant's own read-only view of the plan it is on: what is active, how
   * long it has left, what the limits are and what has been paid. Plans are
   * sold and changed by the platform, so this menu grants no write actions.
   */
  { name: 'My Plan', slug: 'my-plan', icon: 'credit-card', route: '/plan', sequence: 3 },
  /**
   * Branches live on a tab inside Company Details, so this menu has no route of
   * its own and never appears in the sidebar. It stays a menu because roles are
   * still granted branch rights through it in the permission matrix.
   */
  { name: 'Branch Management', slug: 'branch-management', icon: 'map-pin', route: null, sequence: 4 },
  { name: 'Role Management', slug: 'role-management', icon: 'shield', route: '/roles', sequence: 5 },
  { name: 'Menu Permission', slug: 'menu-permission', icon: 'list-checks', route: '/menu-permissions', sequence: 6 },
  { name: 'Admin Management', slug: 'admin-management', icon: 'users', route: '/admins', sequence: 7 },
  /**
   * Hero slides for the company's public website. Branch-aware: a slide may be
   * company-wide or pinned to one branch.
   */
  { name: 'Slider Management', slug: 'slider-management', icon: 'image', route: '/sliders', sequence: 8 },
];
