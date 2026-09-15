import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CtaBand from '@/components/CtaBand';
import { BLOG_COPY } from '@/config/site';
import { navOf, toFileUrl, type CompanyDetails } from '@/lib/company';
import { getCompanyDetails } from '@/lib/company.server';
import { getBlogPost } from '@/lib/blog.server';
import { paragraphsOf, postDate } from '@/lib/blog';
import styles from './page.module.css';

type Params = Promise<{ slug: string }>;

const pageLabel = (company: CompanyDetails): string =>
  navOf(company).find((entry) => entry.key === 'blog')?.label ?? BLOG_COPY.metaTitle;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [company, { slug }] = await Promise.all([getCompanyDetails(), params]);
  const article = await getBlogPost(slug);

  if (!article) {
    return { title: company.name, robots: { index: false, follow: false } };
  }

  const { post } = article;
  const cover = toFileUrl(post.coverImage);

  return {
    title: `${post.title} · ${company.name}`,
    description: post.excerpt || undefined,
    robots: company.service.active ? undefined : { index: false, follow: false },
    /**
     * An article is the one thing on this site that is genuinely *published* —
     * written by somebody, on a date, about a subject — so it says so: the
     * author and the date go in the card a search engine and a chat app read,
     * and the cover is the share image rather than the company logo.
     */
    authors: article.settings.showAuthor && post.author ? [{ name: post.author }] : undefined,
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt || undefined,
      publishedTime: post.publishedAt,
      tags: post.tags,
      images: cover ? [cover] : undefined,
    },
  };
}

/**
 * One article.
 *
 * The only page on this site that fetches its own subject: the company payload
 * carries post *cards*, never bodies, because a blog accumulates and an archive
 * of article text riding along with every page render would make the home page
 * pay for it forever. See `blog.server`.
 *
 * **The body is printed as plain text, in paragraphs.** Nothing here interprets
 * markup, deliberately — so there is no path by which something a tenant pasted
 * from a word processor, or anything a compromised console might write, becomes
 * live HTML on a page a stranger is reading. See `paragraphsOf`.
 *
 * A slug that names nothing is a genuine 404, and so is a post whose date has
 * not arrived: "there is no such page on this website today" is true of both,
 * and the alternative would let anybody with a URL confirm that a tenant has an
 * article scheduled.
 */
export default async function BlogPostPage({ params }: { params: Params }) {
  const [company, { slug }] = await Promise.all([getCompanyDetails(), params]);

  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;

  const article = await getBlogPost(slug);
  if (!article) notFound();

  const { post, settings, previous, next } = article;

  const cover = toFileUrl(post.coverImage);
  const date = postDate(post.publishedAt);
  const paragraphs = paragraphsOf(post.body);
  const label = pageLabel(company);
  const byline = settings.showAuthor && post.author ? post.author : null;

  return (
    <>
      <article>
        {/* ------------------------------ masthead ----------------------------- */}
        <header className={styles.masthead}>
          <div className="container">
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link className={styles.crumb} href="/">
                Home
              </Link>
              <span className={styles.crumbSep} aria-hidden="true">
                /
              </span>
              <Link className={styles.crumb} href="/blog">
                {label}
              </Link>
              <span className={styles.crumbSep} aria-hidden="true">
                /
              </span>
              <span aria-current="page">{post.title}</span>
            </nav>

            <span className="eyebrow">{settings.eyebrow}</span>
            <h1 className={styles.title}>{post.title}</h1>

            {post.excerpt ? <p className={styles.lead}>{post.excerpt}</p> : null}

            {/*
              The date, the byline and the estimate, on one line under the
              standfirst. A reader deciding whether to start asks all three at
              once, so they are answered in one place rather than scattered.
            */}
            <p className={styles.meta}>
              <time dateTime={post.publishedAt}>{date}</time>
              {byline ? (
                <>
                  <span className={styles.dot} aria-hidden="true">
                    ·
                  </span>
                  <span>{BLOG_COPY.byLine.replace('{name}', byline)}</span>
                </>
              ) : null}
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
              <span>{BLOG_COPY.readTime.replace('{n}', String(post.readMinutes))}</span>
            </p>
          </div>
        </header>

        {cover ? (
          <div className={`container ${styles.coverWrap}`}>
            {/* Not next/image: the file origin is configured per deployment and a
                plain img keeps the page working when it is not. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.cover} src={cover} alt="" />
          </div>
        ) : null}

        {/* -------------------------------- body ------------------------------- */}
        <div className="container">
          <div className={styles.body}>
            {paragraphs.map((paragraph, index) => (
              // The text is the key's only stable identity; an article's
              // paragraphs are static for the life of the render either way.
              // eslint-disable-next-line react/no-array-index-key
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {post.tags.length ? (
            <ul className={styles.tags} aria-label="Tags">
              {post.tags.map((tag) => (
                <li key={tag}>
                  <Link className={styles.tag} href={`/blog?tag=${encodeURIComponent(tag)}`}>
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </article>

      {/*
        What to read next.

        Sent with the article rather than fetched separately, because somebody
        who has just finished reading is at the single most likely moment to read
        another — and a page that goes back to the server to offer that will
        often not offer it in time.
      */}
      <nav className={styles.around} aria-label="More posts">
        <div className={`container ${styles.aroundRow}`}>
          {previous ? (
            <Link className={styles.jump} href={`/blog/${previous.slug}`} rel="prev">
              <span className={styles.jumpLabel}>← {BLOG_COPY.previous}</span>
              <span className={styles.jumpTitle}>{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}

          <Link className={styles.allPosts} href="/blog">
            {BLOG_COPY.backToBlog}
          </Link>

          {next ? (
            <Link className={`${styles.jump} ${styles.jumpNext}`} href={`/blog/${next.slug}`} rel="next">
              <span className={styles.jumpLabel}>{BLOG_COPY.next} →</span>
              <span className={styles.jumpTitle}>{next.title}</span>
            </Link>
          ) : (
            <span />
          )}
        </div>
      </nav>

      <CtaBand company={company} />
    </>
  );
}
