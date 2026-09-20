'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { issueTokens } = require('../utils/jwt');
const customerService = require('../services/customer.service');
const orderService = require('../services/order.service');
const { resolveTenantByHost, resolveHost } = require('./public.controller');
const logger = require('../utils/logger');
const { AUTH_SCOPE, STATUS, CUSTOMER_ADDRESSES_MAX, ADDRESS_LABELS } = require('../constants');

/**
 * The customer's own half of the platform: signing in, their details, their
 * addresses, and what they have bought.
 *
 * ### Every route resolves the tenant from the host
 *
 * Exactly as the rest of the website module does. A customer belongs to one
 * shop, so *which* shop is decided by the domain the request arrived on and
 * never by anything in the body — and once they hold a token, by the `companyId`
 * inside it. That pairing is what makes it impossible to read another tenant's
 * customers by changing a path.
 *
 * ### Refusals say one thing
 *
 * The sign-in routes refuse with the same message however they failed, the way
 * the testimonial and enquiry endpoints do. A message that distinguished "no
 * account with that number" from "wrong code" would turn this into a way of
 * asking a shop which of its customers exist — a list of phone numbers is
 * exactly the thing not to hand out.
 */

/**
 * A refused sign-in: one message for the customer, the real reason for whoever
 * is looking after the shop.
 *
 * The reason is logged always, and attached to the response **only while there
 * is no SMS gateway** — the same switch that decides whether the code itself
 * comes back. The moment a provider is connected, both disappear together and
 * every failure is once again indistinguishable from outside.
 */
function failedSignIn(reason) {
  logger.warn(`Customer sign-in refused: ${reason}`);

  const error = ApiError.unauthorized('That code is not right, or it has expired. Ask for a new one.');
  if (!customerService.hasSmsGateway()) {
    /* `errors` is the field the error handler actually serialises. */
    error.errors = [{ field: 'code', message: `Development detail: ${reason}` }];
  }
  return error;
}

/** The tenant whose site this request came from, and whether it runs accounts. */
async function resolveShop(req) {
  const { company, branch } = await resolveTenantByHost(resolveHost(req));

  const refuse = () => {
    throw ApiError.badRequest('This website is not accepting sign-ins at the moment');
  };

  if (!company || company.status !== STATUS.ACTIVE) refuse();
  if (!(await customerService.accountsLive(company.id))) refuse();

  return { company, branch };
}

/** The signed-in customer, always re-read within their own tenant. */
function meOf(req) {
  return { companyId: req.auth.companyId, customerId: req.auth.id };
}

/* ------------------------------------------------------------------ *
 * Signing in
 * ------------------------------------------------------------------ */

/**
 * POST /theme/auth/register
 *
 * A name, a mobile number and an email. Nothing else, and no password.
 *
 * **Registering an existing number is not an error.** Somebody who signed up six
 * months ago and has forgotten is not doing anything wrong, and telling them the
 * number is taken would both annoy them and confirm that it has an account here.
 * So an existing customer is sent a code exactly as if they had asked to sign in,
 * and their name is left alone — a stranger must not be able to rename somebody
 * else's account by registering their number.
 *
 * A soft-deleted account is **restored** rather than duplicated, which is the
 * whole reason `findByPhone` looks past `deletedAt`. Two rows for one person
 * would split their order history down the middle.
 */
const register = asyncHandler(async (req, res) => {
  const { company } = await resolveShop(req);
  const phone = customerService.normalisePhone(req.body.phone);

  if (!phone) throw ApiError.badRequest('Enter a valid mobile number');

  const result = await db.sequelize.transaction(async (transaction) => {
    let customer = await customerService.findByPhone(company.id, phone, { transaction });

    if (customer) {
      if (customer.deletedAt) await customer.restore({ transaction });
      if (customer.status !== STATUS.ACTIVE) {
        throw ApiError.forbidden('This account is no longer active. Please contact us.');
      }

      /* An email they have now supplied is worth keeping; the name is not
         overwritten — see the note above. */
      if (req.body.email && !customer.email) {
        await customer.update({ email: String(req.body.email).toLowerCase() }, { transaction });
      }
    } else {
      customer = await db.Customer.create(
        {
          companyId: company.id,
          name: String(req.body.name).trim(),
          phone,
          email: req.body.email ? String(req.body.email).toLowerCase() : null,
          status: STATUS.ACTIVE,
        },
        { transaction }
      );
    }

    const otp = await customerService.sendOtp(customer, transaction);
    return { customer, otp };
  });

  return created(res, 'We have sent you a code', {
    ...otpResponse(result.otp, phone),
    /* Always true from here: this route either found the account or made it. */
    registered: true,
  });
});

