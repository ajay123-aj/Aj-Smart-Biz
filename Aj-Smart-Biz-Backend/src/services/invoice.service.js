'use strict';

const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const stockService = require('./stock.service');
const {
  STATUS,
  FUNCTIONALITY,
  STOCK_MOVEMENT_TYPE,
  STOCK_REASON,
  INVOICE_STATUS,
  INVOICE_PAYMENT_STATUS,
  DISCOUNT_TYPE,
  INVOICE_NO_PREFIX,
  INVOICE_NO_PAD,
  INVOICE_ITEMS_MAX,
} = require('../constants');

/**
 * Counter invoices: the arithmetic, the numbering, and what issuing one does to
 * stock.
 *
 * Like `stock.service`, **every function that writes takes a transaction and
 * none starts one.** Issuing an invoice is three things that must be true
 * together — the invoice is numbered, its lines are locked, the stock has left
 * the shelf — and only the caller holds a boundary wide enough for all three.
 */

/** Money, rounded the way a till rounds it. */
const r2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/* ------------------------------------------------------------------ *
 * Arithmetic
 * ------------------------------------------------------------------ */

/**
 * What a discount comes to on an amount.
 *
 * Percent is capped at 100 and a flat amount at the amount itself, so no line
 * and no bill can ever be discounted below zero — a negative line is a refund,
 * and a refund is a cancellation, not a discount.
 */
function discountOn(amount, type, value) {
  const v = Math.max(0, num(value));
  if (!type || v === 0 || amount <= 0) return 0;
  if (type === DISCOUNT_TYPE.PERCENT) return r2((amount * Math.min(v, 100)) / 100);
  return r2(Math.min(v, amount));
}

/** One line's figures, from its inputs. Pure — used by the API and mirrored by the screen. */
function computeLine({ quantity, unitPrice, discountType, discountValue, taxPercent }) {
  const qty = Math.max(0, Math.trunc(num(quantity)));
  const price = Math.max(0, r2(num(unitPrice)));
  const gross = r2(qty * price);
  const discount = discountOn(gross, discountType, discountValue);
  const taxable = r2(gross - discount);
  const rate = Math.min(100, Math.max(0, num(taxPercent)));
  const tax = r2((taxable * rate) / 100);
  return {
    quantity: qty,
    unitPrice: price,
    gross,
    discountType: discount > 0 || num(discountValue) > 0 ? discountType ?? null : null,
    discountValue: Math.max(0, r2(num(discountValue))),
    discount,
    taxable,
    taxPercent: rate,
    tax,
    lineTotal: r2(taxable + tax),
  };
}

/**
 * The whole bill.
 *
 * The bill discount is taken off **after** line tax — the "extra 10% off at the
 * till" a customer is offered once the items are rung up. Then the total is
 * rounded to the nearest rupee when asked, and the difference is recorded so the
 * printed figures still add up.
 */
function computeTotals(lines, { billDiscountType = null, billDiscountValue = 0, roundOff = true } = {}) {
  const sum = (key) => r2(lines.reduce((acc, line) => acc + num(line[key]), 0));

  const subtotal = sum('gross');
  const itemDiscount = sum('discount');
  const taxTotal = sum('tax');
  const afterLines = sum('lineTotal');
  const billDiscount = discountOn(afterLines, billDiscountType, billDiscountValue);
  const beforeRound = r2(afterLines - billDiscount);
  const grandTotal = roundOff ? Math.round(beforeRound) : beforeRound;

  return {
    itemCount: lines.reduce((acc, line) => acc + num(line.quantity), 0),
    subtotal,
    itemDiscount,
    taxTotal,
    billDiscountType: billDiscount > 0 || num(billDiscountValue) > 0 ? billDiscountType : null,
    billDiscountValue: Math.max(0, r2(num(billDiscountValue))),
    billDiscount,
    roundOff: r2(grandTotal - beforeRound),
    grandTotal: r2(grandTotal),
  };
}

