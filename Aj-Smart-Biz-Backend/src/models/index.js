'use strict';

const { sequelize, Sequelize } = require('../config/database');

const State = require('./state.model')(sequelize);
const BusinessType = require('./businessType.model')(sequelize);
const Theme = require('./theme.model')(sequelize);
const Plan = require('./plan.model')(sequelize);
const Company = require('./company.model')(sequelize);
const Branch = require('./branch.model')(sequelize);
const BranchContact = require('./branchContact.model')(sequelize);
const CompanyDomain = require('./companyDomain.model')(sequelize);
const Slider = require('./slider.model')(sequelize);
const CompanyFunctionality = require('./companyFunctionality.model')(sequelize);
const CompanyWhatsapp = require('./companyWhatsapp.model')(sequelize);
const CompanyAbout = require('./companyAbout.model')(sequelize);
const CompanyContact = require('./companyContact.model')(sequelize);
const CompanyStat = require('./companyStat.model')(sequelize);
const CompanyTeamMember = require('./companyTeamMember.model')(sequelize);
const CompanyGalleryItem = require('./companyGalleryItem.model')(sequelize);
const CompanyTestimonial = require('./companyTestimonial.model')(sequelize);
const CompanyFeature = require('./companyFeature.model')(sequelize);
const CompanyService = require('./companyService.model')(sequelize);
const CompanyServiceCategory = require('./companyServiceCategory.model')(sequelize);
const CompanyCategory = require('./companyCategory.model')(sequelize);
const CompanyProduct = require('./companyProduct.model')(sequelize);
const CompanyBlogPost = require('./companyBlogPost.model')(sequelize);
const ServiceLead = require('./serviceLead.model')(sequelize);
const CompanyOrder = require('./companyOrder.model')(sequelize);
const CompanyOrderItem = require('./companyOrderItem.model')(sequelize);
const CompanyWarehouse = require('./companyWarehouse.model')(sequelize);
const CompanyStock = require('./companyStock.model')(sequelize);
const CompanyStockMovement = require('./companyStockMovement.model')(sequelize);
const Customer = require('./customer.model')(sequelize);
const CustomerAddress = require('./customerAddress.model')(sequelize);
const CompanySubscription = require('./companySubscription.model')(sequelize);
const SubscriptionEvent = require('./subscriptionEvent.model')(sequelize);
const PlanRequest = require('./planRequest.model')(sequelize);
const Transaction = require('./transaction.model')(sequelize);
const SuperAdmin = require('./superAdmin.model')(sequelize);
const Role = require('./role.model')(sequelize);
const Menu = require('./menu.model')(sequelize);
const RolePermission = require('./rolePermission.model')(sequelize);
const Admin = require('./admin.model')(sequelize);
const Lead = require('./lead.model')(sequelize);
const LeadVisit = require('./leadVisit.model')(sequelize);

/* ------------------------------------------------------------------ *
 * Associations
 * ------------------------------------------------------------------ */

// Company -> masters
Company.belongsTo(BusinessType, { foreignKey: 'businessTypeId', as: 'businessType' });
Company.belongsTo(Theme, { foreignKey: 'themeId', as: 'theme' });
Company.belongsTo(State, { foreignKey: 'stateId', as: 'state' });
BusinessType.hasMany(Company, { foreignKey: 'businessTypeId', as: 'companies' });
Theme.hasMany(Company, { foreignKey: 'themeId', as: 'companies' });
State.hasMany(Company, { foreignKey: 'stateId', as: 'companies' });

// Company -> branches -> contacts
Company.hasMany(Branch, { foreignKey: 'companyId', as: 'branches', onDelete: 'CASCADE' });
Branch.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.belongsTo(State, { foreignKey: 'stateId', as: 'state' });
Branch.hasMany(BranchContact, { foreignKey: 'branchId', as: 'contacts', onDelete: 'CASCADE' });
BranchContact.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
BranchContact.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

