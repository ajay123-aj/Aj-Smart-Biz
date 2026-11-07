'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** How often the screen tries again on its own. */
const RETRY_SECONDS = 8;

/**
 * What a visitor sees when the API cannot be reached and there is no saved copy
 * to fall back on, which is usually a backend restart in progress.
 *
 * It retries by itself every few seconds, so the page comes back as soon as the
 * backend does, with nobody pressing reload. Styled inline so it still looks
 * right from `global-error.tsx`, where the site's stylesheet may not be loaded.
 */
export default function ApiDownNotice({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(RETRY_SECONDS);

  const retry = () => {
    setSeconds(RETRY_SECONDS);
    /* `refresh` re-runs the server render; `reset` clears the error boundary. */
    router.refresh();
    reset();
  };

  /* One tick per second; at zero, retry and start the count again. */
  useEffect(() => {
    if (seconds <= 0) {
      retry();
      return;
    }
    const timer = setTimeout(() => setSeconds((left) => left - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  return (
    <div
      role="status"
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 16px',
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif",
        color: '#ffffff',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          padding: 32,
          borderRadius: 20,
          background: '#121738',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          boxShadow: '0 30px 80px rgba(20, 16, 80, 0.55)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            margin: '0 auto 18px',
            borderRadius: '50%',
            border: '4px solid rgba(255, 255, 255, 0.12)',
            borderTopColor: '#a5b4fc',
            animation: 'aj-spin 0.9s linear infinite',
          }}
        />
        <style>{'@keyframes aj-spin { to { transform: rotate(360deg); } }'}</style>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>We&rsquo;ll be right back</h1>
        <p style={{ margin: '10px 0 0', color: '#b8bfdc', lineHeight: 1.6 }}>
          The site is updating and will be back in a few seconds. This page reloads by itself.
        </p>
        <p style={{ margin: '14px 0 0', color: '#8b93b8', fontSize: '0.9rem' }}>
          Trying again in {seconds}s
        </p>
        <button
          type="button"
          onClick={retry}
          style={{
            marginTop: 20,
            minHeight: 46,
            padding: '12px 24px',
            border: 0,
            borderRadius: 10,
            background: 'linear-gradient(120deg, #2563eb, #4f46e5 45%, #7c3aed)',
            color: '#ffffff',
            font: 'inherit',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again now
        </button>
      </div>
    </div>
  );
}
