'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { Op, fn, col, literal } = require('sequelize');
const bookingService = require('../services/booking.service');
const analyticsService = require('../services/analytics.service');
const {
  AUTH_SCOPE,
  LEAD_STAGE,
  LEAD_STAGE_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  BOOKING_HOLDS_SLOT,
  ORDER_PAYMENT_STATUS,
  ANALYTICS_RANGES,
  ANALYTICS_RANGE_DEFAULT,
  ANALYTICS_TOP_LIMIT,
} = require('../constants');

/**
 * Service enquiries — the tenant's inbox.
 *
 * Every query is pinned to one company the way the rest of the tenant module
 * does it: a company admin's token names their tenant, so `:companyId` is
 * ignored for them and cross-tenant access is impossible by construction.
 *
 * There is no create here. The only writer is the public website — see
 * `submitServiceLead` — and a console route that could manufacture enquiries
 * would make the list a place where "somebody asked us" and "somebody typed
 * this in" are indistinguishable.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const SERVICE_INCLUDE = {
  model: db.CompanyService,
  as: 'service',
  attributes: ['id', 'title', 'icon'],
  required: false,
  /* The service may have been deleted since; the row still knows what it was
     called, so a missing join is not a missing enquiry. */
  paranoid: false,
};

const BRANCH_INCLUDE = {
  model: db.Branch,
  as: 'branch',
  attributes: ['id', 'name', 'code'],
  required: false,
};

/**
 * GET /my-company/service-leads
 *
 * One page of enquiries, plus the counts the screen is built around.
 *
 * It pages, unlike the card lists this section is otherwise made of, for the
 * same reason the testimonial queue does: it is fed by the public internet and
 * grows for as long as the website is up. And it counts, because the number
 * waiting on somebody is the reason to open the screen at all — a count the
 * browser derived from a filtered page would be a count of that filter, and
 * would read zero on the very tab that needed it.
 *
 * Newest first. This is a queue, and `sequence` means nothing to a row nobody
 * placed anywhere.
 */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  const scope = { companyId };
  if (req.query.branchId === 'none' || req.query.branchId === 'null') scope.branchId = null;
  else if (req.query.branchId) scope.branchId = Number(req.query.branchId);

  const where = mergeWhere(
    scope,
    req.query.stage ? { stage: req.query.stage } : null,
    req.query.serviceId ? { serviceId: Number(req.query.serviceId) } : null,
    /**
     * `bookingStatus=requested` is the filter this screen is opened for on a
     * morning: who is waiting to hear whether they have a time. `bookings=true`
     * is the wider one - every row that asked for a slot, whatever happened to
     * it - and `bookings=false` the enquiries that did not.
     */
    req.query.bookingStatus ? { bookingStatus: req.query.bookingStatus } : null,
    req.query.bookings === undefined
      ? null
      : req.query.bookings
        ? { bookingStatus: { [Op.ne]: null } }
        : { bookingStatus: null },
    req.query.bookingDate ? { bookingDate: req.query.bookingDate } : null,
    /* The service is searchable as well as the person: "who asked about
       restoration" is the question as often as "what was that man called". */
    buildSearch(req.query.search, ['name', 'phone', 'serviceTitle'])
  );

  const [result, ...counts] = await Promise.all([
    db.ServiceLead.findAndCountAll({
      where,
      include: [SERVICE_INCLUDE, BRANCH_INCLUDE],
      order: getSort(req.query, ['created_at', 'name', 'stage'], [['createdAt', 'DESC'], ['id', 'DESC']]),
      limit,
      offset,
      distinct: true,
    }),
    /* Always the whole scope, never the filter — see the note above. */
    ...LEAD_STAGE_VALUES.map((stage) => db.ServiceLead.count({ where: { ...scope, stage } })),
    /* Waiting to be answered - the number the screen leads with when a company
       takes bookings, because somebody is sitting at the other end of it. */
    db.ServiceLead.count({ where: { ...scope, bookingStatus: BOOKING_STATUS.REQUESTED } }),
    db.ServiceLead.count({ where: { ...scope, bookingStatus: BOOKING_STATUS.ACCEPTED } }),
  ]);

  const awaiting = counts[LEAD_STAGE_VALUES.length];
  const confirmed = counts[LEAD_STAGE_VALUES.length + 1];

  const byStage = {};
  LEAD_STAGE_VALUES.forEach((stage, index) => {
    byStage[stage] = counts[index];
  });

  return success(res, {
    message: 'Service enquiry list fetched successfully',
    data: {
      items: result.rows,
      counts: {
        ...byStage,
        total: LEAD_STAGE_VALUES.reduce((sum, stage) => sum + byStage[stage], 0),
        /* Beside the stages rather than inside them: a booking's status and an
           enquiry's stage are different axes, and adding them into one total
           would count the same row twice. */
        awaitingBooking: awaiting,
        confirmedBooking: confirmed,
      },
      /* The services to filter by, so the screen needs no second request. Every
         service, not just the active ones: an enquiry against a service since
         switched off still has to be findable. */
      services: await db.CompanyService.findAll({
        where: { companyId },
        attributes: ['id', 'title', 'status'],
        order: [['sequence', 'ASC'], ['id', 'ASC']],
      }),
      stages: LEAD_STAGE_VALUES,
      bookingStatuses: BOOKING_STATUS_VALUES,
    },
    meta: {
      total: result.count,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(result.count / limit) : 1,
      hasNext: limit > 0 && page * limit < result.count,
    },
  });
});

