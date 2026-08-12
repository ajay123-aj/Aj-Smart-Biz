import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type UploadFolder = 'branch' | 'company' | 'avatar' | 'misc';

export interface UploadedFile {
  /** Stored in the database, e.g. `/uploads/branch/abc.png`. */
  path: string;
  /** Absolute URL for rendering right now. */
  url: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

/** Either upload progress or the finished file. */
export type UploadState =
  | { kind: 'progress'; percent: number }
  | { kind: 'done'; file: UploadedFile };

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);

  /**
   * Uploads one image and reports progress; the API validates type and size.
   * `icoOnly` asks the API to accept nothing but a real .ico (it checks the
   * file's magic bytes, not just the name the browser reported).
   */
  upload(file: File, folder: UploadFolder = 'misc', icoOnly = false): Observable<UploadState> {
    const body = new FormData();
    body.append('file', file, file.name);

    return this.http
      .post<ApiResponse<UploadedFile>>(`${environment.apiUrl}/uploads/${folder}`, body, {
        params: icoOnly ? { accept: 'ico' } : {},
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((event: HttpEvent<ApiResponse<UploadedFile>>): UploadState | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            return { kind: 'progress', percent };
          }
          if (event.type === HttpEventType.Response && event.body) {
            return { kind: 'done', file: event.body.data };
          }
          return null;
        }),
        filter((state): state is UploadState => state !== null)
      );
  }

  /** Discards a file that was uploaded but never saved onto a record. */
  remove(path: string): Observable<unknown> {
    return this.http.delete(`${environment.apiUrl}/uploads`, { params: { path } });
  }

  /** Turns a stored path into something an `<img src>` can use. */
  toUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^(https?:|data:|blob:)/.test(path)) return path;
    return `${environment.filesUrl}${path}`;
  }
}
