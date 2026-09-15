'use client';

import { useState } from 'react';
import Glyph from './Glyph';
import { BUSINESS_TYPES } from '@/content/business-types';
import { PLANS } from '@/content/plans';
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
 * **Nothing is posted anywhere.** On submit it composes a message from what was
 * typed and hands it to the visitor's own WhatsApp or mail app; see
 * `lib/enquiry.ts`, which explains the trade and what changes when this should
 * start hitting an API instead.
 *
 * Two consequences worth knowing while reading this file:
 *
 *   - There is no pending state and no server error to render. The two buttons
 *     are links in disguise, so the only state is what has been typed.
 *   - Nothing is sent until the visitor presses a button, and what is sent is
 *     visible to them first, in an app they already trust.
 */
export default function EnquiryForm({
  kind = 'demo',
  /** Pre-selected from `/demo?plan=`, when they came from a pricing card. */
  selectedPlan,
  submitLabel = 'Send on WhatsApp',
}: {
  kind?: EnquiryKind;
  selectedPlan?: string;
  submitLabel?: string;
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
    plan: PLANS.find((plan) => plan.id === selectedPlan)?.name ?? '',
  }));

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
      set('businessType', BUSINESS_TYPES.find((type) => type.slug === slug)?.name ?? '');
    }
  };

  const ready = canSend(values);

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
            {BUSINESS_TYPES.map((type) => (
              <option key={type.slug} value={type.slug}>
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
          {PLANS.map((plan) => (
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
        Both actions are links, not buttons, because both navigate — `wa.me` in
        a new tab, `mailto:` in the mail client. Rendering them as buttons and
        calling `window.open` after an await is what gets blocked by popup
        blockers; a real link never is.

        `aria-disabled` plus `tabIndex={-1}` rather than removing the href: the
        control stays in the DOM in one place, so the layout does not shift as
        the visitor types their name and it becomes usable.
      */}
      <div className={styles.actions}>
        <a
          className={`btn btn--primary ${styles.submit}`}
          href={ready ? whatsappHref(kind, values) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!ready}
          tabIndex={ready ? undefined : -1}
        >
          <Glyph name="message-circle" className={styles.submitIcon} />
          {submitLabel}
        </a>

        <a
          className={`btn btn--ghost ${styles.submit}`}
          href={ready ? mailtoHref(kind, values) : undefined}
          aria-disabled={!ready}
          tabIndex={ready ? undefined : -1}
        >
          <Glyph name="mail" className={styles.submitIcon} />
          Send by email
        </a>
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

      <p className={styles.small}>
        No obligation and no card details. Your message goes straight to our WhatsApp or inbox —
        this page does not store anything.
      </p>
    </div>
  );
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
