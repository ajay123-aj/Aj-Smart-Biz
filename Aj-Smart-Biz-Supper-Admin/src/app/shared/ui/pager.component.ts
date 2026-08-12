import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PageMeta } from '../../core/models/api.model';

@Component({
  selector: 'app-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pager.component.html',
})
export class PagerComponent {
  readonly meta = input.required<PageMeta>();
  readonly pageChange = output<number>();
  readonly limitChange = output<number>();

  readonly pageSizes = [10, 25, 50, 100];

  readonly from = computed(() => (this.meta().total === 0 ? 0 : (this.meta().page - 1) * this.meta().limit + 1));
  readonly to = computed(() => Math.min(this.meta().page * this.meta().limit, this.meta().total));

  /** Windowed page list: 1 … 4 5 [6] 7 8 … 20 (-1 renders as an ellipsis). */
  readonly pages = computed<number[]>(() => {
    const { page, totalPages } = this.meta();
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    const result = new Set<number>([1, totalPages, page]);
    for (let offset = 1; offset <= 1; offset++) {
      if (page - offset > 1) result.add(page - offset);
      if (page + offset < totalPages) result.add(page + offset);
    }
    const sorted = [...result].sort((a, b) => a - b);

    const withGaps: number[] = [];
    sorted.forEach((value, index) => {
      if (index > 0 && value - sorted[index - 1] > 1) withGaps.push(-1);
      withGaps.push(value);
    });
    return withGaps;
  });

  onLimit(event: Event): void {
    this.limitChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