/**
 * POST /theme/auth/request-otp
 *
 * Signing in — and finding out that you need to register instead.
 *
 * ### This endpoint tells the caller whether the number is known
 *
 * It did not, originally, and that was the safer arrangement: a response
 * identical either way is not a means of testing which numbers a shop has, one
 * request at a time. The cost was a dead end for the person actually using it —
 * somebody new typed their number, were told a code had been sent, waited for a
 * message that was never coming, and had to work out for themselves that they
 * were supposed to register.
 *
 * **`registered` is the deliberate trade.** The website uses it to carry a new
 * customer straight into the sign-up form with their number already filled in,
 * which is what almost every shop of this kind does. What it gives up is that
 * somebody can now learn whether a given number has an account here.
 *
 * Three things keep that bounded, and they are the reason this is an acceptable
 * trade rather than a hole:
 *
 *   - the **rate limit** on this route (see `authLimit`), which is what makes
 *     working through a list of numbers impractical rather than merely rude;
 *   - it reveals only *that* an account exists, never a name, an email or an
 *     order — all of which still need a code from that person's own phone;
 *   - a **barred** customer is reported as registered rather than as unknown, so
 *     the answer cannot be used to work out who a shop has fallen out with.
 *
 * The one thing that has not changed: `verify` still says the same thing for a
 * wrong code, an expired one and a number with no account. Knowing an account
 * exists is a long way from being able to open it.
 */
const requestOtp = asyncHandler(async (req, res) => {
  const { company } = await resolveShop(req);
  const phone = customerService.normalisePhone(req.body.phone);
  if (!phone) throw ApiError.badRequest('Enter a valid mobile number');

  const customer = await customerService.findByPhone(company.id, phone);
  /* Soft-deleted counts as gone: registering that number again restores the
     row, so the honest answer for the person in front of us is "you are new". */
  const known = Boolean(customer) && !customer.deletedAt;

  if (!known) {
    return success(res, {
      message: 'We could not find an account for that number',
      data: { sent: false, registered: false, phone },
    });
  }

  /**
   * Barred, but real.
   *
   * Reported as **registered**, and nothing is sent. Saying "no account" here
   * would both be a lie and turn this route into a way of discovering which
   * customers a shop has barred; sending a code would let somebody it has
   * deliberately shut out back in. They are told to get in touch, which is the
   * only thing that can actually help them.
   */
  if (customer.status !== STATUS.ACTIVE) {
    return success(res, {
      message: 'That account cannot be used at the moment. Please contact us.',
      data: { sent: false, registered: true, blocked: true, phone },
    });
  }

  const otp = await db.sequelize.transaction((transaction) => customerService.sendOtp(customer, transaction));

  return success(res, {
    message: 'We have sent you a code',
    data: { ...otpResponse(otp, phone), registered: true },
  });
});

/**
 * POST /theme/auth/verify
 *
 * The code, and a token if it is right.
 *
 * The token carries the **company** as well as the customer, which is what pins
 * every later request to one tenant without trusting a path or a body.
 */
const verify = asyncHandler(async (req, res) => {
  const { company } = await resolveShop(req);
  const phone = customerService.normalisePhone(req.body.phone);

  const customer = await customerService.findByPhone(company.id, phone);
  if (!customer || customer.deletedAt || customer.status !== STATUS.ACTIVE) {
    /* The same wording `verifyOtp` uses, so a number with no account and a wrong
       code are indistinguishable from out here. */
    throw failedSignIn(
      customer ? 'that account is deleted or barred' : `no account for ${phone} at this shop`
    );
  }

  try {
    await db.sequelize.transaction((transaction) =>
      customerService.verifyOtp(customer, req.body.code, transaction)
    );
  } catch (error) {
    /**
     * Logged **and**, while there is no SMS gateway, handed back — the same
     * bargain the dev code makes. Without it the only thing anybody debugging a
     * sign-in has to go on is "that code is not right", which is equally true of
     * a mistyped digit and of codes that are silently never being stored.
     */
    if (error?.otpReason) throw failedSignIn(error.otpReason);
    throw error;
  }

  const tokens = issueTokens({
    id: customer.id,
    scope: AUTH_SCOPE.CUSTOMER,
    companyId: customer.companyId,
  });

  return success(res, {
    message: `Welcome back, ${customer.name}`,
    data: { ...tokens, customer: customerService.publicCustomer(customer) },
  });
});

/**
 * What the response says about a code that was not actually sent anywhere.
 *
 * The code itself comes back **only** while there is no SMS gateway, and the
 * payload labels it as a development code so nothing about it reads as a
 * production arrangement. See `sendOtp`, which is the one place that decides.
 */
