'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitTestimonial } from '@/app/actions/submit-testimonial';
import { INITIAL_SUBMIT_STATE, type TestimonialField } from '@/lib/testimonial-submit';
import type { TestimonialForm as FormCopy } from '@/lib/company';
import styles from './TestimonialForm.module.css';

/**
 * "Write a review" — the button, and the dialog it opens.
 *
 * One component rather than two because they are one thing: the way a visitor
 * writes a review. The button renders wherever it is placed; the dialog goes to
 * the browser's top layer when opened, so where it sits in the markup does not
 * matter.
 *
 * It is a **native `<dialog>`** opened with `showModal()`, and that is the whole
 * reason there is no focus-trap code here. The element gives us the trap, the
 * Escape key, the inert background, the `::backdrop` scrim and the right
 * `aria-modal` semantics for free. A hand-rolled div would be a hundred lines
 * doing the same job worse.
 *
 * The only client component in the section, and only because it has four things
 * a server component cannot do: open a dialog, a star picker that responds to a
 * click, a pending state on the button, and a result to show without a
 * navigation. Everything it submits goes to a Server Action — see
 * `app/actions/submit-testimonial` — so the API's address never reaches the
 * browser and this file makes no request of its own.
 *
 * It is rendered only when the API said the site is collecting. Nothing here
 * checks the mode.
 */
