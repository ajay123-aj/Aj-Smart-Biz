'use strict';

/**
 * **AI content creator**: a company's website copy, written by Claude from a
 * prompt.
 *
 * The super admin describes the business in a few sentences and pastes a Claude
 * API key. Claude writes the content the tenant site renders: the hero slides,
 * the About and Contact pages, the benefit cards, the service menu, the product
 * shelf and the blog. This file writes it as **ordinary rows**, through the same
 * models `seedSalon` writes through. No template, route or theme changes, and
 * nothing the generator produces is code. A tenant filled this way is
 * indistinguishable from one somebody typed in, and every row can be edited or
 * deleted in the company console afterwards.
 *
 * Three rules keep it honest:
 *
 *  - **No invented reviews, people or numbers.** Testimonials are never written
 *    (a review nobody gave is a fake review, whoever typed it). Team members and
 *    the figures band are written only when the prompt supplies them.
 *  - **No placeholder pictures.** `placeholderImage` is for the demo seeders
 *    only, so images are left empty for the company to upload, and every
 *    template already draws an image-less card. The gallery is skipped for the
 *    same reason: a gallery row requires a photograph.
 *  - **Nothing is overwritten.** Rows are matched first (by slug or title) and
 *    only created when missing, and a section's settings are only filled where
 *    the company has none. Running it twice adds what is absent and leaves
 *    everything else, including hand edits, where it is.
 *
 * It runs as a **background job**, because writing a full site takes Claude
 * longer than the 60 seconds nginx gives a request. `startJob` returns at once,
 * and the console polls `getJob`. Jobs live in this process's memory: one API
 * process is what `deploy/` runs, and a job lost to a restart is simply started
 * again, which is safe for the reason above.
 *
 * The API key is used for the one job and never stored or logged.
 */

const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { uniqueSlug, slugify } = require('../utils/slug');
const functionalityService = require('./functionality.service');
const {
  STATUS,
  FUNCTIONALITY,
  FEATURE_ICON_KEYS,
  FEATURE_ICON_FALLBACK,
  PRODUCT_STOCK,
  PRODUCT_STOCK_VALUES,
  STAT_MODE,
  STAT_UNIT,
  AI_CONTENT_MODULE: AI_MODULES,
  AI_CONTENT_MODULE_VALUES: AI_MODULE_VALUES,
} = require('../constants');

/** A finished job is kept this long for the console to read, then dropped. */
const JOB_TTL_MS = 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * The shape Claude writes
 * ------------------------------------------------------------------ */

/**
 * JSON Schema, kept to what structured outputs accept: every object closed
 * and every property required, optional values spelled as `anyOf` with null,
 * and no length or range constraints. Lengths are enforced by `clip` on the
 * way into the database instead.
 */
