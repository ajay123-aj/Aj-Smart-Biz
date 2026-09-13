import Link from 'next/link';
import { SERVICES_COPY } from '@/config/site';
import { hasSection, toFileUrl, type CompanyDetails, type ServiceItem } from '@/lib/company';
import { durationLabel, resolveServices, servicePrice, type ResolvedServices } from '@/lib/services';
import Glyph from './Glyph';
import ServiceEnquiryButton from './ServiceEnquiryButton';
import styles from './ServicesSection.module.css';

/**
 * Services — what the business sells, described and priced in its own words.
 *
 * A shared component in the shape the rest of the template uses: it takes the
 * company, asks `resolveServices` what to say, and brings its own styling. It
 * renders in two places — a shortened band on the home page and the whole list
 * on `/services` — and the only thing that differs between them is `limit`.
 * The copy is not a prop, deliberately: a section that says something different
 * on each page is what `CtaBand` was written to undo, and this would go the
 * same way.
 *
 * Every word, price and picture is the tenant's, written in the admin. When
 * they have written none — or the plan does not carry the section, or the
 * switch is off — `resolveServices` answers `null` and this renders nothing.
 * That absence is the whole of the "show it only when it is switched on" rule;
 * neither page holds a condition of its own.
 *
 * The card is the argument. A visitor scanning a services list asks three
 * things in order — what is it, what do I get, what does it cost — so the card
 * answers them in that order, and gives the price a line of its own rather than
 * burying it at the end of a paragraph.
 */
