'use client';

import { useState } from 'react';
import styles from './EnquiryForm.module.css';

/**
 * The enquiry form.
 *
 * It has no server behind it, and that is the design rather than a shortcut:
 * the visitor fills it in and the button hands the composed message to their
 * WhatsApp or their mail app, so the platform never stores other people's
 * enquiries and no message ends up sitting unread in a table nobody has built
 * a screen for. The tenant already has an inbox and a phone; this fills them.
 *
 * Everything happens on submit, so nothing is sent anywhere until the visitor
 * presses the button — and what is sent is visible to them first, in the app
 * they know.
 */
interface Props {
  /** Where the composed message goes. */
  target: 'email' | 'whatsapp';
  /** The tenant's address, for the email target. */
  email: string | null;
  /** A finished `wa.me` link, for the WhatsApp target. */
  whatsappHref: string | null;
  companyName: string;
  note: string;
}

export default function EnquiryForm({ target, email, whatsappHref, companyName, note }: Props) {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('');

  /**
   * Whether this form can actually deliver anything. A form whose button leads
   * nowhere is worse than no form, so the parent is told to render nothing —
   * see the guard in the page.
   */
  const canSend = target === 'whatsapp' ? Boolean(whatsappHref) : Boolean(email);
  if (!canSend) return null;

  const subject = `Enquiry for ${companyName}`;
  const body = [
    message.trim(),
    '',
    `— ${name.trim() || 'A visitor'}${from.trim() ? ` (${from.trim()})` : ''}`,
  ].join('\n');

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (target === 'whatsapp' && whatsappHref) {
      // The href already carries the tenant's own default text; the visitor's
      // message replaces it rather than being appended to it.
      const url = new URL(whatsappHref);
      url.searchParams.set('text', body);
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
      return;
    }

    window.location.href =
      `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Your name</span>
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Asha Patel"
            autoComplete="name"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{target === 'whatsapp' ? 'Your number' : 'Your email'}</span>
          <input
            className={styles.input}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            type={target === 'whatsapp' ? 'tel' : 'email'}
            placeholder={target === 'whatsapp' ? '+91 98765 43210' : 'you@example.com'}
            autoComplete={target === 'whatsapp' ? 'tel' : 'email'}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>What do you need?</span>
        <textarea
          className={styles.textarea}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          required
          placeholder="A short line is enough to start."
        />
      </label>

      <div className={styles.foot}>
        <button className="btn btn--primary" type="submit">
          {target === 'whatsapp' ? 'Send on WhatsApp' : 'Send email'}
        </button>
        {/*
          Said plainly, because the button does something people do not expect
          from a web form: it opens their own app with the message ready.
        */}
        <span className={styles.note}>
          {target === 'whatsapp'
            ? 'Opens WhatsApp with your message ready to send.'
            : 'Opens your mail app with the message ready to send.'}
          {note ? ` ${note}` : ''}
        </span>
      </div>
    </form>
  );
}
