import { Injectable } from '@angular/core';

/**
 * The super admin console is the platform itself, not a tenant, so it always
 * wears the Aj Smart Biz mark. The favicon is an inline SVG rather than a file,
 * so it needs no asset and renders crisply at every size.
 *
 * A distinct accent from the tenant console makes it obvious at a glance which
 * of the two a browser tab belongs to.
 */
const PLATFORM_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
       <rect width="64" height="64" rx="14" fill="#1d4ed8"/>
       <text x="32" y="43" font-family="Segoe UI,system-ui,sans-serif" font-size="30"
             font-weight="700" fill="#fff" text-anchor="middle">AJ</text>
     </svg>`
  );

@Injectable({ providedIn: 'root' })
export class BrandingService {
  /** Called once at bootstrap so every page carries the mark, not just one. */
  apply(): void {
    this.setFavicon(PLATFORM_FAVICON);
  }

  /** Swaps the <link rel="icon">, adding one if the page has none. */
  setFavicon(href: string): void {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.removeAttribute('type');
    link.href = href;
  }
}