export default function ServicesSection({
  company,
  limit,
  variant = 'all',
  category,
  showHead = true,
  className,
}: {
  company: CompanyDetails;
  /** Shortens the list. The home page passes one; `/services` does not. */
  limit?: number;
  /**
   * Which list this is.
   *
   * `offers` renders the same cards from the same source, under the tenant's own
   * offers wording - a **subset**, not a second list, so a service cannot be on
   * the offers band and missing from the price list. The home page shows both
   * bands; the services page shows only the first.
   */
  variant?: 'all' | 'offers';
  /** Narrows to one category and everything under it. The services page's filter. */
  category?: string | null;
  /**
   * Whether to print the heading block.
   *
   * The Services page has already printed it, as its `h1` — the same eyebrow,
   * heading and lede, resolved by the same function. This suppresses the copy
   * rather than changing it: what the section *says* is identical everywhere,
   * which is the rule, and printing it twice forty pixels apart is not a
   * different message but a mistake.
   */
  showHead?: boolean;
  /** For the caller's spacing and nothing else. */
  className?: string;
}) {
  const section = resolveServices(company, limit, { variant, category });
  if (!section) return null;

  const { cta, enquiry, items, truncated, booking } = section;

  /* The offers band says its own thing. Same cards, different argument: the
     services band is *what we do* and this one is *why book now*. */
  const eyebrow = variant === 'offers' ? section.offersEyebrow : section.eyebrow;
  const title = variant === 'offers' ? section.offersTitle : section.title;
  const lede = variant === 'offers' ? section.offersLede : section.lede;

  /**
   * The card's button now opens an enquiry form rather than walking the reader
   * to the Contact page, so it depends on the enquiry being usable rather than
   * on that page existing. `enquiry` is null only when the company pointed it
   * at WhatsApp and published no number — see `ServiceEnquiry`.
   */
  /* Only worth linking to the page from a band that is standing on another one. */
  const servicesHref = hasSection(company, '/services') ? '/services' : null;

  const cards = arrange(items);

  return (
    <section
      className={`section ${styles.section} ${className ?? ''}`}
      id={variant === 'offers' ? 'service-offers' : 'services'}
    >
      <div className="container">
        {showHead ? (
          <div className="section-head">
            <span className="eyebrow">{eyebrow}</span>
            <h2 className="section-title">{title}</h2>
            <p className="section-lede">{lede}</p>
          </div>
        ) : null}

        <ul className={styles.grid}>
          {cards.map(({ item, wide }, index) => (
            <ServiceCard
              key={item.id}
              item={item}
              index={index + 1}
              wide={wide}
              cta={cta}
              enquiry={enquiry}
              company={company}
              bookLabel={booking?.label ?? SERVICES_COPY.book}
            />
          ))}
        </ul>

        {/*
          Shown only when the list was actually shortened *and* there is a page
          to send the reader to. A business with three services gets three and
          no link, rather than an invitation to see the four it does not have.
        */}
        {truncated && servicesHref ? (
          <div className={styles.more}>
            <Link className="btn btn--ghost" href={servicesHref}>
              {variant === 'offers' ? SERVICES_COPY.moreOffers : SERVICES_COPY.more} →
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Which cards take the full row, and in what order.
 *
 * The grid is two columns and a wide card fills a row on its own, so the
 * arrangement is decided here rather than left to auto-placement — which would
 * leave a visible hole whenever a wide card landed in the right-hand column.
 * Two rules, and between them the grid is never ragged:
 *
 *  - **Featured first.** A featured service is the one the company most wants
 *    read, so it opens the section rather than turning up halfway down it, and
 *    every featured card therefore starts a clean row. `sequence` still orders
 *    within each group, so the tenant's own arrangement survives.
 *  - **No card left alone.** An odd number of ordinary cards would end with one
 *    sitting beside a gap. That last one takes the row instead and lays out
 *    horizontally — the same shape a featured card uses, without the emphasis.
 *
 * Below 900px the grid is a single column and none of it applies; the CSS
 * ignores the class.
 */
function arrange(items: ServiceItem[]): { item: ServiceItem; wide: boolean }[] {
  const featured = items.filter((item) => item.featured);
  const rest = items.filter((item) => !item.featured);
  const lastIsAlone = rest.length % 2 === 1;

  return [
    ...featured.map((item) => ({ item, wide: true })),
    ...rest.map((item, index) => ({ item, wide: lastIsAlone && index === rest.length - 1 })),
  ];
}

/**
 * One service.
 *
 * **Every card has a header**, which is most of the difference between a design
 * and a form. Where there is a photograph it is the photograph; where there is
 * none it is a short tinted band carrying the glyph and the card's number.
 *
 * Neither is a fallback for the other, and that is the point. A picture-sized
 * frame standing empty reads as an image that failed to load, and most services
 * will never have a photograph — so the band had to be worth looking at in its
 * own right rather than being a hole where a picture should have been.
 */
function ServiceCard({
  item,
  index,
  wide,
  cta,
  enquiry,
  company,
  bookLabel,
}: {
  item: ServiceItem;
  index: number;
  wide: boolean;
  cta: string;
  enquiry: ResolvedServices['enquiry'];
  company: CompanyDetails;
  /** The word on a bookable card. The tenant's, through the API. */
  bookLabel: string;
}) {
  const image = toFileUrl(item.image);
  const price = servicePrice(item, company);
  const duration = durationLabel(item.durationMinutes);

  /**
   * A service with no address gets no link.
   *
   * It should not happen - the API fills one in on create and backfills the rows
   * that predate the column - but `/services/` is a valid URL that leads back to
   * the list, so getting this wrong sends somebody who clicked a service to the
   * page they clicked it from. An unlinked title is a worse card; a card that
   * silently goes nowhere is a broken site.
   */
  const href = item.slug ? `/services/${item.slug}` : null;

  return (
    <li
      className={`${styles.card} ${wide ? styles.wide : ''} ${image ? styles.hasPhoto : styles.hasGlyph}`}
    >
      <div className={styles.header}>
        {image ? (
          <>
            {/* Not next/image: the file origin is configured per deployment and
                a plain img keeps the section working when it is not. Same call
                the Team and Gallery sections make. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.photo} src={image} alt={item.title} loading="lazy" />
            <span className={styles.scrim} aria-hidden="true" />
          </>
        ) : null}

        {/* The glyph, at a size worth looking at: over the corner of a
            photograph, and leading the band where there is none. */}
        <span className={styles.icon} aria-hidden="true">
          <Glyph name={item.icon} />
        </span>

        {/* The card's number, ghosted — the same device the figures and the
            benefit cards carry, so the three sections read as one family. */}
        <span className={styles.number} aria-hidden="true">
          {String(index).padStart(2, '0')}
        </span>

        {/* On offer, said on the card the way the catalogue says it — a badge
            rather than a colour, because a colour is not a fact. */}
        {item.onOffer ? (
          <span className={styles.offerFlag}>
            {item.discountPercent ? `−${item.discountPercent}%` : 'Offer'}
          </span>
        ) : null}
      </div>

      <div className={styles.body}>
        {/*
          The title is the link to the service's own page.

          The whole card is not one, unlike a post card: a service card carries a
          button of its own that does something different - booking a time, or
          opening an enquiry - and nesting that inside a link is invalid markup
          and an ambiguous target.
        */}
        <h3 className={styles.title}>
          {href ? (
            <Link className={styles.titleLink} href={href}>
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h3>

        {/*
          The price on a line of its own, marked with a short rule rather than
          boxed in a pill. It is the thing a visitor scans for, and a line of
          accent colour in the same place on every card is far easier to run an
          eye down than a badge that moves with the length of the title above it.
        */}
        {price ? (
          <p className={styles.price}>
            <span className={styles.priceRule} aria-hidden="true" />
            <span className={styles.priceNow}>{price.now}</span>
            {/* The old price beside the new one, struck through — the same shape
                the catalogue uses, so an offer reads identically wherever it is. */}
            {price.was ? <span className={styles.priceWas}>{price.was}</span> : null}
          </p>
        ) : null}

        {/*
          How long it takes, and what it is filed under.

          Chips on a line of their own rather than more text on the price line.
          They are facts of a different kind — the price is what a visitor is
          weighing, and these are what they are weighing it against — and hanging
          them off the figure made a line that grew ragged as soon as a service
          had both.
        */}
        {duration || item.category ? (
          <p className={styles.meta}>
            {duration ? (
              <span className={styles.chip}>
                <ClockIcon />
                {duration}
              </span>
            ) : null}
            {item.category ? <span className={styles.chipQuiet}>{item.category.name}</span> : null}
          </p>
        ) : null}

        {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}

        {item.highlights.length ? (
          <ul className={styles.points}>
            {item.highlights.map((point) => (
              <li key={point}>
                <Tick />
                {point}
              </li>
            ))}
          </ul>
        ) : null}

        {/*
          The button, pushed to the bottom of the card so a row of cards of
          different lengths still has its buttons on one line.

          Its label is the service's own where it has one, and the section's
          everywhere else — which is what lets a company set "Enquire" once and
          override it only on the card that wants "Book a fitting".

          Absent entirely when the enquiry cannot work. That is one case only —
          pointed at WhatsApp with no number published — and it is the API's
          answer, not a rule this component keeps.
        */}
        {/*
          The action bar.

          One row, pinned to the bottom of the card by `margin-top: auto`, so a
          grid of cards carrying different amounts of copy still has its buttons
          on one line. Two things sit in it, and they are deliberately different
          weights:

            the **primary** action, which is what this card is for — booking a
            time where the service takes one, and opening the enquiry where it
            does not

            **Details**, a quiet text link to the service's own page, on every
            card that has one. It is the way to the full description, the
            inclusions and the diary, and it must not compete with the button
            beside it.
        */}
        <div className={styles.foot}>
          {item.bookable && href ? (
            /*
              A service somebody can take a time for sends them to its own page,
              where the diary is. Deliberately not a dialog: picking a day and a
              slot is a real decision that deserves an address of its own, and
              one a person can come back to.
            */
            <Link className={styles.book} href={href}>
              {bookLabel}
              <ArrowIcon />
            </Link>
          ) : enquiry ? (
            <ServiceEnquiryButton
              service={{ id: item.id, title: item.title }}
              companyName={company.name}
              enquiry={enquiry}
              label={item.ctaLabel || cta}
              /* The button brings its own appearance; the card decides only that
                 hovering anywhere on it lights the button up. */
              className={styles.cta}
            />
          ) : (
            /*
              **No button at all.**
              
              The tenant has switched the enquiry off and takes no bookings for
              this service, which is a real choice: a price list that says what
              the work is and leaves the phone number in the header to do the
              rest. A card that invented an action here would be the template
              overriding a decision the shop made deliberately.

              The title above is still a link to the service's own page, so
              nothing becomes unreachable — a heading that goes somewhere is not
              a call to action.
            */
            <span />
          )}

          {/*
            Only where the primary action is **not** already the page.

            A bookable card's button goes to the service's own page, where the
            diary is; a second link beside it pointing at the same address is two
            things to choose between that do the same thing. The enquiry button
            opens a dialog and goes nowhere, so that is the one case where the
            way to the full description has to be offered separately.
          */}
          {href && !item.bookable && enquiry ? (
            <Link className={styles.details} href={href}>
              Details
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * The two marks the card draws itself.
 *
 * Inline rather than from `Glyph`, which is the tenant's closed library of
 * section icons — these are furniture, not content: an arrow that means "this
 * goes somewhere" and a clock that means "this takes time". A tenant choosing
 * either of them would be choosing something about the template.
 */
function ArrowIcon() {
  return (
    <svg
      className={styles.arrow}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className={styles.chipIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </svg>
  );
}

/** The tick beside an inclusion. Drawn here for the same reason `Glyph` is. */
function Tick() {
  return (
    <svg
      className={styles.tick}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.4 4.4L19 7.5" />
    </svg>
  );
}
