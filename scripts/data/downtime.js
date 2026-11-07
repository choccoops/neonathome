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
export const ROLES = ["rockerboy", "solo", "netrunner", "tech", "medtech", "media", "exec", "lawman", "fixer", "nomad", "ganger"];

/* ------------------------------------------ */
/*  The Hustle (p.381; 2070, Chapter 13)      */
/* ------------------------------------------ */

/** What each result pays by Role Rank (1-4, 5-7, 8-10): a dry week, low, good, great. */
export const HUSTLE_PAY = { Z: [0, 100, 300], L: [100, 200, 500], M: [200, 300, 600], H: [300, 500, 800] };

/**
 * A week of downtime earns a little by Role (Cyberpunk: The Unification Era, Chapter 13): roll 1d6
 * on the Role's row; its letter sets the pay by Role Rank. [summary, letter]. Lawmen are gone in
 * 2070; Gangers hustle for their gang.
 */
export const HUSTLES = {
  rockerboy: [["Played a small local gig.", "M"], ["No gigs to be had this week.", "Z"], ["A corp or celebrity gig.", "H"], ["Royalties came in.", "H"], ["Opened for a big-name act.", "H"], ["A paid personal appearance.", "M"]],
  solo: [["Bodyguard work for a low-end client.", "L"], ["Bodyguard work for a high-end client.", "M"], ["A hit or an extraction.", "M"], ["Muscle for hire.", "L"], ["Lying low this week.", "Z"], ["Enforcer work for a corp.", "L"]],
  netrunner: [["Cracked a small system and sold the data.", "L"], ["Cracked a corp system and sold the data.", "M"], ["Got sidetracked; nothing hacked.", "Z"], ["Found a data cache and sold it.", "M"], ["A ransomware payout.", "M"], ["Sabotage for a client.", "M"]],
  tech: [["No jobs this week.", "Z"], ["Rebuilt tech scavenged from the ruins.", "L"], ["A break-in, or a security install, for a client.", "M"], ["Chrome repairs.", "L"], ["Weapon repairs.", "L"], ["A sabotage job.", "L"]],
  medtech: [["Patched someone up after a firefight.", "L"], ["Sold chrome from a \"failed\" case.", "M"], ["Trauma Team overflow work.", "L"], ["Free clinic work; goodwill doesn't pay.", "Z"], ["A rich client's surgery.", "M"], ["Made drugs to order.", "L"]],
  media: [["A big exposé and a big sale.", "H"], ["A puff piece.", "M"], ["Ad copy to pay the bills.", "M"], ["A story that made some enemies.", "M"], ["No leads this week.", "Z"], ["Blew the lid off something.", "H"]],
  fixer: [["Sold a Media some information.", "M"], ["Got a Rocker a gig (12%).", "M"], ["Found a client the item they wanted.", "M"], ["A deal went south; keeping your head down.", "Z"], ["Placed a Solo or Netrunner on a job.", "M"], ["Brought in something rare or illegal.", "H"]],
  nomad: [["A legit shipment.", "L"], ["Protected a shipment.", "L"], ["Smuggled some small contraband.", "L"], ["Moved a huge shipment.", "M"], ["Delivered a client safely.", "L"], ["No work this week.", "Z"]],
  ganger: [["Ran errands for the boss.", "L"], ["Collected protection.", "M"], ["Turf war; laid low.", "Z"], ["Escorted a deal.", "L"], ["Moved product.", "M"], ["A cut of a big score.", "M"]],
  exec: [["A project bonus.", "H"], ["Lost a bonus.", "Z"], ["Just the paycheck.", "M"], ["Dirt on a rival turned into a bonus.", "H"], ["A head-office bonus.", "H"], ["Took a rival's funding.", "M"]]
};

/** A Hustle result: { text, eb, letter } for a role, a 1d6 roll and a Role Rank. */
export function hustle(role, roll, rank) {
  const row = HUSTLES[role]?.[int(roll, 1, 6) - 1];
  if (!row) return null;
  const band = rank >= 8 ? 2 : rank >= 5 ? 1 : 0;
  return { text: row[0], letter: row[1], eb: HUSTLE_PAY[row[1]][band] };
}

/** Interesting Hustles (2070): a d100 at or under the result's chance; 01 is a Jackpot (two developments). */
export const INTERESTING_CHANCE = { Z: 5, L: 10, M: 15, H: 25 };

