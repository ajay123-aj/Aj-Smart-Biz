'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Stars from './Stars';
import { toFileUrl, type Testimonial } from '@/lib/company';
import styles from './TestimonialsCarousel.module.css';

/**
 * The reviews, as a slider.
 *
 * Built on **scroll-snap** rather than on transforms, and that decision buys
 * most of what a carousel usually costs: the track is a real scroller, so touch
 * swipe, trackpad flicks, keyboard scrolling and the browser's own
 * scroll-into-view all work with no code. The arrows and dots below only call
 * `scrollTo` on it; there is no transform to keep in step with the index, and
 * nothing to recompute on resize.
 *
 * Several cards are visible at once — three on a wide screen, one on a phone —
 * because a review is short and a slider showing one at a time would be mostly
 * empty. The card widths are set in CSS, so the count per view is a media query
 * rather than a number this file has to know.
 *
 * It does **not** auto-advance, unlike the hero. That slider carries headlines
 * you glance at; this one carries paragraphs you read, and moving them out from
 * under someone mid-sentence is the whole reason carousels have a bad name. The
 * hero's own comment says as much — it pauses on hover for exactly this reason.
 * Here there is nothing to pause.
 */
export default function TestimonialsCarousel({ items }: { items: Testimonial[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  /** How many cards fit at once — read from layout, not assumed. */
  const [perView, setPerView] = useState(1);

  /** The last starting card that still fills the view, so the track never overshoots. */
  const maxIndex = Math.max(0, items.length - perView);

  /**
   * Where the scroller actually is, and how much of it is visible.
   *
   * Measured from the DOM on scroll rather than tracked in state alongside it:
   * the visitor can scroll the track directly — by swiping, or with a trackpad
   * — and an index that only changed when an arrow was clicked would disagree
   * with what is on screen the moment they do.
   */
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const first = track.firstElementChild as HTMLElement | null;
    if (!first) return;

    // Card plus gap: the distance from one card's start to the next one's.
    const step = first.offsetWidth + gapOf(track);
    if (step <= 0) return;

    setPerView(Math.max(1, Math.round(track.clientWidth / step)));
    setIndex(Math.round(track.scrollLeft / step));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    measure();
    track.addEventListener('scroll', measure, { passive: true });

    // The card width is a media query, so the count per view changes with the
    // window and not with anything React knows about.
    const observer = new ResizeObserver(measure);
    observer.observe(track);

    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  const scrollTo = (next: number) => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return;

    const step = first.offsetWidth + gapOf(track);
    const target = Math.min(Math.max(next, 0), maxIndex);
    track.scrollTo({ left: target * step, behavior: 'smooth' });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    scrollTo(index + (event.key === 'ArrowLeft' ? -1 : 1));
  };

  /**
   * One dot per position the track can rest at, not one per card. With three
   * cards in view and ten reviews there are eight resting places, and a row of
   * ten dots would claim two that do not exist.
   */
  const positions = maxIndex + 1;
  const paged = items.length > perView;

  return (
    <div
      className={styles.carousel}
      role="group"
      aria-roledescription="carousel"
      aria-label="Customer reviews"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <ul className={styles.track} ref={trackRef}>
        {items.map((item, i) => {
          const photo = toFileUrl(item.photo);

          return (
            <li
              className={styles.card}
              key={item.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
            >
              <span className={styles.quote} aria-hidden="true">
                &ldquo;
              </span>

              {item.rating ? (
                <Stars
                  rating={item.rating}
                  className={styles.cardStars}
                  label={`Rated ${item.rating} out of 5`}
                />
              ) : null}

              {/* `blockquote` because it is one: somebody else's words. */}
              <blockquote className={styles.body}>{item.body}</blockquote>

              <figcaption className={styles.author}>
                {photo ? (
                  // Not next/image: the file origin is configured per deployment
                  // and a plain img keeps the section working when it is not.
                  // Same rule as the Team cards.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.avatar} src={photo} alt="" loading="lazy" />
                ) : (
                  <span className={styles.avatarFallback} aria-hidden="true">
                    {item.authorName.trim().charAt(0).toUpperCase()}
                  </span>
                )}

                <span className={styles.authorText}>
                  <span className={styles.authorName}>{item.authorName}</span>
                  {item.authorRole ? (
                    <span className={styles.authorRole}>{item.authorRole}</span>
                  ) : null}
                </span>
              </figcaption>
            </li>
          );
        })}
      </ul>

      {/* Nothing to page through when every review already fits. */}
      {paged ? (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => scrollTo(index - 1)}
            disabled={index <= 0}
          >
            <span aria-hidden="true">&#8592;</span>
            <span className="sr-only">Previous reviews</span>
          </button>

          <div className={styles.dots}>
            {Array.from({ length: positions }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Reviews ${i + 1} to ${Math.min(i + perView, items.length)}`}
                aria-current={i === index}
                className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                onClick={() => scrollTo(i)}
              />
            ))}
          </div>

          <button
            type="button"
            className={styles.arrow}
            onClick={() => scrollTo(index + 1)}
            disabled={index >= maxIndex}
          >
            <span aria-hidden="true">&#8594;</span>
            <span className="sr-only">More reviews</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The track's `column-gap` in pixels, which is a media query rather than a constant. */
function gapOf(track: HTMLElement): number {
  const gap = Number.parseFloat(getComputedStyle(track).columnGap);
  return Number.isFinite(gap) ? gap : 0;
}
