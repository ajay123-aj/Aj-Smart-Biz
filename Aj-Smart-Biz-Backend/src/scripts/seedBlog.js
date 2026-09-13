'use strict';

/**
 * Demo blog for one tenant — the same electrical goods retailer the catalogue
 * seeder fills in.
 *
 *     npm run db:seed:blog                 # company 1
 *     npm run db:seed:blog -- 3            # company 3
 *
 * **Deliberately not part of `runBootstrap`, for the reason the catalogue is
 * not.** `BLOG_DEFAULTS` carries the band's wording and nothing else on purpose:
 * the platform knows nothing a business has actually been doing, and an invented
 * article is not a weak section but a company publishing something it never
 * wrote. So this is a script somebody runs on purpose, at a company they name,
 * to see the archive, the tag filter, the read-time line and the three post
 * states working against real prose.
 *
 * The articles are written around the products `seedCatalogue` puts in — LED
 * bulbs, BLDC fans, MCBs, house wire — so a tenant seeded with both has a blog
 * that talks about stock it actually carries. Running this without the catalogue
 * is fine; the posts simply reference items that are not listed.
 *
 * Idempotent by slug: re-running adds whatever is missing and leaves the rest
 * alone, so it is safe against a database somebody has already edited by hand.
 * Editing the body of a post here and re-running does **not** overwrite the row —
 * a tenant's own edits outrank the script's copy of them.
 *
 * Three states are seeded on purpose, because they are what the feature is:
 *
 *  - eight **live** posts, dated backwards from today;
 *  - one **scheduled** — dated forward, saved, complete and invisible until then;
 *  - one **draft** — `publishedAt` null, shown to nobody.
 *
 * The cover images are **generated placeholders**, written to `uploads/blog` as
 * `seed-*.svg` and labelled as samples in the corner. Delete the `seed-` prefixed
 * files in that folder and they are gone.
 */

const { sequelize, ensureDatabaseExists } = require('../config/database');
const db = require('../models');
const { uniqueSlug, slugify } = require('../utils/slug');
const { writePlaceholder } = require('../utils/placeholderImage');
const logger = require('../utils/logger');
const { STATUS, FUNCTIONALITY } = require('../constants');

/* ------------------------------------------------------------------ *
 * The articles
 * ------------------------------------------------------------------ */

/**
 * `daysAgo` rather than a fixed date on every row.
 *
 * A seeder with hard dates in it looks abandoned the moment the calendar moves
 * past them — every post "from 2024" on a site somebody is demonstrating in
 * 2027. Relative dates mean the archive always reads as a shop that has been
 * writing recently, whenever the script is run.
 *
 * A negative value is the future, which is how the scheduled post is written.
 * `null` is a draft.
 */
