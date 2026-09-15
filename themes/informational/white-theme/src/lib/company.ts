/**
 * The shape `GET /website/company-details` answers with, and the one helper both
 * halves of the app need.
 *
 * Nothing here talks to the API — the call lives in `company.server.ts`, and the
 * endpoint itself lives in the backend (`Aj-Smart-Biz-Backend`), not in this app.
 * This file is free of `next/headers` on purpose: the header, slider and footer
 * are client components and import their types from here.
 */

const FILES_URL = process.env.NEXT_PUBLIC_FILES_URL || '';

export interface CompanyTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string | null;
  mode: string;
}

export interface CompanyAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  pincode: string | null;
}

export interface CompanyContact {
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  website: string | null;
}

export interface CompanyBranch {
  id: number;
  name: string;
  code: string;
  isMain: boolean;
  email: string | null;
  phone: string | null;
  address: CompanyAddress;
  latitude: string | number | null;
  longitude: string | number | null;
  openingTime: string | null;
  closingTime: string | null;
}

/**
 * One hero slide, managed by the tenant in the admin's Slider Management and
 * already resolved branch-wise and ordered by the API.
 */
export interface CompanySlide {
  id: number;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  /** Wide artwork for desktop. */
  image: string | null;
  /** Portrait crop for phones; falls back to `image` when the company left it empty. */
  mobileImage: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  sequence: number;
}

/* ------------------------------------------------------------------ *
 * Optional functionality
 * ------------------------------------------------------------------ */

/**
 * What a WhatsApp number is for. The API resolves every type — a type the
 * company left empty falls back to its contact number — so `byType` always has
 * all four whenever the block is present at all.
 */
export type WhatsappType = 'inquiry' | 'contact' | 'support' | 'orders';

export type ShareChannel = 'copy' | 'whatsapp' | 'facebook' | 'x' | 'linkedin' | 'telegram' | 'email';

/** One publishable WhatsApp number, with its link already built by the API. */
export interface WhatsappNumber {
  type: WhatsappType;
  /** The company's own label, or the type's name. */
  label: string;
  /** Printable, e.g. `+91 9876543210`. */
  display: string;
  number: string;
  countryCode: string;
  defaultMessage: string | null;
  /** A complete `https://wa.me/…?text=…` link. Nothing here builds one. */
  href: string;
}

export interface WhatsappFeature {
  numbers: WhatsappNumber[];
  /** Every type, resolved — see the note on `WhatsappType`. */
  byType: Record<WhatsappType, WhatsappNumber>;
  /** The general-purpose number, for the floating bubble. */
  primary: WhatsappNumber;
}

export interface ShareLinkFeature {
  headline: string;
  /** `{company}` is filled in at render time. */
  message: string;
  channels: ShareChannel[];
}

/**
 * One figure in the band. The API has already done the arithmetic — a card
 * counting years from a date arrives as a finished string — so the template
 * renders `display` and never computes anything itself.
 */
export interface Figure {
  id: number;
  label: string;
  display: string;
}

/**
 * The band of figures, or `null` when this tenant is not showing one.
 *
 * Its own feature rather than part of `about`, which is where it used to live
 * and never belonged: the band opens the **home page**, which renders nothing
 * else the About block carries, and a company can want its numbers on show
 * without buying a written About page. Absent unless the plan grants `figures`,
 * the tenant switched it on, the plan is still being served, and at least one
 * figure resolves to something — the same rule Team and Gallery follow.
 *
 * `eyebrow`, `title` and `lead` are always present and never blank; the API
 * fills its own wording where the tenant wrote none.
 */
export interface FiguresFeature extends SectionCopy {
  items: Figure[];
}

export interface AboutFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** Blank lines separate paragraphs. */
  body: string;
}

export interface TeamMember {
  id: number;
  name: string;
  role: string | null;
  bio: string | null;
  /** Upload path; run through `toFileUrl` before use. */
  photo: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
}

/**
 * The words above a section's cards, as the API resolved them: the tenant's own
 * where they wrote any, the platform's wording where they did not. Always
 * present and never blank, so a template renders them without a fallback of its
 * own — the one in `config/site.ts` is only for an API too old to send these.
 */
export interface SectionCopy {
  eyebrow: string;
  title: string;
  lead: string;
}

export interface TeamFeature extends SectionCopy {
  members: TeamMember[];
}

export interface GalleryImage {
  id: number;
  /** Upload path; run through `toFileUrl` before use. */
  image: string;
  title: string | null;
  caption: string | null;
  /** Already falls back to the title; empty means decorative. */
  altText: string;
}

export interface GalleryFeature extends SectionCopy {
  items: GalleryImage[];
}

