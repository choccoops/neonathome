/**
 * Breaking Your Stuff against mock Cyberpunk RED documents: conditions, maintenance checks,
 * malfunctions (and fumbles), the maintenance cycle, and dropping what a lost hand held.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser, dialogs, chat, dice, callHook } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { HomeOps, RuleBlock } = await import("../scripts/home/ops.js");
const { MaintOps } = await import("../scripts/home/maint-ops.js");
const { CPR } = await import("../scripts/cpr.js");

const flagOf = (item) => item.getFlag(M, "item") ?? {};
/** The skill roll comes out at `total` (and is recorded). */
const rolls = [];
function rollsTotal(total, extra = {}) {
  CPR.skillCheck = async (actor, skill) => {
    rolls.push({ actor: actor.name, skill });
    return { total, html: "<div class=cpr-roll></div>", critFail: false, critSuccess: false, skill, ...extra };
  };
}

function gearhead({ lifestyle = "Kibble", roles = [] } = {}) {
  return makeActor({ name: "Gearhead", type: "character", system: { lifestyle: { lifeStyle: { description: lifestyle, cost: 100 } }, installedItems: { list: ["arm"] } } }, [
    { _id: "arm", name: "Cyberarm", type: "cyberware", system: { type: "cyberArm", isFoundational: true, price: { market: 500 }, installedItems: { list: [], slots: 4 } } },
    { _id: "rifle", name: "Assault Rifle", type: "weapon", system: { equipped: "equipped", handsReq: 2, isRanged: true, price: { market: 500 }, magazine: { value: 25 }, installedItems: { list: ["scope"] } }, effects: [{ _id: "fx", name: "Steady", changes: [{ key: "bonuses.handgun", value: "1" }] }] },
    { _id: "scope", name: "Sniping Scope", type: "itemUpgrade", system: { type: "weapon", price: { market: 100 } } },
    { _id: "pistol", name: "Heavy Pistol", type: "weapon", system: { equipped: "equipped", handsReq: 1, price: { market: 100 }, installedItems: { list: [] } } },
    { _id: "jack", name: "Light Armorjack", type: "armor", system: { equipped: "equipped", isBodyLocation: true, price: { market: 100 }, installedItems: { list: [] } } },
    { _id: "agent", name: "Agent", type: "gear", system: { equipped: "carried", isElectronic: true, price: { market: 100 } } },
    ...roles.map((r, i) => ({ _id: `role${i}`, name: r.name, type: "role", system: { abilities: r.abilities ?? [] } }))
  ]);
}

test("the GM sets conditions; Destroyed gear stops working and Destroyed armor comes off", async () => {
  asUser(true);
  const actor = gearhead();
  chat.length = 0;
  await HomeOps.setCondition(actor, "rifle", "destroyed");
  assert.equal(HomeOps.offlineState(actor, "scope"), "destroyed", "its scope goes with it");
  assert.equal(actor.items.get("rifle").effects.get("fx").disabled, true);
  assert.match(chat.at(-1).content, /Destroyed/);
  await HomeOps.setCondition(actor, "jack", "destroyed");
  assert.equal(actor.items.get("jack").system.equipped, "carried");
  // Damaged kept quiet: only the GM hears of it
  await HomeOps.setCondition(actor, "agent", "damaged", { hidden: true, cause: "electrocution" });
  assert.deepEqual(chat.at(-1).whisper, ["gm"]);
  assert.equal(flagOf(actor.items.get("agent")).cause, "electrocution");
  // working again: no malfunction carries over, effects come back
  await HomeOps.setCondition(actor, "rifle", "");
  assert.equal(actor.items.get("rifle").effects.get("fx").disabled, false);
  asUser(false);
  await assert.rejects(HomeOps.setCondition(actor, "rifle", "dbr"), RuleBlock);
  asUser(true);
});

test("a player can't wear Destroyed armor", () => {
  asUser(true);
  const actor = gearhead();
  actor.items.get("jack").flags[M] = { item: { condition: "destroyed" } };
  actor.items.get("jack").system.equipped = "carried";
  asUser(false);
  assert.equal(callHook("preUpdateItem", actor.items.get("jack"), { system: { equipped: "equipped" } }, {}, game.user.id), false);
  asUser(true);
});

