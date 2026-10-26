import type { CSSProperties } from 'react';
import Glyph from './Glyph';
import type { ShowcaseTemplate } from '@/lib/api';
import styles from './TemplateCard.module.css';

/** How many live sections a card names before it says "+ n more". */
const SECTION_LIMIT = 6;

/**
 * One demo site in the template showcase.
 *
 * The top half is a **drawn** preview, not a screenshot: a small browser
 * window in the design's own surface (light, dark or glass), coloured with the
 * demo company's brand, carrying its real hero headline and its real services
 * or products. A screenshot would go stale the first time the demo changed;
 * this is built from the same data the demo renders, so it cannot. The live
 * demo itself is one click away for anybody who wants the real thing.
 */
export default function TemplateCard({
  template,
  demoLabel,
  noDemoLabel,
  sectionsLabel,
}: {
  template: ShowcaseTemplate;
  demoLabel: string;
  noDemoLabel: string;
  sectionsLabel: string;
}) {
  const { palette, headline, design } = template;

  /* Only the colours the company actually set. Without them the preview keeps
     the design's own, exactly as the live demo does. */
  const brand = {
    ...(palette.primary ? { '--tpl-brand': palette.primary } : {}),
    ...(palette.secondary ? { '--tpl-brand-2': palette.secondary } : {}),
  } as CSSProperties;

  const host = hostOf(template.demoUrl);
  const extraSections = template.sections.length - SECTION_LIMIT;

  return (
    <article className={`card-surface ${styles.card}`}>
      <div className={styles.preview} data-look={design.look} style={brand} aria-hidden="true">
        <div className={styles.chrome}>
          <span className={styles.dots}>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.address}>{host ?? template.title}</span>
        </div>

        <div className={styles.site}>
          <div className={styles.siteNav}>
            <span className={styles.logo}>{initialsOf(template.title)}</span>
            <span className={styles.siteName}>{template.title}</span>
            <span className={styles.navLines}>
              <i />
              <i />
              <i />
            </span>
          </div>

          <div className={styles.hero}>
            {headline?.eyebrow ? <span className={styles.heroEyebrow}>{headline.eyebrow}</span> : null}
            <strong className={styles.heroTitle}>{headline?.title ?? template.title}</strong>
            {headline?.subtitle ? <span className={styles.heroText}>{headline.subtitle}</span> : null}
            <span className={styles.heroButton} />
          </div>

          {template.highlights.length ? (
            <div className={styles.tiles}>
              {template.highlights.slice(0, 3).map((item) => (
                <span key={item} className={styles.tile}>
                  <i className={styles.tileMark} />
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          {template.businessType ? (
            <span className="chip">
              <Glyph name={template.businessType.icon} className={styles.metaIcon} />
              {template.businessType.name}
            </span>
          ) : null}
          <span className={`chip ${styles.designChip}`} data-look={design.look}>
            {design.name} design
          </span>
        </div>

        <h3 className={styles.title}>{template.title}</h3>
        {template.summary ? <p className={styles.summary}>{template.summary}</p> : null}

        {template.sections.length ? (
          <div className={styles.sections}>
            <span className={styles.sectionsLabel}>{sectionsLabel}</span>
            <ul className={styles.sectionList}>
              {template.sections.slice(0, SECTION_LIMIT).map((section) => (
                <li key={section}>{section}</li>
              ))}
              {extraSections > 0 ? <li className={styles.more}>+ {extraSections} more</li> : null}
            </ul>
          </div>
        ) : null}

        <div className={styles.actions}>
          {template.demoUrl ? (
            <a className="btn btn--ghost" href={template.demoUrl} target="_blank" rel="noopener noreferrer">
              {demoLabel}
              <Glyph name="arrow-right" className={styles.actionIcon} />
            </a>
          ) : (
            <span className={styles.noDemo}>{noDemoLabel}</span>
          )}
        </div>
      </div>
    </article>
  );
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function initialsOf(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
