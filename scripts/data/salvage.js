/**
 * Salvaging (R. Talsorian's Salvaging Night City DLC, 2045) and a 2070 take on it for the Night City
 * of the Edgerunner's Handbook: a week of downtime spent picking through the ruins with a Basic Tech
 * Check, whose total sets the worth of what's found. Pure: no Foundry calls.
 *
 * The DLC's numbers are its mechanics; every table's wording is a short summary written for this
 * module (the DLC and the Handbook have the full text). The 2070 locations and their tables are
 * Neon At Home's own, built on the DLC's.
 */
import { int } from "./util.js";
import { MIN } from "./downtime.js";

/** A salvaging trip takes a week, and no other downtime that week (p.3). */
export const SALVAGE_MINUTES = MIN.week;

/** What salvage can be: the DLC's categories. */
export const CATEGORIES = ["cyberware", "weapons", "gear", "armor", "cyberdecks"];

/** The item types each category's finds can be (General Gear: gear, clothing and upgrades). */
export const CATEGORY_TYPES = {
  cyberware: ["cyberware"],
  weapons: ["weapon"],
  gear: ["gear", "clothing", "itemUpgrade"],
  armor: ["armor"],
  cyberdecks: ["cyberdeck", "program"]
};

/** The category an item would be found in, or null. */
export function categoryOf(type) {
  return CATEGORIES.find((c) => CATEGORY_TYPES[c].includes(type)) ?? null;
}

/**
 * Salvage Worth (p.4): the Basic Tech DV for each worth, taking whatever turns up (any) or hunting a
 * category (specific; 1,000eb can't be had that way).
 */
export const WORTH = [
  { eb: 10, any: 9, specific: 13 },
  { eb: 20, any: 13, specific: 15 },
  { eb: 50, any: 15, specific: 17 },
  { eb: 100, any: 17, specific: 21 },
  { eb: 500, any: 24, specific: 29 },
  { eb: 1000, any: 29, specific: null }
];

/** The worth a check total finds (0: nothing worth hauling home). */
export function salvageWorth(total, specific = false) {
  const t = int(total);
  let eb = 0;
  for (const w of WORTH) {
    const dv = specific ? w.specific : w.any;
    if (dv !== null && t >= dv) eb = w.eb;
  }
  return eb;
}

/** The lowest DV that finds anything. */
export const firstDv = (specific = false) => (specific ? WORTH[0].specific : WORTH[0].any);

/* ------------------------------------------ */
/*  Perils                                    */
/* ------------------------------------------ */

/**
 * Perils of Salvaging (p.5), rolled on a Critical Failure: what each kind of peril does, by the
 * core rulebook's rules. damage: rolled, soaked by armor; direct: straight to HP; crit: a Critical
 * Injury to the Body; negate: gear (by name) that keeps it off; save: what saves you from it.
 */
export const PERIL_RULES = {
  collapse: { damage: "6d6", crit: true, page: "CP:R p.221" },
  firefight: { damage: "6d6" },
  blast: { damage: "6d6" },
  radiation: { rounds: "1d10", perRound: 2, negate: ["radiation suit"], page: "CP:R p.181" },
  fall: { damage: "6d6", save: ["grapple"], dv: 15, skill: "Athletics", page: "CP:R p.181" },
  gas: { direct: "3d6", dv: 15, skill: "Resist Torture/Drugs", negate: ["anti-smog", "air supply", "oxygen"], page: "CP:R p.355" },
  wire: { damage: "6d6", page: "CP:R p.180" }
};

/** What each kind of peril does, in short (with its source). */
export const PERIL_EFFECTS = {
  collapse: "6d6 damage (armor soaks it), and a Critical Injury to the Body.",
  firefight: "6d6 damage (armor soaks it).",
  blast: "6d6 damage (armor soaks it).",
  radiation: "High Level Radiation for 1d10 rounds: each, 2 damage straight to HP, as if Mildly On Fire. A Radiation Suit keeps it off.",
  fall: "A 30m fall when the ground gives: 6d6 damage (armor soaks it), unless a Grapple Hand or Gun, or a DV15 Athletics Check to grab the edge, saves you.",
  gas: "A pocket of toxic gas for a round, as a Vial of Biotoxin: beat DV15 Resist Torture/Drugs or take 3d6 straight to HP. An Anti-Smog Breathing Mask or an air supply keeps it off.",
  wire: "A live wire: electrocuted for a round, 6d6 damage (armor soaks it)."
};

/* ------------------------------------------ */
/*  Locations                                 */
/* ------------------------------------------ */

/** The DLC's tables (p.3, p.5): what's found, and what goes wrong. */
const DLC_CATEGORIES = ["cyberware", "weapons", "gear", "gear", "armor", "cyberdecks"];
const DLC_PERILS = [
  ["collapse", "A structure comes down on you."],
  ["firefight", "You walk into a firefight."],
  ["radiation", "A radiation hot spot."],
  ["fall", "The ground gives way under you."],
  ["gas", "A pocket of toxic gas."],
  ["wire", "You grab a live wire."]
];

/**
 * Where to salvage, by era. 2045: the DLC's places (the same tables; the place is the story).
 * 2070: one Combat Zone (Pacifica), no Hot Zone; each place finds and threatens differently.
 * categories: 1d6; perils: 1d6 of [kind, what happened].
 */
