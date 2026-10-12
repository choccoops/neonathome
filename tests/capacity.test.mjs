import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CARRY_RULES, normalizeCarryRules, classFromName, classFromSP, describeArmor, describeCarry, computeLoadout,
  canInstallUpgrade, armorEffects, wouldFit, poolsThatWontTake
} from "../scripts/data/capacity.js";

const M = "cpr-neon-at-home";
const rules = normalizeCarryRules({});
let n = 0;
const id = () => `i${++n}`;

const armor = (name, { sp = 11, head = false, equipped = "equipped", penalty = 0, list = [], flag } = {}) => ({
  _id: id(), name, type: "armor",
  system: {
    equipped, isBodyLocation: !head, isHeadLocation: head, isShield: false, penalty,
    bodyLocation: { sp: head ? 0 : sp, ablation: 0 }, headLocation: { sp: head ? sp : 0, ablation: 0 },
    installedItems: { list, slots: 3 }
  },
  flags: flag ? { [M]: { item: flag } } : {}
});
const weapon = (name, { weaponType = "heavyPistol", handsReq = 1, equipped = "carried", weaponSkill = "Handgun", list = [] } = {}) => ({
  _id: id(), name, type: "weapon", system: { equipped, weaponType, handsReq, weaponSkill, installedItems: { list } }, flags: {}
});
const ammo = (name, variety = "heavyPistol", amount = 50) => ({ _id: id(), name, type: "ammo", system: { variety, amount }, flags: {} });
const gear = (name, { equipped = "carried", flag } = {}) => ({ _id: id(), name, type: "gear", system: { equipped }, flags: flag ? { [M]: { item: flag } } : {} });
const upgrade = (name, flag, { size = 1, type = "armor" } = {}) => ({ _id: id(), name, type: "itemUpgrade", system: { type, size }, flags: { [M]: { item: flag } } });

test("rules default to the spreadsheet and clamp what the GM enters", () => {
  assert.equal(rules.classes.unarmored.carry, 10);
  assert.equal(rules.classes.metalgear.carry, 42);
  assert.equal(rules.classes.flak.upgrades, 8);
  assert.equal(rules.costs.twoHanded, 3);
  assert.equal(rules.costs.heavy, 4);
  const odd = normalizeCarryRules({ classes: { light: { carry: -4, upgrades: "x" } }, costs: { ammo: 500 } });
  assert.equal(odd.classes.light.carry, 0);
  assert.equal(odd.classes.light.upgrades, 0);
  assert.equal(odd.costs.ammo, 99);
  assert.equal(odd.classes.heavy.carry, DEFAULT_CARRY_RULES.classes.heavy.carry);
});

test("armor class from name, then stopping power", () => {
  assert.equal(classFromName("Light Armorjack (Body)"), "light");
  assert.equal(classFromName("Heavy Armorjack (Head)"), "heavy");
  assert.equal(classFromName("Metalgear (Body)"), "metalgear");
  assert.equal(classFromName("Flak (Body)"), "flak");
  assert.equal(classFromName("Kevlar (Body)"), "unarmored");
  assert.equal(classFromName("Mystery Coat"), "");
  assert.equal(classFromSP(7), "unarmored");
  assert.equal(classFromSP(11), "light");
  assert.equal(classFromSP(12), "medium");
  assert.equal(classFromSP(13), "heavy");
  assert.equal(classFromSP(15), "flak");
  assert.equal(classFromSP(18), "metalgear");
  const flagged = describeArmor(armor("Mystery Coat", { sp: 4, flag: { armorClass: "flak" } }), M, rules);
  assert.equal(flagged.cls, "flak");
  assert.equal(flagged.upgradeSlots, 8);
});

