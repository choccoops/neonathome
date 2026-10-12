/**
 * Carry slots, from the Armor & Carrying 2.0 homebrew.
 *
 * The armor worn on the body sets how many carry slots a character has; what they carry costs slots
 * by kind (two-handed weapons 3, one-handed 2, ammo and utility gear 1, heavy weapons and machine
 * guns 4). Worn carry gear (holsters, slings, bags) and armor upgrades (ammo and gear bags) add
 * slots, some only for certain things. Armor also has upgrade slots by class.
 *
 * Everything here is pure (no Foundry calls) so it can be unit tested. Items are read as documents
 * or plain data with { id|_id, name, type, img, system, flags }.
 */
import { int, idOf, isLifestyle } from "./util.js";
import { ARMOR_CLASSES, ACCEPT_TAGS, normalizeItemFlag, itemFlag } from "./item-flag.js";

/** The spreadsheet's numbers; the GM can change them in the module settings. */
export const DEFAULT_CARRY_RULES = {
  enabled: true,
  classes: {
    unarmored: { carry: 10, upgrades: 0 },
    light: { carry: 15, upgrades: 4 },
    medium: { carry: 21, upgrades: 5 },
    heavy: { carry: 25, upgrades: 6 },
    flak: { carry: 30, upgrades: 8 },
    metalgear: { carry: 42, upgrades: 10 },
    acpa: { carry: 42, upgrades: 0 }
  },
  shieldUpgrades: 4,
  costs: { heavy: 4, twoHanded: 3, oneHanded: 2, ammo: 1, utility: 1, bulky: 3 },
  // Items marked "owned" on the sheet aren't on the character (left at home, in a car...).
  ownedCounts: false
};

export const COST_KEYS = Object.keys(DEFAULT_CARRY_RULES.costs);

/** Clamp the GM's carry rules into a trusted shape, filling anything missing from the defaults. */
export function normalizeCarryRules(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_CARRY_RULES;
  const classes = {};
  for (const cls of ARMOR_CLASSES) {
    const c = r.classes?.[cls] ?? {};
    classes[cls] = { carry: int(c.carry ?? d.classes[cls].carry, 0, 999), upgrades: int(c.upgrades ?? d.classes[cls].upgrades, 0, 99) };
  }
  const costs = {};
  for (const k of COST_KEYS) costs[k] = int(r.costs?.[k] ?? d.costs[k], 0, 99);
  return {
    enabled: r.enabled === undefined ? d.enabled : !!r.enabled,
    classes,
    shieldUpgrades: int(r.shieldUpgrades ?? d.shieldUpgrades, 0, 99),
    costs,
    ownedCounts: r.ownedCounts === undefined ? d.ownedCounts : !!r.ownedCounts
  };
}

/* ------------------------------------------ */
/*  Armor                                     */
/* ------------------------------------------ */

const PISTOLS = ["medPistol", "heavyPistol", "vHeavyPistol"];
const PISTOL_AMMO = ["medPistol", "heavyPistol", "vHeavyPistol"];
const HEAVY_TYPES = ["rocketLauncher", "grenadeLauncher"];
const NO_ITEM_WEAPONS = ["unarmed", "martialArts"];
/** Types that are never carried in slots: rules data, or things that live elsewhere. */
const NON_PHYSICAL = new Set(["criticalInjury", "netarch", "role", "skill", "program", "vehicle"]);
const EQUIPPABLE = new Set(["armor", "clothing", "cyberdeck", "drug", "gear", "weapon"]);

/** Which armor class a name points to, if any. */
export function classFromName(name) {
  const n = String(name ?? "").toLowerCase();
  if (/metal\s*gear/.test(n)) return "metalgear";
  if (/\bflak\b/.test(n)) return "flak";
  if (/heavy\s+armou?rjack/.test(n)) return "heavy";
  if (/medium\s+armou?rjack/.test(n)) return "medium";
  if (/light\s+armou?rjack|bodyweight/.test(n)) return "light";
  if (/\bacpa\b|powered\s+armou?r/.test(n)) return "acpa";
  if (/mimic|leathers|kevlar|unarmou?red/.test(n)) return "unarmored";
  return "";
}

