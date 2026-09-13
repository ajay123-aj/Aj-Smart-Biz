import { ChangeDetectionStrategy, Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UploadFolder, UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';

/**
 * Several images against one form control, in an order the tenant sets.
 *
 * `app-image-upload` is the single-image version of this and stays as it is —
 * most things on the platform have one picture. A product does not, and the
 * difference is not just "an array of the other one":
 *
 *  - **Order is meaningful.** The first image is the card image everywhere in
 *    the catalogue, so it needs to be movable, and the first tile says so
 *    plainly rather than leaving the tenant to discover it.
 *  - **Uploads overlap.** Somebody adds six photographs at once, and each has
 *    to show its own progress rather than blocking the next.
 *  - **What to clean up is a set difference.** A file this component uploaded
 *    and the tenant then removed before saving is ours to delete; one that
 *    arrived with the record belongs to the API, which removes it when the
 *    record is updated.
 *
 * The control's value is `string[]` of stored paths, never files.
 *
 *   <app-image-gallery-upload formControlName="images" folder="product" [max]="8" />
 */
@Component({
  selector: 'app-image-gallery-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ImageGalleryUploadComponent), multi: true },
  ],
  template: `
    <div class="gallery" [class.disabled]="disabled()">
      <div class="tiles">
        @for (path of value(); track path; let i = $index; let first = $first; let last = $last) {
          <figure class="tile" [class.tile-primary]="first">
            <img [src]="urlOf(path)" alt="" />

            @if (first) {
              <figcaption class="flag">Main</figcaption>
            }

            <div class="tools">
              <button type="button" title="Move left" [disabled]="first" (click)="move(i, -1)">‹</button>
              <button type="button" title="Move right" [disabled]="last" (click)="move(i, 1)">›</button>
              <button type="button" class="danger" title="Remove" (click)="removeAt(i)">✕</button>
            </div>
          </figure>
        }

        @for (job of uploading(); track job.id) {
          <figure class="tile tile-busy">
            <img [src]="job.preview" alt="" />
            <div class="bar"><span class="bar-fill" [style.width.%]="job.percent"></span></div>
          </figure>
        }

        @if (canAddMore()) {
          <label class="tile dropzone" [class.dragging]="dragging()"
                 (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
            <span class="dz-icon" aria-hidden="true">＋</span>
            <span class="dz-text">Add photos</span>
            <input type="file" [accept]="accept()" multiple hidden [disabled]="disabled()" (change)="onPick($event)" />
          </label>
        }
      </div>

      @if (error(); as message) {
        <p class="err">{{ message }}</p>
      }

      <p class="note">
        {{ value().length }} of {{ max() }} · the first photograph is the one every card in your
        catalogue shows &mdash; drag it to the front with the arrows.
        @if (hint()) {
          <br />{{ hint() }}
        }
      </p>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .gallery.disabled { opacity: .65; pointer-events: none; }

      .tiles { display: flex; flex-wrap: wrap; gap: 10px; }

      .tile {
        position: relative; margin: 0;
        width: 108px; height: 108px;
        border: 1px solid var(--border-strong); border-radius: var(--radius);
        background: var(--surface-2); overflow: hidden;
        display: grid; place-items: center;
      }
      .tile img { width: 100%; height: 100%; object-fit: cover; }

      /* The card image, marked as such — it is a decision, not an accident. */
      .tile-primary { border-color: var(--brand-500); box-shadow: 0 0 0 1px var(--brand-500); }
      .flag {
        position: absolute; top: 4px; left: 4px;
        padding: 1px 6px; border-radius: 999px;
        background: var(--brand-600); color: #fff;
        font-size: 10px; font-weight: 700; letter-spacing: .02em;
      }

      .tools {
        position: absolute; inset: auto 0 0 0;
        display: flex; gap: 2px; padding: 3px;
        background: color-mix(in srgb, var(--surface) 82%, transparent);
        border-top: 1px solid var(--border);
      }
      .tools button {
        flex: 1; border: 0; background: transparent; cursor: pointer;
        font-size: 13px; line-height: 1.4; color: var(--text-2); border-radius: 4px;
      }
      .tools button:hover:not(:disabled) { background: var(--surface-3); }
      .tools button:disabled { opacity: .35; cursor: not-allowed; }
      .tools .danger { color: var(--danger); }

      .tile-busy img { opacity: .45; }
      .bar { position: absolute; inset: auto 6px 6px 6px; height: 5px; background: var(--surface-3); border-radius: 99px; overflow: hidden; }
      .bar-fill { display: block; height: 100%; background: var(--brand-600); transition: width .15s; }

      .dropzone {
        border-style: dashed; cursor: pointer; gap: 2px; align-content: center; text-align: center;
        transition: border-color .15s, background .15s;
      }
      .dropzone:hover, .dropzone.dragging { border-color: var(--brand-500); background: var(--brand-50); }
      :root[data-theme='dark'] .dropzone:hover,
      :root[data-theme='dark'] .dropzone.dragging { background: var(--surface-3); }
      .dz-icon { font-size: 20px; color: var(--text-3); }
      .dz-text { font-size: 11px; font-weight: 600; color: var(--text-2); }

      .err { margin: 8px 0 0; font-size: 12px; color: var(--danger); }
      .note { margin: 8px 0 0; font-size: 11.5px; color: var(--text-3); line-height: 1.5; }
    `,
  ],
})
export class ImageGalleryUploadComponent implements ControlValueAccessor {
  readonly folder = input<UploadFolder>('product');
  /** Matches `PRODUCT_IMAGES_MAX` in the API, which refuses a longer list. */
  readonly max = input(8);
  readonly maxSizeMb = input(4);
  readonly accept = input('image/png,image/jpeg,image/webp');
  readonly hint = input('');