/* ------------------------------ testimonials ------------------------------ */

/** How the company runs its wall. See `TestimonialsFeature`. */
export type TestimonialMode = 'static' | 'dynamic';

/** Who wrote a review — the company itself, or one of its customers. */
export type TestimonialSource = 'admin' | 'visitor';

/**
 * One published review.
 *
 * Everything a stranger typed that is *not* here is the point: the API holds an
 * email, a phone number and the submitting IP against a visitor review, and
 * sends none of them. This is the whole of what may go on a page.
 */
export interface Testimonial {
  id: number;
  authorName: string;
  authorRole: string | null;
  /** Upload path; run through `toFileUrl` before use. */
  photo: string | null;
  /** Out of five, or null — a written review with no star is fine. */
  rating: number | null;
  body: string;
  source: TestimonialSource;
  /** `YYYY-MM-DD`. No time of day. */
  submittedAt: string | null;
}

/** The wording around the form, present only when the form is. */
export interface TestimonialForm {
  title: string;
  note: string;
  showRating: boolean;
}

/**
 * A review button that leaves the site — the company's Google Business page, a
 * directory listing, a form it runs itself.
 *
 * The alternative to `form`, never its companion: the API sends one of the two
 * and nulls the other, so there is no arrangement of settings that produces two
 * review buttons on one section.
 *
 * `url` is `http`/`https` and absolute, checked on the way out of the platform
 * rather than here — which is what makes it safe to hand straight to an
 * `href`.
 */
export interface TestimonialReviewLink {
  /** The label on the button. The same field that titles the dialog. */
  label: string;
  url: string;
}

/**
 * The Testimonials section, or `null` when this tenant has nothing to show.
 *
 * The mode is what the company chose in the admin, and it has already decided
 * what arrived in `items`:
 *
 *   static   the company's own wall, every approved review, in the order it
 *            arranged by hand. No form.
 *   dynamic  the ten most recent approved reviews, newest first, whoever wrote
 *            them — plus a button for the next one, which is either our own
 *            form or a link off the site. See `canSubmit` and `reviewLink`.
 *
 * The template does not re-derive any of that. It renders `items` in the order
 * given and shows the form when `canSubmit` says so, which is what stops the
 * two ever disagreeing with the API about what a tenant is running.
 */
export interface TestimonialsFeature {
  mode: TestimonialMode;
  eyebrow: string;
  title: string;
  lead: string;
  /**
   * Whether this site is collecting reviews **through its own form**. The only
   * cue to render the dialog — a section can be open for reviews and still
   * have no form here, because the company sends people somewhere else.
   */
  canSubmit: boolean;
  form: TestimonialForm | null;
  /**
   * The other destination for the review button, when the company chose one.
   * Mutually exclusive with `form`: at most one of the two is ever non-null.
   */
  reviewLink: TestimonialReviewLink | null;
  items: Testimonial[];
  /** Every approved review, not just the ones sent — see `items`. */
  total: number;
  /** One decimal place, e.g. `4.8`; null when nobody has left a star. */
  averageRating: number | null;
  ratingCount: number;
}

/* --------------------------- features / benefits -------------------------- */

/**
 * One benefit card — a capability the business offers, and what it is worth to
 * the person reading.
 *
 * `icon` names a glyph the template draws itself; see `FeaturesSection`, which
 * owns the artwork and falls back to `spark` for a name it does not know.
 *
 * Deliberately a plain `string` rather than the template's own `FeatureIcon`
 * union. The platform's library is the wider of the two — it can grow a glyph
 * before this template learns to draw it — and typing this field as the
 * narrower set would be claiming the opposite. The renderer is what narrows it,
 * which is also the only place that can.
 */
export interface BenefitCard {
  id: number;
  icon: string;
  title: string;
  /** Optional — a good heading can stand on its own. */
  body: string | null;
}

/**
 * The Features / Benefits band, or `null` when this tenant is not showing one.
 *
 * Absent unless the plan grants `features_benefits`, the tenant switched it on,
 * the plan is still being served and there is at least one active card — the
 * same rule Team and Gallery follow. There is deliberately no fallback to the
 * template's own six cards: the platform knows nothing factual about a tenant's
 * capabilities, so wording nobody wrote is wording nobody can stand behind.
 */
export interface BenefitsFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The button under the lede, rendered only where there is a Contact page. */
  ctaLabel: string;
  items: BenefitCard[];
}

/* -------------------------------- services -------------------------------- */

