'use client';

import ApiDownNotice from '@/components/ApiDownNotice';

/**
 * Error boundary for the root layout itself.
 *
 * The layout calls `getSite` for the header, so when the API is down with no
 * saved copy the failure happens *above* `app/error.tsx` and only this boundary
 * can catch it. It replaces the whole document, hence its own `<html>`/`<body>`.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0f2a' }}>
        <ApiDownNotice reset={reset} />
      </body>
    </html>
  );
}
