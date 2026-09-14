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
  /**
   * The people who filled in the enquiry form on a service card.
   *
   * A top-level menu rather than a Company Details submenu, and for the same
   * reason Lead Management is one: that section is the company describing
   * itself, and this is a queue somebody works through. Different screen,
   * different staff, different permission.
   *
   * Directly under Lead Management, because the two are read by the same
   * person on the same morning — and this is the half of it where somebody
   * actually asked to be called.
   */
  { name: 'Service Leads', slug: 'service-leads', icon: 'inbox', route: '/service-leads', sequence: 5 },
  /**
   * What people have actually bought.
   *
   * A top-level menu rather than a Company Details submenu, and for the reason
   * Service Leads is one: that section is the company describing itself, and this
   * is a queue somebody works down. It sits directly under the two inboxes
   * because it is read by the same person on the same morning — and it is the
   * one screen on the platform a shop opens before it opens its door.
   */
  { name: 'Orders', slug: 'orders', icon: 'shopping-bag', route: '/orders', sequence: 6 },
  /**
   * Where the stock is and what has moved.
   *
   * Its own menu rather than a tab of Orders. They are related — dispatching an
   * order is what takes stock off the shelf — but they are different jobs done
   * by different people: one is a queue of customers, the other is a count of
   * boxes. A shop with a stockroom staffed separately needs to be able to grant
   * one without the other, which a tab cannot do.
   */
  { name: 'Warehouse', slug: 'warehouse', icon: 'warehouse', route: '/warehouse', sequence: 7 },
  /**
   * The people who buy, as opposed to the things they bought.
   *
   * Directly under Orders because it is the same conversation from the other
   * end — somebody looking at an order asks who this is, and somebody looking
   * at a customer asks what they have had. Its own menu rather than a tab of
   * Orders, though: a shop can reasonably let staff work the order queue without
   * handing them the whole customer list and everyone's phone number.
   */
  { name: 'Customers', slug: 'customers', icon: 'user-round', route: '/customers', sequence: 8 },
  { name: 'Role Management', slug: 'role-management', icon: 'shield', route: '/roles', sequence: 9 },
  { name: 'Menu Permission', slug: 'menu-permission', icon: 'list-checks', route: '/menu-permissions', sequence: 10 },
  { name: 'Admin Management', slug: 'admin-management', icon: 'users', route: '/admins', sequence: 11 },

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
  /**
   * The colours the company's public website is painted with.
   *
   * Beside Domains and Functionality rather than among the content entries
   * below, because it is the same kind of thing they are: a setting that
   * governs the whole site, not a page somebody writes. Which domain it is
   * served on, what it can do, and what it looks like.
   *
   * It edits `companies.theme_config` — the company's **own** colours — and
   * never the shared `themes` catalogue the platform maintains. That
   * distinction is the entire reason this screen exists; see
   * `services/theme.service` in the API.
   */
  { name: 'Website theme', slug: 'company-theme', icon: 'palette', route: '/company/theme', sequence: 24, parent: 'company-details' },
  { name: 'Functionality', slug: 'company-functionality', icon: 'toggle-right', route: '/company/functionality', sequence: 25, parent: 'company-details' },
  /**
   * Hero slides for the company's public website. Branch-aware like the rest of
   * the section, and grantable on its own — same rule as Branches.
   */
  { name: 'Slider', slug: 'slider-management', icon: 'film', route: '/company/sliders', sequence: 26, parent: 'company-details' },
  /**
   * The services the business sells — its own screen because it is its own
   * page on the website, and because a price list is edited by different people
   * and on a different rhythm from the company's story.
   */
  { name: 'Services', slug: 'company-services', icon: 'briefcase', route: '/company/services', sequence: 27, parent: 'company-details' },
  /**
   * The catalogue, as two entries rather than one.
   *
   * Categories and products are edited on different rhythms by different
   * people: the tree is set up once and touched when the business takes on a new
   * line, and the products change every week. One screen carrying both would put
   * a rarely-used tree editor in the way of the thing somebody opens daily.
   *
   * Categories sits first because it is the thing a product needs to exist
   * before it can be filed — and because that is the order a tenant setting up
   * for the first time will do them in.
   */
  /**
   * How a business sorts the work it sells - `Hair`, `Bridal`.
   *
   * Directly under Services, and its own entry for the reason Categories has one
   * beside Products: a taxonomy is set up once and touched when the business
   * takes on a new line, while the price list changes every month. One screen
   * carrying both would put a rarely-used tree editor in the way of the thing
   * somebody opens weekly.
   */
  { name: 'Service categories', slug: 'company-service-categories', icon: 'folder-tree', route: '/company/service-categories', sequence: 28, parent: 'company-details' },
  { name: 'Categories', slug: 'company-categories', icon: 'folder-tree', route: '/company/categories', sequence: 29, parent: 'company-details' },
  { name: 'Products', slug: 'company-products', icon: 'package', route: '/company/products', sequence: 30, parent: 'company-details' },
  /**
   * The counter, under the shop window.
   *
   * Its own screen rather than a block on the Products page, because it is sold
   * separately and answers a different question. Products is the tenant writing
   * down what it sells; this is the tenant deciding whether a stranger can buy
   * any of it unattended, and where the money and the message go when they do.
   * A shop that lists its range and takes orders on the phone has the first and
   * not the second, and must not find the second half-hidden inside it.
   */
  { name: 'Cart & orders', slug: 'company-orders', icon: 'shopping-cart', route: '/company/orders', sequence: 31, parent: 'company-details' },
  /**
   * The blog.
   *
   * Its own screen rather than a block on About us, and the reason is the same
   * one that makes it a separate grant: every other entry in this section is
   * written once and revisited when something changes, and this is the one a
   * tenant is expected to come back to. A screen built for a list of articles
   * has no business being a paragraph box on somebody else's page.
   *
   * Directly after the catalogue and its counter, because that is roughly the
   * order a business sets its site up in: what we sell, how to buy it, then what
   * we have been doing. Everything below it moved down one to make room, which
   * the seeder reconciles on existing installs.
   */
  { name: 'Blog', slug: 'company-blog', icon: 'newspaper', route: '/company/blog', sequence: 32, parent: 'company-details' },
  { name: 'About us', slug: 'company-about', icon: 'file-text', route: '/company/about', sequence: 33, parent: 'company-details' },
  /**
   * The band of figures, and the words above it. Its own entry rather than a
   * block on the About screen: it is its own functionality now, sold and
   * switched on separately, and a tenant whose plan carries one of the two but
   * not the other must not find it half-hidden inside the other's page.
   */
  { name: 'Figures', slug: 'company-figures', icon: 'bar-chart-3', route: '/company/figures', sequence: 34, parent: 'company-details' },
  { name: 'Team', slug: 'company-team', icon: 'users', route: '/company/team', sequence: 35, parent: 'company-details' },
  { name: 'Gallery', slug: 'company-gallery', icon: 'image', route: '/company/gallery', sequence: 36, parent: 'company-details' },
  { name: 'Contact page', slug: 'company-contact', icon: 'mail', route: '/company/contact', sequence: 37, parent: 'company-details' },
  { name: 'Features / Benefits', slug: 'company-features', icon: 'sparkles', route: '/company/features', sequence: 38, parent: 'company-details' },
  /**
   * Customer reviews. Unlike the rest of the section this screen is a queue as
   * well as an editor — a review a stranger wrote sits here until someone
   * approves it — which is why it is worth its own entry rather than a tab.
   */
  { name: 'Testimonials', slug: 'company-testimonials', icon: 'quote', route: '/company/testimonials', sequence: 39, parent: 'company-details' },
  { name: 'Plan & billing', slug: 'company-subscription', icon: 'credit-card', route: '/company/subscription', sequence: 40, parent: 'company-details' },
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
  'company-services',
  'company-service-categories',
  'company-categories',
  'company-products',
  'company-orders',
  'company-blog',
  'company-domains',
  'company-theme',
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
  'company-services': FUNCTIONALITY.SERVICES,
  /* The taxonomy exists because the services do; one grant carries both. */
  'company-service-categories': FUNCTIONALITY.SERVICES,
  /**
   * The inbox exists because something can arrive in it.
   *
   * **Either** grant is enough, and that is the point: an enquiry and a booking
   * are both rows on this screen, and a shop that takes appointments and no
   * questions still has a queue to work through every morning. Gating it on
   * Services alone would show an empty inbox to a tenant selling a price list;
   * gating it on the enquiry alone would hide the diary's own requests from the
   * only screen that can confirm them.
   *
   * Switched **off** is a different thing and keeps the menu — that is the
   * tenant's own choice, and whatever has already been sent to them still has to
   * be reachable.
   */
  'service-leads': [FUNCTIONALITY.SERVICE_ENQUIRY, FUNCTIONALITY.SERVICE_BOOKING],
  /**
   * Both halves of the catalogue come and go together. Categories without
   * Products is a filing system for nothing, and Products without Categories is
   * a screen whose category picker is permanently empty — so one grant carries
   * both, and a tenant without it sees neither entry.
   */
  'company-categories': FUNCTIONALITY.PRODUCTS,
  'company-products': FUNCTIONALITY.PRODUCTS,
  /**
   * The cart's own screen, gated on the cart's own grant. A tenant whose plan
   * carries Products but not Cart & orders keeps the catalogue and never sees
   * this entry — which is the whole shape of the thing: the shop window is one
   * purchase, the counter is another.
   */
  'company-orders': FUNCTIONALITY.ORDERS,
  /**
   * The order book exists because the cart does. A tenant whose plan does not
   * carry Cart & orders has no way for an order to arrive, so the menu is left
   * out rather than shown leading to an empty queue. Switched **off** is a
   * different thing and keeps it — that is the tenant's own choice, and the
   * orders already taken still have to be worked through.
   */
  orders: FUNCTIONALITY.ORDERS,
  /** Sold separately again: the stockroom is its own purchase. */
  warehouse: FUNCTIONALITY.WAREHOUSE,
  /**
   * The customer list exists because the website has a sign-in. A tenant whose
   * plan does not carry Customer accounts has no accounts to look at, so the
   * entry is left out rather than shown leading to an empty list.
   */
  customers: FUNCTIONALITY.CUSTOMERS,
  /**
   * The blog's screen, gated on the blog's own grant. A tenant whose plan does
   * not carry it has nothing to write here, so the entry is left out rather than
   * shown leading to an editor that refuses to save.
   */
  'company-blog': FUNCTIONALITY.BLOG,
  'company-about': FUNCTIONALITY.ABOUT_US,
  'company-figures': FUNCTIONALITY.FIGURES,
  'company-team': FUNCTIONALITY.TEAM,
  'company-gallery': FUNCTIONALITY.GALLERY,
  'company-contact': FUNCTIONALITY.CONTACT_PAGE,
  'company-testimonials': FUNCTIONALITY.TESTIMONIALS,
  'company-features': FUNCTIONALITY.FEATURES,
};

module.exports = { menus, MENU_INHERITS_PARENT, MENU_FUNCTIONALITY };
