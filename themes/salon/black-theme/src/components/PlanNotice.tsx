import { PLAN_NOTICE } from '@/config/site';
import { displayUrl, formatAddress, telHref, toFileUrl, type CompanyDetails } from '@/lib/company';
import styles from './PlanNotice.module.css';

/**
 * Stands in for the whole website when the platform has stopped serving this
 * tenant.
 *
 * It replaces the page rather than sitting on top of it: a lapsed plan means the
 * content is not licensed to be served, so showing the site behind a banner
 * would defeat the point. The tenant's own branding stays, because the visitor
 * arrived looking for that company and a bare platform page would read as "wrong
 * address" rather than "back shortly".
 *
 * Contact details are kept where they exist — someone who followed a link to a
 * real business should still be able to phone it. Only genuine values, though:
 * this page is read by the company's customers, so the template's "Address to be
 * configured" placeholders are deliberately not used here the way they are on
 * the live site's footer.
 */
export default function PlanNotice({ company }: { company: CompanyDetails }) {
  const reason = company.service.reason ?? 'expired';
  const copy = PLAN_NOTICE[reason] ?? PLAN_NOTICE.expired;
  const logo = toFileUrl(company.logo);

  // Real values only — company first, then whichever branch this host resolved.
  const branch = company.branch ?? company.headOffice;
  const contact = {
    email: company.contact.email ?? branch?.email ?? null,
    phone: company.contact.phone ?? branch?.phone ?? null,
    website: company.contact.website,
    address: formatAddress(branch?.address) ?? formatAddress(company.address),
  };

  const fill = (text: string) => text.replace(/\{company\}/g, company.name);

  return (
    <main className={styles.page}>
      <div className={styles.wash} aria-hidden="true" />

      <article className={styles.card}>
        <div className={styles.brand}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.logo} src={logo} alt={`${company.name} logo`} />
          ) : (
            <span className={styles.logoFallback} aria-hidden="true">
              {company.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className={styles.brandName}>{company.name}</span>
        </div>

        <span className="eyebrow">{copy.eyebrow}</span>
        <h1 className={styles.title}>{fill(copy.title)}</h1>
        <p className={styles.body}>{fill(copy.body)}</p>

        {/* Only render a contact block when there is something real in it. */}
        {contact.email || contact.phone || contact.address ? (
          <dl className={styles.contact}>
            {contact.email ? (
              <div className={styles.row}>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </dd>
              </div>
            ) : null}
            {contact.phone ? (
              <div className={styles.row}>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${telHref(contact.phone)}`}>{contact.phone}</a>
                </dd>
              </div>
            ) : null}
            {contact.website ? (
              <div className={styles.row}>
                <dt>Web</dt>
                <dd>{displayUrl(contact.website)}</dd>
              </div>
            ) : null}
            {contact.address ? (
              <div className={styles.row}>
                <dt>Address</dt>
                <dd>{contact.address}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className={styles.owner}>
          <p className={styles.ownerNote}>{copy.ownerNote}</p>
          <a className="btn btn--primary" href={PLAN_NOTICE.renewUrl} rel="noreferrer">
            {PLAN_NOTICE.renewLabel}
          </a>
        </div>
      </article>
    </main>
  );
}
