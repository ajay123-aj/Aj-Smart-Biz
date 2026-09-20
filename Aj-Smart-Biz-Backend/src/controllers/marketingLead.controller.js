'use strict';

const { fn, col, literal } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere, Op } = require('../utils/query');
const { LEAD_STAGE_VALUES, DEVICE_TYPE } = require('../constants');

/**
 * Traffic on **our own** marketing site.
 *
 * The tenant twin is `lead.controller`, and this is deliberately the same
 * screens over the same column names — a list, one lead's detail and history,
 * and the campaign analysis. What is missing is every trace of scoping: there
 * is no company to pin a query to and no branch to break down by, because
 * these rows are ours. That absence is the reason for the separate table; see
 * `marketingLead.model`.
 *
 * Mounted under `/super-admin/marketing/leads`, so the module's guard has
 * already established that the caller runs the platform. Nothing here re-checks
 * a token.
 */

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

/**
 * `?from=` / `?to=`, or `?days=` counted back from now.
 *
 * `days` wins where both are sent: it is what the console's range buttons use,
 * and an explicit range left over in the query string should not quietly
 * override the button somebody just pressed.
 */
const windowClause = (query) => {
  const days = Number(query.days);
  if (Number.isFinite(days) && days > 0) {
    return { lastSeenAt: { [Op.gte]: new Date(Date.now() - days * 86400000) } };
  }

  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const clause = {};
  if (from && !Number.isNaN(from.getTime())) clause[Op.gte] = from;
  if (to && !Number.isNaN(to.getTime())) clause[Op.lte] = to;

  return Object.getOwnPropertySymbols(clause).length ? { lastSeenAt: clause } : null;
};

/**
 * What every read narrows by.
 *
 * **Bots are excluded unless asked for.** A crawler is real traffic and is kept
 * — a number that jumps overnight deserves to show why — but it is not a person
 * to ring, and counting it by default would put search engines at the top of
 * every campaign report.
 */
const filtersOf = (req) =>
  mergeWhere(
    windowClause(req.query),
    req.query.stage ? { stage: req.query.stage } : null,
    req.query.deviceType ? { deviceType: req.query.deviceType } : null,
    req.query.utmSource ? { utmSource: req.query.utmSource } : null,
    req.query.utmCampaign ? { utmCampaign: req.query.utmCampaign } : null,
    /** Only those who actually wrote in, for the list's one useful toggle. */
    req.query.enquiredOnly ? { enquiryId: { [Op.ne]: null } } : null,
    req.query.includeBots ? null : { isBot: false },
    buildSearch(req.query.search, SEARCH_FIELDS)
  );

const SEARCH_FIELDS = ['name', 'email', 'phone', 'device_id', 'city', 'country', 'utm_campaign', 'utm_source'];
const SORT_FIELDS = ['last_seen_at', 'first_seen_at', 'visit_count', 'page_view_count', 'created_at', 'stage'];

/**
 * The columns the table renders.
 *
 * Named rather than `SELECT *` because the row carries two JSON blobs and a
 * user-agent string, none of which the list shows and all of which would be
 * sent for every row on every page.
 */
const LIST_ATTRIBUTES = [
  'id', 'deviceId', 'stage', 'name', 'email', 'phone', 'enquiryId',
  'visitCount', 'pageViewCount', 'firstSeenAt', 'lastSeenAt',
  'utmSource', 'utmMedium', 'utmCampaign',
  'firstReferrerHost', 'lastReferrerHost',
  'deviceType', 'os', 'browser', 'isBot',
  'country', 'region', 'city', 'language',
  'status', 'createdAt',
];

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

/** GET /super-admin/marketing/leads */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const result = await db.MarketingLead.findAndCountAll({
    where: filtersOf(req),
    attributes: LIST_ATTRIBUTES,
    order: getSort(req.query, SORT_FIELDS, [['last_seen_at', 'DESC']]),
    limit,
    offset,
  });

  return paginated(res, result, { page, limit }, 'Website leads fetched successfully');
});

/* ------------------------------------------------------------------ *
 * Aggregates
 * ------------------------------------------------------------------ */

const camel = (column) => column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * `COUNT(*) GROUP BY <column>`, busiest first, as `[{ label, total }]`.
 *
 * The column is named in snake_case and wrapped in `col()` rather than passed
 * as a model attribute: sequelize maps attribute names to columns in `where`
 * and `attributes`, but not reliably inside `group`. Aliasing to `label` keeps
 * the shape identical whichever column was grouped, so the UI reads the same
 * two keys everywhere.
 */
