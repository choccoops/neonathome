import { test } from "node:test";
import assert from "node:assert/strict";
import { totalUpgrade, effectiveWeapon, socketLayout, benefits, canAttach, canDetach } from "../scripts/data/attachments.js";
import { normalizeHome, baySlots, layoutBay, freeBay, neonHubHomes, neonHubHousehold } from "../scripts/data/home.js";
import { itemVehicleStats, actorVehicleStats, isVasVehicle } from "../scripts/data/vehicles.js";

const M = "cpr-neon-at-home";
const up = (id, mods = {}, { size = 1, type = "weapon", flag } = {}) => ({
  _id: id, name: id, type: "itemUpgrade", system: { type, size, modifiers: mods }, flags: flag ? { [M]: { item: flag } } : {}
});

test("upgrade totals: modifiers add, the largest override wins", () => {
  const a = up("a", { magazine: { type: "modifier", value: 4 } });
  const b = up("b", { magazine: { type: "modifier", value: 2 } });
  const drum = up("c", { magazine: { type: "override", value: 45 } });
  const drum2 = up("d", { magazine: { type: "override", value: 30 } });
  assert.deepEqual(totalUpgrade([a, b], "magazine"), { type: "modifier", value: 6 });
  assert.deepEqual(totalUpgrade([a, drum, drum2], "magazine"), { type: "override", value: 45 });
});

test("effective weapon numbers and sockets", () => {
  const gun = { _id: "g", type: "weapon", system: { attackmod: 0, rof: 1, damage: "3d6", magazine: { max: 8 }, installedItems: { slots: 3 } } };
  const ext = up("ext", { magazine: { type: "modifier", value: 4 } }, { size: 1 });
  const smart = up("smart", { attackmod: { type: "modifier", value: 1 } }, { size: 2 });
  const w = effectiveWeapon(gun, [ext, smart]);
  assert.equal(w.magazine, 12);
  assert.equal(w.attackmod, 1);
  assert.equal(w.used, 3);
  assert.equal(w.free, 0);
  assert.equal(w.damage, "3d6");
  const sockets = socketLayout(3, [ext, smart]);
  assert.equal(sockets.length, 3);
  assert.equal(sockets[1].upgradeId, "smart");
  assert.equal(sockets[2].start, false);
  assert.equal(socketLayout(2, [ext, smart])[2].over, true);
});

test("benefit lines from modifiers, a secondary weapon and custom text", () => {
  const under = up("u", { secondaryWeapon: { configured: true }, rof: { type: "modifier", value: 1, isSituational: true } }, { flag: { attachment: { benefits: "Ignores half armor\n\n+2 Stealth when holstered" } } });
  under.system.weaponType = "shotgun";
  under.system.damage = "5d6";
  const lines = benefits(under, M);
  assert.equal(lines[0].point, "rof");
  assert.equal(lines[0].situational, true);
  assert.equal(lines[1].kind, "secondary");
  assert.deepEqual(lines.filter((l) => l.kind === "custom").map((l) => l.text), ["Ignores half armor", "+2 Stealth when holstered"]);
});

test("attach and detach rules", () => {
  const gun = { type: "weapon" };
  assert.equal(canAttach(gun, up("a"), { free: 1 }).ok, true);
  assert.equal(canAttach(gun, up("a", {}, { size: 2 }), { free: 1 }).reason, "slots");
  assert.equal(canAttach(gun, up("a", {}, { type: "armor" }), { free: 3 }).reason, "type");
  assert.equal(canAttach(gun, up("a"), { free: 3, installedElsewhere: true }).reason, "installed");
  assert.equal(canDetach(up("a", {}, { flag: { attachment: { fixed: true } } }), M), false);
  assert.equal(canDetach(up("a"), M), true);
});