// Company -> domains (optionally pinned to one of its branches)
// Website hero slides. Deleting a company or a branch takes its slides with it;
// a company-wide slide (branch_id NULL) survives any branch being removed.
Company.hasMany(Slider, { foreignKey: 'companyId', as: 'sliders', onDelete: 'CASCADE' });
Slider.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(Slider, { foreignKey: 'branchId', as: 'sliders', onDelete: 'CASCADE' });
Slider.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

// Optional functionality: the tenant's switch per feature, and the typed
// WhatsApp numbers the `whatsapp` feature publishes. Both belong to the company
// rather than to a plan, so a downgrade parks the setup instead of losing it.
Company.hasMany(CompanyFunctionality, { foreignKey: 'companyId', as: 'functionalities', onDelete: 'CASCADE' });
CompanyFunctionality.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Company.hasMany(CompanyWhatsapp, { foreignKey: 'companyId', as: 'whatsappNumbers', onDelete: 'CASCADE' });
CompanyWhatsapp.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

// Website content the tenant writes: the About stat band, the Team section, the
// Gallery, the Testimonials wall and the Features / Benefits cards. Each is
// gated by its own functionality but owned by the company,
// so losing a plan parks the content rather than deleting it.
// All four are branch-aware the way sliders are: a row pinned to a branch shows
// on that branch's site, and `branch_id NULL` is the company-wide copy every
// other site falls back to. Deleting a branch takes its own rows with it; the
// company-wide ones survive.
Company.hasMany(CompanyAbout, { foreignKey: 'companyId', as: 'aboutCopies', onDelete: 'CASCADE' });
CompanyAbout.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyAbout, { foreignKey: 'branchId', as: 'aboutCopies', onDelete: 'CASCADE' });
CompanyAbout.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Company.hasMany(CompanyContact, { foreignKey: 'companyId', as: 'contactCopies', onDelete: 'CASCADE' });
CompanyContact.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyContact, { foreignKey: 'branchId', as: 'contactCopies', onDelete: 'CASCADE' });
CompanyContact.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Company.hasMany(CompanyStat, { foreignKey: 'companyId', as: 'stats', onDelete: 'CASCADE' });
CompanyStat.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyStat, { foreignKey: 'branchId', as: 'stats', onDelete: 'CASCADE' });
CompanyStat.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Company.hasMany(CompanyTeamMember, { foreignKey: 'companyId', as: 'teamMembers', onDelete: 'CASCADE' });
CompanyTeamMember.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyTeamMember, { foreignKey: 'branchId', as: 'teamMembers', onDelete: 'CASCADE' });
CompanyTeamMember.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Company.hasMany(CompanyGalleryItem, { foreignKey: 'companyId', as: 'galleryItems', onDelete: 'CASCADE' });
CompanyGalleryItem.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyGalleryItem, { foreignKey: 'branchId', as: 'galleryItems', onDelete: 'CASCADE' });
CompanyGalleryItem.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Company.hasMany(CompanyTestimonial, { foreignKey: 'companyId', as: 'testimonials', onDelete: 'CASCADE' });
CompanyTestimonial.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyTestimonial, { foreignKey: 'branchId', as: 'testimonials', onDelete: 'CASCADE' });
CompanyTestimonial.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Company.hasMany(CompanyFeature, { foreignKey: 'companyId', as: 'featureCards', onDelete: 'CASCADE' });
CompanyFeature.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyFeature, { foreignKey: 'branchId', as: 'featureCards', onDelete: 'CASCADE' });
CompanyFeature.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

// What the business sells, as opposed to why anyone should buy it. Same
// ownership and the same branch fallback as the cards above; a separate table
// because a service carries a price, a picture and a list of inclusions that
// would be meaningless on a benefit card. See `CompanyService`.
Company.hasMany(CompanyService, { foreignKey: 'companyId', as: 'services', onDelete: 'CASCADE' });
CompanyService.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyService, { foreignKey: 'branchId', as: 'services', onDelete: 'CASCADE' });
CompanyService.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

/**
 * How a business sorts the work it sells. Its own tree rather than a corner of
 * the product one - see `CompanyServiceCategory` for why.
 *
 * `SET NULL` on delete, like the catalogue's: removing a category unfiles the
 * services in it rather than deleting work the company still does.
 */
