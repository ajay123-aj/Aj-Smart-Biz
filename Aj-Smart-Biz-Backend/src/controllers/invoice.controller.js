'use strict';

const { Op, fn, col } = require('sequelize');
const db = require('../models');
const adminRoles = require('../services/adminRole.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created, paginated } = require('../utils/response');
const { getPagination, buildSearch, getSort, mergeWhere } = require('../utils/query');
const invoiceService = require('../services/invoice.service');
const functionalityService = require('../services/functionality.service');
const stockService = require('../services/stock.service');
const {
  STATUS,
  FUNCTIONALITY,
  INVOICE_STATUS,
  INVOICE_STATUS_CATALOGUE,
  INVOICE_PAYMENT_STATUS_CATALOGUE,
  INVOICE_PAYMENT_MODE_CATALOGUE,
  DISCOUNT_TYPE_CATALOGUE,
  INVOICE_TAX_PRESETS,
} = require('../constants');

/**
 * The tenant's counter invoices.
 *
 * Scoped to `req.auth.companyId` on every query, the way the rest of the admin
 * module is. Writes also require the plan to carry Invoice management
 * (`assertGranted`); reads do not, so a tenant whose plan lapsed can still find
 * and reprint the bills it already issued.
 */

const companyOf = (req) => req.auth.companyId;
const actorOf = (req) => req.auth?.id ?? null;
const assertGranted = (companyId) => functionalityService.assertGranted(companyId, FUNCTIONALITY.INVOICES);

/* ------------------------------------------------------------------ *
 * Whose invoices an admin may see
 *
 * Every admin sees the invoices **they** created. Seeing everyone's takes the
 * "All invoices" grant (`invoices-all`, View) in Menu Permission; the
 * company's main admin always has it. The same rule decides the list, the
 * summary, a single invoice, every write, and the analysis — so an admin can
 * never act on, or report on, a bill they could not open.
 * ------------------------------------------------------------------ */

const ALL_INVOICES_MENU = 'invoices-all';
const ANALYSIS_MENU = 'invoice-analysis';

/** Whether this admin's role may View the menu `slug`. Main admins may view all. */
async function roleCanView(req, slug) {
  if (req.auth?.isCompanyAdmin) return true;
  /* Any of the admin's active roles will do — see adminRole.service. */
  return adminRoles.rolesCan(req.auth.companyId, await adminRoles.authRoleIds(req), slug, 'canView');
}

/** Memoised per request: several handlers ask more than once. */
async function canSeeAll(req) {
  if (req._invoicesAll === undefined) req._invoicesAll = await roleCanView(req, ALL_INVOICES_MENU);
  return req._invoicesAll;
}

/**
 * The `where` that limits a query to what this admin may see.
 *
 * `scope=all` asks for everyone's and is refused (403) without the grant;
 * `scope=mine` — the default — is always the admin's own, even for someone
 * who could see all, so "My invoices" means exactly that for everybody.
 */
async function visibility(req, requested = 'mine') {
  const all = await canSeeAll(req);
  if (requested === 'all') {
    if (!all) throw ApiError.forbidden('You can only see the invoices you created. Ask your admin for the "All invoices" permission.');
    return { companyId: companyOf(req) };
  }
  if (requested === 'any') return all ? { companyId: companyOf(req) } : { companyId: companyOf(req), createdBy: req.auth.id };
  return { companyId: companyOf(req), createdBy: req.auth.id };
}

const CREATOR = { model: db.Admin, as: 'creator', attributes: ['id', 'name', 'email'], required: false, paranoid: false };

const INCLUDES = [
  { model: db.Branch, as: 'branch', attributes: ['id', 'name', 'code'], required: false },
  { model: db.CompanyWarehouse, as: 'warehouse', attributes: ['id', 'name', 'code'], required: false, paranoid: false },
  CREATOR,
];
const ITEMS = { model: db.CompanyInvoiceItem, as: 'items', separate: true, order: [['sequence', 'ASC'], ['id', 'ASC']] };

/**
 * One invoice, within what `req`'s admin may see. An invoice outside that is
 * reported as not found rather than forbidden, so ids cannot be probed.
 */
async function findInvoice(req, id, { transaction, withItems = true } = {}) {
  const where = { ...(await visibility(req, 'any')), id };
  const invoice = await db.CompanyInvoice.findOne({
    where,
    include: [...INCLUDES, ...(withItems ? [ITEMS] : [])],
    transaction,
  });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

/** Reload after a write so the response carries the committed lines and totals. */
const reload = (req, id) => findInvoice(req, id);

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/**
 * GET /admin/company/invoices/meta
 *
 * Everything the billing screen needs that is not an invoice: the catalogues
 * for its pickers, the tenant's branches and warehouses, whether stock will be
 * deducted, and the seller block printed on every invoice.
 */
const meta = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  const [company, branches, warehouses, functionality, stockLive] = await Promise.all([
    db.Company.findByPk(companyId, {
      attributes: ['id', 'name', 'logo', 'email', 'phone', 'gstNumber', 'addressLine1', 'addressLine2', 'city', 'pincode'],
      include: [{ model: db.State, as: 'state', attributes: ['id', 'name'], required: false }],
    }),
    db.Branch.findAll({ where: { companyId, status: STATUS.ACTIVE }, attributes: ['id', 'name', 'code'], order: [['name', 'ASC']] }),
    db.CompanyWarehouse.findAll({
      where: { companyId, status: STATUS.ACTIVE },
      attributes: ['id', 'name', 'code', 'isDefault', 'branchId'],
      order: [['isDefault', 'DESC'], ['sequence', 'ASC'], ['name', 'ASC']],
    }),
    functionalityService.getFunctionality(companyId, FUNCTIONALITY.INVOICES),
    invoiceService.warehouseLive(companyId),
  ]);

  return success(res, {
    message: 'Invoice settings fetched',
    data: {
      granted: Boolean(functionality?.granted),
      active: Boolean(functionality?.active),
      stockTracking: stockLive,
      seller: company,
      branches,
      warehouses,
      statuses: INVOICE_STATUS_CATALOGUE,
      paymentStatuses: INVOICE_PAYMENT_STATUS_CATALOGUE,
      paymentModes: INVOICE_PAYMENT_MODE_CATALOGUE,
      discountTypes: DISCOUNT_TYPE_CATALOGUE,
      taxPresets: INVOICE_TAX_PRESETS,
    },
  });
});

