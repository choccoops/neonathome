/**
 * A character's home: the stash where they keep what they aren't carrying, and the vehicle bay.
 * Pure: no Foundry calls.
 */
import { int, str, optNum } from "./util.js";

/** One vehicle in a character's garage: an actor (VAS vehicle) or a CPR vehicle item on them. */
function normalizeVehicle(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    uuid: str(r.uuid),
    // the bay it's parked in (0-based), or null for street / off-site
    bay: r.bay === null || r.bay === undefined || r.bay === "" ? null : int(r.bay, 0, 99),
    // the ride the character is using right now
    active: !!r.active
  };
}

/** Clamp the home actor flag. */
export function normalizeHome(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const vehicles = (Array.isArray(r.vehicles) ? r.vehicles : []).map(normalizeVehicle).filter((v) => {
    if (!v.uuid || seen.has(v.uuid)) return false;
    seen.add(v.uuid);
    return true;
  });
  return {
    // uuid of the CPR container actor that is this character's home stash
    stash: str(r.stash),
    // GM override for the number of vehicle bays (null: from the home)
    bayOverride: optNum(r.bayOverride, 0, 99),
    // GM-set home name when Neon Hub doesn't know one
    name: str(r.name).trim(),
    vehicles
  };
}

/**
 * How many vehicle bays a character's home has, and where that number comes from.
 * @param {object} p
 * @param {number|null} p.override - GM override on the character
 * @param {{name, parking}[]} p.homes - Neon Hub housing items active on the character
 * @param {{name, parking}|null} p.household - Neon Hub household they live in
 * @param {number} p.fallback - the GM's default when nothing else says
 * @returns {{slots, source: "override"|"home"|"household"|"default", homeName}}
 */
export function baySlots({ override = null, homes = [], household = null, fallback = 0, name = "" } = {}) {
  const best = homes.slice().sort((a, b) => int(b.parking) - int(a.parking))[0] ?? null;
  const homeName = best?.name || household?.name || name || "";
  if (override !== null && override !== undefined) return { slots: int(override, 0, 99), source: "override", homeName };
  if (best) return { slots: int(best.parking, 0, 99), source: "home", homeName };
  if (household) return { slots: int(household.parking, 0, 99), source: "household", homeName };
  return { slots: int(fallback, 0, 99), source: "default", homeName };
}

/**
 * Lay vehicles out in the bays. A vehicle keeps its bay when it's free and inside the home's bays;
 * the rest are parked on the street.
 * @param {{uuid, bay, active}[]} vehicles
 * @param {number} slots
 * @returns {{bays: {index, vehicle}[], street: object[], moved: string[]}} moved: uuids whose bay was dropped
 */
export function layoutBay(vehicles, slots) {
  const bays = Array.from({ length: Math.max(0, slots) }, (_, index) => ({ index, vehicle: null }));
  const street = [];
  const moved = [];
  for (const v of vehicles) {
    if (v.bay !== null && v.bay < slots && !bays[v.bay].vehicle) bays[v.bay].vehicle = v;
    else {
      if (v.bay !== null) moved.push(v.uuid);
      street.push(v);
    }
  }
  return { bays, street, moved };
}

/** The first free bay, or null. */
export function freeBay(vehicles, slots) {
  const taken = new Set(vehicles.map((v) => v.bay).filter((b) => b !== null && b < slots));
  for (let i = 0; i < slots; i++) if (!taken.has(i)) return i;
  return null;
}

/**
 * The Neon Hub housing items active on a character, as { name, parking }.
 * @param {object[]} items - the character's items
 */
export function neonHubHomes(items, hubId = "cpr-neon-hub") {
  return items
    .filter((i) => i.flags?.[hubId]?.lifestyle?.category === "housing" && i.system?.equipped === "equipped")
    .map((i) => ({ name: String(i.name ?? ""), parking: int(i.flags[hubId].lifestyle.parking) }));
}

/** The Neon Hub household a character lives in, as { name, parking }, from that module's setting. */
export function neonHubHousehold(setting, actorUuid) {
  const list = Array.isArray(setting?.list) ? setting.list : [];
  const hh = list.find((h) => Array.isArray(h?.inhabitants) && h.inhabitants.includes(actorUuid));
  if (!hh) return null;
  return { name: String(hh.name ?? hh.home?.name ?? ""), parking: int(hh.home?.parking) };
}