const str = { type: 'string' };
const int = { type: 'integer' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const list = (items) => ({ type: 'array', items });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const icon = { type: 'string', enum: FEATURE_ICON_KEYS };
const sectionCopy = { eyebrow: str, title: str, lead: str };

/** Where a hero button can point: the pages every template has. */
const SLIDE_TARGETS = { services: '/services', products: '/products', about: '/about', contact: '/contact', blog: '/blog' };

const SCHEMAS = {
  [AI_MODULES.SITE]: obj({
    slides: list(
      obj({ eyebrow: str, title: str, subtitle: str, ctaLabel: str, ctaTarget: { type: 'string', enum: Object.keys(SLIDE_TARGETS) } })
    ),
    about: obj({ title: str, lead: str, body: str }),
    contact: obj({ title: str, lead: str, formNote: str }),
    features: obj({ ...sectionCopy, items: list(obj({ icon, title: str, body: str })) }),
    figures: obj({
      ...sectionCopy,
      items: list(
        obj({ label: str, value: nullable(str), prefix: nullable(str), suffix: nullable(str), sinceDate: nullable({ type: 'string', format: 'date' }) })
      ),
    }),
    team: obj({ ...sectionCopy, members: list(obj({ name: str, role: str, bio: str })) }),
  }),

  [AI_MODULES.SERVICES]: obj({
    page: obj({ navLabel: str, ...sectionCopy, ctaLabel: str }),
    categories: list(obj({ name: str, description: str, icon, featured: bool })),
    items: list(
      obj({
        title: str,
        category: nullable(str),
        icon,
        summary: str,
        description: str,
        highlights: list(str),
        price: nullable(num),
        offerPrice: nullable(num),
        priceLabel: nullable(str),
        durationMinutes: nullable(int),
        bookable: bool,
        featured: bool,
      })
    ),
  }),

  [AI_MODULES.PRODUCTS]: obj({
    page: obj({ navLabel: str, ...sectionCopy }),
    categories: list(obj({ name: str, parent: nullable(str), description: str, featured: bool })),
    items: list(
      obj({
        name: str,
        category: nullable(str),
        sku: nullable(str),
        summary: str,
        description: str,
        highlights: list(str),
        specs: list(obj({ label: str, value: str })),
        price: nullable(num),
        offerPrice: nullable(num),
        priceLabel: nullable(str),
        stockStatus: { type: 'string', enum: PRODUCT_STOCK_VALUES },
        featured: bool,
      })
    ),
  }),

  [AI_MODULES.BLOG]: obj({
    page: obj({ navLabel: str, ...sectionCopy }),
    posts: list(obj({ title: str, excerpt: str, body: str, author: nullable(str), tags: list(str), featured: bool })),
  }),
};

/* ------------------------------------------------------------------ *
 * What Claude is asked
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You write the website content for a small or medium business on a multi-tenant website platform. The super admin who runs the platform describes the business; you write copy that goes straight onto that business's live website.

Write like the business itself: specific, plain and confident. Use concrete details from the brief (the city, the trade, what they actually do) rather than generic marketing phrases. Use the brief's language for the copy unless it asks for another.

Honesty rules, which matter more than completeness:
- Never invent customer reviews, awards, certifications, client names, or statistics.
- Only include team members the brief names. If it names none, return an empty list.
- Only include figures (years in business, customers served, and so on) that the brief states or that follow from it, such as a founding year. If there are none, return an empty list.
- Prices: use the brief's prices. If it gives none, use a typical price for that trade in the business's currency, or leave price null and set priceLabel to a phrase such as "On enquiry" when the work is quoted case by case.

Every category an item refers to must appear, spelled exactly the same, in that list's categories. Body text uses plain paragraphs separated by a blank line, with no markdown.`;

/** What each module asks for, on top of the system prompt. */
const MODULE_INSTRUCTIONS = {
  [AI_MODULES.SITE]: `Write the site-wide content:
- slides: 3 hero slides. The first introduces the business by name; ctaTarget picks the page its button opens.
- about: the About page, with a body of 3 to 4 paragraphs.
- contact: the Contact page heading and a one-line note under its form.
- features: 6 benefit cards, each with an icon from the allowed set.
- figures: 0 to 4 figures, following the honesty rules. Give either a value (fixed number such as "500") or, for a count since a date such as years in business, a sinceDate (YYYY-MM-DD) and a null value.
- team: the people the brief names, if any.`,

  [AI_MODULES.SERVICES]: `Write the service menu: 4 to 8 categories and 12 to 20 services across them, the way this kind of business actually lists its work. Mark the 4 to 6 most important services and categories as featured. A service is bookable only if a customer could reasonably book a time slot for it online; durationMinutes is how long one booking takes, or null. offerPrice, when set, is a reduced price lower than price. If the business offers no services at all, return empty lists.`,

  [AI_MODULES.PRODUCTS]: `Write the product catalogue: 3 to 6 top-level categories, optionally with subcategories (a subcategory names its parent; a top-level category has parent null), and 12 to 24 products. Give each product useful specs (size, material, and so on) and a few highlights. Mark 4 to 6 as featured. offerPrice, when set, is a reduced price lower than price. If the business sells no products, return empty lists.`,

  [AI_MODULES.BLOG]: `Write 4 blog posts that answer questions this business's customers actually ask. Each body is 4 to 6 paragraphs of genuinely useful advice, not an advert. Set author to a person the brief names, or null. Mark one post as featured.`,
};

/** The company as Claude needs to know it, plus the super admin's prompt. */
function buildBrief(company, prompt) {
  const facts = [
    `Business name: ${company.name}`,
    company.legalName && `Legal name: ${company.legalName}`,
    company.businessType?.name && `Business type: ${company.businessType.name}`,
    company.description && `Short description: ${company.description}`,
    [company.city, company.state?.name].filter(Boolean).length &&
      `Location: ${[company.city, company.state?.name].filter(Boolean).join(', ')}`,
    `Currency: ${company.currency || 'INR'}`,
    company.website && `Website: ${company.website}`,
  ].filter(Boolean);

  return `<company>\n${facts.join('\n')}\n</company>\n\n<brief>\n${prompt.trim()}\n</brief>`;
}

/**
 * One module, one call. Streamed, because a full product catalogue is long
 * enough that a non-streaming request can hit the SDK's HTTP timeout.
 *
 * `fallbacks: "default"` lets the API re-run a request its safety classifiers
 * decline on another model, inside the same call, rather than failing the job.
 */
async function generateModule(client, module, brief) {
  const stream = client.beta.messages.stream({
    model: config.ai.model,
    max_tokens: 64000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMAS[module] },
    },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `${brief}\n\n${MODULE_INSTRUCTIONS[module]}` }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to write this section. Try rewording the prompt.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The answer was cut off before it was complete. Try asking for less.');
  }

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return JSON.parse(text);
}

