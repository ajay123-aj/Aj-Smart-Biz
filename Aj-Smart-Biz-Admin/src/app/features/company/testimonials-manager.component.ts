import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { map, tap } from 'rxjs';
import { CompanyService } from '../../core/services/company.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { UploadService } from '../../core/services/upload.service';
import { messageOf } from '../../core/interceptors/auth.interceptor';
import {
  Branch,
  Functionality,
  Testimonial,
  TestimonialMode,
  TestimonialModeration,
  TestimonialReviewTarget,
  TestimonialSource,
  TestimonialsSettings,
} from '../../core/models/domain.model';
import { ListStore } from '../../shared/list-store';
import { touchAll } from '../../shared/utils';
import { FieldErrorComponent } from '../../shared/ui/field-error.component';
import { FeatureGateComponent } from '../../shared/ui/feature-gate.component';
import { ModalComponent } from '../../shared/ui/modal.component';
import { PagerComponent } from '../../shared/ui/pager.component';
import { TableStateComponent } from '../../shared/ui/table-state.component';

/** The key this whole screen is about. Written once rather than in six places. */
const KEY = 'testimonials' as const;

/** What an unset moderation count looks like, so the badges never render blank. */
const NO_COUNTS = { pending: 0, approved: 0, rejected: 0 };

/**
 * The Testimonials screen: customer reviews, and the decision about who may
 * write them.
 *
 * Three things on one screen, and the order matters because the first decides
 * what the other two are for:
 *
 *  1. **The mode**, and — when it is open — **where the button goes.** `static`
 *     is a wall the company fills itself, in the order it arranges. `dynamic`
 *     puts a review button on the website, and the section becomes the ten most
 *     recent approved reviews, newest first.
 *
 *     The button has two possible destinations and exactly one is ever live:
 *     the platform's own form, whose submissions land in the queue below, or a
 *     link off the site — a Google Business review page, usually. Choosing the
 *     link is not a cosmetic difference: reviews written that way are Google's
 *     and never arrive here, so the queue stays empty and the wall goes on
 *     showing whatever is already published.
 *
 *     Between them these two settings are the only thing on the platform that
 *     opens a write path to the public internet, which is why they lead the
 *     screen rather than sitting among the wording fields.
 *  2. **The queue.** Anything a customer submits arrives here as `pending` and
 *     reaches nobody until someone approves it. That is the whole reason the
 *     screen is a queue before it is an editor, and why the tabs lead with a
 *     count rather than a filter dropdown.
 *  3. **The reviews themselves**, added and edited like any other card list.
 *
 * ## Why a table
 *
 * The other website-content screens are card grids, because a tenant has six
 * benefits and nine photographs and edits them as a set. This list is the one
 * on the platform that **the public writes to**: it grows for as long as the
 * site is up, and it is read by someone working through it — who wrote it,
 * when, is it waiting on me — rather than admired. That is a table, and a
 * table of unknown length is a paged one.
 *
 * Paging is the API's, not the browser's. Filtering, searching and sorting all
 * go back to the server through `ListStore`, so "23 waiting" is 23 rows across
 * the whole tenant and not 23 of the ten this page happens to hold.
 *
 * Rejecting is not deleting: the row stays, off the website and out of the way,
 * so a tenant can look again at what it turned down — and so somebody
 * resubmitting the same thing is visible rather than looking like a first
 * offence. Delete is still there for what genuinely should not be kept.
 */
