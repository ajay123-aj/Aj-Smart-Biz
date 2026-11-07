'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts the first number in `value` up from zero when it scrolls into view,
 * keeping whatever is around it: "₹1,499" → ₹0…₹1,499, "12+" → 0+…12+.
 *
 * The final text is rendered on the server and is what a screen reader, a
 * search engine or a visitor without JavaScript gets. The animation only
 * replaces it briefly, and never with reduced motion.
 */
export default function CountUp({ value, duration = 1400 }: { value: string; duration?: number }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const match = value.match(/\d[\d,]*/);
    const el = ref.current;
    if (!match || !el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    const target = Number(match[0].replace(/,/g, ''));
    if (!Number.isFinite(target) || target <= 1) return;

    const before = value.slice(0, match.index);
    const after = value.slice((match.index ?? 0) + match[0].length);
    const grouped = match[0].includes(',');
    const format = (n: number) => (grouped ? n.toLocaleString('en-IN') : String(n));

    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setText(`${before}${format(Math.round(target * eased))}${after}`);
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} aria-label={value}>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