/**
 * One service the business sells.
 *
 * Next to a `BenefitCard` this looks like the same thing with more fields on
 * it, and it is not. A benefit is a reason to choose the business; a service is
 * a thing it sells, and only one of the two has a price. They are two different
 * arguments and they are made in two different bands.
 *
 * `icon` is a plain string for the reason `BenefitCard.icon` is: the platform's
 * library is the wider set and can grow a glyph before this template learns to
 * draw it. `Glyph` narrows it, and falls back to `spark`.
 */
export interface ServiceItem {
  id: number;
  icon: string;
  /**
   * A photograph of the work. Null on most cards — the icon is what a service
   * without one falls back to, so the card is never short of a picture.
   */
  image: string | null;
  title: string;
  summary: string | null;
  /** What is included. Always an array — the API normalises it, never null. */
  highlights: string[];
  /** Free text, never a number: `From ₹45,000`, `On request`, `£60/hour`. */
  priceLabel: string | null;
  /**
   * The same price as a **number**, for a business that has one.
   *
   * A surveyor quotes per job and can honestly only write "From ₹4,999"; a salon
   * charges ₹300 for a haircut and has always known that. Both are null when the
   * tenant is recording its prices without publishing them — the same switch
   * hides the words and the figure, or one of the two would leak.
   */
  price: number | null;
  offerPrice: number | null;
  /** On offer today. Decided by the API, by the same rule a product's is. */
  onOffer: boolean;
  /** What that saves, as a whole percent. Null when there is no pair to compare. */
  discountPercent: number | null;
  /** How long it takes. Null where the business genuinely cannot say. */
  durationMinutes: number | null;
  /**
   * Whether a visitor may pick a **time** for this, rather than only ask about it.
   *
   * True only when the company takes bookings and this service is one that can be
   * booked — a salon takes appointments for a haircut and enquiries about a
   * wedding party.
   */
  bookable: boolean;
  /** Its own page: `/services/bridal-makeup`. */
  slug: string;
  /** The long copy on that page. Plain text; paragraphs, never markup. */
  description: string | null;
  /** Where it is filed, and the whole path to it — `Hair › Colour`. */
  category: ServiceCategoryRef | null;
  categoryPath: ServiceCategoryRef[];
  /**
   * This service's own button label, or null to use the section's.
   *
   * Null rather than pre-filled, so a company that changes the section's label
   * still changes every card that never deliberately overrode it.
   */
  ctaLabel: string | null;
  /** Read this one first. The section gives it the wide cell. */
  featured: boolean;
}

/** One step of a service's ancestry — `Hair › Colour`. */
export interface ServiceCategoryRef {
  id: number;
  slug: string;
  name: string;
}

/**
 * A node of the service taxonomy, with everything under it counted.
 *
 * A category with nothing in it never reaches the template: the API drops it,
 * because a heading that leads nowhere is worse than no heading.
 */
export interface ServiceCategoryNode extends ServiceCategoryRef {
  description: string | null;
  image: string | null;
  icon: string;
  featured: boolean;
  /** Services at or **below** this node, so a parent counts its children's. */
  serviceCount: number;
  children: ServiceCategoryNode[];
}

/**
 * The diary, or `null` when this tenant is not taking appointments.
 *
 * Absent rather than a flag, like everything else in this payload. It is absent
 * whenever the company has not switched booking on, and **also** whenever its
 * enquiries are not recorded at all — a WhatsApp-only site has nowhere for a
 * confirmed appointment to live, so there would be no status to show and no
 * diary to keep the next person out of the slot.
 */
export interface ServiceBooking {
  /** The button on a bookable card. "Book a time", or the tenant's own word. */
  label: string;
  note: string;
  /** The grid a day is cut into, in minutes. */
  slotMinutes: number;
  /** The least notice the company will take. */
  leadHours: number;
  /** How far ahead the diary is open. */
  horizonDays: number;
  /** Which weekdays are open, 0-6 with Sunday at 0 — matching `getDay()`. */
  days: number[];
  openTime: string;
  closeTime: string;
  /**
   * Whether somebody has to sign in before they can take a slot.
   *
   * True exactly when the tenant runs customer accounts. The API's answer, and
   * the API enforces it too — a page that merely hid the form would be a
   * suggestion.
   */
  requiresSignIn: boolean;
}

/** Where a submitted enquiry goes. The company's setting, decided by the API. */
export type EnquiryTarget = 'whatsapp' | 'admin' | 'both';

/**
 * What the enquiry button on a service card does.
 *
 * `null` on the section when it can do nothing — the company pointed it at
 * WhatsApp and published no number — and the card then renders no button at
 * all rather than a dialog that goes nowhere.
 *
 * `records` and `opensWhatsapp` are the two questions the template actually
 * asks, sent as answers rather than as a `target` it would have to interpret.
 * `target` is still here because a third state would otherwise be invisible to
 * anyone reading a payload.
 */
