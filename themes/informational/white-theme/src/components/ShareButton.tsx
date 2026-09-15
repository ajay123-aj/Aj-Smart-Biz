'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ShareChannel, ShareLinkFeature } from '@/lib/company';
import styles from './ShareButton.module.css';

/**
 * The share button.
 *
 * The parent decides whether this tenant may have one at all — it passes
 * `share: null` when the API withheld the feature — so nothing here checks
 * entitlement. What it does decide is *how* to share, which is a runtime
 * question the server cannot answer:
 *
 *   - a device with a real share sheet (`navigator.share`, i.e. most phones)
 *     gets that, because it reaches apps a web link never can
 *   - everything else gets the channels the company ticked in the admin
 *
 * The page URL is read in the browser rather than built from the tenant's
 * domain, so sharing from a branch host, a preview tunnel or a deep link all
 * pass on the address the visitor is actually looking at.
 */

interface ChannelMeta {
  key: ShareChannel;
  name: string;
  /** Builds the outbound link. `copy` has none — it is handled separately. */
  href: (url: string, text: string) => string;
}

const CHANNELS: ChannelMeta[] = [
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    key: 'facebook',
    name: 'Facebook',
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    key: 'x',
    name: 'X',
    href: (url, text) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    key: 'telegram',
    name: 'Telegram',
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    key: 'email',
    name: 'Email',
    href: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n${url}`)}`,
  },
];

export function ShareMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .17 1L8.83 8.6a3 3 0 1 0 0 6.8l6.34 3.6A3 3 0 1 0 18 16a3 3 0 0 0-2.1.86l-6.05-3.44a3 3 0 0 0 0-2.84L15.9 7.14A3 3 0 0 0 18 8Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface Props {
  share: ShareLinkFeature | null;
  /** The message, with `{company}` already filled in by the server. */
  message: string;
  variant?: 'solid' | 'outline';
  className?: string;
}

/** Everything the two entry points need; kept in one hook so they behave alike. */
function useShare(message: string) {
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Unknown until the browser says so, so the server and client agree on first paint. */
  const [native, setNative] = useState(false);

  useEffect(() => {
    setUrl(window.location.href);
    setNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // Escape closes the sheet, and so does scrolling away from it on a phone.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A refused clipboard permission is not worth an error message; the
      // visitor can still use any of the other channels, or the address bar.
    }
  }, [url]);

  const activate = useCallback(async () => {
    if (native) {
      try {
        await navigator.share({ text: message, url });
        return;
      } catch {
        // Dismissing the sheet rejects, which is not a failure — fall through
        // to the channel list rather than leaving the visitor with nothing.
      }
    }
    setOpen((value) => !value);
  }, [native, message, url]);

  return { url, open, setOpen, copied, copy, activate };
}

/** The channel list, shared by the inline button and the floating one. */
function ChannelSheet({
  share,
  url,
  message,
  copied,
  copy,
  onClose,
  align,
}: {
  share: ShareLinkFeature;
  url: string;
  message: string;
  copied: boolean;
  copy: () => void;
  onClose: () => void;
  align: 'left' | 'right';
}) {
  const chosen = CHANNELS.filter((channel) => share.channels.includes(channel.key));
  const wantsCopy = share.channels.includes('copy');

  return (
    <div className={`${styles.sheet} ${align === 'right' ? styles.sheetRight : ''}`} role="menu">
      {wantsCopy ? (
        <button type="button" className={styles.channel} role="menuitem" onClick={copy}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      ) : null}

      {chosen.map((channel) => (
        <a
          key={channel.key}
          className={styles.channel}
          role="menuitem"
          href={channel.href(url, message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
        >
          {channel.name}
        </a>
      ))}

      {/* A company can tick nothing at all; say so rather than showing a void. */}
      {!wantsCopy && chosen.length === 0 ? <span className={styles.channelEmpty}>Nothing to share to</span> : null}
    </div>
  );
}

export default function ShareButton({ share, message, variant = 'outline', className }: Props) {
  const { url, open, setOpen, copied, copy, activate } = useShare(message);
  if (!share) return null;

  return (
    <span className={`${styles.wrap} ${className ?? ''}`}>
      <button
        type="button"
        className={`${styles.btn} ${styles[variant]}`}
        onClick={activate}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ShareMark className={styles.mark} />
        {share.headline}
      </button>

      {open ? (
        <>
          <span className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <ChannelSheet
            share={share}
            url={url}
            message={message}
            copied={copied}
            copy={copy}
            onClose={() => setOpen(false)}
            align="left"
          />
        </>
      ) : null}
    </span>
  );
}

/**
 * The floating counterpart, sitting above the WhatsApp bubble so the two read
 * as one stack of actions rather than two unrelated corners.
 */
export function ShareFab({
  share,
  message,
  raised,
}: {
  share: ShareLinkFeature | null;
  message: string;
  /** True when the WhatsApp bubble is also on the page and needs the corner. */
  raised: boolean;
}) {
  const { url, open, setOpen, copied, copy, activate } = useShare(message);
  if (!share) return null;

  return (
    <div className={`${styles.fabWrap} ${raised ? styles.fabRaised : ''}`}>
      {open ? (
        <>
          <span className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
          <ChannelSheet
            share={share}
            url={url}
            message={message}
            copied={copied}
            copy={copy}
            onClose={() => setOpen(false)}
            align="right"
          />
        </>
      ) : null}

      <button
        type="button"
        className={styles.fab}
        onClick={activate}
        title={share.headline}
        aria-label={share.headline}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ShareMark className={styles.fabMark} />
      </button>
    </div>
  );
}