/**
 * GET /admin/company/invoices/products
 *
 * The product picker. Active products matching the search, each with the price
 * it will be billed at and — when stock is tracked — how many are sellable in
 * the warehouse the invoice will draw from, so the counter sees "3 left" before
 * it tries to bill four.
 */
const products = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  const where = mergeWhere(
    { companyId, status: STATUS.ACTIVE },
    buildSearch(req.query.search, ['name', 'sku'])
  );

  const rows = await db.CompanyProduct.findAll({
    where,
    attributes: ['id', 'name', 'sku', 'price', 'offerPrice', 'priceLabel', 'images', 'trackInventory', 'stockStatus'],
    order: [['name', 'ASC']],
    limit: req.query.limit ?? 20,
  });

  const stockLive = await invoiceService.warehouseLive(companyId);
  let warehouse = null;
  let levels = new Map();
  if (stockLive) {
    warehouse = req.query.warehouseId
      ? await db.CompanyWarehouse.findOne({ where: { id: req.query.warehouseId, companyId, status: STATUS.ACTIVE } })
      : await stockService.defaultWarehouse(companyId, req.query.branchId ?? null);
    if (warehouse) {
      const stock = await db.CompanyStock.findAll({
        where: { warehouseId: warehouse.id, productId: { [Op.in]: rows.map((row) => row.id) } },
        attributes: ['productId', 'quantity', 'reserved'],
      });
      levels = new Map(stock.map((s) => [s.productId, s.quantity - s.reserved]));
    }
  }

  const data = rows.map((product) => {
    const { sellingPrice, listPrice } = invoiceService.sellingPriceOf(product);
    const tracked = stockLive && product.trackInventory;
    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      image: Array.isArray(product.images) && product.images.length ? product.images[0] : null,
      sellingPrice,
      listPrice,
      priceLabel: product.priceLabel,
      trackInventory: tracked,
      available: tracked ? Math.max(0, levels.get(product.id) ?? 0) : null,
    };
  });

  return success(res, {
    message: 'Products fetched',
    data,
    meta: { warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null, stockTracking: stockLive },
  });
});

