'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, mergeWhere, Op } = require('../utils/query');
const { uniqueSlug } = require('../utils/slug');
const { removeUploadedFile } = require('../middlewares/upload');
const functionalityService = require('../services/functionality.service');
const { AUTH_SCOPE, STATUS, FUNCTIONALITY } = require('../constants');

/**
 * The blog a tenant writes.
 *
 * Shaped like the catalogue controller rather than like `cardResource.factory`,
 * and for two of the same reasons: the list **pages** (a blog is however long
 * the business has been writing) and the rows are addressed by **slug** on the
 * public site. It differs from the catalogue in one way that runs through every
 * handler here - a post has a *date*, and that date decides whether the public
 * can see it.
 *
 * ### Three states, not two
 *
 * Every other content table on the platform is active or inactive. A post is:
 *
 *   draft       `publishedAt` is null. Written, saved, shown to nobody.
 *   scheduled   dated in the future. Complete and waiting; it appears on its
 *               own, with no scheduler and nothing to run.
 *   live        active and dated in the past.
 *
 * `status` is the fourth thing and is not one of them: it is how a tenant takes
 * a live post *down* without losing it and without rewriting the day it was
 * published. So this controller reports both, and the screen shows which of the
 * four a row is in rather than making somebody work it out from two columns.
 *
 * Writes are gated on the plan's **grant** rather than on the feature being
 * live, the same rule the rest of the website-content half follows: a company
 * must be able to write its first three articles before it switches the section
 * on.
 */

const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

const assertGranted = (companyId) => functionalityService.assertGranted(companyId, FUNCTIONALITY.BLOG);

/** Featured first, then newest, then whatever is still undated. */
const ORDER = [['featured', 'DESC'], ['published_at', 'DESC'], ['id', 'DESC']];

const BRANCH_INCLUDE = { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false };

/** `?branchId=` filters to one branch, `none` to the company-wide rows. */
const branchFilter = (query) => {
  if (query.branchId === 'none' || query.branchId === 'null') return { branchId: null };
  if (query.branchId) return { branchId: Number(query.branchId) };
  return null;
};

/** A post may only be pinned to a branch of its own company. */
const assertBranchBelongsToCompany = async (branchId, companyId) => {
  if (branchId === undefined || branchId === null || branchId === '') return null;
  const branch = await db.Branch.findOne({ where: { id: branchId, companyId }, attributes: ['id'] });
  if (!branch) throw ApiError.badRequest('That branch does not belong to this company');
  return branch.id;
};

/**
 * The tags, tidied: trimmed, emptied of blanks and deduplicated.
 *
 * Done here rather than in the schema because none of it is a reason to refuse
 * a save. Somebody who typed `case study` twice has not made an error worth
 * stopping a form for, and Joi's own `unique()` would turn it into one.
 */
const cleanTags = (tags) => {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) return null;

  const seen = new Set();
  tags.forEach((raw) => {
    const tag = String(raw).trim();
    if (tag) seen.add(tag);
  });
  return [...seen];
};

/**
 * Which of the four states a row is in, decided **here** rather than in the
 * console.
 *
 * The website's own rule is `status === active && publishedAt <= now`, and it
 * lives in `functionalityService.publishedWhere`. Working the same rule out a
 * second time in Angular is how the console would come to claim a post is live
 * on a day the site disagrees, so the answer is sent rather than recomputed.
 */
const stateOf = (row) => {
  if (row.status !== STATUS.ACTIVE) return 'hidden';
  if (!row.publishedAt) return 'draft';
  return new Date(row.publishedAt) > new Date() ? 'scheduled' : 'live';
};

/** What the console renders. The body is included: this is the editor's list. */
const asAdminPost = (row) => ({
  ...row.toJSON(),
  state: stateOf(row),
  readMinutes: functionalityService.readMinutes(row.body),
});

/**
 * GET /my-company/blog
 *
 * Paged, newest first, with drafts and scheduled posts included - this is the
 * writing desk, not the website. `state` narrows it to one of the four.
 */
