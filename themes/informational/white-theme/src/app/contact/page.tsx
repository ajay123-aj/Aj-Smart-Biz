import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import EnquiryForm from '@/components/EnquiryForm';
import WhatsAppButton from '@/components/WhatsAppButton';
import ShareButton from '@/components/ShareButton';
import { CONTACT_PAGE } from '@/config/site';
import {
  displayUrl,
  fillCompany,
  formatTime,
  shareLinkOf,
  telHref,
  whatsappFor,
  type CompanyBranch,
} from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { anonymousMetadata } from '@/lib/metadata';
import { siteContact } from '@/lib/contact';
import styles from './page.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();

  const anonymous = anonymousMetadata(company);
  if (anonymous) return anonymous;

  const page = company.contactPage;

  return {
    title: `${CONTACT_PAGE.metaTitle} · ${company.name}`,
    description: page ? fillCompany(page.lead, company) : undefined,
    // Nothing to index on a page that is about to 404, and a holding page must
    // never be indexed as the company's content either.
    robots: page && company.service.active ? undefined : { index: false, follow: false },
  };
}

/**
 * Contact — its own page rather than the last band on the home page.
 *
 * Everything here is the tenant's: the heading and intro come from their
 * Contact settings, the addresses and hours from their branches, and the
 * enquiry form is switched on and pointed at email or WhatsApp by them.
 *
 * Gated by `contact_page` like About, Team and Gallery: without the grant, or
 * with the switch off, the API sends no settings and the route 404s rather than
 * serving a page the tenant is not publishing. The header drops its nav link on
 * the same signal, so nothing on the site points here while it is off.
 */