/**
 * PATCH /my-company/service-leads/:id
 *
 * Move an enquiry along, and write down what happened. The two things a person
 * working a queue actually does, and the only two this route accepts — a name
 * and a number are what somebody typed, and letting them be edited would turn
 * a record of what happened into a note about what someone thinks happened.
 */
const update = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const row = await db.ServiceLead.findOne({ where: { id: req.params.id, companyId } });
  if (!row) throw ApiError.notFound('Service enquiry not found');

  const patch = { updatedBy: req.auth?.id ?? null };
  if (req.body.stage !== undefined) patch.stage = req.body.stage;
  if (req.body.note !== undefined) patch.note = req.body.note || null;

  /**
   * What the job came to.
   *
   * A service is priced in words on the website precisely because it cannot be
   * priced in advance — this is the figure that exists once somebody has looked
   * at it and quoted. It is the only number on the row, and everything the
   * service revenue report says is built from it.
   *
   * An empty box clears it back to "not quoted yet", which is a real state and
   * not the same as a quote of zero.
   */
  if (req.body.amount !== undefined) {
    patch.amount = req.body.amount === null || req.body.amount === '' ? null : req.body.amount;
  }

  /**
   * Whether the money has arrived, moved through the same three words an order
   * uses — a shop should not learn two vocabularies for "paid" depending on
   * whether it sold a thing or did a job.
   *
   * `paidAt` is stamped here rather than asked for: it is the moment somebody
   * said so, and a date typed by hand is one more thing to get wrong.
   */
  if (req.body.paymentStatus !== undefined && req.body.paymentStatus !== row.paymentStatus) {
    patch.paymentStatus = req.body.paymentStatus;
    patch.paidAt = req.body.paymentStatus === ORDER_PAYMENT_STATUS.PAID ? new Date() : null;
  }

  if (req.body.paymentReference !== undefined) {
    patch.paymentReference = req.body.paymentReference || null;
  }

  await row.update(patch);
  return success(res, { message: 'Service enquiry updated successfully', data: row });
});

/**
 * GET /my-company/service-leads/revenue
 *
 * What the services are actually earning.
 *
 * ### Three numbers, because one would be a lie
 *
 * A service enquiry is not a sale. It becomes one somewhere between arriving and
 * being paid for, and a single "revenue" figure would have to pick a moment and
 * pretend the others do not exist. So this reports the pipeline as it is:
 *
 *   quoted     every enquiry that has a figure on it, whatever stage it is at.
 *              What is in play.
 *   won        quoted **and** converted. Work the shop has actually been given.
 *   collected  paid. Money in the bank.
 *
 * The gap between `won` and `collected` is the invoice nobody has chased, which
 * is the single most useful thing on this endpoint and is invisible in any
 * arrangement that reports one total.
 *
 * ### What it cannot count
 *
 * Enquiries with **no figure on them at all** — which is most of them for most
 * of their life, since a service is priced when somebody looks at the job.
 * `unquoted` counts them rather than letting them silently drag every average
 * towards zero: an average job value computed over rows nobody has quoted is not
 * an average job value.
 */
/**
 * GET /my-company/service-leads/analytics
 *
 * How the service side of the business is doing, over one of the platform's
 * windows.
 *
 * Its own route beside `revenue` rather than a bigger version of it, and the two
 * are kept apart deliberately: revenue answers "what are the services earning",
 * which a person opens on a Friday, and this answers "what is happening" - demand,
 * conversion, which services get asked about, and how much of the diary is being
 * confirmed. One endpoint doing both would make every screen pay for the half it
 * is not showing.
 *
 * Everything is computed by `analytics.service`, which is where the sales and
 * stock ones live - so the three are shaped alike and a screen that draws one can
 * draw the others.
 */
