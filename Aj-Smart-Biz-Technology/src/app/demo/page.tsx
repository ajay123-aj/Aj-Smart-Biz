import type { Metadata } from 'next';
import EnquiryForm from '@/components/EnquiryForm';
import BusinessTypesSection from '@/components/BusinessTypesSection';
import Glyph from '@/components/Glyph';
import { getSite } from '@/lib/api';
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
 * the live plan list rather than trusted — a stale or hand-typed id becomes
 * "not sure yet" rather than putting a plan that does not exist into the
 * message. That check matters more now that the list is editable: a plan
 * withdrawn in the console makes every old link fall back instead of naming it.
 */
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const [params, { content, plans, businessTypes }] = await Promise.all([
    searchParams,
    getSite(),
  ]);

  const page = content.demo_page;
  const contact = content.contact;
  const expectations = page?.expectations ?? [];
  const selectedPlan = plans.some((plan) => plan.id === params.plan) ? params.plan : undefined;

  return (
    <>
      <section className={`section ${styles.top}`}>
        <div className={`container ${styles.grid}`}>
          <div className={styles.intro}>
            <span className="eyebrow">{page?.eyebrow}</span>
            <h1 className={styles.title}>{page?.title}</h1>
            <p className={styles.lede}>{page?.lede}</p>

            <ol className={styles.expectations}>
              {expectations.map((item, index) => (
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
                {contact?.phoneHref ? (
                  <a className="btn btn--ghost" href={`tel:${contact.phoneHref}`}>
                    <Glyph name="phone" className={styles.directIcon} />
                    {contact.phone ?? contact.phoneHref}
                  </a>
                ) : null}
                {contact?.whatsapp ? (
                  <a
                    className="btn btn--ghost"
                    href={`https://wa.me/${contact.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Glyph name="message-circle" className={styles.directIcon} />
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.formColumn}>
            <EnquiryForm
              kind="demo"
              selectedPlan={selectedPlan}
              submitLabel="Request my free demo"
              businessTypes={businessTypes}
              plans={plans}
              whatsapp={contact?.whatsapp}
              email={contact?.email}
              shortName={content.site?.shortName}
              source="/demo"
            />
          </div>
        </div>
      </section>

      <BusinessTypesSection
        title={page?.typesTitle ?? 'Built for any trade'}
        lede={page?.typesLede}
        panel
      />
    </>
  );
}