export interface ServiceEnquiry {
  target: EnquiryTarget;
  /** Whether a submission is recorded on the platform. */
  records: boolean;
  /** Whether the visitor is handed the message to send. */
  opensWhatsapp: boolean;
  /** The dialog's heading, and the line under it. Both the tenant's. */
  title: string;
  note: string;
  /**
   * The number to compose against, in parts. Not a finished `wa.me` link,
   * because the message cannot exist until the visitor has typed their name —
   * the one place this template builds a WhatsApp URL itself.
   */
  whatsapp: { number: string; countryCode: string } | null;
}

/**
 * The Services section, or `null` when this tenant is not showing one.
 *
 * Absent unless the plan grants `services`, the tenant switched it on, the plan
 * is still being served **and** at least one service is active — the same rule
 * Team, Gallery and the benefit cards follow. The `/services` route and the
 * menu entry are decided by exactly the same answer, so a link to that page
 * never outlives the content on it.
 *
 * There is deliberately no fallback. The platform knows a company's name, trade
 * and address; it knows nothing about what that company actually sells, and a
 * list of invented services is a business advertising work it may not do.
 */
export interface ServicesFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The button on each card, unless the card carries a label of its own. */
  ctaLabel: string;
  /**
   * What that button does, or `null` when it can do nothing. See
   * `ServiceEnquiry` — absence is the whole check, as everywhere else.
   */
  enquiry: ServiceEnquiry | null;

  /* The categories band and the filter on the services page. */
  categoriesEyebrow: string;
  categoriesTitle: string;
  categoriesLead: string;

  /* The offers band — the services a company is promoting this month. */
  offersEyebrow: string;
  offersTitle: string;
  offersLead: string;

  /** The diary, or null. See `ServiceBooking`. */
  booking: ServiceBooking | null;

  items: ServiceItem[];
  /** The taxonomy, already pruned of anything empty. */
  categories: ServiceCategoryNode[];
  /** The subset on offer, featured first. */
  offers: ServiceItem[];

  /**
   * What the home page's three bands show before their *View all* links take
   * over. Sliced by the API so every theme shows the same tenant the same
   * number of the same things.
   */
  home: {
    services: ServiceItem[];
    offers: ServiceItem[];
    categories: ServiceCategoryNode[];
  };

  /** Totals for the *View all* links, which say what they lead to. */
  counts: { services: number; categories: number; offers: number };
}

/* ---------------------------------- blog ---------------------------------- */

/**
 * One post, as a **card**: everything a listing needs and nothing more.
 *
 * No `body`, deliberately. A listing prints a title, a picture and a line or
 * two, and shipping the whole of twenty articles to render that would make the
 * archive cost more than the articles. The page for one post fetches it by slug;
 * see `getBlogPost`.
 */
export interface BlogPostCard {
  id: number;
  /** The address it lives at — `/blog/how-we-fit-a-kitchen`. */
  slug: string;
  title: string;
  /** The tenant's standfirst, or the opening of the article. Never blank. */
  excerpt: string | null;
  coverImage: string | null;
  /** A name, or null. Whether it is *printed* is `BlogFeature.showAuthor`. */
  author: string | null;
  tags: string[];
  /** ISO. Both the date printed on it and the moment it became visible. */
  publishedAt: string;
  /** Roughly how long it takes to read, estimated by the API from the body. */
  readMinutes: number;
  /** Pinned above the dates by the tenant. */
  featured: boolean;
}

/** One post **whole**, for its own page. */
export interface BlogPostFull extends BlogPostCard {
  /** Plain text, blank lines between paragraphs. Never HTML — see the API's model. */
  body: string;
}

/**
 * The blog, or `null` when this tenant is not publishing one.
 *
 * Absent unless the plan grants `blog`, the tenant switched it on, the plan is
 * still being served **and** at least one post's date has passed — the same
 * rule Services and the catalogue follow. The `/blog` route and the menu entry
 * are decided by exactly the same answer.
 *
 * **`items` is the latest few, not the archive.** This block rides in the
 * payload of every page, and a blog is the one thing here that grows without
 * limit; `total` says how much more there is, and the archive asks for the rest
 * a page at a time. See `getBlogPage`.
 */
export interface BlogFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The label under each card. */
  ctaLabel: string;
  /** Whether the site prints a byline. The company's choice, not the post's. */
  showAuthor: boolean;
  /** Everything published, not just what is in `items`. */
  total: number;
  items: BlogPostCard[];
}

/* -------------------------------- catalogue ------------------------------- */

/** Whether a product can be had today. Never a count — the API does not track one. */
export type StockStatus = 'in_stock' | 'out_of_stock' | 'made_to_order';

