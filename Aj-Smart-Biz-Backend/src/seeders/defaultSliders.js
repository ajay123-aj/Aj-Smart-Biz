'use strict';

/**
 * The three slides every company starts with.
 *
 * They are company-wide (`branchId: null`) and carry no image, so a brand new
 * tenant's website has a working, readable hero from the first minute rather
 * than an empty carousel. `{company}` is filled in with the tenant's name when
 * the rows are created — after that they are ordinary rows the company edits,
 * renames or deletes like any other.
 */
module.exports = [
  {
    eyebrow: 'Welcome',
    title: '{company}',
    subtitle: 'Straightforward work, delivered when we said it would be.',
    ctaLabel: 'Get in touch',
    ctaUrl: '#contact',
    sequence: 1,
  },
  {
    eyebrow: 'Built on trust',
    title: 'Work that holds up',
    subtitle:
      'Every engagement starts with understanding what you actually need, and ends with something you can rely on.',
    ctaLabel: 'What we do',
    ctaUrl: '#services',
    sequence: 2,
  },
  {
    eyebrow: 'Here when you need us',
    title: 'People, not ticket numbers',
    subtitle: 'You get the same team that built it — reachable, accountable and quick to answer.',
    ctaLabel: 'Talk to us',
    ctaUrl: '#contact',
    sequence: 3,
  },
];
