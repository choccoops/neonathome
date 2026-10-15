/**
 * Tech Materials: what Maker projects are built from, as items rather than eurobucks. One item per
 * price tier ("Premium Tech Materials"), sourced (bought, found, handed out) or salvaged from gear.
 * Pure: no Foundry calls.
 */
import { int } from "./util.js";
import { PRICE_CATEGORIES, priceCategory, worth } from "./maintenance.js";

/** The tiers, cheapest first: Cyberpunk RED's price categories. */
export const TIERS = PRICE_CATEGORIES.map((c) => c.key);
export const TIER_NAMES = {
  cheap: "Cheap", everyday: "Everyday", costly: "Costly", premium: "Premium",
  expensive: "Expensive", veryExpensive: "Very Expensive", luxury: "Luxury", superLuxury: "Super Luxury"
};
const ebOf = (tier) => PRICE_CATEGORIES.find((c) => c.key === tier)?.eb ?? 0;

/**
 * Fabrication's materials (p.148): a tier lower than the item. A Cheap item takes Cheap materials
 * (the corebook prices those at 5eb), a Super Luxury item materials worth half its price, in
 * Super Luxury units of 10,000eb.
 * @returns {{tier: string, count: number}}
 */
export function fabricationNeeds(price) {
  const p = Number(price) || 0;
  if (p >= 10000) return { tier: "superLuxury", count: Math.max(1, Math.ceil(p / 2 / 10000)) };
  const at = priceCategory(p);
  return { tier: TIERS[Math.max(0, at - 1)], count: 1 };
}

/** Upgrade Expertise's materials (p.148): the item's own tier; a vehicle's are Very Expensive. */
export function upgradeNeeds(price, { vehicle = false } = {}) {
  if (vehicle) return { tier: "veryExpensive", count: 1 };
  return { tier: TIERS[Math.max(0, priceCategory(price))], count: 1 };
}

/** Item types a Tech can strip for parts (a vehicle is the Vehicle Bay's; ammo and drugs are used up). */
export const STRIP_TYPES = ["gear", "weapon", "armor", "clothing", "cyberware", "cyberdeck", "program", "itemUpgrade"];

/** The eb of one materials unit of a tier. */
export const tierEb = ebOf;

/**
 * What an item is worth to a Tech breaking it down, per unit: its price, a tier lower if Damaged,
 * two if Destroyed, nothing if Destroyed Beyond Repair (Breaking Your Stuff, p.3).
 */
export function partsValue(item, moduleId) {
  const condition = item?.flags?.[moduleId]?.item?.condition ?? "";
  return worth(item?.system?.price?.market, condition).eb;
}

/**
 * Whether an item can be stripped for parts: a type that can, worth something, not installed in
 * anything, holding nothing installed, and not worn or wielded (unequip it first).
 */
export function strippable(item, moduleId) {
  if (!STRIP_TYPES.includes(item?.type)) return false;
  const s = item.system ?? {};
  if (s.isInstalled || s.installedItems?.list?.length || s.equipped === "equipped") return false;
  return partsValue(item, moduleId) > 0;
}

/**
 * Stripping items for materials: their worth added up against the materials wanted. Anything
 * past what the materials take is lost (bits too small to use).
 * @param {{value: number, qty?: number}[]} picks - each item's parts value and how many of it
 * @returns {{total: number, need: number, ok: boolean, waste: number}}
 */
export function stripPlan(picks, tier, count = 1) {
  const total = picks.reduce((n, p) => n + int(p.value) * Math.max(1, int(p.qty ?? 1, 1)), 0);
  const need = ebOf(tier) * Math.max(1, int(count, 1));
  return { total, need, ok: TIERS.includes(tier) && total >= need, waste: Math.max(0, total - need) };
}

/**
 * Stripping's time (Neon At Home's own ruling; neither book times it): a few pieces are torn down
 * in the margins of the day, a batch is real work. The first STRIP_FREE items are free, each one
 * past that takes STRIP_MINUTES. Materials being broken down or combined don't count: they're
 * parts already.
 */
export const STRIP_FREE = 5;
export const STRIP_MINUTES = 30;
export const stripMinutes = (units) => Math.max(0, Math.floor(Number(units) || 0) - STRIP_FREE) * STRIP_MINUTES;

/** The most units of a tier a worth buys. */
export const unitsFor = (eb, tier) => (ebOf(tier) ? Math.floor(int(eb) / ebOf(tier)) : 0);

/** The materials tier of an item (its flag), or null if it isn't Tech Materials. */
export function materialsTier(item, moduleId) {
  const t = item?.flags?.[moduleId]?.materials;
  return TIERS.includes(t) ? t : null;
}

/** How many units of a tier a character's items hold. */
export function countMaterials(items, tier, moduleId) {
  return items.filter((i) => materialsTier(i, moduleId) === tier).reduce((n, i) => n + Math.max(1, int(i.system?.amount ?? 1, 1)), 0);
}

/**
 * Which materials items pay for a need, oldest first: [{ id, take, left, source }] (left: the units
 * the item keeps; 0: it's used up), or null if there aren't enough.
 */
export function payMaterials(items, need, moduleId) {
  let owed = Math.max(1, int(need?.count, 1));
  const out = [];
  for (const i of items.filter((x) => materialsTier(x, moduleId) === need?.tier)) {
    if (!owed) break;
    const have = Math.max(1, int(i.system?.amount ?? 1, 1));
    const take = Math.min(have, owed);
    owed -= take;
    out.push({ id: i.id ?? i._id, take, left: have - take, source: sourceOf(i) });
  }
  return owed ? null : out;
}

/** Where a materials item came from, as its description's first line says (for the books). */
export function sourceOf(item) {
  const html = String(item?.system?.description?.value ?? "");
  const m = html.match(/<b>[^<]*from:?<\/b>\s*([^<]*)/i);
  const text = (m?.[1] ?? "").replace(/\s+/g, " ").trim();
  return text.startsWith("(") ? "" : text;
}

/**
 * The item data of a tier's Tech Materials (the compendium's items are made from this too).
 * @param {object} [opts] - { source: what it was salvaged or derived from, for the GM's books }
 */
export function materialsItemData(tier, moduleId, { source = "", id = undefined } = {}) {
  const name = `${TIER_NAMES[tier]} Tech Materials`;
  const note = source
    ? `<p><b>Salvaged from:</b> ${source}</p>`
    : "<p><b>Sourced from / salvaged from:</b> <em>(GM: note where these came from)</em></p>";
  return {
    ...(id ? { _id: id } : {}),
    name,
    type: "gear",
    img: "icons/svg/item-bag.svg",
    system: {
      description: {
        value: `${note}<p>Parts, stock and components worth ${ebOf(tier).toLocaleString()}eb (${TIER_NAMES[tier]}), for a Tech's Maker work: Fabrication takes materials a tier below the item, Upgrades the item's own tier (Cyberpunk RED, p.148). Sourced like any gear, or salvaged from gear.</p>`
      },
      price: { market: ebOf(tier) },
      amount: 1,
      equipped: "owned",
      isElectronic: false,
      providesHardening: false,
      concealable: { concealable: false, isConcealed: false }
    },
    flags: { [moduleId]: { materials: tier, item: { category: "utility" } } }
  };
}

/** "1 × Premium Tech Materials". */
export const needsLabel = (need) => `${need.count} × ${TIER_NAMES[need.tier]} Tech Materials`;