/** GET /admin/company/invoices/summary — today, this month, and what is owed. */
const summary = asyncHandler(async (req, res) => {
  const base = await visibility(req, req.query.scope === 'all' ? 'all' : 'mine');
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const totalsFor = (extra) =>
    db.CompanyInvoice.findOne({
      where: { ...base, status: INVOICE_STATUS.ISSUED, ...extra },
      attributes: [
        [fn('COUNT', col('id')), 'count'],
        [fn('COALESCE', fn('SUM', col('grand_total')), 0), 'total'],
        [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'paid'],
        [fn('COALESCE', fn('SUM', col('bill_discount')), 0), 'billDiscount'],
        [fn('COALESCE', fn('SUM', col('item_discount')), 0), 'itemDiscount'],
      ],
      raw: true,
    });

  const [todayRow, monthRow, allRow, drafts] = await Promise.all([
    totalsFor({ invoiceDate: today }),
    totalsFor({ invoiceDate: { [Op.gte]: monthStart } }),
    totalsFor({}),
    db.CompanyInvoice.count({ where: { ...base, status: INVOICE_STATUS.DRAFT } }),
  ]);

  const shape = (row) => ({
    count: Number(row?.count ?? 0),
    total: Number(row?.total ?? 0),
    collected: Number(row?.paid ?? 0),
    discount: Number(row?.billDiscount ?? 0) + Number(row?.itemDiscount ?? 0),
  });

  const all = shape(allRow);
  return success(res, {
    message: 'Invoice summary fetched',
    data: {
      today: shape(todayRow),
      month: shape(monthRow),
      outstanding: Math.max(0, invoiceService.r2(all.total - all.collected)),
      drafts,
      scope: base.createdBy ? 'mine' : 'all',
    },
  });
});

/** GET /admin/company/invoices */
const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);

  const scope = await visibility(req, req.query.scope === 'all' ? 'all' : 'mine');
  /* Narrow "All invoices" to one admin's — only meaningful when seeing all. */
  if (!scope.createdBy && req.query.createdBy) scope.createdBy = req.query.createdBy;
  if (req.query.status) scope.status = req.query.status;
  if (req.query.paymentStatus) scope.paymentStatus = req.query.paymentStatus;
  if (req.query.branchId) scope.branchId = req.query.branchId;
  if (req.query.from || req.query.to) {
    scope.invoiceDate = {
      ...(req.query.from ? { [Op.gte]: new Date(req.query.from).toISOString().slice(0, 10) } : {}),
      ...(req.query.to ? { [Op.lte]: new Date(req.query.to).toISOString().slice(0, 10) } : {}),
    };
  }

  const result = await db.CompanyInvoice.findAndCountAll({
    where: mergeWhere(scope, buildSearch(req.query.search, ['invoice_no', 'customer_name', 'customer_phone'])),
    include: INCLUDES,
    order: getSort(req.query, ['invoice_date', 'grand_total', 'invoice_no', 'created_at'], [['id', 'DESC']]),
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, result, { page, limit }, 'Invoices fetched');
});

/** GET /admin/company/invoices/:id */
const getById = asyncHandler(async (req, res) => {
  const invoice = await findInvoice(req, req.params.id);
  return success(res, { message: 'Invoice fetched', data: invoice });
});

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** POST /admin/company/invoices — save a draft, or save and issue with `issue: true`. */
const create = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  await assertGranted(companyId);
  const actorId = actorOf(req);

  const id = await db.sequelize.transaction(async (transaction) => {
    const invoice = await invoiceService.saveDraft(null, req.body, { companyId, actorId, transaction });
    if (req.body.issue) await invoiceService.issue(invoice, { actorId, transaction });
    return invoice.id;
  });

  return created(res, req.body.issue ? 'Invoice issued' : 'Draft saved', await reload(req, id));
});

