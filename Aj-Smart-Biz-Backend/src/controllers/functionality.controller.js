'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { mergeWhere } = require('../utils/query');
const functionalityService = require('../services/functionality.service');
const { validateSettings } = require('../validators/functionality.validator');
const {
  AUTH_SCOPE,
  STATUS,
  FUNCTIONALITY,
  FUNCTIONALITY_CATALOGUE,
  WHATSAPP_TYPE_CATALOGUE,
  SHARE_CHANNEL_VALUES,
  SHARE_LINK_DEFAULTS,
  STAT_MODE,
  STAT_MODE_VALUES,
  STAT_UNIT_VALUES,
  DEFAULT_STATS,
} = require('../constants');

/**
 * The tenant's optional functionality: the switches, and the WhatsApp numbers
 * the `whatsapp` switch publishes.
 *
 * Every query is pinned to one company, the same way the slider controller does
 * it: a company admin's token already names their tenant, so `:companyId` is
 * ignored for them and cross-tenant access is impossible by construction.
 */
const resolveCompanyId = (req) => {
  if (req.auth?.scope === AUTH_SCOPE.ADMIN) return req.auth.companyId;
  const companyId = Number(req.params.companyId);
  if (!Number.isInteger(companyId) || companyId <= 0) throw ApiError.badRequest('A valid companyId is required');
  return companyId;
};

/* ------------------------------------------------------------------ *
 * The catalogue
 * ------------------------------------------------------------------ */

/**
 * GET /masters/functionalities
 *
 * What the platform implements, with the WhatsApp types and share channels each
 * one understands. Read by both consoles — the super admin ticks these on a
 * plan, the tenant switches on what its plan granted — so neither hard-codes a
 * list that could drift from the API's.
 */
const catalogue = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Functionality catalogue fetched successfully',
    data: {
      functionalities: FUNCTIONALITY_CATALOGUE,
      whatsappTypes: WHATSAPP_TYPE_CATALOGUE,
      shareChannels: SHARE_CHANNEL_VALUES,
      shareDefaults: SHARE_LINK_DEFAULTS,
      statModes: STAT_MODE_VALUES,
      statUnits: STAT_UNIT_VALUES,
    },
  })
);

/* ------------------------------------------------------------------ *
 * Switches
 * ------------------------------------------------------------------ */

/** GET /my-company/functionalities */
const list = asyncHandler(async (req, res) => {
  const data = await functionalityService.getFunctionalities(resolveCompanyId(req));
  return success(res, { message: 'Functionality list fetched successfully', data });
});

/** GET /my-company/functionalities/:key */
const getByKey = asyncHandler(async (req, res) => {
  const item = await functionalityService.getFunctionality(resolveCompanyId(req), req.params.key);
  return success(res, { message: 'Functionality fetched successfully', data: item });
});

/**
 * Finds the switch row, creating it the first time the tenant touches the
 * feature. `defaults` decides what a brand new row starts as, so enabling
 * something for the first time is one call rather than create-then-toggle.
 */
async function switchRow(companyId, key, defaults = {}) {
  const [row] = await db.CompanyFunctionality.findOrCreate({
    where: { companyId, key },
    defaults: { companyId, key, status: STATUS.INACTIVE, ...defaults },
  });
  return row;
}

/**
 * PATCH /my-company/functionalities/:key/status
 *
 * Switching a feature on is what makes it appear on the website; switching it
 * off is what takes it away. Guarded on the plan's grant, so a tenant cannot
 * enable something it was never sold — the console disables the switch for the
 * same reason, and both read the same answer.
 */
/**
 * Gives a company the starting stat band the first time it switches About on,
 * so the section is never an empty row of tiles.
 *
 * "Years in business" counts from the company record's own creation date,
 * which is the only founding date the platform actually knows — the tenant
 * corrects it to the real one. Ordinary rows from that moment on; a company
 * that deletes them all does not get them back.
 */
async function seedDefaultStats(companyId, actorId) {
  const existing = await db.CompanyStat.count({ where: { companyId } });
  if (existing) return;

  const company = await db.Company.findByPk(companyId, { attributes: ['createdAt'] });
  const since = (company?.createdAt ?? new Date()).toISOString().slice(0, 10);

  await db.CompanyStat.bulkCreate(
    DEFAULT_STATS.map((stat) => ({
      ...stat,
      companyId,
      sinceDate: stat.mode === STAT_MODE.SINCE_DATE ? since : null,
      createdBy: actorId ?? null,
    }))
  );
}

const toggleStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { key } = req.params;
  await functionalityService.assertGranted(companyId, key);

  const row = await switchRow(companyId, key, { createdBy: req.auth?.id ?? null });
  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });

  if (key === FUNCTIONALITY.ABOUT_US && next === STATUS.ACTIVE) {
    await seedDefaultStats(companyId, req.auth?.id);
  }

  const item = await functionalityService.getFunctionality(companyId, key);
  return success(res, { message: `${item.name} switched ${next === STATUS.ACTIVE ? 'on' : 'off'}`, data: item });
});

/**
 * PUT /my-company/functionalities/:key/settings
 *
 * Replaces the configuration for one feature. The body is checked against that
 * feature's own schema rather than a shared one, so a client cannot park
 * arbitrary JSON on a tenant's row.
 */
