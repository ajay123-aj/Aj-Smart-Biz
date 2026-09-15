/* ------------------------------------------------------------------ *
 * Glyphs
 *
 * The site's icon set, drawn rather than fetched — one line weight, one
 * 24-unit box, one cap and join, and no request to make. A hosted icon font or
 * an SVG sprite would be a second network round trip for about forty shapes.
 *
 * Names come from three places and all three land in this one library, which is
 * why it is a library rather than three:
 *
 *   content/capabilities.ts   `briefcase`, `calendar`, `newspaper`…
 *   content/business-types.ts `scissors`, `utensils`, `hard-hat`…
 *   config/site.ts            `bolt`, `server`, `headset`… — the steps, the
 *                             promises and the values pick their own.
 *
 * An unknown name falls through to `spark` rather than rendering nothing: a
 * card with the wrong picture is recoverable, a card with a hole in it is not.
 * ------------------------------------------------------------------ */

const PATHS: Record<string, React.ReactNode> = {
  /* ------------------------------ general ------------------------------ */
  /** A four-point star. The fallback, and the "anything else" glyph. */
  spark: (
    <path d="M12 3.2 13.9 9a3.2 3.2 0 0 0 2.1 2.1L21.8 13l-5.8 1.9A3.2 3.2 0 0 0 13.9 17L12 22.8 10.1 17A3.2 3.2 0 0 0 8 14.9L2.2 13 8 11.1A3.2 3.2 0 0 0 10.1 9Z" />
  ),
  /** Three stars — the same idea, plural. "Why choose us". */
  sparkles: (
    <>
      <path d="M10 4.2 11.3 8a2.4 2.4 0 0 0 1.5 1.5l3.8 1.3-3.8 1.3A2.4 2.4 0 0 0 11.3 14L10 17.8 8.7 14a2.4 2.4 0 0 0-1.5-1.5L3.4 11.2 7.2 10A2.4 2.4 0 0 0 8.7 8.4Z" />
      <path d="M17.6 3.2 18.2 5a1.2 1.2 0 0 0 .8.8l1.8.6-1.8.6a1.2 1.2 0 0 0-.8.8l-.6 1.8-.6-1.8a1.2 1.2 0 0 0-.8-.8L14.4 6.4l1.8-.6a1.2 1.2 0 0 0 .8-.8Z" />
      <path d="M17.6 15.2 18.1 17a1.2 1.2 0 0 0 .8.8l1.7.6-1.7.6a1.2 1.2 0 0 0-.8.8l-.5 1.8-.5-1.8a1.2 1.2 0 0 0-.8-.8l-1.7-.6 1.7-.6a1.2 1.2 0 0 0 .8-.8Z" />
    </>
  ),
  /** A tick in a ring — done, and done properly. */
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  /** A bare tick, for a dense list where forty rings would be forty holes. */
  tick: <path d="m5 12.6 4.4 4.4L19 7.2" />,
  /** A lightning bolt — speed. The one-day promise, everywhere it appears. */
  bolt: <path d="M13.4 2.5 4.8 13.4h5.6l-.8 8.1 8.6-10.9h-5.6Z" />,
  /** An arrow — onward, into a link. */
  'arrow-right': (
    <>
      <path d="M4 12h15.2" />
      <path d="m13.6 6.2 5.8 5.8-5.8 5.8" />
    </>
  ),
  /** A clock — time, and how little of it this takes. */
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </>
  ),
  /** Two arrows in a circle — renewal, backups, the recharge itself. */
  refresh: (
    <>
      <path d="M20.3 12a8.3 8.3 0 0 1-14.4 5.7L3.7 15.5" />
      <path d="M3.7 12a8.3 8.3 0 0 1 14.4-5.7l2.2 2.2" />
      <path d="M20.3 3.7v4.8h-4.8M3.7 20.3v-4.8h4.8" />
    </>
  ),
  /** A pencil on a sheet — the edits that are included. */
  edit: (
    <>
      <path d="M12.6 4.6H5.8A1.8 1.8 0 0 0 4 6.4v11.8A1.8 1.8 0 0 0 5.8 20h11.8a1.8 1.8 0 0 0 1.8-1.8v-6.8" />
      <path d="m17.4 3.6 3 3-7.6 7.6-3.6.6.6-3.6Z" />
    </>
  ),

  /* -------------------------- trust and running -------------------------- */
  /** A shield with a tick — the promise kept. */
  shield: (
    <>
      <path d="M12 2.8 20 6v6c0 4.6-3.2 7.9-8 9.2-4.8-1.3-8-4.6-8-9.2V6Z" />
      <path d="m8.8 12 2.3 2.4 4.1-4.6" />
    </>
  ),
  /** A padlock — SSL, and what you hand over staying yours. */
  lock: (
    <>
      <path d="M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </>
  ),
  /** Stacked racks — hosting, which is the thing you no longer rent. */
  server: (
    <>
      <rect x="3.4" y="4.4" width="17.2" height="6" rx="1.6" />
      <rect x="3.4" y="13.6" width="17.2" height="6" rx="1.6" />
      <path d="M7 7.4h.01M7 16.6h.01" />
    </>
  ),
  /** A globe — the domain, and being findable at all. */
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" />
    </>
  ),
  /** A headset — a person who answers, not a ticket queue. */
  headset: (
    <>
      <path d="M4.4 14v-2a7.6 7.6 0 0 1 15.2 0v2" />
      <path d="M4.4 13.4h1.8a1.4 1.4 0 0 1 1.4 1.4v2.6a1.4 1.4 0 0 1-1.4 1.4H5.8a1.4 1.4 0 0 1-1.4-1.4Z" />
      <path d="M19.6 13.4h-1.8a1.4 1.4 0 0 0-1.4 1.4v2.6a1.4 1.4 0 0 0 1.4 1.4h.4a1.4 1.4 0 0 0 1.4-1.4Z" />
      <path d="M19.2 18.8a3.4 3.4 0 0 1-3.4 2.6h-2" />
    </>
  ),
  /** A wallet — the money, and there being only one number in it. */
  wallet: (
    <>
      <rect x="3.6" y="6.2" width="16.8" height="13.6" rx="2.2" />
      <path d="M3.6 8.2a2 2 0 0 1 2-2h11.2a1.8 1.8 0 0 1 1.8 1.8v.2" />
      <path d="M20.4 11.4h-3.6a2.2 2.2 0 0 0 0 4.4h3.6" />
    </>
  ),

  /* ---------------------------- capabilities ---------------------------- */
  /** A chat bubble — WhatsApp. */
  'message-circle': (
    <path d="M20.6 11.6a8.1 8.1 0 0 1-11.9 7.2l-5 1.4 1.4-4.9A8.1 8.1 0 1 1 20.6 11.6Z" />
  ),
  /** Three nodes on two lines — the share link. */
  'share-2': (
    <>
      <circle cx="18" cy="5.6" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="18.4" r="2.6" />
      <path d="m8.3 10.8 7.4-3.9M8.3 13.2l7.4 3.9" />
    </>
  ),
  /** A case of work — services, and the "professional services" trade. */
  briefcase: (
    <>
      <rect x="3.2" y="7.4" width="17.6" height="12.4" rx="2" />
      <path d="M8.8 7.4V5.8a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.8 1.8v1.6" />
      <path d="M3.2 12.6h17.6" />
    </>
  ),
  /** A written sheet — About us. */
  'file-text': (
    <>
      <path d="M13.4 3.2H7a1.8 1.8 0 0 0-1.8 1.8v14a1.8 1.8 0 0 0 1.8 1.8h10a1.8 1.8 0 0 0 1.8-1.8V8.6Z" />
      <path d="M13.4 3.2v5.4h5.4" />
      <path d="M8.6 13h6.8M8.6 16.6h4.8" />
    </>
  ),
  /** A bar chart — your numbers. */
  'bar-chart-3': (
    <>
      <path d="M3.6 20.4h16.8" />
      <path d="M7 20.4v-5.2M12 20.4V9.6M17 20.4V5.2" />
    </>
  ),
  /** The same drawing under the name the site copy asks for. */
  chart: (
    <>
      <path d="M3.6 20.4h16.8" />
      <path d="M7 20.4v-5.2M12 20.4V9.6M17 20.4V5.2" />
    </>
  ),
  /** Two people — the team. */
  users: (
    <>
      <circle cx="9.4" cy="8.4" r="3.4" />
      <path d="M3.4 19.6a6 6 0 0 1 12 0" />
      <path d="M16.2 5.4a3.4 3.4 0 0 1 0 6.6" />
      <path d="M17.4 14.4a6 6 0 0 1 3.2 5.2" />
    </>
  ),
  /** One person — a customer account. */
  'user-round': (
    <>
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5.4 20a6.8 6.8 0 0 1 13.2 0" />
    </>
  ),
  /** A framed picture — the gallery. */
  image: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.2" />
      <circle cx="8.8" cy="9.6" r="1.6" />
      <path d="m4.4 17.4 4.8-4.6 3.4 3.2 3-2.6 4 3.8" />
    </>
  ),
  /** An envelope — the contact page. */
  mail: (
    <>
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.2" />
      <path d="m3.8 7.4 8.2 5.6 8.2-5.6" />
    </>
  ),
  /** Quotation marks — reviews. */
  quote: (
    <>
      <path d="M9.4 6.6c-3 1-4.6 3.4-4.6 6.6v4.2h5.6v-5.4H7.8c0-1.9.8-3.2 2.4-3.9Z" />
      <path d="M19 6.6c-3 1-4.6 3.4-4.6 6.6v4.2H20v-5.4h-2.6c0-1.9.8-3.2 2.4-3.9Z" />
    </>
  ),
  /** A box — products. */
  package: (
    <>
      <path d="m12 3.2 8.2 4.4v8.8L12 20.8 3.8 16.4V7.6Z" />
      <path d="m3.8 7.6 8.2 4.4 8.2-4.4M12 12v8.8" />
    </>
  ),
  /** A trolley — cart and orders. */
  'shopping-cart': (
    <>
      <circle cx="9.6" cy="19.4" r="1.5" />
      <circle cx="17.4" cy="19.4" r="1.5" />
      <path d="M3 4h2.4l2.2 11.2h11l1.8-7.8H6.4" />
    </>
  ),
  /** A shed with a door — warehouse and stock. */
  warehouse: (
    <>
      <path d="M3.4 20.4V8.6L12 4.4l8.6 4.2v11.8" />
      <path d="M8.4 20.4v-6.2h7.2v6.2" />
      <path d="M8.4 17.2h7.2" />
    </>
  ),
  /** A folded paper — the blog. */
  newspaper: (
    <>
      <path d="M4 6a1.8 1.8 0 0 1 1.8-1.8h10.4A1.8 1.8 0 0 1 18 6v13.2H5.8A1.8 1.8 0 0 1 4 17.4Z" />
      <path d="M18 8.4h1.2A1.8 1.8 0 0 1 21 10.2v7.2a1.8 1.8 0 0 1-1.8 1.8H18" />
      <path d="M7.4 8.4h7.2M7.4 11.8h7.2M7.4 15.2h4.4" />
    </>
  ),
  /** A tray things land in — enquiries. */
  inbox: (
    <>
      <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.2" />
      <path d="M3.4 13.6h4.2l1.4 2.4h6l1.4-2.4h4.2" />
    </>
  ),
  /** A diary page — appointments. */
  calendar: (
    <>
      <rect x="3.6" y="5.4" width="16.8" height="14.6" rx="2.2" />
      <path d="M3.6 10h16.8M8.4 3.4v3.6M15.6 3.4v3.6" />
    </>
  ),

  /* ---------------------------- business types ---------------------------- */
  scissors: (
    <>
      <circle cx="6.4" cy="6.4" r="2.6" />
      <circle cx="6.4" cy="17.6" r="2.6" />
      <path d="M8.6 7.9 20 18.4M8.6 16.1 20 5.6" />
    </>
  ),
  /** Stacked plates — decor and framing. */
  layers: (
    <>
      <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6Z" />
      <path d="m3.5 12 8.5 4.6 8.5-4.6" />
      <path d="m3.5 16.4 8.5 4.6 8.5-4.6" />
    </>
  ),
  'shopping-bag': (
    <>
      <path d="M5.4 7.4h13.2l1 12.2a1.4 1.4 0 0 1-1.4 1.6H5.8a1.4 1.4 0 0 1-1.4-1.6Z" />
      <path d="M8.8 10V6.6a3.2 3.2 0 0 1 6.4 0V10" />
    </>
  ),
  utensils: (
    <>
      <path d="M6.4 3.2v6.2a2.4 2.4 0 0 0 4.8 0V3.2" />
      <path d="M8.8 3.2v17.6" />
      <path d="M17.2 3.2c-1.6 1.2-2.4 3-2.4 5.2 0 1.7.8 2.8 2.4 3.2v9.2" />
    </>
  ),
  'heart-pulse': (
    <>
      <path d="M20.2 8.6a4.6 4.6 0 0 0-8.2-2.8 4.6 4.6 0 0 0-8.2 2.8c0 4.6 5.4 7.8 8.2 10.2 2.8-2.4 8.2-5.6 8.2-10.2Z" />
      <path d="M4.4 12.4h3.4l1.6-2.8 2.2 5.2 1.6-2.4h3.4" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M3.4 9.4v5.2M6.4 7.6v8.8M17.6 7.6v8.8M20.6 9.4v5.2" />
      <path d="M6.4 12h11.2" />
    </>
  ),
  'graduation-cap': (
    <>
      <path d="m12 4 9.2 4.4L12 12.8 2.8 8.4Z" />
      <path d="M6.6 10.6v5.2c0 1.6 2.4 3 5.4 3s5.4-1.4 5.4-3v-5.2" />
      <path d="M21.2 8.4v5.4" />
    </>
  ),
  'building-2': (
    <>
      <path d="M4.4 20.4V5.6a1.6 1.6 0 0 1 1.6-1.6h5.2a1.6 1.6 0 0 1 1.6 1.6v14.8" />
      <path d="M12.8 20.4V10h5.2a1.6 1.6 0 0 1 1.6 1.6v8.8" />
      <path d="M7.4 8h2.4M7.4 12h2.4M7.4 16h2.4M16 13.6h.01M16 17h.01" />
      <path d="M2.8 20.4h18.4" />
    </>
  ),
  'hard-hat': (
    <>
      <path d="M3.6 16.4v-1.6a8.4 8.4 0 0 1 16.8 0v1.6" />
      <path d="M9.4 7.6V5.4a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v2.2" />
      <rect x="2.6" y="16.4" width="18.8" height="3.6" rx="1.6" />
    </>
  ),
  car: (
    <>
      <path d="M4.4 15.6 6 9.8a2 2 0 0 1 1.9-1.4h8.2a2 2 0 0 1 1.9 1.4l1.6 5.8" />
      <rect x="3" y="15.2" width="18" height="4.4" rx="1.6" />
      <path d="M6.8 19.6v1.2M17.2 19.6v1.2M6.6 17.4h.01M17.4 17.4h.01" />
    </>
  ),
  plane: (
    <path d="M10.4 20.6 12 15.4l7.4 2.2a1.4 1.4 0 0 0 1.7-1.8L18.6 7 21 4.6a1.6 1.6 0 0 0-2.3-2.2L16.4 4.8 7.4 2.2A1.4 1.4 0 0 0 5.6 4l2.2 7.4-5.2 1.6a1 1 0 0 0-.3 1.7l3.4 2.8 2.8 3.4a1 1 0 0 0 1.7-.3Z" />
  ),
  camera: (
    <>
      <path d="M4.4 7.6h2.8l1.4-2.2h6.8l1.4 2.2h2.8a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8V9.4a1.8 1.8 0 0 1 1.8-1.8Z" />
      <circle cx="12" cy="13.4" r="3.6" />
    </>
  ),
  factory: (
    <>
      <path d="M3.4 20.4V11l5.4 3.2V11l5.4 3.2V6.6h1.8l1.4 13.8" />
      <path d="M2.6 20.4h18.8" />
      <path d="M7 17.4h.01M12.4 17.4h.01" />
    </>
  ),

  /* --------------------------------- misc --------------------------------- */
  /** A handset — the number that is a phone rather than a queue. */
  phone: (
    <path d="M8.2 3.6 10 7.4l-2 1.6a12.6 12.6 0 0 0 5.4 5.4l1.6-2 3.8 1.8v3.2a1.8 1.8 0 0 1-2 1.8A16.6 16.6 0 0 1 3.4 5.6a1.8 1.8 0 0 1 1.8-2h3Z" />
  ),
  /** A pin — the opposite claim, and just as good a one: we are local. */
  'map-pin': (
    <>
      <path d="M19 10.2c0 5.4-7 11-7 11s-7-5.6-7-11a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
};

export default function Glyph({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
      className={className}
    >
      {PATHS[String(name ?? '')] ?? PATHS.spark}
    </svg>
  );
}
