/** Salvaging (Salvaging Night City, and the 2070 version) and Tech Materials: stripping gear, hauls, paying for Maker work. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, chat, dice } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { SalvageOps } = await import("../scripts/home/salvage-ops.js");
const { CPR } = await import("../scripts/cpr.js");
const salvage = await import("../scripts/data/salvage.js");
const materials = await import("../scripts/data/materials.js");

await game.settings.set(M, "downtimeOn", true);

/** CPR's Basic Tech roll comes out at `total` (critFail: a natural 1). */
function rolls(total, critFail = false) {
  CPR.skillCheck = async () => (total === null ? null : { total, html: "<roll>", critFail, critSuccess: false });
}

function character(name, roles = [], extra = []) {
  return makeActor({
    name, type: "character",
    system: { stats: { body: { value: 6 } }, derivedStats: { hp: { value: 30, max: 40 } }, wealth: { value: 1000, transactions: [] }, installedItems: { list: [] } }
  }, [...roles.map(([role, rank], i) => ({ _id: `role${i}`, name: role, type: "role", system: { rank, abilities: [] } })), ...extra]);
}

const matsOf = (actor) => actor.items.filter((i) => i.flags?.[M]?.materials);

/* ------------------------------------------ */
/*  The rules as data                         */
/* ------------------------------------------ */

test("Salvage Worth: the DV for each worth, taking what turns up or hunting a category (p.4)", () => {
  assert.equal(salvage.salvageWorth(8), 0, "under DV9: nothing");
  assert.equal(salvage.salvageWorth(9), 10);
  assert.equal(salvage.salvageWorth(25), 500, "the DLC's example: 25 beats DV24");
  assert.equal(salvage.salvageWorth(29), 1000);
  assert.equal(salvage.salvageWorth(12, true), 0, "a specific category starts at DV13");
  assert.equal(salvage.salvageWorth(21, true), 100);
  assert.equal(salvage.salvageWorth(40, true), 500, "1,000eb can't be had hunting a category");
});

test("2045 uses the DLC's tables everywhere; 2070 has one Combat Zone, no Hot Zone, and each place its own", () => {
  assert.deepEqual(salvage.locationsOf("2045"), ["hotZone", "combatZone", "scrapyards", "perimeter"]);
  assert.deepEqual(salvage.locationsOf("2070"), ["combatZone", "scrapyards", "perimeter", "badlands"]);
  assert.equal(salvage.rollCategory("2045", "scrapyards", 1), "cyberware");
  assert.equal(salvage.rollCategory("2045", "hotZone", 4), "gear");
  assert.equal(salvage.rollCategory("2070", "scrapyards", 1), "cyberdecks");
  assert.equal(salvage.rollCategory("2070", "badlands", 2), "weapons");
  for (const era of salvage.ERAS) {
    for (const loc of salvage.locationsOf(era)) {
      const t = salvage.locationOf(era, loc);
      assert.equal(t.categories.length, 6);
      assert.equal(t.perils.length, 6);
      for (const c of t.categories) assert.ok(salvage.CATEGORIES.includes(c), `${era} ${loc}: ${c}`);
      for (const [k] of t.perils) assert.ok(salvage.PERIL_RULES[k], `${era} ${loc}: ${k}`);
    }
  }
  assert.equal(salvage.rollPeril("2070", "combatZone", 2).kind, "firefight");
  assert.match(salvage.rollPeril("2070", "combatZone", 2).text, /Voodoo Boys/);
});

test("gear that keeps a peril off, or saves you from it", () => {
  assert.equal(salvage.perilGear("radiation", [{ name: "Radiation Suit" }]), "Radiation Suit");
  assert.equal(salvage.perilGear("gas", [{ name: "Anti-Smog Breathing Mask" }]), "Anti-Smog Breathing Mask");
  assert.equal(salvage.perilGear("fall", [{ name: "Grapple Gun" }]), "Grapple Gun");
  assert.equal(salvage.perilGear("firefight", [{ name: "Radiation Suit" }]), "");
});

