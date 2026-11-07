/**
 * Living in 2070 (Cyberpunk: The Unification Era, Core Rules): training a Skill (Chapter 15),
 * sourcing gear (Chapter 12), making art (Chapter 13), bodysculpting and health plans (Chapter 08),
 * and Night Markets (Chapter 17). Pure: no Foundry calls.
 */
import { int } from "./util.js";

const HOUR = 60;
const DAY = 1440;
const WEEK = 10080;
const MONTH = 43200;

/* ------------------------------------------ */
/*  Training (Chapter 15)                     */
/* ------------------------------------------ */

/**
 * Teachers and Tuition: progress a week, the cost a week, the highest level they take you to;
 * zero: can open a brand-new Skill; double: can teach a Skill (×2); side: runs alongside other
 * downtime (no week of its own); bd: needs the Skill's Training BD in hand.
 */
export const TEACHERS = {
  selfSide: { progress: 5, eb: 0, max: 4, zero: false, double: false, side: true },
  selfDedicated: { progress: 10, eb: 0, max: 4, zero: false, double: false },
  bdSide: { progress: 10, eb: 0, max: 4, zero: true, double: true, side: true, bd: true },
  bdDedicated: { progress: 20, eb: 0, max: 4, zero: true, double: true, bd: true },
  street: { progress: 10, eb: 200, max: 6, zero: true, double: true },
  professional: { progress: 15, eb: 500, max: 8, zero: true, double: true },
  ncu: { progress: 20, eb: 0, term: 1200, max: 8, zero: true, double: true, academic: true },
  master: { progress: 25, eb: 1000, max: 10, zero: true, double: true },
  // a crewmate with the Skill at 6+ (as a Street trainer) or 8+ (as a Professional), for free
  crewmate: { progress: 10, eb: 0, max: 6, zero: true, double: true, crew: true }
};

/** A Skill level's cost in IP or progress: 20 × the level (×2 for a Skill (×2)). */
export const levelCost = (level, double = false) => 20 * int(level, 1, 10) * (double ? 2 : 1);

/** The skill categories that count as physical (Push Training rolls Endurance; anything else, Concentration). */
export const PHYSICAL = ["bodySkills", "fightingSkills", "rangedweaponSkills", "controlSkills"];
/** What Night City University teaches: Education, Technique and Performance Skills. */
export const ACADEMIC = ["educationSkills", "techniqueSkills", "performanceSkills"];

/** NCU: a term is four weeks; enrolling is DV13 Bureaucracy or a 1,500eb "donation". */
export const NCU = { termWeeks: 4, enrollDv: 13, donation: 1500 };
/** Push Training: DV15 Endurance (physical) or Concentration; +5 on a success, half on a failure, nothing on an implode. */
export const PUSH_DV = 15;
/** A Skill Chip: +5 a week, at any rate, up to level 4. */
export const CHIP_BONUS = 5;
export const CHIP_MAX = 4;
/** Elementary: +2 a week training your focus. */
export const ELEMENTARY_BONUS = 2;

/**
 * A crewmate teacher by their level in the Skill: Street at 6+, Professional at 8+.
 * @returns {object|null} the teacher's terms
 */
export function crewTeacher(level) {
  const n = int(level);
  if (n >= 8) return { ...TEACHERS.crewmate, progress: TEACHERS.professional.progress, max: Math.min(8, n) };
  if (n >= 6) return { ...TEACHERS.crewmate, progress: TEACHERS.street.progress, max: Math.min(6, n) };
  return null;
}

/**
 * Whether a week with a teacher can go ahead, and what it earns.
 * @param {object} t - a teacher's terms (TEACHERS, crewTeacher)
 * @param {object} s - { level, double, academic, chip, elementary, push: "ok"|"fail"|"implode"|null }
 * @returns {{ok: boolean, why: string, progress: number, target: number}} why: zero, double, max, academic
 */
