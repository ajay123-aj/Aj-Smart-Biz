'use strict';

const { DataTypes } = require('sequelize');
const { STATUS, STATUS_VALUES } = require('../constants');

/**
 * One article on a tenant's blog.
 *
 * The only content table on the platform whose rows are **dated rather than
 * ordered**, and that one difference shapes the whole of it. A service, a
 * benefit card and a product all sit in a list the tenant arranges by hand, so
 * they carry a `sequence`; a blog is a stack in the order things happened, so
 * this carries `publishedAt` and nothing here has a `sequence` at all. Giving it
 * one would invite a tenant to drag last March's article to the top, which is
 * the one thing a blog must not let them do.
 *
 * What it carries that the card tables do not:
 *
 *  - **`publishedAt`.** Both the date printed on the article and the moment it
 *    becomes visible. A row dated in the future is written, saved and invisible
 *    until then, so a shop can write four posts on a quiet Tuesday and have them
 *    appear one a week. Null means never published - a draft.
 *  - **`body`.** The article itself, as plain text with blank lines between
 *    paragraphs. Not HTML: it is rendered into paragraphs by the website, so
 *    nothing a tenant types can put markup - or a script - on its own page.
 *  - **`excerpt`.** The standfirst under the title, and the line on the card.
 *    Optional; the website falls back to the opening of the body, which is what
 *    a tenant who never fills it in would have written anyway.
 *  - **`tags`.** Free text on the row rather than a table. They are never
 *    ordered, never edited apart from their article, and the only thing that
 *    reads them is a filter on the archive; see `BLOG_TAGS_MAX`.
 *  - **`author`.** A name, not an admin id. The person who wrote a post is
 *    frequently not the person who typed it in, and an article whose byline
 *    disappears when a staff account is deleted is worse than one with a name
 *    the platform cannot verify.
 *
 * `status` is still here beside `publishedAt`, and they are not the same
 * question. `publishedAt` is *when this is meant to be read*; `status` is
 * whether it is on the site at all - how a tenant takes a post down without
 * losing it, and without rewriting the date it was published.
 */
module.exports = (sequelize) =>
  sequelize.define(
    'CompanyBlogPost',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      /**
       * Branch this belongs to; NULL means the whole company.
       *
       * The same fallback every content table on the platform follows: a
       * branch-pinned domain shows that branch's own posts and drops back to the
       * company-wide ones when it has none.
       */
      branchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },

      /**
       * The half of the URL a person can read - `/blog/how-we-fit-a-kitchen`.
       *
       * Generated from the title and made unique within the tenant, the same way
       * a product's is, and deliberately **not** rewritten when the title
       * changes: an article's address is what other people have linked to and
       * what a search engine has indexed, and a rename that silently breaks both
       * is the most expensive thing a blog can do.
       */
      slug: { type: DataTypes.STRING(160), allowNull: false },

      title: { type: DataTypes.STRING(200), allowNull: false },

      /**
       * The standfirst: one or two sentences under the title, and the line on
       * the card in the listing.
       *
       * Optional. The website falls back to the opening of the body rather than
       * showing a card with a hole in it - which is what a tenant who leaves
       * this blank has effectively asked for.
       */
      excerpt: { type: DataTypes.STRING(400), allowNull: true },

      /**
       * The article, as plain text with a blank line between paragraphs.
       *
       * **Not HTML, and not stored as HTML.** The website splits it into
       * paragraphs and prints the text, so there is no path by which something a
       * tenant pastes in - a tracking pixel, a script, a stray iframe from a word
       * processor - ends up executing on their own domain, or on a page a
       * stranger is reading.
       */
      body: { type: DataTypes.TEXT('long'), allowNull: false },

      /** An upload path, e.g. `/uploads/blog/abc.jpg`. Optional. */
      coverImage: { type: DataTypes.STRING(255), allowNull: true },

      /**
       * Who wrote it. A name typed by hand, not a link to an admin account.
       *
       * Deliberately not a foreign key: the person who wrote a post is often not
       * the person who typed it in, guest posts exist, and an article whose
       * byline vanishes when a staff account is deleted is worse than one
       * carrying a name the platform cannot verify. Blank means the company
       * itself wrote it, which is the ordinary case.
       */
      author: { type: DataTypes.STRING(80), allowNull: true },

      /**
       * What this is filed under. A short list of free-text labels.
       *
       * JSON rather than a table, for the reason a service's `highlights` are:
       * they are never queried independently, never ordered, and never reach
       * anything but the card and the archive's filter. The validator caps the
       * count and the length of each; see `BLOG_TAGS_MAX`.
       */
      tags: { type: DataTypes.JSON, allowNull: true },

      /**
       * When this goes live, and the date printed on it.
       *
       * Two jobs in one column, on purpose. The website shows posts whose date
       * has passed, so a row dated next Monday is saved, complete and invisible
       * until Monday - scheduling, with no scheduler. Null is a draft: written,
       * never published, and shown to nobody.
       */
      publishedAt: { type: DataTypes.DATE, allowNull: true },

      /**
       * Pin this one to the top of the archive.
       *
       * The only exception to the stack order, and a narrow one: it lifts a post
       * above the dates without changing its date. What it is for is the article
       * a business wants read first - "how our guarantee works" - which would
       * otherwise sink a little further every week.
       */
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      status: { type: DataTypes.ENUM(...STATUS_VALUES), allowNull: false, defaultValue: STATUS.ACTIVE },
      createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      updatedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    },
    {
      tableName: 'company_blog_posts',
      indexes: [
        { fields: ['company_id'] },
        { fields: ['branch_id'] },
        { fields: ['slug'] },
        { fields: ['status'] },
        /* The archive's own order, and the query behind every listing. */
        { fields: ['published_at'] },
      ],
    }
  );