/** PUT /admin/company/invoices/:id — only a draft can change. */
const update = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  await assertGranted(companyId);
  const actorId = actorOf(req);

  await db.sequelize.transaction(async (transaction) => {
    const invoice = await findInvoice(req, req.params.id, { transaction, withItems: false });
    if (invoice.status !== INVOICE_STATUS.DRAFT) {
      throw ApiError.badRequest('An issued invoice cannot be edited. Cancel it and create a new one.');
    }
    await invoiceService.saveDraft(invoice, req.body, { companyId, actorId, transaction });
    if (req.body.issue) await invoiceService.issue(invoice, { actorId, transaction });
  });

  return success(res, {
    message: req.body.issue ? 'Invoice issued' : 'Draft saved',
    data: await reload(req, req.params.id),
  });
});

/** POST /admin/company/invoices/:id/issue */
const issue = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  await assertGranted(companyId);

  await db.sequelize.transaction(async (transaction) => {
    const invoice = await findInvoice(req, req.params.id, { transaction, withItems: false });
    await invoiceService.issue(invoice, { actorId: actorOf(req), transaction });
  });

  return success(res, { message: 'Invoice issued', data: await reload(req, req.params.id) });
});

/** PATCH /admin/company/invoices/:id/payment */
const payment = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);

  await db.sequelize.transaction(async (transaction) => {
    const invoice = await findInvoice(req, req.params.id, { transaction, withItems: false });
    await invoiceService.recordPayment(invoice, { ...req.body, actorId: actorOf(req), transaction });
  });

  return success(res, { message: 'Payment recorded', data: await reload(req, req.params.id) });
});

/** POST /admin/company/invoices/:id/cancel — voids an issued invoice and returns its stock. */
const cancel = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);

  await db.sequelize.transaction(async (transaction) => {
    const invoice = await findInvoice(req, req.params.id, { transaction, withItems: false });
    await invoiceService.cancel(invoice, { actorId: actorOf(req), reason: req.body.reason, transaction });
  });

  return success(res, { message: 'Invoice cancelled and stock returned', data: await reload(req, req.params.id) });
});

/** DELETE /admin/company/invoices/:id — drafts only; issued invoices are cancelled, never deleted. */
const remove = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  const invoice = await findInvoice(req, req.params.id, { withItems: false });
  if (invoice.status !== INVOICE_STATUS.DRAFT) {
    throw ApiError.badRequest('Only a draft can be deleted. Cancel an issued invoice instead.');
  }
  await db.sequelize.transaction(async (transaction) => {
    await db.CompanyInvoiceItem.destroy({ where: { invoiceId: invoice.id }, transaction });
    await invoice.destroy({ transaction });
  });
  return success(res, { message: 'Draft deleted' });
});

/* ------------------------------------------------------------------ *
 * Who and what — the filters and the reports
 * ------------------------------------------------------------------ */

/**
 * GET /admin/company/invoices/access
 *
 * What this admin may do here, so the console can show the right tabs:
 * `canSeeAll` (the "All invoices" grant) and `canAnalyse` (the analysis
 * screen), plus — when they may see all — the admins who have raised
 * invoices, for the "Created by" filter.
 */
const access = asyncHandler(async (req, res) => {
  const companyId = companyOf(req);
  const [all, analyse] = await Promise.all([canSeeAll(req), roleCanView(req, ANALYSIS_MENU)]);

  let admins = [];
  if (all) {
    admins = await db.Admin.findAll({
      where: { companyId },
      attributes: ['id', 'name', 'email', 'status'],
      order: [['name', 'ASC']],
      paranoid: false,
    });
  }

  return success(res, {
    message: 'Invoice access fetched',
    data: { me: { id: req.auth.id, name: req.auth.name }, canSeeAll: all, canAnalyse: analyse, admins },
  });
});

