/**
 * Maintenance, malfunctions and resale from R. Talsorian's Breaking Your Stuff DLC (v1.1).
 * Pure: no Foundry calls.
 *
 * Gear is maintained as part of your Lifestyle when the Lifestyle is good enough for its cost;
 * anything pricier needs a maintenance Check once a month (from Neon Hub's Rent Day, or a cycle the
 * GM runs). Some Roles count their Lifestyle a level higher for the gear of their trade. Damaged
 * gear can malfunction; each kind of gear has its own 1d6 table.
 *
 * The malfunction text here is a short summary written for this module, with the DLC's page; the
 * full text is in the DLC. GMs can import the module's Malfunction Tables compendium and edit the
 * world copies, which are used instead.
 */
import { int, str, idOf, isLifestyle } from "./util.js";
import { itemFlag } from "./item-flag.js";
import { itemStates } from "./condition.js";

/* ------------------------------------------ */
/*  Lifestyle tiers (Maintenance Basics, p.5) */
/* ------------------------------------------ */

/**
 * The rent month a date falls in, as Neon Hub counts them (year * 12 + month - 1): a month starts on
 * its Rent Day, so with rent on the 15th, 10 March is still in February's month. A Rent Day past the
 * end of a short month falls on its last day.
 */
export function rentPeriod(date, rentDay = 1) {
  const year = Math.trunc(Number(date?.year) || 0);
  const month = Math.min(12, Math.max(1, Math.trunc(Number(date?.month) || 1)));
  const day = Math.trunc(Number(date?.day) || 1);
  const due = Math.min(Math.max(1, Math.trunc(Number(rentDay)) || 1), daysInMonth(year, month));
  const index = year * 12 + (month - 1);
  return day >= due ? index : index - 1;
}

/** Days in a month of the Gregorian calendar Neon Hub uses. */
function daysInMonth(year, month) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** { year, month } of a rent month number. */
export function rentMonth(period) {
  const year = Math.floor(period / 12);
  return { year, month: period - year * 12 + 1 };
}

/** Kibble, Generic Prepak, Good Prepak, Fresh Food: Neon Hub's package tiers 1-4 in both eras. */
export const LIFESTYLES = ["none", "kibble", "generic", "good", "fresh"];

/** By tier (1-4): the gear value it starts at, the maintenance DV and how long it takes. */
export const TIERS = [
  null,
  { gear: 0, vehicle: 0, dv: 13, time: "30m" },
  { gear: 500, vehicle: 20000, dv: 15, time: "1h" },
  { gear: 1000, vehicle: 50000, dv: 17, time: "3h" },
  { gear: 5000, vehicle: 100000, dv: 21, time: "1d" }
];

/** The tier a piece of gear needs: its value against the table (drones and vehicles have their own). */
export function tierOf(price, vehicleLike = false) {
  const p = Math.max(0, Number(price) || 0);
  let tier = 1;
  for (let t = 1; t < TIERS.length; t++) if (p >= TIERS[t][vehicleLike ? "vehicle" : "gear"]) tier = t;
  return tier;
}

/**
 * A character's Lifestyle tier (0-4).
 * Neon Hub's active lifestyle package wins (its tier is the same scale in the 2045 and 2070 eras);
 * otherwise Cyberpunk RED's own Lifestyle field, by name, then by monthly cost.
 */
export function lifestyleTier(items, system = {}, hubId = "cpr-neon-hub") {
  let best = -1;
  for (const i of items) {
    const ls = i.flags?.[hubId]?.lifestyle;
    if (ls?.category === "lifestyle" && i.system?.equipped === "equipped") best = Math.max(best, int(ls.tier, 0, 4));
  }
  if (best >= 0) return best;
  const ls = system?.lifestyle?.lifeStyle ?? {};
  const name = String(ls.description ?? "").toLowerCase();
  if (/fresh/.test(name)) return 4;
  if (/good/.test(name)) return 3;
  if (/generic/.test(name)) return 2;
  if (/kibble/.test(name)) return 1;
  const cost = Number(ls.cost) || 0;
  if (cost >= 1500) return 4;
  if (cost >= 600) return 3;
  if (cost >= 300) return 2;
  return cost > 0 ? 1 : 0;
}

/* ------------------------------------------ */
/*  Kinds of gear (Maintenance Skills, p.4)   */
/* ------------------------------------------ */

