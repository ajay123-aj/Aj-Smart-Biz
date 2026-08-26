import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import Slider from '@/components/Slider';
import ServicesSection from '@/components/ServicesSection';
import FiguresSection from '@/components/FiguresSection';
import FeaturesSection from '@/components/FeaturesSection';
import TestimonialsSection from '@/components/TestimonialsSection';
import CtaBand from '@/components/CtaBand';
import { getCompanyDetails } from '@/lib/company.server';
import { SERVICES_HOME_LIMIT } from '@/config/site';

/**
 * The home page: the tenant's hero, the case for getting in touch, and the
 * invitation to do it.
 *
 * Still short. The story, team and gallery live on `/about` and the contact
 * details on `/contact`.
 *
 * Everything on it is the tenant's own — the hero, the figures, and now the
 * Features / Benefits band, which is written card by card in the admin. A
 * company that has not switched that section on simply has no band: the
 * component renders nothing rather than falling back to words the platform
 * made up about a business it has never met.
 *
 * The company was already resolved from the domain in the layout; this call is
 * deduped against that one, so the page costs no extra request.
 */
export default async function HomePage() {
  const company = await getCompanyDetails();

  /**
   * The plan is what pays for the content, so when the platform stops serving a
   * tenant the page returns the holding notice and nothing else. Returning early
   * here — rather than only hiding it in the layout — is what keeps the site out
   * of the streamed payload as well as off the screen.
   */
  /**
   * The layout declines to frame the site when the API is unreachable; the page
   * has to decline to render it too. Skipping only the layout would still leave
   * this page in the streamed RSC payload, where its markup — placeholder
   * company and all — remains readable to anyone who looks. Same rule, and the
   * same reason, as the plan check below.
   */
  if (!company.apiReachable) return <ServiceUnavailable />;

  if (!company.service.active) return <PlanNotice company={company} />;

  return (
    <>
      <Slider company={company} />

      {/*
        Services: what the business actually sells.

        Directly under the hero, and above the benefits band, because that is
        the order the two are read in — what we do, then why us. A reader who
        does not yet know what the business offers has nothing to weigh a
        promise about turnaround against.

        Shortened here and complete on `/services`: the home band is the case
        for looking further, not the price list. The component renders nothing
        when the tenant is not carrying the section, so there is no condition
        here, and it drops the link to the page on the same signal that removes
        the page from the menu.
      */}
      <ServicesSection company={company} limit={SERVICES_HOME_LIMIT} />

      {/*
        Features / Benefits: what the business can do, and what that is worth to
        the person reading. It sits above the closing band on purpose — it is the
        case for getting in touch, so it belongs immediately before the
        invitation to do so.

        The component is shared and self-contained: it resolves its own copy and
        renders nothing when the tenant is not carrying the section — the plan
        does not grant it, the switch is off, or no card has been written. The
        home page is the only place it is used today, which is a decision made
        here and nowhere else.
      */}
      <FeaturesSection company={company} />

      {/*
        Testimonials. After the case the business makes for itself, because that
        is the order the two are worth reading in: what we say, then what our
        customers say about it.

        Renders nothing at all unless the tenant is entitled to the feature and
        has something to show — the API omits the block otherwise — so it needs
        no guard here. Whether it carries a form is the API's answer too.
      */}
      <TestimonialsSection company={company} />

      {/*
        The figures, immediately before the closing band.

        They used to sit under the hero, which put the hardest evidence on the
        page in front of a reader who had not yet been told what the business
        does. Here they land on someone who has just read the case for it and
        the customers agreeing with it — so the numbers confirm all of that
        rather than opening with it, and the last thing before "get in touch" is
        the reason to.

        The section resolves its own copy and renders nothing when the tenant is
        not carrying the band, so there is no condition here. The About page
        closes the same way; see `FiguresSection`.
      */}
      <FiguresSection company={company} />

      {/*
        The full contact section moved to `/contact`. What stays here is the
        invitation to go there — a home page that ends in a form and a table of
        addresses buries everything above it. The band itself is shared with
        every other page that ends in one.
      */}
      <CtaBand company={company} />
    </>
  );
}
