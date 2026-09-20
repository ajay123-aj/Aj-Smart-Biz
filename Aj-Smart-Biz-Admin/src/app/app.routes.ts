import { Routes } from '@angular/router';
import { authGuard, guestGuard, passwordChangeGuard, permissionGuard } from './core/guards/auth.guard';

/**
 * Titles are the page name only — `CompanyTitleStrategy` appends the signed-in
 * company, so tabs read "Admin Management · Acme Retail".
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    // authGuard also primes the permission map that permissionGuard reads.
    canActivate: [authGuard],
    canActivateChild: [passwordChangeGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      /**
       * One branch, full screen. Declared before the `company` section so it
       * matches first: `company/branches` is a child route there now, and a
       * child cannot consume the trailing `/:id`.
       */
      {
        path: 'company/branches/:id',
        canActivate: [permissionGuard('branch-management')],
        title: 'Branch',
        loadComponent: () => import('./features/company/branch-detail.component').then((m) => m.BranchDetailComponent),
      },
      /**
       * Company Details is a section, not a screen. Its parts were tabs and are
       * sidebar entries now, so each one is a route worth bookmarking and
       * linking to. The layout above them loads the company once for all of
       * them; `permissionGuard` on the parent covers every child, which is
       * exactly the rule the submenus follow in the sidebar.
       */
      {
        path: 'company',
        canActivate: [permissionGuard('company-details')],
        loadComponent: () =>
          import('./features/company/company-layout.component').then((m) => m.CompanyLayoutComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          {
            path: 'profile',
            title: 'Company profile',
            loadComponent: () =>
              import('./features/company/company-profile.component').then((m) => m.CompanyProfileComponent),
          },
          {
            path: 'branches',
            // Branches keeps the permission it has always had, on top of the
            // parent's: a role can be given Company Details without it.
            canActivate: [permissionGuard('branch-management')],
            title: 'Branches',
            loadComponent: () =>
              import('./features/company/branch-manager.component').then((m) => m.BranchManagerComponent),
          },
          {
            path: 'domains',
            title: 'Domains',
            loadComponent: () =>
              import('./features/company/company-domains.component').then((m) => m.CompanyDomainsComponent),
          },
          {
            /*
             * The colours the company's own website is painted with.
             *
             * Beside Domains and Functionality because it is the same kind of
             * thing: a setting that governs the whole site rather than a page
             * somebody writes. No permission of its own — the parent's
             * `company-details` covers it, matching `MENU_INHERITS_PARENT` in
             * the API's menu seed.
             */
            path: 'theme',
            title: 'Website theme',
            loadComponent: () =>
              import('./features/company/theme-manager.component').then((m) => m.ThemeManagerComponent),
          },
          {
            path: 'functionality',
            title: 'Functionality',
            loadComponent: () =>
              import('./features/company/functionality-manager.component').then(
                (m) => m.FunctionalityManagerComponent
              ),
          },
          {
            path: 'sliders',
            // Grantable on its own, like Branches.
            canActivate: [permissionGuard('slider-management')],
            title: 'Slider',
            loadComponent: () =>
              import('./features/sliders/slider-list.component').then((m) => m.SliderListComponent),
          },
          {
            path: 'services',
            title: 'Services',
            loadComponent: () =>
              import('./features/company/services-manager.component').then(
                (m) => m.ServicesManagerComponent
              ),
          },
          /**
           * How those services are sorted. Its own screen for the reason
           * Categories is one next to Products: the taxonomy is set up once and
           * touched when the business takes on a new line, and the services
           * themselves change every month.
           */
          {
            path: 'service-categories',
            title: 'Service categories',
            loadComponent: () =>
              import('./features/company/service-categories-manager.component').then(
                (m) => m.ServiceCategoriesManagerComponent
              ),
          },
          /**
           * The catalogue, as two screens. Categories first, because a product
           * needs one to be filed in and that is the order a tenant setting up
           * will do them in.
           */
          {
            path: 'categories',
            title: 'Categories',
            loadComponent: () =>
              import('./features/company/categories-manager.component').then(
                (m) => m.CategoriesManagerComponent
              ),
          },
          {
            path: 'products',
            title: 'Products',
            loadComponent: () =>
              import('./features/company/products-manager.component').then(
                (m) => m.ProductsManagerComponent
              ),
          },
          /**
           * The counter, under the shop window. Its own screen rather than a
           * block on Products, because it is sold separately and answers a
           * different question: not what the company sells, but whether a
           * stranger may buy any of it unattended and where the money goes.
           */
          {
            path: 'orders',
            title: 'Cart & orders',
            loadComponent: () =>
              import('./features/company/orders-manager.component').then(
                (m) => m.OrdersManagerComponent
              ),
          },
          /**
           * The blog. Its own screen rather than a block on About us: that page
           * is written once, and this is the one thing in the section a tenant
           * is expected to come back and add to.
           */
          {
            path: 'blog',
            title: 'Blog',
            loadComponent: () =>
              import('./features/company/blog-manager.component').then((m) => m.BlogManagerComponent),
          },
          {
            path: 'about',
            title: 'About us',
            loadComponent: () =>
              import('./features/company/about-manager.component').then((m) => m.AboutManagerComponent),
          },
          {
            path: 'figures',
            title: 'Figures',
            loadComponent: () =>
              import('./features/company/figures-manager.component').then(
                (m) => m.FiguresManagerComponent
              ),
          },
          {
            path: 'social',
            title: 'Social links',
            loadComponent: () =>
              import('./features/company/social-manager.component').then(
                (m) => m.SocialManagerComponent
              ),
          },
          {
            path: 'team',
            title: 'Team',
            loadComponent: () =>
              import('./features/company/team-manager.component').then((m) => m.TeamManagerComponent),
          },
          {
            path: 'gallery',
            title: 'Gallery',
            loadComponent: () =>
              import('./features/company/gallery-manager.component').then((m) => m.GalleryManagerComponent),
          },
          {
            path: 'contact',
            title: 'Contact page',
            loadComponent: () =>
              import('./features/company/contact-manager.component').then((m) => m.ContactManagerComponent),
          },
          {
            path: 'features',
            title: 'Features / Benefits',
            loadComponent: () =>
              import('./features/company/features-manager.component').then(
                (m) => m.FeaturesManagerComponent
              ),
          },
          {
            path: 'testimonials',
            title: 'Testimonials',
            loadComponent: () =>
              import('./features/company/testimonials-manager.component').then(
                (m) => m.TestimonialsManagerComponent
              ),
          },
          {
            path: 'subscription',
            title: 'Plan & billing',
            loadComponent: () =>
              import('./features/company/company-subscription.component').then(
                (m) => m.CompanySubscriptionComponent
              ),
          },
        ],
      },
      {
        path: 'plan',
        canActivate: [permissionGuard('my-plan')],
        title: 'My Plan',
        loadComponent: () => import('./features/plan/my-plan.component').then((m) => m.MyPlanComponent),
      },
      /**
       * Lead management. `analytics` is declared before `:id`, or the router
       * would match it as a lead id and the detail screen would ask the API for
       * a lead called "analytics".
       */
      {
        path: 'leads',
        canActivate: [permissionGuard('lead-management')],
        title: 'Lead Management',
        loadComponent: () => import('./features/leads/lead-list.component').then((m) => m.LeadListComponent),
      },
      /**
       * The enquiry queue. Its own menu and its own permission, like Lead
       * Management above it — the two are read by the same person but one is
       * traffic and the other is people who asked to be rung.
       */
      {
        path: 'service-leads',
        canActivate: [permissionGuard('service-leads')],
        title: 'Service Leads',
        loadComponent: () =>
          import('./features/service-leads/service-lead-list.component').then((m) => m.ServiceLeadListComponent),
      },
      /**
       * The order book, and what it adds up to.
       *
       * One route rather than two, unlike Lead Management and its analysis
       * screen: the queue and the figures are the same subject at two distances,
       * and "how are we doing" is a question asked *while* working through the
       * morning's orders. A second menu entry for it is one nobody clicks.
       */
      {
        path: 'orders',
        canActivate: [permissionGuard('orders')],
        title: 'Orders',
        loadComponent: () =>
          import('./features/orders/orders-manager.component').then((m) => m.OrdersManagerComponent),
      },
      /**
       * The stockroom. Its own permission, because it is its own job — one
       * screen is a queue of customers and the other is a count of boxes, and a
       * shop with a stockroom staffed separately has to be able to grant one
       * without the other.
       */
      {
        path: 'warehouse',
        canActivate: [permissionGuard('warehouse')],
        title: 'Warehouse',
        loadComponent: () =>
          import('./features/warehouse/warehouse-manager.component').then((m) => m.WarehouseManagerComponent),
      },
      /**
       * The people who buy. Its own permission, because a shop can reasonably let
       * staff work the order queue without handing them the whole customer list
       * and everyone's phone number.
       */
      {
        path: 'customers',
        canActivate: [permissionGuard('customers')],
        title: 'Customers',
        loadComponent: () =>
          import('./features/customers/customer-list.component').then((m) => m.CustomerListComponent),
      },
      {
        path: 'leads/analytics',
        canActivate: [permissionGuard('lead-management')],
        title: 'Lead analysis',
        loadComponent: () =>
          import('./features/leads/lead-analytics.component').then((m) => m.LeadAnalyticsComponent),
      },
      {
        path: 'leads/:id',
        canActivate: [permissionGuard('lead-management')],
        title: 'Lead',
        loadComponent: () => import('./features/leads/lead-detail.component').then((m) => m.LeadDetailComponent),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard('role-management')],
        title: 'Role Management',
        loadComponent: () => import('./features/roles/role-list.component').then((m) => m.RoleListComponent),
      },
      {
        path: 'menu-permissions',
        canActivate: [permissionGuard('menu-permission')],
        title: 'Menu Permission',
        loadComponent: () =>
          import('./features/permissions/menu-permission.component').then((m) => m.MenuPermissionComponent),
      },
      {
        path: 'admins',
        canActivate: [permissionGuard('admin-management')],
        title: 'Admin Management',
        loadComponent: () => import('./features/admins/admin-list.component').then((m) => m.AdminListComponent),
      },
      // Slides moved into Company Details with the rest of the website content;
      // the old path still works for anyone who bookmarked it.
      { path: 'sliders', pathMatch: 'full', redirectTo: 'company/sliders' },
      {
        path: 'profile',
        title: 'My Profile',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
