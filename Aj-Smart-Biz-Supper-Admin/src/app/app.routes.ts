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
      /**
       * Lead management across every tenant. `analytics` is declared before
       * `:id`, or the router would match it as a lead id.
       */
      /**
       * Every customer on the platform, across every tenant.
       *
       * Read only, and deliberately: the operator needs to answer "does this
       * account exist and whose is it" for support, and "is this feature being
       * used" for the product. Barring somebody is the tenant's own decision.
       */
      {
        path: 'customers',
        title: 'Customers · Aj Smart Biz',
        loadComponent: () =>
          import('./features/customers/platform-customer-list.component').then(
            (m) => m.PlatformCustomerListComponent
          ),
      },
      {
        path: 'leads',
        title: 'Lead Management · Aj Smart Biz',
        loadComponent: () => import('./features/leads/lead-list.component').then((m) => m.SuperLeadListComponent),
      },
      {
        path: 'leads/analytics',
        title: 'Lead Analysis · Aj Smart Biz',
        loadComponent: () =>
          import('./features/leads/lead-analytics.component').then((m) => m.SuperLeadAnalyticsComponent),
      },
      {
        path: 'leads/:id',
        title: 'Lead Details · Aj Smart Biz',
        loadComponent: () => import('./features/leads/lead-detail.component').then((m) => m.SuperLeadDetailComponent),
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