export default async function ContactPage() {
  const company = await getCompanyDetails();

  // The plan is what pays for the content — same rule as every other page.
  /**
   * The layout declines to frame the site when the API is unreachable; the page
   * has to decline to render it too. Skipping only the layout would still leave
   * this page in the streamed RSC payload, where its markup — placeholder
   * company and all — remains readable to anyone who looks. Same rule, and the
   * same reason, as the plan check below.
   */
  if (!company.apiReachable) return <ServiceUnavailable />;

  /**
   * The API answered, and said this host belongs to no company. Same rule as
   * the check above and the plan check below: the page has to decline to render
   * as well as the layout, or the site stays readable in the streamed RSC
   * payload with the platform's placeholder company in it.
   */
  if (!company.resolved) return <CompanyNotFound />;

  if (!company.service.active) return <PlanNotice company={company} />;

  // Withheld or switched off. A 404 is the honest answer: the tenant is not
  // publishing this page, so it does not exist on their website.
  const page = company.contactPage;
  if (!page) notFound();

  const contact = siteContact(company);
  const share = shareLinkOf(company);
  const inquiry = whatsappFor(company, 'inquiry');

  /** Branch-pinned hosts speak for their own branch; otherwise all of them. */
  const locations = company.branch ? [company.branch] : company.branches;
  const showLocations = page.showLocations && locations.length > 0;

  return (
    <>
      {/* ------------------------------- masthead ------------------------------- */}
      <header className={styles.masthead}>
        <div className="container">
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link className={styles.crumb} href="/">
              Home
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span aria-current="page">{CONTACT_PAGE.metaTitle}</span>
          </nav>

          <span className="eyebrow">{page.eyebrow}</span>
          <h1 className={styles.title}>{fillCompany(page.title, company)}</h1>
          <p className={styles.lead}>{fillCompany(page.lead, company)}</p>

          {/*
            The fastest ways to reach them, before the form. Someone who just
            wants to phone should not have to read past a text area to find the
            number.
          */}
          <div className={styles.quick}>
            <WhatsAppButton company={company} type="inquiry" label="WhatsApp us" />
            {contact.phone ? (
              <a className={inquiry ? 'btn btn--ghost' : 'btn btn--primary'} href={`tel:${telHref(contact.phone)}`}>
                {contact.phone}
              </a>
            ) : null}
            {contact.email ? (
              <a className="btn btn--ghost" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {/* --------------------------------- body --------------------------------- */}
      <section className="section">
        <div className="container">
          <div className={styles.split}>
            {page.showForm ? (
              <div className={styles.formPanel}>
                <h2 className={styles.panelTitle}>{CONTACT_PAGE.formTitle}</h2>
                <p className={styles.panelLede}>{CONTACT_PAGE.formLede}</p>

                {/*
                  Renders nothing when the chosen route has no address behind it
                  — a send button that goes nowhere is worse than no form.
                */}
                <EnquiryForm
                  target={page.formTarget}
                  email={contact.email}
                  whatsappHref={inquiry?.href ?? null}
                  companyName={company.name}
                  note={page.formNote}
                />
              </div>
            ) : null}

            <aside className={styles.details} aria-label="Contact details">
              <h2 className={styles.panelTitle}>{CONTACT_PAGE.detailsTitle}</h2>

              <dl className={styles.dl}>
                {contact.email ? (
                  <div className={styles.dlRow}>
                    <dt>Email</dt>
                    <dd>
                      <a className={styles.dlLink} href={`mailto:${contact.email}`}>
                        {contact.email}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {contact.phone ? (
                  <div className={styles.dlRow}>
                    <dt>Phone</dt>
                    <dd>
                      <a className={styles.dlLink} href={`tel:${telHref(contact.phone)}`}>
                        {contact.phone}
                      </a>
                      {contact.alternatePhone ? `, ${contact.alternatePhone}` : ''}
                    </dd>
                  </div>
                ) : null}
                {contact.website ? (
                  <div className={styles.dlRow}>
                    <dt>Web</dt>
                    <dd>
                      <a className={styles.dlLink} href={contact.website} rel="noreferrer">
                        {displayUrl(contact.website)}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {contact.address ? (
                  <div className={styles.dlRow}>
                    <dt>Address</dt>
                    <dd>{contact.address}</dd>
                  </div>
                ) : null}
                {contact.hours ? (
                  <div className={styles.dlRow}>
                    <dt>Hours</dt>
                    <dd>{contact.hours}</dd>
                  </div>
                ) : null}
              </dl>

              {share ? (
                <div className={styles.shareRow}>
                  <span className={styles.shareLabel}>{CONTACT_PAGE.shareLabel}</span>
                  <ShareButton share={share} message={fillCompany(share.message, company)} />
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      {/* ------------------------------- locations ------------------------------- */}
      {showLocations ? (
        <section className="section section--muted" id="locations">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">{CONTACT_PAGE.locationsEyebrow}</span>
              <h2 className="section-title">{CONTACT_PAGE.locationsTitle}</h2>
            </div>

            <div className={styles.locationGrid}>
              {locations.map((branch) => (
                <LocationCard key={branch.id} branch={branch} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** One branch: where it is, how to reach it, and a map link when it has coordinates. */
function LocationCard({ branch }: { branch: CompanyBranch }) {
  const lines = [branch.address.line1, branch.address.line2, branch.address.city, branch.address.pincode]
    .filter(Boolean)
    .join(', ');

  const opening = formatTime(branch.openingTime);
  const closing = formatTime(branch.closingTime);

  /**
   * Coordinates make a precise pin; without them the address is still a
   * perfectly good search. Either way the link opens the visitor's own maps.
   */
  const query =
    branch.latitude && branch.longitude
      ? `${branch.latitude},${branch.longitude}`
      : [branch.name, lines].filter(Boolean).join(', ');

  return (
    <article className={styles.location}>
      <h3 className={styles.locationName}>
        {branch.name}
        {/* The tag would just repeat a branch literally named "Head Office". */}
        {branch.isMain && !/head\s*office/i.test(branch.name) ? (
          <span className={styles.locationTag}>Head office</span>
        ) : null}
      </h3>

      {lines ? <p className={styles.locationLine}>{lines}</p> : null}
      {opening && closing ? (
        <p className={styles.locationHours}>
          {opening} – {closing}
        </p>
      ) : null}

      <div className={styles.locationLinks}>
        {branch.phone ? (
          <a className={styles.locationLink} href={`tel:${telHref(branch.phone)}`}>
            {branch.phone}
          </a>
        ) : null}
        {branch.email ? (
          <a className={styles.locationLink} href={`mailto:${branch.email}`}>
            {branch.email}
          </a>
        ) : null}
        {query ? (
          <a
            className={styles.locationLink}
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {CONTACT_PAGE.mapLink}
          </a>
        ) : null}
      </div>
    </article>
  );
}
