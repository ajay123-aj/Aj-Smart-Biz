'use strict';

const { Op, fn, col, where: sqlWhere } = require('sequelize');
const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { success, paginated } = require('../utils/response');
const functionalityService = require('../services/functionality.service');
const leadService = require('../services/lead.service');
const orderService = require('../services/order.service');
const customerService = require('../services/customer.service');
const bookingService = require('../services/booking.service');
const logger = require('../utils/logger');
const { resolveServiceState } = require('../services/serviceState.service');
const { resolveTheme } = require('../services/theme.service');
const ApiError = require('../utils/ApiError');
const { created } = require('../utils/response');
const {
  STATUS,
  FUNCTIONALITY,
  TESTIMONIAL_MODE,
  TESTIMONIAL_REVIEW_TARGET,
  TESTIMONIAL_SOURCE,
  TESTIMONIAL_MODERATION,
  SERVICE_ENQUIRY_TARGET,
  WHATSAPP_FALLBACK_TYPE,
  AUTH_SCOPE,
  BLOG_PAGE_SIZE,
  BOOKING_STATUS,
} = require('../constants');

/** Hosts that never identify a tenant, so a bare dev server gets platform branding. */
const NEUTRAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'www']);

/** Strips the port and lower-cases; `Acme.Test:4300` -> `acme.test`. */
const normaliseHost = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');

/**
 * The Host the browser actually used. Behind a proxy the original host arrives in
 * `X-Forwarded-Host`; `domain` stays available for local development, where the
 * dev server has no tenant subdomain of its own.
 *
 * Read from the **body as well as the query**. The read endpoints are called
 * with `?domain=`, but both submit endpoints take it as a body field — it is in
 * their validators and documented there as exactly this escape hatch — and
 * looking only at the query meant a form on a local dev site could never
 * identify its tenant, so every submission was refused. It grants nothing new:
 * `?domain=` already lets any caller name the tenant, which is the accepted
 * trade for being able to run a tenant's website on localhost at all.
 */
const resolveHost = (req) =>
  normaliseHost(req.query.domain || req.body?.domain || req.get('x-forwarded-host') || req.get('host'));

/** First label of the host: `acme.ajsmartbiz.com` -> `acme`. */
const subdomainOf = (host) => {
  const labels = host.split('.');
  return labels.length > 2 ? labels[0] : null;
};

/**
 * Resolves a host to `{ company, branch }`:
 *   1. an exact row in `company_domain` (which may pin a branch),
 *   2. otherwise the leading label of the host matched against `companies.code`,
 *      so a tenant works on `<code>.<platform>` without configuring anything.
 */
async function resolveTenantByHost(host) {
  // if (!host || NEUTRAL_HOSTS.has(host)) return { company: null, branch: null };

  const mapping = await db.CompanyDomain.findOne({
    where: { domain: host, status: STATUS.ACTIVE },
    include: [
      { model: db.Company, as: 'company' },
      { model: db.Branch, as: 'branch' },
    ],
  });
  if (mapping?.company) {
    // A branch that was deactivated falls back to company-wide branding.
    const branch = mapping.branch && mapping.branch.status === STATUS.ACTIVE ? mapping.branch : null;
    return { company: mapping.company, branch };
  }

  const label = subdomainOf(host);
  if (!label || NEUTRAL_HOSTS.has(label)) return { company: null, branch: null };

  const company = await db.Company.findOne({ where: sqlWhere(fn('LOWER', col('code')), label) });
  return { company: company ?? null, branch: null };
}

/**
 * GET /public/branding
 *
 * Unauthenticated: the login screen calls it before anyone has signed in. It
 * therefore returns only what a login page needs to render — never contact
 * details, GST, plan or counts — and never reveals whether a host exists: an
 * unknown or inactive tenant simply gets the platform defaults.
 */
const branding = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  const platform = {
    resolved: false,
    host,
    name: 'Aj Smart Biz',
    description: 'Sign in to your company workspace.',
    logo: null,
    favicon: null,
    branch: null,
    theme: null,
  };

  // An inactive tenant is treated as unknown so its status cannot be probed.
  if (!company || company.status !== STATUS.ACTIVE) {
    return success(res, { message: 'Branding fetched successfully', data: platform });
  }

  /**
   * The preset, then the company's own values laid over it.
   *
   * `themes` is the platform's shared catalogue, so the row found here may be
   * serving a dozen other tenants — it is the starting point, not the answer.
   * See `services/theme.service`.
   */
  const preset = company.themeId
    ? await db.Theme.findOne({
      where: { id: company.themeId, status: STATUS.ACTIVE },
      attributes: ['id', 'name', 'primaryColor', 'secondaryColor', 'accentColor', 'mode'],
    })
    : null;
  /*
   * Branch first, then the company, then the preset — the same order the logo
   * and favicon below already follow, so a visitor on a branch domain never
   * gets that branch's mark above the company's colours.
   */
  const theme = resolveTheme({ branch, company, preset });

  /**
   * Last resort for images: the head office. A company that only ever branded
   * its main branch still gets a branded login screen rather than the platform
   * mark. Skipped when the host already resolved to a specific branch.
   */
  const needsFallback = !branch && (!company.logo || !company.favicon);
  const mainBranch = needsFallback
    ? await db.Branch.findOne({
      where: { companyId: company.id, isMain: true, status: STATUS.ACTIVE },
      attributes: ['logo', 'favicon'],
    })
    : null;

  return success(res, {
    message: 'Branding fetched successfully',
    data: {
      resolved: true,
      host,
      code: company.code,
      name: company.name,
      description: company.description,
      // Pinned branch -> company -> head office.
      logo: branch?.logo || company.logo || mainBranch?.logo || null,
      favicon: branch?.favicon || company.favicon || mainBranch?.favicon || null,
      branch: branch ? { id: branch.id, name: branch.name, code: branch.code } : null,
      /** Already merged and already shaped for the client — see above. */
      theme,
    },
  });
});

/* ------------------------------------------------------------------ *
 * Company details
 * ------------------------------------------------------------------ */