/** `YYYY-MM-DD`, or null for anything that is not a date. */
const dateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const num = (value) => Number(value ?? 0) || 0;

/**
 * GET /admin/company/invoices/analysis?from=&to=&scope=&createdBy=&branchId=
 *
 * The reports screen, in one request: headline totals, revenue over time,
 * product-wise, admin-wise, payment mode, payment status and branch.
 *
 * Only **issued** invoices count — a draft is not a sale and a cancelled
 * invoice was undone. Defaults to the last 30 days. Limited, like everything
 * here, to the invoices this admin may see; `scope=all` needs the grant.
 */
const analysis = asyncHandler(async (req, res) => {
  if (!(await roleCanView(req, ANALYSIS_MENU))) {
    throw ApiError.forbidden('You do not have access to invoice analysis.');
  }

  const today = new Date().toISOString().slice(0, 10);
  const to = dateOnly(req.query.to) ?? today;
  const from = dateOnly(req.query.from) ?? new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
  if (from > to) throw ApiError.badRequest('"From" must be on or before "To".');

  const where = await visibility(req, req.query.scope === 'all' ? 'all' : 'mine');
  if (!where.createdBy && req.query.createdBy) where.createdBy = Number(req.query.createdBy);
  if (req.query.branchId) where.branchId = Number(req.query.branchId);
  Object.assign(where, { status: INVOICE_STATUS.ISSUED, invoiceDate: { [Op.between]: [from, to] } });

  /* Days apart; past ~two months a daily chart is noise, so it goes monthly. */
  const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const monthly = spanDays > 62;
  const bucket = monthly ? fn('DATE_FORMAT', col('invoice_date'), '%Y-%m') : col('invoice_date');

  const money = [
    [fn('COUNT', col('CompanyInvoice.id')), 'invoices'],
    [fn('COALESCE', fn('SUM', col('grand_total')), 0), 'revenue'],
    [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'collected'],
  ];

  const [totalsRow, trendRows, adminRows, modeRows, statusRows, branchRows, productRows] = await Promise.all([
    db.CompanyInvoice.findOne({
      where,
      attributes: [
        ...money,
        [fn('COALESCE', fn('SUM', col('item_discount')), 0), 'itemDiscount'],
        [fn('COALESCE', fn('SUM', col('bill_discount')), 0), 'billDiscount'],
        [fn('COALESCE', fn('SUM', col('tax_total')), 0), 'tax'],
        [fn('COALESCE', fn('SUM', col('item_count')), 0), 'items'],
        [fn('COUNT', fn('DISTINCT', col('customer_phone'))), 'customers'],
      ],
      raw: true,
    }),
    db.CompanyInvoice.findAll({
      where,
      attributes: [[bucket, 'period'], ...money],
      group: [bucket],
      order: [[bucket, 'ASC']],
      raw: true,
    }),
    db.CompanyInvoice.findAll({
      where,
      attributes: ['createdBy', ...money],
      include: [{ ...CREATOR, attributes: ['id', 'name', 'email'] }],
      group: [col('CompanyInvoice.created_by'), col('creator.id')],
      order: [[fn('SUM', col('grand_total')), 'DESC']],
      raw: true,
      nest: true,
    }),
    db.CompanyInvoice.findAll({
      where,
      attributes: ['paymentMode', ...money],
      group: [col('CompanyInvoice.payment_mode')],
      raw: true,
    }),
    db.CompanyInvoice.findAll({
      where,
      attributes: ['paymentStatus', ...money],
      group: [col('CompanyInvoice.payment_status')],
      raw: true,
    }),
    db.CompanyInvoice.findAll({
      where,
      attributes: ['branchId', ...money],
      include: [{ model: db.Branch, as: 'branch', attributes: ['id', 'name'], required: false }],
      group: [col('CompanyInvoice.branch_id'), col('branch.id')],
      order: [[fn('SUM', col('grand_total')), 'DESC']],
      raw: true,
      nest: true,
    }),
    /* Product-wise, from the lines of the same invoices. */
    db.CompanyInvoiceItem.findAll({
      attributes: [
        'productId',
        [fn('MAX', col('product_name')), 'name'],
        [fn('MAX', col('product_sku')), 'sku'],
        [fn('COALESCE', fn('SUM', col('quantity')), 0), 'quantity'],
        [fn('COALESCE', fn('SUM', col('line_total')), 0), 'revenue'],
        [fn('COALESCE', fn('SUM', col('CompanyInvoiceItem.discount')), 0), 'discount'],
        [fn('COUNT', fn('DISTINCT', col('invoice_id'))), 'invoices'],
      ],
      include: [{ model: db.CompanyInvoice, as: 'invoice', where, attributes: [], required: true }],
      group: [col('CompanyInvoiceItem.product_id'), fn('COALESCE', col('CompanyInvoiceItem.product_id'), col('CompanyInvoiceItem.product_name'))],
      order: [[fn('SUM', col('line_total')), 'DESC']],
      limit: 50,
      raw: true,
      subQuery: false,
    }),
  ]);

  const revenue = num(totalsRow?.revenue);
  const collected = num(totalsRow?.collected);
  const count = num(totalsRow?.invoices);
  const share = (value) => (revenue > 0 ? Math.round((value / revenue) * 1000) / 10 : 0);
  const modeName = new Map(INVOICE_PAYMENT_MODE_CATALOGUE.map((m) => [m.key, m.name]));
  const statusName = new Map(INVOICE_PAYMENT_STATUS_CATALOGUE.map((m) => [m.key, m.name]));
  const line = (row) => ({
    invoices: num(row.invoices),
    revenue: num(row.revenue),
    collected: num(row.collected),
    share: share(num(row.revenue)),
  });

  return success(res, {
    message: 'Invoice analysis fetched',
    data: {
      range: { from, to, days: spanDays, granularity: monthly ? 'month' : 'day' },
      scope: where.createdBy && !req.query.createdBy ? 'mine' : 'all',
      totals: {
        invoices: count,
        revenue,
        collected,
        outstanding: Math.max(0, invoiceService.r2(revenue - collected)),
        discount: num(totalsRow?.itemDiscount) + num(totalsRow?.billDiscount),
        tax: num(totalsRow?.tax),
        itemsSold: num(totalsRow?.items),
        customers: num(totalsRow?.customers),
        averageBill: count ? invoiceService.r2(revenue / count) : 0,
        collectionRate: revenue > 0 ? Math.round((collected / revenue) * 1000) / 10 : 0,
      },
      trend: trendRows.map((row) => ({ period: String(row.period), ...line(row) })),
      byProduct: productRows.map((row) => ({
        productId: row.productId ?? null,
        name: row.name,
        sku: row.sku ?? null,
        quantity: num(row.quantity),
        revenue: num(row.revenue),
        discount: num(row.discount),
        invoices: num(row.invoices),
        share: share(num(row.revenue)),
      })),
      byAdmin: adminRows.map((row) => ({
        adminId: row.createdBy ?? null,
        name: row.creator?.name ?? (row.createdBy ? `Admin #${row.createdBy}` : 'Unknown'),
        email: row.creator?.email ?? null,
        ...line(row),
        averageBill: num(row.invoices) ? invoiceService.r2(num(row.revenue) / num(row.invoices)) : 0,
      })),
      byPaymentMode: modeRows
        .map((row) => ({ key: row.paymentMode ?? 'none', name: modeName.get(row.paymentMode) ?? 'Not recorded', ...line(row) }))
        .sort((a, b) => b.revenue - a.revenue),
      byPaymentStatus: statusRows
        .map((row) => ({ key: row.paymentStatus, name: statusName.get(row.paymentStatus) ?? row.paymentStatus, ...line(row) }))
        .sort((a, b) => b.revenue - a.revenue),
      byBranch: branchRows.map((row) => ({
        branchId: row.branchId ?? null,
        name: row.branch?.name ?? 'No branch',
        ...line(row),
      })),
    },
  });
});

module.exports = { meta, products, summary, list, getById, create, update, issue, payment, cancel, remove, access, analysis };
