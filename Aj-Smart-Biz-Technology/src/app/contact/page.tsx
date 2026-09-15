import type { Metadata } from 'next';
import EnquiryForm from '@/components/EnquiryForm';
import FaqSection from '@/components/FaqSection';
import Glyph from '@/components/Glyph';
import { CONTACT, CONTACT_PAGE } from '@/config/site';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Talk to Aj Smart Biz Technology about a website, a plan, or an existing site. WhatsApp, phone or email — answered by a person.',
};

/**
 * Contact.
 *
 * The three ways to reach us come **first**, above the form, which is the
 * opposite of the usual arrangement and deliberate: somebody on this page has
 * already decided to get in touch, and making them fill in nine fields to do
 * something a phone call would settle in a minute loses the ones in a hurry.
 * The form is for people who would rather write.
 *
 * `kind="contact"` only changes the opening line of the composed message — see
 * `lib/enquiry.ts`.
 */
export default function ContactPage() {
  const channels = [
    {
      icon: 'message-circle',
      label: 'WhatsApp',
      value: CONTACT.phone,
      href: `https://wa.me/${CONTACT.whatsapp}`,
      note: 'Fastest. Usually answered within the hour.',
      external: true,
    },
    {
      icon: 'phone',
      label: 'Phone',
      value: CONTACT.phone,
      href: `tel:${CONTACT.phoneHref}`,
      note: CONTACT.hours,
      external: false,
    },
    {
      icon: 'mail',
      label: 'Email',
      value: CONTACT.email,
      href: `mailto:${CONTACT.email}`,
      note: 'Replied to within one working day.',
      external: false,
    },
  ];

  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{CONTACT_PAGE.eyebrow}</span>
          <h1 className={styles.title}>{CONTACT_PAGE.title}</h1>
          <p className={styles.lede}>{CONTACT_PAGE.lede}</p>
        </div>
      </section>

      <section className={styles.channelsSection}>
        <div className="container">
          <ul className={styles.channels}>
            {channels.map((channel) => (
              <li key={channel.label}>
                <a
                  className={`card-surface ${styles.channel}`}
                  href={channel.href}
                  {...(channel.external
                    ? /* `noopener` is not optional on a `_blank` link: without
                         it the page that opens gets a handle on this one. */
                      { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  <span className={styles.channelIcon} aria-hidden="true">
                    <Glyph name={channel.icon} />
                  </span>
                  <span className={styles.channelLabel}>{channel.label}</span>
                  <span className={styles.channelValue}>{channel.value}</span>
                  <span className={styles.channelNote}>{channel.note}</span>
                </a>
              </li>
            ))}
          </ul>

          <p className={styles.address}>
            <Glyph name="map-pin" className={styles.addressIcon} />
            {CONTACT.addressLine}
          </p>
        </div>
      </section>

      <section className="section">
        <div className={`container ${styles.formWrap}`}>
          <header className="section-head">
            <h2 className="section-title">{CONTACT_PAGE.formTitle}</h2>
            <p className="section-lede">
              Tell us a little about the business and we will come back with a straight answer —
              including &ldquo;this is not what you need&rdquo; where that is the truth.
            </p>
          </header>

          <EnquiryForm kind="contact" submitLabel="Send on WhatsApp" />
        </div>
      </section>

      <FaqSection panel />
    </>
  );
}
