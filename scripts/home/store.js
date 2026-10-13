import { MODULE_ID, HOME_FLAG, PSYCHE_FLAG, STASH_FLAG, NEON_HUB_ID, VAS_ID } from "../constants.js";
import { Settings } from "../settings.js";
import { normalizeHome, baySlots, layoutBay, neonHubHomes, neonHubHousehold } from "../data/home.js";
import { normalizePsyche } from "../data/syndromes.js";
import { isVasVehicle, actorVehicleStats, itemVehicleStats } from "../data/vehicles.js";

/** A world actor, item or token actor from a uuid, without awaiting. */
export function docFrom(uuid) {
  if (!uuid) return null;
  try {
    return fromUuidSync(uuid) ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads a character's home: its stash, its vehicles and how many bays it has, and the
 * Biomonitor's state. Writes go through HomeOps.
 */
export const HomeStore = {
  /** Characters this user can open the home of. */
  characters() {
    // Item Piles makes its piles as character actors in Cyberpunk RED: they aren't anyone's home.
    const isPile = (a) => !!game.itempiles?.API?.isValidItemPile?.(a);
    return game.actors.filter((a) => a.type === "character" && (game.user.isGM || a.isOwner) && !isPile(a))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  canManage(actor) {
    return !!actor && (game.user.isGM || actor.isOwner);
  },

  home(actor) {
    return normalizeHome(actor?.getFlag?.(MODULE_ID, HOME_FLAG));
  },

  psyche(actor) {
    return normalizePsyche(actor?.getFlag?.(MODULE_ID, PSYCHE_FLAG));
  },

  /** The character's home stash (a CPR container actor), if it still exists. */
  stash(actor) {
    const uuid = this.home(actor).stash;
    const doc = docFrom(uuid);
    return doc?.documentName === "Actor" ? doc : null;
  },

  /** The character a stash belongs to. */
  ownerOfStash(stash) {
    return docFrom(stash?.getFlag?.(MODULE_ID, STASH_FLAG));
  },

  /** How many vehicle bays the home has, and where the number comes from. */
  bay(actor) {
    const home = this.home(actor);
    const hub = game.modules.get(NEON_HUB_ID)?.active;
    let household = null;
    if (hub) {
      try {
        household = neonHubHousehold(game.settings.get(NEON_HUB_ID, "households"), actor.uuid);
      } catch {
        household = null;
      }
    }
    return baySlots({
      override: home.bayOverride,
      homes: neonHubHomes(Array.from(actor.items)),
      household,
      fallback: Number(Settings.get("defaultBaySlots")) || 0,
      name: home.name
    });
  },

  /**
   * The character's vehicles: those registered in their home, and CPR vehicle items on them.
   * @returns {{uuid, kind, doc, bay, active, name, img, stats, missing, canOpen}[]}
   */
  vehicles(actor) {
    const home = this.home(actor);
    const entries = home.vehicles.slice();
    for (const item of actor.items) {
      if (item.type === "vehicle" && !entries.some((v) => v.uuid === item.uuid)) entries.push({ uuid: item.uuid, bay: null, active: false });
    }
    return entries.map((v) => this.describeVehicle(v));
  },

  describeVehicle(entry) {
    const doc = docFrom(entry.uuid);
    if (!doc) return { ...entry, kind: "missing", doc: null, name: game.i18n.localize("NEONHOME.Bay.Missing"), img: "icons/svg/hazard.svg", missing: true };
    if (doc.documentName === "Item") {
      const upgrades = (doc.system.installedItems?.list ?? []).map((id) => doc.parent?.items.get(id)).filter(Boolean);
      return { ...entry, kind: "item", doc, name: doc.name, img: doc.img, stats: itemVehicleStats(doc, upgrades), upgrades, canOpen: doc.isOwner };
    }
    const resolve = (uuid) => {
      const a = docFrom(uuid);
      return a ? { name: a.name, img: a.img, uuid } : null;
    };
    return {
      ...entry,
      kind: "actor",
      doc,
      name: doc.name,
      img: doc.img,
      vas: isVasVehicle(doc),
      stats: actorVehicleStats(doc, resolve),
      canOpen: doc.testUserPermission(game.user, "OBSERVER")
    };
  },

  /** Bays laid out for the Vehicle Bay. */
  layout(actor) {
    const bay = this.bay(actor);
    const vehicles = this.vehicles(actor);
    return { bay, vehicles, ...layoutBay(vehicles, bay.slots) };
  },

  /** VAS vehicle actors this user could add to a garage (not already in it). */
  candidateVehicles(actor) {
    const taken = new Set(this.home(actor).vehicles.map((v) => v.uuid));
    return game.actors.filter((a) => isVasVehicle(a) && !taken.has(a.uuid) && (game.user.isGM || a.isOwner))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /** Is a vehicle with this uuid in the character's garage? (for GM checks on requests) */
  hasVehicle(actor, uuid) {
    return this.home(actor).vehicles.some((v) => v.uuid === uuid);
  },

  vasActive() {
    return !!game.modules.get(VAS_ID)?.active;
  }
};