/** Turns an SDK error into a sentence the super admin can act on. */
function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check it and try again.';
  if (error instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use the model.';
  if (error instanceof Anthropic.RateLimitError) return 'The API key hit its rate limit. Wait a minute and try again.';
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API from the server.';
  if (error instanceof Anthropic.APIError) return `The Claude API returned an error (${error.status ?? 'unknown'}).`;
  return error.message || 'Something went wrong while generating content.';
}

/* ------------------------------------------------------------------ *
 * Writing it
 * ------------------------------------------------------------------ */

/** Trims a string to a column's width; empty becomes null. */
const clip = (value, max) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};

/** A price the column can hold, or null. Rejects an "offer" that is no reduction. */
const money = (value) => (Number.isFinite(value) && value >= 0 && value < 1e10 ? Math.round(value * 100) / 100 : null);
const offer = (price, offerPrice) => {
  const reduced = money(offerPrice);
  return reduced !== null && price !== null && reduced < price ? reduced : null;
};
const iconOf = (value) => (FEATURE_ICON_KEYS.includes(value) ? value : FEATURE_ICON_FALLBACK);
const strings = (values, max, limit = 8) =>
  (Array.isArray(values) ? values : []).map((value) => clip(value, max)).filter(Boolean).slice(0, limit);

/**
 * Switches a section on for the company, with Claude's headings, unless the
 * company has already configured it. Only the company's own switch: whether
 * the **plan** includes the feature is the platform's decision, and the job
 * reports what the plan leaves dark rather than widening it.
 */
async function enableSection(ctx, key, settings) {
  ctx.enabled.add(key);
  const [row, made] = await db.CompanyFunctionality.findOrCreate({
    where: { companyId: ctx.companyId, key },
    defaults: { companyId: ctx.companyId, key, status: STATUS.ACTIVE, settings },
    transaction: ctx.transaction,
  });
  if (made) return;

  const changes = {};
  if (row.status !== STATUS.ACTIVE) changes.status = STATUS.ACTIVE;
  if (!row.settings && settings) changes.settings = settings;
  if (Object.keys(changes).length) await row.update(changes, { transaction: ctx.transaction });
}

/** Finds a row by `where`, or creates it with `values`. Counts what it creates. */
async function findOrMake(ctx, model, where, values, bucket) {
  const existing = await model.findOne({ where: { companyId: ctx.companyId, ...where }, transaction: ctx.transaction });
  if (existing) return existing;

  const row = await model.create(
    { companyId: ctx.companyId, branchId: null, ...where, ...values, createdBy: ctx.actorId },
    { transaction: ctx.transaction }
  );
  ctx.created[bucket] = (ctx.created[bucket] ?? 0) + 1;
  return row;
}