/**
 * One step of a product's ancestry — `Furniture › Tables › Dining tables`.
 *
 * Sent as a finished path rather than an id, so a breadcrumb costs no second
 * request and this template never learns to walk a tree.
 */
export interface CategoryRef {
  id: number;
  slug: string;
  name: string;
}

/**
 * One product in the tenant's catalogue.
 *
 * Next to a `ServiceItem` this looks like the same thing with money on it, and
 * it is not. A service is work, priced in words because a decimal would be wrong
 * for everyone who quotes per job; a product is a thing, and the number on it is
 * what lets the API say what a visitor is saving. Everything about offers
 * follows from that one difference.
 *
 * **Prices are read in one order and only one**: `priceLabel` if it is set, then
 * the `offerPrice`/`price` pair, then `price` alone. `priceOf` is that order
 * written once — nothing else should reimplement it.
 */
export interface ProductItem {
  id: number;
  slug: string;
  name: string;
  sku: string | null;
  summary: string | null;
  description: string | null;

  /** Every photograph, in the tenant's order. Always an array, never null. */
  images: string[];
  /** The first of them, or null. What every card in the catalogue shows. */
  image: string | null;

  /** What is included. Always an array — the API normalises it. */
  highlights: string[];
  /** The comparison table on the detail page. Always an array. */
  specs: { label: string; value: string }[];

  price: number | null;
  offerPrice: number | null;
  /** Set means "print this instead of the numbers". */
  priceLabel: string | null;
  /** What the visitor pays today. Null on a product priced in words. */
  effectivePrice: number | null;

  /**
   * On offer — a reduced price, or the flag a tenant pricing in words ticks by
   * hand. The API decides it; this template never re-derives it, or the badge
   * and the offers page would eventually disagree.
   */
  onOffer: boolean;
  /** The saving as a whole percentage, or null when there is no pair to compare. */
  discountPercent: number | null;
  /** The tenant's own badge wording, overriding the percentage. */
  offerLabel: string | null;

  stockStatus: StockStatus;
  inStock: boolean;

  /**
   * Whether this one may go in a basket — the tenant's own flag **and** the
   * stock, already resolved into one answer by the API. Nothing here re-derives
   * it: a template that checked the flag and forgot the stock would take money
   * for something the same page has just said is out of stock.
   *
   * Means nothing at all unless `features.orders` is present. See `orderingOf`,
   * which is the one place that reads the two together.
   */
  orderable: boolean;

  /** This product's own button label, or null to use the section's. */
  ctaLabel: string | null;
  featured: boolean;

  /** The category it is filed in, and everything above it. */
  category: CategoryRef | null;
  categoryPath: CategoryRef[];
}

/**
 * One category, with its subcategories nested inside it.
 *
 * `productCount` counts everything at or **below** the category, which is why a
 * parent whose own products all live in its children still has a number. The API
 * prunes any category that counts zero, so a heading here always leads somewhere.
 */
export interface CategoryNode {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  image: string | null;
  icon: string;
  featured: boolean;
  productCount: number;
  children: CategoryNode[];
}

/**
 * The whole catalogue for this host, or absent entirely.
 *
 * Absent unless the plan grants `products`, the tenant switched it on, the plan
 * is still being served **and** at least one product is active — the same rule
 * Services follows, and the same signal the `/products` route and its menu entry
 * are built on. `/categories` and `/offers` hang off it too, so none of the four
 * can outlive the content.
 *
 * `home` is the slice the home page's three bands render; `items`, `categories`
 * and `offers` are everything, for the pages behind the *View all* links. One
 * payload rather than four requests: a small business's range costs less to send
 * whole than four round trips cost to make.
 */
export interface CatalogueFeature {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The button on each card, unless the card carries one of its own. */
  ctaLabel: string;

  categoriesEyebrow: string;
  categoriesTitle: string;
  categoriesLead: string;

  offersEyebrow: string;
  offersTitle: string;
  offersLead: string;

  items: ProductItem[];
  categories: CategoryNode[];
  offers: ProductItem[];

  home: {
    categories: CategoryNode[];
    products: ProductItem[];
    offers: ProductItem[];
  };

  counts: { products: number; categories: number; offers: number };
}

/** Where an order goes when the visitor sends it. */
export type OrderMode = 'whatsapp' | 'payment';

/** Somewhere to pay. At least one of `upiId` and `url`, or the API sends none. */
export interface OrderPayment {
  /** `name@bank`, turned into a `upi://pay` link with the total already on it. */
  upiId: string | null;
  /** Who the payment is to, as the payer's app should show it. */
  payeeName: string | null;
  /** A hosted payment page, for a tenant taking cards rather than UPI. */
  url: string | null;
  label: string;
  note: string;
}

