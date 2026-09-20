import { SERVICE_UNAVAILABLE } from '@/config/site';
import styles from './ServiceUnavailable.module.css';

/**
 * Stands in for the whole website when the API cannot be reached.
 *
 * Deliberately **unbranded**. Every other holding state on this site keeps the
 * tenant's logo and colours, because the visitor arrived looking for that
 * company and a bare page reads as "wrong address". This one cannot: the API is
 * where the name, the logo and the colours come from, so there is nothing
 * truthful to brand it with. Painting the platform's own name and palette here
 * would be the exact mistake this page exists to stop.
 *
 * It replaces the site rather than sitting over it. What it replaced was worse
 * than nothing: with the API down the site used to render the template's
 * placeholder company — a name, three invented hero slides, an invented menu —
 * at a 200, indistinguishable from the real thing to anyone reading it.
 *
 * Two audiences, and they want opposite things:
 *
 *   a visitor  wants to know this is temporary and not their fault, in one
 *              sentence, without a stack trace.
 *   whoever
 *   runs it    wants to know it is the API and not the site, which is what the
 *              second line says without naming a host or a port — this page is
 *              public, and the address of an unreachable internal service is
 *              not a visitor's business.
 */
export default function ServiceUnavailable() {
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <span className={styles.mark} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6.5h16M4 12h16M4 17.5h9" />
            <path d="m16.5 15.5 5 5M21.5 15.5l-5 5" />
          </svg>
        </span>

        <h1 className={styles.title}>{SERVICE_UNAVAILABLE.title}</h1>
        <p className={styles.body}>{SERVICE_UNAVAILABLE.body}</p>

        {/*
          The retry is a plain link to the same address rather than a button
          calling `location.reload()`. It needs no JavaScript, it works if the
          page was served from a cache, and it keeps this component on the
          server — a page that exists because something is broken is the last
          place to add a hydration boundary that could break too.
        */}
        <a className={`btn btn--primary ${styles.retry}`} href="/">
          {SERVICE_UNAVAILABLE.retry}
        </a>

        <p className={styles.note}>{SERVICE_UNAVAILABLE.note}</p>
      </div>
    </main>
  );
}