const groupCount = (column, where, { limit = null, skipNull = false } = {}) =>
  db.MarketingLead.findAll({
    where: skipNull ? mergeWhere(where, { [camel(column)]: { [Op.ne]: null } }) : where,
    attributes: [
      [col(column), 'label'],
      [fn('COUNT', col('MarketingLead.id')), 'total'],
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
 * GET /super-admin/marketing/leads/summary
 *
 * The counters above the table. A separate route rather than a `meta` block on
 * the list, because they answer a different question — the table is "these
 * leads, this page", the summary is "all of them, under the filters you set" —
 * and folding them together would recompute every aggregate on each page turn.
 */
const summary = asyncHandler(async (req, res) => {
  const where = filtersOf(req);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(startOfToday.getTime() - 6 * 86400000);

  const [total, today, thisWeek, enquired, byStage, byDevice, visits] = await Promise.all([
    db.MarketingLead.count({ where }),
    db.MarketingLead.count({ where: mergeWhere(where, { lastSeenAt: { [Op.gte]: startOfToday } }) }),
    db.MarketingLead.count({ where: mergeWhere(where, { lastSeenAt: { [Op.gte]: weekAgo } }) }),
    /** The one that matters: browsers who became an enquiry. */
    db.MarketingLead.count({ where: mergeWhere(where, { enquiryId: { [Op.ne]: null } }) }),
    groupCount('stage', where),
    groupCount('device_type', where),
    db.MarketingLead.findOne({
      where,
      attributes: [[fn('COALESCE', fn('SUM', col('visit_count')), 0), 'total']],
      raw: true,
    }),
  ]);

  return success(res, {
    message: 'Website lead summary fetched successfully',
    data: {
      total,
      today,
      thisWeek,
      enquired,
      /**
       * Browsers who wrote in, as a percentage.
       *
       * Computed here rather than in the UI so every screen that shows it
       * rounds the same way, and guarded against a zero denominator — an empty
       * window is 0%, not NaN%.
       */
      conversionRate: total > 0 ? Math.round((enquired / total) * 1000) / 10 : 0,
      totalVisits: Number(visits?.total ?? 0),
      stages: everyStage(byStage),
      devices: tally(byDevice, DEVICE_TYPE.UNKNOWN),
    },
  });
});

/**
 * GET /super-admin/marketing/leads/analytics
 *
 * Where the traffic came from — the campaign report.
 *
 * **First touch throughout.** `utm_source` and friends on the lead are the
 * campaign that *produced* it, written once and never overwritten, so a visitor
 * who arrives from an ad and returns later by typing the address still counts
 * for the ad. That is what a campaign report has to mean; last touch is on the
 * lead's detail for the one question it answers better.
 */
const analytics = asyncHandler(async (req, res) => {
  const where = filtersOf(req);
  const top = Number(req.query.limit) || 10;

  /** One grouped "top N" list, busiest bucket first, nulls left out. */
  const topBy = (column) => groupCount(column, where, { limit: top, skipNull: true });

  const [
    totalLeads,
    totalVisits,
    enquired,
    byStage,
    byDevice,
    bySource,
    byMedium,
    byCampaign,
    byTerm,
    byContent,
    byReferrer,
    byCity,
    byCountry,
    byBrowser,
    byOs,
    byLanding,
    daily,
  ] = await Promise.all([
    db.MarketingLead.count({ where }),
    db.MarketingLead.findOne({
      where,
      attributes: [[fn('COALESCE', fn('SUM', col('visit_count')), 0), 'total']],
      raw: true,
    }),
    db.MarketingLead.count({ where: mergeWhere(where, { enquiryId: { [Op.ne]: null } }) }),
    groupCount('stage', where),
    groupCount('device_type', where),
    topBy('utm_source'),
    topBy('utm_medium'),
    topBy('utm_campaign'),
    topBy('utm_term'),
    topBy('utm_content'),
    topBy('first_referrer_host'),
    topBy('city'),
    topBy('country'),
    topBy('browser'),
    topBy('os'),
    topBy('first_landing_url'),
    /**
     * The trend, by the day a lead was last seen. `DATE()` is spelled the same
     * in MySQL and SQLite, so unlike the month grouping elsewhere in this
     * codebase it needs no per-dialect expression.
     */
    db.MarketingLead.findAll({
      where,
      attributes: [
        [fn('DATE', col('last_seen_at')), 'day'],
        [fn('COUNT', col('id')), 'total'],
      ],
      group: [fn('DATE', col('last_seen_at'))],
      order: [[literal('day'), 'ASC']],
      limit: 90,
      raw: true,
    }),
  ]);

  /**
   * Enquiries per campaign, which is the only number on this page that says
   * whether a campaign *worked* rather than how loud it was.
   *
   * Its own query rather than a column on `byCampaign`: it filters on a
   * different clause, and bolting it onto the grouped count would mean a
   * conditional aggregate spelled differently in every dialect.
   */
  const enquiriesByCampaign = await groupCount(
    'utm_campaign',
    mergeWhere(where, { enquiryId: { [Op.ne]: null } }),
    { limit: top, skipNull: true }
  );

  return success(res, {
    message: 'Website lead analytics fetched successfully',
    data: {
      totals: {
        leads: totalLeads,
        visits: Number(totalVisits?.total ?? 0),
        enquiries: enquired,
        conversionRate: totalLeads > 0 ? Math.round((enquired / totalLeads) * 1000) / 10 : 0,
      },
      stages: everyStage(byStage),
      devices: tally(byDevice, DEVICE_TYPE.UNKNOWN),
      utm: {
        source: tally(bySource),
        medium: tally(byMedium),
        campaign: tally(byCampaign),
        term: tally(byTerm),
        content: tally(byContent),
      },
      /** Campaigns by enquiries produced, not by traffic. See above. */
      campaignEnquiries: tally(enquiriesByCampaign),
      referrers: tally(byReferrer, 'Direct'),
      landingPages: tally(byLanding),
      geo: { cities: tally(byCity), countries: tally(byCountry) },
      tech: { browsers: tally(byBrowser), os: tally(byOs) },
      daily: daily.map((row) => ({ day: row.day, total: Number(row.total) })),
    },
  });
});

/* ------------------------------------------------------------------ *
 * One lead
 * ------------------------------------------------------------------ */

const findLead = async (req) => {
  const lead = await db.MarketingLead.findByPk(req.params.id, {
    include: [
      {
        model: db.MarketingEnquiry,
        as: 'enquiry',
        required: false,
        attributes: ['id', 'kind', 'name', 'phone', 'email', 'plan', 'message', 'status', 'createdAt'],
      },
    ],
  });
  if (!lead) throw ApiError.notFound('No such lead');
  return lead;
};

/** GET /super-admin/marketing/leads/:id */
const detail = asyncHandler(async (req, res) =>
  success(res, { message: 'Website lead fetched successfully', data: await findLead(req) })
);

/**
 * GET /super-admin/marketing/leads/:id/visits
 *
 * Paged, because this is the one list whose length is set by how interested
 * somebody is rather than by anything we control.
 */
const visits = asyncHandler(async (req, res) => {
  await findLead(req);
  const { page, limit, offset } = getPagination(req.query);

  const result = await db.MarketingLeadVisit.findAndCountAll({
    where: { leadId: req.params.id },
    order: [['visitedAt', 'DESC']],
    limit,
    offset,
  });

  return paginated(res, result, { page, limit }, 'Visits fetched successfully');
});

/**
 * PATCH /super-admin/marketing/leads/:id
 *
 * Stage, notes and whatever we learned about who they are.
 *
 * Nothing the browser reported is editable: the traffic is a record of what
 * happened, and correcting a campaign here would quietly falsify the report
 * the campaign is being judged by.
 */
const update = asyncHandler(async (req, res) => {
  const lead = await findLead(req);

  await lead.update({
    ...(req.body.stage ? { stage: req.body.stage } : {}),
    ...(req.body.name === undefined ? {} : { name: req.body.name || null }),
    ...(req.body.email === undefined ? {} : { email: req.body.email || null }),
    ...(req.body.phone === undefined ? {} : { phone: req.body.phone || null }),
    ...(req.body.notes === undefined ? {} : { notes: req.body.notes || null }),
    updatedBy: req.auth?.id ?? null,
  });

  return success(res, { message: 'Website lead updated successfully', data: lead });
});

module.exports = { list, summary, analytics, detail, visits, update };