test("materials: what Maker work takes, and stripping several items toward a tier", () => {
  assert.deepEqual(materials.fabricationNeeds(500), { tier: "premium", count: 1 }, "a tier below");
  assert.deepEqual(materials.fabricationNeeds(10), { tier: "cheap", count: 1 });
  assert.deepEqual(materials.fabricationNeeds(50000), { tier: "superLuxury", count: 3 }, "half its price in 10,000eb units");
  assert.deepEqual(materials.upgradeNeeds(100), { tier: "premium", count: 1 });
  assert.deepEqual(materials.upgradeNeeds(20000, { vehicle: true }), { tier: "veryExpensive", count: 1 });
  // a 100eb, a 50eb and two 20eb items make a Premium unit, with 30eb lost
  assert.deepEqual(materials.stripPlan([{ value: 100 }, { value: 50 }, { value: 20, qty: 2 }], "premium"), { total: 190, need: 100, ok: true, waste: 90 });
  assert.equal(materials.stripPlan([{ value: 50 }, { value: 20 }], "premium").ok, false);
  assert.deepEqual(materials.stripPlan([{ value: 500 }], "premium", 5), { total: 500, need: 500, ok: true, waste: 0 }, "an Expensive unit breaks into five Premium");
  assert.equal(materials.partsValue({ system: { price: { market: 500 } }, flags: { [M]: { item: { condition: "damaged" } } } }, M), 100, "Damaged: a tier less");
  assert.equal(materials.partsValue({ system: { price: { market: 500 } }, flags: { [M]: { item: { condition: "dbr" } } } }, M), 0);
  assert.equal(materials.strippable({ type: "weapon", system: { price: { market: 100 }, equipped: "equipped" } }, M), false, "unequip it first");
  assert.equal(materials.strippable({ type: "cyberware", system: { price: { market: 100 }, isInstalled: true } }, M), false);
  assert.equal(materials.strippable({ type: "ammo", system: { price: { market: 100 } } }, M), false);
  assert.equal(materials.strippable({ type: "gear", system: { price: { market: 100 } } }, M), true);
});

/* ------------------------------------------ */
/*  Salvaging                                 */
/* ------------------------------------------ */

