import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../core/services/auth.service';
import { PermissionAction } from '../core/models/domain.model';

/**
 * Structural directive that renders its content only when the signed-in admin
 * holds the permission:
 *
 *   <button *appCan="'admin-management'; action: 'canCreate'">Add admin</button>
 */
@Directive({ selector: '[appCan]' })
export class CanDirective {
  readonly appCan = input.required<string>();
  readonly appCanAction = input<PermissionAction>('canView');

  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private rendered = false;

  constructor() {
    effect(() => {
      const allowed = this.auth.can(this.appCan(), this.appCanAction());
      if (allowed && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}
