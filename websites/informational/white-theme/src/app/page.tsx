import PlanNotice from '@/components/PlanNotice';
import Slider from '@/components/Slider';
import { SERVICES, STATS, WHY_US } from '@/config/site';
import { displayUrl, telHref } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { siteContact } from '@/lib/contact';
import styles from './page.module.css';

/**
 * The whole site — one page, anchored sections, no routing. The company was
 * already resolved from the domain in the layout; this call is deduped against
 * that one, so the page costs no extra request.
 */
export default async function HomePage() {
  const company = await getCompanyDetails();

  /**
   * The plan is what pays for the content, so when the platform stops serving a
   * tenant the page returns the holding notice and nothing else. Returning early
   * here — rather than only hiding it in the layout — is what keeps the site out
   * of the streamed payload as well as off the screen.
   */
  if (!company.service.active) return <PlanNotice company={company} />;

  const tagline = company.description ?? 'Straightforward work, delivered when we said it would be.';
  const contact = siteContact(company);

  return (
    <>
      <Slider company={company} />

      {/* ------------------------------- about ------------------------------- */}
      <section className="section" id="about">
        <div className="container">
          <div className={styles.split}>
            <div>
              <span className="eyebrow">About us</span>
              <h2 className="section-title">Who {company.name} is</h2>
            </div>
            <div className={styles.splitBody}>
              <p className={styles.lead}>{tagline}</p>
              <p className={styles.prose}>
                We are a small team that prefers finishing things to announcing them. Work is scoped
                honestly, priced once, and handed over documented — so what you get on the last day is
                what you were shown on the first.
              </p>
              <p className={styles.prose}>
                Most of our work comes from people we have already worked with. That is the only
                marketing metric we pay attention to.
              </p>
            </div>
          </div>

          <dl className={styles.stats}>
            {STATS.map((stat) => (
              <div className={styles.stat} key={stat.label}>
                <dt className={styles.statLabel}>{stat.label}</dt>
                <dd className={styles.statValue}>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------ services ------------------------------ */}
      <section className="section section--muted" id="services">
        <div className="container">
          <span className="eyebrow">What we do</span>
          <h2 className="section-title">Three ways we usually help</h2>
          <p className="section-lede">
            Most engagements start at one of these and grow into the next. You are never committed to
            more than the piece you asked for.
          </p>

          <div className={styles.cards}>
            {SERVICES.map((service, i) => (
              <article className={styles.card} key={service.title}>
                <span className={styles.cardIndex} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.cardTitle}>{service.title}</h3>
                <p className={styles.cardBody}>{service.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------- why -------------------------------- */}
      <section className="section" id="why">
        <div className="container">
          <span className="eyebrow">Why us</span>
          <h2 className="section-title">What working with us is actually like</h2>

          <ul className={styles.reasons}>
            {WHY_US.map((reason) => (
              <li className={styles.reason} key={reason.title}>
                <span className={styles.tick} aria-hidden="true">
                  &#10003;
                </span>
                <div>
                  <h3 className={styles.reasonTitle}>{reason.title}</h3>
                  <p className={styles.reasonBody}>{reason.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------ contact ------------------------------ */}
      <section className="section section--muted" id="contact">
        <div className="container">
          <div className={styles.contact}>
            <div>
              <span className="eyebrow">Contact</span>
              <h2 className="section-title">Tell us what you need</h2>
              <p className="section-lede">
                A short message is enough to start. We will come back with questions, a scope and a
                number &mdash; usually within a working day.
              </p>

              <div className={styles.contactActions}>
                {contact.email ? (
                  <a className="btn btn--primary" href={`mailto:${contact.email}`}>
                    Email us
                  </a>
                ) : null}
                {contact.phone ? (
                  <a className="btn btn--ghost" href={`tel:${telHref(contact.phone)}`}>
                    {contact.phone}
                  </a>
                ) : null}
              </div>
            </div>

            <dl className={styles.contactDetails}>
              {contact.email ? (
                <div className={styles.contactRow}>
                  <dt>Email</dt>
                  <dd>{contact.email}</dd>
                </div>
              ) : null}
              {contact.phone ? (
                <div className={styles.contactRow}>
                  <dt>Phone</dt>
                  <dd>
                    {contact.phone}
                    {contact.alternatePhone ? `, ${contact.alternatePhone}` : ''}
                  </dd>
                </div>
              ) : null}
              {contact.website ? (
                <div className={styles.contactRow}>
                  <dt>Web</dt>
                  <dd>{displayUrl(contact.website)}</dd>
                </div>
              ) : null}
              {contact.address ? (
                <div className={styles.contactRow}>
                  <dt>Address</dt>
                  <dd>{contact.address}</dd>
                </div>
              ) : null}
              {contact.hours ? (
                <div className={styles.contactRow}>
                  <dt>Hours</dt>
                  <dd>{contact.hours}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {/* A locations list only earns its place once there is more than one. */}
          {company.branches.length > 1 ? (
            <div className={styles.locations}>
              <h3 className={styles.locationsTitle}>Where to find us</h3>
              <div className={styles.locationGrid}>
                {company.branches.map((branch) => (
                  <article className={styles.location} key={branch.id}>
                    <h4 className={styles.locationName}>
                      {branch.name}
                      {/* The tag would just repeat a branch literally named "Head Office". */}
                      {branch.isMain && !/head\s*office/i.test(branch.name) ? (
                        <span className={styles.locationTag}>Head office</span>
                      ) : null}
                    </h4>
                    {branch.address.line1 ? (
                      <p className={styles.locationLine}>
                        {[branch.address.line1, branch.address.line2, branch.address.city, branch.address.pincode]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    ) : null}
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
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
