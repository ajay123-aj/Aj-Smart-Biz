'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const {
  BOOKING_HOLDS_SLOT,
  BOOKING_TRANSITIONS,
  BOOKING_DEFAULTS,
  BOOKING_SLOTS_PER_DAY_MAX,
  SERVICE_SLOT_CAPACITY_MAX,
} = require('../constants');

/**
 * The diary: what a company's working day is cut into, and what is left of it.
 *
 * **The one place that decides whether a slot is free.** The website asks it to
 * paint a day, and the write route asks it again before it accepts a booking -
 * the same function, the same answer, so a visitor can never be shown a time
 * that the API will then refuse, and two people racing for the last chair cannot
 * both be told yes.
 *
 * ### Why there is no `slots` table
 *
 * A slot is not a thing a company owns; it is arithmetic over three facts it
 * already has - the hours it works, the length of its grid, and what is already
 * booked. Materialising them would mean a row per service per slot per day
 * forever, a job to generate next month's, and a second place for "are you open
 * on Sunday" to be answered differently. Generating on read costs one query.
 *
 * ### Times are the company's own
 *
 * `09:30` means half past nine **where the shop is**, and it is stored and
 * compared as that string rather than as a timestamp. Turning it into UTC would
 * make the diary depend on the server's time zone, and would move every existing
 * appointment by an hour the day the country changed its clocks. The only place
 * a real instant is needed is the lead-time check, and that resolves the
 * company's own `timezone` before comparing.
 */

/** `09:30` -> 570. NaN-safe: an unparseable time is treated as absent. */
const toMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

