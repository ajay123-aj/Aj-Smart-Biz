import type { Metadata } from 'next';
import EnquiryForm from '@/components/EnquiryForm';
import BusinessTypesSection from '@/components/BusinessTypesSection';
import Glyph from '@/components/Glyph';
import { CONTACT, DEMO_PAGE } from '@/config/site';
import { PLANS } from '@/content/plans';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Book a free demo',
  description:
    'See the website we would build for your business, free. Tell us your trade and we will call you back the same working day.',
};

/**
 * The demo request.
 *
 * `searchParams` carries `?plan=` from a pricing card, so somebody who pressed
 * "Start with Growth" arrives with Growth already chosen. It is checked against
 * `PLANS` rather than trusted — a stale or hand-typed id becomes "not sure yet"
 * rather than putting a plan that does not exist into the message.
 *
 * In Next 15 `searchParams` is a promise, which is why the page is async
 * despite fetching nothing.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;
  const selectedPlan = PLANS.some((plan) => plan.id === params.plan) ? params.plan : undefined;

  return (
    <>
      <section className={`section ${styles.top}`}>
        <div className={`container ${styles.grid}`}>
          <div className={styles.intro}>
            <span className="eyebrow">{DEMO_PAGE.eyebrow}</span>
            <h1 className={styles.title}>{DEMO_PAGE.title}</h1>
            <p className={styles.lede}>{DEMO_PAGE.lede}</p>

            <ol className={styles.expectations}>
              {DEMO_PAGE.expectations.map((item, index) => (
                <li key={item.title}>
                  <span className={styles.step} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className={styles.stepTitle}>{item.title}</h2>
                    <p className={styles.stepBody}>{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* The escape hatch for people who would simply rather talk. A
                proportion of them will never fill in a form, and losing them
                to a missing phone number is an avoidable loss. */}
            <div className={styles.direct}>
              <p className={styles.directNote}>Would rather just talk?</p>
              <div className={styles.directActions}>
                <a className="btn btn--ghost" href={`tel:${CONTACT.phoneHref}`}>
                  <Glyph name="phone" className={styles.directIcon} />
                  {CONTACT.phone}
                </a>
                <a
                  className="btn btn--ghost"
                  href={`https://wa.me/${CONTACT.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Glyph name="message-circle" className={styles.directIcon} />
                  WhatsApp
                </a>
              </div>
            </div>
          </div>

          <div className={styles.formColumn}>
            <EnquiryForm kind="demo" selectedPlan={selectedPlan} submitLabel="Request my free demo" />
          </div>
        </div>
      </section>

      <BusinessTypesSection title={DEMO_PAGE.typesTitle} lede={DEMO_PAGE.typesLede} panel />
    </>
  );
}
