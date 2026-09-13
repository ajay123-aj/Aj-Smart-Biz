import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import { EMPTY_META, ListQuery, PageMeta } from '../../core/models/api.model';
import {
  BlogPost,
  BlogSettings,
  BlogState,
  BlogSummary,
  BlogTag,
  Branch,
  Functionality,
} from '../../core/models/domain.model';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ImageUploadComponent } from '../../shared/ui/image-upload.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';

/** The key this whole screen is about. Written once rather than in eight places. */
const KEY = 'blog' as const;

/** Matches `BLOG_TAGS_MAX` in the API, which refuses a longer list. */
const TAGS_MAX = 6;

/** Which slice of the blog the screen is showing. A filter, not a second list. */
type Tab = 'all' | 'live' | 'scheduled' | 'draft' | 'hidden';

/**
 * The Blog screen: what the business has been doing, written up.
 *
 * The second screen in Company Details that **pages**, and for the same reason
 * Products does: every other list in this section is short and edited whole, and
 * these two only ever grow. What makes this one unlike Products is time.
 *
 * ### The four states
 *
 * A post is `live`, `scheduled`, `draft` or `hidden`, and the screen leads with
 * that rather than with a status pill, because it is the question somebody
 * opening this screen actually has. **The API decides which** - it is `status`
 * and `publishedAt` read together, and deriving it here a second time is how the
 * console would come to claim a post is live on a day the website disagrees.
 *
 * ### Publish now, or write it for Thursday
 *
 * The date field is the scheduling feature and the whole of it: a date in the
 * future saves the article complete and invisible until then, with nothing to
 * run and no queue to watch. Leaving it blank keeps a draft. `Publish now` fills
 * in today rather than making somebody type a date the form could work out.
 *
 * ### The address does not move
 *
 * Editing a title never changes the slug. An article's address is what other
 * people have linked to and what a search engine indexed, so the field is shown
 * as a thing that exists rather than hidden, and changing it is a deliberate act
 * with a warning beside it.
 *
 * There is no starting set of posts, deliberately - the same rule Services
 * follows. The platform knows nothing about what a business has been doing, and
 * an invented article is a company publishing something it never wrote.
 */
