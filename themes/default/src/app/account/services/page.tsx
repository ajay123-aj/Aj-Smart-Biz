import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import SignInPanel from '@/components/SignInPanel';
import { getCompanyDetails } from '@/lib/company.server';
import { anonymousMetadata } from '@/lib/metadata';
import { getAccount, getMyServices } from '@/lib/session.server';
import { BOOKING_STATUS_LABEL, SERVICE_STAGE_LABEL } from '@/lib/customer';
import styles from '@/components/Account.module.css';

/**
 * What this customer has asked about, and where each enquiry got to.
 *
 * The service half of the order history, and it exists for the same reason:
 * somebody who asked for a quote three weeks ago wants to know whether anything
 * happened, without ringing up to find out.
 *
 * ### What is deliberately not on it
 *
 * The figure the shop has pencilled in, and whether the shop has marked the job
 * paid. Both are on the enquiry and neither is sent here — a number somebody is
 * still deciding is not a quote until they send it, and a customer reading
 * "₹6,500, unpaid" off a page nobody quoted them is a phone call the shop did
 * not want. What they see is the price the **card** showed when they asked,
 * which is a thing they were actually told.
 *
 * Absent entirely on a tenant without Services — the route 404s, exactly as the
 * orders page does without the catalogue.
 */

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();

  const anonymous = anonymousMetadata(company);
  if (anonymous) return anonymous;

  return {
    title: `Your enquiries · ${company.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function MyServicesPage() {
  const company = await getCompanyDetails();

  if (!company.apiReachable) return <ServiceUnavailable />;

  /**
   * The API answered, and said this host belongs to no company. Same rule as
   * the check above and the plan check below: the page has to decline to render
   * as well as the layout, or the site stays readable in the streamed RSC
   * payload with the platform's placeholder company in it.
   */
  if (!company.resolved) return <CompanyNotFound />;
  if (!company.service.active) return <PlanNotice company={company} />;
  if (!company.features?.customers) notFound();

  /* No services on this site means nothing could ever have been asked about. */
  if (!company.features?.services) notFound();

  const account = await getAccount();

  if (!account) {
    return (
      <section className="section">
        <div className="container" style={{ maxWidth: '46rem' }}>
          <SignInPanel companyName={company.name} />
        </div>
      </section>
    );
  }

  const enquiries = await getMyServices();

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: '46rem' }}>
        <div className={styles.head}>
          <div>
            <h1 className={styles.title}>Your enquiries</h1>
            <p className={styles.lede}>Everything you have asked {company.name} about.</p>
          </div>
          <Link className={styles.quiet} href="/account">
            Your details
          </Link>
        </div>

        {!enquiries.length ? (
          <p className={styles.empty}>
            You have not asked about anything yet.{' '}
            <Link className={styles.link} href="/services">
              See what we do →
            </Link>
          </p>
        ) : (
          <ul className={styles.orders}>
            {enquiries.map((enquiry) => (
              <li key={enquiry.id} className={styles.order}>
                <div className={styles.orderHead}>
                  <div>
                    <div className={styles.enquiryName}>
                      {/* Linked back to the service where the site still has a
                          page for it. A service the shop has since removed keeps
                          its name here and simply does not link. */}
                      {enquiry.slug ? (
                        <Link className={styles.link} href={`/services/${enquiry.slug}`}>
                          {enquiry.service}
                        </Link>
                      ) : (
                        enquiry.service
                      )}
                    </div>
                    <div className={styles.orderWhen}>
                      Asked{' '}
                      {new Date(enquiry.askedAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                  </div>

                  {/* The price the card showed at the time — see the note above
                      for why it is this and not what the shop has since quoted. */}
                  {enquiry.priceLabel ? (
                    <div className={styles.orderTotal}>{enquiry.priceLabel}</div>
                  ) : null}
                </div>

                {/*
                  The appointment, where there is one, **above** the stage.

                  It is what this person is actually waiting on: a slot they
                  picked that somebody has to confirm. The stage underneath is
                  the shop's own progress through its inbox, which matters less
                  to them than whether Thursday at ten is happening.
                */}
                {enquiry.booking ? (
                  <div className={`${styles.booking} ${styles[`booking_${enquiry.booking.status}`] ?? ''}`}>
                    <div className={styles.bookingWhen}>
                      {new Date(`${enquiry.booking.date}T00:00:00Z`).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })}
                      {' · '}
                      {enquiry.booking.time}
                      {enquiry.booking.minutes ? ` · ${enquiry.booking.minutes} min` : ''}
                    </div>

                    <div className={styles.bookingState}>{BOOKING_STATUS_LABEL[enquiry.booking.status]}</div>

                    {/* What the shop wrote back. The difference between "not
                        available" and "not available, try the Friday". */}
                    {enquiry.booking.response ? (
                      <p className={styles.bookingNote}>{enquiry.booking.response}</p>
                    ) : null}
                  </div>
                ) : null}

                <p className={styles.state}>{SERVICE_STAGE_LABEL[enquiry.stage]}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
