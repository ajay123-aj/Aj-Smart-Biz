'use strict';

const { fn, col, where: sqlWhere } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { Op } = require('sequelize');
const { STATUS, SUBSCRIPTION_STATUS, OCCUPYING_SUBSCRIPTION_STATUSES } = require('../constants');

/** Hosts that never identify a tenant, so a bare dev server gets platform branding. */
const NEUTRAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'www']);

/** Strips the port and lower-cases; `Acme.Test:4300` -> `acme.test`. */
const normaliseHost = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');

/**
 * The Host the browser actually used. Behind a proxy the original host arrives in
 * `X-Forwarded-Host`; `?domain=` stays available for local development, where the
 * dev server has no tenant subdomain of its own.
 */
const resolveHost = (req) => normaliseHost(req.query.domain || req.get('x-forwarded-host') || req.get('host'));

/** First label of the host: `acme.ajsmartbiz.com` -> `acme`. */
const subdomainOf = (host) => {
  const labels = host.split('.');
  return labels.length > 2 ? labels[0] : null;
};

/**
 * Resolves a host to `{ company, branch }`:
 *   1. an exact row in `company_domain` (which may pin a branch),
 *   2. otherwise the leading label of the host matched against `companies.code`,
 *      so a tenant works on `<code>.<platform>` without configuring anything.
 */
async function resolveTenantByHost(host) {
  // if (!host || NEUTRAL_HOSTS.has(host)) return { company: null, branch: null };

  const mapping = await db.CompanyDomain.findOne({
    where: { domain: host, status: STATUS.ACTIVE },
    include: [
      { model: db.Company, as: 'company' },
      { model: db.Branch, as: 'branch' },
    ],
  });
  if (mapping?.company) {
    // A branch that was deactivated falls back to company-wide branding.
    const branch = mapping.branch && mapping.branch.status === STATUS.ACTIVE ? mapping.branch : null;
    return { company: mapping.company, branch };
  }

  const label = subdomainOf(host);
  if (!label || NEUTRAL_HOSTS.has(label)) return { company: null, branch: null };

  const company = await db.Company.findOne({ where: sqlWhere(fn('LOWER', col('code')), label) });
  return { company: company ?? null, branch: null };
}

/**
 * GET /public/branding
 *
 * Unauthenticated: the login screen calls it before anyone has signed in. It
 * therefore returns only what a login page needs to render — never contact
 * details, GST, plan or counts — and never reveals whether a host exists: an
 * unknown or inactive tenant simply gets the platform defaults.
 */
const branding = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  const platform = {
    resolved: false,
    host,
    name: 'Aj Smart Biz',
    description: 'Sign in to your company workspace.',
    logo: null,
    favicon: null,
    branch: null,
    theme: null,
  };

  // An inactive tenant is treated as unknown so its status cannot be probed.
  if (!company || company.status !== STATUS.ACTIVE) {
    return success(res, { message: 'Branding fetched successfully', data: platform });
  }

  const theme = company.themeId
    ? await db.Theme.findOne({
      where: { id: company.themeId, status: STATUS.ACTIVE },
      attributes: ['id', 'name', 'primaryColor', 'secondaryColor', 'accentColor', 'mode'],
    })
    : null;

  /**
   * Last resort for images: the head office. A company that only ever branded
   * its main branch still gets a branded login screen rather than the platform
   * mark. Skipped when the host already resolved to a specific branch.
   */
  const needsFallback = !branch && (!company.logo || !company.favicon);
  const mainBranch = needsFallback
    ? await db.Branch.findOne({
      where: { companyId: company.id, isMain: true, status: STATUS.ACTIVE },
      attributes: ['logo', 'favicon'],
    })
    : null;

  return success(res, {
    message: 'Branding fetched successfully',
    data: {
      resolved: true,
      host,
      code: company.code,
      name: company.name,
      description: company.description,
      // Pinned branch -> company -> head office.
      logo: branch?.logo || company.logo || mainBranch?.logo || null,
      favicon: branch?.favicon || company.favicon || mainBranch?.favicon || null,
      branch: branch ? { id: branch.id, name: branch.name, code: branch.code } : null,
      theme: theme
        ? {
          primaryColor: theme.primaryColor,
          secondaryColor: theme.secondaryColor,
          accentColor: theme.accentColor,
          mode: theme.mode,
        }
        : null,
    },
  });
});