@Component({
  selector: 'app-blog-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    DatePipe,
    ReactiveFormsModule,
    FeatureGateComponent,
    ModalComponent,
    PagerComponent,
    FieldErrorComponent,
    ImageUploadComponent,
  ],
  templateUrl: './blog-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      /* The strip above the list. "Last posted" is the figure this screen exists
         for: a blog's whole problem is going quiet, and a post count cannot say
         whether that has happened. */
      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 0 0 16px; }
      .kpi { padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); }
      .kpi-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
      .kpi-value { margin-top: 3px; font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .kpi-note { margin-top: 2px; font-size: 11.5px; color: var(--text-3); }
      .kpi-stale .kpi-value { color: var(--warning); }

      .filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; align-items: center; }
      .filters .grow { flex: 1; min-width: 200px; }

      .posts { display: grid; gap: 12px; }

      .post {
        display: flex; gap: 14px; align-items: flex-start;
        padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
      }
      .post-hidden { opacity: .62; background: var(--surface-2); }
      .post-featured { border-color: var(--brand-400, var(--brand-600)); }

      .post-photo {
        flex: none; width: 132px; height: 88px; border-radius: 9px; overflow: hidden;
        background: var(--surface-2); border: 1px solid var(--border);
        display: grid; place-items: center;
      }
      .post-photo img { width: 100%; height: 100%; object-fit: cover; }
      .post-photo .none { font-size: 11px; color: var(--text-3); text-align: center; padding: 0 6px; }

      .post-main { flex: 1; min-width: 0; }
      .post-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .post-text {
        margin: 4px 0 0; font-size: 12px; color: var(--text-3); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .post-meta { margin-top: 7px; display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--text-3); }
      .post-slug { font-family: var(--font-mono, monospace); }

      .tag-chips { margin-top: 7px; display: flex; gap: 5px; flex-wrap: wrap; }
      .chip {
        padding: 1px 8px; border-radius: 999px; font-size: 11px;
        border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2);
      }
      .chip-on { border-color: var(--brand-600); color: var(--brand-600); }

      .post-actions { display: flex; gap: 4px; flex-wrap: wrap; align-items: flex-start; }

      /* The state, said plainly and coloured by what it means for the reader:
         green is on the site, amber is waiting, grey is nobody's business yet. */
      .state { padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; border: 1px solid transparent; }
      .state-live { background: var(--success-bg, #ecfdf5); color: var(--success, #047857); }
      .state-scheduled { background: var(--warning-bg); color: var(--warning); }
      .state-draft { background: var(--surface-2); color: var(--text-3); }
      .state-hidden { background: var(--surface-2); color: var(--text-3); }

      .tag-rows { display: grid; gap: 8px; }
      .tag-row { display: flex; gap: 8px; align-items: center; }
      .tag-row .input { flex: 1; }

      .body-field textarea { min-height: 260px; font-family: inherit; line-height: 1.6; }
      .count { font-variant-numeric: tabular-nums; }

      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
    `,
  ],
})
export class BlogManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly uploads = inject(UploadService);

  readonly tagsMax = TAGS_MAX;

  /**
   * Writes are the main admin's, as with the rest of this section. An article is
   * the company speaking in public under its own name, which is the same kind of
   * act as changing the About copy or the domain it is published on.
   */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly items = signal<BlogPost[]>([]);
  readonly meta = signal<PageMeta>(EMPTY_META);
  readonly summary = signal<BlogSummary | null>(null);
  readonly knownTags = signal<BlogTag[]>([]);
  readonly branches = signal<Branch[]>([]);

  readonly loading = signal(true);
  readonly listing = signal(false);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<BlogPost | null>(null);

  readonly tab = signal<Tab>('all');
  readonly search = signal('');
  readonly tagFilter = signal('');
  readonly branchFilter = signal('');
  readonly page = signal(1);
  readonly limit = signal(10);

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  /**
   * How long since the last post went up.
   *
   * The one derived number on this screen, and it is derived rather than sent
   * because it is a presentation of a date the API already gave: "3 months ago"
   * is the same fact as `2026-06-04`, said the way a person reads it.
   */
  readonly sinceLastPost = computed(() => {
    const latest = this.summary()?.latest?.publishedAt;
    if (!latest) return null;

    const days = Math.floor((Date.now() - new Date(latest).getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    const months = Math.round(days / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
  });

  /** True when nothing has been published for a season. The amber on the card. */
  readonly goneQuiet = computed(() => {
    const latest = this.summary()?.latest?.publishedAt;
    if (!latest) return (this.summary()?.total ?? 0) > 0;
    return Date.now() - new Date(latest).getTime() > 90 * 86400000;
  });

  /** The section's own wording, and the name its archive carries in the menu. */
  readonly copyForm = this.fb.nonNullable.group({
    navLabel: [''],
    eyebrow: [''],
    title: [''],
    lead: [''],
    ctaLabel: [''],
    /** Company-wide rather than per-post; see `BlogSettings.showAuthor`. */
    showAuthor: [true],
  });

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    title: ['', [Validators.required]],
    /** Blank on a new post: the API makes one from the title. */
    slug: [''],
    excerpt: [''],
    body: ['', [Validators.required]],
    coverImage: [''],
    author: [''],
    tags: this.fb.array<FormControl<string>>([]),
    /**
     * `datetime-local` wants `YYYY-MM-DDTHH:mm` and gives it back the same way.
     * Empty is a draft, a future value schedules it. See `toIso`.
     */
    publishedAt: [''],
    featured: [false],
  });

  get tags(): FormArray<FormControl<string>> {
    return this.form.controls.tags;
  }

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.companies.functionalities().subscribe({
      next: (view) => {
        const item = (view.items ?? []).find((row) => row.key === KEY) ?? null;
        this.feature.set(item);
        this.patchCopyForm();
        this.loading.set(false);
        if (item?.granted) {
          this.loadItems();
          this.loadSummary();
          this.loadTags();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your blog', messageOf(error));
      },
    });
  }

  private loadItems(): void {
    this.listing.set(true);

    const query: ListQuery = { page: this.page(), limit: this.limit() };
    /* The tabs are filters on one endpoint, not four lists. */
    if (this.tab() !== 'all') query['state'] = this.tab();
    if (this.search().trim()) query['search'] = this.search().trim();
    if (this.tagFilter()) query['tag'] = this.tagFilter();
    if (this.branchFilter()) query['branchId'] = this.branchFilter();

    this.companies.listBlogPosts(query).subscribe({
      next: (result) => {
        this.listing.set(false);
        this.items.set(result.items);
        this.meta.set(result.meta);
      },
      error: (error: HttpErrorResponse) => {
        this.listing.set(false);
        this.items.set([]);
        this.meta.set(EMPTY_META);
        this.toast.error('Could not load the posts', messageOf(error));
      },
    });
  }

  private loadSummary(): void {
    this.companies.blogSummary().subscribe({
      next: (data) => this.summary.set(data),
      error: () => this.summary.set(null),
    });
  }

  private loadTags(): void {
    /* The screen works without them; the suggestions just stay empty. */
    this.companies.blogTags().subscribe({
      next: (rows) => this.knownTags.set(rows),
      error: () => this.knownTags.set([]),
    });
  }

  private loadBranches(): void {
    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  /* ------------------------------ the wording ------------------------------ */

  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<BlogSettings>;
    this.copyForm.reset({
      /* Filled from the raw value: the API sends null when the tenant has never
         named the page, and the field shows the platform's name as a placeholder
         rather than pretending it was typed. */
      navLabel: settings.navLabel ?? '',
      eyebrow: settings.eyebrow ?? '',
      title: settings.title ?? '',
      lead: settings.lead ?? '',
      ctaLabel: settings.ctaLabel ?? '',
      /* `?? true` rather than `|| true`: a stored `false` is the company saying
         do not print bylines, and treating it as "never set" would put them back
         on every visit to this screen. */
      showAuthor: settings.showAuthor ?? true,
    });
  }

  saveCopy(): void {
    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    this.companies
      .saveFunctionalitySettings(KEY, {
        navLabel: raw.navLabel || null,
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        ctaLabel: raw.ctaLabel || null,
        /* Never blank: it is a choice, not a piece of copy. */
        showAuthor: raw.showAuthor,
      })
      .subscribe({
        next: (updated) => {
          this.savingCopy.set(false);
          this.feature.set(updated);
          this.patchCopyForm();
          this.toast.success('Blog wording saved');
        },
        error: (error: HttpErrorResponse) => {
          this.savingCopy.set(false);
          this.toast.error('Could not save the wording', messageOf(error));
        },
      });
  }

  resetCopy(): void {
    this.patchCopyForm();
  }

  /* ------------------------------- the filters ----------------------------- */

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.page.set(1);
    this.loadItems();
  }

  onSearch(value: string): void {
    this.search.set(value);
    /* Any change of filter goes back to page one — page four of the old filter
       is nowhere. */
    this.page.set(1);
    this.loadItems();
  }

  /** Clicking a tag on a card filters by it, and clicking it again clears it. */
  onTag(tag: string): void {
    this.tagFilter.set(this.tagFilter() === tag ? '' : tag);
    this.page.set(1);
    this.loadItems();
  }

  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.page.set(1);
    this.loadItems();
  }

  onPage(page: number): void {
    this.page.set(page);
    this.loadItems();
  }

  onLimit(limit: number): void {
    this.limit.set(limit);
    this.page.set(1);
    this.loadItems();
  }

  /* -------------------------------- rendering ------------------------------ */

  coverOf(row: BlogPost): string | null {
    return this.uploads.toUrl(row.coverImage);
  }

  stateLabel(state: BlogState): string {
    if (state === 'live') return 'On the site';
    if (state === 'scheduled') return 'Scheduled';
    if (state === 'draft') return 'Draft';
    return 'Hidden';
  }

  /* --------------------------------- the tags ------------------------------ */

  addTag(value = ''): void {
    if (this.tags.length >= TAGS_MAX) return;
    this.tags.push(this.fb.nonNullable.control(value));
  }

  removeTag(index: number): void {
    this.tags.removeAt(index);
  }

  /** A suggestion clicked under the field. Ignored if it is already on the post. */
  suggestTag(tag: string): void {
    const already = this.tags.controls.some((control) => control.value.trim().toLowerCase() === tag.toLowerCase());
    if (already) return;

    const empty = this.tags.controls.find((control) => !control.value.trim());
    if (empty) empty.setValue(tag);
    else this.addTag(tag);
  }

  private setTags(values: string[]): void {
    this.tags.clear();
    values.forEach((value) => this.addTag(value));
  }

  /* --------------------------------- the form ------------------------------ */

  /**
   * A date for `datetime-local`, in the **browser's own** time zone.
   *
   * `toISOString` would be wrong here in a way that is easy to miss: it converts
   * to UTC, so a post published at 9am in Ahmedabad would open in the editor
   * saying 03:30. The tenant types local time and reads local time back; the
   * conversion to UTC happens once, on the way out.
   */
  private toLocalInput(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}`;
  }

  /** And back again: a local `datetime-local` value as the ISO the API stores. */
  private toIso(value: string): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  /** Whether the date in the form is in the future — what the hint reads from. */
  scheduledFor(): string | null {
    const raw = this.form.controls.publishedAt.value;
    if (!raw) return null;
    const date = new Date(raw);
    return !Number.isNaN(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : null;
  }

  /** Roughly how long the article in the box takes to read. Matches the API's rule. */
  readingTime(): number {
    const words = this.form.controls.body.value.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  /**
   * A post added while the list is filtered to one branch belongs to that branch
   * — landing it company-wide would put it on every site silently.
   */
  private defaultBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  open(row: BlogPost | null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      title: row?.title ?? '',
      slug: row?.slug ?? '',
      excerpt: row?.excerpt ?? '',
      body: row?.body ?? '',
      coverImage: row?.coverImage ?? '',
      author: row?.author ?? '',
      publishedAt: this.toLocalInput(row?.publishedAt),
      featured: row?.featured ?? false,
    });
    // `reset` does not resize a FormArray, so the rows are rebuilt by hand.
    this.setTags(row?.tags?.length ? row.tags : []);
    this.modalOpen.set(true);
  }

  /** Fills the date with now, so nobody has to type today's date to publish. */
  publishNow(): void {
    this.form.controls.publishedAt.setValue(this.toLocalInput(new Date().toISOString()));
  }

  /** Back to a draft: written, saved, shown to nobody. */
  unpublish(): void {
    this.form.controls.publishedAt.setValue('');
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const raw = this.form.getRawValue();
    const row = this.editing();

    const payload: Record<string, unknown> = {
      // Empty means company-wide, which is a real choice, so it goes as null.
      branchId: raw.branchId ? Number(raw.branchId) : null,
      title: raw.title,
      excerpt: raw.excerpt || null,
      body: raw.body,
      coverImage: raw.coverImage || null,
      author: raw.author || null,
      // Blank rows are dropped rather than refused.
      tags: raw.tags.map((tag) => tag.trim()).filter(Boolean),
      publishedAt: this.toIso(raw.publishedAt),
      featured: raw.featured,
    };

    /**
     * The slug is sent **only when it has actually been changed**.
     *
     * Sending it unchanged would be harmless today, but sending it on every save
     * is one refactor away from regenerating it from the title — and an article
     * whose address moves silently breaks every link anybody has shared to it.
     * Absent is the safer thing to say.
     */
    if (raw.slug.trim() && raw.slug.trim() !== row?.slug) payload['slug'] = raw.slug.trim();

    this.saving.set(true);

    const request = row ? this.companies.updateBlogPost(row.id, payload) : this.companies.createBlogPost(payload);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(
          row ? 'Post saved' : saved.state === 'live' ? 'Post published' : saved.state === 'scheduled' ? 'Post scheduled' : 'Draft saved'
        );
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the post', messageOf(error));
      },
    });
  }

  toggle(row: BlogPost): void {
    this.companies.toggleBlogPost(row.id).subscribe({
      next: () => {
        this.toast.success(row.status === 'active' ? 'Post taken off the site' : 'Post is back on the site');
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the post', messageOf(error)),
    });
  }

  async remove(row: BlogPost): Promise<void> {
    if (!(await this.confirm.askDelete(`the post "${row.title}"`))) return;

    this.companies.removeBlogPost(row.id).subscribe({
      next: () => {
        this.toast.success('Post deleted');
        this.refresh();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the post', messageOf(error)),
    });
  }

  /** The list, the strip and the tag list all move together after a write. */
  private refresh(): void {
    this.loadItems();
    this.loadSummary();
    this.loadTags();
  }
}
