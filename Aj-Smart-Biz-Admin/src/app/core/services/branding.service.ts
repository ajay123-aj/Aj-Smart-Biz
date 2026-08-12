import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { UploadService } from './upload.service';

export interface CompanyBranding {
  /** False when the host matched no tenant — the platform defaults are returned. */
  resolved: boolean;
  host: string;
  code?: string;
  name: string;
  description: string | null;
  logo: string | null;
  favicon: string | null;
  branch?: { id: number; name: string; code: string } | null;
  theme?: { primaryColor: string; secondaryColor: string; accentColor: string | null; mode: string } | null;
}

const CACHE_KEY = `${environment.storagePrefix}company`;

/** Used until a tenant is known, and again after signing out. */
const PLATFORM_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
       <rect width="64" height="64" rx="14" fill="#2563eb"/>
       <text x="32" y="43" font-family="Segoe UI,system-ui,sans-serif" font-size="30"
             font-weight="700" fill="#fff" text-anchor="middle">AJ</text>
     </svg>`
  );

const FALLBACK: CompanyBranding = {
  resolved: false,
  host: '',
  name: 'Aj Smart Biz',
  description: 'Sign in to your company workspace.',
  logo: null,
  favicon: null,
};

/**
 * Owns the tenant's identity on the page: logo, name, description, tab title and
 * favicon.
 *
 * The resolved company is cached in localStorage, so a hard refresh of any deep
 * link paints the right favicon and title immediately rather than after
 * `/auth/me` returns. The cache is a presentation detail only — nothing is
 * trusted from it, and every response refreshes it.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly http = inject(HttpClient);
  private readonly uploads = inject(UploadService);

  readonly branding = signal<CompanyBranding>(readCache() ?? FALLBACK);
  readonly loading = signal(false);

  readonly logoUrl = computed(() => this.uploads.toUrl(this.branding().logo));
  readonly faviconUrl = computed(() => this.uploads.toUrl(this.branding().favicon));

  /**
   * Applies whatever is cached, synchronously, before any request goes out.
   * Called once at bootstrap so every page starts correctly branded.
   */
  restore(): void {
    const cached = readCache();
    if (cached) this.apply(cached);
    else this.setFavicon(PLATFORM_FAVICON);
  }

  /**
   * On localhost there is no tenant subdomain to read, so `?domain=` (remembered
   * afterwards) lets a developer preview a specific tenant's login screen.
   */
  private resolveHost(): string {
    const override = new URLSearchParams(window.location.search).get('domain');
    if (override) {
      sessionStorage.setItem(`${environment.storagePrefix}domain`, override);
      return override;
    }
    return sessionStorage.getItem(`${environment.storagePrefix}domain`) || window.location.hostname;
  }

  /** Resolves the tenant for this host; used by the login screen. */
  load(): Observable<CompanyBranding> {
    this.loading.set(true);
    return this.http
      .get<ApiResponse<CompanyBranding>>(`${environment.apiUrl}/public/branding`, {
        params: { domain: this.resolveHost() },
      })
      .pipe(
        map((res) => res.data ?? FALLBACK),
        // Branding must never block signing in.
        catchError(() => of(this.branding())),
        tap((data) => {
          this.loading.set(false);

          // An unmapped host — `localhost` in development, or a tenant whose
          // domain has not been configured yet — resolves to nothing. Falling
          // back to platform branding there would blank the login screen of a
          // returning user, so the company this browser last used is kept.
          const cached = this.branding();
          if (!data.resolved && cached.resolved) {
            this.apply(cached);
            return;
          }
          this.cache(data);
        })
      );
  }

  /**
   * Adopts the signed-in session.
   *
   * Images resolve in order: **the admin's own branch**, then the company, then
   * whatever the host already resolved. The merge matters — a company with no
   * favicon of its own must not wipe out the icon the host resolved, which
   * would drop the tab back to the platform mark right after sign-in.
   */
  applyCompany(
    company: {
      name: string;
      code?: string;
      logo?: string | null;
      favicon?: string | null;
      description?: string | null;
    },
    branch?: { name?: string; logo?: string | null; favicon?: string | null } | null
  ): void {
    const cached = this.branding();
    // Only inherit from the cache when it belongs to this same tenant, so a
    // previous company's icon can never bleed into another one's session.
    const sameTenant = !cached.code || !company.code || cached.code === company.code;
    const current = sameTenant ? cached : FALLBACK;

    this.cache({
      ...current,
      resolved: true,
      code: company.code ?? current.code,
      name: company.name,
      description: company.description ?? current.description ?? null,
      logo: branch?.logo ?? company.logo ?? current.logo ?? null,
      favicon: branch?.favicon ?? company.favicon ?? current.favicon ?? null,
    });
  }

  /** Stores the company for the next page load and applies it now. */
  cache(branding: CompanyBranding): void {
    this.branding.set(branding);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
    } catch {
      // A full or disabled storage must not break the page.
    }
    this.apply(branding);
  }

  /** Drops the cached tenant and returns the page to platform branding. */
  clear(): void {
    localStorage.removeItem(CACHE_KEY);
    this.branding.set(FALLBACK);
    document.title = 'Aj Smart Biz · Company Admin';
    this.setFavicon(PLATFORM_FAVICON);
  }

  /** Applies tab title, favicon and accent colour to the document. */
  apply(branding: CompanyBranding): void {
    document.title = branding.resolved ? `${branding.name} · Aj Smart Biz` : 'Aj Smart Biz · Company Admin';
    this.setFavicon(this.uploads.toUrl(branding.favicon) ?? PLATFORM_FAVICON);

    if (branding.theme?.primaryColor) {
      document.documentElement.style.setProperty('--brand-600', branding.theme.primaryColor);
      if (branding.theme.accentColor) {
        document.documentElement.style.setProperty('--brand-500', branding.theme.accentColor);
      }
    }
  }

  /** Swaps the <link rel="icon">, adding one if the page has none. */
  setFavicon(href: string): void {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    // Drop the type so an .ico and an inline SVG can both be used.
    link.removeAttribute('type');
    link.href = href;
  }
}

function readCache(): CompanyBranding | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CompanyBranding) : null;
  } catch {
    return null;
  }
}
