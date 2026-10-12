/**
 * Vehicles for the Vehicle Bay. Two kinds:
 *  - actor vehicles: actors on MMuton's CPR Vehicle Actor Sheet (VAS), with crew seats, mounted
 *    weapons, mounted upgrades and installed cyberware kept in that module's flags;
 *  - item vehicles: Cyberpunk RED - CORE `vehicle` items on the character (SDP, seats, speeds,
 *    vehicle upgrades installed in them).
 * Pure: no Foundry calls.
 */
import { int, idOf } from "./util.js";
import { totalUpgrade } from "./attachments.js";

export const VAS = "mmutons-cyberpunk-red-vas";

/** A CPR vehicle item's numbers with its upgrades. */
export function itemVehicleStats(vehicle, upgrades = []) {
  const s = vehicle.system ?? {};
  const val = (base, point) => {
    const t = totalUpgrade(upgrades, point);
    return t.type === "override" ? t.value : base + t.value;
  };
  return {
    sdp: val(int(s.sdp), "sdp"),
    seats: val(int(s.seats), "seats"),
    speedCombat: val(int(s.speedCombat), "speedCombat"),
    speedNarrative: String(s.speedNarrative ?? ""),
    slots: val(int(s.installedItems?.slots), "slots"),
    used: upgrades.reduce((n, u) => n + int(u.system?.size ?? 1), 0)
  };
}

/** Is this actor a VAS vehicle? (its sheet, or the seats it keeps in its flags) */
export function isVasVehicle(actor) {
  const sheet = actor?.flags?.core?.sheetClass ?? "";
  return sheet.startsWith(`${VAS}.`) || Array.isArray(actor?.flags?.[VAS]?.positions);
}

/**
 * An actor vehicle's numbers, read from the actor and VAS's flags.
 * @param {object} actor - document or plain data with items
 * @param {(uuid: string) => {name, img}|null} [resolve] - look up an occupant
 */
export function actorVehicleStats(actor, resolve = () => null) {
  const s = actor.system ?? {};
  const items = Array.from(actor.items ?? []);
  const positions = (actor.flags?.[VAS]?.positions ?? []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const armor = items.filter((i) => i.type === "armor" && i.system?.equipped === "equipped");
  const sp = Math.max(0, ...armor.map((a) => int(a.system?.bodyLocation?.sp) - int(a.system?.bodyLocation?.ablation)));
  const spMax = Math.max(0, ...armor.map((a) => int(a.system?.bodyLocation?.sp)));
  const weapons = items.filter((i) => i.type === "weapon");
  const seats = positions.map((p) => ({
    id: p.id,
    name: String(p.name ?? ""),
    max: Math.max(1, int(p.maxOccupants ?? 1)),
    occupants: (p.occupants ?? []).map((uuid) => resolve(uuid) ?? { name: "?", img: "" }),
    weapons: weapons.filter((w) => w.flags?.[VAS]?.mountedPosition === p.id).map((w) => ({ id: idOf(w), name: w.name, img: w.img })),
    glass: p.bulletproofGlass ? { value: int(p.glassHp), max: int(p.glassHpMax) } : null,
    canControlWeapons: !!p.canControlWeapons
  }));
  return {
    hp: { value: int(s.derivedStats?.hp?.value, -999), max: int(s.derivedStats?.hp?.max) },
    sp,
    spMax,
    move: int(s.stats?.move?.value),
    seats,
    seatCount: seats.reduce((n, p) => n + p.max, 0),
    crew: seats.reduce((n, p) => n + p.occupants.length, 0),
    mounted: weapons.filter((w) => w.flags?.[VAS]?.mountedPosition).length,
    weapons: weapons.length,
    upgrades: items
      .filter((i) => (i.type === "itemUpgrade" && i.flags?.[VAS]?.mounted) || (i.type === "cyberware" && i.flags?.[VAS]?.installed))
      .map((i) => ({ id: idOf(i), name: i.name, img: i.img })),
    injuries: items.filter((i) => i.type === "criticalInjury").map((i) => ({ id: idOf(i), name: i.name }))
  };
}