/** Paid, partly paid or unpaid — always derived, never typed. */
function paymentStatusOf(grandTotal, amountPaid) {
  const total = num(grandTotal);
  const paid = num(amountPaid);
  if (paid <= 0) return total <= 0 ? INVOICE_PAYMENT_STATUS.PAID : INVOICE_PAYMENT_STATUS.UNPAID;
  if (paid + 0.004 >= total) return INVOICE_PAYMENT_STATUS.PAID;
  return INVOICE_PAYMENT_STATUS.PARTIAL;
}

/** The price a product sells at today: the offer where it beats the normal price. */
function sellingPriceOf(product) {
  const price = product.price === null || product.price === undefined ? null : Number(product.price);
  const offer = product.offerPrice === null || product.offerPrice === undefined ? null : Number(product.offerPrice);
  if (offer !== null && (price === null || offer < price)) return { sellingPrice: offer, listPrice: price };
  return { sellingPrice: price, listPrice: null };
}

/* ------------------------------------------------------------------ *
 * Building lines from a request
 * ------------------------------------------------------------------ */

/**
 * Turn the lines a person entered into invoice items.
 *
 * Products are loaded **scoped to this tenant** — a body naming another
 * company's product id must not bill that company's goods. The unit price
 * defaults to the catalogue's selling price; staff may override it, because the
 * person at the counter is the business. A product priced only in words has no
 * default, so it needs one typed in.
 */
