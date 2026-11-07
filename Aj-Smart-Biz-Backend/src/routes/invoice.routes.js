'use strict';

const router = require('express').Router();
const controller = require('../controllers/invoice.controller');
const schema = require('../validators/invoice.validator');
const validate = require('../middlewares/validate');
const { requirePermission } = require('../middlewares/auth');

/**
 * Counter invoices, mounted at `/admin/company/invoices` behind the `invoices`
 * menu's `canView`. Writes add the matching action from the permission matrix
 * so a role can be allowed to look up bills without being able to raise them.
 */
const can = (action) => requirePermission('invoices', action);

/**
 * @openapi
 * /admin/company/invoices/meta:
 *   get:
 *     tags: [Admin]
 *     summary: Invoice screen settings
 *     description: |
 *       Pickers and context for the billing screen — status, payment-status,
 *       payment-mode and discount-type catalogues, GST quick picks, the tenant's
 *       branches and warehouses, whether stock will be deducted on issue
 *       (`stockTracking`), and the `seller` block printed on every invoice.
 *     responses:
 *       200: { description: Settings., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/meta', controller.meta);

/**
 * @openapi
 * /admin/company/invoices/products:
 *   get:
 *     tags: [Admin]
 *     summary: Product picker for invoices
 *     description: |
 *       Active products matching `search` (name or SKU), each with the
 *       `sellingPrice` it will be billed at (offer price where lower) and, when
 *       Warehouse & stock is live and the product tracks inventory, `available`
 *       — on hand minus reserved in the warehouse the invoice draws from
 *       (`warehouseId`, else the branch's, else the company default).
 *     responses:
 *       200: { description: Products., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/products', validate(schema.productQuery), controller.products);

/**
 * @openapi
 * /admin/company/invoices/summary:
 *   get:
 *     tags: [Admin]
 *     summary: Sales totals
 *     description: Issued-invoice count, total, collected and discount for today and this month; outstanding balance; draft count.
 *     responses:
 *       200: { description: Totals., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.get('/summary', controller.summary);

/**
 * @openapi
 * /admin/company/invoices/access:
 *   get:
 *     tags: [Admin]
 *     summary: What this admin may see on the invoice screens
 *     description: |
 *       `canSeeAll` — the role has View on **All invoices** (`invoices-all`) in
 *       Menu Permission, or this is the company's main admin. Without it an
 *       admin sees only the invoices they created, everywhere: list, summary,
 *       a single invoice, every write and the analysis.
 *
 *       `canAnalyse` — View on **Invoice analysis** (`invoice-analysis`).
 *       `admins` — the company's admins, for the "Created by" filter (only
 *       when `canSeeAll`).
 *
 * /admin/company/invoices/analysis:
 *   get:
 *     tags: [Admin]
 *     summary: Invoice analysis — revenue, product-wise, admin-wise
 *     description: |
 *       Issued invoices only (drafts and cancelled invoices are not sales), for
 *       `from`..`to` (invoice date; default the last 30 days). Returns
 *       `totals` (invoices, revenue, collected, outstanding, discount, tax,
 *       itemsSold, customers, averageBill, collectionRate), `trend` (per day,
 *       or per month past 62 days), `byProduct` (top 50 by revenue: quantity,
 *       revenue, discount, invoices, share %), `byAdmin` (who raised them),
 *       `byPaymentMode`, `byPaymentStatus` and `byBranch`.
 *
 *       Needs View on Invoice analysis. Reports on the admin's own invoices by
 *       default; `scope=all` (needs All invoices) reports on everyone's, and
 *       may be narrowed with `createdBy` and `branchId`.
 */
router.get('/access', controller.access);
router.get('/analysis', validate(schema.analysisQuery), controller.analysis);

/**
 * @openapi
 * /admin/company/invoices:
 *   get:
 *     tags: [Admin]
 *     summary: List invoices
 *     description: Newest first. The admin's **own** invoices by default; `scope=all` lists everyone's and needs the All invoices permission (`createdBy` then narrows to one admin). Each row carries `creator` (the admin who raised it). Filter by `status`, `paymentStatus`, `branchId`, `from`/`to` (invoice date) and `search` (number, customer name or phone).
 *     responses:
 *       200: { description: A page of invoices., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *   post:
 *     tags: [Admin]
 *     summary: Create an invoice
 *     description: |
 *       Saves a **draft**, or with `issue: true` saves and issues in one step.
 *
 *       Each line is `{ productId, quantity, unitPrice?, discountType?, discountValue?, taxPercent? }`.
 *       `unitPrice` defaults to the catalogue selling price. A line discount is
 *       `percent` or a flat `amount` on that line; tax is charged on the line
 *       after its discount. `billDiscountType`/`billDiscountValue` discount the
 *       whole bill after tax, and `roundOff` (default true) rounds to the rupee.
 *       All totals are computed by the server; any totals sent are ignored.
 *
 *       **Issuing** gives the next `INV-00001`-style number, locks the lines and,
 *       when Warehouse & stock is live, deducts every `trackInventory` product
 *       from the warehouse after checking available stock for all lines — one
 *       shortage refuses the whole invoice and names every short product.
 *       Requires the plan to include Invoice management.
 *     responses:
 *       201: { description: Created., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *       400: { description: Validation failed, not in plan, or not enough stock., content: { application/json: { schema: { $ref: '#/components/schemas/ApiError' } } } }
 */
router.get('/', validate(schema.listQuery), controller.list);
router.post('/', can('canCreate'), validate(schema.create), controller.create);

router.get('/:id', validate(schema.idParam), controller.getById);

/**
 * @openapi
 * /admin/company/invoices/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Edit a draft
 *     description: |
 *       Same body as create. Only drafts can be edited; `issue: true` issues it after saving.
 *     responses:
 *       200: { description: Saved., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a draft
 *     description: Drafts only. An issued invoice is cancelled, never deleted, so its number stays accounted for.
 *     responses:
 *       200: { description: Deleted., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.put('/:id', can('canEdit'), validate(schema.update), controller.update);
router.delete('/:id', can('canDelete'), validate(schema.idParam), controller.remove);

/**
 * @openapi
 * /admin/company/invoices/{id}/issue:
 *   post:
 *     tags: [Admin]
 *     summary: Issue a draft
 *     description: Numbers it, locks it and deducts tracked stock (see create).
 *     responses:
 *       200: { description: Issued., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 * /admin/company/invoices/{id}/payment:
 *   patch:
 *     tags: [Admin]
 *     summary: Record payment
 *     description: Sets the total `amountPaid` (not an increment) and mode. Payment status is derived — paid, partial or unpaid.
 *     responses:
 *       200: { description: Recorded., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 * /admin/company/invoices/{id}/cancel:
 *   post:
 *     tags: [Admin]
 *     summary: Cancel an issued invoice
 *     description: Voids it and returns every unit it deducted to the same warehouse, as a `return` movement on the stock ledger.
 *     responses:
 *       200: { description: Cancelled., content: { application/json: { schema: { $ref: '#/components/schemas/ApiSuccess' } } } }
 */
router.post('/:id/issue', can('canEdit'), validate(schema.idParam), controller.issue);
router.patch('/:id/payment', can('canEdit'), validate(schema.payment), controller.payment);
router.post('/:id/cancel', can('canEdit'), validate(schema.cancel), controller.cancel);

module.exports = router;