/** Flattens a company or branch row into the one address shape the sites render. */
const addressOf = (row, state) => ({
  line1: row.addressLine1 ?? null,
  line2: row.addressLine2 ?? null,
  city: row.city ?? null,
  state: state?.name ?? null,
  stateCode: state?.code ?? null,
  country: state?.country ?? null,
  pincode: row.pincode ?? null,
});

/** The public half of a branch. Deliberately no GST number and no contact rows. */
const publicBranch = (branch) =>
  branch
    ? {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      isMain: Boolean(branch.isMain),
      email: branch.email ?? null,
      phone: branch.phone ?? null,
      address: addressOf(branch, branch.state),
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      openingTime: branch.openingTime ?? null,
      closingTime: branch.closingTime ?? null,
    }
    : null;

/** The public half of a slide — no ids beyond its own, no audit columns. */
const publicSlide = (slide) => ({
  id: slide.id,
  eyebrow: slide.eyebrow ?? null,
  title: slide.title,
  subtitle: slide.subtitle ?? null,
  image: slide.image ?? null,
  mobileImage: slide.mobileImage ?? null,
  ctaLabel: slide.ctaLabel ?? null,
  ctaUrl: slide.ctaUrl ?? null,
  sequence: slide.sequence,
});

/**
 * The slides this host should show.
 *
 * A branch-pinned domain gets that branch's own slides; if the branch has none,
 * it falls back to the company-wide ones (`branch_id IS NULL`) — the same
 * branch → company fallback the logo and favicon already follow, so a new
 * branch site is never blank and an existing campaign is never silently
 * replaced. A company-wide host only ever shows company-wide slides.
 */
async function resolveSlides(companyId, branchId) {
  const where = { companyId, status: STATUS.ACTIVE };
  const order = [['sequence', 'ASC'], ['id', 'ASC']];

  if (branchId) {
    const own = await db.Slider.findAll({ where: { ...where, branchId }, order });
    if (own.length) return own;
  }

  return db.Slider.findAll({ where: { ...where, branchId: null }, order });
}

/** Everything a public website may show for a host that named no tenant. */
const platformDetails = (host) => ({
  resolved: false,
  host,
  code: null,
  name: 'Aj Smart Biz',
  legalName: null,
  description: null,
  logo: null,
  favicon: null,
  businessType: null,
  theme: null,
  contact: { email: null, phone: null, alternatePhone: null, website: null },
  address: { line1: null, line2: null, city: null, state: null, stateCode: null, country: null, pincode: null },
  locale: { currency: null, timezone: null },
  branch: null,
  headOffice: null,
  branches: [],
  sliders: [],
  // No tenant, so no optional functionality. Every key is present and null so a
  // template can read `features.whatsapp` without guarding the parent.
  features: {
    whatsapp: null,
    shareLink: null,
    about: null,
    figures: null,
    team: null,
    gallery: null,
    testimonials: null,
    benefits: null,
    services: null,
  },
  // The Contact page exists for every tenant, so the platform default carries
  // a usable block rather than null.
  contactPage: {
    eyebrow: 'Contact',
    title: 'Talk to {company}',
    lead: 'Tell us what you need and we will come back with questions, a scope and a number.',
    showForm: true,
    formTarget: 'email',
    formNote: 'We usually reply within one working day.',
    showLocations: true,
  },
  // Nothing resolved, so nothing is being withheld — the platform default page
  // is not a lapsed tenant.
  service: { active: true, reason: null },
});

/**
 * GET /public/company-details
 *
 * The whole public profile of the tenant that owns a host: name, tagline, logo,
 * favicon, theme, contact details, address and branches. This is what the
 * customer-facing websites in `websites/` launch with — they pass the domain they
 * were served on and render whatever comes back.
 *
 * Unauthenticated, like `/public/branding`, and bound by the same two rules:
 *
 *  - **Only what a company publishes about itself.** No GST or PAN number, no
 *    plan, subscription, transaction or admin data, no counts. Everything here is
 *    what a business prints on its own letterhead.
 *  - **An unknown or inactive tenant is indistinguishable from a real one that
 *    resolved to nothing** — both get `resolved: false` and platform defaults,
 *    never an error, so the endpoint cannot be walked to enumerate tenants.
 *
 * `branch` is the branch this domain is pinned to (`sub_company_id`) and nothing
 * else — null on a company-wide host — so a site can tell "this domain is the
 * Surat branch" from "this is the company". `headOffice` is always the main
 * branch, so there is a real address to fall back on either way.
 *
 * `sliders` are the active hero slides for this host, already ordered and
 * already resolved branch-wise — see `resolveSlides`.
 *
 * `service` says whether the tenant's plan still entitles it to be served, so a
 * site can put up a holding page instead of its content — see
 * `services/serviceState.service`, which the console's quota guard shares, so a
 * company blocked there cannot have its website carry on regardless.
 *
 * `features` carries the optional functionality this tenant is actually
 * entitled to right now — WhatsApp numbers, the share button — and a key is
 * `null` unless the plan granted it, the company switched it on and the plan is
 * still being served. The site renders on presence alone; deciding what a
 * tenant may show is the API's job, not the template's. See
 * `services/functionality.service`.
 */
