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
const CompanySubscription = require('./companySubscription.model')(sequelize);
const SubscriptionEvent = require('./subscriptionEvent.model')(sequelize);
const PlanRequest = require('./planRequest.model')(sequelize);
const Transaction = require('./transaction.model')(sequelize);
const SuperAdmin = require('./superAdmin.model')(sequelize);
const Role = require('./role.model')(sequelize);
const Menu = require('./menu.model')(sequelize);
const RolePermission = require('./rolePermission.model')(sequelize);
const Admin = require('./admin.model')(sequelize);

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
  CompanySubscription,
  SubscriptionEvent,
  PlanRequest,
  Transaction,
  SuperAdmin,
  Role,
  Menu,
  RolePermission,
  Admin,
};

module.exports = db;
