'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitServiceEnquiry } from '@/app/actions/submit-service-enquiry';
import { SERVICES_COPY } from '@/config/site';
import {
  INITIAL_ENQUIRY_STATE,
  enquiryWhatsappHref,
  type EnquiryField,
} from '@/lib/service-enquiry';
import type { ServiceEnquiry } from '@/lib/company';
import styles from './ServiceEnquiryButton.module.css';

/**
 * A service card's button, and the dialog it opens.
 *
 * One component rather than two because they are one thing: the way a visitor
 * asks about a service. The button renders inside the card; the dialog goes to
 * the browser's top layer when opened, so where it sits in the markup does not
 * matter.
 *
 * A **native `<dialog>`** opened with `showModal()`, which is why there is no
 * focus-trap code here — the element gives us the trap, Escape, the inert
 * background, the `::backdrop` scrim and the right `aria-modal` semantics for
 * free. Same choice, for the same reasons, as `TestimonialForm`.
 *
 * ## Three tenants, three behaviours
 *
 * What happens on submit is the company's setting, decided by the API and
 * arriving as `enquiry.target`:
 *
 *   `whatsapp`  no server call at all. The button in the dialog is an anchor
 *               straight to `wa.me`, composed from what was typed. Nothing is
 *               stored, which is exactly what that setting means — and because
 *               it is a real link on a real click, no popup blocker touches it.
 *   `admin`     posted through the Server Action and confirmed in place.
 *   `both`      posted, then the confirmation carries a WhatsApp link to press.
 *               Not a window opened automatically: a popup opened after an
 *               `await` has lost its user gesture and gets blocked, so the
 *               reliable version is the honest one.
 *
 * The component is never rendered when the tenant has no working enquiry route
 * — the API sends `enquiry: null` and the card shows no button. Nothing here
 * checks for that.
 */
export default function ServiceEnquiryButton({
  service,
  companyName,
  enquiry,
  label,
  className,
}: {
  service: { id: number; title: string };
  companyName: string;
  enquiry: ServiceEnquiry;
  label: string;
  className?: string;
}) {
  const [state, action] = useActionState(submitServiceEnquiry, INITIAL_ENQUIRY_STATE);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  /** Live values, needed only by the WhatsApp-only route, which builds its own
      link as they type rather than submitting anything. */
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

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

  /* The page must not scroll behind an open dialog: `<dialog>` makes the
     background inert but does not stop it scrolling. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const directToWhatsapp = !enquiry.records && enquiry.whatsapp;
  const ready = name.trim().length >= 2 && phone.trim().length >= 6;

  const directHref =
    directToWhatsapp && enquiry.whatsapp
      ? enquiryWhatsappHref(enquiry.whatsapp, {
        service: service.title,
        company: companyName,
        name: name.trim(),
        phone: phone.trim(),
      })
      : null;

  const fieldError = (field: EnquiryField) => state.fieldErrors?.[field];

  return (
    <>
      <button type="button" className={`${styles.trigger} ${className ?? ''}`} onClick={() => setOpen(true)}>
        {label} →
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClose={() => setOpen(false)}
        /* A click on the backdrop lands on the dialog element itself; a click
           inside lands on a child. Comparing the target is the whole check. */
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        aria-labelledby={`enquiry-title-${service.id}`}
      >
        <div className={styles.panel}>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>

          {state.status === 'success' ? (
            /*
             * The confirmation. It replaces the form rather than sitting above
             * it — the enquiry is sent, and offering the same fields again
             * invites a second one nobody meant to send.
             */
            <div className={styles.done}>
              <span className={styles.tick} aria-hidden="true">
                ✓
              </span>
              <h3 className={styles.doneTitle}>{SERVICES_COPY.enquirySent}</h3>
              <p className={styles.doneNote}>{state.message}</p>

              {state.whatsappHref ? (
                <a
                  className={`btn btn--primary ${styles.whatsapp}`}
                  href={state.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {SERVICES_COPY.enquiryWhatsapp}
                </a>
              ) : null}

              <button type="button" className={styles.doneClose} onClick={() => setOpen(false)}>
                {SERVICES_COPY.enquiryClose}
              </button>
            </div>
          ) : (
            <>
              <p className={styles.eyebrow}>{service.title}</p>
              <h3 className={styles.title} id={`enquiry-title-${service.id}`}>
                {enquiry.title}
              </h3>
              <p className={styles.note}>{enquiry.note}</p>

              {state.status === 'error' ? (
                <p className={styles.error} role="alert">
                  {state.message}
                </p>
              ) : null}

              <form className={styles.form} action={directToWhatsapp ? undefined : action}>
                {/* Context the action needs and the visitor never sees. The API
                    takes the service's title from its own row; this copy is
                    only for composing the WhatsApp message. */}
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="serviceTitle" value={service.title} />
                <input type="hidden" name="companyName" value={companyName} />
                <input type="hidden" name="sourceUrl" value={typeof window === 'undefined' ? '' : window.location.href} />

                <label className={styles.field}>
                  <span className={styles.label}>{SERVICES_COPY.enquiryName}</span>
                  <input
                    className={styles.input}
                    name="name"
                    required
                    minLength={2}
                    maxLength={150}
                    autoComplete="name"
                    defaultValue={state.values?.name ?? ''}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {fieldError('name') ? <span className={styles.fieldError}>{fieldError('name')}</span> : null}
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>{SERVICES_COPY.enquiryPhone}</span>
                  <input
                    className={styles.input}
                    name="phone"
                    /* `tel` gets the number pad on a phone, which is most of
                       the people who will fill this in. */
                    type="tel"
                    required
                    maxLength={20}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder={SERVICES_COPY.enquiryPhoneHint}
                    defaultValue={state.values?.phone ?? ''}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                  {fieldError('phone') ? <span className={styles.fieldError}>{fieldError('phone')}</span> : null}
                </label>

                {directToWhatsapp ? (
                  /*
                   * Nothing is stored on this setting, so there is nothing to
                   * post: the button is a link to the chat, composed from the
                   * fields above. Disabled until both are filled, because a
                   * `wa.me` message with an empty name in it is worse than a
                   * button that waits.
                   */
                  <a
                    className={`btn btn--primary ${styles.submit} ${ready ? '' : styles.disabled}`}
                    href={directHref ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!ready}
                    onClick={(event) => {
                      if (!ready) event.preventDefault();
                      else setOpen(false);
                    }}
                  >
                    {SERVICES_COPY.enquiryWhatsapp}
                  </a>
                ) : (
                  <SubmitButton />
                )}

                <p className={styles.privacy}>{SERVICES_COPY.enquiryPrivacy}</p>
              </form>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * The submit button, split out for the one thing it needs: `useFormStatus`
 * reports the pending state of the form it is *inside*, so it has to be a child
 * of the form rather than a sibling holding the hook.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={`btn btn--primary ${styles.submit}`} disabled={pending}>
      {pending ? SERVICES_COPY.enquirySending : SERVICES_COPY.enquirySubmit}
    </button>
  );
}
