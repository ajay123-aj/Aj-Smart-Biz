import TestimonialForm from './TestimonialForm';
import TestimonialsCarousel from './TestimonialsCarousel';
import type { CompanyDetails } from '@/lib/company';
import styles from './TestimonialsSection.module.css';

/**
 * Testimonials — what customers say, and where they say it.
 *
 * Renders only when the tenant is entitled to the feature *and* has something
 * to show: the API omits the block otherwise, so absence is the whole check.
 * The one thing it does not do is decide what a tenant is running. Static and
 * dynamic differ in which reviews arrived and in what order, and the API has
 * already applied both — this renders `items` as sent, and offers whichever
 * review button the API described.
 *
 * There are two of those, and never both at once: the platform's own form in a
 * dialog, or a link off the site to wherever the company would rather collect
 * reviews — its Google Business page, typically. The API decides which by
 * sending `form` or `reviewLink` and nulling the other, so this file picks the
 * one it was given rather than working out which the tenant meant.
 *
 * That is the reason nothing here reads `mode`. A template that re-derived
 * "dynamic means show a form" would be a second opinion about a setting the
 * tenant changes in the admin, and the two would eventually disagree.
 *
 * The reviews themselves are a carousel, which needs the browser, so they live
 * in their own client component. Everything else on the section is static
 * markup rendered on the server.
 */
export default function TestimonialsSection({
  company,
  className,
}: {
  company: CompanyDetails;
  className?: string;
}) {
  const testimonials = company.features?.testimonials;
  if (!testimonials) return null;

  /**
   * `averageRating`, `ratingCount` and `total` are deliberately not read.
   *
   * The API still sends them — they are true, cheap and another theme may
   * want them — but this one shows the reviews and not the arithmetic. A score
   * out of five and a "showing 10 of 15" footnote both invite the reader to
   * audit the wall instead of reading it, and neither says anything the reviews
   * themselves do not say better.
   */
  const { eyebrow, title, lead, items, canSubmit, form, reviewLink } = testimonials;

  // A `dynamic` section with nothing in it yet is still a section — the button
  // is the point of it — but it must not render an empty carousel above.
  const hasReviews = items.length > 0;

  return (
    <section className={`section ${styles.section} ${className ?? ''}`} id="testimonials">
      <div className="container">
        <div className={styles.head}>
          <div className={styles.headCopy}>
            <span className="eyebrow">{eyebrow}</span>
            <h2 className="section-title">{title}</h2>
            {lead ? <p className="section-lede">{lead}</p> : null}
          </div>

          <div className={styles.headSide}>
            {/*
              The button. `canSubmit` alone — never the mode — so a tenant
              closing submissions is one flag rather than a rule this file has to
              keep in step with the admin.

              `reviewLink` is checked second and cannot collide with it: the API
              nulls one of the two. A plain anchor rather than a component,
              because leaving the site needs no state and no browser — it stays
              on the server with the rest of the section.
            */}
            {canSubmit && form ? (
              <TestimonialForm form={form} className={styles.write} />
            ) : reviewLink ? (
              <a
                className={`btn btn--primary ${styles.write}`}
                href={reviewLink.url}
                /* Somebody reading a wall of reviews has not finished reading
                   it. The new tab is what lets them come back. */
                target="_blank"
                rel="noopener noreferrer"
              >
                {reviewLink.label}
                <svg
                  className={styles.writeIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 4h6v6" />
                  <path d="M20 4 11 13" />
                  <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
                {/* The arrow says "off-site" to anyone who can see it; this says
                    the same thing to anyone who cannot. */}
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
        </div>

        {hasReviews ? (
          <TestimonialsCarousel items={items} />
        ) : (
          /* No reviews and a form to fill: say so, rather than leaving a
             heading over nothing. */
          <p className={styles.empty}>
            No reviews here yet — if we have worked for you, yours would be the first.
          </p>
        )}
      </div>
    </section>
  );
}
