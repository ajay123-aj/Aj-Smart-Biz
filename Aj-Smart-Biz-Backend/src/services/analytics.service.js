'use strict';

const { Op, fn, col, literal, where: sqlWhere } = require('sequelize');
const db = require('../models');
const { dayExpression } = require('../config/database');
const {
  STATUS,
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_PAYMENT_STATUS,
  ORDER_PAYMENT_STATUS_VALUES,
  OPEN_ORDER_STATUSES,
  STOCK_MOVEMENT_TYPE,
  STOCK_REASON,
  ANALYTICS_RANGES,
  ANALYTICS_RANGE_DEFAULT,
  ANALYTICS_TOP_LIMIT,
  LEAD_STAGE,
  LEAD_STAGE_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
} = require('../constants');

/**
 * What the numbers say — about what sold, and about what is on the shelf.
 *
 * ### Two principles, and they are the same principle twice
 *
 * **Cancelled orders are not sales.** Every revenue figure here counts orders
 * that were not cancelled, and nothing else. It is tempting to count everything
 * that arrived because the number is bigger and the query is simpler; it is also
 * how a business ends up planning against money it refunded.
 *
 * **A total that cannot include everything says so.** A catalogue may price in
 * words, and those lines are real parts of real orders that cannot be added up.
 * Every revenue figure is therefore accompanied by `unpricedItems`, and nothing
 * here treats a missing price as zero. The alternative — a revenue number that
 * quietly under-counts by however much the quoted work came to — is worse than a
 * number with a caveat on it.
 *
 * ### Why the series is filled in here
 *
 * `GROUP BY day` returns only the days something happened, so a chart drawn
 * straight from it shows a fortnight of trading as four bars in a row and lies
 * about the shape of the week. The gaps are filled with zeroes before the data
 * leaves, because a browser that filled them itself would be a browser that has
 * to know the tenant's timezone and the window's arithmetic — and there are
 * three consoles that would each have to get it right.
 */

/** One of the offered windows, or the default. Never a number a client invented. */
const rangeOf = (value) => {
  const days = Number(value);
  return ANALYTICS_RANGES.includes(days) ? days : ANALYTICS_RANGE_DEFAULT;
};

/** Midnight, `days` ago. Local midnight, so "last 7 days" means seven whole days. */
function since(days) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

/** `YYYY-MM-DD` for a date, in the same shape the SQL expression produces. */
const dayKey = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Every day in the window, in order, with whatever was found against it.
 *
 * See the note above for why this is done here rather than in a chart component.
 */
function fillDays(days, rows, shape) {
  const found = new Map(rows.map((row) => [String(row.day), row]));
  const series = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    date.setHours(0, 0, 0, 0);

    const key = dayKey(date);
    series.push(shape(key, found.get(key) ?? null));
  }

  return series;
}

/** Zero rather than null, and a real number rather than a decimal string. */
const num = (value) => Number(value || 0);

/* ------------------------------------------------------------------ *
 * Sales
 * ------------------------------------------------------------------ */

/**
 * How the shop is trading.
 *
 * `where` is built once and shared by every query below, so a branch filter
 * cannot apply to the totals and quietly miss the chart.
 */