const devHint = (code) =>
  customerService.hasSmsGateway() || !code
    ? {}
    : {
      devCode: code,
      devNote: 'No SMS gateway is connected, so this code is shown here instead of being sent.',
    };

const otpResponse = (otp, phone) => ({
  sent: true,
  phone,
  expiresAt: otp.expiresAt,
  ...devHint(otp.devCode),
});

/* ------------------------------------------------------------------ *
 * Their details
 * ------------------------------------------------------------------ */

/** GET /theme/me — who is signed in, with their addresses. */
const me = asyncHandler(async (req, res) => {
  const { companyId, customerId } = meOf(req);

  const addresses = await db.CustomerAddress.findAll({
    where: { companyId, customerId, status: STATUS.ACTIVE },
    include: [{ model: db.State, as: 'state', attributes: ['id', 'name'], required: false }],
    order: [['isDefault', 'DESC'], ['id', 'ASC']],
  });

  return success(res, {
    message: 'Profile fetched successfully',
    data: {
      customer: customerService.publicCustomer(req.customer),
      addresses: addresses.map(customerService.publicAddress),
      addressesMax: CUSTOMER_ADDRESSES_MAX,
      addressLabels: ADDRESS_LABELS,
    },
  });
});

/**
 * PUT /theme/me
 *
 * The name and the email, and **not the phone**. The number is the identity —
 * changing it would move the account to a different person, silently take their
 * order history with it, and could be used to collide with somebody else's.
 * Somebody who has changed their number registers the new one.
 */
const updateMe = asyncHandler(async (req, res) => {
  const customer = req.customer;

  await customer.update({
    name: req.body.name !== undefined ? String(req.body.name).trim() : customer.name,
    email: req.body.email !== undefined ? (req.body.email ? String(req.body.email).toLowerCase() : null) : customer.email,
  });

  return success(res, {
    message: 'Saved',
    data: customerService.publicCustomer(customer),
  });
});

/* ------------------------------------------------------------------ *
 * Their addresses
 * ------------------------------------------------------------------ */

/** One of this customer's own, or a 404 that says nothing about anyone else's. */
async function findAddress(companyId, customerId, id, transaction) {
  const row = await db.CustomerAddress.findOne({
    where: { id, companyId, customerId },
    include: [{ model: db.State, as: 'state', attributes: ['id', 'name'], required: false }],
    transaction,
  });
  if (!row) throw ApiError.notFound('Address not found');
  return row;
}

const addAddress = asyncHandler(async (req, res) => {
  const { companyId, customerId } = meOf(req);

  const row = await db.sequelize.transaction(async (transaction) => {
    await customerService.assertAddressRoom(companyId, customerId, transaction);

    const existing = await db.CustomerAddress.count({ where: { companyId, customerId }, transaction });
    const address = await db.CustomerAddress.create(
      { ...req.body, companyId, customerId, isDefault: false },
      { transaction }
    );

    /* The first one becomes the default whether or not it was asked for: a
       checkout has to start somewhere. */
    if (req.body.isDefault === true || existing === 0) {
      await customerService.setDefaultAddress(companyId, customerId, address.id, transaction);
    }

    return address;
  });

  return created(res, 'Address saved', customerService.publicAddress(await findAddress(companyId, customerId, row.id)));
});

const updateAddress = asyncHandler(async (req, res) => {
  const { companyId, customerId } = meOf(req);
  const id = Number(req.params.id);

  await db.sequelize.transaction(async (transaction) => {
    const address = await findAddress(companyId, customerId, id, transaction);
    await address.update(req.body, { transaction });

    if (req.body.isDefault === true) {
      await customerService.setDefaultAddress(companyId, customerId, id, transaction);
    }
  });

  return success(res, {
    message: 'Address saved',
    data: customerService.publicAddress(await findAddress(companyId, customerId, id)),
  });
});

/**
 * DELETE /theme/me/addresses/:id
 *
 * Safe at any time, and needs no guard against orders that used it: an order
 * copies its address as text when it is placed, so the ones already delivered
 * still say where they went. See `CustomerAddress`.
 */
const removeAddress = asyncHandler(async (req, res) => {
  const { companyId, customerId } = meOf(req);
  const id = Number(req.params.id);

  await db.sequelize.transaction(async (transaction) => {
    const address = await findAddress(companyId, customerId, id, transaction);
    const wasDefault = address.isDefault;
    await address.destroy({ transaction });

    /* Never leave somebody with addresses and no default — the checkout would
       open on nothing. */
    if (wasDefault) {
      const next = await db.CustomerAddress.findOne({
        where: { companyId, customerId, status: STATUS.ACTIVE },
        order: [['id', 'ASC']],
        transaction,
      });
      if (next) await next.update({ isDefault: true }, { transaction });
    }
  });

  return success(res, { message: 'Address removed', data: { id } });
});