@Component({
  selector: 'app-testimonials-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  imports: [
    DatePipe,
    ReactiveFormsModule,
    FeatureGateComponent,
    ModalComponent,
    FieldErrorComponent,
    PagerComponent,
    TableStateComponent,
  ],
  templateUrl: './testimonials-manager.component.html',
  styles: [
    `
      :host { display: block; }

      .section-form { padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
      @media (max-width: 720px) { .form-grid { grid-template-columns: 1fr; } }

      /*
       * The mode, as two cards rather than a dropdown. It changes what the
       * website *is* — a curated page or one the public can write to — and a
       * line in a select list is not enough room to say so.
       */
      .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
      @media (max-width: 720px) { .modes { grid-template-columns: 1fr; } }

      .mode {
        display: block; cursor: pointer; padding: 14px;
        /* Positioned so the visually hidden radio inside stays inside it —
           absolute without this escapes to whatever ancestor happens to be
           positioned, which is nowhere near the card it belongs to. */
        position: relative;
        border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
        transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease;
      }
      .mode:hover { border-color: var(--brand-400, var(--brand-600)); }
      /* Hidden, not removed: it is still the control, still focusable and still
         what a screen reader announces. The label is what gets clicked. */
      .mode input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
      /* Keyboard users need to see where they are, since the radio itself is invisible. */
      .mode:has(input:focus-visible) { outline: 2px solid var(--brand-600); outline-offset: 2px; }
      .mode-on {
        border-color: var(--brand-600);
        background: var(--brand-50, var(--surface-2));
        box-shadow: 0 0 0 1px var(--brand-600) inset;
      }
      .mode-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; }
      .mode-dot {
        width: 15px; height: 15px; flex: none; border-radius: 50%;
        border: 2px solid var(--border-strong, var(--border)); background: var(--surface);
      }
      .mode-on .mode-dot { border-color: var(--brand-600); border-width: 5px; }
      .mode-note { margin: 6px 0 0 23px; font-size: 12px; color: var(--text-3); line-height: 1.5; }

      /* The form's own wording, hidden entirely on a static wall — there is no
         form on the site to word. */
      .form-copy { padding-top: 14px; margin-top: 14px; border-top: 1px dashed var(--border); }

      /* ------------------------------ the queue ------------------------------ */

      /* Tabs on the left, the fields that narrow them on the right. */
      .toolbar {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-wrap: wrap; margin-bottom: 12px;
      }

      .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
      .tab {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 7px 13px; border-radius: 999px; font-size: 13px; font-weight: 600;
        border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
        cursor: pointer;
      }
      .tab:hover { border-color: var(--brand-600); }
      .tab-on { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
      .tab-count {
        min-width: 20px; padding: 0 6px; border-radius: 999px;
        font-size: 11px; font-variant-numeric: tabular-nums;
        background: var(--surface-2); color: var(--text-3);
      }
      .tab-on .tab-count { background: rgba(255, 255, 255, .22); color: #fff; }
      /* Waiting on somebody. The one count worth colouring. */
      .tab-count-due { background: #fde8e4; color: #a4291b; }
      .tab-on .tab-count-due { background: rgba(255, 255, 255, .3); color: #fff; }

      .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .filters .select, .filters .input { width: auto; }
      .filters .search { min-width: 210px; }

      /* ------------------------------ the table ------------------------------ */

      /* The review itself is the column worth the width; everything else is a
         fact about it and can be read at a glance. */
      /*
       * The table has to fit the card. It was eight columns and 1308px wide
       * inside 1156px, so it scrolled sideways and clipped the Actions column —
       * the one thing the screen exists for. Source and Branch moved under the
       * author's name, and what is left is sized so the total lands under the
       * container at this breakpoint rather than relying on the browser to
       * find room.
       */
      .table { table-layout: fixed; width: 100%; }
      /*
       * Everything except the review is given a fixed width, so the review —
       * the column actually worth reading — absorbs whatever is left. The five
       * of them come to 742px, which leaves it a comfortable share of a 1156px
       * card and, more to the point, keeps the total under it.
       */
      .col-who { width: 210px; }
      .col-rating { width: 90px; }
      .col-when { width: 96px; }
      .col-state { width: 96px; }
      .col-actions { width: 250px; }
      /* The state pill should not touch the first button. Scoped through
         .table so it beats the shared cell padding. */
      .table .col-state { padding-right: 14px; }
      /* The buttons need clearing from the pill on their left. */
      .table td.col-actions { padding-left: 14px; }
      /* The header belongs over the buttons, which sit at the end of the row. */
      .table th.col-actions { text-align: right; }

      /*
       * Narrower desktops. The fixed columns are what overflow first — the
       * review column simply gives up its share until there is nothing left to
       * give — so they are what shrinks. Below 1200px the date goes entirely:
       * it is the least useful of the six at a glance, sorting by it still
       * works from the header, and dropping it buys the review its width back.
       *
       * Under 1000px the table falls back to scrolling, which is what the
       * table-wrap overflow has always been for. Six columns and four buttons do not
       * belong in 680px, and pretending otherwise would only make every column
       * unreadable instead of one of them absent.
       */
      @media (max-width: 1400px) {
        .col-who { width: 190px; }
        .col-rating { width: 80px; }
        .col-when { width: 88px; }
        .col-state { width: 88px; }
        .col-actions { width: 224px; }
      }

      @media (max-width: 1200px) {
        .col-when { display: none; }
        .col-who { width: 172px; }
        .col-rating { width: 74px; }
        .col-state { width: 84px; }
        .col-actions { width: 210px; }
      }
      .review-text {
        margin: 0; font-size: 12.5px; color: var(--text-2); line-height: 1.5;
        display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
      }
      .row-pending td { background: rgba(232, 163, 61, .06); }
      .row-inactive { opacity: .6; }

      .who { display: flex; align-items: flex-start; gap: 9px; }
      /* Without min-width 0 a long email stretches the cell past its track. */
      .who-main { min-width: 0; }
      .who-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px; }
      .avatar {
        width: 30px; height: 30px; flex: none; border-radius: 50%; object-fit: cover;
        background: var(--surface-2);
      }
      .avatar-fallback {
        display: grid; place-items: center; font-size: 12px; font-weight: 700;
        color: #fff; background: var(--brand-600);
      }
      /* Never published — see the model. Here so a company can answer a review. */
      /*
       * overflow-wrap anywhere rather than word-break break-all: it breaks a
       * long address that has nowhere else to go, but still prefers the spaces
       * and the @ — which is what stopped ajaymithapara2000@gmail.com
       * rendering as three ragged fragments.
       */
      .who-contact { overflow-wrap: anywhere; margin-top: 2px; }

      .stars { display: inline-flex; gap: 1px; color: #e0a32e; line-height: 0; }
      .stars svg { width: 13px; height: 13px; fill: currentColor; }
      .stars .off { fill: var(--border-strong, #d8d8d8); }

      .pill {
        display: inline-block;
        padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
        letter-spacing: .03em; text-transform: uppercase; white-space: nowrap;
      }
      .pill-visitor { background: #e6f2ff; color: #1c5b9c; }
      .pill-own { background: var(--surface-2); color: var(--text-3); }
      .pill-pending { background: #fdf0dc; color: #8a5a12; }
      .pill-approved { background: #e3f5e9; color: #1d6b3a; }
      .pill-rejected { background: var(--surface-2); color: var(--text-3); }

      /* The buttons stay on one line; wrapping them is what made rows uneven. */
      .actions { flex-wrap: nowrap; gap: 4px; }
      .actions .btn { white-space: nowrap; }

      .seq { display: flex; align-items: center; gap: 2px; }
      .seq-num { min-width: 20px; text-align: center; font-variant-numeric: tabular-nums; color: var(--text-3); font-size: 12px; }
      .empty-note { padding: 26px 0; text-align: center; color: var(--text-3); font-size: 13px; }
    `,
  ],
})
export class TestimonialsManagerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companies = inject(CompanyService);
  private readonly uploads = inject(UploadService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly cards = this.companies.cards<Testimonial>('testimonials');

  /** Writes are the main admin's, as with the company profile and domains. */
  readonly canEdit = computed(() => this.auth.isCompanyAdmin());

  readonly feature = signal<Functionality | null>(null);
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly savingCopy = signal(false);
  readonly reordering = signal(false);
  readonly modalOpen = signal(false);
  readonly editing = signal<Testimonial | null>(null);

  /**
   * The counts, kept beside the page rather than derived from it.
   *
   * Filled from every list response, whatever filter produced it, because the
   * API sends the whole tenant's counts rather than the filter's — the pending
   * badge has to be right while the Published tab is open.
   */
  readonly counts = signal({ ...NO_COUNTS });

  /**
   * The page of reviews, and the paging, sorting and searching around it.
   *
   * The loader splits what the endpoint sends into the two things it is: the
   * rows and their page go to the store, the counts to the signal above.
   */
  readonly store = new ListStore<Testimonial>(
    (query) =>
      this.companies.listTestimonials(query).pipe(
        tap(({ data }) => this.counts.set(data?.counts ?? { ...NO_COUNTS })),
        map(({ data, meta }) => ({ items: data?.items ?? [], meta }))
      ),
    { limit: 10 }
  );

  /** `''` is everything; otherwise one moderation state. */
  readonly tab = signal<'' | TestimonialModeration>('');
  readonly sourceFilter = signal<'' | TestimonialSource>('');
  readonly branchFilter = signal<string>('');

  readonly writable = computed(() => this.canEdit() && (this.feature()?.granted ?? false));

  /**
   * The mode the radio cards are currently showing, as a signal.
   *
   * Kept in step with the form control rather than read from it. A `computed`
   * over `copyForm.controls.mode.value` looks equivalent and is not: `computed`
   * re-runs only when a **signal** it read changes, a form control's `.value`
   * is not a signal, so it evaluated once at first render and never again —
   * the value moved underneath it and the card highlight, the form-wording
   * block and the empty-state text all went on describing the old mode.
   *
   * The subscription in the constructor is what makes the click land. `reset()`
   * emits too, so loading the screen and saving it both arrive here as well.
   */
  private readonly mode = signal<TestimonialMode>('static');

  /** True while the form is *editing* the open mode — drives which fields show. */
  readonly isDynamic = computed(() => this.mode() === 'dynamic');

  /**
   * The destination the radio cards are showing, bridged from the control for
   * exactly the reason `mode` is — see above.
   */
  private readonly reviewTarget = signal<TestimonialReviewTarget>('form');

  /**
   * The two states the review button can be in while being edited.
   *
   * Both are gated on `isDynamic` rather than on the target alone, because a
   * curated wall has no button for either to describe. That is what keeps the
   * URL field and its validators out of the way on a static section instead of
   * demanding a link nobody will click.
   */
  readonly opensForm = computed(() => this.isDynamic() && this.reviewTarget() === 'form');
  readonly opensLink = computed(() => this.isDynamic() && this.reviewTarget() === 'link');

  /**
   * What the website is actually doing right now, which is not the same
   * question. The form follows what is being edited; anything that describes
   * the live site follows what was last saved.
   */
  readonly savedMode = computed<TestimonialMode>(
    () => (this.feature()?.settings as Partial<TestimonialsSettings> | undefined)?.mode ?? 'static'
  );

  /** Where the live button actually points. Same question, same rule. */
  readonly savedTarget = computed<TestimonialReviewTarget>(
    () =>
      (this.feature()?.settings as Partial<TestimonialsSettings> | undefined)?.reviewTarget ?? 'form'
  );

  /**
   * What the website is doing right now, in one sentence, for the "not saved
   * yet" notice. Read off what was saved, never off the form.
   */
  readonly savedBehaviour = computed(() => {
    if (this.savedMode() !== 'dynamic') return 'showing only the reviews you added';
    return this.savedTarget() === 'link'
      ? 'sending people to your review link'
      : 'collecting reviews through the form on your site';
  });

  /**
   * True when the switch above has been moved but not yet saved.
   *
   * Covers the destination as well as the mode, because they are the same kind
   * of promise: both describe what a visitor gets when they click, and a
   * half-saved screen that looks like one thing while the live site does
   * another is worth a line of warning either way. The destination only counts
   * while the section is open — on a curated wall it changes nothing.
   */
  readonly modeUnsaved = computed(
    () =>
      this.mode() !== this.savedMode() ||
      (this.isDynamic() && this.reviewTarget() !== this.savedTarget())
  );

  /**
   * Hand-ordering only means something on a static wall. A dynamic section is
   * ordered by recency and ignores `sequence` entirely, so offering the arrows
   * there would be a control that changes nothing a visitor can see.
   */
  readonly orderable = computed(() => this.savedMode() !== 'dynamic');

  /**
   * Which wall the arrows would reorder, or `null` when that is ambiguous.
   *
   * `sequence` is numbered per scope — a branch's wall and the company-wide
   * one are ordered independently, exactly like every other card list — so
   * reordering across "All branches" would renumber two walls into each other.
   * A tenant with no branches at all has only one wall, so it needs no choosing.
   */
  readonly reorderScope = computed<string | null>(() => {
    const filter = this.branchFilter();
    if (filter) return filter;
    return this.branches().length === 0 ? 'none' : null;
  });

  readonly canReorder = computed(() => this.writable() && this.orderable() && this.reorderScope() !== null);

  /** True when the arrows are wanted but a scope has to be picked first. */
  readonly reorderNeedsScope = computed(
    () => this.writable() && this.orderable() && this.reorderScope() === null
  );

  readonly copyForm = this.fb.nonNullable.group({
    mode: ['static'],
    reviewTarget: ['form'],
    /*
     * Validated conditionally rather than here: the field is only required when
     * the button is actually set to open a link, which is a state the form
     * moves in and out of. See `syncLinkValidators`.
     */
    reviewUrl: [''],
    eyebrow: [''],
    title: [''],
    lead: [''],
    formTitle: [''],
    formNote: [''],
    showRating: [true],
  });

  readonly form = this.fb.nonNullable.group({
    branchId: [''],
    authorName: ['', [Validators.required]],
    authorRole: [''],
    authorEmail: [''],
    authorPhone: [''],
    rating: [''],
    body: ['', [Validators.required]],
    status: ['active'],
  });

  constructor() {
    /**
     * Reactive forms do not publish their value as a signal, so this is the
     * bridge — see `mode`. `takeUntilDestroyed` in a field/constructor context
     * unsubscribes with the component and needs no `ngOnDestroy`.
     */
    this.copyForm.controls.mode.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.mode.set((value as TestimonialMode) ?? 'static');
      // Leaving `dynamic` retires the URL requirement with the button it was for.
      this.syncLinkValidators();
    });

    this.copyForm.controls.reviewTarget.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.reviewTarget.set((value as TestimonialReviewTarget) ?? 'form');
      this.syncLinkValidators();
    });

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
          this.store.reload();
          this.loadBranches();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.toast.error('Could not load your testimonials', messageOf(error));
      },
    });
  }

  private loadBranches(): void {
    this.companies.listBranches({ limit: 200, status: 'active' }).subscribe({
      next: (result) => this.branches.set(result.items),
      error: () => this.branches.set([]),
    });
  }

  private patchCopyForm(): void {
    const settings = (this.feature()?.settings ?? {}) as Partial<TestimonialsSettings>;
    /* Set outright as well as through `reset()`: the subscription cannot be
       relied on for the very first patch, which may run before it exists. */
    this.mode.set(settings.mode ?? 'static');
    this.reviewTarget.set(settings.reviewTarget ?? 'form');
    this.copyForm.reset({
      mode: settings.mode ?? 'static',
      reviewTarget: settings.reviewTarget ?? 'form',
      reviewUrl: settings.reviewUrl ?? '',
      eyebrow: settings.eyebrow ?? '',
      title: settings.title ?? '',
      lead: settings.lead ?? '',
      formTitle: settings.formTitle ?? '',
      formNote: settings.formNote ?? '',
      showRating: settings.showRating ?? true,
    });
    this.syncLinkValidators();
  }

  /**
   * Puts the URL requirement on and takes it off with the button it belongs to.
   *
   * Angular has no conditional validator, so this is the conditional: the
   * control carries `required` and the shape check only while the section is
   * open *and* the button is set to leave the site. Any other combination
   * clears them, because a URL nobody will use must not be able to block a save
   * of the wording beside it.
   *
   * `emitEvent: false` matters — `updateValueAndValidity` otherwise re-emits on
   * `valueChanges`, and this is called *from* those subscriptions.
   */
  private syncLinkValidators(): void {
    const control = this.copyForm.controls.reviewUrl;
    const required = this.copyForm.controls.mode.value === 'dynamic'
      && this.copyForm.controls.reviewTarget.value === 'link';

    if (required) {
      /* `https?://` and something after it, which is all the browser can
         usefully check. The API refuses anything else — and refuses a
         `javascript:` URL in particular, since this ends up in an `href` on the
         tenant's own website. */
      control.setValidators([Validators.required, Validators.pattern(/^https?:\/\/\S+$/i)]);
    } else {
      control.clearValidators();
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

  saveCopy(): void {
    /* Only reachable when the button opens a link and the URL is missing or
       malformed — nothing else on this form is required. */
    if (this.copyForm.invalid) {
      touchAll(this.copyForm);
      return;
    }

    const raw = this.copyForm.getRawValue();
    this.savingCopy.set(true);

    /*
     * `link` is sent only when it is genuinely in force. A curated wall has no
     * button, so its stored destination would be a setting describing nothing
     * — and the API refuses `link` without a URL, which is exactly the state a
     * half-configured static section would be saved in.
     */
    const opensLink = this.opensLink();

    this.companies
      .saveFunctionalitySettings(KEY, {
        mode: raw.mode,
        reviewTarget: opensLink ? 'link' : 'form',
        reviewUrl: opensLink ? raw.reviewUrl.trim() : null,
        eyebrow: raw.eyebrow || null,
        title: raw.title || null,
        lead: raw.lead || null,
        formTitle: raw.formTitle || null,
        formNote: raw.formNote || null,
        showRating: raw.showRating,
      })
      .subscribe({
        next: (updated) => {
          this.savingCopy.set(false);
          this.feature.set(updated);
          this.patchCopyForm();
          this.toast.success(
            raw.mode !== 'dynamic'
              ? 'Saved — only the reviews you add here are published'
              : opensLink
                ? 'Saved — the review button on your website now opens your link'
                : 'Saved — customers can now leave reviews on your website'
          );
          // The order controls appear and disappear with the mode.
          this.store.reload();
        },
        error: (error: HttpErrorResponse) => {
          this.savingCopy.set(false);
          this.toast.error('Could not save the settings', messageOf(error));
        },
      });
  }

  resetCopy(): void {
    this.patchCopyForm();
  }

  /* ------------------------------- the queue ------------------------------ */

  selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  setTab(tab: '' | TestimonialModeration): void {
    this.tab.set(tab);
    /* Undefined rather than '' — `toParams` drops empty values, which is how
       "no filter" is spelled on the way to the API. */
    this.store.patch({ moderation: tab || undefined });
  }

  onSourceFilter(value: string): void {
    this.sourceFilter.set(value as '' | TestimonialSource);
    this.store.patch({ source: value || undefined });
  }

  onBranchFilter(value: string): void {
    this.branchFilter.set(value);
    this.store.patch({ branchId: value || undefined });
  }

  onSearch(value: string): void {
    this.store.patch({ search: value || undefined });
  }

  /** Five slots, filled to the rating — so 3/5 reads as three, not as "3". */
  starSlots(rating?: number | null): boolean[] {
    const filled = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
    return [0, 1, 2, 3, 4].map((index) => index < filled);
  }

  photoUrl(path?: string | null): string | null {
    return this.uploads.toUrl(path);
  }

  moderate(row: Testimonial, moderation: TestimonialModeration): void {
    this.companies.moderateTestimonial(row.id, moderation).subscribe({
      next: () => {
        this.toast.success(
          moderation === 'approved'
            ? 'Published — it is on your website now'
            : moderation === 'rejected'
              ? 'Rejected — it stays here but is not published'
              : 'Moved back to pending'
        );
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not update the review', messageOf(error)),
    });
  }

  /* ------------------------------- the rows ------------------------------- */

  private defaultBranchId(): string {
    const filter = this.branchFilter();
    return filter && filter !== 'none' ? filter : '';
  }

  open(row: Testimonial | null): void {
    this.editing.set(row);
    this.form.reset({
      branchId: String(row?.branchId ?? (row ? '' : this.defaultBranchId())),
      authorName: row?.authorName ?? '',
      authorRole: row?.authorRole ?? '',
      authorEmail: row?.authorEmail ?? '',
      authorPhone: row?.authorPhone ?? '',
      rating: row?.rating ? String(row.rating) : '',
      body: row?.body ?? '',
      status: row?.status ?? 'active',
    });
    this.modalOpen.set(true);
  }

  save(): void {
    if (this.form.invalid) {
      touchAll(this.form);
      return;
    }

    const raw = this.form.getRawValue();
    const payload: Record<string, unknown> = {
      // Empty means company-wide, which is a real choice, so it goes as null.
      branchId: raw.branchId ? Number(raw.branchId) : null,
      authorName: raw.authorName,
      authorRole: raw.authorRole || null,
      authorEmail: raw.authorEmail || null,
      authorPhone: raw.authorPhone || null,
      // Blank is "no star", which the column and the website both allow.
      rating: raw.rating ? Number(raw.rating) : null,
      body: raw.body,
      status: raw.status,
    };

    const row = this.editing();
    this.saving.set(true);

    /*
     * `source` and, on a new row, `moderation` are the API's to set — a console
     * that could stamp a review `visitor` would be able to pass the company's
     * own copy off as a customer's. Editing an existing review deliberately
     * leaves its moderation alone: fixing a typo in a pending review must not
     * publish it.
     */
    const request = row ? this.cards.update(row.id, payload) : this.cards.create(payload);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(row ? 'Review updated' : 'Review added');
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.toast.error('Could not save the review', messageOf(error));
      },
    });
  }

  toggle(row: Testimonial): void {
    this.cards.toggleStatus(row.id).subscribe({
      next: () => {
        this.toast.success(`Review is now ${row.status === 'active' ? 'inactive' : 'active'}`);
        this.store.reload();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not change the status', messageOf(error)),
    });
  }

  /**
   * Moves one review up or down its wall.
   *
   * The whole wall is fetched first, and that is the point of the extra call:
   * `reorder` renumbers exactly the ids it is handed, starting at 1. Handing it
   * one page of a paged list would restart the numbering on every page and
   * collapse the wall into whatever order the last page was saved in. So the
   * swap is computed against the full ordered list for this scope, and the full
   * list is what goes back.
   *
   * Approved rows only, and one scope only — see `reorderScope`. A pending
   * review has no place on the wall yet, and `sequence` is assigned when it is
   * approved rather than when it arrives.
   */
  move(row: Testimonial, direction: -1 | 1): void {
    const scope = this.reorderScope();
    if (!scope || this.reordering()) return;

    this.reordering.set(true);

    this.companies
      .listTestimonials({
        branchId: scope,
        moderation: 'approved',
        sortBy: 'sequence',
        sortOrder: 'asc',
        page: 1,
        /* The API's ceiling. A wall longer than this is not one anybody is
           hand-ordering, and the arrows are the wrong tool for it. */
        limit: 200,
      })
      .subscribe({
        next: ({ data }) => {
          const ids = (data?.items ?? []).map((item) => item.id);
          const from = ids.indexOf(row.id);
          const to = from + direction;

          if (from < 0 || to < 0 || to >= ids.length) {
            this.reordering.set(false);
            return;
          }

          [ids[from], ids[to]] = [ids[to], ids[from]];

          this.cards.reorder(ids).subscribe({
            next: () => {
              this.reordering.set(false);
              this.store.reload();
            },
            error: (error: HttpErrorResponse) => {
              this.reordering.set(false);
              this.toast.error('Could not reorder the reviews', messageOf(error));
            },
          });
        },
        error: (error: HttpErrorResponse) => {
          this.reordering.set(false);
          this.toast.error('Could not read the current order', messageOf(error));
        },
      });
  }

  async remove(row: Testimonial): Promise<void> {
    if (!(await this.confirm.askDelete(`the review from "${row.authorName}"`))) return;

    this.cards.remove(row.id).subscribe({
      next: () => {
        this.toast.success('Review deleted');
        /* Steps back a page when the last row on it has just gone. */
        this.store.reloadAfterDelete();
      },
      error: (error: HttpErrorResponse) => this.toast.error('Could not delete the review', messageOf(error)),
    });
  }
}
