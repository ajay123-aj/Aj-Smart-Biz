import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import ServicesSection from '@/components/ServicesSection';
import BookingPanel from '@/components/BookingPanel';
import ServiceEnquiryButton from '@/components/ServiceEnquiryButton';
import CtaBand from '@/components/CtaBand';
import Glyph from '@/components/Glyph';
import { SERVICES_COPY } from '@/config/site';
import { navOf, toFileUrl, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { anonymousMetadata } from '@/lib/metadata';
import { getAccount } from '@/lib/session.server';
import { loadDiary } from '@/app/actions/book-service';
import { durationLabel, findService, resolveServices, servicePrice } from '@/lib/services';
import { paragraphsOf } from '@/lib/blog';
import styles from './page.module.css';

type Params = Promise<{ slug: string }>;

const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'services')?.label ?? SERVICES_COPY.metaTitle;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [company, { slug }] = await Promise.all([getCompanyDetails(), params]);

  const anonymous = anonymousMetadata(company);
  if (anonymous) return anonymous;
  const service = findService(company, slug);

  if (!service) return { title: company.name, robots: { index: false, follow: false } };

  return {
    title: `${service.title} · ${company.name}`,
    description: service.summary || service.description?.slice(0, 200) || company.description || undefined,
    robots: company.service.active ? undefined : { index: false, follow: false },
    /* The photograph of the work, where there is one. A link to a treatment
       pasted into a chat should show the treatment, not the company logo. */
    openGraph: service.image ? { images: [service.image] } : undefined,
  };
}

/**
 * One service, in full — and the place a time is actually booked.
 *
 * The card on the listing answers "what is this and what does it cost"; this
 * page answers everything after that, in the order somebody asks it: what it
 * is, what it costs, how long it takes, what is included, and then — if the
 * company takes appointments — when they can have it.
 *
 * **Everything except the diary comes from the payload the layout already
 * fetched.** A service page costs no request of its own; the slots do, because
 * they are different for every day and change while somebody is looking at them.
 *
 * A slug that names nothing is a genuine 404. There is no wider thing to fall
 * back to, and showing "some other treatment" to somebody who followed a link to
 * a specific one is worse than telling them it is gone.
 */
export default async function ServicePage({ params }: { params: Params }) {
  const [company, { slug }] = await Promise.all([getCompanyDetails(), params]);

  if (!company.apiReachable) return <ServiceUnavailable />;

  /**
   * The API answered, and said this host belongs to no company. Same rule as
   * the check above and the plan check below: the page has to decline to render
   * as well as the layout, or the site stays readable in the streamed RSC
   * payload with the platform's placeholder company in it.
   */
  if (!company.resolved) return <CompanyNotFound />;
  if (!company.service.active) return <PlanNotice company={company} />;

  const section = resolveServices(company);
  if (!section) notFound();

  const service = findService(company, slug);
  if (!service) notFound();

  const price = servicePrice(service, company);
  const duration = durationLabel(service.durationMinutes);
  const label = pageLabel(company);

  /**
   * The diary, and who is asking.
   *
   * Both resolved on the server so the panel arrives filled in rather than
   * flashing empty — and `getAccount` is what decides whether it shows a form or
   * a sign-in, on a shop that runs customer accounts.
   */
  const [account, diary] = await Promise.all([
    section.booking && service.bookable ? getAccount() : Promise.resolve(null),
    section.booking && service.bookable ? loadDiary(service.slug) : Promise.resolve(null),
  ]);

  return (
    <>
      <article>
        <header className={styles.masthead}>
          <div className="container">
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link className={styles.crumb} href="/">
                Home
              </Link>
              <span className={styles.crumbSep} aria-hidden="true">
                /
              </span>
              <Link className={styles.crumb} href="/services">
                {label}
              </Link>

              {/* The whole path, so a visitor who arrived from a search knows
                  where in the price list they have landed. */}
              {service.categoryPath.map((step) => (
                <span key={step.id} className={styles.crumbGroup}>
                  <span className={styles.crumbSep} aria-hidden="true">
                    /
                  </span>
                  <Link className={styles.crumb} href={`/services?category=${encodeURIComponent(step.slug)}`}>
                    {step.name}
                  </Link>
                </span>
              ))}

              <span className={styles.crumbSep} aria-hidden="true">
                /
              </span>
              <span aria-current="page">{service.title}</span>
            </nav>

            <div className={styles.head}>
              <div className={styles.headMain}>
                <h1 className={styles.title}>{service.title}</h1>
                {service.summary ? <p className={styles.lead}>{service.summary}</p> : null}

                {/* Price and duration together: they are the two facts somebody
                    weighs before reading a word of the description. */}
                <p className={styles.facts}>
                  {price ? (
                    <span className={styles.price}>
                      <span className={styles.priceNow}>{price.now}</span>
                      {price.was ? <span className={styles.priceWas}>{price.was}</span> : null}
                      {price.saving ? <span className={styles.saving}>−{price.saving}%</span> : null}
                    </span>
                  ) : null}

                  {duration ? (
                    <span className={styles.duration}>
                      {SERVICES_COPY.durationLabel} {duration}
                    </span>
                  ) : null}
                </p>
              </div>

              {service.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img className={styles.photo} src={toFileUrl(service.image) ?? ''} alt="" />
              ) : (
                <span className={styles.glyph} aria-hidden="true">
                  <Glyph name={service.icon} />
                </span>
              )}
            </div>
          </div>
        </header>

        <div className={`container ${styles.body}`}>
          <div className={styles.copy}>
            {service.highlights.length ? (
              <>
                <h2 className={styles.h2}>{SERVICES_COPY.includesLabel}</h2>
                <ul className={styles.points}>
                  {service.highlights.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {/* Plain text, printed as paragraphs — the same treatment an article
                gets, and for the same reason: nothing a tenant pastes in becomes
                live markup on a page a stranger is reading. */}
            {service.description
              ? paragraphsOf(service.description).map((paragraph, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <p key={index} className={styles.paragraph}>
                    {paragraph}
                  </p>
                ))
              : null}
          </div>

          <aside className={styles.aside}>
            {/*
              The diary, where there is one. A service that takes enquiries only
              — a wedding party, a survey — gets the enquiry button instead, which
              is the honest difference between "book this" and "ask about this".
            */}
            {section.booking && service.bookable && diary ? (
              <BookingPanel
                service={{ id: service.id, slug: service.slug, title: service.title }}
                booking={section.booking}
                signedInAs={account ? { name: account.customer.name, phone: account.customer.phone } : null}
                initial={diary}
              />
            ) : section.enquiry ? (
              /* No diary for this one, but the shop takes enquiries. */
              <div className={styles.enquire}>
                <h2 className={styles.h2}>{section.enquiry.title}</h2>
                <p className={styles.enquireNote}>{section.enquiry.note}</p>
                <ServiceEnquiryButton
                  service={{ id: service.id, title: service.title }}
                  companyName={company.name}
                  enquiry={section.enquiry}
                  label={service.ctaLabel || section.cta}
                />
              </div>
            ) : null}
          </aside>
        </div>
      </article>

      {/* The rest of what they do, so a page reached from a search is a way into
          the shop rather than a dead end. */}
      <ServicesSection company={company} limit={3} className={styles.more} />

      <CtaBand company={company} />
    </>
  );
}
