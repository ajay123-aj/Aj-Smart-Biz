import type { Metadata } from 'next';
import Glyph from '@/components/Glyph';
import CapabilitiesSection from '@/components/CapabilitiesSection';
import RechargeSection from '@/components/RechargeSection';
import CtaBand from '@/components/CtaBand';
import { getSite } from '@/lib/api';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'What you get',
  description:
    'Everything a business website on Aj Smart Biz can be built from — services, bookings, catalogue, orders, reviews, blog and more, all managed for you.',
};

/**
 * What the product can actually do, in full.
 *
 * The home page shows six capabilities and a counter; this is the whole list
 * with the long descriptions as well as the summaries.
 *
 * Above it sits the one thing that is *not* a capability: the six things in
 * every plan regardless. Those are properties of how the business works rather
 * than features a plan grants — there is no key behind "built in one working
 * day" and no plan can leave it out — so they come first, because they are true
 * of every visitor whatever they end up buying.
 */
export default async function ServicesPage() {
  const { content } = await getSite();
  const page = content.services_page;
  const always = page?.always ?? [];

  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{page?.eyebrow}</span>
          <h1 className={styles.title}>{page?.title}</h1>
          <p className={styles.lede}>{page?.lede}</p>
        </div>
      </section>

      {always.length ? (
      <section className="section section--panel">
        <div className="container">
          <header className="section-head">
            <h2 className="section-title">{page?.alwaysTitle}</h2>
          </header>

          <ul className={styles.always}>
            {always.map((item) => (
              <li key={item.title} className={styles.alwaysItem}>
                {item.icon ? (
                  <span className={styles.alwaysIcon} aria-hidden="true">
                    <Glyph name={item.icon} />
                  </span>
                ) : null}
                <div>
                  <h3 className={styles.alwaysTitle}>{item.title}</h3>
                  <p className={styles.alwaysBody}>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
      ) : null}

      <CapabilitiesSection
        title={page?.capabilitiesTitle ?? 'The building blocks'}
        lede={page?.capabilitiesLede}
        detailed
      />

      <RechargeSection />

      <CtaBand />
    </>
  );
}
