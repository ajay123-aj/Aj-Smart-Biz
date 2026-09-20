'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, getSort, buildSearch, mergeWhere } = require('../utils/query');
const marketingLeadService = require('../services/marketingLead.service');
const {
  STATUS,
  FUNCTIONALITY_CATALOGUE,
  MARKETING_ENQUIRY_KIND,
  MARKETING_ENQUIRY_STATUS,
} = require('../constants');

/**
 * Our own marketing site — the Aj Smart Biz Technology pages.
 *
 * Every read here is **public, unauthenticated and identical for every
 * caller**. That is the whole difference from the `/theme` controllers next
 * door: those resolve a tenant from the request host and answer differently per
 * company, and nothing in this file looks at the host at all. There is one
 * marketing site.
 *
 * The reads are also deliberately boring — active rows, in sequence, mapped to
 * the shape the site renders. No pagination and no filtering: the site asks for
 * the price list, not for page two of it.
 */

/* ------------------------------------------------------------------ *
 * Mapping to what the site renders
 * ------------------------------------------------------------------ */

/**
 * A `plans` row as the pricing page wants it.
 *
 * The platform's plan is an entitlement — what a subscription grants — and the
 * pricing page is an advertisement. Most columns are shared, and the three that
 * are not are grouped into `limits` because that is how the card shows them.
 *
 * `code` becomes `id` on purpose: the site puts it in `/demo?plan=`, and a URL
 * that survives is one built on something stable that a human chose. The
 * primary key would work and would also renumber if these were ever reseeded.
 * A plan with no code falls back to the id so a link is never empty.
 */
const toPublicPlan = (plan) => ({
  id: plan.code || String(plan.id),
  name: plan.name,
  tagline: plan.description || '',
  price: Number(plan.price),
  ...(plan.discountPrice == null ? {} : { discountPrice: Number(plan.discountPrice) }),
  currency: plan.currency,
  billingCycle: plan.billingCycle,
  limits: {
    branches: plan.maxBranches,
    logins: plan.maxAdmins,
    storageMb: plan.storageMb,
  },
  /** Prose. Ticked on the card. */
  highlights: Array.isArray(plan.features) ? plan.features : [],
  /** Capability keys. Chips on the card; unknown keys are dropped by the site. */
  includes: Array.isArray(plan.functionalities) ? plan.functionalities : [],
  isPopular: Boolean(plan.isPopular),
});

const toPublicBusinessType = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug || null,
  icon: row.icon || null,
  description: row.description || null,
});

const toPublicFaq = (row) => ({ id: row.id, question: row.question, answer: row.answer });

/**
 * The capability catalogue, straight from `constants`.
 *
 * Not a table, and that is on purpose: these are the things the platform can
 * actually do, so the list is a property of the code rather than of the data.
 * The pricing page and the tenant console read the same one, which is what
 * stops a plan advertising a capability no console can switch on.
 */
const toPublicCapability = (item) => ({
  key: item.key,
  name: item.name,
  icon: item.icon || null,
  summary: item.summary || '',
  description: item.description || '',
  sequence: item.sequence ?? 0,
});

/* ------------------------------------------------------------------ *
 * Public reads
 * ------------------------------------------------------------------ */

const readContent = async () => {
  const rows = await db.MarketingContent.findAll({
    where: { status: STATUS.ACTIVE },
    order: [['key', 'ASC']],
  });
  /**
   * Keyed by section, not a list. The site reads `content.hero`, and handing it
   * an array would make every page find its own row first.
   */
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.payload }), {});
};

/**
 * Only plans explicitly marked for the marketing site.
 *
 * `isPublic` rather than every active plan: the `plans` table also holds plans
 * built for one tenant, plans bundled with a theme, and whatever somebody made
 * while testing. None of those are a price list, and showing them here put
 * "test ajay, Rs200" on the public pricing page.
 */
const readPlans = async () => {
  const rows = await db.Plan.findAll({
    where: { status: STATUS.ACTIVE, isPublic: true },
    order: [
      ['sequence', 'ASC'],
      ['price', 'ASC'],
    ],
  });
  return rows.map(toPublicPlan);
};

/** Same reasoning as `readPlans` — see the note there. */
const readBusinessTypes = async () => {
  const rows = await db.BusinessType.findAll({
    where: { status: STATUS.ACTIVE, isPublic: true },
    order: [['name', 'ASC']],
  });
  return rows.map(toPublicBusinessType);
};

