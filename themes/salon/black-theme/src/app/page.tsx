import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import CompanyNotFound from '@/components/CompanyNotFound';
import Slider from '@/components/Slider';
import ServicesSection from '@/components/ServicesSection';
import ServiceCategoriesSection from '@/components/ServiceCategoriesSection';
import CategoriesSection from '@/components/CategoriesSection';
import ProductsSection from '@/components/ProductsSection';
import FiguresSection from '@/components/FiguresSection';
import FeaturesSection from '@/components/FeaturesSection';
import TestimonialsSection from '@/components/TestimonialsSection';
import BlogSection from '@/components/BlogSection';
import CtaBand from '@/components/CtaBand';
import { getCompanyDetails } from '@/lib/company.server';
import { siteCompany } from '@/lib/company';
import { SERVICES_HOME_LIMIT, SERVICE_HOME_LIMITS, CATALOGUE_HOME_LIMITS, BLOG_HOME_LIMIT } from '@/config/site';

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

  /**
   * The API answered, and said this host belongs to no company. Same rule as
   * the check above and the plan check below: the page has to decline to render
   * as well as the layout, or the site stays readable in the streamed RSC
   * payload with the platform's placeholder company in it.
   */
  if (!company.resolved) return <CompanyNotFound />;

  if (!company.service.active) return <PlanNotice company={company} />;

  return (
    <>
      {/* Client component — `siteCompany` keeps the catalogue out of the
          payload. The same lightened object the header gets, so there is one
          copy rather than two. */}
      <Slider company={siteCompany(company)} />

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
      {/*
        The kinds of work, before the work itself.

        The same order the catalogue uses, and for the same reason: "what sort of
        thing do you do" comes before "here are three of them". A tenant that
        never sorted its services has no categories, and the band renders
        nothing — so there is no condition here.
      */}
      <ServiceCategoriesSection company={company} limit={SERVICE_HOME_LIMITS.categories} />

      <ServicesSection company={company} limit={SERVICES_HOME_LIMIT} />

      {/*
        What is reduced this month.

        Its own band under the services one, exactly as the catalogue puts offers
        under the range: the first says *what we do* and this says *why book
        now*. It renders nothing when nothing is on offer, which is most tenants
        most of the time.
      */}
      <ServicesSection company={company} variant="offers" limit={SERVICE_HOME_LIMITS.offers} />

      {/*
        The catalogue, in three bands, in the order a shopper reads them.

        **Categories first.** "What kind of thing do you sell" comes before "show
        me one" — a reader shown eight products before they know the shop stocks
        six kinds of thing is being asked to infer the shape of the business from
        a sample of it.

        **Then the offers**, while the reader is still deciding whether to look
        further. Offers are the argument for looking *now*, and putting them
        after the full range makes them a footnote to a list somebody has already
        finished scanning.

        **Then the range**, as the invitation to see the rest.

        Each band is shortened here and complete on its own page, and each
        renders nothing when there is nothing to show — a tenant with no
        categories gets no categories band, one with nothing reduced gets no
        offers band, and a company not carrying the catalogue at all gets none of
        the three. There is no condition on this page for any of it.
      */}
      <CategoriesSection company={company} limit={CATALOGUE_HOME_LIMITS.categories} />
      <ProductsSection company={company} variant="offers" limit={CATALOGUE_HOME_LIMITS.offers} />
      <ProductsSection company={company} limit={CATALOGUE_HOME_LIMITS.products} />

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
        The blog, after the customers have spoken and before the figures.

        It is the softest evidence on the page and the most human: what the
        business has actually been doing lately, in its own words. Putting it
        above the testimonials would interrupt the case being made; putting it
        after the figures would end the page on an aside instead of on the
        reason to get in touch.

        Shortened here and complete on `/blog`. The component renders nothing
        when the tenant is not carrying a blog — the plan does not grant it, the
        switch is off, or nothing is published yet — so there is no condition
        here, and it drops the link to the archive on the same signal that
        removes it from the menu.
      */}
      <BlogSection company={company} limit={BLOG_HOME_LIMIT} />

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
