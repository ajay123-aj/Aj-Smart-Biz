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
            path: 'about',
            title: 'About us',
            loadComponent: () =>
              import('./features/company/about-manager.component').then((m) => m.AboutManagerComponent),
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