export function trainingWeek(t, { level = 0, double = false, academic = true, chip = false, elementary = false, push = null } = {}) {
  const lvl = int(level, 0, 10);
  const target = lvl + 1;
  if (lvl === 0 && !t.zero && !chip) return { ok: false, why: "zero", progress: 0, target };
  if (double && !t.double && !chip) return { ok: false, why: "double", progress: 0, target };
  if (t.academic && !academic) return { ok: false, why: "academic", progress: 0, target };
  if (target > t.max) return { ok: false, why: "max", progress: 0, target };
  let progress = t.progress;
  if (chip && target <= CHIP_MAX) progress += CHIP_BONUS;
  if (elementary) progress += ELEMENTARY_BONUS;
  if (push === "ok") progress += 5;
  else if (push === "fail") progress = Math.floor(progress / 2);
  else if (push === "implode") progress = 0;
  return { ok: true, why: "", progress, target };
}

/**
 * Banked progress against a level: one level at a time; the extra carries.
 * @returns {{level: number, progress: number, up: boolean}}
 */
export function applyProgress(level, progress, double = false) {
  const lvl = int(level, 0, 10);
  const p = int(progress, 0, 100000);
  if (lvl >= 10) return { level: lvl, progress: p, up: false };
  const cost = levelCost(lvl + 1, double);
  return p >= cost ? { level: lvl + 1, progress: p - cost, up: true } : { level: lvl, progress: p, up: false };
}

/* ------------------------------------------ */
/*  Self Sourcing (Chapter 12)                */
/* ------------------------------------------ */

/** The Sourcing DV by Price Category (Media and Rockerboy roll it). */
export const SOURCING_DV = { expensive: 13, veryExpensive: 15, luxury: 17, superLuxury: 21 };
export const SOURCE_CATEGORIES = Object.keys(SOURCING_DV);

/**
 * Who sources what, from which Rank, at what price: reach (the Rank each category opens at),
 * mult (×price), check (a skill, or a role ability rolled with COOL), goods (item types; null: anything).
 */
export const SOURCERS = {
  fixer: { reach: [1, 4, 7, 9], mult: 1, check: null, goods: null },
  media: { reach: [4, 7, 9, 10], mult: 2, check: ["Streetwise", "Library Search"], goods: null },
  rockerboy: { reach: [4, 6, 8, 10], mult: 2, check: ["Charismatic Impact"], goods: null },
  netrunner: { reach: [1, 4, 7, 9], mult: 1, check: null, goods: ["program", "cyberdeck", "netarch", "itemUpgrade"] },
  nomad: { reach: [1, 1, 1, 1], mult: 1, check: null, goods: ["vehicle", "itemUpgrade"] }
};

/** A sourcer's Rank reaches a category? */
export function canReach(role, rank, category) {
  const s = SOURCERS[role];
  const i = SOURCE_CATEGORIES.indexOf(category);
  if (!s || i < 0) return false;
  return int(rank) >= s.reach[i];
}

/* ------------------------------------------ */
/*  Art (Chapter 13)                          */
/* ------------------------------------------ */

/** Art by quality: materials, time, DV, Humanity a month on display. Super Luxury: a month and +1 a month per 10,000eb. */
export const ART = {
  premium: { eb: 100, minutes: DAY, dv: 19, humanity: 1 },
  expensive: { eb: 500, minutes: WEEK, dv: 21, humanity: 2 },
  veryExpensive: { eb: 1000, minutes: 2 * WEEK, dv: 24, humanity: 3 },
  luxury: { eb: 5000, minutes: MONTH, dv: 29, humanity: 4 },
  superLuxury: { eb: 10000, minutes: MONTH, dv: 29, humanity: 4 }
};
export const ART_SKILLS = ["Paint/Draw/Sculpt", "Composition", "Photography/Film", "Play Instrument", "Acting"];

/** A piece's terms: Super Luxury is a month per 10,000eb, +1 Humanity a month for each extra month. */
export function artJob(quality, value = 0) {
  const a = ART[quality] ?? ART.premium;
  if (quality !== "superLuxury") return { ...a };
  const months = Math.max(1, Math.ceil(Math.max(10000, int(value)) / 10000));
  return { ...a, eb: months * 10000, minutes: months * MONTH, humanity: a.humanity + months - 1, months };
}

