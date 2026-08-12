import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Aj Smart Biz',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · Aj Smart Biz',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'companies',
        title: 'Company Management · Aj Smart Biz',
        loadComponent: () => import('./features/companies/company-list.component').then((m) => m.CompanyListComponent),
      },
      {
        path: 'companies/new',
        title: 'Create Company · Aj Smart Biz',
        loadComponent: () => import('./features/companies/company-form.component').then((m) => m.CompanyFormComponent),
      },
      {
        path: 'companies/:id',
        title: 'Company Details · Aj Smart Biz',
        loadComponent: () =>
          import('./features/companies/company-detail.component').then((m) => m.CompanyDetailComponent),
      },
      {
        path: 'companies/:id/edit',
        title: 'Edit Company · Aj Smart Biz',
        loadComponent: () => import('./features/companies/company-form.component').then((m) => m.CompanyFormComponent),
      },
      {
        path: 'plans',
        title: 'Plan Management · Aj Smart Biz',
        loadComponent: () => import('./features/plans/plan-list.component').then((m) => m.PlanListComponent),
      },
      {
        path: 'subscriptions',
        title: 'Company Plans · Aj Smart Biz',
        loadComponent: () =>
          import('./features/subscriptions/subscription-list.component').then((m) => m.SubscriptionListComponent),
      },
      {
        path: 'subscriptions/:id',
        title: 'Subscription Details · Aj Smart Biz',
        loadComponent: () =>
          import('./features/subscriptions/subscription-detail.component').then((m) => m.SubscriptionDetailComponent),
      },
      {
        path: 'super-admins',
        title: 'Super Admin Management · Aj Smart Biz',
        loadComponent: () =>
          import('./features/super-admins/super-admin-list.component').then((m) => m.SuperAdminListComponent),
      },
      {
        path: 'states',
        title: 'State Management · Aj Smart Biz',
        loadComponent: () => import('./features/masters/state-list.component').then((m) => m.StateListComponent),
      },
      {
        path: 'business-types',
        title: 'Business Type Management · Aj Smart Biz',
        loadComponent: () =>
          import('./features/masters/business-type-list.component').then((m) => m.BusinessTypeListComponent),
      },
      {
        path: 'themes',
        title: 'Theme Management · Aj Smart Biz',
        loadComponent: () => import('./features/masters/theme-list.component').then((m) => m.ThemeListComponent),
      },
      {
        path: 'profile',
        title: 'My Profile · Aj Smart Biz',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
