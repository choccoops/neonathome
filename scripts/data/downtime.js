/**
 * Downtime actions from the Cyberpunk RED core rulebook: what each costs in time, eb and DV, by Role.
 * Pure: no Foundry calls. The results and effects are short summaries written for this module; the
 * rulebook has the full text (pages noted).
 */
import { int } from "./util.js";
import { PRICE_CATEGORIES, priceCategory, repairOf } from "./maintenance.js";

/** Minutes in a unit of downtime (a month is 30 days). */
export const MIN = { minute: 1, hour: 60, day: 1440, week: 10080, month: 43200 };

/** Cyberpunk RED's Roles, as role items are named (lowercase). */
export const ROLES = ["rockerboy", "solo", "netrunner", "tech", "medtech", "media", "exec", "lawman", "fixer", "nomad"];

/* ------------------------------------------ */
/*  The Hustle (p.381)                        */
/* ------------------------------------------ */

/**
 * A week of downtime earns a little by Role: roll 1d6 on the Role's table; the pay goes by Role
 * Ability Rank (1-4, 5-7, 8-10). [summary, [rank 1-4, 5-7, 8-10]].
 */
export const HUSTLES = {
  rockerboy: [["Played a small local gig.", [200, 300, 600]], ["No gigs to be had this week.", [0, 100, 300]], ["A big private gig for a rich client.", [300, 500, 800]], ["Royalties came in from a Data Pool release.", [300, 500, 800]], ["Opened for a big-name act.", [300, 500, 800]], ["A paid personal appearance.", [200, 300, 600]]],
  solo: [["Bodyguard work for a low-end client.", [100, 200, 500]], ["Bodyguard work for a high-end client.", [200, 300, 600]], ["A hard hit or extraction.", [200, 300, 600]], ["Hired muscle for a Fixer, Corp or gang.", [100, 200, 500]], ["Drew too much attention and laid low.", [0, 100, 300]], ["Enforcer work for a local Corp.", [100, 200, 500]]],
  netrunner: [["Cracked a small system and sold the data.", [100, 200, 500]], ["Cracked a big Corp system and sold the data.", [200, 300, 600]], ["Got sidetracked; nothing hacked.", [0, 100, 300]], ["Found an old data cache and sold it.", [200, 300, 600]], ["Ransomed a major system and got paid to undo it.", [200, 300, 600]], ["Sabotaged a system for a faceless client.", [200, 300, 600]]],
  tech: [["No jobs this week.", [0, 100, 300]], ["Rebuilt tech scavenged in the Combat Zone.", [100, 200, 500]], ["A break-in, or a security install, for a client.", [200, 300, 600]], ["Cybertech mods and repairs.", [100, 200, 500]], ["Weapon mods and repairs.", [100, 200, 500]], ["Sabotage for a client.", [100, 200, 500]]],
  medtech: [["Patched someone up after a firefight.", [100, 200, 500]], ["Sold cyberware from a \"failed\" case.", [200, 300, 600]], ["Backup work for an overloaded Trauma Team.", [100, 200, 500]], ["Free clinic work; goodwill doesn't pay.", [0, 100, 300]], ["A major procedure for a rich client.", [200, 300, 600]], ["Made medicines or street drugs to order.", [100, 200, 500]]],
  media: [["A big exposé and a big sale.", [300, 500, 800]], ["A popular puff piece.", [200, 300, 600]], ["Ad copy to pay the bills.", [200, 300, 600]], ["A big story: some cash, a few enemies.", [200, 300, 600]], ["No good leads this week.", [0, 100, 300]], ["An exposé that blew the lid off.", [300, 500, 800]]],
  lawman: [["A few minor busts.", [100, 200, 500]], ["A \"reward\" from a grateful citizen.", [200, 300, 600]], ["A bust went bad; it came out of your pay.", [0, 100, 300]], ["Quiet week; just the paycheck.", [100, 200, 500]], ["A big drug or smuggling bust, and a bonus.", [200, 300, 600]], ["Took down a gang; a seizure bonus.", [200, 300, 600]]],
  exec: [["A project went well: a bonus.", [300, 500, 800]], ["Corporate was unimpressed: no bonus.", [0, 100, 300]], ["Just the paycheck.", [200, 300, 600]], ["Dirt on a rival turned into a bonus.", [300, 500, 800]], ["A major project success: Head Office paid.", [300, 500, 800]], ["Took out a threat to a job, and its funding.", [200, 300, 600]]],
  fixer: [["Sold a Media some information.", [200, 300, 600]], ["Got a Rocker a gig, for the usual cut.", [200, 300, 600]], ["Found a client what they needed, for a cut.", [200, 300, 600]], ["A deal went south; keeping your head down.", [0, 100, 300]], ["Placed a Solo or Netrunner on a job, for a fee.", [200, 300, 600]], ["Brought in something rare or illegal.", [300, 500, 800]]],
  nomad: [["A legit shipment.", [100, 200, 500]], ["Protected a shipment.", [100, 200, 500]], ["Smuggled some small contraband.", [100, 200, 500]], ["Smuggled a huge shipment.", [200, 300, 600]], ["Got a client safely where they were going.", [100, 200, 500]], ["No work this week, legit or otherwise.", [0, 100, 300]]]
};

/** A Hustle result: { text, eb } for a role, a 1d6 roll and a Role Ability Rank. */
export function hustle(role, roll, rank) {
  const row = HUSTLES[role]?.[int(roll, 1, 6) - 1];
  if (!row) return null;
  const band = rank >= 8 ? 2 : rank >= 5 ? 1 : 0;
  return { text: row[0], eb: row[1][band] };
}

