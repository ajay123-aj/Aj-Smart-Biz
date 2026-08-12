import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { BrandingService } from './services/branding.service';

/**
 * Composes the tab title as `Page · Company`, e.g. "Admin Management · Acme Retail".
 *
 * Without this the router would set the route's own title on every navigation
 * and wipe out the company name that BrandingService applied, so the tenant's
 * identity would only survive on the very first page.
 */
@Injectable({ providedIn: 'root' })
export class CompanyTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly branding = inject(BrandingService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    const company = this.branding.branding();
    const suffix = company.resolved ? company.name : 'Aj Smart Biz';
    this.title.setTitle(page ? `${page} · ${suffix}` : suffix);
  }
}