const POSTS = [
  {
    title: 'Watts, Lumens and Which Number Actually Matters',
    daysAgo: 4,
    featured: true,
    author: 'Ramesh Patel',
    tags: ['LED', 'Lighting', 'Buying Guide'],
    excerpt:
      'Everyone still shops for bulbs in watts. Watts tell you what a bulb costs to run — lumens tell you how much light you get. Here is how to read the box.',
    body: `A customer came in last week asking for a 100 watt bulb. What they wanted was the amount of light a 100 watt bulb used to give. Those are two different things now, and the gap between them is the whole reason to change over.

Watts measure what a bulb draws. Lumens measure what it gives out. With incandescent bulbs the two moved together, so everybody learned to shop in watts and it worked for fifty years. LED broke that relationship: our 9W LED bulb puts out around 900 lumens, which is what an old 60W bulb gave. The 12W gives about 1200, which is near enough the old 100W.

So the rough conversion, if you are replacing what is already in the holder:

40W old becomes 5W LED, around 450 lumens.
60W old becomes 9W LED, around 900 lumens.
100W old becomes 12W to 14W LED, around 1200 lumens.

If you are starting from an empty room instead, work from the room. A bedroom wants somewhere near 100 to 150 lumens per square metre, a kitchen or a study nearer 300, because you are cutting vegetables or reading in one and not the other. A 10 by 12 foot bedroom is about 11 square metres, so one 9W bulb in the centre plus a lamp beside the bed is comfortable. The same room as a study wants two 12W panels instead.

The other number on the box is the colour temperature, in kelvin, and that is not a quality rating — it is a choice. We have written about that separately.

One last thing worth saying, because it is where people lose money: a cheap LED bulb and a good one often draw the same watts and claim the same lumens. The difference is the driver inside, and it shows up in year three when one of them is still the same brightness and the other has gone dim and slightly green. Every bulb we stock carries at least a two year replacement warranty, and we handle the replacement here rather than sending you to a service centre.`,
  },
  {
    title: 'BLDC or Induction: What a Ceiling Fan Costs to Run',
    daysAgo: 11,
    featured: true,
    author: 'Ramesh Patel',
    tags: ['Fans', 'BLDC', 'Running Costs'],
    excerpt:
      'A BLDC fan costs about twice what an ordinary one does. Whether that is worth paying depends almost entirely on how many hours a day it is switched on.',
    body: `The honest answer is that it depends on your hours, and any shop that tells you a BLDC fan is always worth it is not doing the arithmetic in front of you.

Here is the arithmetic. An ordinary induction ceiling fan draws about 75 watts on full speed. A BLDC fan of the same 1200mm sweep draws about 28. That is 47 watts saved per hour of running — call it 0.047 units.

In Gujarat, domestic power runs around eight rupees a unit once you are past the first slab. So one fan, running eight hours a day:

0.047 units x 8 hours x 30 days = 11.3 units a month, or about 90 rupees.

The BLDC costs roughly 1,800 rupees more than the economy fan. At 90 rupees a month it has paid that back in twenty months, and after that it is saving you the 90. If the fan runs in a bedroom for eight months of the year, that is closer to thirty months. Still worth it over a fan's fifteen year life, comfortably.

Where it stops being worth it is a fan that runs two hours a day in a guest room. Four hundred rupees a year of saving against an eighteen hundred rupee premium takes four and a half years, and you would rather have spent the difference on a better fan in the room you actually sit in.

So the sensible way to buy, if you are fitting out a whole house, is not all-BLDC or all-economy. Put BLDC in the bedrooms and the living room, where the hours are. Put the economy fan in the spare room and the store. That is what we fit in our own homes.

Two other things about BLDC that nobody mentions in the advertisement. The first is that they all come with a remote, and the remote is the failure point — keep the box, because a replacement remote is a fifteen minute job and a replacement fan is not. The second is that they run on low speed far better than an induction fan does: an induction fan on speed one hums and moves very little air, where a BLDC on speed one is genuinely usable on a cool night. For a lot of people that, rather than the electricity, turns out to be the reason they are glad they paid.`,
  },
  {
    title: 'MCB, RCCB, and What Each One Is Actually Protecting',
    daysAgo: 19,
    featured: true,
    author: 'Ramesh Patel',
    tags: ['Safety', 'Circuit Protection', 'Wiring'],
    excerpt:
      'One protects your wiring from catching fire. The other protects you from being killed. They are not alternatives and a board needs both.',
    body: `This is the single most common misunderstanding we hear across the counter, and it is worth being blunt about: an MCB will not save your life, and an RCCB will not stop your wiring overheating. They are two different devices solving two different problems, and a distribution board wants both.

An MCB — miniature circuit breaker — watches how much current is flowing through the circuit. If a 16A circuit starts carrying 25A because too much is plugged into it, or because a live wire has touched a neutral somewhere, the MCB trips. What it is protecting is the cable in your wall. A 2.5 sq mm wire carrying 25A for an hour gets hot enough to damage its insulation, and that is how wiring fires start. The MCB is there so the cable never gets the chance.

An RCCB — residual current circuit breaker — does something completely different. It compares the current going out on the live with the current coming back on the neutral. In a healthy circuit those are identical. If 30 milliamps goes missing, that current has found another path to earth, and very often the other path is a person holding a faulty appliance. The RCCB trips in under 30 milliseconds, which is fast enough to matter.

30mA is the number for a house. It is chosen because it is below the threshold at which current across the chest stops the heart. Industrial boards sometimes use 100mA or 300mA, which protect equipment and property but are not enough to protect a person — do not let anybody fit one of those in a home because it "nuisance trips less".

So a sensible domestic board looks like this: one incomer, one 40A 30mA RCCB covering the circuits that matter, and then individual MCBs downstream — 6A for the lighting, 16A for the sockets, 32A double pole for the geyser and the air conditioner. Our 8-way and 16-way boards are laid out for exactly that arrangement.

Two practical notes. Keep the lighting circuit outside the RCCB, or on its own — an RCCB trip that kills every light in the house at ten at night, while you are trying to find the board, is a hazard of its own. And press the test button on the RCCB every few months. It is the one safety device in your house with a self-test on the front, and in fifteen years of doing this we have found genuinely seized ones. Five seconds, twice a year.`,
  },
  {
    title: 'Picking House Wire: 1.5, 2.5 or 4 sq mm',
    daysAgo: 27,
    author: 'Ramesh Patel',
    tags: ['Wiring', 'Cables', 'Safety'],
    excerpt:
      'Three sizes cover almost every circuit in an ordinary house. Getting one wrong is the kind of mistake that stays buried in a wall for thirty years.',
    body: `Wire is sold by cross-sectional area in square millimetres, and the number is about how much current the copper can carry before it gets hot. Undersize it and the cable warms up inside a wall where nobody can see it. Oversize it and you have spent more money than you needed to, which is a much better mistake to make.

For ordinary domestic work, three sizes do nearly everything.

1.5 sq mm is for lighting. A lighting circuit runs bulbs and fans, and even a generous one totals a few hundred watts, so a 1.5 carries it comfortably on a 6A MCB. Do not use it for socket outlets, ever, whatever the run is doing at the moment — somebody will plug an iron into that socket in ten years.

2.5 sq mm is for general socket circuits, on a 16A MCB. This is most of the wire in a house. It handles the mixer, the television, the iron, the laptop chargers, all of it.

4 sq mm is for the things that draw real current on their own: the geyser, the air conditioner, an oven. These get their own circuit and their own MCB, usually a 32A double pole, because the load is continuous and heavy and you want to be able to isolate it.

Then there is FR versus FRLS, and the difference is not marketing. FR — flame retardant — insulation resists catching light. FRLS adds low smoke: in a fire it puts out far less of the dense black smoke that actually kills people in buildings, because they cannot find the door. We keep FR in 1.5 and 2.5 for general runs, and FRLS in 4 sq mm because that is the one going to the geyser in a bathroom with one way out.

Two things people get wrong on the job. Length matters: on a run over about twenty metres, voltage drop starts to bite and it is worth going up a size even though the current says you do not need to. And bunching matters — six cables in one conduit cannot shed heat the way one cable can, so a conduit stuffed full needs derating. If you are wiring a whole floor and the runs are long, come in with the layout and we will work through it with you rather than guess across the counter.

Our coils are 90 metres and marked with the ISI licence number on the sheath. Check that number is there on any wire you buy anywhere, from anybody. It is the cheapest possible thing to counterfeit and the most expensive thing to discover you have.`,
  },
  {
    title: 'Cool White or Warm White, Room by Room',
    daysAgo: 35,
    tags: ['Lighting', 'LED', 'Buying Guide'],
    excerpt:
      'The kelvin number on a bulb box is not a quality rating. It is a choice, and the right answer is different in a kitchen and a bedroom.',
    body: `Every LED bulb box carries a number ending in K — 2700K, 4000K, 6500K. That is colour temperature, and a higher number is not a better bulb. It is a bluer one.

2700K to 3000K is warm white. It is close to the colour of the old incandescent bulbs, slightly yellow, and it is what makes a room feel like somewhere you relax rather than somewhere you queue.

4000K is neutral. White, without much colour cast either way.

6500K is cool white, or daylight. Slightly blue, noticeably brighter to the eye at the same lumens, and unforgiving of everything in the room.

Where they go, in an ordinary home:

Bedrooms want warm white. This is the one people get wrong most often, usually because the cool white bulb looked brighter in the shop. Blue-weighted light late in the evening genuinely does suppress melatonin, and a 6500K bulb over a bed is working against you every night.

Kitchens want cool white or neutral. You are judging whether the vegetables are cooked and whether the counter is clean, and warm light hides both.

Living rooms want warm white, mostly. If it doubles as a place where homework gets done, put warm white in the ceiling and a neutral lamp on the table — one room does not have to have one answer.

Bathrooms want neutral, around 4000K. People shave and put on makeup there and warm light makes that harder, but 6500K in a small tiled room at six in the morning is genuinely unpleasant.

Study and work areas want neutral to cool. This is the one place the daylight bulb earns its place.

Outdoors, cool white. Security lighting and floodlights want to show you what is there, not create an atmosphere.

One rule that matters more than any of the above: pick one temperature per room and stay with it. Two bulbs of different colours in the same ceiling look broken in a way that is immediately obvious and surprisingly hard to diagnose if you did not do it yourself. When you replace one bulb in a room of four, check the box of what is already up there. We keep both 9W cool white and 12W warm white in stock for exactly this reason — come in with the old bulb if you are not sure.`,
  },
  {
    title: 'Instant or Storage: Sizing a Water Heater',
    daysAgo: 46,
    author: 'Ramesh Patel',
    tags: ['Water Heaters', 'Appliances', 'Buying Guide'],
    excerpt:
      'A 3 litre instant heater and a 15 litre storage geyser are not the same product at different sizes. They are for different jobs.',
    body: `People ask which is better. Neither is — they solve different problems, and a house often wants both, in different rooms.

An instant heater holds about three litres and heats it as it passes through, at around 3000 watts. It gives you hot water in under a minute, indefinitely, but only at a trickle — enough for a kitchen sink, washing hands, shaving. It cannot fill a bucket at a useful rate and it cannot run a shower properly.

A storage geyser holds 15 or 25 litres and heats the tankful slowly, at around 2000 watts, then keeps it hot. It takes fifteen to twenty minutes from cold, but then it delivers at full pressure until the tank runs down.

Sizing a storage geyser is mostly about how you bathe. A bucket bath uses roughly 15 to 20 litres of hot water, mixed. A shower uses 6 to 8 litres a minute, so a ten minute shower is 60 to 80 litres total, of which maybe half is hot. So:

One or two people, bucket baths: 10 to 15 litres is plenty.
A family of four, bucket baths, one after another: 25 litres.
Showers: 25 litres, and expect the second person to wait.

Two things worth paying for. The first is the tank warranty — five years on the tank is the figure to look for, not the two years on the element, because the element is a cheap part anyone can change and the tank is the whole appliance. The second is a magnesium anode, which matters enormously if your water is hard, and most of the borewell water around here is. The anode corrodes so the tank does not. It is a consumable: get it looked at every three or four years, and a 300 rupee anode will add five years to a 9,000 rupee geyser.

On the electrical side, a geyser wants its own 4 sq mm circuit and its own 32A double pole MCB, not a socket shared with anything else. Double pole matters in a bathroom — it isolates the neutral as well as the live, so the appliance is genuinely dead when it is switched off. And check that the earth is actually connected, not just present. A geyser is a metal tank full of water with a heating element in it, in the wettest room in the house.

Our 15L storage unit carries a five year tank warranty and we do the fitting, which for this particular appliance is worth having done properly.`,
  },
  {
    title: 'Does Your Air Conditioner Actually Need a Stabilizer?',
    daysAgo: 58,
    tags: ['Stabilizers', 'Appliances', 'Safety'],
    excerpt:
      'Most new air conditioners say they have built-in stabilization. Whether you can believe that depends on what your voltage actually does, not on what the brochure says.',
    body: `Nearly every inverter air conditioner sold now claims stabilizer-free operation, usually with a voltage range printed on the box like 145V to 290V. Sometimes that claim is fine. Often it is not, and the difference is not the air conditioner — it is your supply.

What the claim means is that the unit's own electronics will keep working across that range. What it does not mean is that the unit is protected from what happens at the edges of it, or beyond them. If your supply drops to 150V for an hour every evening in May, the compressor is running hot and drawing more current to do the same work, and it is wearing out faster than it should whether or not it keeps running.

So the question is not what the brochure says. It is what your voltage actually does. If you do not know, find out before spending anything — the simplest way is to put a multimeter on a socket at the times the supply is worst, which around here is evening in summer, and see what it reads. If it sits between 200V and 240V, your new inverter AC is genuinely fine without a stabilizer. If you are seeing 160V or 170V in the evenings, or if the lights visibly dim when the motor starts, fit one.

Sizing is straightforward. A 1.5 ton air conditioner wants a 4kVA stabilizer. A 1 ton wants 3kVA. A 2 ton wants 5kVA. Do not undersize it to save a few hundred rupees — an overloaded stabilizer is worse than none, because it adds its own heat and its own failure point to a circuit that was already struggling.

Two features that are worth insisting on. Time delay on restart, which holds the compressor off for two or three minutes after power returns: starting a compressor against a head of pressure is how compressors die, and this single feature probably saves more air conditioners than the voltage regulation does. And a working range that goes low enough — ours works from 130V, which covers the genuinely bad evenings rather than just the ordinary ones.

Where a stabilizer is almost always still worth it regardless of the brochure: the refrigerator. It runs twenty four hours a day, its compressor is small and unprotected, nobody is watching it, and replacing one is a much bigger afternoon than replacing a stabilizer.`,
  },
  {
    title: 'Why We Now Fit USB Sockets in Every Bedroom Rewire',
    daysAgo: 72,
    tags: ['Switches & Sockets', 'Rewiring'],
    excerpt:
      'It started as something customers asked for occasionally. It is now the first thing we suggest, and the reason is the pile of chargers on the bedside table.',
    body: `Count the chargers in your bedroom. For most households it is three or four — two phones, a smartwatch, a pair of earbuds — and every one of them is an adapter occupying a 6A socket, plus a cable, plus the extension board that appeared because there were only two sockets and now there are six things.

A twin-port USB socket replaces that. It goes in the same modular plate as an ordinary socket, wires to the same 2.5 sq mm circuit, and gives you two USB outlets plus the socket. The adapters go in a drawer and the extension board goes away, which is the part people actually notice.

There is a safety argument too, and it is not a small one. The multi-socket extension board sitting behind a bed, under a mattress or behind a curtain, loaded with four adapters, is one of the genuinely common causes of domestic electrical fires. Not because extension boards are bad, but because that one is covered, unventilated, permanently loaded and out of sight. Removing the reason it is there is more effective than any amount of telling people not to do it.

What to look for when you buy one. Total output current matters — 3.1A across two ports charges two phones at a sensible rate, where a 1A socket will charge one slowly and annoy you daily. Check it supports the fast charging your phone actually uses, because a basic USB socket will charge a modern phone at 5W while the adapter in the box does 25W, and a socket that takes four hours to do what the adapter does in one is a socket you stop using. And put it where you will use it: beside the bed, beside the sofa, and on the kitchen counter where the recipe is being read off a propped-up phone.

Fitting one into an existing plate is a twenty minute job and needs no new cable — it is the same back box and the same circuit. It is far and away the cheapest change we make to a room, and the one customers mention when we come back for something else a year later.`,
  },
  {
    /* Dated forward: written, saved, complete, and invisible until the date
       passes. The point of having one in the seed is that a tenant can see the
       scheduled state in the console without having to construct it. */
    title: 'Getting a House Ready for the Monsoon',
    daysAgo: -6,
    tags: ['Safety', 'Maintenance', 'Monsoon'],
    excerpt:
      'An hour of checking before the rain arrives, covering the four things that actually fail when the humidity climbs.',
    body: `Damp does not usually break electrics outright. It lowers insulation resistance quietly, so circuits that were fine in April start tripping in July and nobody can find a cause. Here is the hour we spend at our own homes before the rain.

Test every RCCB. Press the button. It should trip instantly and reset cleanly. This is the single most valuable five seconds in the list, because a seized RCCB is invisible until the day it was needed.

Look at every outdoor fitting. Floodlights, porch lights, the gate light. What you are checking is the gasket and the gland — that the rubber seal is still soft rather than cracked, and that the cable enters through a proper gland rather than a hole. An IP65 fitting with a perished gasket is an IP20 fitting that still looks right.

Check the earth pit, if you have access to one. Pour water into it before the rains. A dry earth pit reads a high resistance, and high earth resistance is the condition under which an earth fault does not trip anything and instead sits waiting on the casing of an appliance.

Look behind the washing machine and under the sink. Those are where the sockets are lowest, the damp is highest and nobody looks. Discolouration around a socket, or a faint warm smell, is worth acting on the same day.

Then the two habits rather than checks. Do not run an extension lead across a balcony or a terrace, however temporarily, because temporary lasts until October. And if a circuit starts tripping during the rains and resets fine, do not simply keep resetting it — that is the RCCB doing its job and telling you that current is leaking somewhere. Find out where.

We have moisture meters and insulation testers, and testing a house is an hour's work. If something has been tripping since last year and nobody got to the bottom of it, this is the month to sort it out rather than the week it gets worse.`,
  },
  {
    /* publishedAt null: a draft. Half written on purpose — it is what a tenant's
       own unfinished post looks like in the console, and the seed should show
       that state honestly rather than parking a finished article in it. */
    title: 'Panel Lights or Downlights in a False Ceiling',
    daysAgo: null,
    tags: ['Lighting', 'Panel Lights'],
    excerpt: null,
    body: `Draft — notes towards a post, not finished.

Points to cover:

The confusion is mostly naming. A "panel light" and a "downlight" overlap heavily and different brands use both words for the same fitting. What actually differs is the cutout size, the depth needed above the ceiling, and the beam angle.

Depth is the thing people discover too late. A surface panel needs nothing above it. A recessed panel needs 40 to 50mm clear, and a deep downlight can want 100mm. Measure the gap before ordering, not after the ceiling is up.

Spacing rule of thumb — spacing roughly equal to the ceiling height gives even coverage without scallops on the wall. Need to check this against a real room before publishing it as advice.

Round versus square is purely aesthetic and nobody should be told otherwise.

Driver location matters for serviceability. An integrated driver means the whole fitting is replaced when the driver fails, which is usually what fails first. Worth saying that plainly even though it is what most of what we stock does.

Still to do: get the actual cutout sizes for the 15W round, photograph an installed ceiling, decide whether this is one post or two.`,
  },
];

