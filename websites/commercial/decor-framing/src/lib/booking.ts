/**
 * A booking's shapes, and where one starts.
 *
 * A plain module rather than part of the action, for the reason
 * `service-enquiry.ts` gives: a `'use server'` file may export **async functions
 * and nothing else**, so a constant beside the action is a runtime error rather
 * than a build one — exactly the kind that ships.
 */

/** One time in the shop's day, and whether it can be had. */
export interface Slot {
  /** `HH:mm` in the **company's** working day, never the reader's time zone. */
  time: string;
  available: boolean;
  /**
   * How many of this slot are gone, out of how many the shop can take at once.
   *
   * The **worst** slot across the appointment's whole span, not just its start:
   * a 90-minute treatment on a 30-minute grid occupies three, and a full one in
   * the middle stops the appointment however empty its start looks. So `left`
   * means bookable appointments, not free half-hours that may not line up.
   */
  booked: number;
  capacity: number;
  left: number;
  /**
   * Why not, when it is not.
   *
   *   past      gone, or inside the notice the company asked for
   *   full      as many people are booked as the service can take at once
   *   overrun   the appointment would not finish before closing time
   */
  reason: 'past' | 'full' | 'overrun' | null;
}

/** One day of the diary. `open: false` means the shop does not work that day. */
export interface DiaryDay {
  date: string;
  open: boolean;
  reason: 'past' | 'beyond' | 'closed' | null;
  /** How long this service takes, so the panel can say what is being booked. */
  minutes?: number;
  /** The limit in force for this service - the company's, or its own override. */
  capacity?: number;
  slots: Slot[];
}

export interface DiaryView {
  service: { id: number; slug: string; title: string; durationMinutes: number | null };
  /** Whether a slot needs a name attached to it. The API's answer. */
  requiresSignIn: boolean;
  day: DiaryDay;
  /** The next days with anything free, so nobody clicks through empty ones. */
  openDays: { date: string; free: number }[];
  from: string;
  to: string;
}

/** What a booking attempt comes back as. */
export interface BookingState {
  status: 'idle' | 'success' | 'error';
  message: string;
  /** The appointment, once it exists. `requested` until a person confirms it. */
  booking?: { date: string; time: string; minutes: number | null; status: string } | null;
}

export const INITIAL_BOOKING_STATE: BookingState = { status: 'idle', message: '' };

/** `2026-09-14` as a person reads it. Fixed locale and UTC, like every date here. */
export const dayLabel = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
};

/**
 * `14:30` as `2:30 pm`.
 *
 * Done by hand rather than through `Intl`, because the string is not an instant:
 * it is half past two **where the shop is**, and handing it to a date formatter
 * would drag the reader's own time zone into a fact that has nothing to do with
 * them.
 */
export const timeLabel = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;

  const suffix = hours < 12 ? 'am' : 'pm';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, '0')} ${suffix}`;
};