test("a week of salvage: the worth, the category rolled, picked out as Destroyed items and Tech Materials", async () => {
  await game.settings.set(M, "salvageEra", "2045");
  const rook = character("Rook", [["Solo", 4]]);
  const shop = makeActor({ name: "Shop", type: "container" }, [
    { _id: "agent", name: "Agent", type: "gear", system: { price: { market: 100 }, equipped: "carried" } },
    { _id: "deck", name: "Cyberdeck", type: "cyberdeck", system: { price: { market: 500 } } },
    { _id: "boom", name: "Grenade Launcher", type: "weapon", system: { price: { market: 500 } } }
  ]);
  rolls(25);
  dice.next = [3];
  const res = await SalvageOps.trip(rook, { location: "scrapyards" });
  assert.deepEqual([res.ok, res.worth, res.category], [true, 500, "gear"], "DV24: 500eb; a 3 finds General Gear");
  assert.match(chat.at(-1).content, /500eb.*General Gear/);
  const haul = SalvageOps.hauls(rook)[0];
  await assert.rejects(SalvageOps.takeItem(rook, haul.id, shop.items.get("deck").uuid), /isn't General Gear/);
  await SalvageOps.takeItem(rook, haul.id, shop.items.get("agent").uuid);
  const agent = rook.items.find((i) => i.name === "Agent");
  assert.equal(agent.flags[M].item.condition, "destroyed", "salvage comes Destroyed (p.4)");
  assert.equal(agent.system.equipped, "owned");
  assert.match(agent.flags[M].salvaged, /General Gear haul, The Scrapyards \(2045\)/);
  await assert.rejects(SalvageOps.takeMaterials(rook, haul.id, "expensive"), /400eb left/, "only 400eb left");
  await SalvageOps.takeMaterials(rook, haul.id, "premium");
  const mat = matsOf(rook)[0];
  assert.equal(mat.name, "Premium Tech Materials");
  assert.match(mat.system.description.value, /Salvaged from:<\/b> a General Gear haul, The Scrapyards \(2045\), by Rook/);
  assert.equal(materials.sourceOf(mat), "a General Gear haul, The Scrapyards (2045), by Rook", "the source, for the books");
  assert.equal(salvage.haulLeft(SalvageOps.hauls(rook)[0]), 300);
  await SalvageOps.leave(rook, haul.id);
  assert.equal(SalvageOps.hauls(rook).length, 0);
  assert.match(chat.at(-1).content, /300eb lost/);
});

test("hunting a category: a harder DV, no category roll; a haul spent to the last eb is done", async () => {
  await game.settings.set(M, "salvageEra", "2070");
  const rook = character("Rook", [["Solo", 4]]);
  rolls(15);
  const res = await SalvageOps.trip(rook, { location: "badlands", category: "weapons" });
  assert.deepEqual([res.worth, res.category, res.haul.era, res.haul.location], [20, "weapons", "2070", "badlands"], "DV15 hunting a category: 20eb");
  await SalvageOps.takeMaterials(rook, res.haul.id, "everyday");
  assert.equal(SalvageOps.hauls(rook).length, 0);
  // nothing found
  rolls(8);
  assert.deepEqual(await SalvageOps.trip(rook, { location: "badlands" }), { ok: false, worth: 0 });
  assert.match(chat.at(-1).content, /nothing worth hauling/);
  // a cancelled roll: nothing happens
  rolls(null);
  assert.equal(await SalvageOps.trip(rook, { location: "badlands" }), null);
});

test("the era follows Neon Hub's lifestyle era unless the GM picks one", async () => {
  await game.settings.set(M, "salvageEra", "auto");
  assert.equal(SalvageOps.era(), "2045", "without Neon Hub");
  game.modules.set("cpr-neon-hub", { active: true });
  const get = game.settings.get;
  game.settings.get = (scope, key) => (scope === "cpr-neon-hub" && key === "lifestyleEra" ? "2070" : get.call(game.settings, scope, key));
  try {
    assert.equal(SalvageOps.era(), "2070");
    await game.settings.set(M, "salvageEra", "2045");
    assert.equal(SalvageOps.era(), "2045", "the GM's pick wins");
  } finally {
    game.settings.get = get;
    game.modules.delete("cpr-neon-hub");
  }
});

test("a Critical Failure: nothing found, a peril with its damage; gear can keep it off", async () => {
  await game.settings.set(M, "salvageEra", "2070");
  const rook = character("Rook", [["Solo", 4]]);
  rolls(1, true);
  dice.next = [2, 21];
  const res = await SalvageOps.trip(rook, { location: "combatZone" });
  assert.equal(res.worth, 0);
  assert.equal(res.peril.kind, "firefight");
  assert.equal(SalvageOps.hauls(rook).length, 0);
  assert.match(chat.at(-1).content, /Voodoo Boys or BARGHEST/);
  assert.match(chat.at(-1).content, /21 damage \(6d6\)/);
  // radiation, with a suit
  const suited = character("Suit", [["Tech", 2]], [{ _id: "suit", name: "Radiation Suit", type: "gear", system: { price: { market: 1000 } } }]);
  dice.next = [3];
  const p = await SalvageOps.suffer(suited, "2070", "scrapyards");
  assert.deepEqual([p.kind, p.gear], ["radiation", "Radiation Suit"]);
  assert.match(chat.at(-1).content, /Radiation Suit keeps it off/);
  // radiation without one: 1d10 rounds, 2 a round
  dice.next = [3, 4];
  await SalvageOps.suffer(rook, "2070", "scrapyards");
  assert.match(chat.at(-1).content, /4 rounds in it: 8 damage straight to HP/);
});

test("the GM's own wording from an imported table", async () => {
  const table = { getFlag: (s, k) => (s === M && k === "salvage" ? "2045.perils" : null), results: [{ range: [1, 1], text: "The official words." }] };
  game.tables = [table];
  try {
    const rook = character("Rook", [["Solo", 4]]);
    dice.next = [1, 12];
    await SalvageOps.suffer(rook, "2045", "hotZone");
    assert.match(chat.at(-1).content, /The official words\./);
    assert.match(chat.at(-1).content, /12 damage/, "the dice stay the module's");
    assert.doesNotMatch(chat.at(-1).content, /armor soaks it\)\./, "the GM's text stands in for ours");
  } finally {
    game.tables = undefined;
  }
});

/* ------------------------------------------ */
/*  Stripping for parts                       */
/* ------------------------------------------ */

