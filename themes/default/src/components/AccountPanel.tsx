'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { removeAddress, saveAddress, saveProfile, signOut } from '@/app/actions/account';
import { IDLE_ACCOUNT, type Account, type Address } from '@/lib/customer';
import styles from './Account.module.css';

/**
 * A signed-in customer's own page: their details, and the places they want
 * things delivered.
 *
 * ### The address book is the point
 *
 * The profile fields are two boxes nobody visits twice. What this page exists
 * for is the addresses — the whole value of having an account here is not typing
 * one again at checkout, and that only pays off if several can be kept and one
 * of them is the default.
 *
 * ### The phone number is not editable, and says so
 *
 * It is the identity: changing it would move the account to a different person
 * and take their order history with it. The API refuses it, the form does not
 * offer it, and the page explains rather than simply disabling a box — a greyed
 * field with no reason beside it is the one people ring up about.
 */
export default function AccountPanel({ account }: { account: Account }) {
  const [profile, profileAction] = useActionState(saveProfile, IDLE_ACCOUNT);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>Your details</h2>
            <p className={styles.lede}>Signed in as {account.customer.phone}</p>
          </div>
          {/* A real form post, so signing out clears an httpOnly cookie the
              browser cannot touch on its own. */}
          <form action={signOut}>
            <button type="submit" className={styles.quiet}>
              Sign out
            </button>
          </form>
        </header>

        <form action={profileAction} className={styles.form}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>Your name</span>
              <input className={styles.input} name="name" defaultValue={account.customer.name} required />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                Email <span className={styles.optional}>(optional)</span>
              </span>
              <input
                className={styles.input}
                name="email"
                type="email"
                defaultValue={account.customer.email ?? ''}
              />
            </label>
          </div>

          <p className={styles.note}>
            Your mobile number is how you sign in, so it cannot be changed here. If you have a new
            number, sign in with it and we will start a fresh account.
          </p>

          {profile.status !== 'idle' ? (
            <p className={profile.status === 'error' ? styles.bad : styles.good}>{profile.message}</p>
          ) : null}

          <Submit label="Save details" />
        </form>
      </section>

      <section className={styles.panel}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>Delivery addresses</h2>
            <p className={styles.lede}>
              Pick one at checkout instead of typing it again. You can keep up to{' '}
              {account.addressesMax}.
            </p>
          </div>
          {account.addresses.length < account.addressesMax ? (
            <button type="button" className={styles.quiet} onClick={() => setEditing('new')}>
              ＋ Add an address
            </button>
          ) : null}
        </header>

        {!account.addresses.length && editing !== 'new' ? (
          <p className={styles.note}>
            No addresses saved yet. Add one and it will be waiting for you at the checkout.
          </p>
        ) : null}

        <ul className={styles.addresses}>
          {account.addresses.map((address) => (
            <li key={address.id} className={styles.address}>
              <div className={styles.addressHead}>
                <span className={styles.tag}>{address.label}</span>
                {address.isDefault ? <span className={styles.tagDefault}>Default</span> : null}
              </div>

              <p className={styles.addressText}>{address.formatted}</p>

              {address.contactName || address.contactPhone ? (
                <p className={styles.addressWho}>
                  For {address.contactName || 'someone else'}
                  {address.contactPhone ? ` · ${address.contactPhone}` : ''}
                </p>
              ) : null}

              <div className={styles.addressActions}>
                <button type="button" className={styles.quiet} onClick={() => setEditing(address)}>
                  Edit
                </button>
                <RemoveAddress id={address.id} />
              </div>
            </li>
          ))}
        </ul>

        {editing ? (
          <AddressForm
            address={editing === 'new' ? null : editing}
            labels={account.addressLabels}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </section>

      <p className={styles.note}>
        <Link className={styles.link} href="/account/orders">
          See everything you have ordered →
        </Link>
        {' · '}
        {/* Absent on a tenant without Services: the route 404s, and a link into a
            404 is worse than no link. */}
        <Link className={styles.link} href="/account/services">
          Your enquiries →
        </Link>
      </p>
    </div>
  );
}

/**
 * Add or edit, one form.
 *
 * The same fields either way, because they are the same address — two forms
 * would be two places for a field to be forgotten. `id` in a hidden input is
 * what tells the action which it is.
 */
function AddressForm({
  address,
  labels,
  onDone,
}: {
  address: Address | null;
  labels: string[];
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveAddress, IDLE_ACCOUNT);

  /* A save that worked is the one moment the form should close itself. */
  if (state.status === 'success') {
    onDone();
  }

  return (
    <form action={action} className={`${styles.form} ${styles.addressForm}`}>
      <h3 className={styles.subtitle}>{address ? 'Edit address' : 'New address'}</h3>

      {address ? <input type="hidden" name="id" value={address.id} /> : null}

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>What is it</span>
          <select className={styles.input} name="label" defaultValue={address?.label ?? labels[0]}>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Pincode</span>
          <input
            className={styles.input}
            name="pincode"
            inputMode="numeric"
            defaultValue={address?.pincode ?? ''}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Address</span>
        <input
          className={styles.input}
          name="line1"
          placeholder="House or flat, street"
          defaultValue={address?.line1 ?? ''}
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          Area <span className={styles.optional}>(optional)</span>
        </span>
        <input className={styles.input} name="line2" defaultValue={address?.line2 ?? ''} />
      </label>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>
            Landmark <span className={styles.optional}>(optional)</span>
          </span>
          {/* The line that actually gets things found, which is why it is asked
              for plainly rather than buried in the street box. */}
          <input
            className={styles.input}
            name="landmark"
            placeholder="Opposite the petrol pump"
            defaultValue={address?.landmark ?? ''}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Town or city</span>
          <input className={styles.input} name="city" defaultValue={address?.city ?? ''} required />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>
            Deliver to <span className={styles.optional}>(if not you)</span>
          </span>
          <input className={styles.input} name="contactName" defaultValue={address?.contactName ?? ''} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            Their number <span className={styles.optional}>(optional)</span>
          </span>
          <input
            className={styles.input}
            name="contactPhone"
            type="tel"
            defaultValue={address?.contactPhone ?? ''}
          />
        </label>
      </div>

      {/* Never offered on the address that already *is* the default: there is no
          way to un-default the only one, so the box would do nothing. */}
      {!address?.isDefault ? (
        <label className={styles.check}>
          <input type="checkbox" name="isDefault" value="1" />
          <span>Use this one by default</span>
        </label>
      ) : null}

      {state.status === 'error' ? <p className={styles.bad}>{state.message}</p> : null}

      <div className={styles.formActions}>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancel
        </button>
        <Submit label="Save address" />
      </div>
    </form>
  );
}

function RemoveAddress({ id }: { id: number }) {
  const [, action] = useActionState(removeAddress, IDLE_ACCOUNT);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={styles.quiet}>
        Remove
      </button>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={styles.primary} disabled={pending}>
      {pending ? 'Saving…' : label}
    </button>
  );
}