async function salesAnalytics(companyId, { days: wanted, branchId = null } = {}) {
  const days = rangeOf(wanted);
  const from = since(days);

  const scope = { companyId, createdAt: { [Op.gte]: from } };
  if (branchId === 'none' || branchId === 'null') scope.branchId = null;
  else if (branchId) scope.branchId = Number(branchId);

  /** Sales, as opposed to everything that arrived. See the note at the top. */
  const sold = { ...scope, status: { [Op.ne]: ORDER_STATUS.CANCELLED } };

  const [totals, byStatus, byPayment, daily, topProducts, recent, openCount, lifetime] =
    await Promise.all([
      db.CompanyOrder.findOne({
        where: sold,
        attributes: [
          [fn('COUNT', col('id')), 'orders'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
          [fn('COALESCE', fn('SUM', col('item_count')), 0), 'units'],
          [fn('COALESCE', fn('SUM', col('unpriced_items')), 0), 'unpricedItems'],
        ],
        raw: true,
      }),

      /* Counted over everything in the window, cancellations included — this is
         the breakdown that has to add up to what arrived, and a cancellation
         rate is one of the few numbers here worth watching. */
      db.CompanyOrder.findAll({
        where: scope,
        attributes: ['status', [fn('COUNT', col('id')), 'total']],
        group: ['status'],
        raw: true,
      }),

      db.CompanyOrder.findAll({
        where: sold,
        attributes: [
          'paymentStatus',
          [fn('COUNT', col('id')), 'total'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'amount'],
        ],
        group: ['paymentStatus'],
        raw: true,
      }),

      db.CompanyOrder.findAll({
        where: sold,
        attributes: [
          [literal(dayExpression('created_at')), 'day'],
          [fn('COUNT', col('id')), 'orders'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
        ],
        group: [literal(dayExpression('created_at'))],
        order: [literal(dayExpression('created_at') + ' ASC')],
        raw: true,
      }),

      /**
       * Best sellers, by **units** rather than by revenue.
       *
       * Both are worth knowing and the row carries both, but units is the
       * default sort because it answers the question a shop actually has: what
       * am I going to run out of. Sorting by revenue puts the single expensive
       * thing at the top of a list whose purpose is re-ordering.
       *
       * Grouped by the copied name rather than by `productId`, so a product that
       * has since been deleted still appears as what it was called — which is
       * the whole reason the name is on the line.
       */
      db.CompanyOrderItem.findAll({
        attributes: [
          'productId',
          'productName',
          [fn('COALESCE', fn('SUM', col('CompanyOrderItem.quantity')), 0), 'units'],
          [fn('COALESCE', fn('SUM', col('line_total')), 0), 'revenue'],
        ],
        include: [
          {
            model: db.CompanyOrder,
            as: 'order',
            attributes: [],
            where: sold,
            required: true,
          },
        ],
        group: ['CompanyOrderItem.product_id', 'CompanyOrderItem.product_name'],
        order: [[literal('units'), 'DESC']],
        limit: ANALYTICS_TOP_LIMIT,
        raw: true,
      }),

      db.CompanyOrder.findAll({
        where: scope,
        attributes: [
          'id', 'orderNo', 'status', 'paymentStatus', 'customerName',
          'itemCount', 'total', 'currency', 'createdAt',
        ],
        order: [['id', 'DESC']],
        limit: 8,
        raw: true,
      }),

      /* Not windowed. "How many are waiting on somebody" is a question about
         now, and an open order from five weeks ago is the one that matters
         most — a count that dropped it because it fell out of the window would
         be the opposite of useful. */
      db.CompanyOrder.count({
        where: {
          companyId,
          status: { [Op.in]: OPEN_ORDER_STATUSES },
          ...(scope.branchId !== undefined ? { branchId: scope.branchId } : {}),
        },
      }),

      db.CompanyOrder.findOne({
        where: { companyId, status: { [Op.ne]: ORDER_STATUS.CANCELLED } },
        attributes: [
          [fn('COUNT', col('id')), 'orders'],
          [fn('COALESCE', fn('SUM', col('total')), 0), 'revenue'],
        ],
        raw: true,
      }),
    ]);

  const orders = num(totals?.orders);
  const revenue = num(totals?.revenue);

  /** Every status, including the ones nothing landed on — a breakdown with
      gaps in it reads as a breakdown that failed rather than as a quiet week. */
  const statusCounts = Object.fromEntries(ORDER_STATUS_VALUES.map((key) => [key, 0]));
  byStatus.forEach((row) => {
    statusCounts[row.status] = num(row.total);
  });

  const paymentCounts = Object.fromEntries(
    ORDER_PAYMENT_STATUS_VALUES.map((key) => [key, { orders: 0, amount: 0 }])
  );
  byPayment.forEach((row) => {
    paymentCounts[row.paymentStatus] = { orders: num(row.total), amount: num(row.amount) };
  });

  return {
    range: { days, from, to: new Date() },

    totals: {
      orders,
      revenue,
      units: num(totals?.units),
      /** The lines the platform could not price. See the note at the top. */
      unpricedItems: num(totals?.unpricedItems),
      /** Zero orders is zero, not a division by it. */
      averageOrderValue: orders ? Number((revenue / orders).toFixed(2)) : 0,
      cancelled: statusCounts[ORDER_STATUS.CANCELLED] ?? 0,
      open: openCount,
      awaitingPayment: paymentCounts[ORDER_PAYMENT_STATUS.UNPAID]?.amount ?? 0,
    },

    lifetime: { orders: num(lifetime?.orders), revenue: num(lifetime?.revenue) },

    byStatus: statusCounts,
    byPayment: paymentCounts,

    daily: fillDays(days, daily, (day, row) => ({
      day,
      orders: num(row?.orders),
      revenue: num(row?.revenue),
    })),

    topProducts: topProducts.map((row) => ({
      productId: row.productId ?? null,
      name: row.productName,
      units: num(row.units),
      revenue: num(row.revenue),
    })),

    recent: recent.map((row) => ({ ...row, total: num(row.total) })),
  };
}

/* ------------------------------------------------------------------ *
 * Stock
 * ------------------------------------------------------------------ */

/**
 * What is on the shelves, what is about to run out, and what has been moving.
 *
 * ### The two valuations, and why there are two
 *
 * `retailValue` is the stock at what the catalogue sells it for; `costValue` is
 * the stock at what it was last bought for. They answer different questions —
 * what this is worth to sell, and how much money is tied up — and a business
 * needs both. The cost one is only as good as the `unitCost` typed onto
 * receipts, so `costCoverage` reports how much of the stock actually has a cost
 * against it. A valuation that silently treated the rest as free would be a
 * number nobody should act on.
 */
async function stockAnalytics(companyId, { days: wanted, warehouseId = null } = {}) {
  const days = rangeOf(wanted);
  const from = since(days);

  const scope = { companyId };
  if (warehouseId) scope.warehouseId = Number(warehouseId);

  const [levels, byWarehouse, movements, topMoving, lastCosts] = await Promise.all([
    /**
     * Every level with its product, loaded rather than aggregated in SQL.
     *
     * A tenant's stock is bounded by its catalogue times its warehouses — a few
     * thousand rows at the outside — and the three things wanted from it (a
     * valuation, a low list and an out list) each need the product's price and
     * reorder level alongside the quantity. Three aggregate queries with the
     * same join would cost more than one read.
     */
    db.CompanyStock.findAll({
      where: scope,
      include: [
        {
          model: db.CompanyProduct,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'slug', 'price', 'offerPrice', 'trackInventory', 'status'],
          required: true,
        },
        { model: db.CompanyWarehouse, as: 'warehouse', attributes: ['id', 'name', 'code'], required: false },
      ],
    }),

    db.CompanyStock.findAll({
      where: { companyId },
      attributes: [
        'warehouseId',
        [fn('COALESCE', fn('SUM', col('quantity')), 0), 'onHand'],
        [fn('COALESCE', fn('SUM', col('reserved')), 0), 'reserved'],
        [fn('COUNT', col('CompanyStock.id')), 'lines'],
      ],
      include: [
        { model: db.CompanyWarehouse, as: 'warehouse', attributes: ['id', 'name', 'code'], required: false },
      ],
      group: ['CompanyStock.warehouse_id', 'warehouse.id'],
      raw: true,
      nest: true,
    }),

    db.CompanyStockMovement.findAll({
      where: { ...scope, createdAt: { [Op.gte]: from } },
      attributes: [
        [literal(dayExpression('created_at')), 'day'],
        'type',
        [fn('COALESCE', fn('SUM', col('quantity')), 0), 'quantity'],
      ],
      group: [literal(dayExpression('created_at')), 'type'],
      raw: true,
    }),

    /** What is actually leaving, which is the half of movement worth ranking. */
    db.CompanyStockMovement.findAll({
      where: {
        ...scope,
        createdAt: { [Op.gte]: from },
        type: STOCK_MOVEMENT_TYPE.OUT,
        reason: STOCK_REASON.SALE,
      },
      attributes: [
        'productId',
        [fn('COALESCE', fn('SUM', col('CompanyStockMovement.quantity')), 0), 'units'],
      ],
      include: [
        { model: db.CompanyProduct, as: 'product', attributes: ['id', 'name', 'sku'], required: false },
      ],
      group: ['CompanyStockMovement.product_id', 'product.id'],
      order: [[literal('units'), 'DESC']],
      limit: ANALYTICS_TOP_LIMIT,
      raw: true,
      nest: true,
    }),

    /**
     * The most recent cost seen for each product, for the cost valuation.
     *
     * `MAX(unit_cost)` over receipts rather than a true last-in price: a moving
     * average or a real FIFO layer is a different feature with its own table,
     * and pretending a rough figure is an accounting valuation is worse than
     * saying plainly that this is the highest price the shop has paid.
     */
    db.CompanyStockMovement.findAll({
      where: { ...scope, unitCost: { [Op.ne]: null }, type: STOCK_MOVEMENT_TYPE.IN },
      attributes: ['productId', [fn('MAX', col('unit_cost')), 'cost']],
      group: ['product_id'],
      raw: true,
    }),
  ]);

  const costOf = new Map(lastCosts.map((row) => [row.productId, num(row.cost)]));

  let onHand = 0;
  let reserved = 0;
  let retailValue = 0;
  let costValue = 0;
  let costedUnits = 0;

  const low = [];
  const out = [];

  levels.forEach((row) => {
    const product = row.product;
    const available = row.quantity - row.reserved;

    onHand += row.quantity;
    reserved += row.reserved;

    /* What it sells for today, resolved the way the catalogue resolves it. A
       product priced only in words contributes nothing to the valuation, which
       is honest: nobody knows what it is worth until it is quoted. */
    const price =
      product.offerPrice !== null && product.offerPrice !== undefined
        ? num(product.offerPrice)
        : num(product.price);
    retailValue += price * row.quantity;

    const cost = costOf.get(product.id);
    if (cost) {
      costValue += cost * row.quantity;
      costedUnits += row.quantity;
    }

    const entry = {
      productId: product.id,
      name: product.name,
      sku: product.sku ?? null,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse?.name ?? null,
      quantity: row.quantity,
      reserved: row.reserved,
      available,
      reorderLevel: row.reorderLevel,
    };

    /* Out first, so a product that is both out and under its reorder level is
       reported once, in the list that needs acting on today. */
    if (available <= 0) out.push(entry);
    else if (row.reorderLevel > 0 && available <= row.reorderLevel) low.push(entry);
  });

  /* Worst first in both lists — the point of them is the top of the list. */
  low.sort((a, b) => a.available - b.available);
  out.sort((a, b) => a.name.localeCompare(b.name));

  const byDay = new Map();
  movements.forEach((row) => {
    const entry = byDay.get(row.day) ?? { day: row.day, in: 0, out: 0, adjust: 0 };
    entry[row.type] = num(row.quantity);
    byDay.set(row.day, entry);
  });

  return {
    range: { days, from, to: new Date() },

    totals: {
      /** Distinct (warehouse, product) pairs that have ever been counted. */
      lines: levels.length,
      /** How many distinct products are being tracked at all. */
      products: new Set(levels.map((row) => row.productId)).size,
      onHand,
      reserved,
      available: onHand - reserved,
      lowCount: low.length,
      outCount: out.length,
      retailValue: Number(retailValue.toFixed(2)),
      costValue: Number(costValue.toFixed(2)),
      /**
       * The share of stock that has a real cost behind it. Reported so nobody
       * reads `costValue` as complete when half the shelf arrived before anyone
       * started typing costs in.
       */
      costCoverage: onHand ? Math.round((costedUnits / onHand) * 100) : 0,
    },

    byWarehouse: byWarehouse.map((row) => ({
      warehouseId: row.warehouseId,
      name: row.warehouse?.name ?? 'Unassigned',
      code: row.warehouse?.code ?? null,
      onHand: num(row.onHand),
      reserved: num(row.reserved),
      available: num(row.onHand) - num(row.reserved),
      lines: num(row.lines),
    })),

    movements: fillDays(days, [...byDay.values()], (day, row) => ({
      day,
      in: num(row?.in),
      out: num(row?.out),
      adjust: num(row?.adjust),
    })),

    topMoving: topMoving.map((row) => ({
      productId: row.productId,
      name: row.product?.name ?? 'Deleted product',
      sku: row.product?.sku ?? null,
      units: num(row.units),
    })),

    low: low.slice(0, ANALYTICS_TOP_LIMIT),
    out: out.slice(0, ANALYTICS_TOP_LIMIT),
  };
}

/* ------------------------------------------------------------------ *
 * Services
 * ------------------------------------------------------------------ */

/**
 * How the service side of the business is doing.
 *
 * The third of these, and shaped like the other two on purpose: one window, one
 * scope built once and shared, a gap-filled daily series, and totals that the
 * breakdowns add up to. A screen that draws sales and services from two
 * differently-shaped payloads ends up drawing them two different ways.
 *
 * ### What it counts that the orders one cannot
 *
 * An order is a sale: it happened, it has a total, and the only question is
 * whether it was cancelled. A service enquiry is a **conversation**, and the
 * useful questions are different ones:
 *
 *   how many asked          demand, and whether it is growing
 *   how many turned into    the conversion rate, which is the number a service
 *   work                    business actually manages
 *   what was quoted, won    three figures, never one: quoted is the pipeline,
 *   and collected           won is what was agreed, collected is money in. The
 *                           gap between the last two is what somebody has to
 *                           chase
 *   how many wanted a time  and how many of those were confirmed - the diary's
 *                           own half, which lives on the same rows
 *
 * `amount` is the only number on the table and it is **nullable**, because a
 * service is priced in words until somebody has looked at the job. Every figure
 * here is therefore built from the rows that actually carry one, and the ones
 * that do not are reported separately rather than counted as zero - an average
 * quote dragged toward nothing by forty unquoted enquiries is worse than no
 * average at all.
 */
async function serviceAnalytics(companyId, { days: wanted, branchId = null } = {}) {
  const days = rangeOf(wanted);
  const from = since(days);

  const scope = { companyId, createdAt: { [Op.gte]: from } };
  if (branchId === 'none' || branchId === 'null') scope.branchId = null;
  else if (branchId) scope.branchId = Number(branchId);

  /** Only the rows somebody has actually put a figure on. */
  const priced = { ...scope, amount: { [Op.ne]: null } };

  const money = async (where) => {
    const row = await db.ServiceLead.findOne({
      where: { ...priced, ...where },
      attributes: [
        [fn('COUNT', col('id')), 'count'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'total'],
      ],
      raw: true,
    });
    return { count: num(row?.count), total: num(row?.total) };
  };

  const [
    total,
    unquoted,
    quoted,
    won,
    collected,
    byStage,
    byBooking,
    daily,
    topServices,
    bookingDaily,
    lifetime,
  ] = await Promise.all([
    db.ServiceLead.count({ where: scope }),
    db.ServiceLead.count({ where: { ...scope, amount: null } }),

    money({}),
    money({ stage: LEAD_STAGE.CONVERTED }),
    money({ paymentStatus: ORDER_PAYMENT_STATUS.PAID }),

    db.ServiceLead.findAll({
      where: scope,
      attributes: ['stage', [fn('COUNT', col('id')), 'total']],
      group: ['stage'],
      raw: true,
    }),

    /* Bookings only - `booking_status` is null on an enquiry that asked no
       time, and grouping those in would put most of the table in one bar. */
    db.ServiceLead.findAll({
      where: { ...scope, bookingStatus: { [Op.ne]: null } },
      attributes: ['bookingStatus', [fn('COUNT', col('id')), 'total']],
      group: ['booking_status'],
      raw: true,
    }),

    /**
     * The day somebody **asked**, not the day they want an appointment.
     *
     * This series is demand: how many conversations started, and what they were
     * worth. The diary's own shape - which days people want to come in - is the
     * series below it, and conflating the two would make a quiet week look busy
     * because it happened to be when next month's bookings were taken.
     */
    db.ServiceLead.findAll({
      where: scope,
      attributes: [
        /* Wrapped in `literal`, like the sales and stock series: Sequelize 6
           refuses a raw attribute containing parentheses, and every one of these
           expressions has them. */
        [literal(dayExpression('created_at')), 'day'],
        [fn('COUNT', col('id')), 'enquiries'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'amount'],
      ],
      group: [literal(dayExpression('created_at'))],
      order: [literal(dayExpression('created_at') + ' ASC')],
      raw: true,
    }),

    /**
     * Which services people actually ask about.
     *
     * Grouped by the **copied title**, so a service renamed or deleted since
     * still appears as what it was called when somebody asked - the whole reason
     * that column is on the row rather than joined.
     */
    db.ServiceLead.findAll({
      where: scope,
      attributes: [
        'serviceTitle',
        [fn('COUNT', col('id')), 'enquiries'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'amount'],
      ],
      group: ['service_title'],
      order: [[literal('enquiries'), 'DESC']],
      limit: ANALYTICS_TOP_LIMIT,
      raw: true,
    }),

    /* When people want to come in, which is a different question from when they
       asked - a shop reads this one to decide what to staff. */
    db.ServiceLead.findAll({
      where: { ...scope, bookingDate: { [Op.ne]: null } },
      attributes: ['bookingDate', [fn('COUNT', col('id')), 'bookings']],
      group: ['booking_date'],
      order: [['booking_date', 'ASC']],
      raw: true,
    }),

    /* Since day one, so a quiet fortnight is read against the whole history
       rather than against itself. */
    db.ServiceLead.findOne({
      where: { companyId, amount: { [Op.ne]: null } },
      attributes: [
        [fn('COUNT', col('id')), 'count'],
        [fn('COALESCE', fn('SUM', col('amount')), 0), 'total'],
      ],
      raw: true,
    }),
  ]);

  const stages = {};
  LEAD_STAGE_VALUES.forEach((stage) => {
    stages[stage] = 0;
  });
  byStage.forEach((row) => {
    stages[row.stage] = num(row.total);
  });

  const bookings = {};
  BOOKING_STATUS_VALUES.forEach((status) => {
    bookings[status] = 0;
  });
  byBooking.forEach((row) => {
    bookings[row.bookingStatus] = num(row.total);
  });

  const bookedTotal = BOOKING_STATUS_VALUES.reduce((sum, status) => sum + bookings[status], 0);

  return {
    range: { days, from },

    totals: {
      /** Every enquiry in the window, whether or not it asked for a time. */
      enquiries: total,
      /** The ones that asked for a slot. */
      bookings: bookedTotal,
      /** Nobody has put a figure on these yet. Reported, never counted as zero. */
      unquoted,

      quoted: quoted.total,
      won: won.total,
      collected: collected.total,
      /**
       * Agreed and not yet paid. The one figure on this screen somebody can act
       * on this afternoon, which is why it is computed here rather than left to
       * a template to subtract.
       */
      outstanding: Number((won.total - collected.total).toFixed(2)),
      /** Over the quoted rows only - see the note at the top. */
      averageQuote: quoted.count ? Number((quoted.total / quoted.count).toFixed(2)) : 0,
      /**
       * How many conversations turned into work, as a whole percent.
       *
       * Over **every** enquiry rather than only the quoted ones: a shop that
       * never quotes half of what it is asked about has a conversion problem,
       * and hiding those rows from the denominator would hide it.
       */
      conversion: total ? Math.round((stages[LEAD_STAGE.CONVERTED] / total) * 100) : 0,
    },

    byStage: stages,
    byBooking: bookings,

    /** How many of the requested slots were actually confirmed. */
    bookingAcceptance: bookedTotal
      ? Math.round((bookings[BOOKING_STATUS.ACCEPTED] + bookings[BOOKING_STATUS.COMPLETED]) / bookedTotal * 100)
      : 0,

    daily: fillDays(days, daily, (day, row) => ({
      day,
      enquiries: num(row?.enquiries),
      amount: num(row?.amount),
    })),

    /** Keyed by the day asked for, so an empty day is a day nobody booked. */
    bookingDaily: fillDays(days, bookingDaily.map((row) => ({ ...row, day: String(row.bookingDate).slice(0, 10) })), (day, row) => ({
      day,
      bookings: num(row?.bookings),
    })),

    topServices: topServices.map((row) => ({
      title: row.serviceTitle || 'Not recorded',
      enquiries: num(row.enquiries),
      amount: num(row.amount),
    })),

    lifetime: { enquiries: num(lifetime?.count), quoted: num(lifetime?.total) },
  };
}

module.exports = { rangeOf, since, salesAnalytics, stockAnalytics, serviceAnalytics };