/* ------------------------------------------------------------------ *
 * Company details
 * ------------------------------------------------------------------ */

/** Flattens a company or branch row into the one address shape the sites render. */
const addressOf = (row, state) => ({
  line1: row.addressLine1 ?? null,
  line2: row.addressLine2 ?? null,
  city: row.city ?? null,
  state: state?.name ?? null,
  stateCode: state?.code ?? null,
  country: state?.country ?? null,
  pincode: row.pincode ?? null,
});

/** The public half of a branch. Deliberately no GST number and no contact rows. */
const publicBranch = (branch) =>
  branch
    ? {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      isMain: Boolean(branch.isMain),
      email: branch.email ?? null,
      phone: branch.phone ?? null,
      address: addressOf(branch, branch.state),
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      openingTime: branch.openingTime ?? null,
      closingTime: branch.closingTime ?? null,
    }
    : null;

/**
 * Whether this tenant's website should be served at all, and if not, why.
 *
 * The reasons are the platform's own — the identical set `quota.service` blocks
 * branch and admin creation with — so a company whose plan lapsed cannot be
 * refused a branch in the console while its website carries on serving.
 *
 * Deliberately coarse. This endpoint is public, so it answers with a flag and a
 * one-word reason and nothing else: no plan name, no price, no dates, no
 * renewal amount. That is enough for a site to render a holding page and not
 * enough to read a company's commercial position off its own homepage.
 */
async function resolveService(companyId) {
  const running = await db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    attributes: ['id', 'status'],
    order: [['id', 'DESC']],
  });

  if (running) {
    // A suspended term keeps its dates and its money; the tenant just stops
    // being served until the platform switches it back on.
    return running.status === SUBSCRIPTION_STATUS.SUSPENDED
      ? { active: false, reason: 'suspended' }
      : { active: true, reason: null };
  }

  // Nothing running. Whether a term ever existed is the difference between a
  // plan that lapsed and a company that was never put on one.
  const everHadOne = await db.CompanySubscription.findOne({
    where: { companyId },
    attributes: ['id'],
    paranoid: false,
  });

  return { active: false, reason: everHadOne ? 'expired' : 'no_plan' };
}

/** The public half of a slide — no ids beyond its own, no audit columns. */
const publicSlide = (slide) => ({
  id: slide.id,
  eyebrow: slide.eyebrow ?? null,
  title: slide.title,
  subtitle: slide.subtitle ?? null,
  image: slide.image ?? null,
  mobileImage: slide.mobileImage ?? null,
  ctaLabel: slide.ctaLabel ?? null,
  ctaUrl: slide.ctaUrl ?? null,
  sequence: slide.sequence,
});

/**
 * The slides this host should show.
 *
 * A branch-pinned domain gets that branch's own slides; if the branch has none,
 * it falls back to the company-wide ones (`branch_id IS NULL`) — the same
 * branch → company fallback the logo and favicon already follow, so a new
 * branch site is never blank and an existing campaign is never silently
 * replaced. A company-wide host only ever shows company-wide slides.
 */
async function resolveSlides(companyId, branchId) {
  const where = { companyId, status: STATUS.ACTIVE };
  const order = [['sequence', 'ASC'], ['id', 'ASC']];

  if (branchId) {
    const own = await db.Slider.findAll({ where: { ...where, branchId }, order });
    if (own.length) return own;
  }

  return db.Slider.findAll({ where: { ...where, branchId: null }, order });
}

/** Everything a public website may show for a host that named no tenant. */
const platformDetails = (host) => ({
  resolved: false,
  host,
  code: null,
  name: 'Aj Smart Biz',
  legalName: null,
  description: null,
  logo: null,
  favicon: null,
  businessType: null,
  theme: null,
  contact: { email: null, phone: null, alternatePhone: null, website: null },
  address: { line1: null, line2: null, city: null, state: null, stateCode: null, country: null, pincode: null },
  locale: { currency: null, timezone: null },
  branch: null,
  headOffice: null,
  branches: [],
  sliders: [],
  // Nothing resolved, so nothing is being withheld — the platform default page
  // is not a lapsed tenant.
  service: { active: true, reason: null },
});

