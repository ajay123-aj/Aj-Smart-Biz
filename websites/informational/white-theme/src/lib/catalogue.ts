import { PRODUCTS_COPY } from '@/config/site';
import {
  fillCompany,
  type CatalogueFeature,
  type CategoryNode,
  type CompanyDetails,
  type ProductItem,
} from './company';

/**
 * What the catalogue should say on this tenant's site — the products, the
 * categories they are sorted into, and whatever is on offer today.
 *
 * The same job `resolveServices` does, and it takes the same hard line on
 * fallbacks for a stronger reason again. The platform can honestly build an
 * About section from a company's name and trade; it cannot invent a *product*,
 * and a product invented with a price on it is a customer arriving with the
 * wrong money for something that does not exist.
 *
 * So this returns `null` rather than reaching for content of its own, and `null`
 * covers every way a tenant can be not showing a catalogue — nothing here needs
 * to tell them apart:
 *
 *   - the plan does not grant `products`
 *   - the company has the switch off
 *   - the plan has stopped being served
 *   - the switch is on but every product is inactive or deleted
 *
 * The API decides all four and omits the block. That same answer decides the
 * `/products`, `/categories` and `/offers` routes and the menu entry, so a link,
 * a page and a band can never disagree about whether this tenant sells anything.
 */

/** The catalogue, resolved, with the template's wording under any blank field. */
export interface ResolvedCatalogue {
  eyebrow: string;
  title: string;
  lede: string;
  /** The label on each card's button, where the card has none of its own. */
  cta: string;

  categoriesEyebrow: string;
  categoriesTitle: string;
  categoriesLede: string;

  offersEyebrow: string;
  offersTitle: string;
  offersLede: string;

  /** Everything the tenant publishes. */
  items: ProductItem[];
  categories: CategoryNode[];
  offers: ProductItem[];

  /** The slices the home page's three bands render. */
  home: {
    categories: CategoryNode[];
    products: ProductItem[];
    offers: ProductItem[];
  };

  counts: { products: number; categories: number; offers: number };
}

