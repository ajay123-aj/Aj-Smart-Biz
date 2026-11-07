import Glyph from './Glyph';
import styles from './FloatingWhatsApp.module.css';

/**
 * A WhatsApp button pinned to the bottom-right of every page — the channel the
 * contact page calls fastest, one tap away wherever the visitor is.
 *
 * Renders nothing when the console has no WhatsApp number, so it can never
 * open `wa.me/undefined`.
 */
export default function FloatingWhatsApp({ whatsapp }: { whatsapp?: string }) {
  if (!whatsapp) return null;

  return (
    <a
      className={styles.button}
      href={`https://wa.me/${whatsapp}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Glyph name="message-circle" className={styles.icon} />
      <span className={styles.label}>WhatsApp us</span>
    </a>
  );
}