/* ------------------------------------------ */
/*  Medicine (Chapter 08)                     */
/* ------------------------------------------ */

/** Bodysculpting by a Medtech: Surgery DV, materials, Humanity Loss; 4 hours (2 lost on a failure). */
export const BODYSCULPT = {
  standard: { dv: 15, materials: 100, hl: null },
  exotic: { dv: 17, materials: 500, hl: "4d6" }
};
export const BODYSCULPT_MINUTES = 4 * HOUR;
export const BODYSCULPT_FAIL_MINUTES = 2 * HOUR;

/**
 * Health plans (2070): monthly cost, how fast they come (a roll in Rounds), and what's covered.
 * cryo: free cryotank recovery; surgery: surgery included.
 */
export const HEALTH_PLANS = {
  cryobank: { eb: 150, arrives: null, cryo: false },
  reo: { eb: 250, arrives: "1d12", cryo: false, stasis: 200 },
  ttSilver: { eb: 500, arrives: "2d6", cryo: true },
  ttExecutive: { eb: 1000, arrives: "1d6", cryo: true, surgery: true, bed: 50 },
  corpoGold: { eb: 0, arrives: "2d6", cryo: true },
  corpoPlatinum: { eb: 0, arrives: "1d6", cryo: true, surgery: true, bed: 50 }
};

/**
 * Where a character rests, and what a day of it costs: at home, a hospital bed (100eb a night, 50
 * with TT Executive), a hospital cryotank (100eb a day, free with TT Silver/Executive; double
 * healing), or a Medtech's licensed tank (500eb a night, double healing).
 */
export const REST_PLACES = {
  home: { eb: 0, rate: 1 },
  hospital: { eb: 100, rate: 1 },
  cryoHospital: { eb: 100, rate: 2, cryo: true },
  cryoMedtech: { eb: 500, rate: 2 }
};

/** A day's rest: what it costs with this plan, and the healing multiplier (×2 for a cryotank or Enhanced Antibodies). */
export function restDay(place, plan, { antibodies = false } = {}) {
  const r = REST_PLACES[place] ?? REST_PLACES.home;
  const p = HEALTH_PLANS[plan] ?? null;
  let eb = r.eb;
  if (place === "hospital" && p?.bed) eb = p.bed;
  if (r.cryo && p?.cryo) eb = 0;
  return { eb, rate: Math.max(r.rate, antibodies ? 2 : 1) };
}

/* ------------------------------------------ */
/*  Night Markets (Chapter 17)                */
/* ------------------------------------------ */

/** Hearing of one: Streetwise DV13 or Trading DV15. */
export const MARKET_FIND = { Streetwise: 13, Trading: 15 };
export const MARKET_CATEGORIES = ["food", "electronics", "weapons", "cyberware", "clothing", "survival"];

/** On the Shelves (1d10 an item). */
export const SHELVES = {
  food: ["Kibble Packs and MREs by the case", "Real fruit, still fresh", "Synthcoke", "Black Lace", "Boost and Smash", "Speedheal and Antibiotics", "Blue Glass", "A street-chem cook's new mix", "Immunoblockers", "Real meat, if you don't ask"],
  electronics: ["Disposable Cell Phones", "Computer", "Smart Glasses", "Braindance Viewer and a stack of wreck", "Radio Communicators", "Scrambler / Descrambler", "Audio Recorder and Video Camera", "Bug Detector and Radar Detector", "Cyberdeck (Poor or Standard)", "Techscanner or Medscanner"],
  weapons: ["Medium Pistols, used", "Heavy Pistols", "SMGs and Heavy SMGs", "Shotguns", "Assault Rifles", "Bows, crossbows and arrows", "Kevlar® and Light Armorjack", "Medium and Heavy Armorjack", "Grenades, by the crate", "One Exotic or Iconic weapon (GM's pick)"],
  cyberware: ["Cybereye with an option", "Cyberaudio Suite with an option", "Neural Link", "Interface Plugs and a Chipware Socket", "Skill Chips", "Cyberarm or Cyberleg", "Kerenzikov or a Sandevistan", "Subdermal Armor or Skin Weave", "Toxin Binders and Nasal Filters", "One Luxury piece of chrome (GM's pick)"],
  clothing: ["Entropism, by the armful", "Kitsch jackets and boots", "Neo-Militarism suits", "Neo-Kitsch, two seasons old", "Nomad Leathers, for trade only", "High Fashion knock-offs (Kitsch price)", "Light Tattoos", "Techhair and Shift Tacts", "Chemskin and Skinwatch", "A one-off designer piece (Luxury)"],
  survival: ["Anti-Smog Breathing Masks", "Rope (60m/yds) and a Grapple Gun", "Tent & Camping Equipment", "Flashlights and Road Flares", "Inflatable Bed & Sleep-bag", "Medtech Bag", "Airhypo", "Binoculars and a Duct Tape stack", "Tech Bag", "Cryopump"]
};

