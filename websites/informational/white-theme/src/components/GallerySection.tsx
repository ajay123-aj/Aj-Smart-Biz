'use client';

import { useCallback, useEffect, useState } from 'react';
import { GALLERY_COPY } from '@/config/site';
import { toFileUrl, type CompanyDetails } from '@/lib/company';
import styles from './GallerySection.module.css';

/**
 * The Gallery section — the company's own photographs, as a wall you can open.
 *
 * Renders only when the tenant is entitled to it and has added an image; the
 * API omits the block otherwise, so absence is the whole check.
 *
 * Two things make this a gallery rather than a grid of decoration. The tiles
 * are not all the same: a repeating mosaic gives a long wall a rhythm, and the
 * pattern is held back on short sets where it would just look lopsided. And
 * every tile opens — a photograph cropped into a tile is a thumbnail, and a
 * thumbnail you cannot enlarge is a picture of a picture.
 *
 * A client component for the viewer's sake. It still renders on the server, so
 * the images and their captions are in the HTML either way.
 */
export default function GallerySection({ company }: { company: CompanyDetails }) {
  const items = (company.features?.gallery?.items ?? []).filter((item) => toFileUrl(item.image));
  const [open, setOpen] = useState<number | null>(null);

  const count = items.length;
  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (delta: number) => setOpen((current) => (current === null ? null : (current + delta + count) % count)),
    [count]
  );

  /*
   * Keyboard is the whole point of a viewer like this: arrows to move through
   * the set, Escape to leave. Bound while it is open and removed after, so the
   * page keeps its own keys the rest of the time.
   */
  useEffect(() => {
    if (open === null) return undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };

    document.addEventListener('keydown', onKey);
    // The page behind must not scroll under the viewer.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close, step]);

  if (!count) return null;

  const active = open === null ? null : items[open];

  return (
    <section className="section" id="gallery">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">{GALLERY_COPY.eyebrow}</span>
          <h2 className="section-title">{GALLERY_COPY.title}</h2>
          <p className="section-lede">{GALLERY_COPY.lede}</p>
        </div>

        {/* `data-count` drives the mosaic, saturating at five — from there on
            the repeating pattern takes over and the exact number stops
            mattering. Below it, a count-specific layout, because a pattern
            needs enough tiles to read as one. */}
        <div className={styles.grid} data-count={Math.min(count, 5)}>
          {items.map((item, index) => (
            <button
              type="button"
              className={styles.tile}
              key={item.id}
              onClick={() => setOpen(index)}
              aria-label={`View ${item.title || item.altText || `image ${index + 1}`}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.image}
                src={toFileUrl(item.image) as string}
                // Already resolved to the title by the API; empty means the
                // company gave it neither, so it is decorative.
                alt={item.altText}
                // The first row is likely above the fold on a wide screen.
                loading={index < 3 ? 'eager' : 'lazy'}
              />

              {/* The cue that this opens. Without it a tile that lifts on hover
                  reads as decoration that happens to move. */}
              <span className={styles.zoom} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.2-3.2M11 8v6M8 11h6" strokeLinecap="round" />
                </svg>
              </span>

              {item.title || item.caption ? (
                <span className={styles.caption}>
                  {item.title ? <span className={styles.title}>{item.title}</span> : null}
                  {item.caption ? <span className={styles.text}>{item.caption}</span> : null}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {active ? (
        <div
          className={styles.viewer}
          role="dialog"
          aria-modal="true"
          aria-label={active.title || 'Image viewer'}
          // A click on the backdrop closes; a click on the figure inside does
          // not, which is why this checks the target rather than stopping
          // propagation on every child.
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button type="button" className={styles.close} onClick={close} aria-label="Close">
            &times;
          </button>

          {count > 1 ? (
            <button
              type="button"
              className={`${styles.arrow} ${styles.prev}`}
              onClick={() => step(-1)}
              aria-label="Previous image"
            >
              &#8249;
            </button>
          ) : null}

          <figure className={styles.stage} onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.full} src={toFileUrl(active.image) as string} alt={active.altText} />

            {active.title || active.caption ? (
              <figcaption className={styles.stageCaption}>
                {active.title ? <strong>{active.title}</strong> : null}
                {active.caption ? <span>{active.caption}</span> : null}
              </figcaption>
            ) : null}
          </figure>

          {count > 1 ? (
            <button
              type="button"
              className={`${styles.arrow} ${styles.next}`}
              onClick={() => step(1)}
              aria-label="Next image"
            >
              &#8250;
            </button>
          ) : null}

          {count > 1 ? (
            <span className={styles.counter}>
              {(open ?? 0) + 1} / {count}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
