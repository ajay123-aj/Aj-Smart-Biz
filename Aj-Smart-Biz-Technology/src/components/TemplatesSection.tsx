import Link from 'next/link';
import Glyph from './Glyph';
import TemplateCard from './TemplateCard';
import { getSite, getTemplates } from '@/lib/api';
import styles from './TemplatesSection.module.css';

/** One clean row at desktop widths; the rest are on /templates. */
const HOME_LIMIT = 3;

/**
 * "See one for a business like yours" — the home page's window onto the
 * template showcase.
 *
 * Three cards (the API puts featured ones first) and a link to the rest.
 * Absent entirely while the showcase is empty: a heading over nothing would
 * be a promise the page does not keep.
 */
export default async function TemplatesSection({ panel = false }: { panel?: boolean }) {
  const [{ content }, { templates }] = await Promise.all([getSite(), getTemplates()]);
  if (!templates.length) return null;

  const page = content.templates_page;

  return (
    <section className={`section ${panel ? 'section--panel' : ''}`} id="templates">
      <div className="container">
        <header className="section-head">
          {page?.homeEyebrow ? <span className="eyebrow">{page.homeEyebrow}</span> : null}
          <h2 className="section-title">{page?.homeTitle ?? page?.title}</h2>
          {page?.homeLede ? <p className="section-lede">{page.homeLede}</p> : null}
        </header>

        <ul className={styles.grid}>
          {templates.slice(0, HOME_LIMIT).map((template) => (
            <li key={template.id}>
              <TemplateCard
                template={template}
                demoLabel={page?.demoLabel ?? 'Open live demo'}
                noDemoLabel={page?.noDemoLabel ?? 'Demo shown on the call'}
                sectionsLabel={page?.sectionsLabel ?? 'On this site'}
              />
            </li>
          ))}
        </ul>

        <div className={styles.more}>
          <Link className="btn btn--ghost" href="/templates">
            {page?.homeLink ?? 'See all templates'}
            {templates.length > HOME_LIMIT ? <span className={styles.count}>{templates.length}</span> : null}
            <Glyph name="arrow-right" className={styles.icon} />
          </Link>
        </div>
      </div>
    </section>
  );
}
