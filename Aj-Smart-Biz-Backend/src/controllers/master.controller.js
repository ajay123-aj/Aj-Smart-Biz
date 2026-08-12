'use strict';

const db = require('../models');
const ApiError = require('../utils/ApiError');
const { fn, col, Op } = require('sequelize');
const crudFactory = require('./crud.factory');
const { OCCUPYING_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS } = require('../constants');

/** Refuses the delete when other records still point at the master row. */
const blockIfReferenced = (checks) => async (record) => {
  for (const { model, field, label } of checks) {
    // eslint-disable-next-line no-await-in-loop
    const count = await model.count({ where: { [field]: record.id } });
    if (count > 0) throw ApiError.badRequest(`${count} ${label} still use this record`);
  }
};

const state = crudFactory({
  model: db.State,
  label: 'State',
  searchFields: ['name', 'code', 'country'],
  sortFields: ['name', 'code', 'country', 'created_at'],
  uniqueFields: ['name'],
  beforeDelete: blockIfReferenced([
    { model: db.Company, field: 'stateId', label: 'company(ies)' },
    { model: db.Branch, field: 'stateId', label: 'branch(es)' },
  ]),
});

const businessType = crudFactory({
  model: db.BusinessType,
  label: 'Business type',
  searchFields: ['name', 'description'],
  sortFields: ['name', 'created_at'],
  uniqueFields: ['name'],
  beforeDelete: blockIfReferenced([{ model: db.Company, field: 'businessTypeId', label: 'company(ies)' }]),
});

const theme = crudFactory({
  model: db.Theme,
  label: 'Theme',
  searchFields: ['name', 'code'],
  sortFields: ['name', 'created_at'],
  uniqueFields: ['name'],
  beforeDelete: async (record) => {
    if (record.isDefault) throw ApiError.badRequest('The default theme cannot be deleted');
    const count = await db.Company.count({ where: { themeId: record.id } });
    if (count > 0) throw ApiError.badRequest(`${count} company(ies) still use this theme`);
  },
});

/**
 * How many companies each plan is carrying right now, and how many of those
 * terms are about to run out - the two numbers the plan list is judged on.
 */
async function attachPlanUsage(rows) {
  if (!rows.length) return rows;
  const planIds = rows.map((row) => row.id);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [live, expiring] = await Promise.all([
    db.CompanySubscription.findAll({
      where: { planId: { [Op.in]: planIds }, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
      attributes: ['planId', [fn('COUNT', col('id')), 'total']],
      group: ['plan_id'],
      raw: true,
    }),
    db.CompanySubscription.findAll({
      where: {
        planId: { [Op.in]: planIds },
        status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES },
        endDate: { [Op.between]: [new Date().toISOString().slice(0, 10), soon] },
      },
      attributes: ['planId', [fn('COUNT', col('id')), 'total']],
      group: ['plan_id'],
      raw: true,
    }),
  ]);

  const countBy = (list) =>
    list.reduce((acc, row) => ({ ...acc, [row.planId]: Number(row.total) }), {});
  const liveBy = countBy(live);
  const expiringBy = countBy(expiring);

  return rows.map((row) => ({
    ...row.toJSON(),
    usage: { companies: liveBy[row.id] || 0, expiringSoon: expiringBy[row.id] || 0 },
  }));
}

const plan = crudFactory({
  model: db.Plan,
  label: 'Plan',
  searchFields: ['name', 'code', 'description'],
  sortFields: ['name', 'price', 'sequence', 'created_at'],
  uniqueFields: ['name'],
  decorateRows: attachPlanUsage,
  beforeDelete: async (record) => {
    // Suspended tenants count too - they are still occupying the plan.
    const active = await db.CompanySubscription.count({
      where: { planId: record.id, status: { [Op.in]: OCCUPYING_SUBSCRIPTION_STATUSES } },
    });
    if (active > 0) throw ApiError.badRequest(`${active} company(ies) are currently subscribed to this plan`);

    const scheduled = await db.CompanySubscription.count({
      where: { planId: record.id, status: SUBSCRIPTION_STATUS.PENDING },
    });
    if (scheduled > 0) {
      throw ApiError.badRequest(`${scheduled} scheduled renewal(s) still point at this plan`);
    }
  },
});

module.exports = { state, businessType, theme, plan };