/** What a piece of gear is for maintenance: the skill that maintains it, and its value scale. */
export const KINDS = {
  armor: { skill: "Basic Tech" },
  cyberdeck: { skill: "Electronics/Security Tech" },
  cyberware: { skill: "Cybertech" },
  drone: { skill: "Electronics/Security Tech", vehicle: true },
  gear: { skill: "Basic Tech" },
  electronics: { skill: "Electronics/Security Tech" },
  vehicleAir: { skill: "Air Vehicle Tech", vehicle: true },
  vehicleLand: { skill: "Land Vehicle Tech", vehicle: true },
  vehicleSea: { skill: "Sea Vehicle Tech", vehicle: true },
  weapon: { skill: "Weaponstech" }
};

/** Item types that are never maintained. */
const NOT_GEAR = ["ammo", "drug", "program", "netarch", "criticalInjury", "role", "skill"];

/** Does this item need looking after at all? */
export function isMaintainable(item) {
  if (!item || NOT_GEAR.includes(item.type) || isLifestyle(item)) return false;
  // the system's built-in Internal, External and Fashionware containers aren't gear
  if (item.type === "cyberware" && item.system?.core) return false;
  return true;
}

const name = (item) => String(item?.name ?? "").toLowerCase();

function vehicleKind(item) {
  const n = name(item);
  if (/\b(av|aerodyne|aerozep|heli|helicopter|gyro|plane|jet|vtol|airship|zeppelin)\b/.test(n)) return "vehicleAir";
  if (/\b(boat|ship|yacht|jetski|jet ski|sub|submarine|hovercraft|speedboat|sea)\b/.test(n)) return "vehicleSea";
  return "vehicleLand";
}

/** The maintenance kind of an item (the GM can override it per item). */
export function kindOf(item, moduleId) {
  const override = itemFlag(item, moduleId).maint.kind;
  if (KINDS[override]) return override;
  const s = item.system ?? {};
  switch (item.type) {
    case "weapon": return "weapon";
    case "armor": return "armor";
    case "cyberdeck": return "cyberdeck";
    case "cyberware": return "cyberware";
    case "vehicle": return vehicleKind(item);
    case "itemUpgrade":
      if (s.type === "weapon") return "weapon";
      if (s.type === "armor") return "armor";
      if (s.type === "cyberdeck") return "cyberdeck";
      if (s.type === "cyberware") return "cyberware";
      if (s.type === "vehicle") return "vehicleLand";
      return "gear";
    default:
      if (/\bdrone\b/.test(name(item))) return "drone";
      return s.isElectronic ? "electronics" : "gear";
  }
}

/* ------------------------------------------ */
/*  Roles and Maintenance (p.4)               */
/* ------------------------------------------ */

/** The role names a character has (lowercase), from their role items. */
export function rolesOf(items) {
  return items.filter((i) => i.type === "role").map((i) => name(i).trim());
}

/**
 * Roles that count their Lifestyle a level higher for some gear: Techs for anything, Solos and
 * Lawmen for weapons and armor, Netrunners for cyberdecks, bodyweight suits and VR goggles, Medias
 * for cameras and microphones, Rockerboys for instruments, microphones and amps.
 * @returns {string|null} the role that gives the bonus
 */
export function roleBonus(roles, kind, item) {
  const n = name(item);
  const has = (r) => roles.includes(r);
  if (has("tech")) return "tech";
  if ((has("solo") || has("lawman")) && (kind === "weapon" || kind === "armor")) return has("solo") ? "solo" : "lawman";
  if (has("netrunner") && (kind === "cyberdeck" || /bodyweight|virtuality|\bvr\b/.test(n))) return "netrunner";
  if (has("media") && /camera|microphone|\bmic\b|recorder|audio ?link|scrambler/.test(n)) return "media";
  if (has("rockerboy") && /instrument|guitar|\bbass\b|drum|keyboard|synth|\bamps?\b|amplifier|microphone|\bmic\b/.test(n)) return "rockerboy";
  return null;
}

/* ------------------------------------------ */
/*  Worth (p.3)                               */
/* ------------------------------------------ */

/** Cyberpunk RED's price categories. */
export const PRICE_CATEGORIES = [
  { key: "cheap", eb: 10 },
  { key: "everyday", eb: 20 },
  { key: "costly", eb: 50 },
  { key: "premium", eb: 100 },
  { key: "expensive", eb: 500 },
  { key: "veryExpensive", eb: 1000 },
  { key: "luxury", eb: 5000 },
  { key: "superLuxury", eb: 10000 }
];