test("maintenance: Lifestyle covers cheap gear; a check maintains the rest and clears Damage", async () => {
  asUser(false);
  const actor = gearhead();
  let list = MaintOps.list(actor);
  const status = (id) => [...list, ...list.flatMap((e) => e.children)].find((e) => e.id === id)?.status;
  assert.equal(status("pistol"), "covered", "100eb is Kibble");
  assert.equal(status("rifle"), "due", "500eb needs Generic Prepak");
  actor.items.get("rifle").flags[M] = { item: { condition: "damaged", malfunction: { table: "weapon", roll: 4, at: 0, until: 60 } } };

  rollsTotal(14);
  const fail = await MaintOps.check(actor, "rifle", { mode: "maintain" });
  assert.equal(fail.ok, false, "14 doesn't reach DV15");
  assert.equal(rolls.at(-1).skill, "Weaponstech");
  assert.match(chat.at(-1).content, /start over/);

  rollsTotal(15);
  const ok = await MaintOps.check(actor, "rifle", { mode: "maintain" });
  assert.equal(ok.outcome, "maintain.fixed", "meeting the DV is enough");
  const f = flagOf(actor.items.get("rifle"));
  assert.equal(f.maintained, MaintOps.cycle);
  assert.equal(f.condition, "");
  assert.equal(f.malfunction, null);
  list = MaintOps.list(actor);
  assert.equal(status("rifle"), "maintained");
  asUser(true);
});

test("a Solo's Lifestyle counts a level higher for weapons; the GM can set the Lifestyle", async () => {
  asUser(true);
  const actor = gearhead({ roles: [{ name: "Solo" }] });
  const rifle = () => MaintOps.list(actor).find((e) => e.id === "rifle");
  assert.equal(rifle().status, "covered");
  assert.equal(rifle().roleBonus, "solo");
  await MaintOps.setLifestyle(actor, 0);
  assert.equal(MaintOps.lifestyle(actor).source, "gm");
  assert.equal(rifle().status, "due");
  await MaintOps.setLifestyle(actor, null);
  assert.equal(MaintOps.lifestyle(actor).tier, 1);
});

test("inspecting reveals hidden Damage; repairs fix Destroyed gear but not Beyond Repair", async () => {
  asUser(false);
  const actor = gearhead();
  actor.items.get("agent").flags[M] = { item: { condition: "damaged", hidden: true } };
  rollsTotal(13);
  const r = await MaintOps.check(actor, "agent", { mode: "inspect" });
  assert.equal(r.outcome, "inspect.damaged");
  assert.equal(flagOf(actor.items.get("agent")).hidden, false);
  assert.equal(rolls.at(-1).skill, "Electronics/Security Tech");

  actor.items.get("rifle").flags[M] = { item: { condition: "destroyed" } };
  rollsTotal(20);
  const fixed = await MaintOps.check(actor, "rifle", { mode: "repair", dv: 17 });
  assert.equal(fixed.ok, true);
  assert.equal(flagOf(actor.items.get("rifle")).condition, "");
  actor.items.get("rifle").flags[M] = { item: { condition: "dbr" } };
  await assert.rejects(MaintOps.check(actor, "rifle", { mode: "repair" }), RuleBlock);
  asUser(true);
});

test("a Tech jury-rigs a malfunction for 10 minutes per point of Field Expertise", async () => {
  asUser(false);
  const actor = gearhead();
  const tech = gearhead({ roles: [{ name: "Tech", abilities: [{ name: "Field Expertise", rank: 2 }] }] });
  actor.items.get("rifle").flags[M] = { item: { malfunction: { table: "weapon", roll: 1, at: 0, until: 60 } } };
  rollsTotal(18);
  await assert.rejects(MaintOps.check(actor, "rifle", { mode: "rig" }), RuleBlock, "the owner isn't a Tech");
  const r = await MaintOps.check(actor, "rifle", { mode: "rig", mechanic: tech });
  assert.equal(r.ok, true);
  const m = flagOf(actor.items.get("rifle")).malfunction;
  assert.equal(m.rigUntil, game.time.worldTime + 1200);
  assert.equal(m.rigMinutes, 20);
  assert.equal(MaintOps.entry(actor, "rifle").malfunction.rigged, true);
  asUser(true);
});

test("a malfunction rolls the item's table, lasts its time, and its card can act", async () => {
  asUser(true);
  const actor = gearhead();
  chat.length = 0;
  game.time.worldTime = 1000;
  dice.next = [6];
  const r = await MaintOps.malfunction(actor, "rifle");
  assert.equal(r.table, "weapon");
  assert.equal(r.roll, 6);
  const m = flagOf(actor.items.get("rifle")).malfunction;
  assert.equal(m.until, 1060, "1 minute");
  const msg = chat.at(-1);
  assert.equal(msg.flags[M].malfunction.action, "emptyMag");
  await MaintOps.cardAction(msg);
  assert.equal(actor.items.get("rifle").system.magazine.value, 0);
  assert.equal(msg.flags[M].malfunction.done, true);
  // over when world time passes it
  game.time.worldTime = 1060;
  await MaintOps.expireMalfunctions();
  assert.equal(flagOf(actor.items.get("rifle")).malfunction, null);
  // instant results aren't kept; a cyberleg's motion glitch has nothing to drop
  dice.next = [3];
  const leg = makeActor({ name: "Legs", type: "character", system: { installedItems: { list: ["leg"] } } }, [
    { _id: "leg", name: "Cyberleg", type: "cyberware", system: { type: "cyberLeg", installedItems: { list: [] } } }
  ]);
  await MaintOps.malfunction(leg, "leg");
  assert.equal(flagOf(leg.items.get("leg")).malfunction, undefined);
  assert.equal(chat.at(-1).flags[M].malfunction.action, null);
  game.time.worldTime = 0;
});