/** Armor class by stopping power, for armor the GM hasn't classed and whose name doesn't say. */
export function classFromSP(sp) {
  const v = int(sp, 0, 99);
  if (v <= 7) return "unarmored";
  if (v <= 11) return "light";
  if (v <= 12) return "medium";
  if (v <= 14) return "heavy";
  if (v <= 17) return "flak";
  return "metalgear";
}

/**
 * An armor item as the Loadout sees it.
 * @returns {{id, name, img, location: "body"|"head"|"shield", cls, sp, penalty, worn, upgradeSlots, flag}}
 */
export function describeArmor(item, moduleId, rules) {
  const s = item.system ?? {};
  const flag = itemFlag(item, moduleId);
  const location = s.isShield ? "shield" : s.isBodyLocation ? "body" : s.isHeadLocation ? "head" : "body";
  const sp = location === "head" ? int(s.headLocation?.sp) : location === "body" ? int(s.bodyLocation?.sp) : int(s.shieldHitPoints?.max);
  const cls = location === "shield" ? "shield" : flag.armorClass || classFromName(item.name) || classFromSP(sp);
  const upgradeSlots = cls === "shield" ? rules.shieldUpgrades : rules.classes[cls]?.upgrades ?? 0;
  return {
    id: idOf(item),
    name: String(item.name ?? ""),
    img: item.img ?? "",
    location,
    cls,
    sp,
    ablation: location === "head" ? int(s.headLocation?.ablation) : location === "body" ? int(s.bodyLocation?.ablation) : 0,
    penalty: Math.abs(Number(s.penalty) || 0),
    worn: s.equipped === "equipped",
    upgradeSlots,
    flag
  };
}

/* ------------------------------------------ */
/*  Items                                     */
/* ------------------------------------------ */

/** Is the item on the character's person (as opposed to owned but left somewhere)? */
export function onPerson(item, rules) {
  if (NON_PHYSICAL.has(item.type) || isLifestyle(item)) return false;
  if (!EQUIPPABLE.has(item.type)) return true;
  const eq = item.system?.equipped ?? "owned";
  return eq !== "owned" || rules.ownedCounts;
}

/** Carry gear: an item whose flag gives carry pools or concealment. */
export function isCarryGear(flag) {
  return flag.carry.pools.length > 0 || flag.carry.conceals > 0 || !!flag.carry.group;
}

/**
 * The default slot category of an item, before any flag override.
 * @param {object} item
 * @param {object} ctx - { installed: Set<id> } ids installed in another item or in the actor
 */
export function defaultCategory(item, ctx = {}) {
  const s = item.system ?? {};
  const id = idOf(item);
  if (NON_PHYSICAL.has(item.type) || isLifestyle(item)) return "none";
  if (item.type === "ammo") return int(s.amount) > 0 ? "ammo" : "none";
  if (ctx.installed?.has(id)) return "none";
  switch (item.type) {
    case "weapon": {
      if (NO_ITEM_WEAPONS.includes(s.weaponType)) return "none";
      if (HEAVY_TYPES.includes(s.weaponType) || /heavy weapons/i.test(s.weaponSkill ?? "")) return "heavy";
      if (s.weaponType === "thrownWeapon") return "utility";
      return int(s.handsReq, 0, 9) >= 2 ? "twoHanded" : "oneHanded";
    }
    case "armor":
      return s.equipped === "equipped" ? "none" : "bulky";
    case "clothing":
      return s.equipped === "equipped" ? "none" : "utility";
    case "cyberware":
      // Loose cyberware (not installed) is carried like gear.
      return "utility";
    default:
      return "utility";
  }
}

/** Tags a carry pool can match an item on. */
export function itemTags(item, category) {
  const s = item.system ?? {};
  const tags = new Set([category]);
  if (item.type === "weapon") {
    tags.add("weapon");
    if (PISTOLS.includes(s.weaponType)) tags.add("pistol");
  }
  if (item.type === "ammo" && PISTOL_AMMO.includes(s.variety)) tags.add("pistolAmmo");
  return tags;
}

/**
 * One item's carry cost.
 * @returns {{id, name, img, type, equipped, category, cost, tags: string[], counts: boolean, worn: boolean, flag}}
 */