const companyDetails = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  if (!company || company.status !== STATUS.ACTIVE) {
    return success(res, { message: 'Company details fetched successfully', data: platformDetails(host) });
  }

  const [preset, businessType, state, branches] = await Promise.all([
    // The shared preset. The company's own colours are laid over it below.
    company.themeId
      ? db.Theme.findOne({
        where: { id: company.themeId, status: STATUS.ACTIVE },
        attributes: ['primaryColor', 'secondaryColor', 'accentColor', 'mode'],
      })
      : null,
    company.businessTypeId
      ? db.BusinessType.findOne({
        where: { id: company.businessTypeId, status: STATUS.ACTIVE },
        attributes: ['id', 'name', 'slug'],
      })
      : null,
    company.stateId ? db.State.findOne({ where: { id: company.stateId }, attributes: ['name', 'code', 'country'] }) : null,
    db.Branch.findAll({
      where: { companyId: company.id, status: STATUS.ACTIVE },
      include: [{ model: db.State, as: 'state', attributes: ['name', 'code', 'country'], required: false }],
      order: [['isMain', 'DESC'], ['name', 'ASC']],
    }),
  ]);

  const functionalities = await functionalityService.getFunctionalities(company.id);

  /**
   * Ahead of the rest, because the menu depends on it: a page whose `content`
   * key is null in here is not in the menu, so `publicNav` has to be able to
   * read the finished payload rather than count the same rows a second time.
   * See `NAV_PAGES`.
   *
   * The pinned branch goes in, so About/Team/Gallery/Services resolve
   * branch-first the same way the slides do.
   */
  const features = await functionalityService.publicFeatures(company.id, branch?.id ?? null);

  const [slides, service, contactPage, nav] = await Promise.all([
    resolveSlides(company.id, branch?.id ?? null),
    resolveServiceState(company.id),
    // Alongside `features` rather than inside it, because the template reaches
    // for it by name on one page. Null when the tenant is not entitled to a
    // Contact page or has it switched off — the website then drops the page and
    // its nav link, rather than serving an empty one.
    functionalityService.publicContact(company.id, branch?.id ?? null),
    /**
     * The menu. Built by the API so a page's name is the tenant's to set and a
     * page they are not entitled to never reaches the template at all.
     */
    functionalityService.publicNav(company.id, branch?.id ?? null, functionalities.activeKeys, features),
  ]);

  const mainBranch = branches.find((row) => row.isMain) ?? null;
  // Only a domain actually pinned to a branch reports one; the full row is
  // preferred over the one the resolver loaded, so it carries its state.
  const pinnedBranch = branch ? branches.find((row) => row.id === branch.id) ?? branch : null;

  return success(res, {
    message: 'Company details fetched successfully',
    data: {
      resolved: true,
      host,
      code: company.code,
      name: company.name,
      legalName: company.legalName ?? null,
      description: company.description ?? null,
      // Pinned branch -> company -> head office, the same order `/branding` uses.
      logo: branch?.logo || company.logo || mainBranch?.logo || null,
      favicon: branch?.favicon || company.favicon || mainBranch?.favicon || null,
      businessType: businessType
        ? { id: businessType.id, name: businessType.name, slug: businessType.slug ?? null }
        : null,
      /**
       * The preset with the company's own colours laid over it, key by key.
       * `null` when neither has anything to say, which every template reads as
       * "use the design you shipped with". See `services/theme.service`.
       */
      theme: resolveTheme({ branch, company, preset }),
      contact: {
        email: company.email ?? null,
        phone: company.phone ?? null,
        alternatePhone: company.alternatePhone ?? null,
        website: company.website ?? null,
      },
      address: addressOf(company, state),
      locale: { currency: company.currency ?? null, timezone: company.timezone ?? null },
      branch: publicBranch(pinnedBranch),
      headOffice: publicBranch(mainBranch),
      branches: branches.map(publicBranch),
      sliders: slides.map(publicSlide),
      features,
      contactPage,
      nav,
      service,
    },
  });
});

/* ------------------------------------------------------------------ *
 * Testimonial submission
 * ------------------------------------------------------------------ */

/**
 * POST /public/testimonials
 *
 * A customer writing a review on a tenant's own website. The only route on the
 * platform that lets an unauthenticated stranger create a row, so every one of
 * its rules exists to keep that narrow:
 *
 *  - **The tenant comes from the host, never from the body.** The same resolver
 *    `/public/company-details` uses. There is no `companyId` field to send, so
 *    a review cannot be aimed at a company whose site the writer never visited.
 *  - **Only when the tenant is actually collecting.** The feature has to be
 *    live — plan, switch and served, the same three conditions as everything
 *    else — the mode has to be `dynamic`, *and* the review button has to be the
 *    one that opens our own form. A company running a curated wall has no open
 *    form and no open endpoint, which are the same fact; a company that points
 *    its button at Google is in exactly the same position, because the form it
 *    would have been posting from is not on the site either.
 *  - **Always pending.** `moderation` and `source` are set here and are not
 *    fields a body can carry. Nothing a stranger sends can reach a website
 *    without someone at the company approving it first.
 *  - **Branch-stamped from the domain.** A review written on the Surat site
 *    belongs to Surat, so it appears on that site's wall rather than the
 *    company's.
 *
 * The reply is deliberately the same whether or not the review was the first
 * one that day: it reports that the review was received, never how many exist
 * or what happens next internally.
 */
const submitTestimonial = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  /**
   * A host that matched no tenant is refused with the same message an inactive
   * one gets. `/public/branding` and `/public/company-details` both answer an
   * unknown host with platform defaults rather than an error precisely so the
   * endpoint cannot be walked to enumerate tenants, and a distinct "no such
   * company" here would undo that for the price of a POST.
   */
  const refuse = () => {
    throw ApiError.badRequest('This website is not accepting reviews at the moment');
  };

  if (!company || company.status !== STATUS.ACTIVE) refuse();

  const { activeKeys } = await functionalityService.getFunctionalities(company.id);
  if (!activeKeys.includes(FUNCTIONALITY.TESTIMONIALS)) refuse();

  const row = await db.CompanyFunctionality.findOne({
    where: { companyId: company.id, key: FUNCTIONALITY.TESTIMONIALS },
  });
  const settings = functionalityService.testimonialSettings(row?.settings);
  if (settings.mode !== TESTIMONIAL_MODE.DYNAMIC) refuse();
  /*
   * The button sends people elsewhere, so there is no form on the site and this
   * endpoint is shut with it. Checked rather than assumed from the mode: the
   * two settings move independently, and this is the one that decides whether
   * a stranger can write a row.
   */
  if (settings.reviewTarget !== TESTIMONIAL_REVIEW_TARGET.FORM) refuse();

  const { authorName, authorRole, authorEmail, authorPhone, rating, body } = req.body;

  await db.CompanyTestimonial.create({
    companyId: company.id,
    // The branch whose domain this was written on; null on a company-wide host.
    branchId: branch?.id ?? null,
    authorName,
    authorRole: authorRole || null,
    authorEmail: authorEmail || null,
    authorPhone: authorPhone || null,
    // The form can be configured without stars; a rating sent anyway is dropped
    // rather than saved, so the section's average means what it says.
    rating: settings.showRating ? rating ?? null : null,
    body,
    /* Not from the body, and there is no body field that could carry them. */
    source: TESTIMONIAL_SOURCE.VISITOR,
    moderation: TESTIMONIAL_MODERATION.PENDING,
    /* `sequence` is left at 0 until someone approves it — see `moderateTestimonial`. */
    submittedIp: req.ip ?? null,
    createdBy: null,
  });

  /**
   * The row is not echoed back. A pending review is not public, and returning
   * the record — with its id — would hand a submitter a handle on something
   * nobody has agreed to publish.
   */
  return created(res, 'Thank you — your review has been sent to us for publishing', {
    received: true,
  });
});