/** The price category of a cost (the dearest one it reaches), as an index, or -1 for free. */
export function priceCategory(price) {
  const p = Number(price) || 0;
  let at = -1;
  PRICE_CATEGORIES.forEach((c, i) => {
    if (p >= c.eb) at = i;
  });
  return at;
}

/**
 * What a buyer who knows its condition pays: Damaged sells a category lower, Destroyed two lower
 * (to the few Fixers who'll take it), Destroyed Beyond Repair is worthless. The same goes for a
 * Tech breaking it down for materials.
 * @returns {{eb: number, category: string|null, drop: number}}
 */
export function worth(price, condition) {
  const drop = { damaged: 1, destroyed: 2, dbr: 99 }[condition] ?? 0;
  const at = priceCategory(price);
  if (!drop) return { eb: Number(price) || 0, category: at >= 0 ? PRICE_CATEGORIES[at].key : null, drop };
  const to = at - drop;
  if (at < 0 || to < 0) return { eb: 0, category: null, drop };
  return { eb: PRICE_CATEGORIES[to].eb, category: PRICE_CATEGORIES[to].key, drop };
}

/* ------------------------------------------ */
/*  Malfunctions (pp.6-10)                    */
/* ------------------------------------------ */

/** How long malfunctions last, in seconds (null: no set time). */
export const DURATIONS = { round: 3, minute: 60, hour: 3600, day: 86400, use: null, now: null };

/**
 * The malfunction tables: [summary, duration, action?] for 1-6. Actions are things Neon At Home can
 * do for the GM from the chat card: drop the item, empty its magazine, mark it Destroyed or
 * Destroyed Beyond Repair, or miss its next maintenance.
 */