test("bay slots: override, then the home, then a household, then the default", () => {
  assert.deepEqual(baySlots({ override: 5, homes: [{ name: "Studio", parking: 1 }] }), { slots: 5, source: "override", homeName: "Studio" });
  assert.equal(baySlots({ homes: [{ name: "Studio", parking: 1 }, { name: "Penthouse", parking: 4 }] }).slots, 4);
  assert.equal(baySlots({ household: { name: "Crew flat", parking: 2 } }).source, "household");
  assert.deepEqual(baySlots({ fallback: 1 }), { slots: 1, source: "default", homeName: "" });
});

test("bay layout keeps bays, sends the rest to the street", () => {
  const vs = [{ uuid: "a", bay: 0 }, { uuid: "b", bay: 0 }, { uuid: "c", bay: 3 }, { uuid: "d", bay: null }];
  const l = layoutBay(vs, 2);
  assert.equal(l.bays[0].vehicle.uuid, "a");
  assert.equal(l.bays[1].vehicle, null);
  assert.deepEqual(l.street.map((v) => v.uuid), ["b", "c", "d"]);
  assert.deepEqual(l.moved, ["b", "c"]);
  assert.equal(freeBay(vs, 2), 1);
  assert.equal(freeBay([{ uuid: "a", bay: 0 }], 1), null);
});

test("home flag normalizes and drops duplicate vehicles", () => {
  const h = normalizeHome({ stash: "Actor.x", bayOverride: "", vehicles: [{ uuid: "A" }, { uuid: "A", bay: 1 }, { uuid: "" }] });
  assert.equal(h.vehicles.length, 1);
  assert.equal(h.bayOverride, null);
  assert.equal(h.vehicles[0].bay, null);
});

test("Neon Hub homes and households", () => {
  const items = [
    { name: "Studio", system: { equipped: "equipped" }, flags: { "cpr-neon-hub": { lifestyle: { category: "housing", parking: 1 } } } },
    { name: "Old flat", system: { equipped: "owned" }, flags: { "cpr-neon-hub": { lifestyle: { category: "housing", parking: 3 } } } },
    { name: "Kibble", system: { equipped: "equipped" }, flags: { "cpr-neon-hub": { lifestyle: { category: "lifestyle" } } } }
  ];
  assert.deepEqual(neonHubHomes(items), [{ name: "Studio", parking: 1 }]);
  const setting = { list: [{ name: "Crew", inhabitants: ["Actor.a"], home: { parking: 2 } }] };
  assert.deepEqual(neonHubHousehold(setting, "Actor.a"), { name: "Crew", parking: 2 });
  assert.equal(neonHubHousehold(setting, "Actor.b"), null);
});

test("vehicle stats from items and VAS actors", () => {
  const car = { type: "vehicle", system: { sdp: 50, seats: 2, speedCombat: 20, installedItems: { slots: 3 } } };
  const seats = up("s", { seats: { type: "modifier", value: 2 } }, { type: "vehicle" });
  const st = itemVehicleStats(car, [seats]);
  assert.equal(st.seats, 4);
  assert.equal(st.sdp, 50);
  const vas = {
    flags: { "mmutons-cyberpunk-red-vas": { positions: [{ id: "p1", name: "Driver", maxOccupants: 1, occupants: ["Actor.x"], order: 1 }, { id: "p2", name: "Gunner", maxOccupants: 2, occupants: [], order: 2, bulletproofGlass: true, glassHp: 5, glassHpMax: 10 }] } },
    system: { derivedStats: { hp: { value: 30, max: 50 } }, stats: { move: { value: 12 } } },
    items: [
      { _id: "w", type: "weapon", name: "MG", flags: { "mmutons-cyberpunk-red-vas": { mountedPosition: "p2" } } },
      { _id: "ar", type: "armor", system: { equipped: "equipped", bodyLocation: { sp: 13, ablation: 2 } }, flags: {} }
    ]
  };
  assert.equal(isVasVehicle(vas), true);
  const a = actorVehicleStats(vas, (u) => ({ name: u, img: "" }));
  assert.equal(a.seatCount, 3);
  assert.equal(a.crew, 1);
  assert.equal(a.mounted, 1);
  assert.equal(a.sp, 11);
  assert.equal(a.seats[1].glass.max, 10);
  assert.equal(a.seats[1].weapons[0].name, "MG");
});
