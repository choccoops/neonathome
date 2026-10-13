/** Breaking Your Stuff's rules as data: tiers, Lifestyle, kinds, Roles, worth, malfunctions, conditions. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tierOf, lifestyleTier, kindOf, tableOf, roleBonus, rolesOf, worth, priceCategory, maintenanceStatus,
  maintenanceList, flattenList, tally, malfunctionResult, malfunctionState, fieldExpertise, MALFUNCTIONS, TABLE_KEYS, isMaintainable
} from "../scripts/data/maintenance.js";
import { itemStates } from "../scripts/data/condition.js";
import { normalizeItemFlag } from "../scripts/data/item-flag.js";

const M = "cpr-neon-at-home";
const HUB = "cpr-neon-hub";
const flag = (f) => ({ [M]: { item: f } });

test("value tiers: gear and drones/vehicles have their own scales (p.5)", () => {
  assert.equal(tierOf(0), 1);
  assert.equal(tierOf(499), 1);
  assert.equal(tierOf(500), 2);
  assert.equal(tierOf(1000), 3);
  assert.equal(tierOf(5000), 4);
  assert.equal(tierOf(19999, true), 1);
  assert.equal(tierOf(20000, true), 2);
  assert.equal(tierOf(100000, true), 4);
});

test("Lifestyle tier from Neon Hub packages in both eras, else the character sheet", () => {
  const pkg = (tier, equipped = "equipped", extra = {}) => ({ type: "gear", system: { equipped }, flags: { [HUB]: { lifestyle: { category: "lifestyle", tier, ...extra } } } });
  // 2045 (Generic Prepak+) and 2070 (Good PrePak with its environment): same tier scale
  assert.equal(lifestyleTier([pkg(2, "equipped", { plus: true })], {}), 2);
  assert.equal(lifestyleTier([pkg(3, "equipped", { era: "2070", env: "" }), pkg(1, "owned")], {}), 3);
  assert.equal(lifestyleTier([pkg(4, "equipped", { era: "2070", env: "fresh" })], {}), 4);
  // a package that isn't active doesn't count; housing isn't a package
  const housing = { type: "gear", system: { equipped: "equipped" }, flags: { [HUB]: { lifestyle: { category: "housing", parking: 1 } } } };
  assert.equal(lifestyleTier([pkg(4, "owned"), housing], { lifestyle: { lifeStyle: { description: "Kibble", cost: 100 } } }), 1);
  assert.equal(lifestyleTier([], { lifestyle: { lifeStyle: { description: "Good Prepak", cost: 0 } } }), 3);
  assert.equal(lifestyleTier([], { lifestyle: { lifeStyle: { description: "", cost: 1500 } } }), 4);
  assert.equal(lifestyleTier([], {}), 0);
});

test("kinds and their skills, and the malfunction table for each piece", () => {
  const cw = (type, name = "Thing") => ({ name, type: "cyberware", system: { type } });
  assert.equal(kindOf({ type: "weapon", system: {} }, M), "weapon");
  assert.equal(kindOf({ type: "gear", name: "Agent", system: { isElectronic: true } }, M), "electronics");
  assert.equal(kindOf({ type: "gear", name: "Rope", system: {} }, M), "gear");
  assert.equal(kindOf({ type: "gear", name: "Recon Drone", system: {} }, M), "drone");
  assert.equal(kindOf({ type: "vehicle", name: "AV-4", system: {} }, M), "vehicleAir");
  assert.equal(kindOf({ type: "vehicle", name: "Speedboat", system: {} }, M), "vehicleSea");
  assert.equal(kindOf({ type: "vehicle", name: "Superbike", system: {} }, M), "vehicleLand");
  assert.equal(kindOf({ type: "itemUpgrade", system: { type: "weapon" } }, M), "weapon");
  assert.equal(kindOf({ type: "gear", system: {}, flags: flag({ maint: { kind: "drone" } }) }, M), "drone", "the GM's override");
  assert.equal(tableOf(cw("cyberArm"), M), "cyberlimb");
  assert.equal(tableOf(cw("cyberEye"), M), "cyberSenses");
  assert.equal(tableOf(cw("neuralWare"), M), "neuralware");
  assert.equal(tableOf(cw("fashionware"), M), "cyberBody");
  assert.equal(tableOf(cw("borgware", "Linear Frame Sigma"), M), "linearFrame");
  assert.equal(tableOf(cw("borgware", "Artificial Shoulder Mount"), M), "cyberlimb");
  assert.equal(tableOf({ type: "gear", name: "Cyberchair", system: {} }, M), "linearFrame");
  assert.equal(tableOf({ type: "gear", name: "Agent", system: {} }, M), "general");
  assert.equal(TABLE_KEYS.length, 11);
  for (const k of TABLE_KEYS) assert.equal(MALFUNCTIONS[k].results.length, 6, `${k} has 6 results`);
});

test("things that aren't gear aren't maintained", () => {
  assert.equal(isMaintainable({ type: "ammo", system: {} }), false);
  assert.equal(isMaintainable({ type: "program", system: {} }), false);
  assert.equal(isMaintainable({ type: "cyberware", system: { core: true } }), false, "the body's built-in containers");
  assert.equal(isMaintainable({ type: "gear", system: {}, flags: { [HUB]: { lifestyle: { category: "lifestyle" } } } }), false, "Neon Hub lifestyle items");
  assert.equal(isMaintainable({ type: "clothing", system: {} }), true);
});

test("Roles count their Lifestyle a level higher for their trade (p.4)", () => {
  assert.equal(roleBonus(["tech"], "gear", { name: "Rope" }), "tech");
  assert.equal(roleBonus(["solo"], "weapon", { name: "Rifle" }), "solo");
  assert.equal(roleBonus(["lawman"], "armor", { name: "Armorjack" }), "lawman");
  assert.equal(roleBonus(["solo"], "cyberware", { name: "Cyberarm" }), null);
  assert.equal(roleBonus(["netrunner"], "cyberdeck", { name: "Deck" }), "netrunner");
  assert.equal(roleBonus(["netrunner"], "gear", { name: "Virtuality Goggles" }), "netrunner");
  assert.equal(roleBonus(["media"], "electronics", { name: "Video Camera" }), "media");
  assert.equal(roleBonus(["rockerboy"], "gear", { name: "Electric Guitar" }), "rockerboy");
  assert.deepEqual(rolesOf([{ type: "role", name: "Solo" }, { type: "skill", name: "Tech" }]), ["solo"]);
});

test("what Damaged and Destroyed gear sells for (p.3)", () => {
  assert.equal(priceCategory(500), 4);
  assert.deepEqual(worth(500, ""), { eb: 500, category: "expensive", drop: 0 });
  assert.deepEqual(worth(500, "damaged"), { eb: 100, category: "premium", drop: 1 }, "a Damaged Assault Rifle sells for 100eb");
  assert.deepEqual(worth(500, "destroyed"), { eb: 50, category: "costly", drop: 2 }, "a Destroyed one for 50eb");
  assert.equal(worth(500, "dbr").eb, 0);
  assert.equal(worth(10, "damaged").eb, 0, "nothing below Cheap");
});

test("maintenance status: exempt, covered, maintained this cycle, or due with missed cycles", () => {
  const f = (raw) => normalizeItemFlag(raw);
  const own = (n) => ({ scheme: "own", n });
  assert.equal(maintenanceStatus(f({ maint: { exempt: "exec" } }), { cycle: own(3), covered: false }).status, "exempt");
  assert.equal(maintenanceStatus(f({}), { cycle: own(3), covered: true }).status, "covered");
  assert.equal(maintenanceStatus(f({ missCycle: 3 }), { cycle: own(3), covered: true }).status, "due", "a malfunction can make it miss a cycle");
  assert.equal(maintenanceStatus(f({ maintained: 3 }), { cycle: own(3), covered: false }).status, "maintained", "a bare number is the GM's own counter");
  assert.deepEqual(maintenanceStatus(f({ maintained: { scheme: "own", n: 1 } }), { cycle: own(4), covered: false }), { status: "due", missed: 2 });
  assert.deepEqual(maintenanceStatus(f({}), { cycle: own(4), covered: false }), { status: "due", missed: 0 });
});

test("months counted different ways aren't compared (the GM's counter vs Neon Hub's Rent Day)", () => {
  const f = (raw) => normalizeItemFlag(raw);
  const rent = { scheme: "cal", n: 2045 * 12 + 10 };
  // maintained in the GM's month 3, then the world switched to Rent Day: due, with no wear to show
  assert.deepEqual(maintenanceStatus(f({ maintained: 3 }), { cycle: rent, covered: false }), { status: "due", missed: 0 });
  // a huge rent-month number doesn't count as "maintained" on the GM's counter either
  assert.equal(maintenanceStatus(f({ maintained: rent }), { cycle: { scheme: "own", n: 4 }, covered: false }).status, "due");
  assert.equal(maintenanceStatus(f({ maintained: rent }), { cycle: rent, covered: false }).status, "maintained");
  assert.deepEqual(maintenanceStatus(f({ maintained: rent }), { cycle: { scheme: "cal", n: rent.n + 3 }, covered: false }), { status: "due", missed: 2 });
  assert.equal(normalizeItemFlag({ maintained: { scheme: "nope", n: 1 } }).maintained, null);
});

test("a character's gear as trees: parts maintained separately, core containers left out", () => {
  const items = [
    { _id: "rifle", name: "Rifle", type: "weapon", system: { price: { market: 500 }, installedItems: { list: ["scope", "ammo"] } } },
    { _id: "scope", name: "Scope", type: "itemUpgrade", system: { type: "weapon", price: { market: 100 } }, flags: flag({ condition: "damaged", hidden: true }) },
    { _id: "ammo", name: "Rounds", type: "ammo", system: {} },
    { _id: "int", name: "Internal Cyberware", type: "cyberware", system: { core: true, type: "cyberwareInternal", installedItems: { list: ["nasal"] } } },
    { _id: "nasal", name: "Nasal Filters", type: "cyberware", system: { type: "cyberwareInternal", price: { market: 100 } } },
    { _id: "deck", name: "Deck", type: "cyberdeck", system: { price: { market: 1000 } }, flags: flag({ condition: "destroyed", malfunction: { table: "cyberdeck", roll: 2, at: 0, until: 60 } }) },
    { _id: "solo", name: "Solo", type: "role", system: {} }
  ];
  const list = maintenanceList(items, { moduleId: M, cycle: { scheme: "own", n: 2 }, lifestyle: 1, roles: rolesOf(items), now: 10 });
  assert.deepEqual(list.map((e) => e.id), ["rifle", "nasal", "deck"], "options in the body's containers are top level; ammo isn't gear");
  const rifle = list[0];
  assert.deepEqual(rifle.children.map((c) => c.id), ["scope"]);
  // 500eb needs Generic Prepak; Kibble + 1 for a Solo's weapon covers it
  assert.equal(rifle.tier, 2);
  assert.equal(rifle.roleBonus, "solo");
  assert.equal(rifle.status, "covered");
  assert.equal(list[2].status, "due", "a 1,000eb deck needs Good Prepak");
  assert.equal(list[2].dv, 17);
  assert.equal(list[2].skill, "Electronics/Security Tech");
  assert.equal(list[2].malfunction.roll, 2);
  const flat = flattenList(list);
  assert.equal(flat.find((e) => e.id === "scope").depth, 1);
  assert.deepEqual(tally(list), { total: 4, covered: 3, maintained: 0, due: 1, damaged: 1, destroyed: 1, malfunctioning: 1 });
  // the malfunction is over once world time passes its end
  assert.equal(maintenanceList(items, { moduleId: M, cycle: { scheme: "own", n: 2 }, lifestyle: 1, roles: [], now: 60 })[2].malfunction, null);
});

test("malfunction results and jury rigs", () => {
  const r = malfunctionResult("weapon", 2);
  assert.equal(r.duration, "now");
  assert.equal(r.action, "drop");
  assert.equal(r.page, 10);
  assert.equal(malfunctionResult("general", 3).action, "destroy");
  assert.equal(malfunctionResult("nope", 1), null);
  const m = { table: "armor", roll: 1, at: 0, until: 86400, rigUntil: 600, rigMinutes: 10 };
  assert.equal(malfunctionState(m, 100).rigged, true);
  assert.equal(malfunctionState(m, 700).rigged, false);
  assert.equal(malfunctionState(m, 86400), null);
  assert.equal(fieldExpertise([{ type: "role", name: "Tech", system: { abilities: [{ name: "Field Expertise", rank: 3 }, { name: "Upgrade Expertise", rank: 1 }] } }]), 3);
  assert.equal(fieldExpertise([{ type: "role", name: "Solo", system: { abilities: [] } }]), 0);
});

test("conditions: what doesn't work takes what's installed in it down too", () => {
  const items = [
    { _id: "arm", type: "cyberware", system: { installedItems: { list: ["gun"] } }, flags: flag({ condition: "destroyed" }) },
    { _id: "gun", type: "cyberware", system: { installedItems: { list: [] } }, flags: flag({ emp: true }) },
    { _id: "pistol", type: "weapon", system: { installedItems: { list: ["mag"] } }, flags: flag({ condition: "damaged" }) },
    { _id: "mag", type: "itemUpgrade", system: {} }
  ];
  const s = itemStates(items, M);
  assert.equal(s.get("arm").state, "destroyed");
  assert.equal(s.get("gun").own, "emp");
  assert.equal(s.get("gun").state, "destroyed", "the worse of its own and its arm's");
  assert.equal(s.get("pistol").state, "", "Damaged still works");
  assert.equal(s.get("pistol").damaged, true);
  assert.equal(s.get("mag").inherited, false);
  assert.equal(s.get("mag").parent, "pistol");
});