export const MALFUNCTIONS = {
  armor: {
    page: 6,
    results: [
      ["Soft plates: each time the armor is ablated it loses 1 more SP.", "day"],
      ["Frayed straps: a Critical Injury where it's worn makes it fall off.", "day"],
      ["Stretched weave: every hit that lands deals 1 damage straight to HP and ablates it by 1, even if it didn't beat the SP.", "day"],
      ["Off balance: its Armor Penalty goes up by 1, even from 0.", "day"],
      ["Shifting plates: its SP is halved against firearms and explosives.", "minute"],
      ["Hidden flaw: the first time it's ablated it loses 2 more SP.", "day"]
    ]
  },
  cyberdeck: {
    page: 7,
    results: [
      ["Misread data: choose a program that gives an Interface bonus; its next use gives that much as a penalty instead.", "use"],
      ["Feedback: the next time you Jack Out, a random program on the deck is Destroyed.", "use"],
      ["Surge: a random Black ICE on the deck attacks you instead for 1 Round after it rezzes; with no Black ICE, a random program stops working for 1 minute.", "minute"],
      ["Loose port: the next time you take damage in a NET Architecture, make a DV15 Electronics/Security Tech Check or be unsafely Jacked Out.", "use"],
      ["Phantom error: the next time you Jack In, the deck beeps loudly for 1 minute unless it's Destroyed.", "use"],
      ["Not optimized: for 1 minute after Jacking In, 1 less NET Action (minimum 1), even if you Jack Out and back in.", "minute"]
    ]
  },
  cyberlimb: {
    page: 7,
    results: [
      ["Dead option: one of the limb's options is switched off and can't be used; one already deployed (a Popup Weapon) can't be retracted.", "minute"],
      ["Nervous tic: the limb gives your intentions away: -2 to Social Skill Checks.", "minute"],
      ["Motion glitch: make a DV15 Concentration Check or drop a held item (cyberarm) or fall prone (cyberleg).", "now", "drop"],
      ["Microfractures: a Critical Success on a Check made with the limb gives you the Torn Muscle Critical Injury.", "hour"],
      ["Too much force: the limb lashes out at the nearest target, as a Brawling Attack.", "now"],
      ["Locking joints: a cyberarm can't pick up or drop anything; a cyberleg gives -1 MOVE (minimum 1).", "minute"]
    ]
  },
  cyberSenses: {
    page: 7,
    results: [
      ["Junk data: -1 to Checks that need sight (cyberoptics) or hearing (cyberaudio), until you spend an Action clearing it.", "minute"],
      ["Warped perception: -1 to Checks involving spatial awareness (cyberoptics) or balance (cyberaudio).", "minute"],
      ["Lost definition: you see only in black and white or one colour (cyberoptics), or hear a constant ringing (cyberaudio).", "hour"],
      ["Worn circuit: no wireless connection to anything but its installed options (Agents, Chipware Sockets, linked tracers...).", "hour"],
      ["Rogue option: a switched-off option turns on and can't be shut off: -2 to Checks that need sight or hearing.", "round"],
      ["No faces, no voices: you can't recognise anyone by their face (cyberoptics) or voice (cyberaudio).", "hour"]
    ]
  },
  cyberBody: {
    page: 8,
    results: [
      ["Chemical leak: nausea, -2 to Resist Torture/Drugs Checks.", "day"],
      ["Overheat: 5 damage straight to HP; armor doesn't stop it.", "now"],
      ["Buzz and stink: no Wardrobe & Style or Personal Grooming bonuses, and -2 to Social Skill Checks.", "hour"],
      ["Stinging pain: before each Check, succeed at a DV13 Concentration Check or that Check fails.", "round"],
      ["Glitch: Grafted Muscle and Bone Lace still work but give +1 to Death Saves; cyberware armor can't repair itself; anything else shuts down and can't be used.", "day"],
      ["Infection: a Critical Injury to the part of the body with the cyberware deals 5 more bonus damage.", "day"]
    ]
  },
  neuralware: {
    page: 8,
    results: [
      ["Junk data: -4 to Concentration Checks.", "day"],
      ["Power surge: a random Neuralware option switches on or off; switching it back takes an Action.", "now"],
      ["Skull pain: before each Check, succeed at a DV13 Concentration Check or that Check fails.", "round"],
      ["Intoxicated: -2 to all Checks.", "minute"],
      ["Fog: -1 to INT-based Skill Checks.", "hour"],
      ["Scrambled speech: you can only speak gibberish.", "minute"]
    ]
  },
  drone: {
    page: 8,
    results: [
      ["Friend or foe: its next Attack targets you or an ally.", "use"],
      ["Really friend or foe: it sees every target as friendly or hostile (the GM's choice).", "hour"],
      ["Short leash: it can't go more than 2 m/yds from its controlling signal or it shuts down.", "hour"],
      ["Backdoor: countering it with Electronics/Security Tech takes 1 Action instead of 5 minutes.", "day"],
      ["Comms fault: one of its options stops working.", "minute"],
      ["Seizing up: its MOVE is halved (round up).", "hour"]
    ]
  },
  general: {
    page: 9,
    results: [
      ["Poor function: no bonuses from it, and -1 to Checks made with it.", "day"],
      ["Bites back: it hurts you: 5 damage straight to HP.", "now"],
      ["Last legs: it's Destroyed after its next use.", "use", "destroy"],
      ["Worse than nothing: no bonuses from it, and -2 to Checks made with it.", "minute"],
      ["Something's wrong: one function of the GM's choice doesn't work.", "hour"],
      ["Hard to spot: next month it isn't maintained, even if Lifestyle or a Check would cover it.", "now", "missCycle"]
    ]
  },
  linearFrame: {
    page: 9,
    results: [
      ["Out of sync: after each Move Action the GM shifts you 2 m/yds (1 square) left or right.", "minute"],
      ["Short circuit: 5 damage straight to HP; armor doesn't stop it.", "now"],
      ["Motor glitch: a linear frame doesn't boost BODY (HP, Seriously Wounded and Death Save stay as they are); a cyberchair gives -1 MOVE.", "hour"],
      ["Seized joints: -1 to DEX- and REF-based Skill Checks.", "minute"],
      ["Knocking piston: -2 to Stealth unless you stay completely still.", "hour"],
      ["Fluid leak: an internal frame makes you nauseous (-2 to Resist Torture/Drugs); an external frame or cyberchair leaves a foul trail.", "day"]
    ]
  },
  vehicle: {
    page: 9,
    results: [
      ["Won't start: every start needs a DV15 Vehicle Tech Check, or it fails and the Action is wasted.", "day"],
      ["Chaos: radio, lights, horn, wipers and other extras switch on at random.", "minute"],
      ["Smoking engine: Combat and Narrative speed are halved (round up).", "hour"],
      ["Stalling: the GM can call for a DV15 Vehicle Tech Check; on a failure it stalls and takes an Action to restart.", "day"],
      ["Stiff controls: -2 to Checks to drive or pilot it.", "hour"],
      ["Brittle frame: attacks on it deal double damage, as if they hit a weak spot.", "hour"]
    ]
  },
  weapon: {
    page: 10,
    results: [
      ["Dirty barrel or dull edge: it deals 1d6 less damage.", "minute"],
      ["Accident: ranged, the next Attack targets an ally within 6 m/yds of the target; melee, it slips and you drop it; a thrown explosive lands at your feet and goes off.", "now", "drop"],
      ["Off target: -2 to the next Attack Check with it.", "use"],
      ["Gunked up: it can't cause a Critical Injury through its damage roll.", "minute"],
      ["Jam: it jams after the next Attack Check, whatever its Quality; a thrown explosive lands without going off (it can be picked up again).", "use"],
      ["Neglected parts: a firearm's loaded ammunition is Destroyed Beyond Repair; a melee weapon or bow is Poor Quality (already Poor: Destroyed for 1 minute); a thrown explosive fizzles and is Destroyed Beyond Repair.", "minute", "emptyMag"]
    ]
  }
};

