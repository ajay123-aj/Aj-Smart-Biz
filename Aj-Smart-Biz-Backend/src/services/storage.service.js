'use strict';

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const db = require('../models');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { OCCUPYING_SUBSCRIPTION_STATUSES } = require('../constants');

/**
 * Upload storage: how much a company is using, how much it may use, and the
 * check every upload passes through.
 *
 * ### The limit
 *
 *   1. `companies.storage_limit_mb`, when the super admin has set one — an
 *      override for this company alone.
 *   2. Otherwise the running plan's `storageMb`, read from the subscription
 *      snapshot first (what the company was sold), the live plan second.
 *   3. Neither — no running plan and no override — means *no storage cap*.
 *      That is deliberate: a company without a plan is already blocked from
 *      creating branches and admins by `quota.service`, and refusing it an
 *      image upload as well would only stop the super admin's onboarding.
 *
 * ### The usage
 *
 * `SUM(company_files.size_bytes)`. Every upload a company makes is recorded in
 * that ledger, and every file the platform deletes is removed from it. Files
 * from before the ledger existed are picked up by `reconcileCompany`, which is
 * run for every company at boot and again whenever the super admin opens a
 * company, so the figure shown is never stale for long.
 */

const MB = 1024 * 1024;

const uploadRoot = path.resolve(process.cwd(), config.uploads.dir);
const publicPrefix = `${config.uploads.publicPath}/`;

/** Columns, across every company-owned table, that hold an uploaded file path. */
const FILE_COLUMNS = ['logo', 'favicon', 'image', 'mobileImage', 'photo', 'coverImage', 'avatar'];
const FILE_LIST_COLUMNS = ['images'];