const analytics = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const data = await analyticsService.serviceAnalytics(companyId, {
    days: req.query.days,
    branchId: req.query.branchId,
  });

  return success(res, { message: 'Service analytics fetched successfully', data });
});

/**
 * PATCH /my-company/service-leads/:id/booking
 *
 * Confirm an appointment, or say why not.
 *
 * ### Why this is not `update`
 *
 * That route moves an enquiry through a **sales pipeline** the company keeps to
 * itself - contacted, qualified, lost. This one changes a fact the customer is
 * waiting on and can see on their own page, and it hands back a slot to the
 * diary when it refuses. Same row, different act, different permission story:
 * anybody working the queue may confirm a time.
 *
 * ### What accepting actually does
 *
 * Nothing to the diary, and that is the point: the slot was **already held** the
 * moment it was requested, because a request that did not hold its time would let
 * the company confirm two people into one chair. Declining or cancelling is what
 * gives the time back - `BOOKING_HOLDS_SLOT` names the two states that occupy it,
 * and the generator reads that list rather than a copy of it.
 *
 * The transitions are checked rather than trusted. `declined` and `completed` are
 * ends: a company that refused a slot and then changed its mind books it again,
 * rather than reviving a refusal the customer has already been told about.
 */
const decideBooking = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const row = await db.ServiceLead.findOne({ where: { id: req.params.id, companyId } });
  if (!row) throw ApiError.notFound('Enquiry not found');
  if (!row.bookingStatus) throw ApiError.badRequest('This enquiry did not ask for a time');

  const next = req.body.status;
  if (!bookingService.canMove(row.bookingStatus, next)) {
    throw ApiError.badRequest(`A ${row.bookingStatus} booking cannot become ${next}`);
  }

  await row.update({
    bookingStatus: next,
    /**
     * What the company said back - the one field on this row a customer reads
     * that the company wrote. Kept when nothing new is sent, so confirming a
     * booking does not wipe the note that was written when it was moved.
     */
    bookingResponse: req.body.response === undefined ? row.bookingResponse : req.body.response || null,
    /**
     * Confirming a time is the clearest evidence there is that somebody has
     * spoken to this person, so the enquiry moves out of `new` with it - but
     * only from `new`. A company that has already worked the row into its own
     * stage keeps that stage; this is a convenience, not an opinion about their
     * pipeline.
     */
    ...(next === BOOKING_STATUS.ACCEPTED && row.stage === LEAD_STAGE.NEW ? { stage: LEAD_STAGE.CONTACTED } : {}),
    updatedBy: req.auth?.id ?? null,
  });

  return success(res, {
    message: `Booking ${next}`,
    data: {
      id: row.id,
      bookingStatus: row.bookingStatus,
      bookingResponse: row.bookingResponse,
      stage: row.stage,
      /** True while this row is still holding its slot against the diary. */
      holdsSlot: BOOKING_HOLDS_SLOT.includes(row.bookingStatus),
    },
  });
});

/**
 * GET /my-company/service-leads/diary
 *
 * One day of appointments, in time order - what the shop is doing tomorrow.
 *
 * The list screen is a queue sorted by when people asked; this is the same rows
 * sorted by when they are **due**, which is the only order that answers "what
 * does Thursday look like". Cancelled and declined rows are left out: they are
 * not appointments, and a diary that showed them would have somebody preparing
 * for a customer who is not coming.
 */
const diary = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const date = req.query.date || bookingService.today();

  const rows = await db.ServiceLead.findAll({
    where: { companyId, bookingDate: date, bookingStatus: { [Op.in]: BOOKING_HOLDS_SLOT } },
    include: [SERVICE_INCLUDE, BRANCH_INCLUDE],
    order: [['booking_time', 'ASC'], ['id', 'ASC']],
  });

  return success(res, {
    message: 'Diary fetched successfully',
    data: {
      date,
      items: rows,
      /* What the day is worth to the shop, for a person deciding whether to open
         on a quiet Tuesday. Only the figures that have been quoted. */
      booked: rows.length,
    },
  });
});

