import type { Metadata } from 'next';
import EnquiryForm from '@/components/EnquiryForm';
import FaqSection from '@/components/FaqSection';
import Glyph from '@/components/Glyph';
import { getSite } from '@/lib/api';
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
export default async function ContactPage() {
  const { content, businessTypes, plans } = await getSite();
  const page = content.contact_page;
  const contact = content.contact;

  /**
   * Built from what the console holds, and each one dropped where the detail is
   * blank. A channel card that links to `tel:` with nothing after it looks like
   * a way to reach us and is not.
   */
  const channels = [
    contact?.whatsapp && {
      icon: 'message-circle',
      label: 'WhatsApp',
      value: contact.phone ?? 'WhatsApp us',
      href: `https://wa.me/${contact.whatsapp}`,
      note: 'Fastest. Usually answered within the hour.',
      external: true,
    },
    contact?.phoneHref && {
      icon: 'phone',
      label: 'Phone',
      value: contact.phone ?? contact.phoneHref,
      href: `tel:${contact.phoneHref}`,
      note: contact.hours ?? '',
      external: false,
    },
    contact?.email && {
      icon: 'mail',
      label: 'Email',
      value: contact.email,
      href: `mailto:${contact.email}`,
      note: 'Replied to within one working day.',
      external: false,
    },
  ].filter(Boolean) as {
    icon: string;
    label: string;
    value: string;
    href: string;
    note: string;
    external: boolean;
  }[];

  return (
    <>
      <section className={`section ${styles.head}`}>
        <div className="container">
          <span className="eyebrow">{page?.eyebrow}</span>
          <h1 className={styles.title}>{page?.title}</h1>
          <p className={styles.lede}>{page?.lede}</p>
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

          {contact?.addressLine ? (
            <p className={styles.address}>
              <Glyph name="map-pin" className={styles.addressIcon} />
              {contact.addressLine}
            </p>
          ) : null}
        </div>
      </section>

      <section className="section">
        <div className={`container ${styles.formWrap}`}>
          <header className="section-head">
            <h2 className="section-title">{page?.formTitle}</h2>
            <p className="section-lede">
              Tell us a little about the business and we will come back with a straight answer —
              including &ldquo;this is not what you need&rdquo; where that is the truth.
            </p>
          </header>

          <EnquiryForm
            kind="contact"
            submitLabel="Send"
            businessTypes={businessTypes}
            plans={plans}
            whatsapp={contact?.whatsapp}
            email={contact?.email}
            shortName={content.site?.shortName}
            source="/contact"
          />
        </div>
      </section>

      <FaqSection panel />
    </>
  );
}
