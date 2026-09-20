import Hero from '@/components/Hero';
import StepsSection from '@/components/StepsSection';
import PromisesSection from '@/components/PromisesSection';
import CapabilitiesSection from '@/components/CapabilitiesSection';
import BusinessTypesSection from '@/components/BusinessTypesSection';
import PlansSection from '@/components/PlansSection';
import FaqSection from '@/components/FaqSection';
import CtaBand from '@/components/CtaBand';
import { getSite } from '@/lib/api';

/**
 * The home page.
 *
 * The argument in order: *what this is* (hero), *how the day goes* (steps),
 * *what stops being your job* (promises), *what a site can be made of*
 * (capabilities), *who it is for* (business types), *what it costs* (plans),
 * *the awkward questions* (FAQ), *do something* (CTA).
 *
 * Each section reads its own content, so this file is the running order and
 * nothing else — which is the point. Changing what the page argues means moving
 * eight lines here, not editing eight components.
 */
export default async function HomePage() {
  const { content } = await getSite();

  return (
    <>
      <Hero />

      <StepsSection />

      <PromisesSection />

      <CapabilitiesSection
        eyebrow="What you get"
        title="A website built from parts that already work."
        lede="Switch on what your business needs and leave the rest off. Every one of these is managed for you — you ask, we do it."
        /* Six is one clean row at most widths and two at the rest. The full set
           is on /services, which is what the counter underneath points at. */
        limit={6}
      />

      <BusinessTypesSection
        eyebrow="Who it is for"
        title="Any business. We mean it."
        lede="These are the trades already running on the platform. The list grows every month, and yours not being on it has never stopped anybody."
        panel
      />

      <PlansSection
        eyebrow={content.plans_page?.eyebrow}
        title="One monthly recharge. Everything in it."
        lede="No setup fee, no contract, no notice period. Change plan any month; stop any month."
        showAllLink
      />

      <FaqSection />

      <CtaBand />
    </>
  );
}