/** 570 -> `09:30`. */
const toClock = (minutes) => {
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(whole).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

/**
 * The booking half of the services settings blob, normalised.
 *
 * Everything is validated on the way **out** as well as on the way in, the same
 * double check the order mode and the testimonial mode get. These values decide
 * what a stranger is promised, so a blob that somehow holds nonsense - a close
 * time before the open time, a grid of zero minutes - has to fail closed onto
 * the platform's defaults rather than generate an infinite day.
 */
function bookingSettings(stored) {
  const settings = stored && typeof stored === 'object' ? stored : {};

  const open = toMinutes(settings.openTime) ?? toMinutes(BOOKING_DEFAULTS.openTime);
  const close = toMinutes(settings.closeTime) ?? toMinutes(BOOKING_DEFAULTS.closeTime);

  const days = Array.isArray(settings.days)
    ? [...new Set(settings.days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : BOOKING_DEFAULTS.days;

  const slotMinutes = Number(settings.slotMinutes) > 0 ? Number(settings.slotMinutes) : BOOKING_DEFAULTS.slotMinutes;

  return {
    /**
     * No `enabled` here any more.
     *
     * Whether a tenant takes appointments is the `service_booking` grant -
     * granted, switched on, still served - decided by the one service that
     * decides every other feature on the platform. A second switch inside these
     * settings was a second answer to the same question, and the two could
     * disagree.
     */
    days: days.length ? days.sort() : BOOKING_DEFAULTS.days,
    /* A close at or before the open would generate nothing; the defaults are a
       working day, which is a better answer than a blank diary. */
    openTime: toClock(close > open ? open : toMinutes(BOOKING_DEFAULTS.openTime)),
    closeTime: toClock(close > open ? close : toMinutes(BOOKING_DEFAULTS.closeTime)),
    slotMinutes,
    /**
     * How many bookings one slot holds, company-wide.
     *
     * Clamped rather than trusted: a blob holding 0 would produce a diary where
     * every slot is full the moment it is drawn, and one holding 500 would sell
     * a morning the shop cannot work. A service may override it - see
     * `capacityFor` - but neither value may leave these bounds.
     */
    slotCapacity: Math.min(
      Math.max(1, Number(settings.slotCapacity) || BOOKING_DEFAULTS.slotCapacity),
      SERVICE_SLOT_CAPACITY_MAX
    ),
    leadHours: Number.isFinite(Number(settings.leadHours)) && Number(settings.leadHours) >= 0
      ? Number(settings.leadHours)
      : BOOKING_DEFAULTS.leadHours,
    horizonDays: Number(settings.horizonDays) > 0 ? Number(settings.horizonDays) : BOOKING_DEFAULTS.horizonDays,
    note: settings.note || BOOKING_DEFAULTS.note,
  };
}

/**
 * How many bookings one slot of **this** service holds.
 *
 * The company's own limit, unless the service overrides it. Which is the right
 * way round: the shop's capacity is a fact about the shop - three chairs, two
 * vans - and saying it once is what stops a tenant setting it on forty services
 * and missing one. The override exists because the binding constraint is
 * sometimes the work rather than the business: one colourist in a salon with
 * three chairs still takes one booking at ten.
 *
 * `null` on the service means "use the company's". A number means the service
 * has an answer of its own, and it wins even when it is smaller.
 */
const capacityFor = (service, settings) => {
  const own = service?.slotCapacity;
  const resolved = own === null || own === undefined || own === '' ? settings.slotCapacity : Number(own);
  return Math.min(Math.max(1, resolved || 1), SERVICE_SLOT_CAPACITY_MAX);
};

/** `2026-09-14` -> a Date at local midnight. Null for anything else. */
const parseDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Today, in the company's own day, as `YYYY-MM-DD`. */
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const addDays = (iso, days) => {
  const date = parseDay(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Every slot a service occupies if it starts at `start`.
 *
 * A 45-minute treatment on a 30-minute grid takes two, and the second one has to
 * be counted as taken or the salon books somebody into the middle of a haircut.
 * This is what makes duration mean anything at all.
 */
const slotsSpanned = (start, durationMinutes, slotMinutes) => {
  const count = Math.max(1, Math.ceil((durationMinutes || slotMinutes) / slotMinutes));
  const startedAt = toMinutes(start);
  if (startedAt === null) return [];

  return Array.from({ length: count }, (unused, index) => toClock(startedAt + index * slotMinutes));
};

/**
 * What is already taken on one day, as a map of `HH:mm` -> how many.
 *
 * Counts the states that **hold** a slot - requested and accepted. A declined or
 * cancelled booking gives its time back immediately, which is the behaviour a
 * shop expects: refusing Thursday at ten should put Thursday at ten back on the
 * website, not leave a hole nobody can book.
 *
 * Every row's whole span is counted, not just its start; see `slotsSpanned`.
 */
async function takenBetween(companyId, serviceId, from, to, slotMinutes, transaction = null) {
  const rows = await db.ServiceLead.findAll({
    where: {
      companyId,
      serviceId,
      bookingDate: { [Op.between]: [from, to] },
      bookingStatus: { [Op.in]: BOOKING_HOLDS_SLOT },
    },
    attributes: ['bookingDate', 'bookingTime', 'bookingMinutes'],
    transaction,
    /* The capacity check reads this inside the booking transaction, so it must
       see the rows another booking is in the middle of writing. */
    ...(transaction ? { lock: transaction.LOCK?.UPDATE } : {}),
  });

  const byDate = new Map();
  rows.forEach((row) => {
    /* DATEONLY comes back as a string on MySQL and can arrive as a Date on
       other dialects; both are reduced to the `YYYY-MM-DD` the rest of this
       file speaks. */
    const date = String(row.bookingDate).slice(0, 10);
    const taken = byDate.get(date) ?? new Map();

    slotsSpanned(row.bookingTime, row.bookingMinutes, slotMinutes).forEach((slot) => {
      taken.set(slot, (taken.get(slot) ?? 0) + 1);
    });

    byDate.set(date, taken);
  });

  return byDate;
}

/** One day's holds. A thin wrapper for the single-day callers. */
async function takenOn(companyId, serviceId, date, slotMinutes, transaction = null) {
  const byDate = await takenBetween(companyId, serviceId, date, date, slotMinutes, transaction);
  return byDate.get(date) ?? new Map();
}

/**
 * One day of the diary for one service: every slot, and whether it can be had.
 *
 * Returns the whole grid rather than only the free times, with a `reason` on
 * anything unavailable. A row of gaps tells a visitor the shop is busy; a short
 * list of three times tells them nothing about whether they are early, late, or
 * looking at a half-booked Saturday.
 *
 * Four ways a slot can be refused, and they are different facts:
 *
 *   closed    the shop does not work that day at all
 *   past      the time has gone, or is inside the notice the company asked for
 *   full      as many people are booked as the service can take at once
 *   overrun   the appointment would not finish before closing time
 *
 * `settings` is the **booking half** of the services blob - what `bookingSettings`
 * returns, not the whole thing. Every caller in this file and both in the public
 * controller pass `settings.booking`; the diary knows about hours and grids and
 * nothing about eyebrows and button labels.
 */
function buildDay({ service, settings, date, taken = new Map() }) {
  const day = parseDay(date);
  if (!day) throw ApiError.badRequest('Send a date as YYYY-MM-DD');

  const first = today();
  const last = addDays(first, settings.horizonDays);

  if (date < first) return { date, open: false, reason: 'past', slots: [] };
  if (date > last) return { date, open: false, reason: 'beyond', slots: [] };
  if (!settings.days.includes(day.getDay())) return { date, open: false, reason: 'closed', slots: [] };

  const open = toMinutes(settings.openTime);
  const close = toMinutes(settings.closeTime);
  const step = settings.slotMinutes;
  const duration = service.durationMinutes || step;
  const capacity = capacityFor(service, settings);

  /**
   * The earliest a booking may start: now plus the notice the company asked
   * for. Compared in the *company's* day rather than in UTC, which is what makes
   * "two hours' notice" mean two hours to the person answering the phone.
   */
  const notice = new Date(Date.now() + settings.leadHours * 3600000);
  const noticeDay = `${notice.getFullYear()}-${String(notice.getMonth() + 1).padStart(2, '0')}-${String(
    notice.getDate()
  ).padStart(2, '0')}`;
  const noticeMinutes = notice.getHours() * 60 + notice.getMinutes();

  const slots = [];
  for (let start = open; start + step <= close && slots.length < BOOKING_SLOTS_PER_DAY_MAX; start += step) {
    const time = toClock(start);

    /* Every slot this appointment would occupy has to be free, and the last of
       them has to end before closing. */
    const span = slotsSpanned(time, duration, step);
    const endsAt = start + Math.max(1, Math.ceil(duration / step)) * step;

    /**
     * How many of this slot are gone.
     *
     * The **worst** slot in the span, not the first: a 90-minute treatment on a
     * 30-minute grid occupies three, and if the middle one is full the
     * appointment cannot happen however empty its start looks. Reporting the
     * maximum is what makes "2 left" mean two bookable appointments rather than
     * two free half-hours that do not line up.
     */
    const booked = span.reduce((worst, slot) => Math.max(worst, taken.get(slot) ?? 0), 0);

    let reason = null;
    if (date === noticeDay && start < noticeMinutes) reason = 'past';
    else if (date < noticeDay) reason = 'past';
    else if (endsAt > close) reason = 'overrun';
    else if (booked >= capacity) reason = 'full';

    slots.push({
      time,
      available: reason === null,
      reason,
      /* What the website prints under the time: how many are taken, out of how
         many the shop can do at once, and what is left. */
      booked,
      capacity,
      left: Math.max(0, capacity - booked),
    });
  }

  return {
    date,
    open: true,
    reason: null,
    /** What the visitor is committing to, so the page can say "30 minutes". */
    minutes: duration,
    /** The limit in force for this service today - the company's, or its own. */
    capacity,
    slots,
  };
}

/**
 * One day of the diary, fetched and built.
 *
 * The query and the arithmetic are separate - see `buildDay` - because the
 * calendar needs a fortnight of days and one query per day would be a fortnight
 * of queries for a page nobody has scrolled yet.
 */
async function slotsFor({ company, service, settings, date, transaction = null }) {
  const step = settings.slotMinutes;
  const taken = await takenOn(company.id, service.id, date, step, transaction);
  return buildDay({ service, settings, date, taken });
}

/**
 * Take a slot, or refuse it.
 *
 * Called inside the booking transaction, **after** the same generator the
 * website painted the page with - so the check that lets a booking through is
 * the check that drew the button, and a time that disappeared while somebody was
 * typing their name is refused with a message that says so.
 */
async function assertSlotFree({ company, service, settings, date, time, transaction }) {
  const day = await slotsFor({ company, service, settings, date, transaction });

  if (!day.open) {
    throw ApiError.badRequest(
      day.reason === 'closed'
        ? 'We are not open that day - please pick another'
        : 'That date is outside the days we are taking bookings for'
    );
  }

  const slot = day.slots.find((entry) => entry.time === time);
  if (!slot) throw ApiError.badRequest('That is not one of our times - please pick a slot from the list');

  if (!slot.available) {
    throw ApiError.badRequest(
      slot.reason === 'full'
        ? 'Somebody has just taken that time - please pick another'
        : 'That time has passed - please pick another'
    );
  }

  return day.minutes;
}

/**
 * The next few days that have anything free, for the page's date picker.
 *
 * Looked up rather than left to the visitor to hunt for: a salon closed on
 * Sunday and Monday and fully booked on Tuesday should not make somebody click
 * through three empty days to find Wednesday.
 *
 * Capped at `limit` days of *answers*, and at the horizon in days scanned, so
 * this is a bounded amount of work however empty the diary is.
 */
async function nextOpenDays({ company, service, settings, limit = 14 }) {
  const start = today();
  const end = addDays(start, settings.horizonDays);

  /* **One** query for the whole horizon, then the arithmetic in memory. A query
     per day would be thirty round trips to paint a date picker. */
  const byDate = await takenBetween(company.id, service.id, start, end, settings.slotMinutes);

  const days = [];
  for (let offset = 0; offset <= settings.horizonDays && days.length < limit; offset += 1) {
    const date = addDays(start, offset);
    const day = buildDay({ service, settings, date, taken: byDate.get(date) ?? new Map() });
    if (!day.open) continue;

    const free = day.slots.filter((slot) => slot.available).length;
    if (free) days.push({ date, free });
  }

  return days;
}

/** Whether a status change is one the booking is allowed to make. */
const canMove = (from, to) => (BOOKING_TRANSITIONS[from] ?? []).includes(to);

module.exports = {
  bookingSettings,
  capacityFor,
  buildDay,
  slotsFor,
  takenBetween,
  assertSlotFree,
  nextOpenDays,
  takenOn,
  slotsSpanned,
  toMinutes,
  toClock,
  parseDay,
  today,
  addDays,
  canMove,
};
