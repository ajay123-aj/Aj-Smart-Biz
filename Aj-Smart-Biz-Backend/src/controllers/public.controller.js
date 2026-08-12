'use strict';

const { fn, col, where: sqlWhere } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { STATUS } = require('../constants');

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

module.exports = { branding, resolveTenantByHost, normaliseHost, resolveHost };