  private readonly uploads = inject(UploadService);

  readonly value = signal<string[]>([]);
  readonly uploading = signal<{ id: number; preview: string; percent: number }[]>([]);
  readonly error = signal<string | null>(null);
  readonly dragging = signal(false);
  readonly disabled = signal(false);

  /**
   * Paths this component uploaded that the form has not saved yet. Removing one
   * of these deletes the file, because nothing else will ever refer to it. A
   * path that arrived through `writeValue` belongs to a saved record and is left
   * alone — the API deletes it when the record is updated.
   */
  private pending = new Set<string>();
  private nextJobId = 1;

  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  canAddMore(): boolean {
    return this.value().length + this.uploading().length < this.max();
  }

  urlOf(path: string): string | null {
    return this.uploads.toUrl(path);
  }

  /* ---------------------- ControlValueAccessor ---------------------- */

  writeValue(value: string[] | null): void {
    this.value.set(Array.isArray(value) ? value.filter(Boolean) : []);
    this.pending.clear();
    this.error.set(null);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  private publish(next: string[]): void {
    this.value.set(next);
    this.onChange(next);
  }

  /* ------------------------------ ordering -------------------------- */

  move(index: number, direction: -1 | 1): void {
    const next = [...this.value()];
    const to = index + direction;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    this.onTouched();
    this.publish(next);
  }

  removeAt(index: number): void {
    const next = [...this.value()];
    const [gone] = next.splice(index, 1);
    this.onTouched();
    this.publish(next);

    if (gone && this.pending.has(gone)) {
      this.pending.delete(gone);
      this.uploads.remove(gone).subscribe({ error: () => undefined });
    }
  }

  /* ------------------------------ picking --------------------------- */

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.accept_(Array.from(event.dataTransfer?.files ?? []));
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Reset so picking the same file twice still fires a change event.
    input.value = '';
    this.accept_(files);
  }

  /**
   * Takes as many of the chosen files as there is room for, and says so when it
   * cannot take them all — silently dropping four of six photographs is the kind
   * of thing somebody discovers on their live website.
   */
  private accept_(files: File[]): void {
    if (!files.length) return;
    this.onTouched();
    this.error.set(null);

    const room = this.max() - this.value().length - this.uploading().length;
    if (room <= 0) {
      this.error.set(`That is the limit — ${this.max()} photographs per product.`);
      return;
    }

    const taking = files.slice(0, room);
    if (files.length > room) {
      this.error.set(`Only ${room} more will fit, so ${files.length - room} were not added.`);
    }

    taking.forEach((file) => this.send(file));
  }

  private send(file: File): void {
    if (file.size > this.maxSizeMb() * 1024 * 1024) {
      this.error.set(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${this.maxSizeMb()} MB.`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.error.set(`${file.name} is not an image.`);
      return;
    }

    const id = this.nextJobId++;
    const preview = URL.createObjectURL(file);
    this.uploading.update((jobs) => [...jobs, { id, preview, percent: 0 }]);

    const finish = () => {
      URL.revokeObjectURL(preview);
      this.uploading.update((jobs) => jobs.filter((job) => job.id !== id));
    };

    this.uploads.upload(file, this.folder()).subscribe({
      next: (state) => {
        if (state.kind === 'progress') {
          this.uploading.update((jobs) =>
            jobs.map((job) => (job.id === id ? { ...job, percent: state.percent } : job))
          );
          return;
        }
        finish();
        this.pending.add(state.file.path);
        this.publish([...this.value(), state.file.path]);
      },
      error: (err: HttpErrorResponse) => {
        finish();
        this.error.set(messageOf(err));
      },
    });
  }
}