Company.hasMany(CompanyServiceCategory, { foreignKey: 'companyId', as: 'serviceCategories', onDelete: 'CASCADE' });
CompanyServiceCategory.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyServiceCategory, { foreignKey: 'branchId', as: 'serviceCategories', onDelete: 'CASCADE' });
CompanyServiceCategory.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CompanyServiceCategory.hasMany(CompanyService, { foreignKey: 'categoryId', as: 'services', onDelete: 'SET NULL' });
CompanyService.belongsTo(CompanyServiceCategory, { foreignKey: 'categoryId', as: 'category' });

/**
 * The catalogue: categories, the subcategories under them, and the products
 * filed in either.
 *
 * Owned by the company and branch-aware like every other content table, so a
 * lapsed plan parks the range rather than deleting it and a branch can stock
 * something the head office does not.
 *
 * Two self-references, and both are deliberately unconstrained at the database
 * level. `parentId` points a category at another row of its own table, which
 * `sequelize.sync()` cannot order; the controller refuses a parent from another
 * tenant and refuses a cycle, which is a stronger guarantee than a foreign key
 * would have given anyway.
 *
 * A product's category is `SET NULL` rather than `CASCADE`: deleting "Dining
 * tables" must not delete the tables. They fall back to being uncategorised,
 * which is a state the catalogue already renders, and the tenant re-files them.
 */
Company.hasMany(CompanyCategory, { foreignKey: 'companyId', as: 'categories', onDelete: 'CASCADE' });
CompanyCategory.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyCategory, { foreignKey: 'branchId', as: 'categories', onDelete: 'CASCADE' });
CompanyCategory.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CompanyCategory.belongsTo(CompanyCategory, { foreignKey: 'parentId', as: 'parent', constraints: false });
CompanyCategory.hasMany(CompanyCategory, { foreignKey: 'parentId', as: 'children', constraints: false });

Company.hasMany(CompanyProduct, { foreignKey: 'companyId', as: 'products', onDelete: 'CASCADE' });
CompanyProduct.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyProduct, { foreignKey: 'branchId', as: 'products', onDelete: 'CASCADE' });
CompanyProduct.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CompanyCategory.hasMany(CompanyProduct, { foreignKey: 'categoryId', as: 'products', onDelete: 'SET NULL' });
CompanyProduct.belongsTo(CompanyCategory, { foreignKey: 'categoryId', as: 'category' });

/**
 * The blog. Company-owned and branch-aware like every other content table, and
 * with no third association: a post belongs to nothing else on the platform.
 *
 * In particular it does **not** belong to an admin. Its byline is a name typed
 * on the row rather than a link to the person who saved it, so deleting a staff
 * account cannot strip the author off four years of articles; see
 * `CompanyBlogPost.author`.
 */
Company.hasMany(CompanyBlogPost, { foreignKey: 'companyId', as: 'blogPosts', onDelete: 'CASCADE' });
CompanyBlogPost.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyBlogPost, { foreignKey: 'branchId', as: 'blogPosts', onDelete: 'CASCADE' });
CompanyBlogPost.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

/**
 * Enquiries raised against those services.
 *
 * Cascades from the company like every other tenant-owned table, and from the
 * branch it was raised on. It does **not** cascade from the service: deleting a
 * service must not delete the record of people who asked about it, so the
 * foreign key is cleared and `serviceTitle` — copied onto the row when it was
 * raised — goes on saying what the enquiry was about.
 */
Company.hasMany(ServiceLead, { foreignKey: 'companyId', as: 'serviceLeads', onDelete: 'CASCADE' });
ServiceLead.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(ServiceLead, { foreignKey: 'branchId', as: 'serviceLeads', onDelete: 'SET NULL' });
ServiceLead.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CompanyService.hasMany(ServiceLead, { foreignKey: 'serviceId', as: 'enquiries', onDelete: 'SET NULL' });
ServiceLead.belongsTo(CompanyService, { foreignKey: 'serviceId', as: 'service' });