const revenue = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const days = Number(req.query.days);
  const window = ANALYTICS_RANGES.includes(days) ? days : ANALYTICS_RANGE_DEFAULT;

  const from = new Date();
  from.setDate(from.getDate() - (window - 1));
  from.setHours(0, 0, 0, 0);

  const scope = { companyId, createdAt: { [Op.gte]: from } };

  const sum = async (where) => {
    const row = await db.ServiceLead.findOne({
      where: { ...scope, ...where, amount: { [Op.ne]: null } },
      attributes: [
        [fn('COUNT', col('id')), 'count'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'total'],
      ],
      raw: true,
    });
    return { count: Number(row?.count || 0), total: Number(row?.total || 0) };
  };

  const [quoted, won, collected, unquoted, byService, byStage] = await Promise.all([
    sum({}),
    sum({ stage: LEAD_STAGE.CONVERTED }),
    sum({ paymentStatus: ORDER_PAYMENT_STATUS.PAID }),

    db.ServiceLead.count({ where: { ...scope, amount: null } }),

    /**
     * Grouped by the **copied title**, so a service renamed or deleted since
     * still appears as what it was called when somebody asked about it — the
     * whole reason the title is on the row.
     */
    db.ServiceLead.findAll({
      where: { ...scope, amount: { [Op.ne]: null } },
      attributes: [
        'serviceTitle',
        [fn('COUNT', col('id')), 'enquiries'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'total'],
      ],
      group: ['service_title'],
      order: [[literal('total'), 'DESC']],
      limit: ANALYTICS_TOP_LIMIT,
      raw: true,
    }),

    db.ServiceLead.findAll({
      where: scope,
      attributes: ['stage', [fn('COUNT', col('id')), 'count']],
      group: ['stage'],
      raw: true,
    }),
  ]);

  /* Every stage, including the ones nothing landed on — a breakdown with gaps in
     it reads as broken rather than as a quiet fortnight. */
  const stages = Object.fromEntries(LEAD_STAGE_VALUES.map((key) => [key, 0]));
  byStage.forEach((row) => {
    stages[row.stage] = Number(row.count || 0);
  });

  return success(res, {
    message: 'Service revenue fetched successfully',
    data: {
      range: { days: window, from, to: new Date() },
      quoted,
      won,
      collected,
      /** Owed: work that was won and has not been paid for. */
      outstanding: Number((won.total - collected.total).toFixed(2)),
      /** Enquiries nobody has put a figure on. See the note above. */
      unquoted,
      /** Only over the rows that actually have a figure. */
      averageQuote: quoted.count ? Number((quoted.total / quoted.count).toFixed(2)) : 0,
      byStage: stages,
      byService: byService.map((row) => ({
        service: row.serviceTitle || 'Deleted service',
        enquiries: Number(row.enquiries || 0),
        total: Number(row.total || 0),
      })),
    },
  });
});

/**
 * DELETE /my-company/service-leads/:id
 *
 * Soft, like everything else on the platform: a company clearing a spam
 * enquiry off its screen should not be destroying evidence of what its website
 * received.
 */
const remove = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const row = await db.ServiceLead.findOne({ where: { id: req.params.id, companyId } });
  if (!row) throw ApiError.notFound('Service enquiry not found');

  await row.update({ updatedBy: req.auth?.id ?? null });
  await row.destroy();
  return success(res, { message: 'Service enquiry deleted successfully', data: { id: row.id } });
});

/**
 * GET /my-company/service-leads/summary
 *
 * What the dashboard and the sidebar badge want: how many are waiting, and how
 * many arrived recently. Separate from the list so a badge does not have to
 * fetch a page of rows to count them.
 */
const summary = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [total, isNew, recent, topServices] = await Promise.all([
    db.ServiceLead.count({ where: { companyId } }),
    db.ServiceLead.count({ where: { companyId, stage: LEAD_STAGE.NEW } }),
    db.ServiceLead.count({ where: { companyId, createdAt: { [db.Sequelize.Op.gte]: sevenDaysAgo } } }),
    /* Which services people actually ask about — the one number on this screen
       that tells a company something it could not have guessed. */
    db.ServiceLead.findAll({
      where: { companyId },
      attributes: ['serviceTitle', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'enquiries']],
      group: ['serviceTitle'],
      order: [[db.sequelize.literal('enquiries'), 'DESC']],
      limit: 5,
      raw: true,
    }),
  ]);

  return success(res, {
    message: 'Service enquiry summary fetched successfully',
    data: { total, new: isNew, lastSevenDays: recent, topServices },
  });
});

module.exports = { list, update, remove, summary, revenue, analytics, decideBooking, diary };
