'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const password = require('../utils/password');
const logger = require('../utils/logger');
const {
  STATUS,
  CUSTOMER_OTP_LENGTH,
  CUSTOMER_OTP_TTL_MINUTES,
  CUSTOMER_OTP_MAX_ATTEMPTS,
  CUSTOMER_OTP_DEV_CODE,
  CUSTOMER_ADDRESSES_MAX,
} = require('../constants');

/**
 * Customer identity: who they are, and how they prove it.
 *
 * ### One number, one customer
 *
 * `normalisePhone` is the whole of it. People type the same number five ways —
 * `+91 98250 11223`, `098250 11223`, `9825011223` — and a shop that ends up with
 * three accounts for one person has a customer list that cannot be counted, a
 * sign-in that sometimes finds the wrong history, and an order that is filed
 * under a number nobody will search for. So the digits are stripped to a
 * canonical form **on every route that takes a phone number**, and that form is
 * what is stored and compared.
 *
 * ### Sign-in is a code, not a password
 *
 * See `CUSTOMER_OTP_DEV_CODE` for why the code is fixed until an SMS gateway is
 * wired in, and `sendOtp` for the one place that decides it. What matters here is
 * that the decision lives in exactly one function, so connecting a real gateway
 * is a change to that function and nothing else.
 */

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/**
 * The one true shape of a phone number.
 *
 * Digits only, with the two prefixes that are unambiguous statements of intent
 * removed — the same two `subscriberNumber` strips for WhatsApp, and for the
 * same reason: `+91…` and `0…` are a country code and a trunk prefix, not part
 * of the number. A bare `919825011223` is left alone, because without a `+`
 * there is nothing to say the leading `91` is a country code rather than the
 * start of the number.
 */
function normalisePhone(raw) {
  const text = String(raw ?? '').trim();
  const international = /^(?:\+|00)/.test(text);

  let digits = text.replace(/\D/g, '');

  if (international) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    /* `91` is this platform's market. A deployment elsewhere changes this line
       and nothing else, because every comparison goes through here. */
    if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(2);
  }

  return digits.replace(/^0+/, '');
}

/**
 * This tenant's customer with that number, **including soft-deleted ones**.
 *
 * Deliberately paranoid-blind. A customer deleted today still occupies their own
 * phone number, and the same person coming back next year has to be able to
 * register — so the row is found and restored rather than inserted alongside,
 * which would give the shop two accounts for one person and split their history
 * down the middle.
 */
function findByPhone(companyId, phone, options = {}) {
  return db.Customer.findOne({
    where: { companyId, phone: normalisePhone(phone) },
    paranoid: false,
    ...options,
  });
}

/* ------------------------------------------------------------------ *
 * The one-time code
 * ------------------------------------------------------------------ */

/**
 * Whether the platform can actually send a code, or is standing in for a gateway
 * that does not exist yet.
 *
 * **One function decides it.** When an SMS provider is added, this is where it
 * goes: generate a real code, send it, and stop returning anything. Everything
 * else — the routes, the website, the expiry, the attempt counting — is already
 * written for that and does not change.
 */
const hasSmsGateway = () => false;

/**
 * Issue a code, store its hash, and say what to do with it.
 *
 * The code comes back in the return value **only while there is no gateway**,
 * and the route puts it in the response only then. That is not a hole left open
 * by accident: without it nobody could sign in at all on an install with no SMS
 * provider, which would make the whole feature untestable. The response says
 * plainly that it is a development code, so nothing about it looks like a
 * production arrangement.
 */
async function sendOtp(customer, transaction) {
  const code = hasSmsGateway()
    ? String(Math.floor(Math.random() * 10 ** CUSTOMER_OTP_LENGTH)).padStart(CUSTOMER_OTP_LENGTH, '0')
    : CUSTOMER_OTP_DEV_CODE;

  const expires = new Date(Date.now() + CUSTOMER_OTP_TTL_MINUTES * 60 * 1000);

  await customer.update(
    {
      /* Hashed, even though it is six digits and lives ten minutes: a plain code
         in a column is a code in a backup, a log line and a screen-share. */
      otpHash: await password.hash(code),
      otpExpiresAt: expires,
      /* A new code forgives the old one's wrong guesses. Otherwise somebody who
         mistyped five times could never sign in again without support. */
      otpAttempts: 0,
    },
    { transaction }
  );

  if (hasSmsGateway()) {
    /* The send goes here. Nothing else in this file changes. */
    logger.info(`OTP sent to customer ${customer.id}`);
    return { sent: true, devCode: null, expiresAt: expires };
  }

  return { sent: false, devCode: code, expiresAt: expires };
}

/**
 * Check a code, and spend it.
 *
 * ### One message for every failure
 *
 * A message distinguishing "no code was sent" from "that code is wrong" from
 * "that code expired" would tell somebody working through numbers which ones
 * have live codes on them. The customer is told one thing, always.
 *
 * **But the reason is not thrown away.** It is returned to the caller as
 * `reason`, which the route logs and — while there is no SMS gateway, exactly
 * like the dev code — puts in the response. Without it, "that code is not right"
 * is the only thing anybody has to go on, and a shop whose codes are silently
 * never being stored looks identical to a shop whose customers keep mistyping.
 *
 * ### The counting has to survive the failure
 *
 * The attempt counter used to be incremented and then **rolled back by the very
 * throw that refused the code** — both were inside the caller's transaction, so
 * five wrong guesses counted as none and the limit never fired. The write now
 * happens outside it: a refusal is a fact about the world, and the record of it
 * must outlive the rejection.
 */
