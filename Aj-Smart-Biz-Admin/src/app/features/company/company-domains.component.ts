import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CompanyContextService } from './company-context.service';
import { DomainManagerComponent } from '../../shared/domain-manager.component';

/**
 * The Domains section.
 *
 * A thin page over the shared domain manager, which is also driven from the
 * super-admin console against a different path. All this adds is the tenant's
 * own base path, the branches a domain may be pinned to, and the main-admin
 * rule — everything the manager cannot work out for itself.
 */
@Component({
  selector: 'app-company-domains',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainManagerComponent],
  template: `
    <div class="card">
      <app-domain-manager
        basePath="/my-company/domains"
        [branches]="ctx.branchOptions()"
        [canEdit]="ctx.canEdit()"
      />
    </div>
  `,
})
export class CompanyDomainsComponent {
  readonly ctx = inject(CompanyContextService);
}
