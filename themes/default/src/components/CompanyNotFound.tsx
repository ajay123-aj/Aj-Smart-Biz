import { COMPANY_NOT_FOUND } from '@/config/site';
import styles from './CompanyNotFound.module.css';

/**
 * Stands in for the whole website when the API answered but **this host names
 * no company**.
 *
 * The sibling of `ServiceUnavailable`, and the distinction between the two is
 * the whole reason this file exists:
 *
 *   ServiceUnavailable   nothing answered. We do not know whether this domain
 *                        belongs to anyone. Temporary, and nobody's fault.
 *   CompanyNotFound      the API answered, and the answer was "no tenant on
 *                        this host". That is a *settled* fact, not a blip, and
 *                        it stays true until somebody maps the domain.
 *
 * What this replaced was the worse of two bad options. A host that resolved to
 * nothing used to be served `FALLBACK_COMPANY` — the platform's own name, the
 * template's invented nav, its placeholder copy — at a 200. A visitor could not
 * tell it from a real business's website, and the person who had just pointed a
 * domain at this deployment had no signal at all that the mapping was missing:
 * the site looked like it worked. Now it says what is actually true.
 *
 * **Unbranded, deliberately.** There is no company here to brand it with. It is
 * still unmistakably *this theme* — every colour, radius and shadow below is a
 * template token, so the same markup is warm paper on the Gilt theme, white on
 * the white theme and near-black on the black one. What it never touches is
 * `--brand` or `--accent`, which are the tenant's and are overridden at runtime
 * from the API. With no tenant resolved those hold whatever the defaults happen
 * to be, and dressing this page in them would be dressing it in a company
 * nobody confirmed.
 *
 * It takes **no props**, and that is worth stating because it did briefly print
 * the host it had failed to match. That was aimed at whoever set the domain up,
 * but this page is public and every visitor who is not them reads a machine
 * name they did not ask for and cannot act on. The owner-facing line at the
 * bottom is the right amount of that, and it needs no host to be useful: the
 * person who can fix this already knows which domain they pointed here.
 */
export default function CompanyNotFound() {
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <span className={styles.mark} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* A shopfront with its shutter down. */}
            <path d="M3.5 9.5 5 4.5h14l1.5 5" />
            <path d="M4.5 9.5v10h15v-10" />
            <path d="M3.5 9.5a2.2 2.2 0 0 0 4.25 0 2.2 2.2 0 0 0 4.25 0 2.2 2.2 0 0 0 4.25 0 2.2 2.2 0 0 0 4.25 0" />
            <path d="M8.5 19.5v-5h7v5" />
          </svg>
        </span>

        <h1 className={styles.title}>{COMPANY_NOT_FOUND.title}</h1>
        <p className={styles.body}>{COMPANY_NOT_FOUND.body}</p>
        <p className={styles.action}>{COMPANY_NOT_FOUND.action}</p>

        <p className={styles.note}>{COMPANY_NOT_FOUND.note}</p>
      </div>
    </main>
  );
}