/* ------------------------------------------------------------------ *
 * Service enquiries
 * ------------------------------------------------------------------ */

/**
 * POST /website/service-leads
 *
 * Somebody asking a tenant to ring them back about one of its services. The
 * second route on the platform that lets an unauthenticated stranger create a
 * row, and it is narrow for the same reasons the first one is:
 *
 *  - **The tenant comes from the host, never from the body.** There is no
 *    `companyId` field to send, so an enquiry cannot be aimed at a company
 *    whose website the sender never opened.
 *  - **Only against a service that is actually published.** The functionality
 *    has to be live, the service has to belong to this tenant, and it has to be
 *    active. An id pointing at another company's service, or at one that was
 *    switched off, is refused rather than recorded against nothing.
 *  - **Only where the form records at all.** A tenant that pointed the button
 *    at WhatsApp has no inbox on the platform, and this endpoint is shut with
 *    it — the same rule that closes testimonial submissions on a curated wall.
 *  - **Branch-stamped from the domain.** An enquiry raised on the Surat site
 *    belongs to Surat.
 *
 * What comes back is deliberately thin: that it was received, and — where the
 * tenant is also handing enquiries to WhatsApp — the number to open. It never
 * reports how many enquiries exist or what happens to one next.
 */
/**
 * Everything a service write or a diary read needs about this tenant, resolved
 * from the **host** and in one place.
 *
 * The settings, the enquiry route and the diary are read here rather than in
 * each handler, so the page a visitor was shown and the request the API accepts
 * are decided by the same three answers. `refuse` is passed in because the write
 * path and the read path fail differently: a POST says one vague thing however
 * it failed, and a GET may honestly 404.
 */
async function resolveServiceTenant(req) {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);
  if (!company || company.status !== STATUS.ACTIVE) return null;

  const { activeKeys } = await functionalityService.getFunctionalities(company.id);
  if (!activeKeys.includes(FUNCTIONALITY.SERVICES)) return null;

  const row = await db.CompanyFunctionality.findOne({
    where: { companyId: company.id, key: FUNCTIONALITY.SERVICES },
  });
  const settings = functionalityService.serviceSettings(row?.settings);

  /* The number decides what the button was allowed to do, resolved the same way
     the website's payload resolves it. */
  const numbers = activeKeys.includes(FUNCTIONALITY.WHATSAPP)
    ? await db.CompanyWhatsapp.findAll({
      where: { companyId: company.id, status: STATUS.ACTIVE },
      order: [['sequence', 'ASC'], ['id', 'ASC']],
    })
    : [];
  const enquiryNumber =
    numbers.find((entry) => entry.type === 'inquiry') ?? numbers.find((entry) => entry.type === 'contact') ?? numbers[0] ?? null;

  const target = functionalityService.serviceEnquiryTarget(settings, enquiryNumber);

  /**
   * A booking needs somewhere to **land**.
   *
   * On a WhatsApp-only site nothing is recorded, so there would be no row to
   * accept, no status to show the customer and no diary to keep the next person
   * out of the slot. The same condition `publicServices` applies when it decides
   * whether to paint the panel at all.
   */
  const bookingLive =
    activeKeys.includes(FUNCTIONALITY.SERVICE_BOOKING) &&
    Boolean(target) &&
    target !== SERVICE_ENQUIRY_TARGET.WHATSAPP;

  return {
    company,
    branch,
    activeKeys,
    settings,
    enquiryNumber,
    target,
    bookingLive,
    /** Whether an enquiry may be made at all. A grant, not a setting. */
    enquiryLive: activeKeys.includes(FUNCTIONALITY.SERVICE_ENQUIRY),
    /** Whether a slot needs a name attached to it - see `publicFeatures`. */
    requiresSignIn: activeKeys.includes(FUNCTIONALITY.CUSTOMERS),
  };
}

/**
 * GET /website/services/:slug/slots
 *
 * One day of a service's diary, and the next few days that have anything free.
 *
 * Answered by the **same generator** the booking route checks against, so a time
 * this endpoint paints is a time that endpoint will accept - and one it greys
 * out is one that would have been refused. Two implementations of "is ten
 * o'clock free" is how a website comes to offer a slot that no longer exists.
 *
 * 404 rather than an empty list when this tenant is not taking bookings: there
 * is no diary here, which is a different fact from a diary with nothing in it.
 */
const serviceSlots = asyncHandler(async (req, res) => {
  const tenant = await resolveServiceTenant(req);
  if (!tenant || !tenant.bookingLive) throw ApiError.notFound('This website is not taking bookings');

  const service = await db.CompanyService.findOne({
    where: { companyId: tenant.company.id, slug: String(req.params.slug).trim(), status: STATUS.ACTIVE },
  });
  if (!service || !service.bookable) throw ApiError.notFound('That service cannot be booked');

  /* The **booking** half of the blob, not the whole of it: the diary knows about
     hours and grids, and nothing about eyebrows and button labels. */
  const settings = tenant.settings.booking;

  const openDays = await bookingService.nextOpenDays({ company: tenant.company, service, settings });

  /**
   * With no date asked for, open on the **next day that has something free**
   * rather than on today.
   *
   * Today is the obvious default and the wrong one: a salon closing at one
   * o'clock spends every afternoon showing a visitor an empty grid and the word
   * "nothing left", when what they came to find out is when they *can* come.
   * Decided here rather than in the page so every client gets it.
   */
  const date = req.query.date ? String(req.query.date) : openDays[0]?.date ?? bookingService.today();

  const day = await bookingService.slotsFor({ company: tenant.company, service, settings, date });

  return success(res, {
    message: 'Slots fetched successfully',
    data: {
      service: {
        id: service.id,
        slug: service.slug,
        title: service.title,
        durationMinutes: service.durationMinutes ?? null,
      },
      /** Whether the visitor has to sign in before the slot can be taken. */
      requiresSignIn: tenant.requiresSignIn,
      day,
      /**
       * The next few days with anything free.
       *
       * Looked up rather than left to the visitor to hunt for: a salon closed
       * Sunday and Monday and full on Tuesday should not make somebody click
       * through three empty days to find Wednesday.
       */
      openDays,
      from: bookingService.today(),
      to: bookingService.addDays(bookingService.today(), settings.horizonDays),
    },
  });
});