const writers = {
  async [AI_MODULES.SITE](ctx, data) {
    const company = ctx.company;

    /**
     * The three starter slides `createCompany` gives every tenant are retired
     * rather than deleted, which is what a company would do once it has its
     * own. Matched on the exact pairs `defaultSliders` ships, so a starter
     * slide somebody has since edited is left alone.
     */
    const slides = (data.slides ?? []).slice(0, 5);
    if (slides.length) {
      const [retired] = await db.Slider.update(
        { status: STATUS.INACTIVE },
        {
          where: {
            companyId: ctx.companyId,
            status: STATUS.ACTIVE,
            title: ['Work that holds up', 'People, not ticket numbers', company.name],
            eyebrow: ['Welcome', 'Built on trust', 'Here when you need us'],
          },
          transaction: ctx.transaction,
        }
      );
      if (retired) ctx.created.slidersRetired = retired;
    }
    for (const [index, slide] of slides.entries()) {
      const title = clip(slide.title, 180);
      if (!title) continue;
      await findOrMake(
        ctx,
        db.Slider,
        { title, eyebrow: clip(slide.eyebrow, 120) },
        {
          subtitle: clip(slide.subtitle, 2000),
          ctaLabel: clip(slide.ctaLabel, 80),
          ctaUrl: SLIDE_TARGETS[slide.ctaTarget] ?? '/contact',
          sequence: index + 1,
          status: STATUS.ACTIVE,
        },
        'sliders'
      );
    }

    if (data.about) {
      await findOrMake(
        ctx,
        db.CompanyAbout,
        { branchId: null },
        {
          navLabel: 'About us',
          eyebrow: 'About us',
          title: clip(data.about.title, 160),
          lead: clip(data.about.lead, 400),
          body: clip(data.about.body, 20000),
        },
        'about'
      );
      await enableSection(ctx, FUNCTIONALITY.ABOUT_US, null);
    }

    if (data.contact) {
      await findOrMake(
        ctx,
        db.CompanyContact,
        { branchId: null },
        {
          navLabel: 'Contact',
          eyebrow: 'Contact',
          title: clip(data.contact.title, 160),
          lead: clip(data.contact.lead, 400),
          formNote: clip(data.contact.formNote, 300),
          showForm: true,
          showLocations: true,
        },
        'contactPage'
      );
      await enableSection(ctx, FUNCTIONALITY.CONTACT_PAGE, null);
    }

    const sectionSettings = (section) => ({
      eyebrow: clip(section.eyebrow, 80),
      title: clip(section.title, 160),
      lead: clip(section.lead, 400),
    });

    const features = (data.features?.items ?? []).slice(0, 8);
    for (const [index, feature] of features.entries()) {
      const title = clip(feature.title, 150);
      if (!title) continue;
      await findOrMake(
        ctx,
        db.CompanyFeature,
        { title },
        { icon: iconOf(feature.icon), body: clip(feature.body, 600), sequence: index + 1, status: STATUS.ACTIVE },
        'features'
      );
    }
    if (features.length) await enableSection(ctx, FUNCTIONALITY.FEATURES, sectionSettings(data.features));

    const figures = (data.figures?.items ?? []).slice(0, 6);
    let figuresWritten = 0;
    for (const [index, figure] of figures.entries()) {
      const label = clip(figure.label, 120);
      const since = /^\d{4}-\d{2}-\d{2}$/.test(figure.sinceDate ?? '') ? figure.sinceDate : null;
      const value = clip(figure.value, 40);
      if (!label || (!since && !value)) continue;
      await findOrMake(
        ctx,
        db.CompanyStat,
        { label },
        {
          ...(since
            ? { mode: STAT_MODE.SINCE_DATE, unit: STAT_UNIT.YEARS, sinceDate: since }
            : { mode: STAT_MODE.FIXED, value }),
          prefix: clip(figure.prefix, 8),
          suffix: clip(figure.suffix, 8),
          sequence: index + 1,
          status: STATUS.ACTIVE,
        },
        'figures'
      );
      figuresWritten += 1;
    }
    if (figuresWritten) await enableSection(ctx, FUNCTIONALITY.FIGURES, sectionSettings(data.figures));

    const members = (data.team?.members ?? []).slice(0, 12);
    for (const [index, member] of members.entries()) {
      const name = clip(member.name, 150);
      if (!name) continue;
      await findOrMake(
        ctx,
        db.CompanyTeamMember,
        { name },
        { role: clip(member.role, 120), bio: clip(member.bio, 600), sequence: index + 1, status: STATUS.ACTIVE },
        'team'
      );
    }
    if (members.length) await enableSection(ctx, FUNCTIONALITY.TEAM, sectionSettings(data.team));
  },

  async [AI_MODULES.SERVICES](ctx, data) {
    const items = (data.items ?? []).slice(0, 40);
    if (!items.length) return;

    const categoryIds = new Map();
    for (const [index, node] of (data.categories ?? []).slice(0, 20).entries()) {
      const name = clip(node.name, 150);
      if (!name) continue;
      let row = await db.CompanyServiceCategory.findOne({
        where: { companyId: ctx.companyId, slug: slugify(name) },
        transaction: ctx.transaction,
      });
      if (!row) {
        row = await db.CompanyServiceCategory.create(
          {
            companyId: ctx.companyId,
            branchId: null,
            parentId: null,
            name,
            slug: await uniqueSlug(db.CompanyServiceCategory, ctx.companyId, name),
            description: clip(node.description, 600),
            icon: iconOf(node.icon),
            featured: Boolean(node.featured),
            sequence: index + 1,
            status: STATUS.ACTIVE,
            createdBy: ctx.actorId,
          },
          { transaction: ctx.transaction }
        );
        ctx.created.serviceCategories = (ctx.created.serviceCategories ?? 0) + 1;
      }
      categoryIds.set(node.name, row.id);
    }

    for (const [index, item] of items.entries()) {
      const title = clip(item.title, 150);
      if (!title) continue;
      const exists = await db.CompanyService.findOne({
        where: { companyId: ctx.companyId, slug: slugify(title) },
        transaction: ctx.transaction,
      });
      if (exists) continue;

      const price = money(item.price);
      const duration = Number.isInteger(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : null;
      await db.CompanyService.create(
        {
          companyId: ctx.companyId,
          branchId: null,
          categoryId: categoryIds.get(item.category) ?? null,
          title,
          slug: await uniqueSlug(db.CompanyService, ctx.companyId, title),
          icon: iconOf(item.icon),
          summary: clip(item.summary, 600),
          description: clip(item.description, 20000),
          highlights: strings(item.highlights, 160),
          price,
          offerPrice: offer(price, item.offerPrice),
          priceLabel: clip(item.priceLabel, 60),
          durationMinutes: duration ? Math.min(duration, 24 * 60) : null,
          bookable: Boolean(item.bookable),
          showPrice: true,
          featured: Boolean(item.featured),
          sequence: index + 1,
          status: STATUS.ACTIVE,
          createdBy: ctx.actorId,
        },
        { transaction: ctx.transaction }
      );
      ctx.created.services = (ctx.created.services ?? 0) + 1;
    }

    const page = data.page ?? {};
    await enableSection(ctx, FUNCTIONALITY.SERVICES, {
      navLabel: clip(page.navLabel, 40),
      eyebrow: clip(page.eyebrow, 80),
      title: clip(page.title, 160),
      lead: clip(page.lead, 400),
      ctaLabel: clip(page.ctaLabel, 40),
    });
  },

  async [AI_MODULES.PRODUCTS](ctx, data) {
    const items = (data.items ?? []).slice(0, 60);
    if (!items.length) return;

    /**
     * Parents before children. Claude lists categories flat with a `parent`
     * name (structured outputs cannot express a tree), so top-level ones are
     * written first and each subcategory then finds its parent's id.
     */
    const nodes = (data.categories ?? []).slice(0, 40);
    const ordered = [...nodes.filter((node) => !node.parent), ...nodes.filter((node) => node.parent)];
    const categoryIds = new Map();
    for (const [index, node] of ordered.entries()) {
      const name = clip(node.name, 150);
      if (!name) continue;
      let row = await db.CompanyCategory.findOne({
        where: { companyId: ctx.companyId, slug: slugify(name) },
        transaction: ctx.transaction,
      });
      if (!row) {
        row = await db.CompanyCategory.create(
          {
            companyId: ctx.companyId,
            branchId: null,
            parentId: node.parent ? categoryIds.get(node.parent) ?? null : null,
            name,
            slug: await uniqueSlug(db.CompanyCategory, ctx.companyId, name),
            description: clip(node.description, 600),
            featured: Boolean(node.featured),
            sequence: index + 1,
            status: STATUS.ACTIVE,
            createdBy: ctx.actorId,
          },
          { transaction: ctx.transaction }
        );
        ctx.created.productCategories = (ctx.created.productCategories ?? 0) + 1;
      }
      categoryIds.set(node.name, row.id);
    }

    for (const [index, item] of items.entries()) {
      const name = clip(item.name, 200);
      if (!name) continue;
      const exists = await db.CompanyProduct.findOne({
        where: { companyId: ctx.companyId, slug: slugify(name) },
        transaction: ctx.transaction,
      });
      if (exists) continue;

      const price = money(item.price);
      await db.CompanyProduct.create(
        {
          companyId: ctx.companyId,
          branchId: null,
          categoryId: categoryIds.get(item.category) ?? null,
          name,
          slug: await uniqueSlug(db.CompanyProduct, ctx.companyId, name),
          sku: clip(item.sku, 60),
          summary: clip(item.summary, 600),
          description: clip(item.description, 20000),
          images: [],
          highlights: strings(item.highlights, 160),
          specs: (item.specs ?? [])
            .map((spec) => ({ label: clip(spec.label, 60), value: clip(spec.value, 160) }))
            .filter((spec) => spec.label && spec.value)
            .slice(0, 12),
          price,
          offerPrice: offer(price, item.offerPrice),
          priceLabel: clip(item.priceLabel, 60),
          stockStatus: PRODUCT_STOCK_VALUES.includes(item.stockStatus) ? item.stockStatus : PRODUCT_STOCK.IN_STOCK,
          featured: Boolean(item.featured),
          sequence: index + 1,
          status: STATUS.ACTIVE,
          createdBy: ctx.actorId,
        },
        { transaction: ctx.transaction }
      );
      ctx.created.products = (ctx.created.products ?? 0) + 1;
    }

    const page = data.page ?? {};
    await enableSection(ctx, FUNCTIONALITY.PRODUCTS, {
      navLabel: clip(page.navLabel, 40),
      eyebrow: clip(page.eyebrow, 80),
      title: clip(page.title, 160),
      lead: clip(page.lead, 400),
    });
  },

  async [AI_MODULES.BLOG](ctx, data) {
    const posts = (data.posts ?? []).slice(0, 10);
    if (!posts.length) return;

    for (const [index, post] of posts.entries()) {
      const title = clip(post.title, 200);
      const body = clip(post.body, 100000);
      if (!title || !body) continue;
      const exists = await db.CompanyBlogPost.findOne({
        where: { companyId: ctx.companyId, slug: slugify(title) },
        transaction: ctx.transaction,
      });
      if (exists) continue;

      /* Spread over the last few weeks, a few days apart, newest first. */
      const publishedAt = new Date(Date.now() - (index * 9 + 2) * 24 * 60 * 60 * 1000);
      await db.CompanyBlogPost.create(
        {
          companyId: ctx.companyId,
          branchId: null,
          slug: await uniqueSlug(db.CompanyBlogPost, ctx.companyId, title),
          title,
          excerpt: clip(post.excerpt, 400),
          body,
          author: clip(post.author, 80),
          tags: strings(post.tags, 40, 6),
          publishedAt,
          featured: Boolean(post.featured),
          status: STATUS.ACTIVE,
          createdBy: ctx.actorId,
        },
        { transaction: ctx.transaction }
      );
      ctx.created.blog = (ctx.created.blog ?? 0) + 1;
    }

    const page = data.page ?? {};
    await enableSection(ctx, FUNCTIONALITY.BLOG, {
      navLabel: clip(page.navLabel, 40),
      eyebrow: clip(page.eyebrow, 80),
      title: clip(page.title, 160),
      lead: clip(page.lead, 400),
    });
  },
};

/**
 * Writes content in the shape Claude returns (`{ site, services, products,
 * blog }`, any of them) into a company, and reports what it wrote and which
 * of the sections it switched on are still kept off the website.
 *
 * Exported because it is not only Claude that writes in this shape: the
 * sample companies (`sampleCompany.service`) are this same shape, written by
 * hand.
 */
async function writeContent(company, content, actorId) {
  const ctx = {
    company,
    companyId: company.id,
    actorId: actorId ?? null,
    transaction: undefined,
    created: {},
    enabled: new Set(),
  };
  for (const module of AI_MODULE_VALUES) {
    if (content[module]) await writers[module](ctx, content[module]);
  }

  /**
   * The plan and the subscription are the other two gates a section has to
   * clear before it shows. Reported, so the super admin learns here, and not
   * on the website, that the plan leaves Products dark.
   */
  const { items } = await functionalityService.getFunctionalities(company.id, { withContent: true });
  const notLive = items
    .filter((item) => ctx.enabled.has(item.key) && !item.published)
    .map((item) => ({ key: item.key, name: item.name, reason: item.message ?? item.reason }));

  return { created: ctx.created, notLive };
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

const jobs = new Map();

const publicJob = (job) => ({
  id: job.id,
  companyId: job.companyId,
  status: job.status,
  modules: job.modules,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  created: job.created,
  failed: job.failed,
  notLive: job.notLive,
  error: job.error,
});

function forget(job) {
  setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref();
}

/**
 * Generates every module side by side, then writes whatever came back. A
 * module Claude failed on is reported and skipped; the others are still
 * written, so one bad section does not cost the whole site.
 *
 * No transaction, the same as `seedSalon`: `uniqueSlug` reads outside one,
 * which SQLite would block on, and every write is find-or-create, so a job
 * that stops halfway is finished by running it again.
 */
async function runJob(job, { company, prompt, apiKey, actorId }) {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const brief = buildBrief(company, prompt);

  const results = await Promise.allSettled(job.modules.map((module) => generateModule(client, module, brief)));

  const content = {};
  results.forEach((result, index) => {
    const module = job.modules[index];
    if (result.status === 'fulfilled') {
      content[module] = result.value;
    } else {
      job.failed.push({ module, reason: describeError(result.reason) });
      logger.warn(`AI content: "${module}" failed for company ${company.id}: ${result.reason?.message}`);
    }
  });

  if (!Object.keys(content).length) {
    job.status = 'failed';
    job.error = job.failed[0]?.reason ?? 'Nothing was generated.';
    return;
  }

  const written = await writeContent(company, content, actorId);
  Object.assign(job.created, written.created);
  job.notLive = written.notLive;

  job.status = job.failed.length ? 'partial' : 'completed';
}

/**
 * Starts a job for a company and returns it at once; `getJob` reports how it
 * went. One job per company at a time, since two would race to write the same
 * slugs.
 */
async function startJob({ companyId, prompt, apiKey, modules, actorId }) {
  const key = apiKey || config.ai.apiKey;
  if (!key) throw ApiError.badRequest('A Claude API key is required to generate content');

  const running = [...jobs.values()].find((job) => job.companyId === companyId && job.status === 'running');
  if (running) throw ApiError.conflict('Content is already being generated for this company');

  const company = await db.Company.findByPk(companyId, {
    include: [
      { model: db.BusinessType, as: 'businessType', attributes: ['id', 'name'] },
      { model: db.State, as: 'state', attributes: ['id', 'name'] },
    ],
  });
  if (!company) throw ApiError.notFound('Company not found');

  const job = {
    id: crypto.randomUUID(),
    companyId,
    status: 'running',
    modules: AI_MODULE_VALUES.filter((module) => modules.includes(module)),
    startedAt: new Date(),
    finishedAt: null,
    created: {},
    failed: [],
    notLive: [],
    error: null,
  };
  jobs.set(job.id, job);

  runJob(job, { company, prompt, apiKey: key, actorId })
    .catch((error) => {
      job.status = 'failed';
      job.error = describeError(error);
      logger.error(`AI content job ${job.id} for company ${companyId} failed: ${error.message}`);
    })
    .finally(() => {
      job.finishedAt = new Date();
      forget(job);
    });

  return publicJob(job);
}

function getJob(companyId, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.companyId !== companyId) throw ApiError.notFound('No such content job');
  return publicJob(job);
}

module.exports = { startJob, getJob, writeContent };
