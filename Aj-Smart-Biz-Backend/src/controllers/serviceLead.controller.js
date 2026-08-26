'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const { AUTH_SCOPE, LEAD_STAGE, LEAD_STAGE_VALUES } = require('../constants');

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
  ]);

  const byStage = {};
  LEAD_STAGE_VALUES.forEach((stage, index) => {
    byStage[stage] = counts[index];
  });

  return success(res, {
    message: 'Service enquiry list fetched successfully',
    data: {
      items: result.rows,
      counts: { ...byStage, total: Object.values(byStage).reduce((sum, n) => sum + n, 0) },
      /* The services to filter by, so the screen needs no second request. Every
         service, not just the active ones: an enquiry against a service since
         switched off still has to be findable. */
      services: await db.CompanyService.findAll({
        where: { companyId },
        attributes: ['id', 'title', 'status'],
        order: [['sequence', 'ASC'], ['id', 'ASC']],
      }),
      stages: LEAD_STAGE_VALUES,
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

  await row.update(patch);
  return success(res, { message: 'Service enquiry updated successfully', data: row });
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

module.exports = { list, update, remove, summary };