export function resolveCatalogue(company: CompanyDetails): ResolvedCatalogue | null {
  const catalogue = company.features?.products ?? null;
  if (!catalogue?.items?.length) return null;

  const fill = (value: string | null | undefined, fallback: string) =>
    fillCompany(value?.trim() || fallback, company);

  /**
   * Every product goes through this on the way out, so the whole site reads one
   * normalised shape. The API already normalises the arrays; guarding again here
   * is cheap and a card printing a tick list is one bad `.map` away from taking
   * the page down.
   */
  const clean = (item: ProductItem): ProductItem => ({
    ...item,
    name: fillCompany(item.name, company),
    summary: item.summary ? fillCompany(item.summary, company) : null,
    images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
    highlights: Array.isArray(item.highlights) ? item.highlights.filter(Boolean) : [],
    specs: Array.isArray(item.specs) ? item.specs.filter((spec) => spec?.label && spec?.value) : [],
    categoryPath: Array.isArray(item.categoryPath) ? item.categoryPath : [],
    /* Trimmed so a label of spaces falls back to the section's rather than
       rendering as a button with nothing on it. */
    ctaLabel: item.ctaLabel?.trim() || null,
  });

  const source: CatalogueFeature = catalogue;

  return {
    eyebrow: fill(source.eyebrow, PRODUCTS_COPY.eyebrow),
    title: fill(source.title, PRODUCTS_COPY.title),
    lede: fill(source.lead, PRODUCTS_COPY.lede),
    cta: source.ctaLabel?.trim() || PRODUCTS_COPY.cta,

    categoriesEyebrow: fill(source.categoriesEyebrow, PRODUCTS_COPY.categoriesEyebrow),
    categoriesTitle: fill(source.categoriesTitle, PRODUCTS_COPY.categoriesTitle),
    categoriesLede: fill(source.categoriesLead, PRODUCTS_COPY.categoriesLede),

    offersEyebrow: fill(source.offersEyebrow, PRODUCTS_COPY.offersEyebrow),
    offersTitle: fill(source.offersTitle, PRODUCTS_COPY.offersTitle),
    offersLede: fill(source.offersLead, PRODUCTS_COPY.offersLede),

    items: (source.items ?? []).map(clean),
    categories: source.categories ?? [],
    offers: (source.offers ?? []).map(clean),

    home: {
      categories: source.home?.categories ?? [],
      products: (source.home?.products ?? []).map(clean),
      offers: (source.home?.offers ?? []).map(clean),
    },

    counts: source.counts ?? { products: 0, categories: 0, offers: 0 },
  };
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/**
 * A price as the tenant's own currency, in the visitor's own locale.
 *
 * `Intl.NumberFormat` rather than a template string, because "₹24,999" is not
 * "₹24999" and neither is "24.999 €" — where the symbol goes and how the digits
 * group are properties of the currency, not of this file. The currency comes
 * from the tenant's own profile (`locale.currency`), so a business selling in
 * dirhams is not shown rupees.
 *
 * The *formatting* locale is the template's, not the visitor's: this renders on
 * the server, so reading the visitor's locale would make the same page different
 * per request and break Next's caching of it. `en-IN` is the platform's default
 * and INR the fallback currency, which matches where its tenants are.
 *
 * Falls back to the plain number rather than throwing: an unrecognised currency
 * code on one tenant's profile must not take their catalogue down.
 */
const FORMAT_LOCALE = 'en-IN';
const FALLBACK_CURRENCY = 'INR';

export function formatMoney(
  amount: number | null | undefined,
  company: CompanyDetails
): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;

  const currency = company.locale?.currency || FALLBACK_CURRENCY;

  try {
    return new Intl.NumberFormat(FORMAT_LOCALE, {
      style: 'currency',
      currency,
      /* Whole numbers stay whole — "₹24,999", not "₹24,999.00" — but a price
         with real paise keeps them. */
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

/**
 * How a product's price should read, decided in **one place**.
 *
 * Three fields and one order: the free-text label wins outright, then the
 * offer/normal pair, then the plain number. Every card, every page and the
 * detail view ask this rather than reimplementing it — the alternative is a
 * catalogue where the card says one thing and the product page another, which is
 * the kind of disagreement a customer notices at the till.
 *
 * Returns `null` for `now` when there is no number to show at all, which is a
 * real state: a product can be published with no price, and the card then shows
 * no figure rather than a zero.
 */
export interface PriceView {
  /** What they pay, formatted. Null on a product with no price at all. */
  now: string | null;
  /** The old price, struck through. Null unless there is genuinely one. */
  was: string | null;
  /** The tenant's free-text price, when it overrides the numbers. */
  words: string | null;
  /** What the offer badge should say, or null when there is no badge. */
  badge: string | null;
}

export function priceOf(product: ProductItem, company: CompanyDetails): PriceView {
  const badge = product.onOffer
    ? product.offerLabel?.trim() ||
      (product.discountPercent !== null ? `-${product.discountPercent}%` : PRODUCTS_COPY.offerBadge)
    : null;

  // The override. Deliberately still carries the badge: a business pricing in
  // words can still run an offer, which is what `onOffer` exists for.
  if (product.priceLabel?.trim()) {
    return { now: null, was: null, words: product.priceLabel.trim(), badge };
  }

  const reduced =
    product.price !== null && product.offerPrice !== null && product.offerPrice < product.price;

  return {
    now: formatMoney(product.effectivePrice, company),
    was: reduced ? formatMoney(product.price, company) : null,
    words: null,
    badge,
  };
}

/** Availability in the visitor's words rather than the API's keys. */
export function stockLabel(product: ProductItem): string | null {
  if (product.stockStatus === 'out_of_stock') return PRODUCTS_COPY.outOfStock;
  if (product.stockStatus === 'made_to_order') return PRODUCTS_COPY.madeToOrder;
  // "In stock" on everything is noise — it is the ordinary case, so it is not
  // worth a badge on every card. Absence says it.
  return null;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/** Every category in the tree, flattened, parents before their children. */
export function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

/** One category by slug, anywhere in the tree. */
export function findCategory(nodes: CategoryNode[], slug: string): CategoryNode | null {
  return flattenCategories(nodes).find((node) => node.slug === slug) ?? null;
}

/**
 * The products in a category, **including everything in its subcategories**.
 *
 * This is the whole point of filing a product in the deepest category that fits.
 * A visitor who clicks "Furniture" wants the dining tables under it, and asking
 * them to find "Dining tables" separately is how a catalogue loses a sale. The
 * ancestry is already on each product as `categoryPath`, so this is a lookup
 * rather than a tree walk.
 */
export function productsInCategory(items: ProductItem[], slug: string): ProductItem[] {
  return items.filter((item) => item.categoryPath.some((node) => node.slug === slug));
}

/** How the count under a category tile should read. */
export function countLabel(count: number): string {
  return count === 1
    ? PRODUCTS_COPY.categoryCountOne
    : PRODUCTS_COPY.categoryCount.replace('{n}', String(count));
}