const readFaqs = async () => {
  const rows = await db.MarketingFaq.findAll({
    where: { status: STATUS.ACTIVE },
    order: [
      ['sequence', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return rows.map(toPublicFaq);
};

const readCapabilities = () =>
  [...FUNCTIONALITY_CATALOGUE]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map(toPublicCapability);

/** GET /website/content */
const content = asyncHandler(async (req, res) =>
  success(res, { message: 'Content fetched successfully', data: await readContent() })
);

/** GET /website/plans */
const plans = asyncHandler(async (req, res) =>
  success(res, { message: 'Plans fetched successfully', data: await readPlans() })
);

/** GET /website/capabilities */
const capabilities = asyncHandler(async (req, res) =>
  success(res, { message: 'Capabilities fetched successfully', data: readCapabilities() })
);

/** GET /website/business-types */
const businessTypes = asyncHandler(async (req, res) =>
  success(res, { message: 'Business types fetched successfully', data: await readBusinessTypes() })
);

/** GET /website/faqs */
const faqs = asyncHandler(async (req, res) =>
  success(res, { message: 'FAQs fetched successfully', data: await readFaqs() })
);

/**
 * GET /website/bootstrap
 *
 * Everything the site renders, in one round trip.
 *
 * Worth having rather than leaving the site to make five calls: the Technology
 * site is server-rendered, so those five would be five sequential hops between
 * two containers before a single byte reaches the browser. The individual
 * endpoints stay because one page wanting one list should not have to fetch all
 * of it, and because each is easier to read in the docs than a slice of this.
 */
const bootstrap = asyncHandler(async (req, res) => {
  const [contentBlocks, planList, businessTypeList, faqList] = await Promise.all([
    readContent(),
    readPlans(),
    readBusinessTypes(),
    readFaqs(),
  ]);

  return success(res, {
    message: 'Site fetched successfully',
    data: {
      content: contentBlocks,
      plans: planList,
      capabilities: readCapabilities(),
      businessTypes: businessTypeList,
      faqs: faqList,
    },
  });
});

/* ------------------------------------------------------------------ *
 * The enquiry form
 * ------------------------------------------------------------------ */

/**
 * POST /website/enquiries
 *
 * Open to the internet with no token, so it is rate limited at the route and
 * every field is treated as a stranger's typing — see the model's note.
 *
 * Answers 201 with the stored id and nothing else. The site does not need the
 * row back, and echoing it would hand an unauthenticated caller a way to read
 * what it just wrote plus whatever the model adds.
 */
const submitEnquiry = asyncHandler(async (req, res) => {
  const row = await db.MarketingEnquiry.create({
    kind: req.body.kind || MARKETING_ENQUIRY_KIND.DEMO,
    name: req.body.name,
    businessName: req.body.businessName || null,
    phone: req.body.phone || null,
    email: req.body.email || null,
    city: req.body.city || null,
    businessType: req.body.businessType || null,
    plan: req.body.plan || null,
    message: req.body.message || null,
    source: req.body.source || null,
    status: MARKETING_ENQUIRY_STATUS.NEW,
    /* `trust proxy` is set in app.js, so this is the caller rather than nginx. */
    ipAddress: req.ip || null,
    userAgent: (req.get('user-agent') || '').slice(0, 400) || null,
  });

  /**
   * Tie the enquiry to the traffic that produced it.
   *
   * Deliberately **after** the row is written and deliberately not awaited for
   * its result: this is the join that turns "somebody from the autumn campaign
   * read the pricing page four times" into "…and then asked for a demo", and
   * it is worth having — but an enquiry is a person trying to become a
   * customer, and a reporting join must never be the reason one is refused.
   * `attachEnquiry` swallows its own failures for the same reason.
   */
  await marketingLeadService.attachEnquiry({ deviceId: req.body.deviceId, enquiry: row });

  return created(res, 'Thank you — we will call you back', { id: row.id });
});

/**
 * POST /website/track
 *
 * One beacon from the marketing site: a page was opened.
 *
 * The same shape the tenant templates post to `/theme/leads`, and the same
 * parsing behind it — see `marketingLead.service`. What it does not have is a
 * tenant: there is one marketing site, so nothing is resolved from the host.
 *
 * Answers with the ids it wrote and nothing else. The browser has no business
 * learning anything about other visitors, and a tracker that reads a response
 * body is a tracker that can be used to enumerate one.
 */
const track = asyncHandler(async (req, res) => {
  const result = await marketingLeadService.recordVisit({ payload: req.body ?? {}, req });
  return created(res, 'Recorded', result);
});

/* ------------------------------------------------------------------ *
 * Managing it — super admin only
 * ------------------------------------------------------------------ */

/**
 * GET /super-admin/marketing/content
 *
 * Every block including the inactive ones, which is the difference from the
 * public read: the console has to show a section that is currently off in order
 * to switch it back on.
 */
const adminContentList = asyncHandler(async (req, res) => {
  const rows = await db.MarketingContent.findAll({ order: [['key', 'ASC']] });
  return success(res, { message: 'Content fetched successfully', data: rows });
});

/** GET /super-admin/marketing/content/:key */
const adminContentGet = asyncHandler(async (req, res) => {
  const row = await db.MarketingContent.findOne({ where: { key: req.params.key } });
  if (!row) throw ApiError.notFound('No such section');
  return success(res, { message: 'Section fetched successfully', data: row });
});

/**
 * PUT /super-admin/marketing/content/:key
 *
 * An upsert rather than a create/update pair. The key set is a fixed whitelist
 * in `constants`, so a section always *conceptually* exists; whether a row has
 * been written for it yet is an implementation detail the console should not
 * have to ask about before it can save.
 */
const adminContentUpsert = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const values = {
    key,
    label: req.body.label ?? null,
    payload: req.body.payload,
    ...(req.body.status ? { status: req.body.status } : {}),
    updatedBy: req.auth?.id ?? null,
  };

  const existing = await db.MarketingContent.findOne({ where: { key } });
  if (existing) {
    await existing.update(values);
    return success(res, { message: 'Section saved successfully', data: existing });
  }

  const row = await db.MarketingContent.create({ ...values, createdBy: req.auth?.id ?? null });
  return created(res, 'Section saved successfully', row);
});

/** GET /super-admin/marketing/faqs — all of them, inactive included. */
const adminFaqList = asyncHandler(async (req, res) => {
  const rows = await db.MarketingFaq.findAll({
    order: [
      ['sequence', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  return success(res, { message: 'FAQs fetched successfully', data: rows });
});

/** POST /super-admin/marketing/faqs */
const adminFaqCreate = asyncHandler(async (req, res) => {
  const row = await db.MarketingFaq.create({ ...req.body, createdBy: req.auth?.id ?? null });
  return created(res, 'Question added successfully', row);
});

/** PUT /super-admin/marketing/faqs/:id */
const adminFaqUpdate = asyncHandler(async (req, res) => {
  const row = await db.MarketingFaq.findByPk(req.params.id);
  if (!row) throw ApiError.notFound('No such question');
  await row.update({ ...req.body, updatedBy: req.auth?.id ?? null });
  return success(res, { message: 'Question saved successfully', data: row });
});

/** DELETE /super-admin/marketing/faqs/:id */
const adminFaqRemove = asyncHandler(async (req, res) => {
  const row = await db.MarketingFaq.findByPk(req.params.id);
  if (!row) throw ApiError.notFound('No such question');
  await row.destroy();
  return success(res, { message: 'Question removed successfully' });
});

/**
 * GET /super-admin/marketing/enquiries
 *
 * Newest first, because this is a callback list and the useful end is the one
 * nobody has rung yet.
 */
const adminEnquiryList = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = mergeWhere(
    req.query.kind ? { kind: req.query.kind } : null,
    req.query.status ? { status: req.query.status } : null,
    buildSearch(req.query.search, ['name', 'businessName', 'phone', 'email', 'city'])
  );

  const result = await db.MarketingEnquiry.findAndCountAll({
    where,
    order: getSort(req.query, ['createdAt', 'name', 'status'], [['createdAt', 'DESC']]),
    limit,
    offset,
  });

  return paginated(res, result, { page, limit }, 'Enquiries fetched successfully');
});

/** GET /super-admin/marketing/enquiries/:id */
const adminEnquiryGet = asyncHandler(async (req, res) => {
  const row = await db.MarketingEnquiry.findByPk(req.params.id);
  if (!row) throw ApiError.notFound('No such enquiry');
  return success(res, { message: 'Enquiry fetched successfully', data: row });
});

/**
 * PATCH /super-admin/marketing/enquiries/:id
 *
 * Status and our own note, and nothing else. What the sender typed is what they
 * typed — correcting it here would turn a message into a record that reads as
 * if they had said something they did not.
 */
const adminEnquiryUpdate = asyncHandler(async (req, res) => {
  const row = await db.MarketingEnquiry.findByPk(req.params.id);
  if (!row) throw ApiError.notFound('No such enquiry');
  await row.update({
    ...(req.body.status ? { status: req.body.status } : {}),
    ...(req.body.note === undefined ? {} : { note: req.body.note || null }),
    updatedBy: req.auth?.id ?? null,
  });
  return success(res, { message: 'Enquiry updated successfully', data: row });
});

module.exports = {
  content,
  plans,
  capabilities,
  businessTypes,
  faqs,
  bootstrap,
  submitEnquiry,
  track,

  adminContentList,
  adminContentGet,
  adminContentUpsert,
  adminFaqList,
  adminFaqCreate,
  adminFaqUpdate,
  adminFaqRemove,
  adminEnquiryList,
  adminEnquiryGet,
  adminEnquiryUpdate,
};
