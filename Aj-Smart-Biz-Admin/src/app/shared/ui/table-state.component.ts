import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Renders the loading skeleton / empty state that every table needs, so list
 * templates only describe their own rows.
 */
@Component({
  selector: 'app-table-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './table-state.component.html',
})
export class TableStateComponent {
  readonly loading = input(false);
  readonly empty = input(false);
  readonly icon = input('📭');
  readonly title = input('Nothing here yet');
  readonly message = input('Try adjusting your filters, or create the first record.');

  readonly skeletonRows = [1, 2, 3, 4, 5];
}