const submitServiceLead = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  /**
   * Refused with one message however it failed, exactly as a testimonial is: a
   * distinct "no such company" would turn a POST into a way of enumerating
   * tenants, which is precisely what the read endpoints are careful not to be.
   */
  const refuse = () => {
    throw ApiError.badRequest('This website is not accepting enquiries at the moment');
  };

  if (!company || company.status !== STATUS.ACTIVE) refuse();

  const tenant = await resolveServiceTenant(req);
  if (!tenant) refuse();

  const { settings, enquiryNumber, target } = tenant;
  /* No button on the site, or a button that only opens WhatsApp — either way
     there is nothing here to write to. */
  if (!target || target === SERVICE_ENQUIRY_TARGET.WHATSAPP) refuse();

  const { serviceId, name, phone, sourceUrl, bookingDate, bookingTime } = req.body;
  /** A time was asked for, so this is an appointment rather than a question. */
  const wantsSlot = Boolean(bookingDate && bookingTime);

  /**
   * The service is checked against this tenant rather than trusted. Without it
   * an enquiry could be filed against another company's service id, and the
   * title copied onto the row would be that company's wording.
   */
  const service = await db.CompanyService.findOne({
    where: { id: serviceId, companyId: company.id, status: STATUS.ACTIVE },
  });
  if (!service) refuse();

  /**
   * A booking has three more ways to be refused than an enquiry, and they are
   * all about a promise nobody meant to make:
   *
   *  - the company is not taking appointments at all
   *  - this service is not one of the ones that can be booked (a salon takes
   *    bookings for a haircut and enquiries about a wedding party)
   *  - the visitor is not signed in, on a shop that runs customer accounts
   *
   * The third is the same rule the checkout applies, for the same reason: an
   * appointment is a promise with a name on it, and a shop with a customer list
   * should be able to find the person who booked. **Enforced here**, not only in
   * the page - a website hiding a form is a suggestion.
   */
  if (wantsSlot) {
    if (!tenant.bookingLive) refuse();
    if (!service.bookable) refuse();
  } else if (!tenant.enquiryLive) {
    /**
     * This tenant does not have service enquiries - the plan does not carry
     * them, the switch is off, or the term has lapsed - so there is no form on
     * the site to have sent this. Refused here rather than only hidden there,
     * for the reason every other gate on this platform is enforced twice: a
     * website that hides a form is a suggestion, and this endpoint is reachable
     * without it.
     *
     * A **booking** is unaffected - it is checked above, on its own rules. A shop
     * can take appointments and no enquiries.
     */
    refuse();
  }

  /**
   * The account that asked, where one was signed in.
   *
   * Optional here, unlike an order on a shop running accounts: an enquiry is a
   * question, and refusing to take one from somebody who has not signed in would
   * turn away the very conversation the form exists to start. What the account
   * buys is the service history on their own page.
   */
  const enquirer =
    req.auth?.scope === AUTH_SCOPE.CUSTOMER && req.auth.companyId === company.id ? req.customer : null;

  /**
   * Sign in first, then book.
   *
   * Only for a **booking**, and only where the tenant runs customer accounts. An
   * enquiry stays open to strangers on purpose: it is a question, and refusing
   * to take one from somebody who has not signed in turns away the conversation
   * the form exists to start. A slot is different - it is a commitment on both
   * sides, and the shop has a customer list to put a name on.
   */
  if (wantsSlot && tenant.requiresSignIn && !enquirer) {
    throw ApiError.unauthorized('Please sign in to book a time');
  }

  /**
   * A signed-in customer is not asked who they are.
   *
   * Their own name and number, from their account, exactly as the checkout
   * takes the orderer's - and not from the body, which would let a signed-in
   * visitor book under somebody else's name.
   */
  const asked = {
    name: enquirer ? enquirer.name : name,
    phone: enquirer ? enquirer.phone : phone,
  };
  /**
   * A stranger has to say who they are. Told plainly rather than through the
   * one vague refusal above: this request has already proved it knows a real
   * service on a real tenant, so there is nothing left to give away - and
   * "this website is not accepting enquiries" would be a lie to somebody who
   * simply left a box empty.
   */
  if (!asked.name || !asked.phone) {
    throw ApiError.badRequest('Tell us your name and a number we can reach you on');
  }

  /**
   * The slot, taken inside a transaction.
   *
   * `assertSlotFree` runs the same generator that painted the page, **inside**
   * the transaction, so two people racing for the last chair cannot both be told
   * yes: the second one reads the first one's row and is refused with a message
   * that says somebody has just taken it.
   */
  const booking = { date: null, time: null, minutes: null, status: null };

  const lead = await db.sequelize.transaction(async (transaction) => {
    if (wantsSlot) {
      booking.minutes = await bookingService.assertSlotFree({
        company,
        service,
        /* The booking half, exactly as the read path passes it. */
        settings: settings.booking,
        date: bookingDate,
        time: bookingTime,
        transaction,
      });
      booking.date = bookingDate;
      booking.time = bookingTime;
      /* Requested, never accepted: a slot somebody picked is a request until
         the company says otherwise. Confirming it is a person's decision. */
      booking.status = BOOKING_STATUS.REQUESTED;
    }

    return db.ServiceLead.create({
      companyId: company.id,
      branchId: branch?.id ?? null,
      serviceId: service.id,
    /* Copied, not joined — see the model. An enquiry is a thing that happened. */
    serviceTitle: service.title,
    /**
     * What the card said it cost, copied for the same reason the title is — and
     * copied **even when the tenant is not publishing it**, because this is the
     * shop's own record of what was quoted, not the public page. The website
     * never sees this field.
     */
      servicePriceLabel: service.priceLabel || null,
      customerId: enquirer?.id ?? null,
      name: asked.name,
      phone: asked.phone,
      /**
       * The appointment, or nulls. `bookingMinutes` is **copied** from the
       * service rather than read through the join later, the same rule the title
       * and the price label follow: a salon that changes a treatment from 30
       * minutes to 45 must not silently rewrite yesterday's diary.
       */
      bookingDate: booking.date,
      bookingTime: booking.time,
      bookingMinutes: booking.minutes,
      bookingStatus: booking.status,
      /* Not fields a body can carry. */
      sentToWhatsapp: target === SERVICE_ENQUIRY_TARGET.BOTH,
      sourceUrl: sourceUrl || null,
      submittedIp: req.ip ?? null,
      createdBy: null,
    }, { transaction });
  });

  return created(
    res,
    wantsSlot
      ? 'Thank you — your time is requested and we will confirm it shortly'
      : 'Thank you — we have your details and will be in touch',
    {
      received: true,
      /**
       * What was asked for, echoed back so the page can print it without
       * re-deriving anything. `status` is `requested`: a slot is not an
       * appointment until a person at the company says it is.
       */
      booking: wantsSlot
        ? { id: lead.id, date: booking.date, time: booking.time, minutes: booking.minutes, status: booking.status }
        : null,
      /**
       * The website opens WhatsApp itself, with a message composed from what the
       * visitor typed. Sent back rather than assumed so the page does not have to
       * re-derive what the API just decided.
       */
      whatsapp:
        target === SERVICE_ENQUIRY_TARGET.BOTH && enquiryNumber
          ? {
            number: functionalityService.digitsOnly(enquiryNumber.number),
            countryCode: functionalityService.digitsOnly(enquiryNumber.countryCode),
          }
          : null,
    }
  );
});

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

