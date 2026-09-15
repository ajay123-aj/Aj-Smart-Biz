import { FAQ } from '@/config/site';
import styles from './FaqSection.module.css';

/**
 * The questions, as native `<details>`.
 *
 * Not a React accordion, and that is not laziness — it is the only version that
 * works with JavaScript disabled, that Ctrl-F can find text inside on every
 * current browser, and that needs no `aria-expanded` kept in step with a piece
 * of state. A hand-rolled one here would be more code doing strictly less.
 *
 * The first is open on load so the pattern is visible without a click. Only the
 * first: a page of open answers is a wall of text, and the whole point of the
 * control is that a visitor picks which of eight they care about.
 *
 * No `name` attribute, so they are independent rather than mutually exclusive —
 * somebody comparing "what if I stop paying" against "do I own my domain"
 * should be able to have both on screen.
 */
export default function FaqSection({ panel = false }: { panel?: boolean }) {
  return (
    <section className={`section ${panel ? 'section--panel' : ''}`} id="faq">
      <div className="container">
        <header className="section-head">
          <span className="eyebrow">{FAQ.eyebrow}</span>
          <h2 className="section-title">{FAQ.title}</h2>
        </header>

        <div className={styles.list}>
          {FAQ.items.map((item, index) => (
            <details key={item.q} className={styles.item} open={index === 0}>
              <summary className={styles.question}>
                <span>{item.q}</span>
                {/* A plus that becomes a minus, drawn as two bars rather than
                    two icons: the horizontal one stays and the vertical one
                    rotates flat, which is one transition instead of a swap. */}
                <span className={styles.sign} aria-hidden="true">
                  <i className={styles.signBar} />
                  <i className={`${styles.signBar} ${styles.signBarV}`} />
                </span>
              </summary>
              <p className={styles.answer}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
