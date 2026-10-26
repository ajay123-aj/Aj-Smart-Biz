'use strict';

/**
 * **Sample companies**: the five demo tenants in `seeders/sampleCompanies.js`,
 * created from one button in Company Management.
 *
 * Each is created through `createCompany`, exactly as if somebody had typed it
 * in, and filled through `aiContent.service`'s `writeContent`. The content is
 * in the shape the AI creator writes, so there is one writer, not two.
 *
 * **Created once.** A sample is matched by its company code. One that already
 * exists, or that was deleted and sits in the bin, is reported and left
 * alone, however it has been edited since. Pressing the button again creates
 * only the samples that are missing.
 *
 * Every sample is put on one hidden plan, *Sample companies (all features)*:
 * free, lifetime, every feature granted, and not public, so it never appears
 * on the marketing site's pricing page. A section only shows when the plan
 * grants it, and a sample that hid half of itself would not be much of a
 * sample.
 */

const db = require('../models');
const logger = require('../utils/logger');
const SAMPLES = require('../seeders/sampleCompanies');
const { createCompany } = require('./company.service');
const { writeContent } = require('./aiContent.service');
const {
  STATUS,
  BILLING_CYCLE,
  FUNCTIONALITY,
  FUNCTIONALITY_VALUES,
  ORDER_MODE,
  WHATSAPP_TYPE,
} = require('../constants');

const SAMPLE_PLAN = {
  code: 'SAMPLE-ALL',
  name: 'Sample companies (all features)',
  description: 'Used by the sample companies in Company Management. Not for sale.',
  price: 0,
  currency: 'INR',
  billingCycle: BILLING_CYCLE.LIFETIME,
  maxBranches: 3,
  maxAdmins: 5,
  maxUsers: 10,
  storageMb: 1024,
  functionalities: FUNCTIONALITY_VALUES,
  isPublic: false,
  showInAdmin: false,
  sequence: 999,
  status: STATUS.ACTIVE,
};

async function ensureSamplePlan(actorId) {
  const [plan] = await db.Plan.findOrCreate({
    where: { code: SAMPLE_PLAN.code },
    defaults: { ...SAMPLE_PLAN, createdBy: actorId ?? null },
  });
  return plan;
}

/**
 * Online orders over WhatsApp, for the samples that sell: a number to send
 * the basket to, and the two switches that put the cart on the site. The
 * number is the sample's own placeholder phone, never a real one.
 */
async function enableOrders(company, actorId) {
  await db.CompanyWhatsapp.create({
    companyId: company.id,
    type: WHATSAPP_TYPE.ORDERS,
    countryCode: '91',
    number: company.phone,
    label: 'Orders',
    defaultMessage: `Hello ${company.name}, I would like to place an order.`,
    sequence: 1,
    status: STATUS.ACTIVE,
    createdBy: actorId ?? null,
  });

  const settings = {
    [FUNCTIONALITY.WHATSAPP]: null,
    [FUNCTIONALITY.ORDERS]: {
      mode: ORDER_MODE.WHATSAPP,
      cart: true,
      addToCartLabel: 'Add to cart',
      buyNowLabel: 'Buy now',
      cartTitle: 'Your cart',
      cartNote: 'Send your order and we will confirm stock and the final total before anything is charged.',
      submitLabel: 'Send order',
      whatsappType: WHATSAPP_TYPE.ORDERS,
      messageIntro: `Hello ${company.name}, I would like to order:`,
      requireName: true,
      requirePhone: true,
      requireAddress: true,
    },
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.CompanyFunctionality.findOrCreate({
      where: { companyId: company.id, key },
      defaults: { companyId: company.id, key, status: STATUS.ACTIVE, settings: value, createdBy: actorId ?? null },
    });
  }
}

/** One sample: left alone if its code is taken, otherwise created and filled. */
async function ensureSample(sample, plan, actorId) {
  const outcome = { key: sample.key, label: sample.label, name: sample.company.name, code: sample.company.code };

  const existing = await db.Company.findOne({ where: { code: sample.company.code }, paranoid: false });
  if (existing) {
    return {
      ...outcome,
      status: 'exists',
      companyId: existing.deletedAt ? null : existing.id,
      message: existing.deletedAt
        ? 'Already created, and now deleted. Restore it from the company list to use it again.'
        : 'Already created. Left as it is.',
    };
  }

  const [businessType] = await db.BusinessType.findOrCreate({
    where: { slug: sample.businessType.slug },
    defaults: { ...sample.businessType, status: STATUS.ACTIVE },
  });

  /* A host maps to one tenant. If somebody has since given this one to a real
     company, the sample goes without a domain rather than taking it. */
  const domainTaken = await db.CompanyDomain.findOne({ where: { domain: sample.domain } });

  const result = await createCompany(
    {
      ...sample.company,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      businessTypeId: businessType.id,
      domain: domainTaken ? null : sample.domain,
      mainAdmin: { ...sample.admin, phone: sample.company.phone },
      subscription: { planId: plan.id, amount: 0, remarks: 'Sample company' },
    },
    actorId
  );

  const written = await writeContent(result.company, sample.content, actorId);
  if (sample.orders) await enableOrders(result.company, actorId);

  return {
    ...outcome,
    status: 'created',
    companyId: result.company.id,
    domain: domainTaken ? null : sample.domain,
    adminEmail: result.admin.email,
    adminPassword: result.mainAdminPassword,
    created: written.created,
    notLive: written.notLive,
    message: domainTaken ? `Created without a domain: ${sample.domain} already belongs to another company.` : null,
  };
}

/**
 * Creates whichever samples are missing. One that fails is reported and the
 * rest still go ahead.
 */
async function createSampleCompanies(actorId) {
  const plan = await ensureSamplePlan(actorId);
  const results = [];

  for (const sample of SAMPLES) {
    try {
      results.push(await ensureSample(sample, plan, actorId));
    } catch (error) {
      logger.warn(`Sample company "${sample.key}" failed: ${error.message}`);
      results.push({
        key: sample.key,
        label: sample.label,
        name: sample.company.name,
        code: sample.company.code,
        status: 'failed',
        companyId: null,
        message: error.message,
      });
    }
  }

  return {
    created: results.filter((result) => result.status === 'created').length,
    existing: results.filter((result) => result.status === 'exists').length,
    failed: results.filter((result) => result.status === 'failed').length,
    samples: results,
  };
}

module.exports = { createSampleCompanies };