/**
 * POST /website/orders
 *
 * A cart, from a stranger, turned into an order.
 *
 * ### Why this is a write at all
 *
 * The cart shipped without one: an order was composed into a WhatsApp message or
 * a payment link and nothing was kept. That bargain holds until somebody asks how
 * many they sold last month, and then it does not hold at all — a chat thread
 * cannot be counted, filtered, or reconciled against a shelf. So the order is now
 * always recorded, and the mode decides only what happens next.
 *
 * ### The rule that matters
 *
 * **Nothing about money comes from the body.** It carries product ids and
 * quantities; every figure on the resulting order is read off this tenant’s
 * own catalogue inside `placeOrder`. A body that could name its own price is a
 * shop that can be bought from at a price the customer chose, and no amount of
 * validation elsewhere recovers from that.
 *
 * ### Refused the same way however it failed
 *
 * One message for every rejection, exactly as the testimonial and enquiry
 * endpoints do it. A distinct "no such company" would turn a POST into a way of
 * enumerating tenants, which is precisely what the read endpoints here are
 * careful not to be.
 *
 * The checks are the same three the website’s own cart hangs off, resolved by
 * the same function that builds its payload — so a button a visitor can press
 * and a request this route accepts can never disagree about whether this shop
 * takes orders.
 */
