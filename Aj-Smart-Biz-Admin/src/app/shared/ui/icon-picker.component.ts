import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { FeatureIconMeta } from '../../core/models/domain.model';

/**
 * Icon picker wired to a reactive form control. The control's value is the
 * icon's key (`shield`), which is what the API stores and what the website
 * draws.
 *
 *   <app-icon-picker formControlName="icon" [icons]="icons()" />
 *
 * The artwork comes in with the icons rather than being drawn here: the API
 * ships each glyph's paths alongside its name (see `FeatureIconMeta`), so this
 * app never keeps a second copy of the set that could fall out of step with
 * what the website can actually render. A key with no matching icon still shows
 * — labelled, with an empty tile — because a saved row must never disappear
 * from its own form just because the catalogue was slow or has moved on.
 *
 * Grouped and searchable because the library is expected to grow. A flat grid
 * of thirty unlabelled glyphs is a shape, not a choice.
 */
@Component({
  selector: 'app-icon-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IconPickerComponent), multi: true }],
  template: `
    <div class="picker" [class.disabled]="disabled()">
      <!-- What is chosen, in the size it will be seen at, so the choice is
           readable without hunting for the highlighted tile in the grid. -->
      <div class="chosen">
        <span class="chosen-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round">
            @for (d of selectedPaths(); track $index) {
              <path [attr.d]="d" />
            }
          </svg>
        </span>
        <div class="chosen-body">
          <div class="chosen-label">{{ selectedLabel() }}</div>
          <div class="tiny muted">{{ value() || 'No icon chosen' }}</div>
        </div>
        <input
          class="input search"
          type="search"
          placeholder="Search icons…"
          [value]="search()"
          (input)="onSearch($event)"
          [disabled]="disabled()"
        />
      </div>

      @if (icons().length === 0) {
        <p class="tiny muted mb-0">
          The icon library could not be loaded. The card keeps whichever icon it has.
        </p>
      } @else if (groups().length === 0) {
        <p class="tiny muted mb-0">No icon matches “{{ search() }}”.</p>
      } @else {
        <div class="groups">
          @for (group of groups(); track group.name) {
            <div class="group">
              <div class="group-name">{{ group.name }}</div>
              <div class="tiles">
                @for (icon of group.icons; track icon.key) {
                  <button
                    type="button"
                    class="tile"
                    [class.tile-on]="icon.key === value()"
                    [attr.aria-pressed]="icon.key === value()"
                    [title]="icon.label"
                    [disabled]="disabled()"
                    (click)="choose(icon.key)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      @for (d of icon.paths; track $index) {
                        <path [attr.d]="d" />
                      }
                    </svg>
                    <span class="tile-label">{{ icon.label }}</span>
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .picker.disabled { opacity: .65; pointer-events: none; }

      .chosen {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 12px; margin-bottom: 10px;
        border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2);
      }
      .chosen-tile {
        flex: none; width: 44px; height: 44px; display: grid; place-items: center;
        border-radius: 10px; background: var(--surface); border: 1px solid var(--border);
        color: var(--brand-600);
      }
      .chosen-tile svg { width: 24px; height: 24px; }
      .chosen-body { flex: 1; min-width: 0; }
      .chosen-label { font-weight: 600; font-size: 13.5px; }
      .search { width: 190px; flex: none; }

      /* Tall enough to show two groups, so it reads as a list to scroll rather
         than a grid that happens to be cut off. */
      .groups {
        max-height: 268px; overflow-y: auto;
        border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
      }
      .group + .group { margin-top: 12px; }
      .group-name {
        font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
        color: var(--text-3); margin-bottom: 6px;
      }
      .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(74px, 1fr)); gap: 6px; }

      .tile {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        padding: 8px 4px; cursor: pointer;
        border: 1px solid var(--border); border-radius: 9px;
        background: var(--surface); color: var(--text-2);
        transition: border-color .15s, background .15s, color .15s;
      }
      .tile:hover { border-color: var(--brand-500); color: var(--brand-600); }
      .tile svg { width: 22px; height: 22px; }
      .tile-label {
        font-size: 10.5px; line-height: 1.2; text-align: center;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
      }
      .tile-on {
        border-color: var(--brand-600); color: var(--brand-600);
        background: var(--brand-50); font-weight: 600;
      }
      :root[data-theme='dark'] .tile-on { background: var(--surface-3); }
    `,
  ],
})
export class IconPickerComponent implements ControlValueAccessor {
  /** The library, straight from `GET /masters/functionalities`. */
  readonly icons = input<FeatureIconMeta[]>([]);

  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly search = signal('');

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  private readonly selected = computed(() => this.icons().find((icon) => icon.key === this.value()) ?? null);

  readonly selectedPaths = computed(() => this.selected()?.paths ?? []);

  /**
   * The chosen icon's name. Falls back to the raw key so a row carrying a glyph
   * this catalogue no longer lists still says what it is holding.
   */
  readonly selectedLabel = computed(() => this.selected()?.label ?? this.value() ?? 'None');

  /** Grouped as the API grouped them, filtered by the search box. */
  readonly groups = computed(() => {
    const term = this.search().trim().toLowerCase();
    const matches = term
      ? this.icons().filter(
          (icon) =>
            icon.label.toLowerCase().includes(term) ||
            icon.key.toLowerCase().includes(term) ||
            icon.group.toLowerCase().includes(term)
        )
      : this.icons();

    const groups: { name: string; icons: FeatureIconMeta[] }[] = [];
    matches.forEach((icon) => {
      const group = groups.find((entry) => entry.name === icon.group);
      if (group) group.icons.push(icon);
      else groups.push({ name: icon.group, icons: [icon] });
    });
    return groups;
  });

  /* ---------------------- ControlValueAccessor ---------------------- */

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
    // Reopening the picker on the last search would hide most of the library.
    this.search.set('');
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  /* ------------------------------ picking --------------------------- */

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  choose(key: string): void {
    if (this.disabled()) return;
    this.value.set(key);
    this.onChange(key);
    this.onTouched();
  }
}
