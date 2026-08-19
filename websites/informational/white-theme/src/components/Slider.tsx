'use client';

import { useCallback, useEffect, useState } from 'react';
import { SLIDES, SLIDE_INTERVAL_MS, type Slide } from '@/config/site';
import { toFileUrl, type CompanyDetails, type CompanySlide } from '@/lib/company';
import styles from './Slider.module.css';

/** What the carousel actually renders, whichever source it came from. */
interface HeroSlide {
  key: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  image: string | null;
  mobileImage: string | null;
  primary: { label: string; href: string } | null;
  secondary: { label: string; href: string } | null;
}

/** Fills `{company}` and `{tagline}` in the fallback copy from the resolved tenant. */
function fill(text: string, company: CompanyDetails): string {
  return text
    .replace(/\{company\}/g, company.name)
    .replace(
      /\{tagline\}/g,
      company.description ?? 'Straightforward work, delivered when we said it would be.'
    );
}

/** A slide the company manages in the admin. Its button needs both label and link. */
const fromApi = (slide: CompanySlide): HeroSlide => ({
  key: `api-${slide.id}`,
  eyebrow: slide.eyebrow,
  title: slide.title,
  body: slide.subtitle,
  image: toFileUrl(slide.image) ?? toFileUrl(slide.mobileImage),
  // Only a real alternative counts; otherwise the desktop artwork serves both.
  mobileImage: toFileUrl(slide.mobileImage),
  primary: slide.ctaLabel && slide.ctaUrl ? { label: slide.ctaLabel, href: slide.ctaUrl } : null,
  secondary: null,
});

const fromTemplate = (slide: Slide, company: CompanyDetails): HeroSlide => ({
  key: `template-${slide.title}`,
  eyebrow: fill(slide.eyebrow, company),
  title: fill(slide.title, company),
  body: fill(slide.body, company),
  image: null,
  mobileImage: null,
  primary: slide.primaryCta,
  secondary: slide.secondaryCta ?? null,
});

/**
 * The hero slider.
 *
 * Slides come from the company's own Slider Management whenever it has any. The
 * template's copy is the fallback for a host that resolved to no tenant, or a
 * tenant whose slides are all deactivated — the hero is the first thing on the
 * page, so it must never be empty.
 *
 * It auto-advances, but stops the moment the visitor interacts — hover, focus, a
 * dot or an arrow key — because a carousel that moves out from under someone
 * reading it is worse than one that does not move at all. It also never
 * auto-advances for a visitor who has asked for reduced motion.
 */
export default function Slider({ company }: { company: CompanyDetails }) {
  const slides: HeroSlide[] = company.sliders.length
    ? company.sliders.map(fromApi)
    : SLIDES.map((slide) => fromTemplate(slide, company));

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;
  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, count]);

  // A company that deletes slides can leave the index past the end.
  useEffect(() => {
    setIndex((i) => (i < count ? i : 0));
  }, [count]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setPaused(true);
    go(e.key === 'ArrowLeft' ? index - 1 : index + 1);
  };

  const active = slides[index];

  return (
    <section
      id="home"
      className={styles.slider}
      aria-roledescription="carousel"
      aria-label="Highlights"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/*
        The background belongs to whichever slide is showing, so it cross-fades
        with the copy rather than being painted once per slide and stacking.

        `<picture>` rather than a CSS background: a company that uploads a
        portrait crop for phones wants the browser to pick between the two, and
        only fetch the one it picked. Where no mobile artwork was uploaded there
        is a single source and the desktop file serves both.

        The breakpoint below must stay in step with `.washOverPhoto` in
        Slider.module.css — the scrim turns vertical at the same width the
        artwork turns portrait.
      */}
      {slides.map((slide, i) =>
        slide.image ? (
          <picture key={`bg-${slide.key}`} className={`${styles.photo} ${slide === active ? styles.photoActive : ''}`}>
            {slide.mobileImage ? <source media="(max-width: 768px)" srcSet={slide.mobileImage} /> : null}
            <img
              src={slide.image}
              alt=""
              aria-hidden="true"
              // The first slide is the largest thing above the fold.
              fetchPriority={i === 0 ? 'high' : 'auto'}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </picture>
        ) : null
      )}
      <div className={`${styles.wash} ${active?.image ? styles.washOverPhoto : ''}`} aria-hidden="true" />

      <div className={`container ${styles.stage}`}>
        {slides.map((slide, i) => (
          <article
            key={slide.key}
            className={`${styles.slide} ${i === index ? styles.active : ''}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
            // Links inside a hidden slide must not be tabbable.
            inert={i !== index ? true : undefined}
          >
            {slide.eyebrow ? <span className="eyebrow">{slide.eyebrow}</span> : null}
            <h1 className={styles.title}>{slide.title}</h1>
            {slide.body ? <p className={styles.body}>{slide.body}</p> : null}
            {slide.primary || slide.secondary ? (
              <div className={styles.actions}>
                {slide.primary ? (
                  <a className="btn btn--primary" href={slide.primary.href}>
                    {slide.primary.label}
                  </a>
                ) : null}
                {slide.secondary ? (
                  <a className="btn btn--ghost" href={slide.secondary.href}>
                    {slide.secondary.label}
                  </a>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}

        {count > 1 ? (
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.arrow}
              onClick={() => {
                setPaused(true);
                go(index - 1);
              }}
            >
              <span aria-hidden="true">&#8592;</span>
              <span className="sr-only">Previous slide</span>
            </button>

            <div className={styles.dots} role="tablist" aria-label="Choose slide">
              {slides.map((slide, i) => (
                <button
                  key={`dot-${slide.key}`}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Slide ${i + 1}`}
                  className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                  onClick={() => {
                    setPaused(true);
                    go(i);
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              className={styles.arrow}
              onClick={() => {
                setPaused(true);
                go(index + 1);
              }}
            >
              <span aria-hidden="true">&#8594;</span>
              <span className="sr-only">Next slide</span>
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