const submitOrder = asyncHandler(async (req, res) => {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);

  const refuse = () => {
    throw ApiError.badRequest('This website is not accepting orders at the moment');
  };

  if (!company || company.status !== STATUS.ACTIVE) refuse();

  const { activeKeys } = await functionalityService.getFunctionalities(company.id);
  /* Orders sits on top of the catalogue. Without both there is nothing to buy
     and nowhere to record buying it. */
  if (!activeKeys.includes(FUNCTIONALITY.ORDERS) || !activeKeys.includes(FUNCTIONALITY.PRODUCTS)) refuse();

  const row = await db.CompanyFunctionality.findOne({
    where: { companyId: company.id, key: FUNCTIONALITY.ORDERS },
  });
  const settings = functionalityService.orderSettings(row?.settings);

  /**
   * The numbers decide what the cart was allowed to do, resolved here the way
   * the website’s payload resolves them — one function, so the form a visitor
   * was shown and the request this route accepts cannot disagree.
   */
  const numbers = activeKeys.includes(FUNCTIONALITY.WHATSAPP)
    ? await db.CompanyWhatsapp.findAll({
      where: { companyId: company.id, status: STATUS.ACTIVE },
      order: [['sequence', 'ASC'], ['id', 'ASC']],
    })
    : [];

  const byType = {};
  numbers.forEach((entry) => {
    if (!byType[entry.type]) byType[entry.type] = entry;
  });
  const fallback = byType[WHATSAPP_FALLBACK_TYPE] ?? numbers[0] ?? null;

  const orders = functionalityService.publicOrders(settings, numbers.length ? { byType, primary: fallback } : null);
  /* No cart on this site — the mode is off, or the route the tenant chose has
     nothing behind it. Either way there was no button, so there is nothing here
     to accept. */
  if (!orders) refuse();

  const { items, name, phone, address, note, sourceUrl } = req.body;

  /**
   * The signed-in customer, where there is one.
   *
   * The route takes an **optional** token: a shop running accounts still sells to
   * people who did not sign in, and refusing those would be turning away money to
   * tidy a foreign key. The scope is checked rather than assumed — an admin
   * token reaching here must not file an order against an admin's id.
   *
   * Their company has to match the host's, which is what stops a token from one
   * tenant's site being used to place an order on another's.
   */
  const account =
    req.auth?.scope === AUTH_SCOPE.CUSTOMER && req.auth.companyId === company.id ? req.customer : null;

  /**
   * A saved address, picked at checkout instead of typed again.
   *
   * Resolved **here** from the customer's own rows, never taken as text from the
   * body — an id is checked against this account, and the address that lands on
   * the order is the platform's own formatting of it. A body that could name any
   * address id would be a way of reading other people's addresses back out of
   * their own order confirmations.
   *
   * The finished text is then copied onto the order like everything else, so the
   * customer editing or deleting that address later does not rewrite where a
   * delivered order went.
   */
  let addressText = address || null;

  if (account && req.body.addressId) {
    const saved = await db.CustomerAddress.findOne({
      where: { id: req.body.addressId, companyId: company.id, customerId: account.id },
      include: [{ model: db.State, as: 'state', attributes: ['id', 'name'], required: false }],
    });
    if (!saved) refuse();
    addressText = customerService.formatAddress(saved);
  }

  /**
   * A shop running customer accounts takes orders from **account holders**.
   *
   * This is the server half of the rule, and without it the rule does not exist:
   * the website hiding its checkout behind a sign-in is a suggestion, and the
   * endpoint is open to anybody who skips the page. A tenant who has bought
   * customer management has said they want to know who is buying, and an order
   * that arrives from nobody defeats the whole point of the customer list, the
   * order history and the saved addresses.
   *
   * A tenant **without** the feature is untouched: no accounts exist, every order
   * is a stranger with a form, and that is exactly as it was before any of this.
   */
  if (activeKeys.includes(FUNCTIONALITY.CUSTOMERS) && !account) {
    throw ApiError.unauthorized('Please sign in to place your order');
  }

  /**
   * The tenant decides which details its form asks for, so the schema cannot
   * check them — it does not know. Checked here against the company’s own
   * settings, which is the only place the answer exists, and refused rather
   * than accepted-and-blank: an order with no phone number on a shop that asks
   * for one is an order nobody can confirm.
   */
  /* What the account already knows counts as supplied — a signed-in customer
     should not be asked for their own name again to satisfy a tenant setting. */
  if (settings.requireName && !String(name ?? '').trim() && !account?.name) refuse();
  if (settings.requirePhone && !String(phone ?? '').trim() && !account?.phone) refuse();
  if (settings.requireAddress && !String(addressText ?? '').trim()) refuse();

  const order = await db.sequelize.transaction(async (transaction) =>
    orderService.placeOrder(
      {
        company,
        branchId: branch?.id ?? null,
        lines: items,
        customer: { name, phone, address: addressText, note },
        account,
        mode: orders.mode,
        meta: {
          sentToWhatsapp: Boolean(orders.whatsapp),
          sourceUrl,
          ip: req.ip ?? null,
        },
      },
      transaction
    )
  );

  /**
   * The minimum, checked against the total the platform could actually compute.
   *
   * After the lines are priced rather than before, because the prices are the
   * catalogue’s and the body has none — there is nothing to check until the
   * order has been built. A basket priced entirely in words has a total of zero
   * and no way of knowing whether it clears a floor, so the floor does not apply
   * to it; a shop that prices in words and sets a minimum has asked for two
   * things that do not fit together, and the one worth keeping is the order.
   */
  if (settings.minOrderAmount && Number(order.subtotal) > 0 && Number(order.subtotal) < settings.minOrderAmount) {
    throw ApiError.badRequest(`Orders start at ${settings.minOrderAmount}`);
  }

  return created(res, `Thank you — your order ${order.orderNo} has been received`, {
    received: true,
    orderNo: order.orderNo,
    /* So a signed-in customer's history is known to have gained a row. */
    customerId: order.customerId ?? null,
    total: Number(order.total),
    currency: order.currency,
    /**
     * What the page does next. Sent back rather than assumed so the cart does
     * not have to re-derive what the API has just decided — and so the order
     * number, which only exists now, can go into the message the visitor sends.
     */
    whatsapp: orders.whatsapp
      ? {
        number: functionalityService.digitsOnly(orders.whatsapp.number),
        countryCode: functionalityService.digitsOnly(orders.whatsapp.countryCode),
      }
      : null,
  });
});

/* ------------------------------------------------------------------ *
 * Lead tracking
 * ------------------------------------------------------------------ */

/**
 * POST /public/leads
 *
 * Fired by a tenant's website on every launch. Records the visit, and the
 * device behind it as a lead — see `lead.service` for what that means and how
 * one device stays one row.
 *
 * This is the second unauthenticated write on the platform, and it differs from
 * the testimonial one in the way that matters most: **it never fails loudly.**
 *
 * A visitor is reading a page. Nothing they came for depends on this call, and
 * a 4xx on every page load would put a red line in the console of a working
 * website, tempt someone into retrying it, and tell whoever asked whether a
 * hostname is a tenant. So every outcome that is not a stored visit answers
 * `200 { tracked: false }` — an unknown host, an inactive company, a payload
 * the database refused. What went wrong is logged server-side, where the people
 * who can fix it are, rather than returned to the person it did not happen to.
 *
 * The tenant is resolved from the host exactly as everywhere else in this file,
 * so there is no `companyId` field to send and a visit cannot be aimed at a
 * company whose website the sender never opened.
 *
 * `deviceId` comes back in the response. A first-time visitor whose browser had
 * nothing stored gets the id the server derived, and the site can keep it — so
 * the second page load is recognisably the same person even where the tracker
 * had no identity of its own to send.
 */
/* ------------------------------------------------------------------ *
 * The blog
 * ------------------------------------------------------------------ */

/**
 * The tenant whose blog is being read, or nothing.
 *
 * Every blog route resolves the company the same way `/company-details` does -
 * from the **host** - and then asks the same question the payload asks: is this
 * functionality live for them today? A tenant whose plan has lapsed has no blog,
 * so its archive is not a page with a notice on it but a 404, exactly as the
 * Services page is.
 */
async function resolveBlogTenant(req) {
  const host = resolveHost(req);
  const { company, branch } = await resolveTenantByHost(host);
  if (!company || company.status !== STATUS.ACTIVE) return null;

  const { activeKeys } = await functionalityService.getFunctionalities(company.id);
  if (!activeKeys.includes(FUNCTIONALITY.BLOG)) return null;

  const row = await db.CompanyFunctionality.findOne({
    where: { companyId: company.id, key: FUNCTIONALITY.BLOG },
  });

  return { company, branchId: branch?.id ?? null, settings: functionalityService.blogSettings(row?.settings) };
}

