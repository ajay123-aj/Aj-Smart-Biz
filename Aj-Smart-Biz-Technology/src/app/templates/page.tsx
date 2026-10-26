import type { Metadata } from 'next';
import Link from 'next/link';
import CtaBand from '@/components/CtaBand';
import TemplateCard from '@/components/TemplateCard';
import { getSite, getTemplates } from '@/lib/api';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Templates',
  description:
    'Real websites built on Aj Smart Biz for different kinds of business, in each of our designs. Open a live demo and see what yours would look like.',
};

/**
 * The template showcase: real demo sites, one card each, filterable by design.
 *
 * The filter is a set of links (`?design=`) rather than a client-side toggle,
 * so it works without JavaScript, can be shared, and shows a count per design.
 * One request serves the counts and the filtered grid alike: the list is
 * fetched whole and narrowed here.
 */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ design?: string }>;
}) {
  const [{ content }, { designs, templates }, { design }] = await Promise.all([
    getSite(),
    getTemplates(),
    searchParams,
  ]);
  const page = content.templates_page;

  const active = designs.find((item) => item.key === design) ?? null;
  const shown = active ? templates.filter((item) => item.design.key === active.key) : templates;
  const countOf = (key: string) => templates.filter((item) => item.design.key === key).length;

  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{page?.eyebrow ?? 'Templates'}</span>
          <h1 className={styles.title}>{page?.title}</h1>
          {page?.lede ? <p className={styles.lede}>{page.lede}</p> : null}
        </div>
      </section>

      <section className={`section ${styles.showcase}`}>
        <div className="container">
          {templates.length ? (
            <>
              <nav className={styles.filters} aria-label="Filter by design">
                <Link
                  href="/templates"
                  className={`${styles.filter} ${!active ? styles.filterActive : ''}`}
                  aria-current={!active ? 'page' : undefined}
                  scroll={false}
                >
                  {page?.allLabel ?? 'All designs'}
                  <span className={styles.count}>{templates.length}</span>
                </Link>
                {designs.map((item) => (
                  <Link
                    key={item.key}
                    href={`/templates?design=${item.key}`}
                    className={`${styles.filter} ${active?.key === item.key ? styles.filterActive : ''}`}
                    aria-current={active?.key === item.key ? 'page' : undefined}
                    data-look={item.look}
                    scroll={false}
                  >
                    {item.name}
                    <span className={styles.count}>{countOf(item.key)}</span>
                  </Link>
                ))}
              </nav>

              {active ? <p className={styles.designSummary}>{active.summary}</p> : null}

              {shown.length ? (
                <ul className={styles.grid}>
                  {shown.map((template) => (
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
              ) : (
                <p className={styles.none}>No templates in this design yet.</p>
              )}
            </>
          ) : (
            <div className={`card-surface ${styles.empty}`}>
              <h2 className={styles.emptyTitle}>{page?.emptyTitle}</h2>
              {page?.emptyBody ? <p className={styles.emptyBody}>{page.emptyBody}</p> : null}
              <Link className="btn btn--primary" href="/demo">
                Book a free demo
              </Link>
            </div>
          )}
        </div>
      </section>

      <CtaBand />
    </>
  );
}
