import Link from 'next/link';
import { BLOG_COPY } from '@/config/site';
import { hasSection, toFileUrl, type BlogPostCard, type CompanyDetails } from '@/lib/company';
import { postDate, resolveBlog } from '@/lib/blog';
import styles from './BlogSection.module.css';

/**
 * The blog — what the business has been doing, in its own words.
 *
 * A shared component in the shape the rest of the template uses: it takes the
 * company, asks `resolveBlog` what to say, and brings its own styling. It
 * renders in two places — a shortened band on the home page and the archive's
 * own grid — and the only thing that differs is `limit` and, on the archive, the
 * posts being passed in explicitly.
 *
 * Every word, picture and date is the tenant's. When they have published none —
 * or the plan does not carry the section, or the switch is off — `resolveBlog`
 * answers `null` and this renders nothing. That absence is the whole of the
 * "show it only when it is on" rule; neither page holds a condition of its own.
 *
 * The card answers a reader's questions in the order they ask them: what is this
 * about, when was it written, how long will it take me. The date is not
 * decoration on a blog — it is how a reader decides whether the article is still
 * true — so it is printed plainly rather than tucked under the fold.
 */
export default function BlogSection({
  company,
  limit,
  posts,
  showHead = true,
  className,
}: {
  company: CompanyDetails;
  /** Shortens the list. The home page passes one; the archive does not. */
  limit?: number;
  /**
   * The posts to render, when the caller already has them.
   *
   * The archive fetches its own page from the API — the payload only carries the
   * latest few — and hands them here so both places draw the same card. Omitted,
   * the section renders what came with the company.
   */
  posts?: BlogPostCard[];
  /**
   * Whether to print the heading block. The archive has already printed it as
   * its `h1`, resolved by the same function, so this suppresses the copy rather
   * than changing it.
   */
  showHead?: boolean;
  /** For the caller's spacing and nothing else. */
  className?: string;
}) {
  const section = resolveBlog(company, posts ? undefined : limit);
  /* `posts` is what the archive is showing; without it, render nothing at all
     rather than an empty grid — the same absence rule as everywhere else. */
  if (!section && !posts?.length) return null;

  const items = posts ?? section?.items ?? [];
  if (!items.length) return null;

  const eyebrow = section?.eyebrow ?? BLOG_COPY.eyebrow;
  const title = section?.title ?? BLOG_COPY.title;
  const lede = section?.lede ?? BLOG_COPY.lede;
  const cta = section?.cta ?? BLOG_COPY.cta;
  const showAuthor = section?.showAuthor ?? true;

  /* Only worth linking to the archive from a band standing on another page. */
  const blogHref = hasSection(company, '/blog') ? '/blog' : null;
  const truncated = !posts && (section?.truncated ?? false);

  return (
    <section className={`section ${styles.section} ${className ?? ''}`} id="blog">
      <div className="container">
        {showHead ? (
          <div className="section-head">
            <span className="eyebrow">{eyebrow}</span>
            <h2 className="section-title">{title}</h2>
            <p className="section-lede">{lede}</p>
          </div>
        ) : null}

        <ul className={styles.grid}>
          {items.map((post) => (
            <PostCard key={post.id} post={post} cta={cta} showAuthor={showAuthor} />
          ))}
        </ul>

        {/*
          Shown only when the list was actually shortened *and* there is an
          archive to send the reader to. A business with two posts gets two and
          no link, rather than an invitation to read the ones it has not written.
        */}
        {truncated && blogHref ? (
          <div className={styles.more}>
            <Link className="btn btn--ghost" href={blogHref}>
              {BLOG_COPY.more} →
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * One post.
 *
 * **The whole card is the link**, with the title carrying the accessible name —
 * a reader aiming at an article should not have to find the four words that are
 * clickable. The `Read more` line stays because it says what the card does, but
 * it is decoration on a surface that is already one target.
 *
 * A post without a cover gets a short tinted band rather than a picture-sized
 * frame: an image-shaped hole reads as a picture that failed to load, and most
 * posts on most sites will never have one. The band carries no text of its own -
 * the date belongs on the metadata line with the reading time, and printing it
 * twice on one card is not a design.
 */
function PostCard({
  post,
  cta,
  showAuthor,
}: {
  post: BlogPostCard;
  cta: string;
  showAuthor: boolean;
}) {
  const cover = toFileUrl(post.coverImage);
  const date = postDate(post.publishedAt);

  return (
    <li className={styles.card}>
      <Link className={styles.link} href={`/blog/${post.slug}`}>
        <div className={`${styles.header} ${cover ? styles.hasPhoto : styles.hasNoPhoto}`}>
          {cover ? (
            /* Not next/image: the file origin is configured per deployment and a
               plain img keeps the section working when it is not. The same call
               every other section on this site makes. */
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.photo} src={cover} alt="" loading="lazy" />
          ) : null}

          {post.featured ? <span className={styles.pin}>Featured</span> : null}
        </div>

        <div className={styles.body}>
          <p className={styles.meta}>
            <time dateTime={post.publishedAt}>{date}</time>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span>{BLOG_COPY.readTime.replace('{n}', String(post.readMinutes))}</span>
          </p>

          <h3 className={styles.title}>{post.title}</h3>

          {post.excerpt ? <p className={styles.excerpt}>{post.excerpt}</p> : null}

          <div className={styles.foot}>
            {/* The byline, only where the company publishes them and only where
                this post has one. Two conditions, because a company that prints
                bylines still has posts it wrote as itself. */}
            {showAuthor && post.author ? (
              <span className={styles.author}>{BLOG_COPY.byLine.replace('{name}', post.author)}</span>
            ) : null}
            <span className={styles.cta}>{cta} →</span>
          </div>
        </div>
      </Link>

      {/*
        The tags, outside the card's link.

        A link inside a link is invalid HTML and the browser drops one of them,
        so these sit as a sibling under it — which is also the right behaviour: a
        reader clicking `kitchens` wants everything filed under it, not this
        article.
      */}
      {post.tags.length ? (
        <ul className={styles.tags}>
          {post.tags.map((tag) => (
            <li key={tag}>
              <Link className={styles.tag} href={`/blog?tag=${encodeURIComponent(tag)}`}>
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