/**
 * GET /website/blog
 *
 * The archive, a page at a time.
 *
 * **The one paged public list on the platform**, and it exists because a blog is
 * the one thing here that grows without limit. Services and products ride whole
 * in `/company-details` because they are as long as the business is wide; a
 * tenant writing weekly has two hundred articles in four years, and shipping all
 * of them with every render of every page would make the home page pay for the
 * archive forever.
 *
 * So the payload carries the latest handful for the band on the home page, and
 * the rest is asked for here, by the page that actually shows it.
 *
 * Bodies are **not** in this response. A listing prints a title, a picture and a
 * line or two; the article itself is fetched by the page that renders it.
 */
const blogList = asyncHandler(async (req, res) => {
  const tenant = await resolveBlogTenant(req);
  if (!tenant) throw ApiError.notFound('No blog here');

  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || BLOG_PAGE_SIZE;
  const offset = (page - 1) * limit;

  /**
   * The filters a reader can actually use. Both are narrow on purpose: `tag`
   * follows a label from a card, and `search` is the box on the archive. There
   * is no branch parameter, no status and no id - the host decides the first and
   * the API decides the rest, so nothing a caller sends can widen what they see.
   */
  const where = {};
  if (req.query.tag) {
    /* Through the same helper the console's filter uses; see `tagWhere`. */
    const tagged = functionalityService.tagWhere(req.query.tag);
    if (tagged) where[Op.and] = [tagged];
  }
  if (req.query.search) {
    const term = String(req.query.search).trim();
    where[Op.or] = [
      { title: { [Op.like]: `%${term}%` } },
      { excerpt: { [Op.like]: `%${term}%` } },
    ];
  }

  const { rows, count } = await functionalityService.blogScoped(tenant.company.id, tenant.branchId, {
    limit,
    offset,
    where,
  });

  return paginated(
    res,
    { rows: rows.map(functionalityService.publicPostCard), count },
    { page, limit },
    'Blog posts fetched successfully'
  );
});

/**
 * GET /website/blog/:slug
 *
 * One article, whole, with the two beside it.
 *
 * The slug is matched **within the resolved tenant**, never globally: two
 * companies on the platform can both have a post called `how-we-work`, and each
 * host must see its own.
 *
 * A post that exists but is not published yet is a 404 rather than a 403. It is
 * the truthful answer - there is no such page on this website today - and the
 * alternative would let anybody with the URL confirm that a tenant has an
 * article scheduled, which is the tenant's business and nobody else's.
 */
const blogPost = asyncHandler(async (req, res) => {
  const tenant = await resolveBlogTenant(req);
  if (!tenant) throw ApiError.notFound('No blog here');

  const row = await db.CompanyBlogPost.findOne({
    where: functionalityService.publishedWhere({
      companyId: tenant.company.id,
      slug: String(req.params.slug).trim(),
    }),
  });
  if (!row) throw ApiError.notFound('Post not found');

  /**
   * The article before and after it, by date.
   *
   * Sent with the post rather than fetched by a second request, because a reader
   * who has finished one article is at the single most likely moment to read
   * another - and a page that has to go back to the server to offer that will
   * often not offer it in time.
   *
   * Both are ordered by date alone, deliberately ignoring `featured`: "next" and
   * "previous" mean *in time*, and a pinned post appearing as the neighbour of
   * everything would be nonsense.
   */
  const neighbour = (direction) =>
    db.CompanyBlogPost.findOne({
      where: functionalityService.publishedWhere({
        companyId: tenant.company.id,
        branchId: row.branchId,
        publishedAt: {
          [Op.ne]: null,
          [direction === 'next' ? Op.gt : Op.lt]: row.publishedAt,
          ...(direction === 'next' ? { [Op.lte]: new Date() } : {}),
        },
      }),
      order: [['published_at', direction === 'next' ? 'ASC' : 'DESC']],
      attributes: ['id', 'slug', 'title', 'publishedAt'],
    });

  const [previous, next] = await Promise.all([neighbour('previous'), neighbour('next')]);

  const brief = (post) => (post ? { slug: post.slug, title: post.title, publishedAt: post.publishedAt } : null);

  return success(res, {
    message: 'Post fetched successfully',
    data: {
      post: functionalityService.publicBlogPost(row),
      /* The section's wording, so the article page can carry the same eyebrow
         and byline rule as the band without a second request for the payload. */
      settings: {
        eyebrow: tenant.settings.eyebrow,
        ctaLabel: tenant.settings.ctaLabel,
        showAuthor: tenant.settings.showAuthor,
      },
      previous: brief(previous),
      next: brief(next),
    },
  });
});

const trackLead = asyncHandler(async (req, res) => {
  const host = req.body?.domain ? normaliseHost(req.body.domain) : resolveHost(req);
  const declined = (reason) => success(res, { message: reason, data: { tracked: false } });

  const { company, branch } = await resolveTenantByHost(host);
  if (!company || company.status !== STATUS.ACTIVE) return declined('Nothing to track');

  try {
    const { lead, isNewLead, isNewVisit } = await leadService.recordVisit({
      company,
      branch,
      payload: req.body ?? {},
      req,
    });

    return created(res, 'Visit recorded', {
      tracked: true,
      /* So a browser with no storage of its own can adopt the server's id. */
      deviceId: lead.deviceId,
      newLead: isNewLead,
      newVisit: isNewVisit,
    });
  } catch (error) {
    /**
     * Swallowed on purpose, and only here. Analytics must never be able to
     * break the page it is measuring, so a failure to store one visit is this
     * endpoint's problem and nobody else's.
     */
    logger.error(`Lead tracking failed for company ${company.id}: ${error.message}`);
    return declined('Nothing to track');
  }
});

module.exports = {
  serviceSlots,
  blogList,
  blogPost,
  branding,
  companyDetails,
  submitTestimonial,
  submitServiceLead,
  submitOrder,
  trackLead,
  resolveTenantByHost,
  normaliseHost,
  resolveHost,
};
