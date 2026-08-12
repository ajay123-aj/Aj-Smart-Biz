import { ChangeDetectionStrategy, Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { UploadFolder, UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';

/**
 * Image picker wired to a reactive form control. The control's value is the
 * stored path (`/uploads/branch/abc.png`); the file itself is uploaded as soon
 * as it is chosen, so saving the form only persists a string.
 *
 *   <app-image-upload formControlName="logo" label="Logo" folder="branch" />
 */
@Component({
  selector: 'app-image-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ImageUploadComponent), multi: true },
  ],
  templateUrl: './image-upload.component.html',
  styles: [
    `
      .uploader { display: flex; gap: 12px; align-items: flex-start; }
      .uploader.disabled { opacity: .65; pointer-events: none; }

      .preview, .dropzone {
        width: 92px; height: 92px; flex-shrink: 0;
        border-radius: var(--radius);
        border: 1px dashed var(--border-strong);
        display: grid; place-items: center;
        background: var(--surface-2);
        overflow: hidden;
      }
      .preview { border-style: solid; }
      .preview img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
      .preview-favicon img { padding: 22px; }

      .dropzone { cursor: pointer; text-align: center; padding: 8px; gap: 2px; align-content: center; transition: border-color .15s, background .15s; }
      .dropzone:hover, .dropzone.dragging { border-color: var(--brand-500); background: var(--brand-50); }
      :root[data-theme='dark'] .dropzone:hover,
      :root[data-theme='dark'] .dropzone.dragging { background: var(--surface-3); }
      .dz-icon { font-size: 20px; }
      .dz-text { font-size: 11px; font-weight: 600; color: var(--text-2); line-height: 1.2; }
      .dz-hint { font-size: 10px; color: var(--text-3); }

      .side { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding-top: 4px; }
      .side .btn { cursor: pointer; }
      .side .btn.disabled { cursor: not-allowed; }
      .danger { color: var(--danger); }
      .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }

      .bar { width: 180px; height: 6px; background: var(--surface-3); border-radius: 99px; overflow: hidden; }
      .bar-fill { height: 100%; background: var(--brand-600); transition: width .15s; }
    `,
  ],
})
export class ImageUploadComponent implements ControlValueAccessor {
  readonly label = input('Image');
  readonly folder = input<UploadFolder>('misc');
  readonly accept = input('image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/gif');
  readonly maxSizeMb = input(2);
  /**
   * `favicon` renders the preview smaller, as it would appear in a browser tab,
   * and accepts .ico only — checked here for a fast message and again by the API,
   * which verifies the file's magic bytes.
   */
  readonly variant = input<'logo' | 'favicon'>('logo');
  readonly hint = input('');

  private readonly uploads = inject(UploadService);

  readonly value = signal<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly fileName = signal<string>('');
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  readonly dragging = signal(false);
  readonly disabled = signal(false);

  /**
   * Path this component uploaded but the form has not saved yet. If it is
   * replaced or cleared we delete it, so abandoned uploads do not pile up.
   * A value that arrived via `writeValue` belongs to a saved record and is left
   * to the API, which removes the old file when the record is updated.
   */
  private pendingPath: string | null = null;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** The favicon slot is .ico only. */
  private icoOnly(): boolean {
    return this.variant() === 'favicon';
  }

  acceptAttr(): string {
    return this.icoOnly() ? '.ico,image/x-icon,image/vnd.microsoft.icon' : this.accept();
  }

  hintText(): string {
    if (this.hint()) return this.hint();
    return this.icoOnly()
      ? `.ico only · up to ${this.maxSizeMb()} MB`
      : `PNG, JPG, SVG or ICO · up to ${this.maxSizeMb()} MB`;
  }

  /* ---------------------- ControlValueAccessor ---------------------- */

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
    this.previewUrl.set(this.uploads.toUrl(value));
    this.fileName.set('');
    this.pendingPath = null;
    this.error.set(null);
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

  /* ----------------------------- picking ---------------------------- */

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.handle(file);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so picking the same file twice still fires a change event.
    input.value = '';
    if (file) void this.handle(file);
  }

  private async handle(file: File): Promise<void> {
    this.onTouched();
    this.error.set(null);

    if (file.size > this.maxSizeMb() * 1024 * 1024) {
      this.error.set(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${this.maxSizeMb()} MB.`);
      return;
    }

    if (this.icoOnly()) {
      // The browser's MIME type for .ico is unreliable, so check name then bytes.
      if (!file.name.toLowerCase().endsWith('.ico')) {
        this.error.set('The favicon must be an .ico file.');
        return;
      }
      if (!(await isIcoFile(file))) {
        this.error.set('That file is renamed, not a real .ico icon.');
        return;
      }
    } else if (!file.type.startsWith('image/')) {
      this.error.set('Choose an image file.');
      return;
    }

    // Show the local file immediately; the server URL replaces it when done.
    const localPreview = URL.createObjectURL(file);
    this.previewUrl.set(localPreview);
    this.fileName.set(file.name);
    this.uploading.set(true);
    this.progress.set(0);

    const replacing = this.pendingPath;

    this.uploads.upload(file, this.folder(), this.icoOnly()).subscribe({
      next: (state) => {
        if (state.kind === 'progress') {
          this.progress.set(state.percent);
          return;
        }
        URL.revokeObjectURL(localPreview);
        this.uploading.set(false);
        this.value.set(state.file.path);
        this.previewUrl.set(state.file.url);
        this.pendingPath = state.file.path;
        this.onChange(state.file.path);
        if (replacing) this.uploads.remove(replacing).subscribe({ error: () => undefined });
      },
      error: (err: HttpErrorResponse) => {
        URL.revokeObjectURL(localPreview);
        this.uploading.set(false);
        this.error.set(messageOf(err));
        // Put the previously saved image back.
        this.previewUrl.set(this.uploads.toUrl(this.value()));
        this.fileName.set('');
      },
    });
  }

  clear(): void {
    this.onTouched();
    if (this.pendingPath) {
      this.uploads.remove(this.pendingPath).subscribe({ error: () => undefined });
      this.pendingPath = null;
    }
    this.value.set(null);
    this.previewUrl.set(null);
    this.fileName.set('');
    this.error.set(null);
    this.onChange(null);
  }
}

/**
 * Every ICO file starts with the header `00 00 01 00`. Reading four bytes in the
 * browser rejects a renamed PNG before it is ever sent.
 */
async function isIcoFile(file: File): Promise<boolean> {
  try {
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return header.length === 4 && header[0] === 0 && header[1] === 0 && header[2] === 1 && header[3] === 0;
  } catch {
    // Unreadable here is not proof of anything — let the API decide.
    return true;
  }
}
