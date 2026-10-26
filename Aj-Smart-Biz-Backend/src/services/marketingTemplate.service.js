'use strict';

/**
 * The marketing site's **template showcase**: real demo companies, each shown
 * in the design that serves it.
 *
 * A showcase entry (`MarketingTemplate`) only says which company, which
 * design, and where its live demo is. Everything a visitor sees on the card is
 * read from the company **now**: its business type, its colours, its hero
 * headline, its featured services and products, and the website sections it
 * actually has live. So when a demo company is edited, its card on our
 * website changes with it, and the card can never advertise something the
 * demo does not do.
 */

const db = require('../models');
const ApiError = require('../utils/ApiError');
const functionalityService = require('./functionality.service');
const { resolveTheme } = require('./theme.service');
const { STATUS, FUNCTIONALITY, TEMPLATE_DESIGN_CATALOGUE } = require('../constants');

const designOf = (key) => TEMPLATE_DESIGN_CATALOGUE.find((design) => design.key === key) ?? TEMPLATE_DESIGN_CATALOGUE[0];

/** Live features a visitor would not see as a section of the site. */
const BACK_OFFICE_SECTIONS = new Set([FUNCTIONALITY.WAREHOUSE]);

/** How many service or product names a card lists. */
const HIGHLIGHT_LIMIT = 4;

/**
 * The company's own public address, when it has one: its primary domain, if
 * that is a real host rather than a `*.localhost` development name.
 */
async function primaryDemoUrl(companyId) {
  const domain = await db.CompanyDomain.findOne({
    where: { companyId, isPrimary: true, status: STATUS.ACTIVE },
  });
  const host = domain?.domain;
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return null;
  return `https://${host}`;
}

/** The first company-wide hero slide, which is what the demo opens on. */
async function headlineOf(companyId) {
  const slide = await db.Slider.findOne({
    where: { companyId, branchId: null, status: STATUS.ACTIVE },
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });
  return slide ? { eyebrow: slide.eyebrow || null, title: slide.title, subtitle: slide.subtitle || null } : null;
}

/** Featured services and products first, then anything else, by name. */
async function highlightsOf(companyId) {
  const where = { companyId, status: STATUS.ACTIVE };
  const order = [['featured', 'DESC'], ['sequence', 'ASC'], ['id', 'ASC']];
  const [services, products] = await Promise.all([
    db.CompanyService.findAll({ where, order, attributes: ['title', 'featured'], limit: HIGHLIGHT_LIMIT }),
    db.CompanyProduct.findAll({ where, order, attributes: ['name', 'featured'], limit: HIGHLIGHT_LIMIT }),
  ]);
  const items = [
    ...services.map((row) => ({ name: row.title, featured: row.featured })),
    ...products.map((row) => ({ name: row.name, featured: row.featured })),
  ];
  items.sort((a, b) => Number(b.featured) - Number(a.featured));
  return items.slice(0, HIGHLIGHT_LIMIT).map((item) => item.name);
}

/** The sections that are actually on the demo's website right now. */
async function liveSectionsOf(companyId) {
  const { items } = await functionalityService.getFunctionalities(companyId, { withContent: true });
  return items.filter((item) => item.published && !BACK_OFFICE_SECTIONS.has(item.key)).map((item) => item.name);
}

async function toPublicTemplate(entry) {
  const { company } = entry;
  const [headline, highlights, sections, fallbackUrl] = await Promise.all([
    headlineOf(company.id),
    highlightsOf(company.id),
    liveSectionsOf(company.id),
    entry.demoUrl ? null : primaryDemoUrl(company.id),
  ]);
  const palette = resolveTheme({ company, preset: company.theme }) ?? {};

  return {
    id: entry.id,
    title: entry.title || company.name,
    summary: entry.summary || company.description || null,
    featured: entry.featured,
    businessType: company.businessType
      ? { name: company.businessType.name, icon: company.businessType.icon || null }
      : null,
    design: designOf(entry.design),
    palette: {
      primary: palette.primaryColor ?? null,
      secondary: palette.secondaryColor ?? null,
      accent: palette.accentColor ?? null,
      mode: palette.mode ?? null,
    },
    headline,
    highlights,
    sections,
    demoUrl: entry.demoUrl || fallbackUrl,
  };
}

/**
 * Every active entry whose company is still active, featured first, then in
 * sequence order. `design` narrows it to one design.
 */
async function listPublic({ design } = {}) {
  const entries = await db.MarketingTemplate.findAll({
    where: { status: STATUS.ACTIVE, ...(design ? { design } : {}) },
    include: [
      {
        model: db.Company,
        as: 'company',
        required: true,
        where: { status: STATUS.ACTIVE },
        include: [
          { model: db.BusinessType, as: 'businessType', attributes: ['name', 'icon'] },
          { model: db.Theme, as: 'theme' },
        ],
      },
    ],
    order: [['featured', 'DESC'], ['sequence', 'ASC'], ['id', 'ASC']],
  });

  return {
    designs: TEMPLATE_DESIGN_CATALOGUE,
    templates: await Promise.all(entries.map(toPublicTemplate)),
  };
}

/* ------------------------------------------------------------------ *
 * The super admin's side
 * ------------------------------------------------------------------ */

const adminInclude = [
  { model: db.Company, as: 'company', attributes: ['id', 'name', 'code', 'status'], paranoid: false },
];

async function listAdmin() {
  const items = await db.MarketingTemplate.findAll({
    include: adminInclude,
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });
  return { designs: TEMPLATE_DESIGN_CATALOGUE, items };
}

async function assertCompany(companyId) {
  const company = await db.Company.findByPk(companyId);
  if (!company) throw ApiError.badRequest('That company does not exist');
}

/** Blank optional text is stored as null, so "use the company's own" is one state, not two. */
const tidy = (body) => {
  const values = { ...body };
  ['title', 'summary', 'demoUrl'].forEach((key) => {
    if (key in values && !values[key]) values[key] = null;
  });
  return values;
};

async function create(body, actorId) {
  await assertCompany(body.companyId);
  const row = await db.MarketingTemplate.create({ ...tidy(body), createdBy: actorId ?? null });
  return db.MarketingTemplate.findByPk(row.id, { include: adminInclude });
}

async function update(id, body, actorId) {
  const row = await db.MarketingTemplate.findByPk(id);
  if (!row) throw ApiError.notFound('Template not found');
  if (body.companyId) await assertCompany(body.companyId);
  await row.update({ ...tidy(body), updatedBy: actorId ?? null });
  return db.MarketingTemplate.findByPk(row.id, { include: adminInclude });
}

async function remove(id) {
  const row = await db.MarketingTemplate.findByPk(id);
  if (!row) throw ApiError.notFound('Template not found');
  await row.destroy();
  return { id: row.id };
}

module.exports = { listPublic, listAdmin, create, update, remove };
