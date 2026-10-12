/**
 * Neon At Home's operations against mock Cyberpunk RED documents: moving things home and back
 * with what's installed in them, the GM's carry rules, armor upgrades and their effect,
 * attachments, the vehicle bay, and Catharsis.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
Settings.register(class {});
const { HomeOps, RuleBlock } = await import("../scripts/home/ops.js");
const { HomeStore } = await import("../scripts/home/store.js");

const mods = () => ({ attackmod: { type: "modifier", value: null }, magazine: { type: "modifier", value: null }, rof: { type: "modifier", value: null }, damage: { type: "modifier", value: null }, slots: { type: "modifier", value: null } });
const rifle = (id, equipped = "carried") => ({ _id: id, name: `Rifle ${id}`, type: "weapon", system: { equipped, weaponType: "assaultRifle", handsReq: 2, installedItems: { list: [], slots: 3, allowed: true, allowedTypes: ["itemUpgrade"] } } });

function setup() {
  const stash = makeActor({ name: "Stash", type: "container" }, [
    rifle("stashRifle0000aa", "owned"),
    { _id: "padding000000aaa", name: "Plate Padding", type: "itemUpgrade", system: { type: "armor", size: 1, modifiers: mods() }, flags: { [M]: { item: { upgrade: { key: "platePadding", location: "body", classes: ["light"], effects: ["stealth"] } } } } }
  ]);
  const actor = makeActor({
    name: "Rook",
    type: "character",
    system: { stats: { body: { value: 6 } }, derivedStats: { humanity: { value: 32, max: 60 } }, externalData: { currentArmorBody: { id: "" } } },
    flags: { [M]: { home: { stash: stash.uuid } } }
  }, [
    { _id: "jack0000000000aa", name: "Light Armorjack (Body)", type: "armor", system: { equipped: "equipped", isBodyLocation: true, penalty: 0, bodyLocation: { sp: 11, ablation: 0 }, headLocation: { sp: 0 }, installedItems: { list: [], slots: 3, allowed: true, allowedTypes: ["itemUpgrade"] } } },
    { _id: "pistol00000000aa", name: "Pistol", type: "weapon", system: { equipped: "carried", weaponType: "heavyPistol", handsReq: 1, installedItems: { list: ["mag0000000000aaa", "ammo000000000aaa"], slots: 3, allowed: true, allowedTypes: ["itemUpgrade", "ammo"] } } },
    { _id: "mag0000000000aaa", name: "Extended Magazine", type: "itemUpgrade", system: { type: "weapon", size: 1, modifiers: mods() } },
    { _id: "ammo000000000aaa", name: "HP Rounds", type: "ammo", system: { variety: "heavyPistol", amount: 30 } },
    { _id: "scope00000000aaa", name: "Scope", type: "itemUpgrade", system: { type: "weapon", size: 1, modifiers: mods() } },
    { _id: "fixed00000000aaa", name: "Welded Grip", type: "itemUpgrade", system: { type: "weapon", size: 1, modifiers: mods() }, flags: { [M]: { item: { attachment: { fixed: true } } } } },
    rifle("rifle000000000aa")
  ]);
  return { actor, stash };
}

test("stowing a weapon moves its attachments with it and leaves the ammo stack", async () => {
  asUser(true);
  const { actor, stash } = setup();
  await HomeOps.stow(actor, "pistol00000000aa");
  assert.equal(actor.items.get("pistol00000000aa"), undefined);
  assert.equal(actor.items.get("mag0000000000aaa"), undefined);
  assert.equal(actor.items.get("ammo000000000aaa").system.amount, 30);
  const pistol = stash.items.find((i) => i.name === "Pistol");
  assert.equal(pistol.system.equipped, "owned");
  const inside = pistol.system.installedItems.list.map((id) => stash.items.get(id).name).sort();
  assert.deepEqual(inside, ["Extended Magazine", "HP Rounds"]);
});

test("taking things home respects the GM's carry rule", async () => {
  const { actor, stash } = setup();
  // Light Armorjack: 15 slots. Pistol 2 + rifle 3 + ammo 1 + two loose upgrades 2 = 8 used.
  assert.equal(HomeOps.measure(actor).carry.used, 8);
  await game.settings.set(M, "enforceCarry", "block");
  asUser(false);
  await HomeOps.retrieve(actor, stash.uuid, "stashRifle0000aa");
  assert.equal(HomeOps.measure(actor).carry.used, 11);
  // Two more rifles: the first fits (14 of 15), the second would be 17.
  const more = makeActor({ name: "Locker", type: "container" }, [rifle("r1"), rifle("r2")]);
  await HomeOps.updateHome(actor, { stash: more.uuid });
  await HomeOps.retrieve(actor, more.uuid, "r1");
  await assert.rejects(() => HomeOps.retrieve(actor, more.uuid, "r2"), RuleBlock);
  asUser(true);
  await game.settings.set(M, "enforceCarry", "warn");
});

test("armor upgrades install from the stash, sync the effect and come out", async () => {
  asUser(true);
  const { actor, stash } = setup();
  await HomeOps.installArmorUpgrade(actor, "jack0000000000aa", "padding000000aaa", stash.uuid);
  const jack = actor.items.get("jack0000000000aa");
  assert.equal(jack.system.installedItems.slots, 4, "Light Armorjack gets its 4 upgrade slots");
  assert.equal(jack.system.installedItems.list.length, 1);
  assert.equal(stash.items.get("padding000000aaa"), undefined);
  const effect = actor.effects.find((e) => e.getFlag(M, "loadoutEffect"));
  assert.deepEqual(effect.changes.map((c) => [c.key, c.value]), [["bonuses.stealth", "2"]]);
  await HomeOps.removeArmorUpgrade(actor, "jack0000000000aa", jack.system.installedItems.list[0]);
  assert.equal(actor.effects.size, 0);
});

test("armor upgrades for the wrong class are refused", async () => {
  const { actor } = setup();
  const flex = actor.items;
  await actor.createEmbeddedDocuments("Item", [{ _id: "x", name: "Improved Flexibility", type: "itemUpgrade", system: { type: "armor", size: 3 }, flags: { [M]: { item: { upgrade: { key: "flex", location: "body", classes: ["medium"] } } } } }]);
  const id = flex.find((i) => i.name === "Improved Flexibility").id;
  await assert.rejects(() => HomeOps.installArmorUpgrade(actor, "jack0000000000aa", id), /isn't made for this class/);
});

test("attachments go on, fixed ones stay on, and slots are checked", async () => {
  const { actor } = setup();
  await HomeOps.attach(actor, "rifle000000000aa", "scope00000000aaa");
  await HomeOps.attach(actor, "rifle000000000aa", "fixed00000000aaa");
  const r = actor.items.get("rifle000000000aa");
  assert.deepEqual(r.system.installedItems.list, ["scope00000000aaa", "fixed00000000aaa"]);
  await assert.rejects(() => HomeOps.detach(actor, "rifle000000000aa", "fixed00000000aaa"), RuleBlock);
  await HomeOps.detach(actor, "rifle000000000aa", "scope00000000aaa");
  assert.deepEqual(r.system.installedItems.list, ["fixed00000000aaa"]);
  await assert.rejects(() => HomeOps.attach(actor, "pistol00000000aa", "fixed00000000aaa"), /attached to something else/);
});

test("vehicles: add, park, swap and pick a ride", async () => {
  const { actor } = setup();
  const a = makeActor({ name: "Car A", type: "character", flags: { "mmutons-cyberpunk-red-vas": { positions: [] } } });
  const b = makeActor({ name: "Car B", type: "character", flags: { "mmutons-cyberpunk-red-vas": { positions: [] } } });
  await HomeOps.updateHome(actor, { bayOverride: 1 });
  await HomeOps.addVehicle(actor, a.uuid);
  await HomeOps.addVehicle(actor, b.uuid);
  let home = HomeStore.home(actor);
  assert.equal(home.vehicles.find((v) => v.uuid === a.uuid).bay, 0);
  assert.equal(home.vehicles.find((v) => v.uuid === b.uuid).bay, null);
  await HomeOps.park(actor, b.uuid, 0);
  home = HomeStore.home(actor);
  assert.equal(home.vehicles.find((v) => v.uuid === b.uuid).bay, 0);
  assert.equal(home.vehicles.find((v) => v.uuid === a.uuid).bay, null);
  await HomeOps.setActive(actor, a.uuid);
  assert.equal(HomeStore.home(actor).vehicles.find((v) => v.uuid === a.uuid).active, true);
  await assert.rejects(() => HomeOps.addVehicle(actor, actor.uuid), /isn't a vehicle/);
});

test("Catharsis: gained falling into a tier, then takes the next loss", async () => {
  asUser(true);
  const { actor } = setup();
  // 32 -> 25: into EMP 2, +8 Catharsis.
  actor.system.derivedStats.humanity.value = 25;
  await HomeOps.onHumanityChanged(actor, 32);
  let p = HomeStore.psyche(actor);
  assert.equal(p.catharsis, 8);
  assert.equal(p.lastTier, 1);
  // 25 -> 20: the buffer takes all 5.
  actor.system.derivedStats.humanity.value = 20;
  await HomeOps.onHumanityChanged(actor, 25);
  p = HomeStore.psyche(actor);
  assert.equal(actor.system.derivedStats.humanity.value, 25);
  assert.equal(p.catharsis, 3);
  // 25 -> 15: 3 absorbed, 7 lost -> 18, into EMP 1: +10.
  actor.system.derivedStats.humanity.value = 15;
  await HomeOps.onHumanityChanged(actor, 25);
  p = HomeStore.psyche(actor);
  assert.equal(actor.system.derivedStats.humanity.value, 18);
  assert.equal(p.catharsis, 10);
  assert.equal(p.deepest, 2);
});

test("Inspiration: spending one restores 2 LUCK", async () => {
  const { actor } = setup();
  actor.system.stats.luck = { value: 2, max: 7 };
  await HomeOps.updatePsyche(actor, (p) => {
    p.inspiration = 1;
  });
  await HomeOps.spendInspiration(actor, "luck");
  assert.equal(actor.system.stats.luck.value, 4);
  await assert.rejects(() => HomeOps.spendInspiration(actor, "luck"), RuleBlock);
});