/* ------------------------------------------------------------------ *
 * What they have bought
 * ------------------------------------------------------------------ */

/**
 * GET /theme/me/orders
 *
 * Their own orders, newest first, with the lines on each.
 *
 * Scoped by `customerId` **from the token**, so there is no path a customer can
 * change to read somebody else's. The lines come along because an order history
 * that only shows a total is one nobody can check against what arrived.
 *
 * It reuses `publicOrder`, which means a customer sees the same shape the
 * console does — including `nextStatuses`, which is harmless: knowing an order
 * *could* be cancelled is not the same as being able to cancel it, and no
 * customer route accepts a status change.
 */
const myOrders = asyncHandler(async (req, res) => {
  const { companyId, customerId } = meOf(req);

  const orders = await db.CompanyOrder.findAll({
    where: { companyId, customerId },
    include: [
      { model: db.CompanyOrderItem, as: 'items', required: false, separate: true, order: [['id', 'ASC']] },
      { model: db.Branch, as: 'branch', attributes: ['id', 'name'], required: false },
    ],
    order: [['id', 'DESC']],
    limit: 100,
  });

  return success(res, {
    message: 'Orders fetched successfully',
    data: orders.map((order) => {
      const shape = orderService.publicOrder(order);

      return {
        ...shape,
        /* The shop's private notes and where the order came from are not the
           customer's business, however harmless they look. */
        internalNote: undefined,
        sourceUrl: undefined,
        submittedIp: undefined,
      };
    }),
  });
});

/**
 * GET /theme/me/services
 *
 * What this customer has asked about, and where each enquiry got to.
 *
 * The service half of the order history, and it exists for the same reason:
 * somebody who asked for a quote three weeks ago wants to know whether anything
 * happened, without ringing up to find out.
 *
 * **What it does not carry is as deliberate as what it does.** The shop's own
 * notes, the amount it has pencilled in, and whether it has marked the job paid
 * are all absent: an internal note is an internal note, and a figure the shop is
 * still deciding is not a quote until somebody sends it. What the customer sees
 * is what they asked, when, and how it is progressing.
 */
const myServices = asyncHandler(async (req, res) => {
  const { companyId, customerId } = meOf(req);

  const leads = await db.ServiceLead.findAll({
    where: { companyId, customerId },
    attributes: [
      'id',
      'serviceTitle',
      'servicePriceLabel',
      'stage',
      'createdAt',
      /* The appointment, where there is one. */
      'bookingDate',
      'bookingTime',
      'bookingMinutes',
      'bookingStatus',
      'bookingResponse',
      'serviceId',
    ],
    include: [
      { model: db.CompanyService, as: 'service', attributes: ['id', 'title', 'icon', 'slug'], required: false, paranoid: false },
    ],
    order: [['id', 'DESC']],
    limit: 100,
  });

  return success(res, {
    message: 'Service enquiries fetched successfully',
    data: leads.map((lead) => ({
      id: lead.id,
      service: lead.serviceTitle,
      icon: lead.service?.icon ?? null,
      /* What the card said when they asked — not what it says today, and not
         what the shop has since decided the job is worth. */
      priceLabel: lead.servicePriceLabel,
      stage: lead.stage,
      askedAt: lead.createdAt,
      /** The address of the service's own page, so the history can link back. */
      slug: lead.service?.slug ?? null,

      /**
       * The appointment, and what the shop said about it.
       *
       * `null` on a row that only asked a question, which is most of them. This
       * is the half of the platform a customer is actually **waiting on**: they
       * picked a time, somebody has to confirm it, and until this says so they
       * do not know whether they have an appointment on Thursday.
       *
       * `stage` above is deliberately still the shop's private pipeline and says
       * nothing to them; this is the public answer.
       */
      booking: lead.bookingStatus
        ? {
          date: lead.bookingDate,
          time: lead.bookingTime,
          minutes: lead.bookingMinutes,
          status: lead.bookingStatus,
          /* The one field on this row the company wrote for them to read. */
          response: lead.bookingResponse ?? null,
        }
        : null,
    })),
  });
});

module.exports = {
  myServices,
  register,
  requestOtp,
  verify,
  me,
  updateMe,
  addAddress,
  updateAddress,
  removeAddress,
  myOrders,
  resolveShop,
};
