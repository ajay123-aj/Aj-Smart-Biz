import { NAV_LINKS } from '@/config/site';
import { displayUrl, telHref, toFileUrl, type CompanyDetails } from '@/lib/company';
import { siteContact } from '@/lib/contact';
import styles from './Footer.module.css';

/**
 * White footer. Every line here comes from the company-details API — the logo,
 * the name, the tagline, and the contact block. Placeholders appear only when
 * the host resolved to no tenant.
 */
export default function Footer({ company }: { company: CompanyDetails }) {
  const logo = toFileUrl(company.logo);
  const contact = siteContact(company);
  const year = new Date().getFullYear();
  const legalName = company.legalName ?? company.name;

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.top}`}>
        <div className={styles.about}>
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

          {company.description ? <p className={styles.tagline}>{company.description}</p> : null}

          {company.branch ? (
            <p className={styles.branch}>
              Serving from {company.branch.name}
              {company.branch.address.city ? `, ${company.branch.address.city}` : ''}
            </p>
          ) : null}
        </div>

        <nav className={styles.column} aria-label="Footer">
          <h3 className={styles.columnTitle}>Explore</h3>
          {NAV_LINKS.map((link) => (
            <a key={link.href} className={styles.link} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className={styles.column}>
          <h3 className={styles.columnTitle}>Get in touch</h3>
          {contact.email ? (
            <a className={styles.link} href={`mailto:${contact.email}`}>
              {contact.email}
            </a>
          ) : null}
          {contact.phone ? (
            <a className={styles.link} href={`tel:${telHref(contact.phone)}`}>
              {contact.phone}
            </a>
          ) : null}
          {contact.website ? (
            <a className={styles.link} href={contact.website} rel="noreferrer">
              {displayUrl(contact.website)}
            </a>
          ) : null}
          {contact.address ? <span className={styles.muted}>{contact.address}</span> : null}
          {contact.hours ? <span className={styles.muted}>{contact.hours}</span> : null}
        </div>

        {/* Only worth a column of its own once there is more than the head office. */}
        {company.branches.length > 1 ? (
          <div className={styles.column}>
            <h3 className={styles.columnTitle}>Locations</h3>
            {company.branches.map((branch) => (
              <span key={branch.id} className={styles.muted}>
                {branch.name}
                {branch.address.city ? ` · ${branch.address.city}` : ''}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`container ${styles.bottom}`}>
        <span>
          &copy; {year} {legalName}. All rights reserved.
        </span>
        <span className={styles.meta}>
          {/* Which tenant answered for this host — quietly useful when a new domain
              has just been pointed at the site and nothing looks branded. */}
          {company.resolved ? company.host : `${company.host || 'this host'} · unbranded`}
        </span>
      </div>
    </footer>
  );
}
