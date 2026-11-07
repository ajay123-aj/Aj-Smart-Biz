'use client';

import ApiDownNotice from '@/components/ApiDownNotice';

/**
 * Error boundary for a page. Catches a failed render below the root layout and
 * shows a self-retrying "back in a moment" screen instead of Next's error page.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ApiDownNotice reset={reset} />;
}