/**
 * The cart, or its absence.
 *
 * `null` on this block is the whole of "this site does not take orders", and it
 * covers every way of getting there — the plan does not grant it, the tenant
 * switched it off, the tenant set the mode to Off, the catalogue is empty, or
 * the route they chose has nothing behind it (WhatsApp with no published
 * number, payment with no UPI id and no link). The API decides all of them and
 * omits the block, so every Add-to-cart button, the header's basket and the
 * order panel all hang off one presence check rather than five.
 *
 * `mode` is therefore never `'none'` here: that setting produces no block at
 * all, which is why the type has two members and the constant has three.
 */
export interface OrdersFeature {
  mode: OrderMode;
  /**
   * Off means one product per order: the button says *Order now* and sends that
   * single line straight away, with no basket in between. A trade counter
   * selling one large thing at a time wants that; a shop selling six small ones
   * wants the basket.
   */
  cart: boolean;

  addToCartLabel: string;
  buyNowLabel: string;
  submitLabel: string;
  cartTitle: string;
  cartNote: string;
  /** The first line of the composed message, above the basket. */
  messageIntro: string;

  requireName: boolean;
  requirePhone: boolean;
  requireAddress: boolean;
  /** Below this the order cannot be sent. Null means no minimum. */
  minOrderAmount: number | null;

  /**
   * The number an order reaches — present in `payment` mode too wherever the
   * tenant published one, because a payment with no idea what was bought is not
   * an order. Null only when they have not.
   */
  whatsapp: WhatsappNumber | null;
  payment: OrderPayment | null;

  /** The platform's own caps, so the template enforces the same numbers. */
  quantityMax: number;
  linesMax: number;
}

/**
 * Optional functionality this tenant is entitled to **right now**.
 *
 * A key is `null` unless the plan granted it, the company switched it on, and
 * the plan is still being served — the API decides all three, so the template
 * renders on presence alone and never has to ask why something is missing.
 */
export interface SiteFeatures {
  whatsapp: WhatsappFeature | null;
  shareLink: ShareLinkFeature | null;
  /**
   * The tenant's own About copy. `null` is not "no About section" — that
   * section is part of the template — but "fall back to the company profile".
   * See `AboutSection`, which is the one place that decides.
   */
  about: AboutFeature | null;
  /** The band of figures. See `FiguresFeature` — absent is the whole check. */
  figures: FiguresFeature | null;
  team: TeamFeature | null;
  gallery: GalleryFeature | null;
  /**
   * Customer reviews. Absent unless the plan grants `testimonials`, the tenant
   * switched it on and the plan is still being served — and additionally absent
   * on a `static` wall with nothing on it yet, exactly like Team and Gallery. A
   * `dynamic` section survives being empty: the form is the point of it.
   */
  testimonials: TestimonialsFeature | null;
  /**
   * What the business offers, in the tenant's own words. Absent unless the plan
   * grants it, the tenant switched it on and wrote at least one card — so a
   * site that is not carrying the section simply has no block here.
   */
  benefits: BenefitsFeature | null;
  /**
   * What the business sells, in its own words. Absent unless the plan grants
   * it, the tenant switched it on and wrote at least one service — the same
   * signal the `/services` route and its menu entry are built on.
   */
  services: ServicesFeature | null;
  /**
   * What the business stocks. Absent unless the plan grants it, the tenant
   * switched it on and published at least one product — the same signal the
   * `/products`, `/categories` and `/offers` routes are built on.
   */
  products: CatalogueFeature | null;
  /**
   * Whether a visitor can actually buy any of it. Sold on top of `products`
   * rather than beside it, so this is absent whenever that is — and absent
   * again whenever the tenant set the mode to Off or the route they chose has
   * nothing behind it. See `OrdersFeature`.
   */
  orders: OrdersFeature | null;
  /**
   * Whether this site has a sign-in.
   *
   * A flag and nothing else, deliberately — the thinnest block in the payload.
   * The template needs to know whether to paint an Account link and whether to
   * offer a saved address at checkout; it has no business being told anything
   * about who the customers are, and a public endpoint that leaked a count would
   * be telling every visitor how many people shop here.
   */
  customers: { enabled: true } | null;
  /**
   * What the business has been doing. Absent unless the plan grants it, the
   * tenant switched it on and at least one post's date has passed — the same
   * signal the `/blog` route and its menu entry are built on.
   */
  blog: BlogFeature | null;
}

/**
 * How the Contact page reads. Never null: the page is not gated, so a tenant
 * that has never opened the screen still gets a working one from the defaults.
 */