export default function TestimonialForm({
  form,
  className,
}: {
  form: FormCopy;
  className?: string;
}) {
  const [state, action] = useActionState(submitTestimonial, INITIAL_SUBMIT_STATE);
  const [rating, setRating] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  /**
   * `showModal()` is imperative, so opening is an effect on state rather than a
   * call in the click handler — that way the dialog cannot end up open in the
   * DOM but closed in React, which is what makes Escape and the backdrop work
   * without a second source of truth.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  /**
   * The page must not scroll behind an open dialog. `<dialog>` makes the
   * background inert but does not stop it scrolling, and a review form is tall
   * enough on a phone that a stray wheel gesture takes the page with it.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /**
   * Closing resets the star picker, so reopening offers a blank one rather than
   * the last attempt's. The action's own state cannot be reset from here —
   * `useActionState` gives no setter — which is why the success panel closes
   * the dialog rather than swapping back to the form: nothing remounts on the
   * next open, so it would otherwise still read "Thank you".
   */
  const close = () => {
    setOpen(false);
    setRating(0);
  };

  const sent = state.status === 'success';

  return (
    <>
      <button
        type="button"
        className={`btn btn--primary ${className ?? ''}`}
        onClick={() => setOpen(true)}
      >
        {form.title}
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="review-dialog-title"
        // Fires on Escape and on `close()`, so React's state follows the
        // element however it was dismissed.
        onClose={close}
        // The backdrop belongs to the dialog element, so a click that lands on
        // the element itself rather than on its panel is a click outside.
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
      >
        <div className={styles.panel}>
          <button type="button" className={styles.close} onClick={close}>
            <span aria-hidden="true">&times;</span>
            <span className="sr-only">Close</span>
          </button>

          {sent ? (
            <div className={styles.done}>
              <span className={styles.doneMark} aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m4.5 12.5 5 5 10-11" />
                </svg>
              </span>
              <h2 className={styles.doneTitle} id="review-dialog-title">
                Thank you
              </h2>
              {/* The API's own wording, so what a visitor is told matches what
                  actually happened to their review. */}
              <p className={styles.doneBody}>{state.message}</p>
              <button type="button" className="btn btn--primary" onClick={close}>
                Close
              </button>
            </div>
          ) : (
            <>
              <div className={styles.panelHead}>
                <h2 className={styles.title} id="review-dialog-title">
                  {form.title}
                </h2>
                {form.note ? <p className={styles.note}>{form.note}</p> : null}
              </div>

              <form className={styles.form} action={action}>
                {/* Its own row. The name used to be paired with "Role or
                    company"; with that gone, half a row for one field would
                    leave an obvious hole beside it. */}
                <Field
                  name="authorName"
                  label="Your name"
                  required
                  autoComplete="name"
                  error={state.fieldErrors?.authorName}
                  defaultValue={state.values?.authorName}
                />

                <div className={styles.row}>
                  <Field
                    name="authorEmail"
                    label="Email"
                    type="email"
                    placeholder="Optional"
                    autoComplete="email"
                    /* Said plainly, because a form that asks for an email
                       without saying what happens to it is a form people
                       abandon. */
                    hint="Only so we can reach you about this review — never published."
                    error={state.fieldErrors?.authorEmail}
                    defaultValue={state.values?.authorEmail}
                  />
                  <Field
                    name="authorPhone"
                    label="Phone"
                    type="tel"
                    placeholder="Optional"
                    autoComplete="tel"
                    error={state.fieldErrors?.authorPhone}
                    defaultValue={state.values?.authorPhone}
                  />
                </div>

                {/*
                  The star picker, when the company asked for one. Radio inputs
                  rather than buttons and a hidden field: a radio group is what
                  this is, so it arrives in the FormData on its own, works with
                  a keyboard for free, and needs no JavaScript to submit.
                */}
                {form.showRating ? (
                  <fieldset className={styles.rating}>
                    <legend className={styles.label}>Your rating</legend>
                    <div className={styles.stars}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <label
                          className={`${styles.star} ${value <= rating ? styles.starOn : ''}`}
                          key={value}
                        >
                          <input
                            className="sr-only"
                            type="radio"
                            name="rating"
                            value={value}
                            checked={rating === value}
                            onChange={() => setRating(value)}
                          />
                          <span className="sr-only">
                            {value} {value === 1 ? 'star' : 'stars'}
                          </span>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.95z" />
                          </svg>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <Field
                  name="body"
                  label="Your review"
                  required
                  textarea
                  placeholder="What did we do, and how did it go?"
                  error={state.fieldErrors?.body}
                  defaultValue={state.values?.body}
                />

                {/*
                  The failure message, announced rather than only shown: a
                  submit that fails moves nothing on screen for someone not
                  looking at this corner of the dialog.
                */}
                {state.status === 'error' ? (
                  <p className={styles.error} role="alert">
                    {state.message}
                  </p>
                ) : null}

                <div className={styles.actions}>
                  <button type="button" className="btn btn--ghost" onClick={close}>
                    Cancel
                  </button>
                  <Submit />
                </div>
              </form>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

/** The send button, which knows on its own whether the action is in flight. */
function Submit() {
  const { pending } = useFormStatus();

  return (
    <button className={`btn btn--primary ${styles.submit}`} type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Send review'}
    </button>
  );
}

/**
 * One field, with its label, its optional hint and whatever the API said about
 * it. Written out once because there are five of them, and a form where two
 * fields are marked up differently is a form that looks broken.
 *
 * The fields are uncontrolled — the FormData the action reads is the DOM's, not
 * React's — with one exception forced by React: it resets an uncontrolled form
 * as soon as its action completes, success or failure. `defaultValue` is what
 * puts a rejected submission back, and it works because a failed submit returns
 * a new state object, so the whole form remounts with the values in hand.
 */
function Field({
  name,
  label,
  error,
  hint,
  textarea = false,
  ...props
}: {
  name: TestimonialField;
  label: string;
  error?: string;
  hint?: string;
  textarea?: boolean;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  /** What was submitted last time, when the submit failed. See `SubmitState`. */
  defaultValue?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;

  const shared = {
    id: name,
    name,
    className: `${styles.input} ${error ? styles.inputError : ''}`,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
    ...props,
  };

  return (
    <p className={styles.field}>
      <label className={styles.label} htmlFor={name}>
        {label}
        {props.required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {textarea ? <textarea {...shared} rows={5} /> : <input {...shared} />}

      {hint ? (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className={styles.fieldError} id={errorId}>
          {error}
        </span>
      ) : null}
    </p>
  );
}
