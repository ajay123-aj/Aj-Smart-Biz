'use strict';

const { Joi, id, idParam, listQuery, status } = require('./common');
const {
  SLUG_MAX,
  BLOG_TAGS_MAX,
  BLOG_TAG_LENGTH,
  BLOG_BODY_MAX,
  BLOG_EXCERPT_MAX,
  BLOG_PAGE_SIZE,
  BLOG_PAGE_SIZE_MAX,
} = require('../constants');

/**
 * What a tenant may send about its blog.
 *
 * Two things here are unlike the other content validators, and both are about
 * the same column. A post carries a **date that decides whether the public can
 * see it**, so `publishedAt` is accepted in the future deliberately - that is
 * scheduling, not a mistake - and `publish` exists as a separate flag so the
 * editor can say "put this up now" without the form having to know today's date.
 *
 * The body is capped rather than left open. It is the largest thing any tenant
 * can put in this database, and a cap that a genuine long-read comfortably fits
 * under is the difference between a long article and somebody pasting a file in.
 */

/** `null` is a real value - it means company-wide. */
const branchId = Joi.alternatives().try(id, Joi.valid(null));

/**
 * The slug, when a tenant writes it themselves.
 *
 * Optional: left out, the controller makes one from the title. Sent, it is still
 * put through the same generator, so somebody typing `How We Fit A Kitchen!!`
 * into the field gets `how-we-fit-a-kitchen` rather than a URL with punctuation
 * in it.
 */
const slug = Joi.string().trim().allow('', null).max(SLUG_MAX);

/**
 * The labels an article is filed under.
 *
 * Trimmed, emptied of blanks and deduplicated on the way in rather than refused:
 * somebody adding four tags and leaving two boxes empty has not made an error,
 * and telling them they have is the kind of validation that makes a form hostile.
 * The count and the length are hard limits, because those are what protect the
 * column and the archive's filter.
 */
const tags = Joi.array()
  .items(Joi.string().trim().min(1).max(BLOG_TAG_LENGTH))
  .max(BLOG_TAGS_MAX)
  .allow(null)
  .messages({ 'array.max': `A post may carry at most ${BLOG_TAGS_MAX} tags` });

const postFields = {
  branchId,
  title: Joi.string().trim().min(1).max(200),
  slug,
  excerpt: Joi.string().trim().allow('', null).max(BLOG_EXCERPT_MAX),
  body: Joi.string().trim().min(1).max(BLOG_BODY_MAX).messages({
    'string.max': `An article may be at most ${BLOG_BODY_MAX} characters`,
  }),
  /** An upload path from `POST /uploads/blog`. */
  coverImage: Joi.string().trim().allow('', null).max(255),
  author: Joi.string().trim().allow('', null).max(80),
  tags,
  /**
   * When it goes live, and the date printed on it.
   *
   * **A future date is accepted on purpose.** It is the whole of the scheduling
   * feature: a row dated next Monday is saved, complete and invisible until then.
   * `null` clears it, which is how a published post is returned to a draft.
   */
  publishedAt: Joi.date().iso().allow(null),
  featured: Joi.boolean(),
  status,
};

/**
 * "Put this up now", without the form having to know today's date.
 *
 * Not a column: the controller turns it into a `publishedAt` of now and it is
 * never stored. Ignored when `publishedAt` is sent explicitly, and on an update
 * it only ever fills a date that is missing - pressing Save on an article from
 * March must not re-date it to today.
 */
const publish = Joi.boolean();

const create = {
  body: Joi.object({
    ...postFields,
    publish,
    title: postFields.title.required(),
    body: postFields.body.required(),
  }),
};

const update = { params: idParam, body: Joi.object({ ...postFields, publish }).min(1) };

/**
 * The console's own list: paged, and filterable by the state a post is in.
 *
 * `state` is not a column - it is `status` and `publishedAt` read together, and
 * the controller turns each of these words into the pair of conditions that
 * means it. See `blog.controller`.
 */
const listQueryAdmin = {
  query: listQuery({
    branchId: Joi.alternatives().try(id, Joi.string().valid('none', 'null')),
    state: Joi.string().valid('live', 'scheduled', 'draft', 'hidden'),
    tag: Joi.string().trim().max(BLOG_TAG_LENGTH),
    featured: Joi.boolean(),
    status,
  }),
};

/* ------------------------------------------------------------------ *
 * The public archive
 * ------------------------------------------------------------------ */

/**
 * `GET /theme/blog`, which a stranger calls.
 *
 * Its own schema rather than the console's, and narrower in every direction:
 * there is no `state` (only published posts exist out there), no `branchId` (the
 * host decides that, never the caller) and a hard ceiling on `limit`, because
 * this is the one paged list on the platform an unauthenticated caller can ask
 * for a page of.
 *
 * `domain` is here for the reason the other public schemas carry it: `validate`
 * strips unknown keys, so a field the schema does not name would be removed
 * before the handler could resolve the tenant from it.
 */
const publicList = {
  query: Joi.object({
    domain: Joi.string().trim().max(255),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(BLOG_PAGE_SIZE_MAX).default(BLOG_PAGE_SIZE),
    tag: Joi.string().trim().max(BLOG_TAG_LENGTH),
    search: Joi.string().trim().max(120),
  }),
};

/** `GET /theme/blog/:slug`. */
const publicOne = {
  params: Joi.object({ slug: Joi.string().trim().min(1).max(SLUG_MAX).required() }),
  query: Joi.object({ domain: Joi.string().trim().max(255) }),
};

module.exports = { create, update, listQuery: listQueryAdmin, publicList, publicOne };