/**
 * What's on sale: two categories (a Fixer's pick can be one of them), each with 1d10 different
 * items rolled on the shelves (repeats rerolled).
 * @param {() => number} d6
 * @param {() => number} d10
 * @param {string|null} pick - a category the Fixer chose
 * @returns {{category: string, items: string[]}[]}
 */
export function stockMarket(d6, d10, pick = null) {
  const cats = [];
  if (MARKET_CATEGORIES.includes(pick)) cats.push(pick);
  let guard = 0;
  while (cats.length < 2 && guard++ < 50) {
    const c = MARKET_CATEGORIES[int(d6(), 1, 6) - 1];
    if (!cats.includes(c)) cats.push(c);
  }
  return cats.map((category) => {
    const n = int(d10(), 1, 10);
    const seen = new Set();
    let tries = 0;
    while (seen.size < n && tries++ < 100) seen.add(int(d10(), 1, 10));
    return { category, items: [...seen].sort((a, b) => a - b).map((i) => SHELVES[category][i - 1]) };
  });
}

/* ------------------------------------------ */
/*  Maximum Humanity (Chapter 09)             */
/* ------------------------------------------ */

/** The chrome an FBC carries free (no HL, no lower maximum). */
const FBC_FREE = /^(cyberarm|cyberleg|cybereye|cyberaudio suite|cyberskull|internal linear frame|neural link|neuroport)/i;

/**
 * Maximum Humanity in 2070: original EMP × 10, −2 a piece of chrome with Humanity Loss, −4 a
 * Borgware (or a piece that counts as one), −8 for Linear Frame Ω; nothing for the free Neuroport,
 * an FBC's free chrome or 0-HL pieces; +10 on Fresh Food. Cyberpunk RED counts the −2s and −4s
 * itself; `adjust` is what 2070 changes on top.
 * @param {{name: string, borgware: boolean, hl: number, countsAsBorgware?: boolean}[]} chrome - installed cyberware
 * @param {object} o - { emp: original EMP, freshFood }
 * @returns {{max: number, cpr: number, adjust: number, lines: {label: string, n: number}[]}}
 */
export function maxHumanity(chrome, { emp = 0, freshFood = false } = {}) {
  const list = chrome ?? [];
  const fbc = list.some((c) => /full body conversion|^fbc|biosystem/i.test(c.name));
  let cpr = 10 * int(emp);
  let max = 10 * int(emp);
  const lines = [{ label: "base", n: max }];
  let neuroport = false;
  for (const c of list) {
    const theirs = c.borgware ? 4 : c.hl > 0 ? 2 : 0;
    cpr -= theirs;
    let ours = theirs;
    if (/linear frame.*(ω|omega)/i.test(c.name)) ours = 8;
    else if (c.countsAsBorgware) ours = 4;
    else if (!c.borgware && /^(neural link|neuroport)/i.test(c.name) && !neuroport) {
      neuroport = true;
      ours = 0;
    } else if (fbc && !c.borgware && FBC_FREE.test(c.name)) ours = 0;
    max -= ours;
    if (ours) lines.push({ label: c.name, n: -ours });
  }
  if (freshFood) {
    max += 10;
    lines.push({ label: "freshFood", n: 10 });
  }
  return { max, cpr, adjust: max - cpr, lines };
}