export function describeCarry(item, moduleId, rules, ctx = {}) {
  const flag = itemFlag(item, moduleId);
  const s = item.system ?? {};
  const person = onPerson(item, rules);
  const equipped = s.equipped ?? null;
  // Worn carry gear (holster, sling, coat, bag) gives slots instead of taking them.
  const wornGear = isCarryGear(flag) && equipped === "equipped";
  let category = flag.category || defaultCategory(item, ctx);
  if (wornGear || (item.type === "armor" && equipped === "equipped")) category = "none";
  if (!person) category = "none";
  const cost = category === "none" ? 0 : flag.slots ?? rules.costs[category] ?? 0;
  return {
    id: idOf(item),
    name: String(item.name ?? ""),
    img: item.img ?? "",
    type: item.type,
    equipped,
    amount: int(s.amount ?? 1, 0),
    category,
    cost,
    tags: [...itemTags(item, category)],
    counts: person && cost > 0,
    onPerson: person,
    worn: wornGear || (equipped === "equipped" && ["armor", "clothing"].includes(item.type)),
    flag
  };
}

/** The one piece of cyberware that holds things: the Subdermal Pocket (found by name). */
export const isSubdermalPocket = (item) => item?.type === "cyberware" && /\bsubdermal\s+pocket\b/i.test(String(item.name ?? ""));

/** What an installed Subdermal Pocket holds by default: 2 slots for gear or a one-handed weapon. */
export const POCKET_POOLS = [{ slots: 2, accepts: "pocket", label: "" }];

/**
 * The carry pools an installed piece of cyberware gives. Only the Subdermal Pocket gives any; the
 * GM can change a pocket's slots in its item settings. Other cyberware never does.
 */
export function cyberwarePools(item, flag) {
  if (!isSubdermalPocket(item)) return [];
  return flag.carry.pools.length ? flag.carry.pools : POCKET_POOLS;
}

/** Does a pool take an item with these tags? */
export function poolAccepts(pool, tags) {
  if (pool.accepts === "any") return true;
  return (ACCEPT_TAGS[pool.accepts] ?? [pool.accepts]).some((t) => tags.includes(t));
}

/* ------------------------------------------ */
/*  The whole loadout                         */
/* ------------------------------------------ */

/**
 * Work out carry slots for a character.
 * @param {object[]} items - every item on the actor (documents or plain data)
 * @param {object} rules - normalized carry rules
 * @param {string} moduleId
 * @param {object} [opts]
 * @param {string[]} [opts.actorInstalled] - ids installed in the actor itself (CPR keeps cyberware
 *   installed in the body on the actor's own installedItems list, not inside another item)
 * @returns {object} { armorClass, body, base, bonuses, capacity, used, free, over, pools, items, armors, warnings }
 */
