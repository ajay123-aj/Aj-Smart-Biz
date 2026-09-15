'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { bookSlot, loadDiary } from '@/app/actions/book-service';
import { SERVICES_COPY } from '@/config/site';
import { INITIAL_BOOKING_STATE, dayLabel, timeLabel, type DiaryView, type Slot } from '@/lib/booking';
import type { ServiceBooking } from '@/lib/company';
import styles from './BookingPanel.module.css';

/**
 * Picking a time, on a service's own page.
 *
 * ### Why the diary is fetched rather than sent
 *
 * Every other section of this site renders from the payload the layout already
 * has. A diary cannot: it is different for every service and every day, it
 * changes while somebody is looking at it, and a page that shipped a fortnight
 * of slots would be stale by the time it was read. So the panel asks for one day
 * at a time, through a Server Action — the API's address never reaches the
 * browser, and neither does the customer's token.
 *
 * ### The times are the shop's, not the reader's
 *
 * `09:30` means half past nine **where the business is**. Nothing here converts
 * it: a visitor in another time zone booking a framing consultation is booking
 * it at the time
 * printed on the shop's door, and "helpfully" shifting it by five and a half
 * hours would be wrong in the one way that cannot be recovered from.
 *
 * ### Three states, and none of them is a spinner over the whole page
 *
 * Loading a day replaces the slot grid only, so the day picker stays usable and
 * the heading does not jump. A failed load shows "nothing free" rather than an
 * error, because from the visitor's side those are the same fact.
 */