const list = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { page, limit, offset } = getPagination(req.query);

  /**
   * The state filter, as database conditions rather than as a column.
   *
   * There is no `state` column and there should not be: it is two facts read
   * together, and storing the answer would let it drift the moment a scheduled
   * post's date passed with nobody editing it.
   */
  const stateFilter = () => {
    const now = new Date();
    switch (req.query.state) {
      case 'live':
        return { status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } };
      case 'scheduled':
        return { status: STATUS.ACTIVE, publishedAt: { [Op.gt]: now } };
      case 'draft':
        return { status: STATUS.ACTIVE, publishedAt: null };
      case 'hidden':
        return { status: STATUS.INACTIVE };
      default:
        return null;
    }
  };

  /**
   * `?tag=` matches a label inside the JSON column.
   *
   * Through `tagWhere`, which is also what the public archive's filter uses -
   * one rule, so the list a tenant filters and the page a reader filters cannot
   * come to disagree about what is filed under a label.
   */
  const tagFilter = () => {
    const tagged = req.query.tag ? functionalityService.tagWhere(req.query.tag) : null;
    /* Under `Op.and` rather than beside the columns: `mergeWhere` merges plain
       objects with `Object.assign`, and a Sequelize `where()` is not one - spread
       flat, its internals would be read as a column named `attribute`. */
    return tagged ? { [Op.and]: [tagged] } : null;
  };

  const { rows, count } = await db.CompanyBlogPost.findAndCountAll({
    where: mergeWhere(
      { companyId },
      branchFilter(req.query),
      stateFilter(),
      tagFilter(),
      req.query.featured !== undefined ? { featured: req.query.featured } : null,
      req.query.search ? buildSearch(req.query.search, ['title', 'excerpt', 'author']) : null
    ),
    include: [BRANCH_INCLUDE],
    order: ORDER,
    limit,
    offset,
    distinct: true,
  });

  return paginated(
    res,
    { rows: rows.map(asAdminPost), count },
    { page, limit },
    'Blog posts fetched successfully'
  );
});

/**
 * GET /my-company/blog/summary
 *
 * The strip above the list: how much is written, how much of it a visitor can
 * actually read, and what is queued behind today.
 */
const summary = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const now = new Date();

  const [total, live, scheduled, drafts, hidden, latest] = await Promise.all([
    db.CompanyBlogPost.count({ where: { companyId } }),
    db.CompanyBlogPost.count({
      where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } },
    }),
    db.CompanyBlogPost.count({ where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.gt]: now } } }),
    db.CompanyBlogPost.count({ where: { companyId, status: STATUS.ACTIVE, publishedAt: null } }),
    db.CompanyBlogPost.count({ where: { companyId, status: STATUS.INACTIVE } }),
    db.CompanyBlogPost.findOne({
      where: { companyId, status: STATUS.ACTIVE, publishedAt: { [Op.ne]: null, [Op.lte]: now } },
      order: [['published_at', 'DESC']],
      attributes: ['id', 'title', 'slug', 'publishedAt'],
    }),
  ]);

  return success(res, {
    message: 'Blog summary fetched successfully',
    data: {
      total,
      live,
      scheduled,
      drafts,
      hidden,
      /* The date at the top of the blog. A tenant looking at this screen is
         usually asking "when did we last post", and a list sorted by featured
         first cannot answer it. */
      latest: latest
        ? { id: latest.id, title: latest.title, slug: latest.slug, publishedAt: latest.publishedAt }
        : null,
    },
  });
});

/**
 * GET /my-company/blog/tags
 *
 * Every label this tenant has used, with a count. Read from the rows rather than
 * from a table, because there is no table - see `CompanyBlogPost.tags`.
 *
 * It feeds two things: the filter above the list, and the suggestions under the
 * tag field on the editor. The second is the point. Free-text tags without a
 * list of what already exists is how a blog ends up filed under `case-study`,
 * `case study` and `Case Studies` at once.
 */
const tags = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const rows = await db.CompanyBlogPost.findAll({ where: { companyId }, attributes: ['tags'] });

  const counts = new Map();
  rows.forEach((row) => {
    (Array.isArray(row.tags) ? row.tags : []).forEach((raw) => {
      const tag = String(raw).trim();
      if (!tag) return;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });

  const items = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return success(res, { message: 'Blog tags fetched successfully', data: { items } });
});