test("the GM's world table, when imported and edited, gives the text", async () => {
  asUser(true);
  const actor = gearhead();
  game.tables = [{ getFlag: (s, k) => (k === "malfunction" ? "weapon" : null), results: [{ range: [1, 1], text: "Your own words." }] }];
  try {
    assert.equal(MaintOps.result("weapon", 1).text, "Your own words.");
    assert.equal(MaintOps.result("weapon", 1).duration, "minute");
    assert.notEqual(MaintOps.result("weapon", 2).text, "Your own words.");
  } finally {
    delete game.tables;
  }
  assert.ok(actor);
});

test("a natural 1 with Damaged gear malfunctions; damage rolls and working gear don't", async () => {
  asUser(false);
  const actor = gearhead();
  const calls = [];
  const real = MaintOps.malfunction;
  MaintOps.malfunction = async (a, id, opts) => calls.push({ id, ...opts });
  const timers = [];
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => timers.push(fn);
  try {
    const roll = (card, nat) => ({ rollCard: `systems/x/templates/chat/${card}`, wasCritFail: () => nat === 1 });
    await MaintOps.onItemRoll(actor.items.get("rifle"), roll("cpr-attack-rollcard.hbs", 1));
    assert.equal(timers.length, 0, "a working rifle doesn't malfunction");
    actor.items.get("rifle").flags[M] = { item: { condition: "damaged" } };
    await MaintOps.onItemRoll(actor.items.get("rifle"), roll("cpr-damage-rollcard.hbs", 1));
    await MaintOps.onItemRoll(actor.items.get("rifle"), roll("cpr-attack-rollcard.hbs", 4));
    assert.equal(timers.length, 0);
    await MaintOps.onItemRoll(actor.items.get("rifle"), roll("cpr-attack-rollcard.hbs", 1));
    assert.equal(timers.length, 1);
    timers[0]();
    assert.deepEqual(calls[0], { id: "rifle", table: "weapon", reason: "fumble" });
  } finally {
    MaintOps.malfunction = real;
    globalThis.setTimeout = realTimeout;
    asUser(true);
  }
});

test("a new cycle makes uncovered gear due again; Neon Hub's month can start it", async () => {
  asUser(true);
  const actor = gearhead();
  actor.items.get("rifle").flags[M] = { item: { maintained: MaintOps.cycle } };
  assert.equal(MaintOps.entry(actor, "rifle").status, "maintained");
  const before = MaintOps.cycle;
  await MaintOps.newCycle();
  assert.equal(MaintOps.cycle, before + 1);
  assert.equal(MaintOps.entry(actor, "rifle").status, "due");
  // Neon Hub: the first look only remembers its month; a later month moves maintenance along
  let month = 4;
  game.modules.set("cpr-neon-hub", { active: true, api: { lifestyleMonth: () => month } });
  try {
    await MaintOps.followHub();
    assert.equal(MaintOps.cycle, before + 1);
    assert.equal(Settings.maintCycle.hubMonth, 4);
    month = 5;
    await MaintOps.followHub();
    assert.equal(MaintOps.cycle, before + 2);
    await game.settings.set(M, "maintPeriod", "week");
    month = 6;
    await MaintOps.followHub();
    assert.equal(MaintOps.cycle, before + 2, "weekly cycles don't follow Neon Hub's months");
  } finally {
    game.modules.delete("cpr-neon-hub");
    await game.settings.set(M, "maintPeriod", "month");
  }
});

test("the GM breaks several pieces at once, for a reason", async () => {
  asUser(true);
  const actor = gearhead();
  await MaintOps.damage(actor, ["agent", "arm"], { cause: "electrocution" });
  assert.equal(flagOf(actor.items.get("agent")).condition, "damaged");
  assert.equal(flagOf(actor.items.get("arm")).cause, "electrocution");
  assert.match(chat.at(-1).content, /Electrocution/);
});

/* ------------------------------------------ */
/*  Dropping things                           */
/* ------------------------------------------ */

