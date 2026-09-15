import { PRODUCTS_COPY } from '@/config/site';
import { toFileUrl } from '@/lib/company';
import styles from './ProductGallery.module.css';

/**
 * A product's photographs — one large, the rest as thumbnails under it.
 *
 * **No JavaScript, deliberately.** The stage is a scroll-snapping track and each
 * thumbnail is an anchor to its slide, so tapping one scrolls that image into
 * view and swiping works on a phone without anything being hydrated first.
 *
 * That is worth more here than anywhere else in this template. A product page is
 * the page most likely to be opened cold from a search result on a slow
 * connection, and a gallery that needs a bundle to show the second photograph
 * shows one photograph until it arrives — on the page where the photographs are
 * the reason somebody came.
 *
 * A single image renders as the stage alone: a row of one thumbnail is a control
 * that does nothing.
 */
export default function ProductGallery({
  images,
  alt,
  productId,
}: {
  images: string[];
  alt: string;
  /** Namespaces the fragment ids, so two galleries on one page cannot collide. */
  productId: number;
}) {
  const files = images.map(toFileUrl).filter((url): url is string => Boolean(url));

  if (!files.length) {
    return <div className={styles.noPhoto}>{PRODUCTS_COPY.noImage}</div>;
  }

  const slideId = (index: number) => `p${productId}-shot-${index}`;

  return (
    <div className={styles.gallery}>
      <div className={styles.track}>
        {files.map((file, index) => (
          <div className={styles.slide} id={slideId(index)} key={file}>
            {/* Not next/image: the file origin is configured per deployment and
                a plain img keeps the page working when it is not. The first is
                eager — it is the largest thing above the fold. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file}
              alt={index === 0 ? alt : `${alt} — ${index + 1}`}
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>

      {files.length > 1 ? (
        <ul className={styles.thumbs} aria-label={PRODUCTS_COPY.galleryLabel}>
          {files.map((file, index) => (
            <li key={file}>
              <a className={styles.thumb} href={`#${slideId(index)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file} alt={`${alt} — ${index + 1}`} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
