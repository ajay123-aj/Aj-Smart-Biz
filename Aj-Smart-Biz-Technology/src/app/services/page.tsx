import type { Metadata } from 'next';
import Glyph from '@/components/Glyph';
import CapabilitiesSection from '@/components/CapabilitiesSection';
import RechargeSection from '@/components/RechargeSection';
import CtaBand from '@/components/CtaBand';
import { SERVICES_PAGE } from '@/config/site';
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
export default function ServicesPage() {
  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{SERVICES_PAGE.eyebrow}</span>
          <h1 className={styles.title}>{SERVICES_PAGE.title}</h1>
          <p className={styles.lede}>{SERVICES_PAGE.lede}</p>
        </div>
      </section>

      <section className="section section--panel">
        <div className="container">
          <header className="section-head">
            <h2 className="section-title">{SERVICES_PAGE.alwaysTitle}</h2>
          </header>

          <ul className={styles.always}>
            {SERVICES_PAGE.always.map((item) => (
              <li key={item.title} className={styles.alwaysItem}>
                <span className={styles.alwaysIcon} aria-hidden="true">
                  <Glyph name={item.icon} />
                </span>
                <div>
                  <h3 className={styles.alwaysTitle}>{item.title}</h3>
                  <p className={styles.alwaysBody}>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CapabilitiesSection
        title={SERVICES_PAGE.capabilitiesTitle}
        lede={SERVICES_PAGE.capabilitiesLede}
        detailed
      />

      <RechargeSection />

      <CtaBand />
    </>
  );
}
