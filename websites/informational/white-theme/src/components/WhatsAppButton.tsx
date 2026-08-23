import {
  fillCompany,
  whatsappFor,
  whatsappSetFor,
  type CompanyDetails,
  type WhatsappType,
} from '@/lib/company';
import styles from './WhatsAppButton.module.css';

/** The WhatsApp glyph, inlined so no request and no icon font is needed. */
export function WhatsAppMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.04 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.6 4.47 1.73 6.42L3.2 28.8l6.55-1.71a12.74 12.74 0 0 0 6.29 1.64h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.64-3.75-9.06a12.72 12.72 0 0 0-9.06-3.67Zm0 23.05h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.05 1.07-3.92-.25-.4a10.57 10.57 0 0 1-1.62-5.67c0-5.87 4.78-10.64 10.65-10.64 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.53c0 5.87-4.78 10.64-10.66 10.64Zm5.84-7.97c-.32-.16-1.89-.93-2.19-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.25-.18.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.18-.32-.02-.5.14-.66.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.66s1.14 3.08 1.3 3.29c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z"
      />
    </svg>
  );
}

interface Props {
  company: CompanyDetails;
  /** Which desk this button should reach. */
  type: WhatsappType;
  /** Overrides the label; otherwise the company's own is used. */
  label?: string;
  variant?: 'solid' | 'outline' | 'plain';
  className?: string;
  /**
   * Render only when the company set a number for this exact type, instead of
   * falling back to the general one. For buttons that only earn their place by
   * pointing somewhere different — see `whatsappSetFor`.
   */
  exact?: boolean;
}

/**
 * A "WhatsApp us" link pointing at the number the company set for this kind of
 * conversation.
 *
 * Renders nothing at all when the tenant is not entitled to WhatsApp — the API
 * omits the block, so absence is the whole check. That is deliberate: a button
 * hidden by CSS is still in the markup, and a plan the platform stopped serving
 * should leave no trace of the feature on the page.
 */
export default function WhatsAppButton({
  company,
  type,
  label,
  variant = 'solid',
  className,
  exact = false,
}: Props) {
  const number = exact ? whatsappSetFor(company, type) : whatsappFor(company, type);
  if (!number) return null;

  return (
    <a
      className={`${styles.btn} ${styles[variant]} ${className ?? ''}`}
      href={number.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <WhatsAppMark className={styles.mark} />
      {label ?? number.label}
    </a>
  );
}

/**
 * The floating bubble in the bottom-right corner, the way the reference site
 * has it. Uses the company's general-purpose number.
 *
 * It carries the company name in its tooltip and screen-reader label rather
 * than a bare "chat", so a visitor using either knows who they are messaging.
 */
export function WhatsAppFab({ company }: { company: CompanyDetails }) {
  const number = whatsappFor(company, 'contact');
  if (!number) return null;

  const title = fillCompany('Chat with {company} on WhatsApp', company);

  return (
    <a
      className={styles.fab}
      href={number.href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
    >
      <WhatsAppMark className={styles.fabMark} />
      <span className={styles.fabText}>Chat with us</span>
    </a>
  );
}
