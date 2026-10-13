/**
 * Per-item Neon At Home settings, stored in `flags.cpr-neon-at-home.item` on any CPR item.
 * Every field is optional; an item without the flag follows the GM's rules for its type.
 * Pure: no Foundry calls.
 */
import { int, str, optNum } from "./util.js";

/** Carry slot categories (costs come from the GM's carry rules). */
export const CATEGORIES = ["heavy", "twoHanded", "oneHanded", "ammo", "utility", "bulky", "none"];

/** Armor classes from the Armor & Carrying rules. */
export const ARMOR_CLASSES = ["unarmored", "light", "medium", "heavy", "flak", "metalgear", "acpa"];

/** What a bonus carry pool takes. "any" takes everything. */
export const POOL_ACCEPTS = ["any", "ammo", "pistolAmmo", "utility", "pistol", "twoHanded", "oneHanded", "heavy", "weapon", "pocket"];

/** Accept keys that take more than one kind of thing. Every other key takes the tag of its name. */
export const ACCEPT_TAGS = {
  // a Subdermal Pocket: gear, or a one-handed weapon
  pocket: ["utility", "oneHanded"]
};

/**
 * Breaking Your Stuff: the condition of a piece of gear ("" is working). Damaged gear works but can
 * malfunction; Destroyed gear doesn't work until it's repaired; Destroyed Beyond Repair never will.
 */
export const CONDITIONS = ["", "damaged", "destroyed", "dbr"];

/** Why gear was Damaged (Breaking Your Stuff, "Breaking Stuff"). */
export const DAMAGE_CAUSES = ["", "maintenance", "injury", "electrocution", "environment", "excessive", "fire", "drugs", "other"];

/** Who looks after gear so its owner doesn't have to (Breaking Your Stuff, "Roles and Maintenance"). */
export const EXEMPT = ["", "exec", "medtech", "nomad", "other"];

/** A malfunction under way on a piece of gear, or null. */
function normalizeMalfunction(raw) {
  if (!raw || typeof raw !== "object" || !str(raw.table)) return null;
  const opt = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    table: str(raw.table),
    roll: int(raw.roll, 1, 6),
    // world time it started and ends (null: until it's fixed or the GM clears it)
    at: opt(raw.at),
    until: opt(raw.until),
    // a Tech's jury rig holds it off until then (world time)
    rigUntil: opt(raw.rigUntil),
    rigMinutes: int(raw.rigMinutes, 0, 999)
  };
}

/** Where an armor upgrade fits. */
export const UPGRADE_LOCATIONS = ["body", "head", "both", "shield", "any"];

/**
 * Built-in armor upgrade effects Neon At Home applies to the wearer while the armor is worn.
 * Upgrades can also carry their own Active Effects (usage "installed") for anything else.
 */
export const UPGRADE_EFFECTS = ["", "reliefDex", "reliefRef", "reliefMove", "reliefAll", "stealth", "warPaint", "aiInterface", "neuroport", "enviro", "fireproof"];

function normalizePool(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    slots: int(r.slots, 0, 99),
    accepts: POOL_ACCEPTS.includes(r.accepts) ? r.accepts : "any",
    label: str(r.label).trim()
  };
}

const pools = (list) => (Array.isArray(list) ? list.map(normalizePool).filter((p) => p.slots > 0) : []);

/** Fill in and clamp every field so the rest of the code can trust the shape. */
export function normalizeItemFlag(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const carry = r.carry && typeof r.carry === "object" ? r.carry : {};
  const upgrade = r.upgrade && typeof r.upgrade === "object" ? r.upgrade : {};
  const attachment = r.attachment && typeof r.attachment === "object" ? r.attachment : {};
  const maint = r.maint && typeof r.maint === "object" ? r.maint : {};
  const effects = Array.isArray(upgrade.effects) ? upgrade.effects : (upgrade.effect ? [upgrade.effect] : []);
  return {
    // carry slots
    category: CATEGORIES.includes(r.category) ? r.category : "",
    slots: optNum(r.slots, 0, 99),
    // weight (units)
    weight: optNum(r.weight, 0, 9999),
    // weight capacity added while installed (cyberware) or worn (gear)
    capacityBonus: optNum(r.capacityBonus, 0, 999) ?? 0,
    // armor
    armorClass: ARMOR_CLASSES.includes(r.armorClass) ? r.armorClass : "",
    // carry gear worn on the body (holsters, slings, bags)
    carry: {
      pools: pools(carry.pools),
      // only wearable without armor (Unarmored / Mimic Kit)
      noArmor: !!carry.noArmor,
      // only one item of a group counts (e.g. "holster")
      group: str(carry.group).trim(),
      // conceals this many otherwise non-concealable weapons
      conceals: int(carry.conceals, 0, 9)
    },
    // armor upgrades (itemUpgrade with system.type "armor")
    upgrade: {
      key: str(upgrade.key).trim(),
      location: UPGRADE_LOCATIONS.includes(upgrade.location) ? upgrade.location : "any",
      classes: Array.isArray(upgrade.classes) ? upgrade.classes.filter((c) => ARMOR_CLASSES.includes(c)) : [],
      effects: effects.filter((e) => UPGRADE_EFFECTS.includes(e) && e),
      // a key of another upgrade that must be installed in the same armor first
      requires: str(upgrade.requires).trim(),
      // only takes effect when both worn head and body armor have it (War Paint, Enviro-Shielding)
      pair: !!upgrade.pair,
      pools: pools(upgrade.pools)
    },
    // weapon attachments (itemUpgrade with system.type "weapon")
    attachment: {
      // one benefit per line, shown on the Weaponbench
      benefits: str(attachment.benefits),
      // can't be taken off once attached
      fixed: !!attachment.fixed
    },
    // vehicles: cargo capacity in weight units
    cargo: optNum(r.cargo, 0, 99999),
    // Breaking Your Stuff: "" (working), "damaged", "destroyed" or "dbr" (Destroyed Beyond Repair).
    // 1.4.0 betas stored a cyberware "broken" state, which is Destroyed.
    condition: CONDITIONS.includes(r.condition) ? r.condition : r.cyberState === "broken" ? "destroyed" : "",
    // Damaged without the players knowing (Damaged gear isn't always obvious)
    hidden: !!r.hidden,
    cause: DAMAGE_CAUSES.includes(r.cause) ? r.cause : "",
    // knocked out by EMP (cyberware and electronics) until the GM says it's back
    emp: !!r.emp || r.cyberState === "emp",
    // the maintenance cycle it was last maintained in, and a cycle it can't be covered in
    maintained: r.maintained === null || r.maintained === undefined || r.maintained === "" ? null : int(r.maintained, 0),
    missCycle: r.missCycle === null || r.missCycle === undefined || r.missCycle === "" ? null : int(r.missCycle, 0),
    malfunction: normalizeMalfunction(r.malfunction),
    // the GM's overrides: what kind of gear it is for maintenance, its malfunction table, and
    // whether someone else looks after it
    maint: {
      kind: str(maint.kind),
      table: str(maint.table),
      exempt: EXEMPT.includes(maint.exempt) ? maint.exempt : ""
    }
  };
}

/** The flag of an item document or its plain data. */
export function itemFlag(item, moduleId) {
  return normalizeItemFlag(item?.flags?.[moduleId]?.item);
}
