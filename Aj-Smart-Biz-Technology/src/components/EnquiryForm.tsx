'use client';

import { useEffect, useRef, useState } from 'react';
import Glyph from './Glyph';
import { submitEnquiryAction } from '@/app/actions/submit-enquiry';
import { deviceId } from '@/lib/tracking';
import type { BusinessType, Plan } from '@/lib/api';
import {
  EMPTY_ENQUIRY,
  OTHER_BUSINESS_TYPE,
  canSend,
  mailtoHref,
  whatsappHref,
  type EnquiryKind,
  type EnquiryPayload,
} from '@/lib/enquiry';
import styles from './EnquiryForm.module.css';

/**
 * The demo request, and the contact message — one component, because they are
 * the same form with a different opening line.
 *
 * **It posts to the API, then offers WhatsApp.** Submitting stores the enquiry
 * through `POST /website/enquiries`, so there is a record and a screen in the
 * super admin console listing it; the composed WhatsApp and email links are
 * then shown on the confirmation, because a message in a thread somebody is
 * already reading gets answered faster than a row in a table.
 *
 * **A failed send still shows those links.** The worst outcome here is a person
 * who wanted a website and could not tell us, so an API that is down costs us
 * the record rather than the lead.
 *
 * The lists and the contact details are props rather than imports: this is a
 * client component and cannot call `getSite` itself.
 */