export interface ContactPage {
  eyebrow: string;
  /** `{company}` is filled in at render time. */
  title: string;
  lead: string;
  /** The enquiry form has no server — it hands off to WhatsApp or a mail app. */
  showForm: boolean;
  formTarget: 'email' | 'whatsapp';
  formNote: string;
  showLocations: boolean;
}

/** Why a tenant's website is not being served. `null` when it is. */
export type ServiceReason = 'expired' | 'suspended' | 'no_plan';

/**
 * Whether this tenant's plan still entitles it to be served. Coarse on purpose —
 * the API withholds plan names, prices and dates from a public endpoint.
 */
export interface CompanyService {
  active: boolean;
  reason: ServiceReason | null;
}

export interface CompanyDetails {
  /** False when the domain matched no tenant — the platform defaults are returned. */
  resolved: boolean;
  /** The domain that was actually sent to the API. */
  host: string;
  code: string | null;
  name: string;
  legalName: string | null;
  description: string | null;
  logo: string | null;
  favicon: string | null;
  businessType: { id: number; name: string; slug: string | null } | null;
  theme: CompanyTheme | null;
  contact: CompanyContact;
  address: CompanyAddress;
  locale: { currency: string | null; timezone: string | null };
  /** The branch this domain is pinned to — null on a company-wide host. */
  branch: CompanyBranch | null;
  /** The head office, always present for a resolved tenant with branches. */
  headOffice: CompanyBranch | null;
  branches: CompanyBranch[];
  /** Active hero slides for this host, in the order the company arranged them. */
  sliders: CompanySlide[];
  /**
   * The menu, built by the API: one entry per page this tenant is publishing,
   * already named the way they named it. The template renders it as sent —
   * a page added to the platform later appears here and needs no change to
   * the site.
   */
  nav: NavEntry[];
  /** Optional functionality this tenant may show today. */
  features: SiteFeatures;
  /**
   * How the Contact page reads, or `null` when this tenant is not showing one:
   * the plan does not include `contact_page`, or the switch is off. The page
   * and its nav link disappear rather than rendering empty.
   */
  contactPage: ContactPage | null;
  service: CompanyService;
}

export interface NavEntry {
  /** Stable across renames — `home`, `about`, `contact`. */
  key: string;
  href: string;
  label: string;
}

const EMPTY_ADDRESS: CompanyAddress = {
  line1: null, line2: null, city: null, state: null, stateCode: null, country: null, pincode: null,
};

/** Used when the API is unreachable, so a network blip never blanks the site. */
export const FALLBACK_COMPANY: CompanyDetails = {
  resolved: false,
  host: '',
  code: null,
  name: 'Aj Smart Biz',
  legalName: null,
  description: null,
  logo: null,
  favicon: null,
  businessType: null,
  theme: null,
  contact: { email: null, phone: null, alternatePhone: null, website: null },
  address: EMPTY_ADDRESS,
  locale: { currency: null, timezone: null },
  branch: null,
  headOffice: null,
  branches: [],
  sliders: [],
  /**
   * With no answer from the API there is no tenant to name anything, so the
   * menu falls back to the template's own — see `NAV_LINKS`. Home only: the
   * other pages have nothing to show without a tenant behind them.
   */
  nav: [{ key: 'home', href: '/', label: 'Home' }],
  /**
   * No optional functionality without an answer from the API. Unlike `service`
   * below, the safe fallback here is "show nothing": a WhatsApp button with no
   * number behind it is worse than no button.
   */
  features: {
    whatsapp: null,
    shareLink: null,
    about: null,
    figures: null,
    team: null,
    gallery: null,
    testimonials: null,
    benefits: null,
    services: null,
    products: null,
    orders: null,
    customers: null,
    blog: null,
  },
  /** Same rule as `features`: with no answer from the API, show nothing. */
  contactPage: null,
  /**
   * An unreachable API must not take every tenant's site down with it. The
   * holding page is for a plan the platform has actually stopped serving, not
   * for a network blip, so the fallback stays "serve the site".
   */
  service: { active: true, reason: null },
};

/** Turns a stored path (`/uploads/company/abc.png`) into something `<img src>` can use. */
export function toFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${FILES_URL}${path}`;
}

/** `4th Floor, Trade House, Ring Road, Surat, Gujarat 395002` — blanks dropped. */
export function formatAddress(address: CompanyAddress | null | undefined): string | null {
  if (!address) return null;
  const cityLine = [address.city, address.state].filter(Boolean).join(', ');
  const parts = [
    address.line1,
    address.line2,
    [cityLine, address.pincode].filter(Boolean).join(' ') || null,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length ? parts.join(', ') : null;
}

/** `09:30:00` -> `9:30 am`; anything unexpected is passed through untouched. */
export function formatTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/** Strips a scheme so `https://acme.test` reads as `acme.test` in the page. */
export const displayUrl = (url: string | null | undefined): string | null =>
  url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;

