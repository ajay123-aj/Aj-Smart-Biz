import { TEAM_COPY } from '@/config/site';
import { telHref, toFileUrl, type CompanyDetails } from '@/lib/company';
import styles from './TeamSection.module.css';

/**
 * The Team section.
 *
 * Renders only when the tenant is entitled to it *and* has added someone — the
 * API omits the block in either case, so absence is the whole check. Nothing
 * here is hidden with CSS: a plan that lapses should leave no trace of the
 * section, not a `display: none` a visitor can read in the source.
 */
export default function TeamSection({ company }: { company: CompanyDetails }) {
  const team = company.features?.team;
  const members = team?.members ?? [];
  if (!members.length) return null;

  return (
    <section className="section section--muted" id="team">
      <div className="container">
        <div className="section-head">
          {/*
            The tenant's own wording. The API resolves it — sending its own
            defaults where the company wrote nothing — so `TEAM_COPY` is reached
            for only by an API too old to carry the block at all.
          */}
          <span className="eyebrow">{team?.eyebrow || TEAM_COPY.eyebrow}</span>
          <h2 className="section-title">{team?.title || TEAM_COPY.title}</h2>
          <p className="section-lede">{team?.lead || TEAM_COPY.lede}</p>
        </div>

        <div className={styles.grid}>
          {members.map((member) => {
            const photo = toFileUrl(member.photo);
            const hasLinks = member.email || member.phone || member.linkedinUrl;

            return (
              <article className={styles.card} key={member.id}>
                {photo ? (
                  // Not next/image: the file origin is configured per deployment
                  // and a plain img keeps the section working when it is not.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.photo} src={photo} alt={member.name} loading="lazy" />
                ) : (
                  <span className={styles.photoFallback} aria-hidden="true">
                    {member.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}

                <div className={styles.body}>
                  <h3 className={styles.name}>{member.name}</h3>
                  {member.role ? <p className={styles.role}>{member.role}</p> : null}

                  {/* Held back until hover on a pointer device — see the CSS. */}
                  {member.bio || hasLinks ? (
                    <div className={styles.reveal}>
                      {member.bio ? <p className={styles.bio}>{member.bio}</p> : null}

                      {/* Only what the company chose to publish for this person. */}
                      {hasLinks ? (
                        <div className={styles.links}>
                          {member.email ? (
                            <a className={styles.link} href={`mailto:${member.email}`}>
                              Email
                            </a>
                          ) : null}
                          {member.phone ? (
                            <a className={styles.link} href={`tel:${telHref(member.phone)}`}>
                              Call
                            </a>
                          ) : null}
                          {member.linkedinUrl ? (
                            <a
                              className={styles.link}
                              href={member.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              LinkedIn
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