export function computeLoadout(items, rules, moduleId, { actorInstalled = [] } = {}) {
  const byId = new Map(items.map((i) => [idOf(i), i]));
  const installed = new Set(actorInstalled);
  const installedIn = new Map();
  for (const item of items) {
    for (const id of item.system?.installedItems?.list ?? []) {
      installed.add(id);
      if (!installedIn.has(id)) installedIn.set(id, idOf(item));
    }
  }
  const ctx = { installed };

  // Armor worn, and the class that sets the carry slots: the best worn body armor.
  const armors = items.filter((i) => i.type === "armor").map((i) => describeArmor(i, moduleId, rules));
  for (const a of armors) {
    const doc = byId.get(a.id);
    a.upgrades = (doc.system?.installedItems?.list ?? []).map((id) => byId.get(id)).filter((u) => u?.type === "itemUpgrade")
      .map((u) => ({ id: idOf(u), name: u.name, img: u.img, size: int(u.system?.size ?? 1), flag: normalizeItemFlag(u.flags?.[moduleId]?.item) }));
    a.upgradesUsed = a.upgrades.reduce((n, u) => n + u.size, 0);
  }
  const wornBody = armors.filter((a) => a.worn && a.location === "body").sort((a, b) => (rules.classes[b.cls]?.carry ?? 0) - (rules.classes[a.cls]?.carry ?? 0));
  const body = wornBody[0] ?? null;
  const armorClass = body?.cls ?? "unarmored";
  const base = rules.classes[armorClass]?.carry ?? rules.classes.unarmored.carry;

  const described = items.map((i) => describeCarry(i, moduleId, rules, ctx));
  const warnings = [];
  const bonuses = [];
  const pools = [];

  // Worn carry gear: "any" pools add to the general slots, others are their own pools.
  const groupsTaken = new Set();
  for (const d of described) {
    if (!d.worn || !isCarryGear(d.flag)) continue;
    if (d.flag.carry.noArmor && armorClass !== "unarmored") {
      warnings.push({ key: "noArmor", name: d.name, id: d.id });
      continue;
    }
    if (d.flag.carry.group) {
      if (groupsTaken.has(d.flag.carry.group)) {
        warnings.push({ key: "group", name: d.name, id: d.id });
        continue;
      }
      groupsTaken.add(d.flag.carry.group);
    }
    d.flag.carry.pools.forEach((p, i) => addPool(p, d, `${d.id}-${i}`));
  }
  // Worn armor upgrades with pools (Ammo bag, Gear bag).
  for (const a of armors) {
    if (!a.worn) continue;
    for (const u of a.upgrades) u.flag.upgrade.pools.forEach((p, i) => addPool(p, u, `${u.id}-${i}`));
  }

  // Installed Subdermal Pockets: each one installed adds its own slots.
  const named = new Map();
  for (const item of items) {
    if (item.type !== "cyberware" || !installed.has(idOf(item))) continue;
    const list = cyberwarePools(item, normalizeItemFlag(item.flags?.[moduleId]?.item));
    if (!list.length) continue;
    // Number repeats: Subdermal Pocket, Subdermal Pocket 2...
    const n = (named.get(item.name) ?? 0) + 1;
    named.set(item.name, n);
    const name = n > 1 ? `${item.name} ${n}` : item.name;
    list.forEach((p, i) => addPool(p, { name, id: idOf(item) }, `${idOf(item)}-${i}`));
  }

  function addPool(p, source, id) {
    if (p.accepts === "any") bonuses.push({ name: source.name, slots: p.slots, id: source.id });
    else pools.push({ id, name: p.label || source.name, source: source.id, accepts: p.accepts, slots: p.slots, used: 0, items: [] });
  }

  const capacity = base + bonuses.reduce((n, b) => n + b.slots, 0);
  let used = 0;

  // Place items: the most specific pool with room first, else the general slots.
  const counted = described.filter((d) => d.counts).sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
  for (const d of counted) {
    const pool = pools
      .filter((p) => poolAccepts(p, d.tags) && p.slots - p.used >= d.cost)
      .sort((a, b) => (a.slots - a.used) - (b.slots - b.used))[0];
    if (pool) {
      pool.used += d.cost;
      pool.items.push(d.id);
      d.pool = pool.id;
    } else {
      used += d.cost;
      d.pool = "general";
    }
  }
  for (const d of described) if (!d.counts) d.pool = null;

  return {
    enabled: rules.enabled,
    armorClass,
    body: body?.id ?? null,
    base,
    bonuses,
    capacity,
    used,
    free: capacity - used,
    over: used > capacity,
    pools,
    items: described,
    armors,
    installedIn,
    warnings
  };
}

/**
 * Bonus slots that still have room but won't take this item (a Gear bag offered a pistol), so the
 * carry pop-up can say why they didn't help.
 * @param {object} carry - computeLoadout() result that includes the item
 * @returns {{name, free, accepts}[]}
 */
export function poolsThatWontTake(carry, itemId) {
  const d = carry.items.find((x) => x.id === itemId);
  if (!d) return [];
  return carry.pools
    .filter((p) => p.slots - p.used > 0 && !poolAccepts(p, d.tags))
    .map((p) => ({ name: p.name, free: p.slots - p.used, accepts: p.accepts }));
}

/**
 * Would adding this item (or changing it to this state) fit?
 * @returns {{fits: boolean, after: object}} the loadout after the change
 */
export function wouldFit(items, change, rules, moduleId, opts = {}) {
  const next = items.map((i) => (idOf(i) === change.id ? change.data : i));
  if (!items.some((i) => idOf(i) === change.id)) next.push(change.data);
  const after = computeLoadout(next, rules, moduleId, opts);
  const overPool = after.pools.some((p) => p.used > p.slots);
  return { fits: !after.over && !overPool, after };
}

