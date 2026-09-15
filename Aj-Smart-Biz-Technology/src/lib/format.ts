/**
 * The arithmetic and formatting the pricing cards would otherwise repeat.
 *
 * Kept out of the components so a price is rendered the same way wherever it
 * appears, and out of `content/plans.ts` so that file stays data with no logic
 * in it.
 */

import type { Plan } from '@/content/plans';
import { CAPABILITIES, type Capability, type CapabilityKey } from '@/content/capabilities';

/**
 * Money, in the currency the plan is priced in.
 *
 * `Intl` rather than a `₹` written into the markup: a plan priced in something
 * else then formats correctly without this file being taught about it. No
 * decimals — everything is priced in whole rupees, and `₹499.00` on a pricing
 * card reads like a spreadsheet.
 */
export function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    /* An unrecognised currency code should not take the price down with it. */
    return `${currency} ${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

const CYCLE_UNIT: Record<Plan['billingCycle'], string> = {
  monthly: 'per month',
  quarterly: 'per quarter',
  yearly: 'per year',
};

/** The line under a price. */
export const billingUnit = (plan: Plan): string => CYCLE_UNIT[plan.billingCycle];

/** What they actually pay — the discount where there is one. */
export const payablePrice = (plan: Plan): number => plan.discountPrice ?? plan.price;

/**
 * What a plan saves against its own list price, as a percentage.
 *
 * Null where there is no real discount, so a card can render the badge on
 * presence alone and a `discountPrice` equal to `price` cannot produce
 * "save 0%". Rounded **down**: claiming 25% off when it is 24.6% is the kind of
 * small lie that is entirely avoidable.
 */
export function discountPercent(plan: Plan): number | null {
  if (!plan.discountPrice || plan.discountPrice >= plan.price || plan.price <= 0) return null;
  const percent = Math.floor(((plan.price - plan.discountPrice) / plan.price) * 100);
  return percent > 0 ? percent : null;
}

/** `10240` -> `10 GB`. Storage is sold in gigabytes and stored in megabytes. */
export function formatStorage(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/** `1` -> `1 branch`, `25` -> `25 branches`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const BY_KEY = new Map<CapabilityKey, Capability>(CAPABILITIES.map((item) => [item.key, item]));

/**
 * The capabilities a plan switches on, as full entries rather than bare keys.
 *
 * A key with no entry is **dropped** rather than rendered raw, so retiring a
 * capability removes it from every pricing card at once without anybody having
 * to edit the plans as well. `CapabilityKey` being a union means a typo is a
 * build error rather than a silently missing chip, so this only ever drops
 * something genuinely retired.
 */
export const capabilitiesOf = (plan: Plan): Capability[] =>
  plan.includes.map((key) => BY_KEY.get(key)).filter((item): item is Capability => Boolean(item));
