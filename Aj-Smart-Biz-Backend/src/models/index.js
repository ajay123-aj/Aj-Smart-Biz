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
