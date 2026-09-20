'use strict';

const db = require('../models');
const logger = require('../utils/logger');
const { STATUS } = require('../constants');
const {
  MARKETING_CONTENT,
  MARKETING_FAQS,
  MARKETING_PLANS,
  MARKETING_BUSINESS_TYPES,
} = require('./marketingContent');

/**
 * Fills the marketing site's tables with the wording the Technology project
 * used to hard-code.
 *
 * **Idempotent, and deliberately one-directional.** Every step asks whether a
 * row already exists and leaves it alone if it does. That matters more here
 * than in most seeders: the whole point of moving this content into the
 * database was that somebody can rewrite it in the console, and a seeder that
 * re-applied itself on every deploy would quietly undo their work. A section
 * therefore only ever gets written once, by whichever run found it missing.
 *
 * The consequence to know: **changing the wording in `marketingContent.js` does
 * nothing to a database that has already been seeded.** That file is the
 * starting point, not the source of truth. To get the original wording back,
 * delete the section in the console and run this again.
 */

/* ------------------------------------------------------------------ *
 * The writing
 * ------------------------------------------------------------------ */

const seedContent = async () => {
  let written = 0;

  for (const [key, [label, payload]] of Object.entries(MARKETING_CONTENT)) {
    const [, created] = await db.MarketingContent.findOrCreate({
      where: { key },
      defaults: { key, label, payload, status: STATUS.ACTIVE },
    });
    if (created) written += 1;
  }

  logger.info(
    `Marketing content: ${written} section(s) written, ` +
      `${Object.keys(MARKETING_CONTENT).length - written} already present`
  );
};

const seedFaqs = async () => {
  /**
   * Keyed on the question text, because an FAQ has no code and no natural key.
   * Re-wording a question in the console therefore makes it look new to this
   * seeder — which would re-insert the original alongside it. That is why the
   * whole step is skipped once *any* question exists: past the first run, the
   * FAQ belongs to whoever edits it.
   */
  const existing = await db.MarketingFaq.count();
  if (existing > 0) {
    logger.info(`Marketing FAQ: ${existing} question(s) already present, skipping`);
    return;
  }

  await db.MarketingFaq.bulkCreate(
    MARKETING_FAQS.map((faq) => ({ ...faq, status: STATUS.ACTIVE }))
  );
  logger.info(`Marketing FAQ: ${MARKETING_FAQS.length} question(s) written`);
};

/* ------------------------------------------------------------------ *
 * The price list
 * ------------------------------------------------------------------ */

/**
 * The four plans the Technology site advertised, as `plans` rows.
 *
 * These are **not** new columns or a new table: the platform already sells
 * plans, and the pricing page is an advertisement for the same rows. What the
 * site called `limits` are `maxBranches` / `maxAdmins` / `storageMb`, what it
 * called `highlights` is `features`, and what it called `includes` is
 * `functionalities`.
 *
 * `code` is the site's old plan id, and it is load-bearing rather than
 * decorative: `/demo?plan=starter` links are already in the world, and
 * `marketing.controller` serves `code` as the public `id` so those links keep
 * resolving.
 *
 * The capability keys are translated on the way in. The site had its own
 * shorter names — `about`, `share`, `reviews` — and the platform's catalogue is
 * the canonical one, so the site adopts the platform's keys rather than the
 * other way round.
 */
const CAPABILITY_ALIASES = {
  about: 'about_us',
  share: 'share_link',
  reviews: 'testimonials',
  benefits: 'features_benefits',
  contact: 'contact_page',
  enquiries: 'service_enquiry',
  bookings: 'service_booking',
  stock: 'warehouse',
};

const seedPlans = async () => {
  /**
   * Only ever adds a plan whose `code` is missing. A price is the one thing on
   * this platform that must never be changed by a deploy, and a running
   * subscription snapshots its plan's terms at activation — so a seeder that
   * updated a row would be rewriting what somebody was already sold.
   */
  let written = 0;
  let published = 0;

  for (const plan of MARKETING_PLANS) {
    const existing = await db.Plan.findOne({ where: { code: plan.code } });
    if (existing) {
      /**
       * The one thing this seeder will change on a row it already wrote.
       *
       * `isPublic` was added after these plans were first seeded, so they
       * exist with the column's `false` default and would never appear on the
       * pricing page they were written for. Narrow on purpose: it touches
       * only the codes in `MARKETING_PLANS`, which are by definition the
       * marketing ones, and it never touches a price, a limit or a name.
       */
      if (!existing.isPublic) {
        await existing.update({ isPublic: true });
        published += 1;
      }
      continue;
    }

    const { includes, ...rest } = plan;
    await db.Plan.create({
      ...rest,
      functionalities: includes.map((key) => CAPABILITY_ALIASES[key] || key),
      /* These four ARE the price list, so they are the ones that go on it. */
      isPublic: true,
      status: STATUS.ACTIVE,
    });
    written += 1;
  }

  logger.info(
    `Marketing plans: ${written} written, ${published} published, ` +
      `${MARKETING_PLANS.length - written - published} already present`
  );
};

/**
 * The trades the demo form offers.
 *
 * `bootstrap.js` already seeds seven generic ones ("Retail", "Services"). These
 * are the fourteen the marketing site advertised, and they are richer — each
 * has a slug, an icon and a line of copy the tile renders. Matched on `name`,
 * so the two sets sit side by side rather than one overwriting the other.
 */
const seedBusinessTypes = async () => {
  let written = 0;
  let published = 0;

  for (const type of MARKETING_BUSINESS_TYPES) {
    const [row, created] = await db.BusinessType.findOrCreate({
      where: { name: type.name },
      defaults: { ...type, isPublic: true, status: STATUS.ACTIVE },
    });
    if (created) {
      written += 1;
    } else if (!row.isPublic) {
      /* The same narrow backfill as `seedPlans` — see the note there. */
      await row.update({ isPublic: true });
      published += 1;
    }
  }

  logger.info(
    `Marketing business types: ${written} written, ${published} published, ` +
      `${MARKETING_BUSINESS_TYPES.length - written - published} already present`
  );
};

const runMarketingSeed = async () => {
  await seedContent();
  await seedFaqs();
  await seedPlans();
  await seedBusinessTypes();
};

module.exports = { runMarketingSeed, CAPABILITY_ALIASES };
