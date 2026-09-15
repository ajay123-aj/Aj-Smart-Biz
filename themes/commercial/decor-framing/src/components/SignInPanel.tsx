'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { startSignIn, verifySignIn } from '@/app/actions/account';
import { IDLE_ACCOUNT } from '@/lib/customer';
import styles from './Account.module.css';

/**
 * Signing in, and registering, as **one** journey.
 *
 * Not two tabs, and not a choice anybody has to make up front. From the
 * customer's side the difference between "I have an account" and "I do not" is a
 * question they should not have to answer before they know which one is true —
 * and on a shop of this kind most people genuinely do not remember.
 *
 * So there is one field to begin with: the number. The **shop** then decides
 * which of the three things happens next, and the person is simply taken there:
 *
 *   known      the code step, with a code already on its way
 *   not known  the sign-up step, **with the number already filled in** — nobody
 *              is told a code is coming and left waiting for a message that was
 *              never sent, and nobody has to work out for themselves that they
 *              were supposed to register instead
 *   barred     neither will help, so it says to get in touch
 *
 * That the API can answer "not known" at all is a deliberate trade, made for
 * exactly this: see the note on `registered` in its `requestOtp`.
 *
 * **There is no password anywhere**, which is the whole point: a password on a
 * shop account is a thing to forget, to reset over email, and to be blamed for
 * when it leaks, and the entire value of the account is remembering an address
 * and an order history.
 */
export default function SignInPanel({ companyName }: { companyName: string }) {
  const [started, startAction] = useActionState(startSignIn, IDLE_ACCOUNT);
  const [verified, verifyAction] = useActionState(verifySignIn, IDLE_ACCOUNT);

  /**
   * A way back to the number, for somebody who mistyped it.
   *
   * Local, because it is the one transition the **person** makes rather than the
   * API: every other step is decided by what the shop answered. Cleared as the
   * number form submits, so the API's next answer takes over again.
   */
  const [backToPhone, setBackToPhone] = useState(false);

  /**
   * Which step is showing, decided by the **API's** answer rather than by a
   * toggle the person has to find. `verified` losing its step is what sends
   * somebody back to the number after a failure they cannot recover from.
   */
  const step = backToPhone || verified.step === 'phone' ? 'phone' : started.step ?? 'phone';
  const phone = verified.phone || started.phone || '';

  if (verified.step === 'done') {
    /* The page re-renders signed-in on the next request; this is the frame in
       between, and saying nothing there reads as a form that did nothing. */
    return <p className={styles.note}>{verified.message} Loading your account…</p>;
  }

  /* ------------------------------------------------------------------ *
   * Step one: the number
   * ------------------------------------------------------------------ */

  if (step === 'phone') {
    return (
      <div className={styles.panel}>
        <form action={startAction} className={styles.form} onSubmit={() => setBackToPhone(false)}>
          <h2 className={styles.title}>Your {companyName} account</h2>
          <p className={styles.lede}>
            Enter your mobile number. We will send you a code — there is no password to remember,
            and we will set you up if you are new.
          </p>

          <label className={styles.field}>
            <span className={styles.label}>Mobile number</span>
            <input
              className={styles.input}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={phone}
              autoFocus
              required
            />
          </label>

          {started.status === 'error' ? <p className={styles.bad}>{started.message}</p> : null}

          <Submit label="Continue" />
        </form>
      </div>
    );
  }

  /* ------------------------------------------------------------------ *
   * Step two, for somebody new: the rest of their details
   * ------------------------------------------------------------------ */

  if (step === 'register') {
    return (
      <div className={styles.panel}>
        <form action={startAction} className={styles.form}>
          <h2 className={styles.title}>Let us set you up</h2>
          <p className={styles.lede}>{started.message}</p>

          {/*
            The number they already typed, shown filled in rather than asked for
            again. Editable, because the commonest reason somebody lands here is a
            typo in it — and being sent back to the first step to fix one digit is
            the thing that loses the registration.
          */}
          <label className={styles.field}>
            <span className={styles.label}>Mobile number</span>
            <input
              className={styles.input}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={phone}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Your name</span>
            <input className={styles.input} name="name" autoComplete="name" autoFocus required />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>
              Email <span className={styles.optional}>(optional)</span>
            </span>
            <input className={styles.input} name="email" type="email" autoComplete="email" />
          </label>

          {started.status === 'error' ? <p className={styles.bad}>{started.message}</p> : null}

          <Submit label="Create my account" />

          {/* Not a nested form — that is invalid HTML and the browser drops it.
              Going back to the number is the one step the person makes rather
              than the shop, so it is local state. */}
          <button type="button" className={styles.switch} onClick={() => setBackToPhone(true)}>
            Use a different number
          </button>
        </form>
      </div>
    );
  }

  /* ------------------------------------------------------------------ *
   * Step three: the code
   * ------------------------------------------------------------------ */

  return (
    <div className={styles.panel}>
      <form action={verifyAction} className={styles.form}>
        <h2 className={styles.title}>Enter your code</h2>
        <p className={styles.lede}>
          We sent a 6-digit code to <strong>{phone}</strong>.
        </p>

        {/* Carried rather than kept in state alone, so a reload mid-sign-in still
            knows whose code this is. */}
        <input type="hidden" name="phone" value={phone} />

        <label className={styles.field}>
          <span className={styles.label}>Code</span>
          <input
            className={`${styles.input} ${styles.code}`}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            required
          />
        </label>

        {/*
          Shown only while the shop has no SMS gateway connected — the API says so
          and labels it, and printing it plainly is the difference between a
          feature nobody can try and one that silently appears broken.
        */}
        {started.devCode ? (
          <p className={styles.dev}>
            No SMS is connected yet, so your code is <strong>{started.devCode}</strong>.
          </p>
        ) : null}

        {verified.status === 'error' ? (
          <>
            <p className={styles.bad}>{verified.message}</p>
            {/* While the shop has no SMS gateway the API says *why* it refused,
                labelled as a development detail. It disappears the moment a
                provider is connected, along with the code above it. */}
            {verified.detail ? <p className={styles.dev}>{verified.detail}</p> : null}
          </>
        ) : null}

        <Submit label="Sign in" />

        {/*
          `formAction` rather than a nested form: a form inside a form is invalid
          HTML and the browser throws the inner one away, so the button would have
          done nothing at all. This submits the same fields to the other action,
          which genuinely issues a new code — a state reset would only have
          pretended to.
        */}
        <button
          type="submit"
          formAction={startAction}
          /**
           * `formNoValidate` because the code box is `required`, and without it
           * the browser refuses to submit until something is typed into the very
           * field this button exists to get a new value for. The button appeared
           * to do nothing at all, which is exactly when somebody reaches for it.
           */
          formNoValidate
          className={styles.switch}
        >
          Send a new code
        </button>
      </form>
    </div>
  );
}

/**
 * The button, and what it says while the action is in flight.
 *
 * `useFormStatus` has to be read by a **child** of the form, which is the whole
 * reason this is its own component rather than three lines inline.
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? 'One moment…' : label}
    </button>
  );
}
