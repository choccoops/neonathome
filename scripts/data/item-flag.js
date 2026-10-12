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
    cargo: optNum(r.cargo, 0, 99999)
  };
}

/** The flag of an item document or its plain data. */
export function itemFlag(item, moduleId) {
  return normalizeItemFlag(item?.flags?.[moduleId]?.item);
}
