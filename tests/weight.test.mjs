import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWeightRules, computeWeight, baseWeight } from "../scripts/data/weight.js";

const M = "cpr-neon-at-home";
const rules = normalizeWeightRules({});
let n = 0;
const it = (type, system = {}, flags = {}, name = `Item ${++n}`) => ({ _id: `w${++n}`, name, type, system, flags });

test("weights: own flag, then MMuton's flag, then the GM's default", () => {
  assert.equal(baseWeight(it("weapon", { weaponType: "assaultRifle" }), rules, M), 4);
  assert.equal(baseWeight(it("weapon", { weaponType: "assaultRifle" }, { [M]: { item: { weight: 7 } } }), rules, M), 7);
  assert.equal(baseWeight(it("gear", {}, { "mmutons-cyberpunk-red-weight-system": { weight: { value: 2.5 } } }), rules, M), 2.5);
  assert.equal(baseWeight(it("skill"), rules, M), 0);
  assert.equal(baseWeight(it("armor", { isBodyLocation: true, bodyLocation: { sp: 15 } }, {}, "Flak (Body)"), rules, M), 10);
});

test("capacity: BODY x multiplier or fixed, plus installed cyberware bonus", () => {
  const w = computeWeight([], rules, { body: 6, moduleId: M });
  assert.equal(w.max, 18);
  const fixed = computeWeight([], normalizeWeightRules({ method: "custom", custom: 40 }), { body: 6, moduleId: M });
  assert.equal(fixed.max, 40);
  const arm = it("cyberware", { installedItems: { list: [] } }, { [M]: { item: { capacityBonus: 5 } } });
  const owner = { _id: "actorware", type: "cyberware", system: { installedItems: { list: [arm._id] } }, flags: {} };
  const w2 = computeWeight([arm, owner], rules, { body: 6, moduleId: M });
  assert.equal(w2.bonus, 5);
  assert.equal(w2.max, 23);
});

test("equipped weapons weigh a third, worn clothes and owned items nothing", () => {
  const rifle = it("weapon", { weaponType: "assaultRifle", equipped: "equipped" });
  const spare = it("weapon", { weaponType: "assaultRifle", equipped: "carried" });
  const home = it("weapon", { weaponType: "assaultRifle", equipped: "owned" });
  const jacket = it("clothing", { equipped: "equipped" });
  const w = computeWeight([rifle, spare, home, jacket], rules, { body: 6, moduleId: M });
  assert.equal(w.current, 5.3);
  const full = computeWeight([rifle], normalizeWeightRules({ equipped: 1 }), { body: 6, moduleId: M });
  assert.equal(full.current, 4);
});

test("attachments add to the weapon they're on; ammo by the round", () => {
  const scope = it("itemUpgrade", {}, { [M]: { item: { weight: 1 } } });
  const gun = it("weapon", { weaponType: "heavyPistol", equipped: "carried", installedItems: { list: [scope._id] } });
  const rounds = it("ammo", { variety: "heavyPistol", amount: 50 });
  const w = computeWeight([gun, scope, rounds], rules, { body: 6, moduleId: M });
  assert.equal(w.items.find((e) => e.id === gun._id).total, 2);
  assert.equal(w.items.find((e) => e.id === rounds._id).total, 1);
  assert.equal(w.current, 3);
  const noUp = computeWeight([gun, scope], normalizeWeightRules({ includeUpgrades: false }), { body: 6, moduleId: M });
  assert.equal(noUp.current, 1);
});

test("status thresholds", () => {
  const heavy = it("gear", { equipped: "carried", amount: 1 }, { [M]: { item: { weight: 15 } } });
  assert.equal(computeWeight([heavy], rules, { body: 6, moduleId: M }).status, "heavy");
  const over = it("gear", { equipped: "carried", amount: 1 }, { [M]: { item: { weight: 19 } } });
  assert.equal(computeWeight([over], rules, { body: 6, moduleId: M }).status, "over");
});

test("vehicle cargo uses the vehicle's capacity", () => {
  const crate = it("gear", { equipped: "owned", amount: 2 }, { [M]: { item: { weight: 5 } } });
  const w = computeWeight([crate], rules, { moduleId: M, vehicle: true, cargo: 40 });
  assert.equal(w.current, 10);
  assert.equal(w.max, 40);
});

test("Neon Hub lifestyle items weigh nothing", () => {
  const kibble = it("gear", { equipped: "equipped", amount: 3 }, { "cpr-neon-hub": { lifestyle: { category: "lifestyle" } } });
  assert.equal(computeWeight([kibble], rules, { body: 6, moduleId: M }).current, 0);
});
