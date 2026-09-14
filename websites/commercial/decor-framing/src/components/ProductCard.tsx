import Link from 'next/link';
import { PRODUCTS_COPY } from '@/config/site';
import { toFileUrl, type CompanyDetails, type ProductItem } from '@/lib/company';
import { priceOf, stockLabel } from '@/lib/catalogue';
import { canOrder, lineOf, orderingOf } from '@/lib/orders';
import AddToCartButton from './AddToCartButton';
import styles from './ProductCard.module.css';

/**
 * One product, as a card.
 *
 * **One component for the whole catalogue** — the home band, the products page,
 * a category listing, the offers page. Not tidiness: a product that looks like
 * one thing on the home page and another on the listing reads as two products,
 * and a visitor comparing prices between the two pages is the person that costs.
 *
 * The card answers a shopper's three questions in the order they ask them: what
 * is it, what does it cost, is it a good price today. Which is why the price sits
 * on its own line rather than at the end of a paragraph, and why the offer badge
 * is over the picture rather than beside the number — it has to survive being
 * scanned rather than read.
 *
 * **Nothing here decides anything about money.** `priceOf` resolves the three
 * pricing fields in their one true order and `onOffer` is the API's answer, so a
 * badge here can never disagree with the offers page or with the product's own.
 */
export default function ProductCard({
  product,
  company,
  cta,
  compact = false,
}: {
  product: ProductItem;
  company: CompanyDetails;
  /** The section's button label, used where the product has none of its own. */
  cta: string;
  /** The narrow variant — square picture, no summary. For rails and sidebars. */
  compact?: boolean;
}) {
  const image = toFileUrl(product.image);
  const price = priceOf(product, company);
  const stock = stockLabel(product);
  const href = `/products/${product.slug}`;

  /**
   * Whether this site takes orders at all, and whether this product is one of
   * them. Both answered by the API; the card decides nothing. The line is
   * snapshotted **here**, on the server, so the price in the basket is the one
   * `priceOf` just printed on the card rather than a second resolution of the
   * same three fields — and so that what crosses into the client component is
   * five fields rather than a whole product. See `CartLine`.
   */
  const orders = orderingOf(company);
  const line = orders ? lineOf(product, company) : null;

  /** The deepest category, which is the useful one — "Dining tables", not "Furniture". */
  const crumb = product.category?.name ?? null;

  return (
    <li className={`${styles.card} ${compact ? styles.compact : ''}`}>
      {/*
        The whole card is the link, but the anchor covers it rather than wrapping
        it. Wrapping would put the price and the badge inside a link, which reads
        badly to a screen reader and makes selecting the price impossible.
      */}
      <Link href={href} className={styles.hit} aria-label={product.name} />

      <div className={styles.frame}>
        {price.badge ? <span className={styles.badge}>{price.badge}</span> : null}
        {stock ? <span className={styles.stock}>{stock}</span> : null}

        {image ? (
          <>
            {/* Not next/image: the file origin is configured per deployment and
                a plain img keeps the catalogue working when it is not. The same
                call the Services, Team and Gallery sections make. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.photo} src={image} alt={product.name} loading="lazy" />

            {product.images.length > 1 ? (
              <span className={styles.shots}>{product.images.length}</span>
            ) : null}
          </>
        ) : (
          /*
           * No photograph. A tinted panel with the product's initial rather than
           * an empty frame — an empty frame reads as an image that failed to
           * load, and a catalogue is judged on whether it looks finished.
           */
          <div className={styles.noPhoto} aria-label={PRODUCTS_COPY.noImage}>
            <span className={styles.initial} aria-hidden="true">
              {product.name.trim().charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className={styles.body}>
        {crumb ? <span className={styles.crumb}>{crumb}</span> : null}

        <h3 className={styles.name}>{product.name}</h3>

        {product.summary && !compact ? <p className={styles.summary}>{product.summary}</p> : null}

        <div className={styles.prices}>
          {price.words ? (
            <span className={styles.words}>{price.words}</span>
          ) : price.now ? (
            <>
              <span className={styles.now}>{price.now}</span>
              {/* Only when there genuinely is an old price. A struck-through
                  number identical to the one beside it is worse than none. */}
              {price.was ? <span className={styles.was}>{price.was}</span> : null}
            </>
          ) : null}

          {/* The saving in words, next to the numbers, for the reader who wants
              it spelled out rather than inferred from two figures. */}
          {price.was && product.discountPercent !== null ? (
            <span className={styles.saving}>Save {product.discountPercent}%</span>
          ) : null}
        </div>

        {/* A cue, not a control — the card itself is the link, so this is marked
            hidden from assistive technology rather than announced twice. */}
        <span className={styles.cta} aria-hidden="true">
          {product.ctaLabel || cta} →
        </span>

        {/*
          The one control on the card that does not navigate. Absent entirely on
          a site that takes no orders, which is what `line` being null means —
          so a brochure catalogue is exactly the card it was before this
          existed, with nothing left behind reserving space.
        */}
        {line ? (
          <AddToCartButton line={line} orderable={canOrder(product, orders)} />
        ) : null}
      </div>
    </li>
  );
}