export const LOCATIONS = {
  2045: {
    hotZone: { categories: DLC_CATEGORIES, perils: DLC_PERILS },
    combatZone: { categories: DLC_CATEGORIES, perils: DLC_PERILS },
    scrapyards: { categories: DLC_CATEGORIES, perils: DLC_PERILS },
    perimeter: { categories: DLC_CATEGORIES, perils: DLC_PERILS }
  },
  2070: {
    // Pacifica: the dead resort district, the Voodoo Boys' turf, BARGHEST's Dogtown, scav cells
    combatZone: {
      categories: ["cyberware", "weapons", "weapons", "gear", "armor", "cyberdecks"],
      perils: [
        ["collapse", "A floor of a half-built hotel gives way under you."],
        ["firefight", "A Voodoo Boys or BARGHEST patrol calls it trespassing."],
        ["firefight", "A scav cell decides your chrome is worth more than their haul."],
        ["fall", "Down a dead elevator shaft in the Grand Imperial Mall."],
        ["gas", "Rot gas built up in a sealed parking garage."],
        ["wire", "A Voodoo Boys power tap, live."]
      ]
    },
    // Coronado Dam's trash dump in Santo Domingo, and Northside's gutted factories
    scrapyards: {
      categories: ["cyberdecks", "gear", "gear", "gear", "armor", "cyberware"],
      perils: [
        ["collapse", "A slope of scrap comes down on you."],
        ["firefight", "A Corp security or NCPD sweep of the yard."],
        ["radiation", "A hot spot left by an old reactor core."],
        ["fall", "Into a compactor pit."],
        ["gas", "Crushed chemical drums, leaking."],
        ["wire", "A scrapyard crane's cable, still live."]
      ]
    },
    // the city's edge: abandoned motels and service stations, old war leftovers
    perimeter: {
      categories: ["weapons", "armor", "gear", "gear", "weapons", "cyberware"],
      perils: [
        ["collapse", "An abandoned motel's roof caves in on you."],
        ["firefight", "Raiders, or a Nomad family who found it first."],
        ["blast", "Unexploded ordnance from the Unification War."],
        ["fall", "Into a dry well or a service pit."],
        ["gas", "A ruptured CHOOH2 tank."],
        ["wire", "A \"dead\" substation that isn't."]
      ]
    },
    // the wrecked desert past the Perimeter: Nomad country, raiders, old war sites
    badlands: {
      categories: ["weapons", "weapons", "armor", "gear", "gear", "cyberware"],
      perils: [
        ["collapse", "The wreck you're stripping shifts and pins you."],
        ["firefight", "Wraiths raid the site."],
        ["radiation", "Fallout dust blown in from an old war site."],
        ["fall", "A sinkhole opens in a dry riverbed."],
        ["gas", "A dust storm, and no mask."],
        ["wire", "A downed AV's power cell."]
      ]
    }
  }
};

export const ERAS = Object.keys(LOCATIONS);

/** The places to salvage in an era (2045 if the era's unknown). */
export const locationsOf = (era) => Object.keys(LOCATIONS[era] ?? LOCATIONS[2045]);

/** A place's tables, or the era's first place's. */
export function locationOf(era, key) {
  const places = LOCATIONS[era] ?? LOCATIONS[2045];
  return places[key] ?? Object.values(places)[0];
}

/** The category a 1d6 finds at a place. */
export const rollCategory = (era, key, roll) => locationOf(era, key).categories[int(roll, 1, 6) - 1];

/** The peril a 1d6 brings at a place: { kind, text, effect, rules }. */
export function rollPeril(era, key, roll) {
  const [kind, text] = locationOf(era, key).perils[int(roll, 1, 6) - 1];
  return { kind, text, effect: PERIL_EFFECTS[kind], rules: PERIL_RULES[kind] };
}

/**
 * Whether a character's gear keeps a peril off (negate) or saves them (save): the name of the item
 * that does, or "". Items: { name, type }; matched on the name, case-insensitive.
 */
export function perilGear(kind, items) {
  const r = PERIL_RULES[kind] ?? {};
  const words = [...(r.negate ?? []), ...(r.save ?? [])];
  if (!words.length) return "";
  const hit = items.find((i) => words.some((w) => String(i?.name ?? "").toLowerCase().includes(w)));
  return hit ? String(hit.name) : "";
}

/* ------------------------------------------ */
/*  Hauls                                     */
/* ------------------------------------------ */

/** Fill in a stored haul: what a trip found, waiting to be picked out (p.4, Step 3). */
export function normalizeHaul(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const worth = int(r.worth);
  return {
    id: String(r.id ?? "").slice(0, 32),
    era: ERAS.includes(String(r.era)) ? String(r.era) : "2045",
    location: String(r.location ?? ""),
    category: CATEGORIES.includes(r.category) ? r.category : "gear",
    worth,
    spent: int(r.spent, 0, worth),
    taken: Array.isArray(r.taken) ? r.taken.map((t) => ({ name: String(t?.name ?? ""), eb: int(t?.eb) })).slice(0, 100) : [],
    at: Number(r.at) || 0
  };
}

/** What's left of a haul to pick out. */
export const haulLeft = (h) => Math.max(0, h.worth - h.spent);
