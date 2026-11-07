'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The site's motion layer: scroll reveals and the cursor spotlight on cards.
 * Renders nothing.
 *
 * **Content never depends on it.** Elements start visible; this component adds
 * `reveal-ready` to <html> first and only *then* hides what is below the fold,
 * so with JavaScript off, blocked or slow, the page is simply static. Reduced
 * motion turns the whole thing off.
 *
 * It tags elements by selector rather than asking every component for a
 * `data-reveal` attribute, so a new section is animated with no extra code.
 * The hero is excluded: it is on screen at load and has its own entrance.
 */
const REVEAL = [
  'main .section-head',
  'main .section ul > li',
  'main .section ol > li',
  'main .section details',
  'main [data-reveal]',
].join(', ');

const SPOTLIGHT = 'main .section ul > li, main .section ol > li, main .card-surface';

export default function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    const root = document.documentElement;
    root.classList.add('reveal-ready');

    /* Top-level items only: a list inside a card arrives with its card. */
    const topLevel = (el: HTMLElement) => !el.parentElement?.closest('li, details');

    const targets = Array.from(document.querySelectorAll<HTMLElement>(REVEAL)).filter(
      (el) => topLevel(el) && !el.closest('[data-no-reveal]') && !el.classList.contains('is-visible')
    );

    /* A small stagger between siblings, so a grid arrives as a wave. */
    targets.forEach((el) => {
      const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
      const index = Math.min(siblings.indexOf(el), 8);
      el.style.setProperty('--reveal-delay', `${Math.max(index, 0) * 70}ms`);
      el.classList.add('reveal');
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    targets.forEach((el) => observer.observe(el));

    /* Cursor spotlight: one listener for the whole page. */
    document
      .querySelectorAll<HTMLElement>(SPOTLIGHT)
      .forEach((el) => topLevel(el) && !el.closest('[data-no-reveal]') && el.classList.add('spot'));
    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>('.spot');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    document.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      observer.disconnect();
      document.removeEventListener('pointermove', onMove);
    };
  }, [pathname]);

  return null;
}