const piles = [];
function withPiles(actor) {
  game.modules.set("item-piles", { active: true });
  game.itempiles = { API: { createItemPile: async (o) => piles.push(o), isValidItemPile: (a) => !!a.pile } };
  actor.getActiveTokens = () => [{ document: { x: 100, y: 200, parent: { id: "scene1", grid: { size: 100 } } } }];
}
function noPiles() {
  game.modules.delete("item-piles");
  delete game.itempiles;
}

test("dropping into an Item Piles pile takes the attachments along, and picking it up puts them back", async () => {
  asUser(true);
  const actor = gearhead();
  withPiles(actor);
  piles.length = 0;
  try {
    await MaintOps.dropItem(actor, actor.items.get("rifle"));
    assert.equal(piles.length, 1);
    assert.deepEqual(piles[0].position, { x: 200, y: 200 });
    assert.equal(piles[0].sceneId, "scene1");
    const data = piles[0].items[0];
    assert.equal(data.name, "Assault Rifle");
    assert.deepEqual(data.system.installedItems.list, []);
    assert.equal(data.flags[M].dropTree[0].name, "Sniping Scope");
    assert.equal(actor.items.get("rifle"), undefined);
    assert.equal(actor.items.get("scope"), undefined, "the scope went with it");

    // picked up by someone: CPR's install tree is restored and rebuilt
    const finder = makeActor({ name: "Finder", type: "character" });
    const [found] = await finder.createEmbeddedDocuments("Item", [data]);
    let rebuilt = null;
    found.createInstalledItemsOnActor = async (imported) => {
      rebuilt = { imported, tree: found.flags.cprInstallTree };
    };
    await MaintOps.restoreDropped(found);
    assert.equal(rebuilt.imported, true);
    assert.equal(rebuilt.tree[0].name, "Sniping Scope");
    assert.equal(found.flags[M].dropTree, undefined);
  } finally {
    noPiles();
  }
});

test("without Item Piles (or a token) a dropped item is just no longer carried", async () => {
  asUser(true);
  const actor = gearhead();
  await MaintOps.dropItem(actor, actor.items.get("pistol"));
  assert.equal(actor.items.get("pistol").system.equipped, "owned");
});

test("a lost arm drops two-handed weapons on its own and asks about one-handed ones", async () => {
  asUser(true);
  const actor = gearhead();
  dialogs.shown.length = 0;
  // the GM says the pistol was in that hand
  dialogs.next = { side: "L", ids: ["rifle", "pistol"] };
  const injury = (await actor.createEmbeddedDocuments("Item", [{ name: "Dismembered Arm", type: "criticalInjury", system: { location: "body" } }]))[0];
  await MaintOps.onInjury(actor, injury);
  assert.equal(dialogs.shown.length, 1);
  assert.match(dialogs.shown[0].content, /checked/, "the two-handed rifle is ticked for the GM");
  assert.equal(actor.items.get("rifle").system.equipped, "owned");
  assert.equal(actor.items.get("pistol").system.equipped, "owned");
  assert.equal(injury.getFlag(M, "side"), "L", "the arm the GM picked is remembered");
});

test("losing the second arm drops everything without asking", async () => {
  asUser(true);
  const actor = gearhead();
  await actor.createEmbeddedDocuments("Item", [{ name: "Dismembered Arm", type: "criticalInjury", system: { location: "body" }, flags: { [M]: { side: "R" } } }]);
  const [second] = await actor.createEmbeddedDocuments("Item", [{ name: "Dismembered Arm (Destroyed Cyberarm)", type: "criticalInjury", system: { location: "body" }, flags: { [M]: { side: "L" } } }]);
  dialogs.shown.length = 0;
  await MaintOps.onInjury(actor, second);
  assert.equal(dialogs.shown.length, 0);
  assert.equal(actor.items.get("rifle").system.equipped, "owned");
  assert.equal(actor.items.get("pistol").system.equipped, "owned");
});

test("other injuries, or the setting off, drop nothing", async () => {
  asUser(true);
  const actor = gearhead();
  const [ribs] = await actor.createEmbeddedDocuments("Item", [{ name: "Broken Ribs", type: "criticalInjury", system: { location: "body" } }]);
  await MaintOps.onInjury(actor, ribs);
  await game.settings.set(M, "dropHeld", false);
  const [arm] = await actor.createEmbeddedDocuments("Item", [{ name: "Dismembered Hand", type: "criticalInjury", system: { location: "body" }, flags: { [M]: { side: "R" } } }]);
  await MaintOps.onInjury(actor, arm);
  await game.settings.set(M, "dropHeld", true);
  assert.equal(actor.items.get("rifle").system.equipped, "equipped");
});