export default function BookingPanel({
  service,
  booking,
  signedInAs,
  initial,
}: {
  service: { id: number; slug: string; title: string };
  booking: ServiceBooking;
  /** The signed-in customer, when there is one. The API is the authority. */
  signedInAs: { name: string; phone: string } | null;
  /** The first day, resolved on the server so the panel renders filled in. */
  initial: DiaryView | null;
}) {
  const [state, action] = useActionState(bookSlot, INITIAL_BOOKING_STATE);

  const [diary, setDiary] = useState<DiaryView | null>(initial);
  const [date, setDate] = useState(initial?.day.date ?? '');
  const [time, setTime] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  /**
   * Whoever is looking has to sign in first.
   *
   * The API's answer, carried in the payload and enforced again by the write
   * route — this only decides what the panel *says*. A page that merely hid the
   * form would be a suggestion.
   */
  const mustSignIn = booking.requiresSignIn && !signedInAs;

  /** Reload the grid when the day changes, leaving the rest of the panel alone. */
  const pickDay = (next: string) => {
    setDate(next);
    setTime(null);
    startLoading(async () => {
      const loaded = await loadDiary(service.slug, next);
      setDiary(loaded);
    });
  };

  /**
   * A time that stops being available while somebody is deciding.
   *
   * The grid is refetched after a refusal, so the person sees the same answer
   * the API just gave rather than a button that keeps failing.
   */
  useEffect(() => {
    if (state.status !== 'error' || !date) return;
    loadDiary(service.slug, date).then(setDiary);
    setTime(null);
  }, [state, date, service.slug]);

  if (state.status === 'success' && state.booking) {
    return (
      <section className={styles.panel} aria-live="polite">
        <h2 className={styles.heading}>{SERVICES_COPY.bookRequested}</h2>
        <p className={styles.confirmed}>
          <strong>{dayLabel(state.booking.date)}</strong> at <strong>{timeLabel(state.booking.time)}</strong>
        </p>
        <p className={styles.note}>{SERVICES_COPY.bookWhatNext}</p>
      </section>
    );
  }

  const day = diary?.day ?? null;
  const free = day?.slots.filter((slot) => slot.available) ?? [];

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>{SERVICES_COPY.bookHeading}</h2>
      <p className={styles.note}>{booking.note}</p>

      {/* The days the shop actually has something left on. Rendered as buttons
          rather than a date input: a visitor should not have to discover by
          clicking that the workshop is closed on Sundays. */}
      {diary?.openDays.length ? (
        <div className={styles.days} role="group" aria-label={SERVICES_COPY.bookDate}>
          {diary.openDays.map((open) => (
            <button
              key={open.date}
              type="button"
              className={`${styles.day} ${open.date === date ? styles.dayOn : ''}`}
              aria-pressed={open.date === date}
              onClick={() => pickDay(open.date)}
            >
              <span className={styles.dayLabel}>{dayLabel(open.date)}</span>
              <span className={styles.dayFree}>{open.free} free</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* The grid. Every slot, with the taken ones disabled rather than removed —
          a row of gaps says the shop is busy, and three times says nothing. */}
      <div className={styles.slots} aria-busy={loading}>
        {day && !day.open ? (
          <p className={styles.empty}>{SERVICES_COPY.bookClosed}</p>
        ) : free.length === 0 ? (
          <p className={styles.empty}>{SERVICES_COPY.bookNoSlots}</p>
        ) : (
          day?.slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              className={`${styles.slot} ${slot.time === time ? styles.slotOn : ''}`}
              disabled={!slot.available || loading}
              aria-pressed={slot.time === time}
              /*
                What the count means, said for a screen reader too. "10:00 am,
                2 of 3 booked" is the whole state of that button; the visual
                line under it says the same thing to everybody else.
              */
              aria-label={`${timeLabel(slot.time)} — ${slotNote(slot)}`}
              onClick={() => setTime(slot.time)}
            >
              <span className={styles.slotTime}>{timeLabel(slot.time)}</span>
              {/*
                How full it is.

                Shown on every slot that can hold more than one booking, because
                on those the question is not only "can I have ten o'clock" but
                "is there room left" — and a disabled button with no reason on it
                reads as a website that is broken rather than a morning that is
                busy. A shop that takes one booking per slot has nothing to count,
                so nothing is printed.
              */}
              {slot.capacity > 1 || !slot.available ? (
                <span className={styles.slotNote}>{slotNote(slot)}</span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {state.status === 'error' ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      {mustSignIn ? (
        <div className={styles.signIn}>
          <p className={styles.note}>{SERVICES_COPY.bookSignInWhy}</p>
          {/* A real link to the account page rather than a dialog: the sign-in
              is a short flow of its own, and the slot is still here afterwards. */}
          <a className="btn btn--primary" href="/account">
            {SERVICES_COPY.bookSignIn}
          </a>
        </div>
      ) : (
        <form action={action} className={styles.form}>
          <input type="hidden" name="serviceId" value={service.id} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="time" value={time ?? ''} />

          {signedInAs ? (
            /* Signed in, so nobody is asked who they are — the API takes the
               name and number off the account, and would ignore these anyway. */
            <p className={styles.as}>
              {SERVICES_COPY.bookAs} <strong>{signedInAs.name}</strong>
            </p>
          ) : (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>{SERVICES_COPY.enquiryName}</span>
                <input name="name" required minLength={2} maxLength={150} autoComplete="name" />
              </label>
              <label className={styles.field}>
                <span>{SERVICES_COPY.enquiryPhone}</span>
                <input name="phone" required inputMode="tel" maxLength={20} autoComplete="tel" />
              </label>
            </div>
          )}

          <Submit disabled={!time} />

          {time ? (
            <p className={styles.chosen}>
              {dayLabel(date)} · {timeLabel(time)}
              {day?.minutes ? ` · ${day.minutes} min` : ''}
            </p>
          ) : (
            <p className={styles.chosen}>{SERVICES_COPY.bookChoose}</p>
          )}
        </form>
      )}
    </section>
  );
}

/**
 * What the line under a time says.
 *
 * Four different facts, and they are not interchangeable: a slot that is full is
 * a morning somebody else got to first, a slot in the past is one the shop asked
 * for notice on, and a slot that would overrun is one the appointment does not
 * fit into. Telling a visitor "unavailable" for all three leaves them clicking
 * the next one hoping.
 */
function slotNote(slot: Slot): string {
  if (slot.reason === 'full') return `${slot.booked} of ${slot.capacity} booked`;
  if (slot.reason === 'past') return 'too soon';
  if (slot.reason === 'overrun') return 'not enough time';
  if (slot.capacity > 1 && slot.booked > 0) return `${slot.left} of ${slot.capacity} left`;
  if (slot.capacity > 1) return `${slot.capacity} free`;
  return 'free';
}

/** The button, disabled until a time is picked and while the request is out. */
function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn btn--primary" disabled={disabled || pending}>
      {pending ? SERVICES_COPY.bookSending : SERVICES_COPY.bookConfirm}
    </button>
  );
}