const updateSettings = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { key } = req.params;
  await functionalityService.assertGranted(companyId, key);

  const settings = validateSettings(key, req.body);
  const row = await switchRow(companyId, key, { createdBy: req.auth?.id ?? null });
  await row.update({ settings, updatedBy: req.auth?.id ?? null });

  const item = await functionalityService.getFunctionality(companyId, key);
  return success(res, { message: `${item.name} settings saved`, data: item });
});

/* ------------------------------------------------------------------ *
 * WhatsApp numbers
 * ------------------------------------------------------------------ */

/**
 * Every route below configures the WhatsApp feature, so all of them are gated
 * on the plan granting it — but on `granted`, not `active`: a company must be
 * able to correct a wrong number while the feature is switched off.
 */
const assertWhatsapp = (companyId) => functionalityService.assertGranted(companyId, FUNCTIONALITY.WHATSAPP);

const findNumberOrFail = async (companyId, id) => {
  const row = await db.CompanyWhatsapp.findOne({ where: { id, companyId } });
  if (!row) throw ApiError.notFound('WhatsApp number not found');
  return row;
};

/**
 * Digits only, and the country code separated from the number it was pasted in
 * front of — see `subscriberNumber`. `existing` supplies the country code on a
 * partial update that changes only the number.
 */
const normaliseNumberFields = (body, existing = null) => {
  const patch = { ...body };
  if (patch.countryCode !== undefined) patch.countryCode = functionalityService.digitsOnly(patch.countryCode);

  if (patch.number !== undefined) {
    const countryCode = patch.countryCode ?? existing?.countryCode ?? '91';
    patch.number = functionalityService.subscriberNumber(patch.number, countryCode);
  }

  return patch;
};

/**
 * GET /my-company/whatsapp-numbers
 *
 * Unpaginated on purpose: this is a short, ordered list a tenant edits as a
 * whole, like branch contacts, not a table anyone pages through.
 */
const listNumbers = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);

  const rows = await db.CompanyWhatsapp.findAll({
    where: mergeWhere(
      { companyId },
      req.query.type ? { type: req.query.type } : null,
      req.query.status ? { status: req.query.status } : null
    ),
    order: [['sequence', 'ASC'], ['id', 'ASC']],
  });

  return success(res, {
    message: 'WhatsApp number list fetched successfully',
    data: { items: rows, types: WHATSAPP_TYPE_CATALOGUE },
  });
});

const createNumber = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertWhatsapp(companyId);

  const body = normaliseNumberFields(req.body);
  if (!body.number) throw ApiError.badRequest('number must contain at least one digit');

  /** Appended to the end unless a position was given, like slides. */
  const sequence = body.sequence ?? ((await db.CompanyWhatsapp.max('sequence', { where: { companyId } })) || 0) + 1;

  const row = await db.CompanyWhatsapp.create({
    ...body,
    companyId,
    sequence,
    createdBy: req.auth?.id ?? null,
  });

  return created(res, 'WhatsApp number added successfully', row);
});

const updateNumber = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertWhatsapp(companyId);

  const row = await findNumberOrFail(companyId, req.params.id);
  const patch = normaliseNumberFields(req.body, row);
  if ('number' in patch && !patch.number) throw ApiError.badRequest('number must contain at least one digit');

  await row.update({ ...patch, updatedBy: req.auth?.id ?? null });
  return success(res, { message: 'WhatsApp number updated successfully', data: row });
});

const toggleNumberStatus = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertWhatsapp(companyId);

  const row = await findNumberOrFail(companyId, req.params.id);
  const next = req.body?.status || (row.status === STATUS.ACTIVE ? STATUS.INACTIVE : STATUS.ACTIVE);
  await row.update({ status: next, updatedBy: req.auth?.id ?? null });

  return success(res, { message: `WhatsApp number marked ${next}`, data: { id: row.id, status: next } });
});

/**
 * PATCH /my-company/whatsapp-numbers/reorder — the whole ordered list in one
 * call, so a shuffle cannot be left half-applied. Same shape as the slider
 * reorder it is modelled on.
 */
const reorderNumbers = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertWhatsapp(companyId);

  const ids = req.body.ids ?? [];
  const owned = await db.CompanyWhatsapp.findAll({ where: { id: ids, companyId }, attributes: ['id'] });
  if (owned.length !== ids.length) throw ApiError.badRequest('One or more numbers do not belong to this company');

  await db.sequelize.transaction(async (transaction) =>
    Promise.all(
      ids.map((id, index) =>
        db.CompanyWhatsapp.update(
          { sequence: index + 1, updatedBy: req.auth?.id ?? null },
          { where: { id, companyId }, transaction }
        )
      )
    )
  );

  return success(res, { message: 'WhatsApp number order updated successfully', data: { ids } });
});

const removeNumber = asyncHandler(async (req, res) => {
  const companyId = resolveCompanyId(req);
  await assertWhatsapp(companyId);

  const row = await findNumberOrFail(companyId, req.params.id);
  await row.update({ updatedBy: req.auth?.id ?? null });
  await row.destroy();
  return success(res, { message: 'WhatsApp number deleted successfully', data: { id: row.id } });
});

module.exports = {
  catalogue,
  list,
  getByKey,
  toggleStatus,
  updateSettings,
  listNumbers,
  createNumber,
  updateNumber,
  toggleNumberStatus,
  reorderNumbers,
  removeNumber,
};