/* ------------------------------------------------------------------ *
 * Writing it
 * ------------------------------------------------------------------ */

/**
 * Turns `daysAgo` into the date the row carries.
 *
 * Null stays null — that is the draft. Negative is the future, which the model
 * treats as scheduled and the public query hides until it arrives.
 */
function publishDate(daysAgo) {
  if (daysAgo === null || daysAgo === undefined) return null;

  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  /* Mid-morning rather than whatever time the script happened to run, so a
     listing ordered by date does not depend on the minute somebody seeded it. */
  date.setHours(10, 30, 0, 0);

  return date;
}

async function seedPosts(companyId, created) {
  for (const item of POSTS) {
    const slug = slugify(item.title);

    /* Matched on slug, and left alone if found. A tenant who has rewritten the
       body of a seeded post has said something about it that the script has
       not, and a re-run must not talk over them. */
    const existing = await db.CompanyBlogPost.findOne({ where: { companyId, slug } });
    if (existing) continue;

    await db.CompanyBlogPost.create({
      companyId,
      branchId: null,
      title: item.title,
      slug: await uniqueSlug(db.CompanyBlogPost, companyId, item.title),
      excerpt: item.excerpt ?? null,
      body: item.body,
      coverImage: writePlaceholder('blog', item.title),
      author: item.author ?? null,
      tags: item.tags ?? [],
      publishedAt: publishDate(item.daysAgo),
      featured: Boolean(item.featured),
      status: STATUS.ACTIVE,
    });

    created.posts += 1;
  }
}

