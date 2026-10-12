/**
 * Weight: how much a character can carry (BODY x a multiplier, or a fixed number) and how much
 * what they carry weighs, in units. Modelled on MMuton's Cyberpunk RED Weight System: equipped
 * weapons and armor weigh a fraction, worn clothing and installed cyberware nothing, attachments
 * count toward the weapon they're on, and cyberware can raise the limit.
 *
 * Weights come from the item's Neon At Home flag, then MMuton's weight flag if that module set one,
 * then the GM's default for the item's type. Pure: no Foundry calls.
 */
import { num, round1, idOf, int, isLifestyle } from "./util.js";
import { itemFlag } from "./item-flag.js";
import { classFromName, classFromSP } from "./capacity.js";

export const WEAPON_TYPES = [
  "lightMelee", "medMelee", "heavyMelee", "vHeavyMelee", "medPistol", "heavyPistol", "vHeavyPistol", "smg", "heavySmg",
  "shotgun", "assaultRifle", "sniperRifle", "bow", "grenadeLauncher", "rocketLauncher", "thrownWeapon"
];
export const ARMOR_WEIGHT_KEYS = ["unarmored", "light", "medium", "heavy", "flak", "metalgear", "acpa", "shield"];
export const ITEM_WEIGHT_KEYS = ["gear", "drug", "cyberdeck", "clothing", "itemUpgrade", "cyberware"];
export const AMMO_WEIGHT_KEYS = ["round", "arrow", "grenade", "rocket"];

export const DEFAULT_WEIGHT_RULES = {
  enabled: true,
  method: "body",
  multiplier: 3,
  custom: 30,
  // equipped weapons and armor weigh this fraction
  equipped: 0.33,
  includeUpgrades: true,
  // owned (not carried) items weigh nothing: they aren't on the character
  ownedCounts: false,
  // over the limit MOVE is halved; over double it, MOVE is 1
  encumbrance: true,
  vehicleCargo: 50,
  weapons: {
    lightMelee: 0.5, medMelee: 1, heavyMelee: 2, vHeavyMelee: 3, medPistol: 1, heavyPistol: 1, vHeavyPistol: 1.5,
    smg: 2, heavySmg: 2.5, shotgun: 3.5, assaultRifle: 4, sniperRifle: 5, bow: 1.5, grenadeLauncher: 4,
    rocketLauncher: 6, thrownWeapon: 0.5
  },
  armor: { unarmored: 2, light: 3, medium: 5, heavy: 7, flak: 10, metalgear: 15, acpa: 0, shield: 3 },
  // ammunition, per round
  ammo: { round: 0.02, arrow: 0.1, grenade: 0.5, rocket: 1.5 },
  items: { gear: 0.5, drug: 0.1, cyberdeck: 1, clothing: 0.5, itemUpgrade: 0.25, cyberware: 0.5 }
};

export const EQUIPPED_FRACTIONS = [0, 0.33, 0.5, 1];

const NON_PHYSICAL = new Set(["criticalInjury", "netarch", "role", "skill", "program", "vehicle"]);
const EQUIPPABLE = new Set(["armor", "clothing", "cyberdeck", "drug", "gear", "weapon"]);

/** Clamp the GM's weight rules, filling anything missing from the defaults. */
export function normalizeWeightRules(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_WEIGHT_RULES;
  const table = (src, def) => Object.fromEntries(Object.keys(def).map((k) => [k, num(src?.[k], def[k], 0, 9999)]));
  return {
    enabled: r.enabled === undefined ? d.enabled : !!r.enabled,
    method: ["body", "custom"].includes(r.method) ? r.method : d.method,
    multiplier: num(r.multiplier, d.multiplier, 0, 50),
    custom: num(r.custom, d.custom, 0, 9999),
    equipped: EQUIPPED_FRACTIONS.includes(Number(r.equipped)) ? Number(r.equipped) : d.equipped,
    includeUpgrades: r.includeUpgrades === undefined ? d.includeUpgrades : !!r.includeUpgrades,
    ownedCounts: r.ownedCounts === undefined ? d.ownedCounts : !!r.ownedCounts,
    encumbrance: r.encumbrance === undefined ? d.encumbrance : !!r.encumbrance,
    vehicleCargo: num(r.vehicleCargo, d.vehicleCargo, 0, 99999),
    weapons: table(r.weapons, d.weapons),
    armor: table(r.armor, d.armor),
    ammo: table(r.ammo, d.ammo),
    items: table(r.items, d.items)
  };
}