/**
 * GET /public/company-details
 *
 * The whole public profile of the tenant that owns a host: name, tagline, logo,
 * favicon, theme, contact details, address and branches. This is what the
 * customer-facing websites in `websites/` launch with — they pass the domain they
 * were served on and render whatever comes back.
 *
 * Unauthenticated, like `/public/branding`, and bound by the same two rules:
 *
 *  - **Only what a company publishes about itself.** No GST or PAN number, no
 *    plan, subscription, transaction or admin data, no counts. Everything here is
 *    what a business prints on its own letterhead.
 *  - **An unknown or inactive tenant is indistinguishable from a real one that
 *    resolved to nothing** — both get `resolved: false` and platform defaults,
 *    never an error, so the endpoint cannot be walked to enumerate tenants.
 *
 * `branch` is the branch this domain is pinned to (`sub_company_id`) and nothing
 * else — null on a company-wide host — so a site can tell "this domain is the
 * Surat branch" from "this is the company". `headOffice` is always the main
 * branch, so there is a real address to fall back on either way.
 *
 * `sliders` are the active hero slides for this host, already ordered and
 * already resolved branch-wise — see `resolveSlides`.
 *
 * `service` says whether the tenant's plan still entitles it to be served, so a
 * site can put up a holding page instead of its content — see `resolveService`.
 */
const companyDetails = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  if (!company || company.status !== STATUS.ACTIVE) {
    return success(res, { message: 'Company details fetched successfully', data: platformDetails(host) });
  }

  const [theme, businessType, state, branches] = await Promise.all([
    company.themeId
      ? db.Theme.findOne({
        where: { id: company.themeId, status: STATUS.ACTIVE },
        attributes: ['primaryColor', 'secondaryColor', 'accentColor', 'mode'],
      })
      : null,
    company.businessTypeId
      ? db.BusinessType.findOne({
        where: { id: company.businessTypeId, status: STATUS.ACTIVE },
        attributes: ['id', 'name', 'slug'],
      })
      : null,
    company.stateId ? db.State.findOne({ where: { id: company.stateId }, attributes: ['name', 'code', 'country'] }) : null,
    db.Branch.findAll({
      where: { companyId: company.id, status: STATUS.ACTIVE },
      include: [{ model: db.State, as: 'state', attributes: ['name', 'code', 'country'], required: false }],
      order: [['isMain', 'DESC'], ['name', 'ASC']],
    }),
  ]);

  const [slides, service] = await Promise.all([
    resolveSlides(company.id, branch?.id ?? null),
    resolveService(company.id),
  ]);

  const mainBranch = branches.find((row) => row.isMain) ?? null;
  // Only a domain actually pinned to a branch reports one; the full row is
  // preferred over the one the resolver loaded, so it carries its state.
  const pinnedBranch = branch ? branches.find((row) => row.id === branch.id) ?? branch : null;

  return success(res, {
    message: 'Company details fetched successfully',
    data: {
      resolved: true,
      host,
      code: company.code,
      name: company.name,
      legalName: company.legalName ?? null,
      description: company.description ?? null,
      // Pinned branch -> company -> head office, the same order `/branding` uses.
      logo: branch?.logo || company.logo || mainBranch?.logo || null,
      favicon: branch?.favicon || company.favicon || mainBranch?.favicon || null,
      businessType: businessType
        ? { id: businessType.id, name: businessType.name, slug: businessType.slug ?? null }
        : null,
      theme: theme
        ? {
          primaryColor: theme.primaryColor,
          secondaryColor: theme.secondaryColor,
          accentColor: theme.accentColor,
          mode: theme.mode,
        }
        : null,
      contact: {
        email: company.email ?? null,
        phone: company.phone ?? null,
        alternatePhone: company.alternatePhone ?? null,
        website: company.website ?? null,
      },
      address: addressOf(company, state),
      locale: { currency: company.currency ?? null, timezone: company.timezone ?? null },
      branch: publicBranch(pinnedBranch),
      headOffice: publicBranch(mainBranch),
      branches: branches.map(publicBranch),
      sliders: slides.map(publicSlide),
      service,
    },
  });
});

module.exports = { branding, companyDetails, resolveTenantByHost, normaliseHost, resolveHost };