test("slot costs by kind; owned, installed and worn things cost nothing", () => {
  const ctx = { installed: new Set() };
  assert.equal(describeCarry(weapon("Pistol"), M, rules, ctx).cost, 2);
  assert.equal(describeCarry(weapon("Rifle", { weaponType: "assaultRifle", handsReq: 2 }), M, rules, ctx).cost, 3);
  assert.equal(describeCarry(weapon("RPG", { weaponType: "rocketLauncher", handsReq: 2 }), M, rules, ctx).cost, 4);
  assert.equal(describeCarry(weapon("Minigun", { weaponType: "assaultRifle", handsReq: 2, weaponSkill: "Heavy Weapons" }), M, rules, ctx).cost, 4);
  assert.equal(describeCarry(ammo("Rounds"), M, rules, ctx).cost, 1);
  assert.equal(describeCarry(gear("Agent"), M, rules, ctx).cost, 1);
  assert.equal(describeCarry(weapon("Pistol", { equipped: "owned" }), M, rules, ctx).cost, 0);
  assert.equal(describeCarry(armor("Light Armorjack"), M, rules, ctx).cost, 0);
  assert.equal(describeCarry(armor("Light Armorjack", { equipped: "carried" }), M, rules, ctx).cost, 3);
  const scope = { ...upgrade("Scope", {}, { type: "weapon" }) };
  assert.equal(describeCarry(scope, M, rules, { installed: new Set([scope._id]) }).cost, 0);
  const custom = gear("Big Case", { flag: { slots: 5 } });
  assert.equal(describeCarry(custom, M, rules, ctx).cost, 5);
  const ownedCounts = normalizeCarryRules({ ownedCounts: true });
  assert.equal(describeCarry(weapon("Pistol", { equipped: "owned" }), M, ownedCounts, ctx).cost, 2);
});

test("worn body armor sets carry slots", () => {
  const none = computeLoadout([weapon("Pistol")], rules, M);
  assert.equal(none.armorClass, "unarmored");
  assert.equal(none.capacity, 10);
  assert.equal(none.used, 2);
  const heavy = computeLoadout([armor("Heavy Armorjack (Body)", { sp: 13 }), armor("Light Armorjack (Head)", { head: true })], rules, M);
  assert.equal(heavy.armorClass, "heavy");
  assert.equal(heavy.capacity, 25);
  const carried = computeLoadout([armor("Metalgear (Body)", { sp: 18, equipped: "carried" })], rules, M);
  assert.equal(carried.armorClass, "unarmored");
  assert.equal(carried.used, 3);
});

test("bonus pools: holster takes pistols and pistol ammo, bag adds general slots", () => {
  const holster = gear("Shoulder holster", { equipped: "equipped", flag: { carry: { noArmor: true, group: "holster", pools: [{ slots: 4, accepts: "pistol" }, { slots: 2, accepts: "pistolAmmo" }] } } });
  const bag = gear("Carryall Bag", { equipped: "equipped", flag: { carry: { pools: [{ slots: 10, accepts: "any" }] } } });
  const items = [holster, bag, weapon("Pistol A"), weapon("Pistol B"), weapon("Pistol C"), ammo("HP rounds"), ammo("Rifle rounds", "rifle")];
  const l = computeLoadout(items, rules, M);
  assert.equal(l.capacity, 20);
  const pistolPool = l.pools.find((p) => p.accepts === "pistol");
  assert.equal(pistolPool.used, 4);
  assert.equal(l.pools.find((p) => p.accepts === "pistolAmmo").used, 1);
  // third pistol (2) and the rifle rounds (1) go to the general slots
  assert.equal(l.used, 3);
  assert.equal(l.over, false);
});

test("a holster can't be used with armor, and only one per group counts", () => {
  const holsterFlag = { carry: { noArmor: true, group: "holster", pools: [{ slots: 4, accepts: "pistol" }] } };
  const l = computeLoadout([armor("Light Armorjack (Body)"), gear("Holster", { equipped: "equipped", flag: holsterFlag }), weapon("Pistol")], rules, M);
  assert.equal(l.pools.length, 0);
  assert.equal(l.warnings[0].key, "noArmor");
  const two = computeLoadout([gear("H1", { equipped: "equipped", flag: holsterFlag }), gear("H2", { equipped: "equipped", flag: holsterFlag })], rules, M);
  assert.equal(two.pools.length, 1);
  assert.equal(two.warnings[0].key, "group");
});