/** MMuton's weight flag, if that module weighed the item. */
function mmutonWeight(item) {
  const v = item?.flags?.["mmutons-cyberpunk-red-weight-system"]?.weight?.value;
  return v === undefined || v === null || v === "" ? null : Math.max(0, num(v, 0));
}

/** Part of a vehicle rather than its cargo: worn plating, and what VAS mounts or installs. */
function vehicleFitting(item) {
  const vas = item.flags?.["mmutons-cyberpunk-red-vas"] ?? {};
  if (item.type === "armor" && item.system?.equipped === "equipped") return true;
  if (item.type === "weapon" && vas.mountedPosition) return true;
  return (item.type === "itemUpgrade" && !!vas.mounted) || (item.type === "cyberware" && !!vas.installed);
}

/** Weight capacity an item adds: Neon At Home's flag, else MMuton's. */
function capacityBonusOf(item, flag) {
  if (flag.capacityBonus) return flag.capacityBonus;
  return Math.max(0, num(item?.flags?.["mmutons-cyberpunk-red-weight-system"]?.capacityBonus?.value, 0));
}

/** The GM's default weight for an item of this kind, per unit. */
export function defaultWeight(item, rules) {
  const s = item.system ?? {};
  switch (item.type) {
    case "weapon":
      return rules.weapons[s.weaponType] ?? 0;
    case "armor": {
      if (s.isShield) return rules.armor.shield;
      const sp = s.isHeadLocation && !s.isBodyLocation ? s.headLocation?.sp : s.bodyLocation?.sp;
      return rules.armor[classFromName(item.name) || classFromSP(sp)] ?? 0;
    }
    case "ammo": {
      const v = s.variety;
      if (v === "arrow") return rules.ammo.arrow;
      if (v === "grenade") return rules.ammo.grenade;
      if (v === "rocket") return rules.ammo.rocket;
      return rules.ammo.round;
    }
    default:
      return rules.items[item.type] ?? 0;
  }
}

/** One unit of the item, before what being equipped or installed does to it. */
export function baseWeight(item, rules, moduleId) {
  if (NON_PHYSICAL.has(item.type) || isLifestyle(item)) return 0;
  const own = itemFlag(item, moduleId).weight;
  if (own !== null) return own;
  return mmutonWeight(item) ?? defaultWeight(item, rules);
}

/**
 * Weigh everything on an actor.
 * @param {object[]} items - every item on the actor
 * @param {object} rules - normalized weight rules
 * @param {object} opts - { body: BODY stat, moduleId, vehicle: false, cargo, actorInstalled: ids
 *   installed in the actor itself (cyberware in the body) }
 * @returns {{current, max, base, bonus, pct, status, items: {id, unit, total, reasons}[]}}
 */