test("a Tech strips several items, of different worths, into one tier of materials", async () => {
  const tech = character("Gearhead", [["Tech", 4]], [
    { _id: "pistol", name: "Heavy Pistol", type: "weapon", system: { price: { market: 100 }, equipped: "carried" } },
    { _id: "radio", name: "Radio Scanner", type: "gear", system: { price: { market: 50 } } },
    { _id: "flash", name: "Flashlight", type: "gear", system: { price: { market: 20 }, amount: 3 } },
    { _id: "worn", name: "Armorjack", type: "armor", system: { price: { market: 100 }, equipped: "equipped" } }
  ]);
  assert.deepEqual(SalvageOps.strippable(tech).map((s) => s.item.id), ["flash", "pistol", "radio"], "not what's worn");
  await assert.rejects(SalvageOps.strip(tech, { radio: 1, flash: 1 }, "premium"), /70eb of parts doesn't make 1 × Premium/);
  const res = await SalvageOps.strip(tech, { pistol: 1, flash: 2 }, "costly", 2);
  assert.deepEqual([res.total, res.need, res.waste], [140, 100, 40]);
  assert.equal(tech.items.get("pistol"), undefined, "broken down");
  assert.equal(tech.items.get("flash").system.amount, 1, "two of the three flashlights");
  const mat = matsOf(tech)[0];
  assert.deepEqual([mat.name, mat.system.amount], ["Costly Tech Materials", 2]);
  assert.match(materials.sourceOf(mat), /Heavy Pistol, Flashlight ×2, stripped for parts by Gearhead/);
  assert.match(chat.at(-1).content, /40eb of it too small to use/);
  // materials combine: the two Costly and the radio into a Premium unit
  await SalvageOps.strip(tech, { [mat.id]: 2 }, "premium");
  assert.deepEqual(matsOf(tech).map((i) => i.name), ["Premium Tech Materials"]);
  // only a Tech
  await assert.rejects(SalvageOps.strip(character("Rook", [["Solo", 4]], [{ _id: "x", name: "X", type: "gear", system: { price: { market: 100 } } }]), { x: 1 }, "premium"), /Only a Tech/);
});

test("Maker work uses materials oldest first, across items, and notes where they came from", async () => {
  const items = [
    ...[["costly", 1, "a radio"], ["costly", 2, "a busted drone"]].map(([tier, amount, source], i) => {
      const d = materials.materialsItemData(tier, M, { source });
      return { ...d, _id: `m${i}`, system: { ...d.system, amount } };
    })
  ];
  const tech = character("Gearhead", [["Tech", 4]], items);
  const used = await SalvageOps.useMaterials(tech, { tier: "costly", count: 2 });
  assert.deepEqual(used, ["a radio", "a busted drone"]);
  assert.equal(tech.items.get("m0"), undefined);
  assert.equal(tech.items.get("m1").system.amount, 1);
  await assert.rejects(SalvageOps.useMaterials(tech, { tier: "costly", count: 2 }), /needs 2 × Costly Tech Materials/);
  assert.equal(tech.items.get("m1").system.amount, 1, "nothing taken when there isn't enough");
});

test("stripping a few items is free; a big batch takes downtime, past the first five", async () => {
  assert.equal(materials.stripMinutes(5), 0);
  assert.equal(materials.stripMinutes(8), 90);
  const tech = character("Gearhead", [["Tech", 4]], [
    { _id: "flash", name: "Flashlight", type: "gear", system: { price: { market: 20 }, amount: 8 } },
    ...[0, 1, 2, 3, 4, 5].map((i) => {
      const d = materials.materialsItemData("cheap", M);
      return { ...d, _id: `cheap${i}` };
    })
  ]);
  // materials being combined don't count: five Cheap units into a Costly one, free
  assert.equal((await SalvageOps.strip(tech, Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`cheap${i}`, 1])), "costly")).minutes, 0);
  // eight flashlights: three past the free five, 30 minutes each, from the character's downtime
  const call = { id: "c", label: "Downtime", total: 60, status: "open", entries: [] };
  game.modules.set("cpr-neon-hub", { active: true, api: { downtime: {
    current: () => call,
    balance: () => ({ total: call.total, spent: call.entries.reduce((n, e) => n + e.minutes, 0), left: call.total - call.entries.reduce((n, e) => n + e.minutes, 0), taking: true }),
    log: () => call.entries,
    spend: async (a, minutes, details) => call.entries.push({ minutes, ...details }),
    refund: async () => null
  } } });
  try {
    await assert.rejects(SalvageOps.strip(tech, { flash: 8 }, "premium"), /needs 1h 30m of downtime and has 1h left/);
    assert.equal(tech.items.get("flash").system.amount, 8, "nothing taken apart");
    call.total = 600;
    const res = await SalvageOps.strip(tech, { flash: 8 }, "premium");
    assert.equal(res.minutes, 90);
    assert.deepEqual(call.entries.map((e) => [e.minutes, e.label]), [[90, "Strip for parts: 1 × Premium Tech Materials"]]);
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});
