import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlanNotice from '@/components/PlanNotice';
import ServiceUnavailable from '@/components/ServiceUnavailable';
import SignInPanel from '@/components/SignInPanel';
import AccountPanel from '@/components/AccountPanel';
import { getCompanyDetails } from '@/lib/company.server';
import { getAccount } from '@/lib/session.server';
import styles from '@/components/Account.module.css';

/**
 * The customer's account: signing in when they are not, their details when they
 * are.
 *
 * **One route, two states.** A separate `/sign-in` would be a page somebody
 * bookmarks and then lands on while already signed in, and a redirect between
 * the two is a round trip to say something this page can just render. The
 * signed-out state is not an error or an interruption — it is simply what this
 * page looks like to somebody who has not signed in yet.
 *
 * **The whole route is absent unless the tenant runs accounts.** Not hidden: a
 * genuine 404, the same answer `/products` gives a shop with no catalogue. A
 * sign-in page on a site with no sign-in is a promise the API would refuse.
 */

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompanyDetails();

  return {
    title: `Your account · ${company.name}`,
    /* Nobody's account page belongs in a search index, and a signed-in one would
       be indexing a person's addresses. */
    robots: { index: false, follow: false },
  };
}

export default async function AccountPage() {
  const company = await getCompanyDetails();

  if (!company.apiReachable) return <ServiceUnavailable />;
  if (!company.service.active) return <PlanNotice company={company} />;

  /* The API decides whether this tenant has accounts at all; the page renders
     that answer rather than working it out. */
  if (!company.features?.customers) notFound();

  /**
   * `null` covers both "no session" and "the session has expired", and both mean
   * the same thing here. Treating an expired token as an error would show a wall
   * of red to somebody whose only problem is that a month has passed.
   */
  const account = await getAccount();

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: '46rem' }}>
        {account ? (
          <AccountPanel account={account} />
        ) : (
          <SignInPanel companyName={company.name} />
        )}
      </div>
    </section>
  );
}