const findOrFail = async (companyId, id) => {
  const row = await db.CompanyBlogPost.findOne({ where: { id, companyId }, include: [BRANCH_INCLUDE] });
  if (!row) throw ApiError.notFound('Blog post not found');
  return row;
};

const getById = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const row = await findOrFail(companyId, req.params.id);
  return success(res, { message: 'Blog post fetched successfully', data: asAdminPost(row) });
});

/**
 * POST /my-company/blog
 *
 * `publishedAt` is what makes this three handlers' worth of behaviour in one:
 *
 *   sent            that is the date, past or future. A future one schedules it.
 *   omitted, and    published now. Somebody who wrote an article and pressed
 *   `publish` true  Save meant to publish it, and making them set today's date
 *                   by hand would be a form asking a question it can answer.
 *   omitted         a draft.
 */
const create = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);

  const { publish, ...body } = req.body;
  const publishedAt = body.publishedAt !== undefined ? body.publishedAt : publish ? new Date() : null;

  const row = await db.CompanyBlogPost.create({
    ...body,
    tags: cleanTags(body.tags) ?? null,
    companyId,
    branchId: branchId ?? null,
    slug: await uniqueSlug(db.CompanyBlogPost, companyId, body.slug || body.title),
    publishedAt,
    createdBy: req.auth?.id ?? null,
  });

  return created(res, 'Blog post added successfully', asAdminPost(row));
});

/**
 * PUT /my-company/blog/:id
 *
 * The slug is **not** rewritten when the title changes, and that is the single
 * most important line in this file. An article's address is what other people
 * have linked to and what a search engine has indexed; regenerating it on a typo
 * fix would break both, silently, with nothing in the interface to say so. Send
 * `slug` explicitly to change it.
 */
const update = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findOrFail(companyId, req.params.id);

  const { publish, ...body } = req.body;
  const patch = { ...body, updatedBy: req.auth?.id ?? null };

  if ('tags' in body) patch.tags = cleanTags(body.tags);

  if ('branchId' in req.body) {
    patch.branchId = await assertBranchBelongsToCompany(req.body.branchId, companyId);
  }
  if (req.body.slug) {
    patch.slug = await uniqueSlug(db.CompanyBlogPost, companyId, req.body.slug, row.id);
  }

  /* Publishing a draft from the editor, without making somebody type today's
     date. An article that already has a date keeps it: pressing Save on a post
     from March must not re-date it to today. */
  if (publish && patch.publishedAt === undefined && !row.publishedAt) patch.publishedAt = new Date();

  const previousCover = row.coverImage;
  await row.update(patch);

  /* Only when a cover was actually sent, and only when it changed. A body that
     never mentions it has replaced nothing. */
  if ('coverImage' in body && previousCover && previousCover !== row.coverImage) {
    removeUploadedFile(previousCover);
  }

  return success(res, { message: 'Blog post updated successfully', data: asAdminPost(row) });
});

/**
 * PATCH /my-company/blog/:id/status
 *
 * Takes a post off the site, or puts it back. Deliberately does **not** touch
 * `publishedAt`: hiding an article and un-publishing it are different acts, and
 * a tenant who hides last March's post for a week should get it back with its
 * own date on it rather than with today's.
 */
const toggleStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findOrFail(companyId, req.params.id);
  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });

  return success(res, {
    message: `Blog post marked ${next}`,
    data: { id: row.id, status: next, state: stateOf(row) },
  });
});

/**
 * The post's cover is deliberately **not** removed with it.
 *
 * This table is paranoid, so the delete is soft and the row comes back if it is
 * restored - with its picture still on disk, because nothing was unlinked.
 * Deleting it would make a restore produce an article with a broken image, which
 * is worse than the disk space. The same rule the catalogue follows.
 */
const remove = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertGranted(companyId);

  const row = await findOrFail(companyId, req.params.id);
  await row.update({ updatedBy: req.auth?.id ?? null });
  await row.destroy();

  return success(res, { message: 'Blog post deleted successfully', data: { id: row.id } });
});

module.exports = { list, summary, tags, getById, create, update, toggleStatus, remove, stateOf };
