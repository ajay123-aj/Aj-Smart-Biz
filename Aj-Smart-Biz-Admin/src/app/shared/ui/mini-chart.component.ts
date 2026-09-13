import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** One column of the chart: what it is called, and what it is worth. */
export interface ChartPoint {
  /** The x value — a `YYYY-MM-DD` day, or any short label. */
  label: string;
  value: number;
  /** A second series drawn behind the first, where there is one. */
  compare?: number;
}

/**
 * A small bar chart, drawn as SVG.
 *
 * **No chart library**, and that is a decision rather than an omission. This
 * console has four dependencies and three of them are Angular; adding a charting
 * package for two screens would be the largest thing in the bundle by some
 * margin, and it would arrive with its own theming system to fight with the one
 * in `styles.css`. What is actually needed here is a row of rectangles with a
 * baseline, which is forty lines of SVG and inherits the console's colours for
 * free.
 *
 * ### What it refuses to do
 *
 * **It never invents a point.** The API gap-fills its series — every day in the
 * window arrives, with zeroes where nothing happened — so this draws exactly what
 * it is given. A chart that filled its own gaps would be a chart that has to know
 * the tenant's timezone and the window's arithmetic, and there are three consoles
 * that would each have to get it right.
 *
 * **It does not start the axis anywhere but zero.** Bars whose baseline is the
 * minimum value make a 3% change look like a collapse, which is the single most
 * common way a chart lies. The tallest bar is the maximum and the floor is zero,
 * always.
 *
 * **An all-zero series draws a flat floor rather than nothing.** A quiet
 * fortnight is information; an empty frame reads as a chart that failed to load.
 */
@Component({
  selector: 'app-mini-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart">
      @if (title()) {
        <figcaption class="chart-head">
          <span class="chart-title">{{ title() }}</span>
          @if (peakLabel(); as peak) {
            <span class="chart-peak">Best: {{ peak }}</span>
          }
        </figcaption>
      }

      <!--
        preserveAspectRatio="none" with a viewBox in abstract units: the bars
        stretch to whatever width the card happens to be, which is what makes one
        component work in a full-width card and a half-width one without being
        told which it is in.
      -->
      <svg
        class="chart-svg"
        [attr.viewBox]="'0 0 ' + width() + ' 100'"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="summary()"
      >
        <!-- The floor. Drawn first so bars sit on it rather than over it. -->
        <line x1="0" y1="99.5" [attr.x2]="width()" y2="99.5" class="chart-axis" />

        @for (bar of bars(); track bar.label) {
          <rect
            [attr.x]="bar.x"
            [attr.y]="bar.y"
            [attr.width]="bar.width"
            [attr.height]="bar.height"
            class="chart-bar"
            [class.chart-bar-peak]="bar.peak"
          >
            <!-- The only affordance this needs. A tooltip on a bar is what
                 somebody reaches for, and the SVG title element is the one the
                 browser and the screen reader both already understand. -->
            <title>{{ bar.label }}: {{ bar.text }}</title>
          </rect>
        }
      </svg>

      <!--
        Two labels, not twenty. A thirty-day series cannot print a date per bar
        at this size, and a row of overlapping text is worse than none — the ends
        are what somebody actually reads off a sparkline.
      -->
      @if (bars().length > 1) {
        <div class="chart-foot">
          <span>{{ firstLabel() }}</span>
          <span>{{ lastLabel() }}</span>
        </div>
      }
    </figure>
  `,
  styles: [
    `
      :host { display: block; }

      .chart { margin: 0; }
      .chart-head {
        display: flex; align-items: baseline; justify-content: space-between;
        gap: 8px; margin-bottom: 8px;
      }
      .chart-title { font-size: 12.5px; font-weight: 600; color: var(--text-2); }
      .chart-peak { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }

      .chart-svg { display: block; width: 100%; height: 110px; overflow: visible; }

      .chart-axis { stroke: var(--border); stroke-width: 1; vector-effect: non-scaling-stroke; }

      .chart-bar { fill: var(--brand-600); opacity: .32; transition: opacity .15s ease; }
      .chart-bar:hover { opacity: .75; }
      /* The tallest one, so the eye lands on the busiest day without reading. */
      .chart-bar-peak { opacity: .78; }

      .chart-foot {
        display: flex; justify-content: space-between;
        margin-top: 6px; font-size: 11px; color: var(--text-3);
      }
    `,
  ],
})
export class MiniChartComponent {
  readonly points = input<ChartPoint[]>([]);
  readonly title = input<string>('');
  /** How each value should read in the tooltip — money, or a plain count. */
  readonly format = input<'number' | 'money'>('number');
  readonly currency = input<string>('INR');

  /**
   * The viewBox width, one unit per point.
   *
   * Abstract rather than pixels: the SVG stretches to the card, so what this
   * controls is the *proportion* of a bar to its gap rather than any real size.
   */
  readonly width = computed(() => Math.max(1, this.points().length) * 10);

  private readonly max = computed(() =>
    this.points().reduce((top, point) => Math.max(top, point.value), 0)
  );

  readonly bars = computed(() => {
    const points = this.points();
    const max = this.max();

    return points.map((point, index) => {
      /**
       * A floor of 2 units on any non-zero value.
       *
       * Without it, a day with one order next to a day with four hundred draws as
       * nothing at all — and "nothing happened" and "something small happened"
       * are different facts. A real zero still draws nothing, which is the
       * distinction worth keeping.
       */
      const scaled = max > 0 && point.value > 0 ? Math.max(2, (point.value / max) * 96) : 0;

      return {
        label: this.labelOf(point.label),
        text: this.textOf(point.value),
        x: index * 10 + 1.2,
        width: 7.6,
        y: 99 - scaled,
        height: scaled,
        peak: max > 0 && point.value === max,
      };
    });
  });

  readonly firstLabel = computed(() => this.labelOf(this.points()[0]?.label ?? ''));
  readonly lastLabel = computed(() => this.labelOf(this.points()[this.points().length - 1]?.label ?? ''));

  readonly peakLabel = computed(() => (this.max() > 0 ? this.textOf(this.max()) : null));

  /**
   * What the whole chart says, in one sentence.
   *
   * The chart is an `img` to assistive technology and this is its alt text: a
   * bar-by-bar reading of thirty days is not useful to anybody, and a chart with
   * no label at all is invisible.
   */
  readonly summary = computed(() => {
    const points = this.points();
    if (!points.length) return 'No data';

    const total = points.reduce((sum, point) => sum + point.value, 0);
    return `${this.title() || 'Series'}: ${this.textOf(total)} across ${points.length} days, peaking at ${this.textOf(
      this.max()
    )}`;
  });

  /** `2026-09-12` reads as `12 Sep` on an axis. Anything else is left alone. */
  private labelOf(label: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;

    const date = new Date(`${label}T00:00:00`);
    if (Number.isNaN(date.getTime())) return label;

    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private textOf(value: number): string {
    if (this.format() !== 'money') return new Intl.NumberFormat().format(value);

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: this.currency() || 'INR',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      /* An unrecognised currency on one tenant's profile must not take the
         chart down with it. */
      return new Intl.NumberFormat().format(value);
    }
  }
}