test("over capacity is flagged and wouldFit checks a change", () => {
  const items = [weapon("R1", { weaponType: "assaultRifle", handsReq: 2 }), weapon("R2", { weaponType: "assaultRifle", handsReq: 2 }), weapon("P1")];
  const l = computeLoadout(items, rules, M);
  assert.equal(l.used, 8);
  assert.equal(l.over, false);
  const extra = weapon("R3", { weaponType: "assaultRifle", handsReq: 2 });
  assert.equal(wouldFit(items, { id: extra._id, data: extra }, rules, M).fits, false);
  const lighter = { ...items[2], system: { ...items[2].system, equipped: "owned" } };
  assert.equal(wouldFit(items, { id: lighter._id, data: lighter }, rules, M).after.used, 6);
});

test("armor upgrades: class, location, requirements and slots", () => {
  const neuro = upgrade("Neuro-port", { upgrade: { key: "neuroport", location: "head", classes: ["flak", "metalgear"] } }, { size: 3 });
  const ai = upgrade("AI Armor Interface", { upgrade: { key: "aiInterface", location: "head", classes: ["flak", "metalgear"], requires: "neuroport" } }, { size: 3 });
  const knife = upgrade("Combat Knife", { upgrade: { key: "combatKnife", location: "body", classes: ["light", "medium", "heavy"] } });
  const helmet = armor("Flak (Head)", { sp: 15, head: true, list: [] });
  const items = [helmet, neuro, ai, knife];
  const l = computeLoadout(items, rules, M);
  const h = l.armors[0];
  assert.equal(h.upgradeSlots, 8);
  assert.equal(canInstallUpgrade(h, ai, M).reason, "requires");
  assert.equal(canInstallUpgrade(h, knife, M).reason, "location");
  assert.equal(canInstallUpgrade(h, neuro, M).ok, true);
  helmet.system.installedItems.list = [neuro._id];
  const h2 = computeLoadout(items, rules, M).armors[0];
  assert.equal(h2.upgradesUsed, 3);
  assert.equal(canInstallUpgrade(h2, ai, M).ok, true);
  assert.equal(canInstallUpgrade(h2, neuro, M).reason, "duplicate");
  const light = computeLoadout([armor("Light Armorjack (Body)", { sp: 11 }), knife], rules, M).armors[0];
  const flex = upgrade("Improved Flexibility", { upgrade: { key: "flex", location: "body", classes: ["medium", "heavy"] } }, { size: 3 });
  assert.equal(canInstallUpgrade(light, flex, M).reason, "class");
  const big = upgrade("Big", {}, { size: 5 });
  assert.equal(canInstallUpgrade(light, big, M).reason, "slots");
  assert.equal(canInstallUpgrade(light, upgrade("Scope", {}, { type: "weapon" }), M).reason, "type");
});

test("ammo bag on worn armor adds an ammo-only pool", () => {
  const bag = upgrade("Ammo bag", { upgrade: { key: "ammoBag", location: "body", pools: [{ slots: 2, accepts: "ammo" }] } });
  const jack = armor("Medium Armorjack (Body)", { sp: 12, list: [bag._id] });
  const l = computeLoadout([jack, bag, ammo("A"), ammo("B"), ammo("C")], rules, M);
  assert.equal(l.capacity, 21);
  assert.equal(l.pools[0].used, 2);
  assert.equal(l.used, 1);
});