async function verifyOtp(customer, code, transaction) {
  /* `reason` never reaches the customer — see the note above. */
  const refuse = (reason) => {
    const error = ApiError.unauthorized('That code is not right, or it has expired. Ask for a new one.');
    error.otpReason = reason;
    throw error;
  };

  if (!customer.otpHash || !customer.otpExpiresAt) {
    refuse('no code has been requested for this number, or it has already been used');
  }

  if (customer.otpExpiresAt.getTime() < Date.now()) {
    refuse(`the code expired at ${customer.otpExpiresAt.toISOString()}`);
  }

  if (customer.otpAttempts >= CUSTOMER_OTP_MAX_ATTEMPTS) {
    /**
     * The code is burned rather than left to be guessed at leisure — and burned
     * **outside** the caller's transaction, for the same reason the counter is:
     * the refusal below would otherwise roll the burn back and the code would
     * survive every attempt to stop it.
     */
    await customer.update({ otpHash: null, otpExpiresAt: null, otpAttempts: 0 });
    refuse(`too many wrong guesses (${CUSTOMER_OTP_MAX_ATTEMPTS}); the code has been cancelled`);
  }

  const matches = await password.compare(String(code ?? ''), customer.otpHash);

  if (!matches) {
    /* Outside the transaction on purpose. See the note above. */
    await customer.update({ otpAttempts: customer.otpAttempts + 1 });
    refuse(`the code did not match (attempt ${customer.otpAttempts} of ${CUSTOMER_OTP_MAX_ATTEMPTS})`);
  }

  await customer.update(
    {
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      phoneVerified: true,
      lastLoginAt: new Date(),
    },
    { transaction }
  );

  return customer;
}

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

/**
 * Exactly one default per customer, held here rather than by a constraint — a
 * partial unique index is not portable across the three dialects this runs on,
 * and the invariant is two lines either way.
 *
 * The **first** address saved becomes the default whether or not it was asked
 * for: a checkout has to start somewhere, and asking somebody with one address
 * to nominate it is a question with one answer.
 */
async function setDefaultAddress(companyId, customerId, addressId, transaction) {
  await db.CustomerAddress.update(
    { isDefault: false },
    { where: { companyId, customerId, isDefault: true }, transaction }
  );
  await db.CustomerAddress.update(
    { isDefault: true },
    { where: { id: addressId, companyId, customerId }, transaction }
  );
}

/** Refuses the eleventh. A list of places, not a database of them. */
async function assertAddressRoom(companyId, customerId, transaction) {
  const count = await db.CustomerAddress.count({ where: { companyId, customerId }, transaction });
  if (count >= CUSTOMER_ADDRESSES_MAX) {
    throw ApiError.badRequest(`You can keep up to ${CUSTOMER_ADDRESSES_MAX} addresses. Remove one first.`);
  }
}

/**
 * An address as one block of text, the way it goes onto an order and onto a
 * delivery label.
 *
 * Built **here** rather than in the website, so an order placed from a saved
 * address and one typed into the box arrive in the same shape — and so the
 * order's own copy of it is the platform's wording rather than whatever a
 * template happened to join together.
 */
function formatAddress(address) {
  const lines = [
    address.line1,
    address.line2,
    address.landmark ? `Near ${address.landmark}` : null,
    [address.city, address.pincode].filter(Boolean).join(' '),
    address.state?.name ?? null,
  ]
    .map((line) => String(line ?? '').trim())
    .filter(Boolean);

  return lines.join(', ');
}

/* ------------------------------------------------------------------ *
 * Public shapes
 * ------------------------------------------------------------------ */

/**
 * The customer as **they** read it.
 *
 * No `otpHash`, no `notes` — the notes are the shop's private opinion of them,
 * and a profile page that printed it would be a support ticket a week later.
 */
const publicCustomer = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email ?? null,
  phoneVerified: row.phoneVerified,
  createdAt: row.createdAt,
});

const publicAddress = (row) => ({
  id: row.id,
  label: row.label,
  contactName: row.contactName ?? null,
  contactPhone: row.contactPhone ?? null,
  line1: row.line1,
  line2: row.line2 ?? null,
  landmark: row.landmark ?? null,
  city: row.city,
  stateId: row.stateId ?? null,
  state: row.state ? { id: row.state.id, name: row.state.name } : null,
  pincode: row.pincode ?? null,
  isDefault: row.isDefault,
  /** The finished block, so no template has to join the lines itself. */
  formatted: formatAddress(row),
});

/**
 * Whether this tenant is running customer accounts **right now**.
 *
 * The same three conditions everything else on the platform hangs off — the plan
 * grants it, the tenant switched it on, the plan is still being served — asked
 * through the one service that decides them. Every customer route calls this, so
 * a sign-in form the website paints and a request the API accepts can never
 * disagree.
 */
async function accountsLive(companyId) {
  const functionalityService = require('./functionality.service');
  const { FUNCTIONALITY } = require('../constants');
  const { activeKeys } = await functionalityService.getFunctionalities(companyId);
  return activeKeys.includes(FUNCTIONALITY.CUSTOMERS);
}

module.exports = {
  normalisePhone,
  findByPhone,
  hasSmsGateway,
  sendOtp,
  verifyOtp,
  setDefaultAddress,
  assertAddressRoom,
  formatAddress,
  publicCustomer,
  publicAddress,
  accountsLive,
  STATUS,
  Op,
};
