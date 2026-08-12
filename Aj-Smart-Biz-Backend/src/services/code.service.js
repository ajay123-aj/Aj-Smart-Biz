'use strict';

const { Op } = require('sequelize');
const db = require('../models');

const slugify = (value) =>
  String(value)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .toLowerCase();

const toCodeBase = (value, length = 6) =>
  String(value)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, length) || 'CMP';

/**
 * Produces a unique code for `model`, e.g. "AJSMAR", then "AJSMAR2" and so on.
 * Soft-deleted rows are considered too, so a restore can never collide.
 */
async function generateUniqueCode(model, base, extraWhere = {}) {
  const prefix = toCodeBase(base);
  let candidate = prefix;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await model.findOne({ where: { ...extraWhere, code: candidate }, paranoid: false });
    if (!exists) return candidate;
    suffix += 1;
    candidate = `${prefix}${suffix}`;
  }
}

/** Invoice numbers look like INV-2026-000123 and are sequential per year. */
async function generateInvoiceNo(transaction = null) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const last = await db.Transaction.findOne({
    where: { invoiceNo: { [Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    paranoid: false,
    transaction,
  });
  const lastSeq = last ? Number.parseInt(String(last.invoiceNo).split('-').pop(), 10) : 0;
  return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
}

module.exports = { slugify, toCodeBase, generateUniqueCode, generateInvoiceNo };