Company.hasMany(CompanyDomain, { foreignKey: 'companyId', as: 'domains', onDelete: 'CASCADE' });
CompanyDomain.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
CompanyDomain.belongsTo(Branch, { foreignKey: 'subCompanyId', as: 'branch' });
Branch.hasMany(CompanyDomain, { foreignKey: 'subCompanyId', as: 'domains' });

// Company -> subscriptions -> transactions
Company.hasMany(CompanySubscription, { foreignKey: 'companyId', as: 'subscriptions', onDelete: 'CASCADE' });
CompanySubscription.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
CompanySubscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
Plan.hasMany(CompanySubscription, { foreignKey: 'planId', as: 'subscriptions' });

// A renewal or upgrade points back at the term it replaced, so the history of a
// company's plan reads as a chain. `constraints: false` keeps sequelize.sync()
// from having to order a table against itself.
CompanySubscription.belongsTo(CompanySubscription, {
  foreignKey: 'previousSubscriptionId',
  as: 'previousSubscription',
  constraints: false,
});

// Subscription -> transition trail
CompanySubscription.hasMany(SubscriptionEvent, {
  foreignKey: 'subscriptionId',
  as: 'events',
  onDelete: 'CASCADE',
});
SubscriptionEvent.belongsTo(CompanySubscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Company.hasMany(SubscriptionEvent, { foreignKey: 'companyId', as: 'subscriptionEvents', onDelete: 'CASCADE' });
SubscriptionEvent.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
SubscriptionEvent.belongsTo(Plan, { foreignKey: 'fromPlanId', as: 'fromPlan' });
SubscriptionEvent.belongsTo(Plan, { foreignKey: 'toPlanId', as: 'toPlan' });

// Company -> plan change requests raised from the tenant workspace
Company.hasMany(PlanRequest, { foreignKey: 'companyId', as: 'planRequests', onDelete: 'CASCADE' });
PlanRequest.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
PlanRequest.belongsTo(Plan, { foreignKey: 'requestedPlanId', as: 'requestedPlan' });
PlanRequest.belongsTo(Plan, { foreignKey: 'currentPlanId', as: 'currentPlan' });
Plan.hasMany(PlanRequest, { foreignKey: 'requestedPlanId', as: 'requests' });

Company.hasMany(Transaction, { foreignKey: 'companyId', as: 'transactions', onDelete: 'CASCADE' });
Transaction.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Transaction.belongsTo(CompanySubscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Transaction.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
CompanySubscription.hasMany(Transaction, { foreignKey: 'subscriptionId', as: 'transactions' });

// `constraints: false` breaks the companies <-> company_subscriptions FK cycle,
// which sequelize.sync() cannot order on its own.
Company.belongsTo(CompanySubscription, {
  foreignKey: 'currentSubscriptionId',
  as: 'currentSubscription',
  constraints: false,
});

// Company -> roles / menus / admins
Company.hasMany(Role, { foreignKey: 'companyId', as: 'roles', onDelete: 'CASCADE' });
Role.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

Company.hasMany(Menu, { foreignKey: 'companyId', as: 'menus' });
Menu.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Menu.belongsTo(Menu, { foreignKey: 'parentId', as: 'parent' });
Menu.hasMany(Menu, { foreignKey: 'parentId', as: 'children' });

Role.hasMany(RolePermission, { foreignKey: 'roleId', as: 'permissions', onDelete: 'CASCADE' });
RolePermission.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Menu.hasMany(RolePermission, { foreignKey: 'menuId', as: 'permissions', onDelete: 'CASCADE' });
RolePermission.belongsTo(Menu, { foreignKey: 'menuId', as: 'menu' });
RolePermission.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

Company.hasMany(Admin, { foreignKey: 'companyId', as: 'admins', onDelete: 'CASCADE' });
Admin.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Admin.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Admin.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
Branch.hasMany(Admin, { foreignKey: 'branchId', as: 'admins' });
Role.hasMany(Admin, { foreignKey: 'roleId', as: 'admins' });

/**
 * Website visitors, and the visits behind each one.
 *
 * Both tables carry `companyId` so the super admin's cross-tenant reads never
 * have to join to scope themselves, and both cascade from the company: a tenant
 * that is deleted takes its traffic with it rather than leaving orphan rows
 * nobody can attribute. A visit additionally names the branch site it landed
 * on, which is what the branch-wise breakdown groups by.
 */
Company.hasMany(Lead, { foreignKey: 'companyId', as: 'leads', onDelete: 'CASCADE' });
Lead.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(Lead, { foreignKey: 'branchId', as: 'leads', onDelete: 'SET NULL' });
Lead.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Lead.hasMany(LeadVisit, { foreignKey: 'leadId', as: 'visits', onDelete: 'CASCADE' });
LeadVisit.belongsTo(Lead, { foreignKey: 'leadId', as: 'lead' });
Company.hasMany(LeadVisit, { foreignKey: 'companyId', as: 'leadVisits', onDelete: 'CASCADE' });
LeadVisit.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(LeadVisit, { foreignKey: 'branchId', as: 'leadVisits', onDelete: 'SET NULL' });
LeadVisit.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

/**
 * Orders, and the lines on them.
 *
 * Owned by the company and stamped with the branch whose site took them, like
 * every other thing a stranger can send. Deleting a company takes its orders;
 * deleting a branch does **not** — `SET NULL`, the rule the leads follow, because
 * an order is money that changed hands and closing a shop does not un-sell it.
 *
 * A line points at the product it was placed against, and that reference is
 * deliberately weak: `SET NULL`, no cascade. Everything the line needs to print
 * is copied onto it, so a product deleted next year leaves last year’s orders
 * exactly as they were rather than taking the record of having sold it away.
 */
Company.hasMany(CompanyOrder, { foreignKey: 'companyId', as: 'orders', onDelete: 'CASCADE' });
CompanyOrder.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyOrder, { foreignKey: 'branchId', as: 'orders', onDelete: 'SET NULL' });
CompanyOrder.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

CompanyOrder.hasMany(CompanyOrderItem, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
CompanyOrderItem.belongsTo(CompanyOrder, { foreignKey: 'orderId', as: 'order' });
Company.hasMany(CompanyOrderItem, { foreignKey: 'companyId', as: 'orderItems', onDelete: 'CASCADE' });
CompanyOrderItem.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
CompanyProduct.hasMany(CompanyOrderItem, { foreignKey: 'productId', as: 'orderItems', onDelete: 'SET NULL' });
CompanyOrderItem.belongsTo(CompanyProduct, { foreignKey: 'productId', as: 'product' });

/**
 * The warehouse, the level in it, and the ledger behind the level.
 *
 * A warehouse belongs to the company and *optionally* serves one branch — see
 * the model for why those are different things. A branch closing leaves the unit
 * standing (`SET NULL`): the stock in it is still there and still has to be
 * counted.
 *
 * Stock levels cascade from both the warehouse and the product, and that is the
 * one place here where losing the row is right: a level is a running total *of*
 * a pair, and with either half gone it is a number about nothing. The ledger
 * does not cascade from the product for the opposite reason — what moved, and
 * who moved it, stays true after the catalogue entry is deleted.
 */
Company.hasMany(CompanyWarehouse, { foreignKey: 'companyId', as: 'warehouses', onDelete: 'CASCADE' });
CompanyWarehouse.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
Branch.hasMany(CompanyWarehouse, { foreignKey: 'branchId', as: 'warehouses', onDelete: 'SET NULL' });
CompanyWarehouse.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CompanyWarehouse.belongsTo(State, { foreignKey: 'stateId', as: 'state' });

/* Which unit is filling an order. `SET NULL`, because deleting a warehouse must
   not delete the orders it was going to fill — they need re-assigning, which is
   a job for a person. */
CompanyWarehouse.hasMany(CompanyOrder, { foreignKey: 'warehouseId', as: 'orders', onDelete: 'SET NULL' });
CompanyOrder.belongsTo(CompanyWarehouse, { foreignKey: 'warehouseId', as: 'warehouse' });

CompanyWarehouse.hasMany(CompanyStock, { foreignKey: 'warehouseId', as: 'stock', onDelete: 'CASCADE' });
CompanyStock.belongsTo(CompanyWarehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
CompanyProduct.hasMany(CompanyStock, { foreignKey: 'productId', as: 'stock', onDelete: 'CASCADE' });
CompanyStock.belongsTo(CompanyProduct, { foreignKey: 'productId', as: 'product' });
Company.hasMany(CompanyStock, { foreignKey: 'companyId', as: 'stockLevels', onDelete: 'CASCADE' });
CompanyStock.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

Company.hasMany(CompanyStockMovement, { foreignKey: 'companyId', as: 'stockMovements', onDelete: 'CASCADE' });
CompanyStockMovement.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
CompanyWarehouse.hasMany(CompanyStockMovement, { foreignKey: 'warehouseId', as: 'movements', onDelete: 'CASCADE' });
CompanyStockMovement.belongsTo(CompanyWarehouse, { foreignKey: 'warehouseId', as: 'warehouse' });
CompanyStockMovement.belongsTo(CompanyProduct, { foreignKey: 'productId', as: 'product', constraints: false });
CompanyStockMovement.belongsTo(CompanyOrder, { foreignKey: 'orderId', as: 'order', constraints: false });

/**
 * Customers, and the addresses they keep.
 *
 * Owned by the company, like everything else a tenant accumulates — deleting a
 * company takes its customer list, and a customer belongs to exactly one tenant
 * (see the model for why the same person at two shops is two rows).
 *
 * The link from an order is deliberately **weak**: `SET NULL`, no cascade. An
 * order taken before the tenant bought customer accounts has no customer and
 * never will, and an account deleted next year must not take the sale with it.
 * Everything an order needs to print — the name, the phone, the address — is
 * copied onto it anyway.
 */
Company.hasMany(Customer, { foreignKey: 'companyId', as: 'customers', onDelete: 'CASCADE' });
Customer.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });

Customer.hasMany(CustomerAddress, { foreignKey: 'customerId', as: 'addresses', onDelete: 'CASCADE' });
CustomerAddress.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
Company.hasMany(CustomerAddress, { foreignKey: 'companyId', as: 'customerAddresses', onDelete: 'CASCADE' });
CustomerAddress.belongsTo(Company, { foreignKey: 'companyId', as: 'company' });
CustomerAddress.belongsTo(State, { foreignKey: 'stateId', as: 'state' });

Customer.hasMany(CompanyOrder, { foreignKey: 'customerId', as: 'orders', onDelete: 'SET NULL' });
CompanyOrder.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

/* Service enquiries too, on the same weak terms: the enquiry outlives the
   account, and everything it needs to print is copied onto it. */
Customer.hasMany(ServiceLead, { foreignKey: 'customerId', as: 'serviceLeads', onDelete: 'SET NULL' });
ServiceLead.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

const db = {
  sequelize,
  Sequelize,
  State,
  BusinessType,
  Theme,
  Plan,
  Company,
  Branch,
  BranchContact,
  CompanyDomain,
  Slider,
  CompanyFunctionality,
  CompanyWhatsapp,
  CompanyAbout,
  CompanyContact,
  CompanyStat,
  CompanyTeamMember,
  CompanyGalleryItem,
  CompanyTestimonial,
  CompanyFeature,
  CompanyService,
  CompanyServiceCategory,
  CompanyCategory,
  CompanyProduct,
  CompanyBlogPost,
  ServiceLead,
  CompanyOrder,
  CompanyOrderItem,
  CompanyWarehouse,
  CompanyStock,
  CompanyStockMovement,
  Customer,
  CustomerAddress,
  CompanySubscription,
  SubscriptionEvent,
  PlanRequest,
  Transaction,
  SuperAdmin,
  Role,
  Menu,
  RolePermission,
  Admin,
  Lead,
  LeadVisit,
};

module.exports = db;
