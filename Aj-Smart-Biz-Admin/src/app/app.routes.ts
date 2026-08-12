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
      {
        path: 'company',
        canActivate: [permissionGuard('company-details')],
        title: 'Company Details',
        loadComponent: () =>
          import('./features/company/company-details.component').then((m) => m.CompanyDetailsComponent),
      },
      {
        path: 'plan',
        canActivate: [permissionGuard('my-plan')],
        title: 'My Plan',
        loadComponent: () => import('./features/plan/my-plan.component').then((m) => m.MyPlanComponent),
      },
      // Branches are a tab on Company Details now; keep the old path working.
      { path: 'company/branches', pathMatch: 'full', redirectTo: 'company' },
      {
        path: 'company/branches/:id',
        canActivate: [permissionGuard('branch-management')],
        title: 'Branch',
        loadComponent: () => import('./features/company/branch-detail.component').then((m) => m.BranchDetailComponent),
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
      {
        path: 'profile',
        title: 'My Profile',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