/** Table keys, in the order the DLC lists them. */
export const TABLE_KEYS = Object.keys(MALFUNCTIONS);

/** The malfunction table for an item (the GM can override it per item). */
export function tableOf(item, moduleId) {
  const override = itemFlag(item, moduleId).maint.table;
  if (MALFUNCTIONS[override]) return override;
  const s = item.system ?? {};
  const n = name(item);
  switch (item.type) {
    case "weapon": return "weapon";
    case "armor": return "armor";
    case "cyberdeck": return "cyberdeck";
    case "vehicle": return "vehicle";
    case "cyberware":
      switch (s.type) {
        case "cyberArm":
        case "cyberLeg": return "cyberlimb";
        case "cyberEye":
        case "cyberAudioSuite": return "cyberSenses";
        case "neuralWare": return "neuralware";
        case "cyberwareInternal":
        case "cyberwareExternal":
        case "fashionware": return "cyberBody";
        case "borgware":
          if (/linear frame/.test(n)) return "linearFrame";
          if (/optic|audio|sensor|eye|ear/.test(n)) return "cyberSenses";
          return "cyberlimb";
        default: return "cyberBody";
      }
    case "itemUpgrade":
      if (s.type === "weapon") return "weapon";
      if (s.type === "armor") return "armor";
      if (s.type === "cyberdeck") return "cyberdeck";
      if (s.type === "vehicle") return "vehicle";
      return "general";
    default:
      if (/cyberchair/.test(n)) return "linearFrame";
      if (/\bdrone\b/.test(n)) return "drone";
      return "general";
  }
}

/** One result of a table: { text, duration, action } (1-6). */
export function malfunctionResult(table, roll) {
  const t = MALFUNCTIONS[table];
  const r = t?.results[int(roll, 1, 6) - 1];
  if (!r) return null;
  return { text: r[0], duration: r[1], action: r[2] ?? null, page: t.page };
}

/** Is a malfunction still going? Expired when world time passes its end; jury-rigged while the rig holds. */
export function malfunctionState(m, now = 0) {
  if (!m) return null;
  if (m.until !== null && now >= m.until) return null;
  return { ...m, rigged: m.rigUntil !== null && now < m.rigUntil };
}

/* ------------------------------------------ */
/*  A character's maintenance                 */
/* ------------------------------------------ */

/**
 * Where a piece of gear stands this cycle.
 * @param {object} cycle - the character's current cycle { scheme, n } (see item-flag.js cycleRef)
 * @returns {{status: "exempt"|"covered"|"maintained"|"due", missed: number}}
 *   missed: whole cycles since it was last maintained (0 when that isn't known, or was counted
 *   another way, e.g. before the world started following Neon Hub's Rent Day)
 */
export function maintenanceStatus(flag, { cycle, covered }) {
  if (flag.maint.exempt) return { status: "exempt", missed: 0 };
  const same = (ref) => !!ref && !!cycle && ref.scheme === cycle.scheme;
  const blocked = same(flag.missCycle) && flag.missCycle.n === cycle.n;
  if (covered && !blocked) return { status: "covered", missed: 0 };
  if (same(flag.maintained) && flag.maintained.n >= cycle.n) return { status: "maintained", missed: 0 };
  return { status: "due", missed: same(flag.maintained) ? Math.max(0, cycle.n - flag.maintained.n - 1) : 0 };
}

