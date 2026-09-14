import Link from 'next/link';
import WhatsAppButton from './WhatsAppButton';
import { CTA_BAND } from '@/config/site';
import { fillCompany, hasSection, type CompanyDetails } from '@/lib/company';
import styles from './CtaBand.module.css';

/**
 * The "Next step" band that closes a page.
 *
 * One component, used by every page that ends in one, because it was two —
 * home and About each had their own markup, their own copy and their own
 * near-identical block of CSS, which is how they drifted apart: the same band
 * ended up with two buttons on one page and four on the other. Changing it
 * anywhere now changes it everywhere, which is the point.
 *
 * The copy lives in `CTA_BAND`. It is deliberately not a prop: a band that
 * says something different on every page is the thing this replaced.
 */
export default function CtaBand({ company }: { company: CompanyDetails }) {
  return (
    <section className={styles.band}>
      <div className={`container ${styles.inner}`}>
        <div>
          <span className="eyebrow">{CTA_BAND.eyebrow}</span>
          <h2 className={styles.title}>{fillCompany(CTA_BAND.title, company)}</h2>
          <p className={styles.body}>{CTA_BAND.body}</p>
        </div>

        {/*
          Two actions. The phone number and the share button used to be here as
          well, which made the band a row of choices rather than an invitation —
          and neither belonged. A number is a contact detail, and the Contact
          page is a page of them; sharing is not a next step, it is something a
          visitor does for their own reasons, which is what the floating share
          button in the layout is for.
        */}
        <div className={styles.actions}>
          <WhatsAppButton company={company} type="inquiry" label="WhatsApp us" />
          {/* Only when there is a Contact page to send them to. */}
          {hasSection(company, '/contact') ? (
            <Link className="btn btn--ghost" href="/contact">
              {CTA_BAND.button}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
