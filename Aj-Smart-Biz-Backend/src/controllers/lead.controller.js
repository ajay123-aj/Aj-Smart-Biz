'use strict';

const { fn, col, literal } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere, Op } = require('../utils/query');
const { AUTH_SCOPE, LEAD_STAGE_VALUES, DEVICE_TYPE } = require('../constants');

/**
 * Reading leads, in both consoles.
 *
 * One controller rather than two, because the tenant's list and the platform's
 * are the same query with a different scope: `scopeOf` is the only place that
 * knows which, and it derives the company from the **token**, never from a
 * parameter. A company admin cannot ask for another company's leads because
 * there is no request they could make that would say so.
 *
 * Everything here is a read except `update`. A visit is a fact — where someone
 * came from, on what, when — and none of it is editable. What a company
 * *learned* about a lead is, and that is the four fields `update` accepts.
 */

/**
 * Which company's leads this request may see.
 *
 * A super admin gets `null`, meaning "no company filter", optionally narrowed
 * by `?companyId=`. A company admin gets their own id and nothing else can
 * widen it.
 */
const scopeOf = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return { companyId: req.auth.companyId };
  const companyId = Number(req.query.companyId);
  return Number.isInteger(companyId) && companyId > 0 ? { companyId } : {};
};

/** `?branchId=none` means the company-wide host — a branch id of exactly NULL. */
const branchClause = (value) => {
  if (value === undefined || value === '') return null;
  if (value === 'none' || value === 'null') return { branchId: null };
  const branchId = Number(value);
  return Number.isInteger(branchId) && branchId > 0 ? { branchId } : null;
};

/**
 * The window a report covers, applied to when the lead was **last seen**.
 *
 * Last seen rather than created: "leads this month" means people who were on
 * the site this month, which includes someone who first arrived in March and
 * came back yesterday. A report built on `created_at` would quietly answer a
 * different question — new leads only — and undercount every returning visitor.
 *
 * `to` is stretched to the end of its day. A date with no time means the whole
 * day to everyone who types one, and a report that silently stops at midnight
 * the morning of its end date is a bug report waiting to be filed.
 */
const windowClause = (query) => {
  const { from, to } = query;
  if (!from && !to) return null;

  const end = to ? new Date(to) : null;
  if (end && !/\d{2}:\d{2}/.test(String(to))) end.setHours(23, 59, 59, 999);

  return {
    lastSeenAt: {
      ...(from ? { [Op.gte]: new Date(from) } : {}),
      ...(end ? { [Op.lte]: end } : {}),
    },
  };
};

/**
 * Every filter the two lead lists share.
 *
 * Crawlers are excluded unless asked for. They are stored — a company whose
 * numbers jump overnight deserves to see why — but a lead list is a list of
 * people, and the default has to be the honest count.
 */
const filtersOf = (req) =>
  mergeWhere(
    scopeOf(req),
    branchClause(req.query.branchId),
    windowClause(req.query),
    req.query.stage ? { stage: req.query.stage } : null,
    req.query.deviceType ? { deviceType: req.query.deviceType } : null,
    req.query.utmSource ? { utmSource: req.query.utmSource } : null,
    req.query.utmMedium ? { utmMedium: req.query.utmMedium } : null,
    req.query.utmCampaign ? { utmCampaign: req.query.utmCampaign } : null,
    req.query.country ? { country: req.query.country } : null,
    req.query.city ? { city: req.query.city } : null,
    req.query.status ? { status: req.query.status } : null,
    req.query.includeBots ? null : { isBot: false }
  );

/** Columns `?search=` looks in. The device id is included: it is often all there is. */
const SEARCH_FIELDS = ['name', 'email', 'phone', 'device_id', 'city', 'country', 'utm_campaign', 'utm_source'];

const SORT_FIELDS = ['last_seen_at', 'first_seen_at', 'visit_count', 'page_view_count', 'created_at', 'stage'];