export default function EnquiryForm({
  kind = 'demo',
  /** Pre-selected from `/demo?plan=`, when they came from a pricing card. */
  selectedPlan,
  submitLabel = 'Send',
  businessTypes,
  plans,
  whatsapp,
  email,
  shortName,
  /** Which page this was on, stored with the enquiry. */
  source,
}: {
  kind?: EnquiryKind;
  selectedPlan?: string;
  submitLabel?: string;
  businessTypes: BusinessType[];
  plans: Plan[];
  whatsapp?: string;
  email?: string;
  shortName?: string;
  source?: string;
}) {
  /**
   * One state object rather than nine `useState` calls.
   *
   * Every field is a plain string and they are always sent together, so
   * splitting them would only mean nine setters and nine chances to update the
   * wrong one.
   */
  const [values, setValues] = useState<EnquiryPayload>(() => ({
    ...EMPTY_ENQUIRY,
    plan: plans.find((plan) => plan.id === selectedPlan)?.name ?? '',
  }));

  /**
   * idle -> sending -> sent, or -> failed.
   *
   * `failed` is not a dead end: it renders the same handoff links as `sent`,
   * with an honest line above them. See the note at the top.
   */
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * Moves focus to the confirmation once it replaces the form.
   *
   * `role="status"` alone is not enough here. A live region announces changes
   * *within* itself; this one is inserted into the document already populated,
   * which several screen readers skip entirely. Focusing the heading is the
   * reliable half — it also puts a keyboard user at the top of the new card
   * rather than wherever the submit button used to be, which is now gone.
   */
  const doneRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === 'sent') doneRef.current?.focus();
  }, [status]);

  /**
   * The business-type select, held separately from `values.businessType`.
   *
   * The select's value is a slug or the sentinel; what goes *into* the message
   * is a readable name. Keeping the control's value apart from the composed
   * value is what lets "Something else" swap in a text box without the select
   * and the text box fighting over one variable.
   */
  const [typeChoice, setTypeChoice] = useState('');
  const isOther = typeChoice === OTHER_BUSINESS_TYPE;

  const set = <K extends keyof EnquiryPayload>(key: K, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onTypeChange = (slug: string) => {
    setTypeChoice(slug);
    /* The name for the message, resolved here so `values` always holds
       something a human can read rather than a slug. */
    if (slug === OTHER_BUSINESS_TYPE) {
      set('businessType', '');
    } else {
      set('businessType', businessTypes.find((type) => String(type.id) === slug)?.name ?? '');
    }
  };

  const ready = canSend(values);

  const whatsappLink = whatsappHref(kind, values, whatsapp, shortName);
  const mailLink = mailtoHref(kind, values, email, shortName);

  /**
   * Sent: the form is replaced, not annotated.
   *
   * Everything on this card answers the one question somebody has the moment
   * they press the button — *did that work, and what happens now* — and a form
   * still sitting under it invites them to fill it in again. On a **failure**
   * the form stays exactly where it was, because there the right next action is
   * to retry and nothing they typed should be lost.
   *
   * `role="status"` rather than `alert`: this is the expected outcome, so a
   * screen reader should hear it politely after the current phrase rather than
   * having the page interrupt itself.
   */
  if (status === 'sent') {
    const firstName = values.name.trim().split(/\s+/)[0];

    return (
      <div className={`card-surface ${styles.form} ${styles.done}`} role="status">
        <span className={styles.doneMark} aria-hidden="true">
          <Glyph name="check" />
        </span>

        {/* `tabIndex={-1}` makes it focusable without adding it to the tab
            order — see `doneRef`. */}
        <h3 className={styles.doneTitle} ref={doneRef} tabIndex={-1}>
          {firstName ? `Thank you, ${firstName}.` : 'Thank you.'}
        </h3>

        <p className={styles.doneLede}>
          {kind === 'demo'
            ? 'Your demo request is with us. We will call you back, usually the same working day.'
            : 'Your message is with us. We will come back to you within one working day.'}
        </p>

        <ul className={styles.doneList}>
          {contactSummary(values) ? (
            <li>
              <Glyph name="check" className={styles.doneTick} />
              <span>We reply on {contactSummary(values)}, in working hours.</span>
            </li>
          ) : null}
          <li>
            <Glyph name="check" className={styles.doneTick} />
            <span>Nothing to pay and nothing to sign — this was an enquiry, not an order.</span>
          </li>
          {values.plan.trim() ? (
            <li>
              <Glyph name="check" className={styles.doneTick} />
              <span>We will talk through the {values.plan.trim()} plan, and whether it fits.</span>
            </li>
          ) : null}
        </ul>

        {/*
          Still offered, because a message in a thread somebody is already
          reading gets answered faster than a row in a table. Secondary now:
          the enquiry is already safely stored, so this is a shortcut rather
          than the way to reach us.
        */}
        {whatsappLink || mailLink ? (
          <>
            <p className={styles.doneNudge}>In a hurry? Send the same details straight to us.</p>
            <div className={styles.actions}>
              {whatsappLink ? (
                <a
                  className={`btn btn--ghost ${styles.submit}`}
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Glyph name="message-circle" className={styles.submitIcon} />
                  Send on WhatsApp
                </a>
              ) : null}
              {mailLink ? (
                <a className={`btn btn--ghost ${styles.submit}`} href={mailLink}>
                  <Glyph name="mail" className={styles.submitIcon} />
                  Send by email
                </a>
              ) : null}
            </div>
          </>
        ) : null}

        {/*
          A way back, for the person enquiring about a second business. Clears
          the fields rather than keeping them: this is a new enquiry, and
          pre-filled boxes are how somebody accidentally sends the first one
          twice.
        */}
        <button
          type="button"
          className={styles.againLink}
          onClick={() => {
            setValues({ ...EMPTY_ENQUIRY });
            setTypeChoice('');
            setStatus('idle');
            setError(null);
          }}
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <div className={`card-surface ${styles.form}`}>
      <div className={styles.row}>
        <Field label="Your name" required>
          <input
            className={styles.input}
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Asha Patel"
            autoComplete="name"
          />
        </Field>

        <Field label="Business name">
          <input
            className={styles.input}
            value={values.businessName}
            onChange={(event) => set('businessName', event.target.value)}
            placeholder="Patel Traders"
            autoComplete="organization"
          />
        </Field>
      </div>

      <div className={styles.row}>
        <Field label="Phone or WhatsApp">
          <input
            className={styles.input}
            type="tel"
            value={values.phone}
            onChange={(event) => set('phone', event.target.value)}
            placeholder="+91 98765 43210"
            autoComplete="tel"
          />
        </Field>

        <Field label="Email">
          <input
            className={styles.input}
            type="email"
            value={values.email}
            onChange={(event) => set('email', event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>
      </div>

      {/*
        Said once, under the pair, rather than marking both with an asterisk.
        Two required-looking fields where only one is needed is the commonest
        reason a form like this gets abandoned halfway.
      */}
      <p className={styles.hint}>Leave whichever you would rather be reached on — one is enough.</p>

      <div className={styles.row}>
        <Field label="What kind of business?">
          <select
            className={styles.input}
            value={typeChoice}
            onChange={(event) => onTypeChange(event.target.value)}
          >
            <option value="">Choose your trade</option>
            {businessTypes.map((type) => (
              /* The id is the value: `slug` is nullable in the API and two
                 trades with no slug would collide on an empty string. */
              <option key={type.id} value={String(type.id)}>
                {type.name}
              </option>
            ))}
            {/* Always last, always present — see `OTHER_BUSINESS_TYPE`. */}
            <option value={OTHER_BUSINESS_TYPE}>Something else</option>
          </select>
        </Field>

        <Field label="City">
          <input
            className={styles.input}
            value={values.city}
            onChange={(event) => set('city', event.target.value)}
            placeholder="Ahmedabad"
            autoComplete="address-level2"
          />
        </Field>
      </div>

      {isOther ? (
        <Field label="Tell us the trade">
          <input
            className={styles.input}
            value={values.businessType}
            onChange={(event) => set('businessType', event.target.value)}
            placeholder="Solar panel installation"
            autoFocus
          />
        </Field>
      ) : null}

      <Field label="Interested in a plan?">
        <select
          className={styles.input}
          value={values.plan}
          onChange={(event) => set('plan', event.target.value)}
        >
          <option value="">Not sure yet — advise me</option>
          {plans.map((plan) => (
            /* The *name* is the value, because the name is what goes into the
               message. Nothing downstream needs the id. */
            <option key={plan.id} value={plan.name}>
              {plan.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Anything else we should know?">
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={values.message}
          onChange={(event) => set('message', event.target.value)}
          rows={4}
          placeholder="We are a two-branch clinic and want online appointments."
        />
      </Field>

      {/*
        A real submit, unlike the two links this used to be. It has to be: the
        enquiry is stored before anything else happens, and that needs a
        request, a pending state and somewhere to put a failure.
      */}
      <div className={styles.actions}>
        <button
          type="button"
          className={`btn btn--primary ${styles.submit}`}
          disabled={!ready || status === 'sending'}
          onClick={async () => {
            setStatus('sending');
            setError(null);
            /**
             * The browser's own tracking id, so the API can tie this enquiry
             * to the traffic that produced it — which campaign brought them,
             * and how many pages they read first.
             *
             * Read at submit rather than at mount: a visitor who blocked
             * storage on arrival may have allowed it since, and this is the
             * one moment the answer matters. Null is fine and common — the
             * enquiry is stored either way and simply goes unattributed.
             */
            const result = await submitEnquiryAction(kind, values, source, deviceId());
            if (result.ok) {
              setStatus('sent');
            } else {
              setStatus('failed');
              setError(result.error);
            }
          }}
        >
          <Glyph name="arrow-right" className={styles.submitIcon} />
          {status === 'sending' ? 'Sending…' : submitLabel}
        </button>
      </div>

      {/*
        The one validation message, and it appears only once they have started.
        Telling somebody their empty form is incomplete before they have typed
        anything is scolding them for not having finished.
      */}
      {!ready && values.name.trim() ? (
        <p className={styles.hint} role="status">
          Add a phone number or an email address so we can reply.
        </p>
      ) : null}

      {/*
        Failure only — success replaces the whole form above.

        The form stays put so nothing typed is lost, and the direct links are
        promoted to primary: the enquiry did *not* reach us, so this is now the
        way to get through rather than a shortcut.

        Still links rather than buttons that call `window.open`: a programmatic
        open after an await is what popup blockers stop, and a real link never
        is. Each is dropped when there is no number or address configured — a
        button that opens `wa.me/undefined` is worse than no button.
      */}
      {status === 'failed' ? (
        <div className={styles.failed} role="alert">
          <p className={styles.failedTitle}>That did not go through.</p>
          <p className={styles.small}>
            {error ?? 'Something went wrong.'} Nothing you typed has been lost — press the button
            again, or send the same details to us directly. Both reach the same people.
          </p>

          {whatsappLink || mailLink ? (
            <div className={styles.actions}>
              {whatsappLink ? (
                <a
                  className={`btn btn--primary ${styles.submit}`}
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Glyph name="message-circle" className={styles.submitIcon} />
                  Send on WhatsApp
                </a>
              ) : null}
              {mailLink ? (
                <a className={`btn btn--ghost ${styles.submit}`} href={mailLink}>
                  <Glyph name="mail" className={styles.submitIcon} />
                  Send by email
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className={styles.small}>
          No obligation and no card details. We store what you send here so we can call you back,
          and nothing else.
        </p>
      )}
    </div>
  );
}

/**
 * How we said we would reach them, in their own details.
 *
 * Echoing the number back is the cheapest reassurance on the card: it proves
 * we have it and it is the one thing they might have typed wrong. Phone first
 * because that is what a callback uses; email only where there is no number,
 * which the form's own rule allows.
 */
function contactSummary(values: EnquiryPayload): string {
  const phone = values.phone.trim();
  const email = values.email.trim();
  if (phone && email) return `${phone} or ${email}`;
  return phone || email;
}

/**
 * One labelled control.
 *
 * The label **wraps** its input rather than pointing at it by id, so no
 * `htmlFor` can go stale and two forms on one page cannot collide over an id.
 */
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