/** `1536000` -> `1.5 MB`. For messages people read. */
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * MB) return `${(value / (1024 * MB)).toFixed(value >= 10 * 1024 * MB ? 0 : 1)} GB`;
  if (value >= MB) return `${(value / MB).toFixed(value >= 10 * MB ? 0 : 1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

/** The absolute path of a public upload path, or null if it is not one of ours. */
function absoluteOf(publicPath) {
  if (typeof publicPath !== 'string' || !publicPath.startsWith(publicPrefix)) return null;
  const absolute = path.resolve(uploadRoot, publicPath.slice(publicPrefix.length));
  return absolute.startsWith(uploadRoot + path.sep) ? absolute : null;
}

/** The running plan's storage, in MB, and the plan's name. */
async function planStorage(companyId) {
  const subscription = await db.CompanySubscription.findOne({
    where: { companyId, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name', 'storageMb'] }],
    order: [['id', 'DESC']],
  });
  if (!subscription) return { storageMb: null, planName: null };

  const snapshot = subscription.planSnapshot?.storageMb;
  const live = subscription.plan?.storageMb;
  const value = snapshot ?? live;
  return {
    storageMb: value === undefined || value === null ? null : Number(value),
    planName: subscription.planSnapshot?.name ?? subscription.plan?.name ?? null,
  };
}

/**
 * The whole storage picture for one company — what the super admin's company
 * view and the tenant's plan page both show.
 */
async function getStorage(companyId) {
  const [company, usedRaw, fileCount, plan] = await Promise.all([
    db.Company.findByPk(companyId, { attributes: ['id', 'storageLimitMb'] }),
    db.CompanyFile.sum('sizeBytes', { where: { companyId } }),
    db.CompanyFile.count({ where: { companyId } }),
    planStorage(companyId),
  ]);
  if (!company) throw ApiError.notFound('Company not found');

  const usedBytes = Number(usedRaw) || 0;
  const override = company.storageLimitMb ?? null;
  const limitMb = override ?? plan.storageMb ?? null;
  const unlimited = limitMb === null || limitMb === 0;
  const limitBytes = unlimited ? null : limitMb * MB;

  return {
    usedBytes,
    usedMb: Math.round((usedBytes / MB) * 10) / 10,
    usedLabel: formatBytes(usedBytes),
    limitMb: unlimited ? null : limitMb,
    limitLabel: unlimited ? 'Unlimited' : formatBytes(limitBytes),
    remainingBytes: unlimited ? null : Math.max(0, limitBytes - usedBytes),
    percentUsed: unlimited ? 0 : Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10),
    atLimit: !unlimited && usedBytes >= limitBytes,
    unlimited,
    /** Where the limit comes from: `company` (override), `plan`, or `none`. */
    source: override !== null ? 'company' : plan.storageMb !== null ? 'plan' : 'none',
    companyStorageLimitMb: override,
    planStorageMb: plan.storageMb,
    planName: plan.planName,
    fileCount,
  };
}

/**
 * The guard an upload passes through, *after* the file is on disk (multipart
 * gives no reliable size before that). Throws a readable message; the caller
 * deletes the file.
 */
async function assertCanStore(companyId, incomingBytes) {
  const storage = await getStorage(companyId);
  if (storage.unlimited) return storage;

  if (storage.usedBytes + incomingBytes > storage.limitMb * MB) {
    const left = formatBytes(storage.remainingBytes);
    const message =
      storage.remainingBytes > 0
        ? `Not enough storage: this file is ${formatBytes(incomingBytes)} but only ${left} of your ${storage.limitLabel} is left. Delete some images or upgrade your plan.`
        : `Your storage is full (${storage.usedLabel} of ${storage.limitLabel}). Delete some images or upgrade your plan to upload more.`;
    throw ApiError.badRequest(message, [
      {
        field: 'storage',
        message,
        reason: 'storage_full',
        usedBytes: storage.usedBytes,
        limitMb: storage.limitMb,
        incomingBytes,
      },
    ]);
  }
  return storage;
}

/** Charge an uploaded file to a company. Idempotent on `path`. */
async function recordFile({ companyId, publicPath, folder = null, sizeBytes, mimeType = null, uploadedBy = null }) {
  if (!companyId || !publicPath) return null;
  const [row] = await db.CompanyFile.findOrCreate({
    where: { path: publicPath },
    defaults: { companyId, path: publicPath, folder, sizeBytes: Number(sizeBytes) || 0, mimeType, uploadedBy },
  });
  return row;
}

/** Stop charging for a file that has been deleted. Never throws. */
async function forgetFile(publicPath) {
  if (!publicPath) return;
  try {
    await db.CompanyFile.destroy({ where: { path: publicPath } });
  } catch (error) {
    logger.warn(`Could not remove ${publicPath} from the storage ledger: ${error.message}`);
  }
}

/** Every upload path a company's rows point at. */
async function referencedPaths(companyId) {
  const found = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value.startsWith(publicPrefix)) found.add(value);
  };

  const models = Object.values(db).filter((model) => model && model.rawAttributes && model.findAll);

  for (const model of models) {
    const attributes = Object.keys(model.rawAttributes);
    const files = attributes.filter((name) => FILE_COLUMNS.includes(name));
    const lists = attributes.filter((name) => FILE_LIST_COLUMNS.includes(name));
    if (!files.length && !lists.length) continue;

    let where;
    if (model === db.Company) where = { id: companyId };
    else if (attributes.includes('companyId')) where = { companyId };
    else continue;

    const rows = await model.findAll({ where, attributes: [...files, ...lists], raw: true, paranoid: false });
    rows.forEach((row) => {
      files.forEach((column) => add(row[column]));
      lists.forEach((column) => {
        let value = row[column];
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            value = null;
          }
        }
        if (Array.isArray(value)) value.forEach(add);
      });
    });
  }

  return found;
}

/**
 * Bring a company's ledger in line with the disk.
 *
 *  - Every file its rows reference that is not in the ledger yet is recorded,
 *    with its real size on disk. This is how pre-ledger files, and files a
 *    super admin uploaded on the company's behalf, are counted.
 *  - Every ledger row whose file no longer exists on disk is dropped.
 *
 * A file already charged to another company is left with that company.
 */
async function reconcileCompany(companyId) {
  const paths = await referencedPaths(companyId);
  const known = new Set(
    (await db.CompanyFile.findAll({ where: { path: [...paths] }, attributes: ['path'], raw: true })).map(
      (row) => row.path
    )
  );

  let added = 0;
  for (const publicPath of paths) {
    if (known.has(publicPath)) continue;
    const absolute = absoluteOf(publicPath);
    if (!absolute) continue;
    let size;
    try {
      size = fs.statSync(absolute).size;
    } catch {
      continue; // referenced but missing on disk: nothing to charge for
    }
    await recordFile({
      companyId,
      publicPath,
      folder: publicPath.slice(publicPrefix.length).split('/')[0] || null,
      sizeBytes: size,
    });
    added += 1;
  }

  let removed = 0;
  const rows = await db.CompanyFile.findAll({ where: { companyId }, attributes: ['id', 'path'] });
  for (const row of rows) {
    const absolute = absoluteOf(row.path);
    if (absolute && !fs.existsSync(absolute)) {
      await row.destroy();
      removed += 1;
    }
  }

  return { added, removed };
}

/** Reconcile every company. Run once at boot; safe to run any time. */
async function reconcileAll() {
  const companies = await db.Company.findAll({ attributes: ['id'], raw: true });
  let added = 0;
  let removed = 0;
  for (const { id } of companies) {
    try {
      const result = await reconcileCompany(id);
      added += result.added;
      removed += result.removed;
    } catch (error) {
      logger.warn(`Storage reconcile failed for company ${id}: ${error.message}`);
    }
  }
  if (added || removed) logger.info(`Storage ledger reconciled: ${added} file(s) recorded, ${removed} removed`);
  return { added, removed };
}

module.exports = {
  getStorage,
  assertCanStore,
  recordFile,
  forgetFile,
  reconcileCompany,
  reconcileAll,
  formatBytes,
};
