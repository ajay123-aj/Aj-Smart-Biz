'use strict';

/**
 * The blog a tenant writes, from the console's side.
 *
 * Mounted by the caller so the permission gate is applied there rather than on a
 * pathless `use` here - the rule `functionality.routes` states, and for the same
 * reason: a middleware on a pathless `use` would run on every request to the
 * parent router, not only the ones that reach this file.
 *
 * The literal paths come before `/:id`, or Express reads "summary" as a post id.
 */
const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('../controllers/blog.controller');
const validate = require('../middlewares/validate');
const schema = require('../validators/blog.validator');
const master = require('../validators/master.validator');

/**
 * @openapi
 * /admin/company/blog:
 *   get:
 *     tags: [Admin]
 *     summary: The company's blog posts, paged
 *     description: |
 *       The writing desk, not the website: drafts and scheduled posts are in
 *       here alongside what a visitor can read.
 *
 *       Every row carries `state` - `live`, `scheduled`, `draft` or `hidden` -
 *       worked out by the API from `status` and `publishedAt` together. The
 *       console renders it rather than deriving it, so it cannot come to claim a
 *       post is live on a day the website disagrees.
 *
 *       Filters: `state`, `tag`, `branchId` (or `none` for the company-wide
 *       posts), `featured` and `search`, which covers the title, the standfirst
 *       and the author.
 *   post:
 *     tags: [Admin]
 *     summary: Write a post
 *     description: |
 *       `title` and `body` are all that is required. The slug is generated from
 *       the title and made unique within the tenant; send one to choose it
 *       yourself, and it is still normalised.
 *
 *       When it appears is `publishedAt`: a date in the **future is accepted on
 *       purpose** and schedules the post, which is saved, complete and invisible
 *       until then. Omit it and send `publish: true` to put it up now; omit both
 *       and it is a draft.
 *
 *       Requires the plan to *grant* `blog` - not for the feature to be switched
 *       on. A company must be able to write its first few articles before it
 *       publishes any of them.
 */
router.get('/', validate(schema.listQuery), controller.list);
/** Both before `/:id`, or Express reads the word as a post id. */
router.get('/summary', controller.summary);
router.get('/tags', controller.tags);
router.post('/', validate(schema.create), controller.create);

/**
 * @openapi
 * /admin/company/blog/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: One post, with its article
 *   put:
 *     tags: [Admin]
 *     summary: Edit a post
 *     description: |
 *       The slug is **not** rewritten when the title changes. An article's
 *       address is what other people have linked to and what a search engine has
 *       indexed, and regenerating it on a typo fix would break both silently.
 *       Send `slug` explicitly to change it.
 *
 *       `publish: true` fills in a missing date; a post that already has one
 *       keeps it, so saving an edit to an old article does not re-date it to
 *       today.
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a post
 *     description: |
 *       A soft delete, like everything else here. The cover image is left on
 *       disk deliberately: a restored post with a broken picture is worse than
 *       the disk space.
 */
router.get('/:id', validate(master.idParam), controller.getById);
router.put('/:id', validate(schema.update), controller.update);
/**
 * @openapi
 * /admin/company/blog/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Take a post off the site, or put it back
 *     description: |
 *       Does not touch `publishedAt`. Hiding an article and un-publishing it are
 *       different acts, and a post hidden for a week comes back with its own date
 *       on it rather than with today's.
 */
router.patch('/:id/status', validate(master.statusBody), controller.toggleStatus);
router.delete('/:id', validate(master.idParam), controller.remove);

module.exports = router;
