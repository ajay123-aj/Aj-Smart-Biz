import StatsGrid from './StatsGrid';
import { resolveFigures } from '@/lib/figures';
import type { CompanyDetails } from '@/lib/company';
import styles from './FiguresSection.module.css';

/**
 * The band of figures: the words above them, and the cards.
 *
 * A shared component in the shape the rest of the template uses — it takes the
 * company, asks `resolveFigures` what to show, and brings its own styling — so
 * that the home page and the About page get the *same* band rather than two
 * that drift. That was the state of things before: the home page had a bare row
 * of numbers and the About page had the same row wedged into its masthead, and
 * the two were already diverging.
 *
 * It renders nothing at all when the tenant is not carrying the section. That
 * absence is the whole of the entitlement check — see `resolveFigures` — so
 * neither page holds a condition of its own.
 *
 * The head is centred, and that is a decision about the band rather than about
 * either page: a short head over a single wide row is the shape the row itself
 * has. It also keeps this section from reading like the Features band below it
 * on the home page, whose heading sits in a column beside its cards.
 *
 * `className` is for the caller's spacing and nothing else.
 */
export default function FiguresSection({
  company,
  className,
}: {
  company: CompanyDetails;
  className?: string;
}) {
  const figures = resolveFigures(company);
  if (!figures) return null;

  return (
    <section className={`${styles.section} ${className ?? ''}`} id="figures">
      <div className="container">
        <header className={styles.head}>
          <span className={`eyebrow ${styles.eyebrow}`}>{figures.eyebrow}</span>
          <h2 className="section-title">{figures.title}</h2>
          {figures.lead ? <p className={styles.lede}>{figures.lead}</p> : null}
        </header>

        <StatsGrid stats={figures.items} />
      </div>
    </section>
  );
}