/**
 * The switch, so the blog actually reaches the website.
 *
 * Only the tenant's own half — the plan's grant is the platform's to give, and a
 * script that quietly widened a company's plan would be doing something nobody
 * asked it to. If the plan does not carry `blog` this says so and stops short of
 * the website rather than forcing it.
 */
async function ensureSwitchedOn(companyId) {
  const [row] = await db.CompanyFunctionality.findOrCreate({
    where: { companyId, key: FUNCTIONALITY.BLOG },
    defaults: { companyId, key: FUNCTIONALITY.BLOG, status: STATUS.ACTIVE },
  });

  if (row.status !== STATUS.ACTIVE) await row.update({ status: STATUS.ACTIVE });
}

(async () => {
  try {
    const companyId = Number(process.argv[2]) || 1;

    await ensureDatabaseExists();
    await sequelize.authenticate();

    const company = await db.Company.findByPk(companyId);
    if (!company) throw new Error(`No company with id ${companyId}`);

    logger.info(`Seeding the demo blog into "${company.name}" (id ${companyId})`);

    const created = { posts: 0 };
    await seedPosts(companyId, created);
    await ensureSwitchedOn(companyId);

    const total = await db.CompanyBlogPost.count({ where: { companyId } });
    logger.info(`Added ${created.posts} posts (company now has ${total})`);

    /* The grant is the platform's, so this reports rather than changes it. */
    const functionalityService = require('../services/functionality.service');
    const item = await functionalityService.getFunctionality(companyId, FUNCTIONALITY.BLOG);
    if (!item?.active) {
      logger.warn(`The blog will NOT show on the website yet: ${item?.message ?? 'blog is not live'}`);
    } else {
      logger.info('The blog is live on this tenant’s website.');
    }

    process.exit(0);
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
})();