test("armor effects: penalty relief, stealth, war paint pair", () => {
  const flex = upgrade("Improved Flexibility", { upgrade: { effects: ["reliefDex"] } }, { size: 3 });
  const pad = upgrade("Plate Padding", { upgrade: { effects: ["stealth"] } });
  const paintB = upgrade("War Paint", { upgrade: { effects: ["warPaint"], pair: true } }, { size: 0 });
  const paintH = upgrade("War Paint", { upgrade: { effects: ["warPaint"], pair: true } }, { size: 0 });
  const bodyA = armor("Heavy Armorjack (Body)", { sp: 13, penalty: -2, list: [flex._id, pad._id, paintB._id] });
  const head = armor("Light Armorjack (Head)", { sp: 11, head: true, list: [paintH._id] });
  const fx = armorEffects(computeLoadout([bodyA, head, flex, pad, paintB, paintH], rules, M).armors);
  const keys = Object.fromEntries(fx.changes.map((c) => [c.key, c.value]));
  assert.equal(keys["system.stats.dex.value"], 2);
  assert.equal(keys["system.stats.ref.value"], undefined);
  assert.equal(keys["bonuses.stealth"], 2);
  assert.equal(keys["bonuses.wardrobeAndStyle"], 2);
  // a penalised helmet without relief keeps the penalty
  const badHead = armor("Heavy Armorjack (Head)", { sp: 13, head: true, penalty: -2 });
  const fx2 = armorEffects(computeLoadout([bodyA, badHead, flex, pad, paintB], rules, M).armors);
  assert.equal(fx2.changes.find((c) => c.key === "system.stats.dex.value"), undefined);
  assert.equal(fx2.changes.find((c) => c.key === "bonuses.wardrobeAndStyle"), undefined);
});

test("Neon Hub lifestyle items take no slots, even equipped", () => {
  const kibble = { _id: "kib", name: "Kibble", type: "gear", system: { equipped: "equipped", amount: 1 }, flags: { "cpr-neon-hub": { lifestyle: { category: "lifestyle" } } } };
  const flat = { _id: "apt", name: "Cube Apartment", type: "gear", system: { equipped: "equipped", amount: 1 }, flags: { "cpr-neon-hub": { lifestyle: { category: "housing" } } } };
  const l = computeLoadout([kibble, flat, gear("Agent")], rules, M);
  assert.equal(l.used, 1);
  assert.equal(l.items.find((d) => d.id === "kib").onPerson, false);
});

test("cyberware installed in the body (the actor's own list) takes no slots and doesn't fill gear pools", () => {
  const link = { _id: "neural", name: "Neural Link", type: "cyberware", system: { installedItems: { list: [] } }, flags: {} };
  const bag = upgrade("Gear bag", { upgrade: { pools: [{ slots: 2, accepts: "utility" }] } });
  const jack = armor("Medium Armorjack (Body)", { sp: 12, list: [bag._id] });
  const without = computeLoadout([jack, bag, link], rules, M);
  assert.equal(without.pools[0].used, 1, "seen as loose gear when the actor's list is ignored");
  const l = computeLoadout([jack, bag, link], rules, M, { actorInstalled: ["neural"] });
  assert.equal(l.used, 0);
  assert.equal(l.pools[0].used, 0);
});

test("a gear-only bonus pool doesn't take a pistol, and the pop-up can say why", () => {
  const bag = upgrade("Gear bag", { upgrade: { pools: [{ slots: 2, accepts: "utility" }] } });
  const jack = armor("Medium Armorjack (Body)", { sp: 12, list: [bag._id] });
  const rifles = Array.from({ length: 7 }, (_, i) => weapon(`R${i}`, { weaponType: "assaultRifle", handsReq: 2 }));
  const pistol = weapon("Heavy Pistol");
  const l = computeLoadout([jack, bag, ...rifles, pistol], rules, M);
  assert.equal(l.used, 23);
  assert.equal(l.pools[0].used, 0, "the pistol didn't go in the gear bag");
  assert.deepEqual(poolsThatWontTake(l, pistol._id), [{ name: "Gear bag", free: 2, accepts: "utility" }]);
  const agent = gear("Agent");
  const l2 = computeLoadout([jack, bag, ...rifles, agent], rules, M);
  assert.equal(l2.pools[0].used, 1, "gear goes in the bag");
  assert.deepEqual(poolsThatWontTake(l2, agent._id), []);
});