/**
 * Everything a character owns that needs looking after, as trees (a weapon with its attachments,
 * a cyberarm with its options), with what each needs and where it stands.
 * @param {object[]} items - the character's items (documents or data)
 * @param {object} opts - { moduleId, cycle ({ scheme, n }), lifestyle (0-4), roles (lowercase names), now (world time) }
 */
export function maintenanceList(items, { moduleId, cycle = { scheme: "own", n: 1 }, lifestyle = 0, roles = [], now = 0 } = {}) {
  const states = itemStates(items, moduleId);
  const byId = new Map(items.map((i) => [idOf(i), i]));
  const entry = (item) => {
    const id = idOf(item);
    const flag = itemFlag(item, moduleId);
    const kind = kindOf(item, moduleId);
    const k = KINDS[kind];
    const price = Number(item.system?.price?.market) || 0;
    const tier = tierOf(price, !!k.vehicle);
    const bonus = roleBonus(roles, kind, item);
    const effective = Math.min(4, lifestyle + (bonus ? 1 : 0));
    const covered = effective >= tier;
    const st = states.get(id);
    const children = (item.system?.installedItems?.list ?? [])
      .map((cid) => byId.get(cid))
      .filter((c) => c && isMaintainable(c))
      .map(entry);
    return {
      id,
      name: String(item.name ?? ""),
      img: item.img ?? "",
      type: item.type,
      kind,
      skill: k.skill,
      price,
      tier,
      dv: TIERS[tier].dv,
      time: TIERS[tier].time,
      roleBonus: bonus,
      covered,
      ...maintenanceStatus(flag, { cycle, covered }),
      condition: flag.condition,
      hidden: flag.hidden,
      cause: flag.cause,
      emp: flag.emp,
      state: st?.state ?? "",
      inherited: !!st?.inherited,
      table: tableOf(item, moduleId),
      malfunction: malfunctionState(flag.malfunction, now),
      exempt: flag.maint.exempt,
      worth: worth(price, flag.condition),
      equipped: item.system?.equipped ?? "",
      electronic: !!item.system?.isElectronic || item.type === "cyberware" || item.type === "cyberdeck",
      children
    };
  };
  // Top level: what isn't installed in other gear (cyberware options in the body's built-in
  // Internal, External and Fashionware containers are top level, as those aren't gear).
  const parentOf = new Map();
  for (const i of items) for (const cid of i.system?.installedItems?.list ?? []) parentOf.set(cid, byId.get(idOf(i)));
  return items.filter((i) => isMaintainable(i) && !isMaintainable(parentOf.get(idOf(i)))).map(entry);
}

/** Every entry in a list of trees, depth first, with its depth. */
export function flattenList(list, depth = 0) {
  return list.flatMap((e) => [{ ...e, depth }, ...flattenList(e.children, depth + 1)]);
}

/** Group keys of the Maintenance tab, in order. */
export const GROUPS = ["weapon", "armor", "cyberware", "cyberdeck", "electronics", "gear", "drone", "vehicle"];
export const groupOf = (kind) => (kind.startsWith("vehicle") ? "vehicle" : kind);

/** Tally a character's gear. */
export function tally(list) {
  const all = flattenList(list);
  const count = (fn) => all.filter(fn).length;
  return {
    total: all.length,
    covered: count((e) => e.status === "covered" || e.status === "exempt"),
    maintained: count((e) => e.status === "maintained"),
    due: count((e) => e.status === "due"),
    damaged: count((e) => e.condition === "damaged"),
    destroyed: count((e) => e.condition === "destroyed" || e.condition === "dbr"),
    malfunctioning: count((e) => !!e.malfunction)
  };
}

/** The Field Expertise rank of a Tech (0 if none): the role ability on a Tech role item. */
export function fieldExpertise(items) {
  let rank = 0;
  for (const r of items) {
    if (r.type !== "role") continue;
    for (const a of r.system?.abilities ?? []) if (/field expertise/i.test(str(a?.name))) rank = Math.max(rank, int(a.rank));
  }
  return rank;
}