/* ------------------------------------------ */
/*  Maker (Tech, pp.147-149)                  */
/* ------------------------------------------ */

/** Upgrade, Fabrication and Invention share the Item Repair table: DV and time by price category. */
export function makerJob(price, { vehicle = false } = {}) {
  // a vehicle upgrade counts as Very Expensive
  return repairOf(vehicle ? 1000 : price);
}

/** The eb of a price category one lower than an item's (Fabrication's materials). */
export function fabricationMaterials(price) {
  const p = Number(price) || 0;
  if (p >= 10000) return Math.ceil(p / 2); // Super Luxury: half its price
  const at = priceCategory(p);
  if (at <= 0) return 5; // fabricating a Cheap item costs 5eb
  return PRICE_CATEGORIES[at - 1].eb;
}

/** Upgrade Expertise's materials: the item's own price category (a vehicle: Very Expensive). */
export function upgradeMaterials(price, { vehicle = false } = {}) {
  if (vehicle) return 1000;
  const at = Math.max(0, priceCategory(price));
  return PRICE_CATEGORIES[at].eb;
}

/**
 * What Upgrade Expertise can do to an item (one upgrade per item). apply: what Neon At Home changes
 * itself; the rest are noted on the item for the GM.
 */
export const UPGRADES = {
  humanity: { apply: null },
  slot: { apply: "slot" },
  simplify: { apply: null },
  conceal: { apply: "conceal" },
  quality: { apply: "quality" },
  exoticSlot: { apply: "slot" },
  exoticAmmo: { apply: null },
  sp: { apply: "sp" },
  vehicle: { apply: null },
  invented: { apply: null }
};

/** Invention: the GM sets the price category, Expensive at the lowest. */
export const INVENT_CATEGORIES = ["expensive", "veryExpensive", "luxury", "superLuxury"];

/* ------------------------------------------ */
/*  Medicine (Medtech, pp.149-150, 229-230)   */
/* ------------------------------------------ */

/** Pharmaceuticals: DV13 Medical Tech, an hour, 200eb of materials for doses equal to the skill. */
export const PHARMA = {
  antibiotic: "Heals 2 more HP a day for a week, once natural healing has started.",
  rapidetox: "Purges a drug, poison or intoxicant at once.",
  speedheal: "Heals BODY + WILL HP at once (not when Mortally Wounded); once a day.",
  stim: "Ignores the Seriously Wounded penalties for an hour; once a day.",
  surge: "No sleep needed for 24 hours; once a week."
};
export const PHARMA_DV = 13;
export const PHARMA_MATERIALS = 200;

/** Therapy (p.230): a week for the Medtech and the patient; a Medical Tech Check at the end. */
export const THERAPY = {
  addiction: { dv: 15, materials: 500, heal: null },
  standard: { dv: 15, materials: 100, heal: "2d6" },
  extreme: { dv: 17, materials: 500, heal: "4d6" }
};

/* ------------------------------------------ */
/*  Credibility (Media, pp.151-153)           */
/* ------------------------------------------ */

/** Chasing a rumor (the Active DVs). */
export const RUMORS = { vague: 13, typical: 15, substantial: 17, detailed: 21 };

/** Believability out of 10 by Credibility Rank, +1 with a piece of hard evidence, +2 more with 5+. */
export function believability(rank, evidence = 0) {
  const r = int(rank, 0, 10);
  const base = r >= 10 ? 7 : r >= 9 ? 6 : r >= 7 ? 5 : r >= 5 ? 4 : r >= 3 ? 3 : r >= 1 ? 2 : 0;
  const e = int(evidence, 0, 99);
  return Math.min(10, base + (e >= 1 ? 1 : 0) + (e > 4 ? 2 : 0));
}

/* ------------------------------------------ */
/*  Healing (pp.222-223)                      */
/* ------------------------------------------ */

/** A Treatment attempt takes four hours (a Quick Fix, a minute). */
export const TREATMENT_MINUTES = 4 * MIN.hour;

/**
 * How a critical injury can be treated: the skills and DVs Cyberpunk RED's injury item lists, and
 * Cybertech in place of them for an injury on a cyberlimb (p.223).
 * @returns {{skill, dv, ability?}[]} skill: a skill name, or "Surgery" (a Medtech's ability)
 */
export function treatments(injury, { cyber = false } = {}) {
  const t = injury?.system?.treatment ?? {};
  const q = injury?.system?.quickFix ?? {};
  const out = [];
  switch (t.type) {
    case "surgery":
      out.push({ skill: "Surgery", dv: int(t.dvSurgery), ability: true });
      break;
    case "quickFix":
      if (q.type === "firstAidParamedic") out.push({ skill: "First Aid", dv: int(q.dvFirstAid) }, { skill: "Paramedic", dv: int(q.dvParamedic) });
      else if (q.type === "paramedic") out.push({ skill: "Paramedic", dv: int(q.dvParamedic) });
      break;
    default:
      if (int(t.dvParamedic)) out.push({ skill: "Paramedic", dv: int(t.dvParamedic) });
      if (int(t.dvSurgery)) out.push({ skill: "Surgery", dv: int(t.dvSurgery), ability: true });
  }
  if (cyber) for (const o of [...out]) if (!out.some((x) => x.skill === "Cybertech" && x.dv === o.dv)) out.push({ skill: "Cybertech", dv: o.dv });
  return out.filter((o) => o.dv > 0);
}

/** The Night Market (Fixer, Operator Rank 5+): once a month. */
export const NIGHT_MARKET_RANK = 5;