async function buildItems(companyId, lines, transaction) {
  if (!Array.isArray(lines) || !lines.length) throw ApiError.badRequest('Add at least one product to the invoice');
  if (lines.length > INVOICE_ITEMS_MAX) throw ApiError.badRequest(`An invoice can carry at most ${INVOICE_ITEMS_MAX} lines`);

  const ids = [...new Set(lines.map((line) => Number(line.productId)).filter((id) => Number.isInteger(id) && id > 0))];
  const products = await db.CompanyProduct.findAll({
    where: { companyId, id: { [Op.in]: ids } },
    transaction,
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return lines.map((line, index) => {
    const product = byId.get(Number(line.productId));
    if (!product) throw ApiError.badRequest(`Line ${index + 1}: that product does not exist`);
    if (product.status !== STATUS.ACTIVE) throw ApiError.badRequest(`${product.name} is inactive and cannot be billed`);

    const { sellingPrice, listPrice } = sellingPriceOf(product);
    const given = line.unitPrice === undefined || line.unitPrice === null || line.unitPrice === '' ? null : num(line.unitPrice, NaN);
    const unitPrice = given !== null && Number.isFinite(given) ? given : sellingPrice;
    if (unitPrice === null) throw ApiError.badRequest(`${product.name} has no price in the catalogue — enter one`);

    const figures = computeLine({ ...line, unitPrice });
    if (figures.quantity <= 0) throw ApiError.badRequest(`${product.name}: quantity must be at least 1`);

    return {
      companyId,
      productId: product.id,
      productName: product.name,
      productSku: product.sku ?? null,
      listPrice: listPrice !== null && listPrice > figures.unitPrice ? listPrice : null,
      ...figures,
      sequence: index + 1,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Numbering
 * ------------------------------------------------------------------ */

/**
 * `INV-00001`, and the next one within this tenant.
 *
 * Counted from the highest number this tenant has ever issued, soft-deleted rows
 * included, so a number printed on a customer's bill is never reused. The caller
 * locks the company row first (see `lockCompany`), which serialises issuing per
 * tenant and makes the read-then-write here safe.
 */
async function nextInvoiceNo(companyId, transaction) {
  const latest = await db.CompanyInvoice.findOne({
    where: { companyId, invoiceNo: { [Op.ne]: null } },
    attributes: ['invoiceNo'],
    order: [['issuedAt', 'DESC'], ['id', 'DESC']],
    paranoid: false,
    transaction,
  });
  const current = latest?.invoiceNo ? Number(String(latest.invoiceNo).replace(/\D/g, '')) : 0;
  const next = (Number.isFinite(current) ? current : 0) + 1;
  return `${INVOICE_NO_PREFIX}-${String(next).padStart(INVOICE_NO_PAD, '0')}`;
}

/** Serialise number-giving and stock-taking for one tenant inside this transaction. */
async function lockCompany(companyId, transaction) {
  await db.Company.findByPk(companyId, { attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
}

/* ------------------------------------------------------------------ *
 * Stock
 * ------------------------------------------------------------------ */

/** Whether the tenant's Warehouse functionality is live right now. */
async function warehouseLive(companyId) {
  const functionalityService = require('./functionality.service');
  const { activeKeys } = await functionalityService.getFunctionalities(companyId);
  return activeKeys.includes(FUNCTIONALITY.WAREHOUSE);
}

/** The unit an invoice is filled from: the one chosen, else the branch's, else the default. */
async function resolveWarehouse(invoice, transaction) {
  if (invoice.warehouseId) {
    const chosen = await db.CompanyWarehouse.findOne({
      where: { id: invoice.warehouseId, companyId: invoice.companyId, status: STATUS.ACTIVE },
      transaction,
    });
    if (!chosen) throw ApiError.badRequest('The selected warehouse is not available');
    return chosen;
  }
  return stockService.defaultWarehouse(invoice.companyId, invoice.branchId, { transaction });
}

/**
 * What is sellable per product in one warehouse — on hand minus what orders
 * have already been promised. Locked for update so two counters billing the
 * last one at the same moment cannot both succeed.
 */
async function availableIn(warehouseId, productIds, transaction) {
  if (!productIds.length) return new Map();
  const rows = await db.CompanyStock.findAll({
    where: { warehouseId, productId: { [Op.in]: productIds } },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  return new Map(rows.map((row) => [row.productId, row.quantity - row.reserved]));
}

/**
 * Take an issued invoice's tracked products off the shelf.
 *
 * Only products marked `trackInventory` are counted, and only when Warehouse &
 * stock is live — the same rule orders follow, so a product is either counted
 * everywhere or nowhere. Every shortage is checked **before** anything moves and
 * reported together, so the person at the counter fixes the bill once rather
 * than discovering the problems one at a time.
 */
async function deductStock(invoice, items, { actorId = null, transaction }) {
  if (!(await warehouseLive(invoice.companyId))) return { applied: false, reason: 'warehouse_off' };

  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  const tracked = await db.CompanyProduct.findAll({
    where: { companyId: invoice.companyId, id: { [Op.in]: productIds }, trackInventory: true },
    attributes: ['id', 'name'],
    transaction,
  });
  if (!tracked.length) return { applied: false, reason: 'nothing_tracked' };

  const trackedIds = new Set(tracked.map((product) => product.id));
  const names = new Map(tracked.map((product) => [product.id, product.name]));

  const warehouse = await resolveWarehouse(invoice, transaction);
  if (!warehouse) {
    throw ApiError.badRequest(
      'This invoice has stock-tracked products but no warehouse is set up. Add a warehouse under Warehouse first.'
    );
  }

  const need = new Map();
  items.forEach((item) => {
    if (trackedIds.has(item.productId)) need.set(item.productId, (need.get(item.productId) ?? 0) + item.quantity);
  });

  const available = await availableIn(warehouse.id, [...need.keys()], transaction);
  const shortages = [];
  need.forEach((qty, productId) => {
    const have = available.get(productId) ?? 0;
    if (qty > have) shortages.push(`${names.get(productId)} (need ${qty}, available ${Math.max(0, have)})`);
  });
  if (shortages.length) {
    throw ApiError.badRequest(`Not enough stock in ${warehouse.name}: ${shortages.join('; ')}`);
  }

  for (const [productId, quantity] of need) {
    await stockService.applyMovement(
      {
        companyId: invoice.companyId,
        warehouseId: warehouse.id,
        productId,
        type: STOCK_MOVEMENT_TYPE.OUT,
        reason: STOCK_REASON.INVOICE,
        quantity,
        invoiceId: invoice.id,
        reference: invoice.invoiceNo,
        note: `Billed on invoice ${invoice.invoiceNo}`,
        actorId,
      },
      transaction
    );
  }

  await db.CompanyInvoiceItem.update(
    { stockDeducted: true },
    { where: { invoiceId: invoice.id, productId: { [Op.in]: [...need.keys()] } }, transaction }
  );

  return { applied: true, warehouseId: warehouse.id };
}

/**
 * Put back what an issued invoice took — called when it is cancelled.
 *
 * Driven by what was actually deducted (`stockDeducted` on each line), not by
 * today's settings: a tenant who has since switched Warehouse off or stopped
 * tracking a product must still get back exactly what left the shelf, or the
 * ledger stops reconciling.
 */
async function returnStock(invoice, { actorId = null, transaction }) {
  if (!invoice.stockApplied || !invoice.warehouseId) return;

  const items = await db.CompanyInvoiceItem.findAll({
    where: { invoiceId: invoice.id, stockDeducted: true },
    transaction,
  });

  const qty = new Map();
  items.forEach((item) => {
    if (item.productId) qty.set(item.productId, (qty.get(item.productId) ?? 0) + item.quantity);
  });

  for (const [productId, quantity] of qty) {
    await stockService.applyMovement(
      {
        companyId: invoice.companyId,
        warehouseId: invoice.warehouseId,
        productId,
        type: STOCK_MOVEMENT_TYPE.IN,
        reason: STOCK_REASON.RETURN,
        quantity,
        invoiceId: invoice.id,
        reference: invoice.invoiceNo,
        note: `Invoice ${invoice.invoiceNo} cancelled`,
        actorId,
      },
      transaction
    );
  }

  await db.CompanyInvoiceItem.update({ stockDeducted: false }, { where: { invoiceId: invoice.id }, transaction });
}

/* ------------------------------------------------------------------ *
 * Writing an invoice
 * ------------------------------------------------------------------ */

const HEADER_FIELDS = [
  'branchId',
  'warehouseId',
  'customerId',
  'invoiceDate',
  'dueDate',
  'customerName',
  'customerPhone',
  'customerEmail',
  'customerAddress',
  'customerGstin',
  'paymentMode',
  'paymentReference',
  'notes',
];

/** Check that every id in the header belongs to this tenant. */
async function assertOwnership(companyId, body, transaction) {
  const checks = [
    ['branchId', db.Branch, 'branch'],
    ['warehouseId', db.CompanyWarehouse, 'warehouse'],
    ['customerId', db.Customer, 'customer'],
  ];
  for (const [field, model, label] of checks) {
    if (body[field]) {
      const found = await model.findOne({ where: { id: body[field], companyId }, attributes: ['id'], transaction });
      if (!found) throw ApiError.badRequest(`That ${label} is not one of yours`);
    }
  }
}

/**
 * Write the header, the lines and the totals of a draft — new or existing.
 *
 * Lines are replaced wholesale rather than diffed. A draft is a form somebody is
 * still filling in; the version on screen is the truth, and reconciling line ids
 * would buy nothing but bugs.
 */
async function saveDraft(invoice, body, { companyId, actorId, transaction }) {
  await assertOwnership(companyId, body, transaction);
  const items = await buildItems(companyId, body.items, transaction);
  const totals = computeTotals(items, {
    billDiscountType: body.billDiscountType ?? null,
    billDiscountValue: body.billDiscountValue ?? 0,
    roundOff: body.roundOff !== false,
  });

  const amountPaid = Math.min(Math.max(0, r2(num(body.amountPaid))), totals.grandTotal);

  const header = {};
  HEADER_FIELDS.forEach((field) => {
    if (body[field] !== undefined) header[field] = body[field] === '' ? null : body[field];
  });

  const values = {
    ...header,
    ...totals,
    amountPaid,
    paymentStatus: paymentStatusOf(totals.grandTotal, amountPaid),
    invoiceDate: header.invoiceDate ?? invoice?.invoiceDate ?? new Date().toISOString().slice(0, 10),
    updatedBy: actorId,
  };

  let row = invoice;
  if (row) {
    await row.update(values, { transaction });
    await db.CompanyInvoiceItem.destroy({ where: { invoiceId: row.id }, transaction });
  } else {
    row = await db.CompanyInvoice.create(
      { ...values, companyId, status: INVOICE_STATUS.DRAFT, createdBy: actorId },
      { transaction }
    );
  }

  await db.CompanyInvoiceItem.bulkCreate(
    items.map((item) => ({ ...item, invoiceId: row.id, createdBy: actorId })),
    { transaction }
  );

  return row;
}

/**
 * Make a draft final: number it, lock it, take the stock.
 *
 * The company row is locked first, which serialises every issue for this tenant
 * — numbering and stock-taking then cannot race each other.
 */
async function issue(invoice, { actorId = null, transaction }) {
  if (invoice.status !== INVOICE_STATUS.DRAFT) throw ApiError.badRequest('Only a draft can be issued');

  await lockCompany(invoice.companyId, transaction);

  const items = await db.CompanyInvoiceItem.findAll({ where: { invoiceId: invoice.id }, transaction });
  if (!items.length) throw ApiError.badRequest('Add at least one product before issuing');

  invoice.invoiceNo = await nextInvoiceNo(invoice.companyId, transaction);
  invoice.status = INVOICE_STATUS.ISSUED;
  invoice.issuedAt = new Date();
  invoice.issuedBy = actorId;
  invoice.updatedBy = actorId;
  await invoice.save({ transaction });

  const stock = await deductStock(invoice, items, { actorId, transaction });
  if (stock.applied) {
    invoice.stockApplied = true;
    invoice.warehouseId = stock.warehouseId;
    await invoice.save({ transaction });
  }

  return invoice;
}

/** Void an issued invoice and return its stock. A draft is deleted, not cancelled. */
async function cancel(invoice, { actorId = null, reason = null, transaction }) {
  if (invoice.status !== INVOICE_STATUS.ISSUED) throw ApiError.badRequest('Only an issued invoice can be cancelled');

  await lockCompany(invoice.companyId, transaction);
  await returnStock(invoice, { actorId, transaction });

  invoice.status = INVOICE_STATUS.CANCELLED;
  invoice.cancelledAt = new Date();
  invoice.cancelledBy = actorId;
  invoice.cancelReason = reason || null;
  invoice.stockApplied = false;
  invoice.updatedBy = actorId;
  await invoice.save({ transaction });
  return invoice;
}

/** Record money received against an issued (or draft) invoice. */
async function recordPayment(invoice, { amountPaid, paymentMode, paymentReference, actorId = null, transaction }) {
  if (invoice.status === INVOICE_STATUS.CANCELLED) throw ApiError.badRequest('A cancelled invoice cannot take payment');
  const total = num(invoice.grandTotal);
  const paid = r2(num(amountPaid));
  if (paid < 0) throw ApiError.badRequest('Amount paid cannot be negative');
  if (paid > total + 0.004) throw ApiError.badRequest(`Amount paid cannot be more than the total (${total.toFixed(2)})`);

  invoice.amountPaid = paid;
  invoice.paymentStatus = paymentStatusOf(total, paid);
  if (paymentMode !== undefined) invoice.paymentMode = paymentMode || null;
  if (paymentReference !== undefined) invoice.paymentReference = paymentReference || null;
  invoice.updatedBy = actorId;
  await invoice.save({ transaction });
  return invoice;
}

module.exports = {
  r2,
  discountOn,
  computeLine,
  computeTotals,
  paymentStatusOf,
  sellingPriceOf,
  buildItems,
  nextInvoiceNo,
  warehouseLive,
  deductStock,
  returnStock,
  saveDraft,
  issue,
  cancel,
  recordPayment,
};
