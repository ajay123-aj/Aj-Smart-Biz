import Link from 'next/link';
import type { FeatureIcon } from '@/config/site';
import { hasSection, type CompanyDetails } from '@/lib/company';
import { resolveFeatures } from '@/lib/features';
import styles from './FeaturesSection.module.css';

/**
 * Features / Benefits — what the business can do, and what that is worth to
 * the person reading.
 *
 * A shared component in the shape the rest of the template already uses: it
 * takes the company, asks `resolveFeatures` what to say, and brings its own
 * styling. Dropping it on another page is one import — which is the reason the
 * copy is not a prop. A section that says something different on every page is
 * exactly what `CtaBand` was written to undo, and this would go the same way.
 *
 * Every word and every glyph is the tenant's, written in the admin. When they
 * have written none — or the plan does not carry the section, or the switch is
 * off — `resolveFeatures` answers `null` and this renders nothing at all. That
 * absence is the whole of the "show it only when it is switched on" rule; the
 * page holds no condition of its own.
 *
 * It renders on the home page only for now. Nothing here knows that.
 *
 * `className` is for the caller's spacing and nothing else.
 */
export default function FeaturesSection({
  company,
  className,
}: {
  company: CompanyDetails;
  className?: string;
}) {
  const section = resolveFeatures(company);
  if (!section) return null;

  const { eyebrow, title, lede, cta, items } = section;

  return (
    <section className={`section section--muted ${styles.section} ${className ?? ''}`} id="features">
      <div className="container">
        <div className={styles.layout}>
          {/*
            The heading column. Sticky on a wide screen: the cards are the long
            side of the row, and a heading that scrolls away halfway down them
            leaves the reader looking at six unlabelled tiles.

            Two elements, not one. `sticky` travels within its containing block,
            and a grid item's block is the item itself — so a sticky grid item
            has nowhere to go. The outer div is the item and stretches to the
            row; the inner one is what actually sticks inside it.
          */}
          <div className={styles.headCol}>
            <div className={styles.head}>
              <span className="eyebrow">{eyebrow}</span>
              <h2 className={styles.title}>{title}</h2>
              <p className={styles.lede}>{lede}</p>

              {/* Only when there is a Contact page to send them to — the API
                  withholds the page from the menu when the tenant is not
                  publishing one, and `hasSection` reads the same menu. */}
              {hasSection(company, '/contact') ? (
                <Link className={`btn btn--primary ${styles.cta}`} href="/contact">
                  {cta} →
                </Link>
              ) : null}
            </div>
          </div>

          <ul className={styles.grid}>
            {items.map((item, index) => (
              <li className={styles.card} key={item.id}>
                {/* The same ghosted numeral the figures carry, so the site has
                    one family of card and not several. */}
                <span className={styles.index} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>

                <span className={styles.icon} aria-hidden="true">
                  <Glyph name={item.icon} />
                </span>

                <h3 className={styles.cardTitle}>{item.title}</h3>
                {item.body ? <p className={styles.cardBody}>{item.body}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Glyphs
 *
 * Drawn here rather than uploaded, so the set is consistent across every
 * tenant and costs no request: one line weight, one 24-unit box, one cap and
 * join. A tenant picks a name from the platform's library in the admin; this is
 * the half of that bargain that decides what the name looks like.
 *
 * The keys mirror `FEATURE_ICONS` in the backend's constants, which is the
 * contract between the two — the API refuses to save a name that is not in it.
 * They are not guaranteed to be in step in the other direction: the library can
 * grow a glyph before this template is redeployed, which is why an unknown name
 * falls through to `spark` rather than leaving a hole in the card.
 * ------------------------------------------------------------------ */

const PATHS: Record<FeatureIcon, React.ReactNode> = {
  /* -------------------------------- general ------------------------------- */
  /** A four-point star — capability, the thing done well. */
  spark: <path d="M12 3.2 13.9 9a3.2 3.2 0 0 0 2.1 2.1L21.8 13l-5.8 1.9A3.2 3.2 0 0 0 13.9 17L12 22.8 10.1 17A3.2 3.2 0 0 0 8 14.9L2.2 13 8 11.1A3.2 3.2 0 0 0 10.1 9Z" />,
  /** Five points — a rating, or simply the best of something. */
  star: <path d="m12 3.5 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
  /** A tick in a ring — done, and done properly. */
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  /** A bulb — the idea, the thinking that went in first. */
  lightbulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z" />
      <path d="M9.5 18.4h5M10.4 21h3.2" />
    </>
  ),
  /** Rings on a centre — precision, and hitting what was aimed at. */
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  /** Stacked plates — the breadth of what is on offer. */
  layers: (
    <>
      <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6Z" />
      <path d="m3.5 12 8.5 4.6 8.5-4.6" />
      <path d="m3.5 16.4 8.5 4.6 8.5-4.6" />
    </>
  ),

  /* ---------------------------- trust and quality -------------------------- */
  /** A shield with a tick — the promise kept. */
  shield: (
    <>
      <path d="M12 2.8 20 6v6c0 4.6-3.2 7.9-8 9.2-4.8-1.3-8-4.6-8-9.2V6Z" />
      <path d="m8.8 12 2.3 2.4 4.1-4.6" />
    </>
  ),
  /** A medal — work that has been recognised. */
  award: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      <path d="m8.6 13.2-1.4 7.6L12 18.6l4.8 2.2-1.4-7.6" />
    </>
  ),
  /** A padlock — what you hand over stays yours. */
  lock: (
    <>
      <path d="M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </>
  ),
  /** A heart — the care taken, rather than the speed. */
  heart: <path d="M12 20.4S3.8 15.6 3.8 9.9A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8.2 2.3c0 5.7-8.2 10.5-8.2 10.5Z" />,

  /* --------------------------- service and support ------------------------- */
  /** A headset — support that answers. */
  headset: (
    <>
      <path d="M4.2 14v-2a7.8 7.8 0 0 1 15.6 0v2" />
      <path d="M4.2 13.4h1.9a1.4 1.4 0 0 1 1.4 1.4v2.6a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4ZM19.8 13.4h-1.9a1.4 1.4 0 0 0-1.4 1.4v2.6a1.4 1.4 0 0 0 1.4 1.4h.5a1.4 1.4 0 0 0 1.4-1.4Z" />
      <path d="M18.4 18.8v.6a2.4 2.4 0 0 1-2.4 2.4h-2.6" />
    </>
  ),
  /** Two figures — the people you deal with. */
  people: (
    <>
      <circle cx="9.5" cy="8.5" r="3.3" />
      <path d="M3.4 20a6.2 6.2 0 0 1 12.2 0" />
      <path d="M16.4 5.6a3.3 3.3 0 0 1 0 6.4M17.6 14.4a6.2 6.2 0 0 1 3 5.6" />
    </>
  ),
  /** A handset — somebody picks up. */
  phone: <path d="M20.4 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17.6 17.6 0 0 1-7.7-2.7 17.3 17.3 0 0 1-5.3-5.3A17.6 17.6 0 0 1 2.7 5.5a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8 10.5a14 14 0 0 0 5.3 5.3l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.6 1.9Z" />,
  /** A speech bubble — a conversation rather than a form. */
  message: <path d="M20.5 12a8 8 0 0 1-11.9 7l-4.1 1.5 1.5-4.1A8 8 0 1 1 20.5 12Z" />,
  /** A calendar — dates that are agreed and then kept. */
  calendar: (
    <>
      <rect x="4" y="5.4" width="16" height="14.6" rx="1.6" />
      <path d="M8.4 3.2v4M15.6 3.2v4M4 10.4h16" />
    </>
  ),

  /* --------------------------- speed and delivery -------------------------- */
  /** A clock — delivered when we said. */
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.4 2" />
    </>
  ),
  /** A rocket — getting something off the ground. */
  rocket: (
    <>
      <path d="M12 3.4c3 2.2 4.8 5.6 4.8 9.3l-2.4 2.4H9.6l-2.4-2.4c0-3.7 1.8-7.1 4.8-9.3Z" />
      <path d="M9.6 15.1 7.4 20l3-1.3M14.4 15.1l2.2 4.9-3-1.3" />
      <circle cx="12" cy="10.2" r="1.4" />
    </>
  ),
  /** A bolt — turnaround measured in hours. */
  zap: <path d="M13.4 2.8 4.6 13.6h6.2l-.2 7.6 8.8-10.8h-6.2Z" />,
  /** A van — it arrives where you are. */
  truck: (
    <>
      <path d="M3.4 6.6h9.2v10.2H3.4Z" />
      <path d="M12.6 10.2h3.6l3 3v3.6h-6.6Z" />
      <circle cx="6.6" cy="18.6" r="1.8" />
      <circle cx="17.4" cy="18.6" r="1.8" />
    </>
  ),
  /** Arrows round — work that keeps being looked after. */
  refresh: (
    <>
      <path d="M20.4 11.4A8.4 8.4 0 0 0 6.2 6.8L3.6 9.2" />
      <path d="M3.6 4.6v4.6h4.6" />
      <path d="M3.6 12.6a8.4 8.4 0 0 0 14.2 4.6l2.6-2.4" />
      <path d="M20.4 19.4v-4.6h-4.6" />
    </>
  ),

  /* ---------------------------- value and pricing -------------------------- */
  /** A wallet — what it costs, and that it is worth it. */
  wallet: (
    <>
      <path d="M4.4 7.6h13.2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4.4Z" />
      <path d="M4.4 7.6V6a1.6 1.6 0 0 1 1.6-1.6h9.4" />
      <path d="M16.6 13.6h3" />
    </>
  ),
  /** A price tag — a number given once, in writing. */
  tag: (
    <>
      <path d="m11.2 3.6 8.4 8.4a1.8 1.8 0 0 1 0 2.5l-5.1 5.1a1.8 1.8 0 0 1-2.5 0L3.6 11.2V3.6Z" />
      <circle cx="7.1" cy="8" r=".9" />
    </>
  ),

  /* ---------------------------- results and reach -------------------------- */
  /** A rising bar chart — work that keeps paying off. */
  chart: (
    <>
      <path d="M3.6 20.4h16.8" />
      <path d="M7 20.4v-5.2M12 20.4V9.6M17 20.4V5.2" />
    </>
  ),
  /** A globe — how far the business reaches. */
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" />
    </>
  ),
  /** A pin — the opposite claim, and just as good a one: we are local. */
  'map-pin': (
    <>
      <path d="M19 10.2c0 5.4-7 11-7 11s-7-5.6-7-11a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  /** A leaf — done in a way that keeps. */
  leaf: (
    <>
      <path d="M20.2 4.4C10.6 3.6 4.6 8 4.6 14.4a5.4 5.4 0 0 0 5.4 5.4c6 0 10.2-6 10.2-15.4Z" />
      <path d="M4.6 20.4c2.6-4.6 6.2-7.8 10.6-9.6" />
    </>
  ),
  /** A spanner — the craft itself. */
  tools: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8Z" />,
};

/**
 * `name` is whatever the API sent, not a name this file is known to draw —
 * hence the string. An unrecognised one becomes a spark, which is a card with
 * the wrong picture rather than a card with a gap in it.
 */
function Glyph({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      {PATHS[name as FeatureIcon] ?? PATHS.spark}
    </svg>
  );
}