/* ------------------------------------------ */
/*  Armor upgrades                            */
/* ------------------------------------------ */

/**
 * Can this upgrade go into this armor?
 * @param {object} armor - from describeArmor, with .upgrades and .upgradesUsed
 * @param {object} upgrade - the itemUpgrade (document or data)
 * @returns {{ok: boolean, reason: string}} reason: "type"|"location"|"class"|"requires"|"duplicate"|"slots"|""
 */
export function canInstallUpgrade(armor, upgrade, moduleId) {
  if (upgrade.type !== "itemUpgrade" || upgrade.system?.type !== "armor") return { ok: false, reason: "type" };
  const flag = itemFlag(upgrade, moduleId).upgrade;
  const loc = flag.location;
  const fitsLocation = loc === "any"
    || (loc === "both" && armor.location !== "shield")
    || loc === armor.location;
  if (!fitsLocation) return { ok: false, reason: "location" };
  if (flag.classes.length && armor.cls !== "shield" && !flag.classes.includes(armor.cls)) return { ok: false, reason: "class" };
  const keys = armor.upgrades.map((u) => u.flag.upgrade.key).filter(Boolean);
  if (flag.key && keys.includes(flag.key)) return { ok: false, reason: "duplicate" };
  if (flag.requires && !keys.includes(flag.requires)) return { ok: false, reason: "requires" };
  const size = int(upgrade.system?.size ?? 1);
  if (armor.upgradesUsed + size > armor.upgradeSlots) return { ok: false, reason: "slots" };
  return { ok: true, reason: "" };
}

const STAT_OF = { reliefDex: ["dex"], reliefRef: ["ref"], reliefMove: ["move"], reliefAll: ["dex", "ref", "move"] };

/**
 * What worn armor upgrades do to the wearer: Active Effect changes Neon At Home keeps on the actor,
 * and notes for the rest.
 * @param {object[]} armors - from computeLoadout().armors
 * @returns {{changes: {key, value, label}[], notes: {effect, name}[]}}
 */
export function armorEffects(armors) {
  const worn = armors.filter((a) => a.worn && a.location !== "shield");
  const changes = [];
  const notes = [];
  const has = (a, effect) => a.upgrades.some((u) => u.flag.upgrade.effects.includes(effect));
  const anyHas = (effect) => worn.find((a) => has(a, effect));
  const pairHas = (effect) => {
    const head = worn.find((a) => a.location === "head" && has(a, effect));
    const bodyA = worn.find((a) => a.location === "body" && has(a, effect));
    return head && bodyA ? [head, bodyA] : null;
  };

  // Penalty relief: CPR applies the worst worn armor penalty to REF, DEX and MOVE rolls.
  // Offsetting it on the stat cancels it out for every roll on that stat.
  const basePenalty = Math.max(0, ...worn.map((a) => a.penalty));
  for (const stat of ["dex", "ref", "move"]) {
    const relieved = (a) => a.upgrades.some((u) => u.flag.upgrade.effects.some((e) => STAT_OF[e]?.includes(stat)));
    if (!worn.some(relieved)) continue;
    const remaining = Math.max(0, ...worn.map((a) => (relieved(a) ? 0 : a.penalty)));
    const offset = basePenalty - remaining;
    if (!offset) continue;
    // MOVE also sets walking and running speed in CPR, which armor never reduced: note it only.
    if (stat === "move") notes.push({ effect: "reliefMove", value: offset });
    else changes.push({ key: `system.stats.${stat}.value`, value: offset, label: stat.toUpperCase() });
  }
  if (anyHas("stealth")) changes.push({ key: "bonuses.stealth", value: 2, label: "Stealth" });
  if (anyHas("aiInterface")) {
    changes.push({ key: "bonuses.concentration", value: 2, label: "Concentration" });
    notes.push({ effect: "aiInterface" });
  }
  if (pairHas("warPaint")) {
    changes.push({ key: "bonuses.wardrobeAndStyle", value: 2, label: "Wardrobe & Style" });
    notes.push({ effect: "warPaint" });
  }
  if (pairHas("enviro")) notes.push({ effect: "enviro" });
  if (pairHas("fireproof")) notes.push({ effect: "fireproof" });
  if (anyHas("neuroport")) notes.push({ effect: "neuroport" });
  return { changes, notes };
}