/** `+91 98765 43210` -> `+919876543210`, for a `tel:` href. */
export const telHref = (phone: string | null | undefined): string | null =>
  phone ? phone.replace(/[^\d+]/g, '') : null;

/** Fills `{company}` in copy the tenant wrote in the admin. */
export const fillCompany = (text: string, company: CompanyDetails): string =>
  text.replace(/\{company\}/g, company.name);

/**
 * The WhatsApp number a given button should use, or `null` when the feature is
 * not live for this tenant — which is the template's only cue not to render it.
 *
 * Optional chaining throughout because an older API, or an unreachable one,
 * leaves the block off entirely rather than sending an empty one.
 */
export const whatsappFor = (
  company: CompanyDetails,
  type: WhatsappType
): WhatsappNumber | null => company.features?.whatsapp?.byType?.[type] ?? company.features?.whatsapp?.primary ?? null;

/**
 * The number the company actually set for this type — no fallback.
 *
 * `whatsappFor` is right for a button that must work: an enquiry link reaching
 * the general line is better than no enquiry link. It is wrong for a button
 * that only earns its place by being *different*, such as a separate "support"
 * link in the footer, which would otherwise render as a second copy of the
 * contact link pointing at the same number.
 */
export const whatsappSetFor = (
  company: CompanyDetails,
  type: WhatsappType
): WhatsappNumber | null =>
  company.features?.whatsapp?.numbers?.find((entry) => entry.type === type) ?? null;

/** The share configuration, or `null` when the tenant may not show one. */
export const shareLinkOf = (company: CompanyDetails): ShareLinkFeature | null =>
  company.features?.shareLink ?? null;

/**
 * Whether a conditional section is actually on the page.
 *
 * The nav has to agree with what was rendered — a "Team" link that scrolls to
 * nothing is worse than no link — and both read this, so they cannot drift.
 */
export const hasSection = (company: CompanyDetails, href: string): boolean => {
  if (href === '#team') return Boolean(company.features?.team?.members?.length);
  if (href === '#gallery') return Boolean(company.features?.gallery?.items?.length);
  /**
   * A `dynamic` section renders with no reviews at all — the form is the
   * section — so presence of the block is the test here, not a row count.
   */
  if (href === '#testimonials') return Boolean(company.features?.testimonials);
  /**
   * Pages are decided by the API now — a withheld page is simply not in `nav` —
   * so anything with a real path is answered from there rather than by a rule
   * kept in step by hand.
   */
  if (href.startsWith('/')) return navOf(company).some((entry) => entry.href === href);
  return true;
};

/**
 * The menu to render. The API's, when it answered; the template's otherwise.
 *
 * A tenant whose plan is being served always has at least Home, so an empty
 * array means the API said nothing useful and the fallback is the honest
 * answer rather than a site with no navigation at all.
 */
export const navOf = (company: CompanyDetails): NavEntry[] =>
  company.nav?.length ? company.nav : FALLBACK_COMPANY.nav;

/**
 * The company as a **client** component should receive it — everything except
 * the catalogue.
 *
 * Anything handed to a `'use client'` component is serialised into the page's
 * RSC payload, which ships inside the HTML. The company object is small until it
 * carries a catalogue: a shop with three hundred products would put a quarter of
 * a megabyte of product JSON into the markup of every page on the site,
 * including the ones with no products on them at all. The header is on all of
 * them.
 *
 * Nothing that takes this needs it. The header reads the nav and the logo, the
 * slider reads slides, the gallery reads images — the catalogue is rendered
 * entirely by server components (`ProductsSection`, `CategoriesSection`), which
 * are never serialised.
 *
 * **The cache is the point, not an optimisation.** React deduplicates by object
 * *reference* when it serialises, so two different lightened copies would be two
 * copies in the payload. Returning the same object for the same input keeps it
 * to one, and a `WeakMap` means a request's company is collected with the
 * request rather than held forever.
 */
const lightened = new WeakMap<CompanyDetails, CompanyDetails>();

export const siteCompany = (company: CompanyDetails): CompanyDetails => {
  const cached = lightened.get(company);
  if (cached) return cached;

  /* The blog goes the same way as the catalogue, and for the same reason: the
     header needs neither, and a tenant's six latest articles would otherwise be
     serialised into the markup of every page on the site. The sections that do
     render them are server components. */
  const light: CompanyDetails = company.features
    ? { ...company, features: { ...company.features, products: null, blog: null } }
    : company;

  lightened.set(company, light);
  return light;
};