export function computeWeight(items, rules, { body = 0, moduleId, vehicle = false, cargo = null, actorInstalled = [] } = {}) {
  const byId = new Map(items.map((i) => [idOf(i), i]));
  // Installed in the body: the actor is the parent.
  const parentOf = new Map(actorInstalled.map((id) => [id, "actor"]));
  for (const item of items) for (const id of item.system?.installedItems?.list ?? []) if (!parentOf.has(id)) parentOf.set(id, idOf(item));

  const out = [];
  let current = 0;
  let bonus = 0;
  for (const item of items) {
    const s = item.system ?? {};
    const id = idOf(item);
    const flag = itemFlag(item, moduleId);
    const qty = item.type === "ammo" || s.amount !== undefined ? Math.max(0, num(s.amount, 1)) : 1;
    const reasons = [];
    let unit = baseWeight(item, rules, moduleId);
    const installedIn = parentOf.get(id);

    if (NON_PHYSICAL.has(item.type) || isLifestyle(item)) unit = 0;
    else if (vehicle && vehicleFitting(item)) {
      // A vehicle's own plating and mounted upgrades aren't cargo; mounted weapons weigh like equipped ones.
      const mounted = item.type === "weapon";
      unit = mounted ? unit * rules.equipped : 0;
      reasons.push("mounted");
    } else if (installedIn && item.type !== "ammo") {
      // Installed cyberware weighs nothing (and may raise the limit); attachments count toward
      // the item they're on, added to it below.
      if (item.type === "cyberware") {
        if (!vehicle) bonus += capacityBonusOf(item, flag);
        unit = 0;
        reasons.push("installed");
      } else if (item.type === "itemUpgrade" && rules.includeUpgrades) {
        out.push({ id, unit: 0, total: 0, reasons: ["attached"], parent: installedIn, carried: unit * qty });
        continue;
      } else {
        unit = 0;
        reasons.push("attached");
      }
    } else if (!vehicle && EQUIPPABLE.has(item.type) && (s.equipped ?? "owned") === "owned" && !rules.ownedCounts) {
      unit = 0;
      reasons.push("notCarried");
    } else if (!vehicle && item.type === "clothing" && s.equipped === "equipped") {
      unit = 0;
      reasons.push("worn");
    } else if (!vehicle && (item.type === "weapon" || item.type === "armor") && s.equipped === "equipped" && rules.equipped !== 1) {
      unit *= rules.equipped;
      reasons.push("equipped");
    }
    // Worn gear (a frame, a power harness) can raise the limit too.
    if (!vehicle && !installedIn && item.type !== "cyberware" && s.equipped === "equipped") bonus += capacityBonusOf(item, flag);
    out.push({ id, unit, total: unit * qty, reasons });
  }
  // Attachments add to their parent (at the parent's equipped fraction).
  for (const entry of out) {
    if (!entry.parent) continue;
    const parent = out.find((e) => e.id === entry.parent);
    const parentItem = byId.get(entry.parent);
    if (!parent || !parentItem) continue;
    if (parent.reasons.includes("notCarried")) continue;
    const factor = parent.reasons.includes("equipped") ? rules.equipped : 1;
    parent.total += entry.carried * factor;
    parent.reasons.push("upgrades");
  }
  for (const e of out) current += e.total;

  const base = vehicle
    ? (cargo ?? rules.vehicleCargo)
    : rules.method === "custom" ? rules.custom : Math.max(0, int(body)) * rules.multiplier;
  const max = base + bonus;
  const pct = max > 0 ? Math.round((current / max) * 100) : current > 0 ? 999 : 0;
  return {
    current: round1(current),
    max: round1(max),
    base: round1(base),
    bonus: round1(bonus),
    pct,
    status: pct > 100 ? "over" : pct >= 75 ? "heavy" : "ok",
    items: out.map((e) => ({ ...e, unit: round1(e.unit), total: round1(e.total) }))
  };
}

/**
 * Encumbrance from a weighing: "none", "half" (over the limit: MOVE halved) or "one" (over double
 * the limit: MOVE 1, and the GM may call for checks).
 * @param {{current: number, max: number}} weight - from computeWeight
 */
export function encumbrance(weight, rules) {
  if (!rules.enabled || !rules.encumbrance) return "none";
  const { current, max } = weight;
  if (current > max * 2) return "one";
  if (current > max) return "half";
  return "none";
}

/** MOVE under encumbrance: halved rounded down (at least 1), or 1. */
export function encumberedMove(move, level) {
  const m = Math.max(0, Math.floor(Number(move) || 0));
  if (level === "one") return Math.min(m, 1);
  if (level === "half") return Math.min(m, Math.max(1, Math.floor(m / 2)));
  return m;
}