/** What happened, 1d6: 1-2 a new contact, 3-4 an opportunity, 5 inside info, 6 strings attached. */
export const INTERESTING = ["contact", "contact", "opportunity", "opportunity", "insideInfo", "strings"];

/** Each Role's examples: [a new contact, an opportunity]. */
export const INTERESTING_EXAMPLES = {
  rockerboy: ["A promoter who books the Totentanz", "An opening slot on a corp-sponsored tour"],
  solo: ["A grateful bodyguard client", "A security contract that needs a crew"],
  netrunner: ["A Voodoo Boys broker", "A data cache too big to crack alone"],
  tech: ["A Night Market parts dealer", "A salvage site nobody's claimed"],
  medtech: ["A Trauma Team medic who owes you", "A clinic that needs a partner"],
  media: ["A source inside City Hall", "A story that leads to a bigger one"],
  fixer: ["A new client with deep pockets", "A buyer for something you don't have yet"],
  nomad: ["A cousin from another clan", "A run through the Badlands that pays triple"],
  ganger: ["A lieutenant who's noticed you", "A corner your gang wants taken"],
  exec: ["A rival's unhappy assistant", "A project nobody else wants"]
};

/** Whether a week was interesting: { interesting, jackpot } for a result letter and a d100. */
export function interesting(letter, d100) {
  const n = int(d100, 1, 100);
  return { interesting: n <= (INTERESTING_CHANCE[letter] ?? 0), jackpot: n === 1 };
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

/**
 * Invented Tech Upgrades (TUps, Chapter 12): installing one costs the item's own category in
 * materials (Cost #1) plus its heat (Cost #2, a kit bought for the heat's price), at the heat's DV.
 */
export const HEAT = {
  mild: { eb: 100, dv: 17 },
  medium: { eb: 500, dv: 21 },
  hot: { eb: 1000, dv: 24 },
  extraHot: { eb: 5000, dv: 29 },
  diablo: { eb: 10000, dv: 29 }
};

/** Taking Less Time (Chapter 02): Hurrying is −4, Rushing −8. */
export const PACE = { normal: { penalty: 0, steps: 0 }, hurry: { penalty: -4, steps: 1 }, rush: { penalty: -8, steps: 2 } };

/**
 * A Maker job's time when Hurried or Rushed: one Price Category lower a step (two for Rushing);
 * below Cheap/Everyday a fifth or a tenth; a job of several months halves its months (round up) a
 * step, and a one-month job drops to two weeks.
 */
export function pacedMinutes(minutes, pace = "normal") {
  const steps = PACE[pace]?.steps ?? 0;
  if (!steps) return minutes;
  const LADDER = [60, 360, 1440, 10080, 20160, 43200];
  let m = minutes;
  for (let i = 0; i < steps; i++) {
    if (m > 43200) m = Math.ceil(m / 43200 / 2) * 43200;
    else {
      const at = LADDER.indexOf(m);
      if (at > 0) m = LADDER[at - 1];
      else return Math.max(1, Math.round(minutes / (steps === 1 ? 5 : 10)));
    }
  }
  return m;
}

/** Invention: the GM sets the price category, Expensive at the lowest. */
export const INVENT_CATEGORIES = ["expensive", "veryExpensive", "luxury", "superLuxury"];

/**
 * An invention's price: the planned value the GM gave (which sets the category), else the
 * category's own. Super Luxury work takes a month per 10,000eb of it (p.149), so its value matters.
 * @returns {{category: string, value: number, ok: boolean}} ok: false when the value is below Expensive
 */
export function inventPrice(category, value = 0) {
  const v = Math.max(0, Math.floor(Number(value) || 0));
  if (v) {
    const key = PRICE_CATEGORIES[Math.max(0, priceCategory(v))].key;
    return { category: INVENT_CATEGORIES.includes(key) ? key : "expensive", value: v, ok: INVENT_CATEGORIES.includes(key) };
  }
  const cat = INVENT_CATEGORIES.includes(category) ? category : "expensive";
  return { category: cat, value: PRICE_CATEGORIES.find((c) => c.key === cat).eb, ok: true };
}

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

/**
 * Therapy (2070, Chapter 08): a week for the Medtech and the patient; a Medical Tech Check at the
 * end. Materials only from Biotechnica.
 */
export const THERAPY = {
  addiction: { dv: 15, materials: 500, heal: null },
  standard: { dv: 17, materials: 1000, heal: "2d6" },
  extreme: { dv: 20, materials: 2500, heal: "4d6" }
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