/** What a list row needs. The blobs and the full attribution belong to the detail. */
const LIST_ATTRIBUTES = [
  'id',
  'companyId',
  'branchId',
  'deviceId',
  'stage',
  'name',
  'email',
  'phone',
  'fcmToken',
  'visitCount',
  'pageViewCount',
  'firstSeenAt',
  'lastSeenAt',
  'deviceType',
  'deviceVendor',
  'deviceModel',
  'os',
  'osVersion',
  'browser',
  'browserVersion',
  'city',
  'region',
  'country',
  'timezone',
  'ip',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'firstReferrerHost',
  'lastReferrerHost',
  'isBot',
  'status',
  'createdAt',
];

const branchInclude = { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false };
const companyInclude = { model: db.Company, as: 'company', attributes: ['id', 'name', 'code'], required: false };

/**
 * GET /my-company/leads     (company admin)
 * GET /leads                (super admin — every tenant, filterable by company)
 *
 * **One row per device.** That is not something this query does; it is what the
 * `leads` table is, and it is why the table exists separately from
 * `lead_visits`. A person who has been back four times is one row here with
 * `visitCount: 4`, and the four visits are behind the detail route below.
 */
const list = asyncHandler(async (req, res) => {
  const isPlatform = req.auth?.scope === AUTH_SCOPE.SUPER_ADMIN;
  const { page, limit, offset } = getPagination(req.query);

  const where = mergeWhere(filtersOf(req), buildSearch(req.query.search, SEARCH_FIELDS));

  const result = await db.Lead.findAndCountAll({
    where,
    attributes: LIST_ATTRIBUTES,
    include: isPlatform ? [companyInclude, branchInclude] : [branchInclude],
    order: getSort(req.query, SORT_FIELDS, [['last_seen_at', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Lead list fetched successfully');
});

/* ------------------------------------------------------------------ *
 * Aggregation helpers
 *
 * Shared by the summary strip and the analytics screen, so the two always
 * count the same way. Defined once, above both.
 * ------------------------------------------------------------------ */

/** `first_referrer_host` -> `firstReferrerHost`, for the `where` clause. */
const camel = (column) => column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * `COUNT(*) GROUP BY <column>`, busiest first, as `[{ label, total }]`.
 *
 * The column is named in snake_case and wrapped in `col()` rather than passed
 * as a model attribute. Sequelize maps attribute names to columns in `where`
 * and in `attributes`, but not reliably inside `group` — which is why the one
 * other grouped query in this codebase spells its group clause out by hand too
 * (see `dashboard.controller`). Aliasing to `label` keeps the shape identical
 * whichever column was grouped, so every caller and the UI read the same two
 * keys.
 */
const groupCount = (column, where, { limit = null, skipNull = false } = {}) =>
  db.Lead.findAll({
    where: skipNull ? mergeWhere(where, { [camel(column)]: { [Op.ne]: null } }) : where,
    attributes: [
      [col(column), 'label'],
      [fn('COUNT', col('Lead.id')), 'total'],
    ],
    group: [col(column)],
    order: [[literal('total'), 'DESC']],
    ...(limit ? { limit } : {}),
    raw: true,
  });

/** Rows from `groupCount`, with an unlabelled bucket named rather than dropped. */
const tally = (rows, fallback = 'Unknown') =>
  rows.map((row) => ({ label: row.label ?? fallback, total: Number(row.total) }));

/**
 * Every stage present, at zero if need be.
 *
 * A stage absent from the response would make the console's row of counters
 * change width as leads move about, which reads as a rendering bug.
 */
const everyStage = (rows) =>
  LEAD_STAGE_VALUES.reduce(
    (acc, stage) => ({ ...acc, [stage]: Number(rows.find((row) => row.label === stage)?.total ?? 0) }),
    {}
  );

/**
 * The counters above the table.
 *
 * A separate route rather than a `meta` block on the list, because they answer
 * a different question: the table is "these leads, this page", the summary is
 * "all of them, under the filters you set". Folding the second into the first
 * would recompute five aggregates every time someone paged.
 */
const summary = asyncHandler(async (req, res) => {
  const where = filtersOf(req);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(startOfToday.getTime() - 6 * 86400000);

  const [total, today, thisWeek, contactable, byStage, byDevice, visits] = await Promise.all([
    db.Lead.count({ where }),
    db.Lead.count({ where: mergeWhere(where, { lastSeenAt: { [Op.gte]: startOfToday } }) }),
    db.Lead.count({ where: mergeWhere(where, { lastSeenAt: { [Op.gte]: weekAgo } }) }),
    /** Leads the company can actually reach — a push token, or a name and number. */
    db.Lead.count({ where: mergeWhere(where, { fcmToken: { [Op.ne]: null } }) }),
    groupCount('stage', where),
    groupCount('device_type', where),
    db.Lead.findOne({
      where,
      attributes: [[fn('COALESCE', fn('SUM', col('visit_count')), 0), 'total']],
      raw: true,
    }),
  ]);

  return success(res, {
    message: 'Lead summary fetched successfully',
    data: {
      total,
      today,
      thisWeek,
      withPushToken: contactable,
      totalVisits: Number(visits?.total ?? 0),
      stages: everyStage(byStage),
      devices: tally(byDevice, DEVICE_TYPE.UNKNOWN),
    },
  });
});

/** Loads one lead, refusing anything outside the caller's scope. */
const findLead = async (req) => {
  const lead = await db.Lead.findOne({
    where: mergeWhere({ id: req.params.id }, scopeOf(req)),
    include: [companyInclude, branchInclude],
  });
  if (!lead) throw ApiError.notFound('Lead not found');
  return lead;
};

/**
 * GET /my-company/leads/:id
 *
 * The lead and **every visit behind it** — which is what the table's view
 * action opens. The list row is a summary of this device; this is the history
 * that summary was rolled up from, newest first.
 *
 * Visits are returned whole rather than paged. A lead with more than a page of
 * them is a lead worth reading in full, and the alternative — a second request
 * for page two of a modal — costs more than sending them. `visits()` below
 * exists for the rare device that has hundreds.
 */
const detail = asyncHandler(async (req, res) => {
  const lead = await findLead(req);

  const visits = await db.LeadVisit.findAll({
    where: { leadId: lead.id },
    include: [branchInclude],
    order: [['visitedAt', 'DESC'], ['id', 'DESC']],
    limit: 200,
  });

  return success(res, {
    message: 'Lead fetched successfully',
    data: { lead, visits },
  });
});

/** GET /my-company/leads/:id/visits — the same history, paged, for a long one. */
const visits = asyncHandler(async (req, res) => {
  const lead = await findLead(req);
  const { page, limit, offset } = getPagination(req.query);

  const result = await db.LeadVisit.findAndCountAll({
    where: { leadId: lead.id },
    include: [branchInclude],
    order: [['visitedAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return paginated(res, result, { page, limit }, 'Lead visits fetched successfully');
});

/**
 * PATCH /my-company/leads/:id
 *
 * The one write. Moves the lead along its stages and records what the company
 * found out — a name off a phone call, a number, a note. Nothing a visit
 * reported can be edited here, because none of it is an opinion.
 */
const update = asyncHandler(async (req, res) => {
  const lead = await findLead(req);

  const patch = { updatedBy: req.auth?.id ?? null };
  ['stage', 'name', 'email', 'phone', 'notes'].forEach((field) => {
    if (req.body[field] === undefined) return;
    // An empty string is a deliberate clear, so it is stored as NULL.
    patch[field] = req.body[field] === '' ? null : req.body[field];
  });

  await lead.update(patch);
  return success(res, { message: 'Lead updated successfully', data: lead });
});

/* ------------------------------------------------------------------ *
 * Analytics
 * ------------------------------------------------------------------ */

/**
 * GET /leads/analytics        (super admin — the whole platform)
 * GET /my-company/leads/analytics  (company admin — their own)
 *
 * The same aggregation for both consoles, scoped by the token. The platform
 * view answers "which of my tenants are getting traffic"; the tenant view
 * answers "where are my visitors coming from". They are the same numbers cut
 * along different dimensions, so they are one query set rather than two that
 * would drift apart.
 *
 * Every list is capped by `?limit=` (ten by default). A "top campaigns" chart
 * with four hundred bars is not a chart.
 */
const analytics = asyncHandler(async (req, res) => {
  const isPlatform = req.auth?.scope === AUTH_SCOPE.SUPER_ADMIN;
  const where = mergeWhere(
    scopeOf(req),
    branchClause(req.query.branchId),
    windowClause(req.query),
    req.query.includeBots ? null : { isBot: false }
  );
  const top = Number(req.query.limit) || 10;

  /** One grouped "top N" list, busiest bucket first, nulls left out. */
  const topBy = (column) => groupCount(column, where, { limit: top, skipNull: true });

  const [
    totalLeads,
    totalVisits,
    byStage,
    byDevice,
    bySource,
    byMedium,
    byCampaign,
    byReferrer,
    byCity,
    byCountry,
    byBrowser,
    byOs,
    daily,
  ] = await Promise.all([
    db.Lead.count({ where }),
    db.Lead.findOne({
      where,
      attributes: [[fn('COALESCE', fn('SUM', col('visit_count')), 0), 'total']],
      raw: true,
    }),
    groupCount('stage', where),
    groupCount('device_type', where),
    topBy('utm_source'),
    topBy('utm_medium'),
    topBy('utm_campaign'),
    topBy('first_referrer_host'),
    topBy('city'),
    topBy('country'),
    topBy('browser'),
    topBy('os'),
    /**
     * The trend, by the day a lead was last seen. `DATE()` is spelled the same
     * in MySQL and SQLite, so unlike the month grouping elsewhere in this
     * codebase it needs no per-dialect expression.
     */
    db.Lead.findAll({
      where,
      attributes: [[fn('DATE', col('last_seen_at')), 'day'], [fn('COUNT', col('id')), 'total']],
      group: [fn('DATE', col('last_seen_at'))],
      order: [[literal('day'), 'ASC']],
      limit: 90,
      raw: true,
    }),
  ]);

  /**
   * Company-wise counts — the platform's headline number, and the one thing
   * the tenant console has no business computing. Ordered by lead count so the
   * busiest tenant is first, which is what the screen is for.
   */
  const byCompany = isPlatform
    ? await db.Lead.findAll({
        where,
        attributes: ['companyId', [fn('COUNT', col('Lead.id')), 'total'], [fn('SUM', col('visit_count')), 'visits']],
        include: [{ ...companyInclude, attributes: ['id', 'name', 'code'] }],
        group: ['Lead.company_id', 'company.id'],
        order: [[literal('total'), 'DESC']],
        limit: 50,
        raw: true,
        nest: true,
      })
    : [];

  /**
   * Branch-wise counts. Company-wide traffic — `branch_id NULL` — is a real
   * bucket and is reported as one rather than dropped: for most tenants it is
   * the largest, and a breakdown that silently omitted it would not add up to
   * the total on the same screen.
   */
  const byBranch = await db.Lead.findAll({
    where,
    attributes: ['branchId', [fn('COUNT', col('Lead.id')), 'total']],
    include: [{ ...branchInclude, attributes: ['id', 'name', 'code'] }],
    group: ['Lead.branch_id', 'branch.id'],
    order: [[literal('total'), 'DESC']],
    limit: 50,
    raw: true,
    nest: true,
  });

  return success(res, {
    message: 'Lead analytics fetched successfully',
    data: {
      totals: {
        leads: totalLeads,
        visits: Number(totalVisits?.total ?? 0),
        /** Visits per lead — how often people come back, in one number. */
        visitsPerLead: totalLeads ? Number((Number(totalVisits?.total ?? 0) / totalLeads).toFixed(2)) : 0,
      },
      stages: everyStage(byStage),
      devices: tally(byDevice, DEVICE_TYPE.UNKNOWN),
      sources: tally(bySource),
      mediums: tally(byMedium),
      campaigns: tally(byCampaign),
      referrers: tally(byReferrer),
      cities: tally(byCity),
      countries: tally(byCountry),
      browsers: tally(byBrowser),
      operatingSystems: tally(byOs),
      daily: daily.map((row) => ({ day: String(row.day), total: Number(row.total) })),
      companies: byCompany.map((row) => ({
        companyId: row.companyId,
        name: row.company?.name ?? 'Unknown',
        code: row.company?.code ?? null,
        total: Number(row.total),
        visits: Number(row.visits ?? 0),
      })),
      branches: byBranch.map((row) => ({
        branchId: row.branchId,
        name: row.branch?.name ?? 'Company-wide',
        code: row.branch?.code ?? null,
        total: Number(row.total),
      })),
    },
  });
});

module.exports = { list, summary, detail, visits, update, analytics };
