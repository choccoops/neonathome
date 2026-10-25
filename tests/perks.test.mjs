/** The Perk System (Cyberpunk: The Unification Era, Chapter 16): the perks as data, Perk Points, buying, and the sheet effects. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser, chat, dice, dialogs, loadTemplates, render, missingKeys } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const data = await import("../scripts/data/perks.js");
const { PerkOps } = await import("../scripts/home/perk-ops.js");
const { DowntimeOps } = await import("../scripts/home/downtime-ops.js");
const { PerksApp } = await import("../scripts/apps/perks-app.js");
loadTemplates();
await game.settings.set(M, "downtimeOn", true);

const skill = (name, level, category = "", skillType = "generic") => ({ name, type: "skill", system: { level, category, skillType } });
function character(name, { stats = {}, roles = [], items = [], lifestyle = "Kibble" } = {}) {
  const s = { int: 5, ref: 5, dex: 5, tech: 5, cool: 5, will: 5, luck: 5, move: 5, body: 5, emp: 5, ...stats };
  return makeActor({
    name, type: "character",
    system: {
      stats: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { value: v, max: v }])),
      derivedStats: { hp: { value: 40, max: 40 }, humanity: { value: 50, max: 50 } },
      lifestyle: { lifeStyle: { description: lifestyle, cost: 100 } },
      wealth: { value: 10000, transactions: [] }
    }
  }, [...roles.map(([role, rank], i) => ({ _id: `role${i}`, name: role, type: "role", system: { rank, abilities: [] } })), ...items]);
}
const effect = (actor, id) => actor.effects.find((e) => e.flags?.[M]?.perk === id);

/* ------------------------------------------ */
/*  The perks as data                         */
/* ------------------------------------------ */

test("every perk is well formed: a branch, a cost of 1-3, its prerequisites real, no loops", () => {
  assert.ok(data.PERKS.length >= 120, `${data.PERKS.length} perks`);
  const ids = new Set();
  for (const p of data.PERKS) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`);
    ids.add(p.id);
    assert.ok(data.BRANCHES.includes(p.branch), p.id);
    assert.ok([1, 2, 3].includes(p.cost), p.id);
    assert.ok(p.text.length > 20, p.id);
    const walk = (r) => {
      for (const id of [r.perk, ...(r.perks ?? [])].filter(Boolean)) assert.ok(data.PERK_BY_ID.has(id), `${p.id} needs unknown ${id}`);
      (r.of ?? []).forEach(walk);
    };
    p.req.forEach(walk);
  }
  for (const b of data.BRANCHES) assert.ok(data.treeOf(b).size > 0, b);
  // a chain: Savior Complex → Main-Character Complex → God Complex
  const general = data.treeOf("general");
  assert.deepEqual(["saviorComplex", "mainCharacter", "godComplex"].map((id) => general.get(id).depth), [0, 1, 2]);
  assert.deepEqual(general.get("godComplex").from, ["mainCharacter"]);
  assert.deepEqual(data.crossPrereqs(data.PERK_BY_ID.get("talkNerdy")), ["hopelessRomantic"], "Talk Nerdy builds on a General perk");
});

test("Perk Points: 3 to start, 1 per Role rank raised (not Ganger or Exec), and awards", () => {
  const record = data.normalizeRecord({ baseline: { solo: 4, exec: 2 }, awards: [{ n: 2, reason: "training" }], owned: [{ id: "decentShape" }, { id: "goodShape", free: true }] });
  const pts = data.points(record, { solo: 6, exec: 5 });
  assert.deepEqual(pts, { total: 3 + 2 + 2, spent: 1, forfeit: 0, available: 6 }, "Good Shape granted free costs nothing");
});

test("requirements: STATs, Skills, any/every skill of a kind, Lifestyle, weapons, cyberware, other perks", () => {
  const sheet = {
    stats: { body: 8, emp: 3, ref: 8 }, empMax: 8, lifestyle: 3,
    skills: [{ name: "Personal Grooming", level: 6 }, { name: "Handgun", level: 6, category: "rangedweaponSkills" }, { name: "Archery", level: 2, category: "rangedweaponSkills" }, { name: "Basic Tech", level: 4, category: "techniqueSkills" }],
    roles: { solo: 5 }, weapons: ["heavyPistol"], shield: false,
    cyber: [{ type: "cyberEye", foundational: true }, { type: "cyberEye", foundational: false }, { type: "cyberEye", foundational: false }]
  };
  const rec = data.normalizeRecord({ owned: [{ id: "decentShape" }] });
  const ok = (id) => data.checkPerk(data.PERK_BY_ID.get(id), sheet, rec).every((c) => c.ok);
  assert.equal(ok("goodShape"), true, "BODY 8 and Decent Shape");
  assert.equal(ok("shapedByGods"), false, "BODY 10");
  assert.equal(ok("moreHuman"), true, "original EMP 8, now 3");
  assert.equal(ok("porky"), false, "every ranged weapon skill 6+: Archery is 2");
  assert.equal(ok("deadeye"), true, "Handgun or Archery 6+");
  assert.equal(ok("pistolSpecialist"), true);
  assert.equal(ok("rifleSpecialist"), false);
  assert.equal(ok("cyberopticsSpecialist"), true, "two cybereye options (the eye itself doesn't count)");
  assert.equal(ok("creepyFreak"), false, "Personal Grooming 2 or less");
  assert.equal(ok("highStrung"), false, "Solo 5 and Nervous");
  assert.equal(ok("corpseScrounger"), false, "done in play: until the GM confirms");
  assert.equal(data.checkPerk(data.PERK_BY_ID.get("corpseScrounger"), sheet, data.normalizeRecord({ deeds: { corpseScrounger: true } }))[0].ok, true);
  assert.equal(ok("doomed"), true, "creation open by default");
  assert.equal(data.checkPerk(data.PERK_BY_ID.get("doomed"), sheet, data.normalizeRecord({ creation: false }))[0].ok, false);
  // Good, Neutral and Bad Person rule each other out
  const good = data.normalizeRecord({ owned: [{ id: "goodPerson" }], deeds: { neutralPerson: true } });
  assert.equal(data.checkPerk(data.PERK_BY_ID.get("neutralPerson"), sheet, good).every((c) => c.ok), false);
});

test("sheet changes: STAT boosts within their caps, full-HP ones, bonuses (situational or not)", () => {
  const base = { stats: { cool: 7, will: 8, dex: 6 }, hp: { value: 40, max: 40 } };
  assert.deepEqual(data.perkChanges(data.PERK_BY_ID.get("obsessivelyHealthy"), {}, base), [
    { key: "system.stats.cool.value", value: 1, sit: false },
    { key: "system.stats.dex.value", value: 1, sit: false }
  ], "WILL is already at 8, the cap");
  assert.deepEqual(data.perkChanges(data.PERK_BY_ID.get("obsessivelyHealthy"), {}, { ...base, hp: { value: 30, max: 40 } }), [], "below full HP: none of it");
  assert.deepEqual(data.perkChanges(data.PERK_BY_ID.get("godComplex"), { stat: "will" }, base), [{ key: "system.stats.will.value", value: 1, sit: false }], "God Complex goes to 10");
  assert.deepEqual(data.perkChanges(data.PERK_BY_ID.get("persuasiveSpeaker"), {}, base), [{ key: "bonuses.persuasion", value: -4, sit: true }]);
});

/* ------------------------------------------ */
/*  Buying and the sheet                      */
/* ------------------------------------------ */

test("a player buys a perk: points and requirements checked, an effect on the sheet, a card", async () => {
  asUser(false);
  const vex = character("Vex", { stats: { body: 8 }, roles: [["Solo", 4]] });
  await assert.rejects(PerkOps.buy(vex, "shapedByGods"), /doesn't meet everything/);
  await PerkOps.buy(vex, "decentShape");
  const e = effect(vex, "decentShape");
  assert.equal(e.name, "Perk: Decent Shape");
  assert.match(e.description, /Athletics, Brawling or Melee Weapon/);
  assert.deepEqual(e.changes.map((c) => [c.key, c.value]), [["bonuses.athletics", "1"], ["bonuses.brawling", "1"], ["bonuses.meleeWeapon", "1"]]);
  assert.deepEqual(e.flags["cyberpunk-red-core"].changes.cats, { 0: "skill", 1: "skill", 2: "skill" }, "CPR's sheet needs a category per change");
  assert.equal(e.flags["cyberpunk-red-core"].changes.situational[0].isSituational, true);
  assert.match(chat.at(-1).content, /unlocks the perk <b>Decent Shape<\/b>/);
  assert.equal(PerkOps.points(vex).available, 2);
  // two clients made it at once: one is kept
  await vex.createEmbeddedDocuments("ActiveEffect", [{ name: "Perk: Decent Shape", changes: [], flags: { [M]: { perk: "decentShape" } } }]);
  await PerkOps.sync(vex);
  assert.equal(vex.effects.filter((x) => x.flags?.[M]?.perk === "decentShape").length, 1);
  // the starting Role ranks are noted: a rank raised later earns a point
  assert.deepEqual(PerkOps.record(vex).baseline, { solo: 4 });
  vex.items.get("role0").system.rank = 5;
  assert.equal(PerkOps.points(vex).available, 3);
  // Good Shape replaces Decent Shape: they don't stack
  await PerkOps.buy(vex, "goodShape");
  assert.deepEqual(effect(vex, "decentShape").changes, []);
  assert.equal(effect(vex, "goodShape").changes[0].value, "2");
  // not enough left for a 3-point perk; not in combat either
  await assert.rejects(PerkOps.buy(vex, "doomed"), /hasn't the Perk Points/);
  asUser(true);
});

test("done in play: the GM confirms it before a player can buy; the GM can grant anything", async () => {
  asUser(false);
  const rook = character("Rook");
  await assert.rejects(PerkOps.buy(rook, "corpseScrounger"), /doesn't meet everything/);
  asUser(true);
  await PerkOps.confirm(rook, "corpseScrounger");
  asUser(false);
  await PerkOps.buy(rook, "corpseScrounger");
  assert.ok(effect(rook, "corpseScrounger"));
  assert.deepEqual(effect(rook, "corpseScrounger").changes, [], "nothing to add: its text, toggled on the sheet");
  await assert.rejects(PerkOps.buy(rook, "witchy", { force: true }), /GM/);
  asUser(true);
  await PerkOps.buy(rook, "shapedByGods", { free: true, force: true });
  assert.equal(PerkOps.points(rook).available, 2, "granted free");
  assert.match(chat.at(-1).content, /The GM grants/);
});

test("switching a perk off and on; a lost requirement makes it dormant until it's back", async () => {
  asUser(true);
  const ink = character("Ink", { stats: { cool: 8 }, items: [skill("Persuasion", 6)] });
  await PerkOps.buy(ink, "persuasiveSpeaker");
  await PerkOps.toggle(ink, "persuasiveSpeaker", false);
  assert.equal(effect(ink, "persuasiveSpeaker").disabled, true);
  await PerkOps.toggle(ink, "persuasiveSpeaker", true);
  assert.equal(effect(ink, "persuasiveSpeaker").disabled, false);
  // COOL drops below 8: it switches off by itself
  ink.system.stats.cool.value = 7;
  await PerkOps.sync(ink);
  assert.equal(effect(ink, "persuasiveSpeaker").disabled, true);
  assert.equal(effect(ink, "persuasiveSpeaker").flags[M].perkDormant, true);
  await assert.rejects(PerkOps.toggle(ink, "persuasiveSpeaker", true), /switched off until/);
  ink.system.stats.cool.value = 8;
  await PerkOps.sync(ink);
  assert.equal(effect(ink, "persuasiveSpeaker").disabled, false, "back on");
});

test("+1 to one STAT: the player picks it, within the cap", async () => {
  asUser(true);
  const kerry = character("Kerry", { roles: [["Rockerboy", 5]], stats: { cool: 8 } });
  dialogs.next = "ref";
  await PerkOps.buy(kerry, "saviorComplex");
  assert.equal(PerkOps.record(kerry).owned[0].stat, "ref");
  assert.deepEqual(effect(kerry, "saviorComplex").changes.map((c) => [c.key, c.value]), [["system.stats.ref.value", "1"]]);
  assert.equal(effect(kerry, "saviorComplex").flags["cyberpunk-red-core"].changes.cats[0], "stat");
  // the STAT reaches the cap some other way: the boost shrinks to fit
  kerry.system.stats.ref.value = 8;
  await PerkOps.sync(kerry);
  assert.deepEqual(effect(kerry, "saviorComplex").changes, []);
  // the dialog closed: nothing bought
  dialogs.next = null;
  const other = character("Other", { roles: [["Rockerboy", 5]] });
  assert.equal(await PerkOps.buy(other, "saviorComplex"), null);
  assert.equal(PerkOps.record(other).owned.length, 0);
});

test("refunds, losses, and dropping a specialty for a point", async () => {
  asUser(true);
  const nix = character("Nix", { items: [{ name: "Heavy Pistol", type: "weapon", system: { weaponType: "heavyPistol" } }, { name: "Shotgun", type: "weapon", system: { weaponType: "shotgun" } }] });
  await PerkOps.award(nix, 4, "big moment");
  assert.equal(PerkOps.points(nix).available, 7);
  await PerkOps.buy(nix, "pistolSpecialist");
  await assert.rejects(PerkOps.buy(nix, "shotgunSpecialist"), /already holds a specialty/);
  await PerkOps.remove(nix, "pistolSpecialist", "drop");
  assert.equal(PerkOps.points(nix).available, 4, "7 − 2 spent − 1 to drop it");
  assert.equal(effect(nix, "pistolSpecialist"), undefined, "its effect's gone");
  await PerkOps.buy(nix, "shotgunSpecialist");
  await PerkOps.remove(nix, "shotgunSpecialist", "refund");
  assert.equal(PerkOps.points(nix).available, 4, "refunded");
  await PerkOps.confirm(nix, "goodPerson");
  await PerkOps.buy(nix, "goodPerson");
  await PerkOps.remove(nix, "goodPerson", "gone");
  await assert.rejects(PerkOps.buy(nix, "goodPerson"), /gone for good/);
  await PerkOps.buy(nix, "doomed");
  await PerkOps.remove(nix, "doomed", "lose");
  assert.equal(PerkOps.points(nix).available, 1, "its points went with it");
});

test("Perk Fiend: each perk after it flips a coin", async () => {
  asUser(true);
  const fiend = character("Fiend", { stats: { body: 10 } });
  await PerkOps.award(fiend, 10, "x");
  for (const id of ["decentShape", "darkAppetite", "festive", "shapedByGods"]) {
    await PerkOps.confirm(fiend, id);
    await PerkOps.buy(fiend, id);
  }
  await PerkOps.buy(fiend, "perkFiend");
  const before = PerkOps.points(fiend).available;
  dice.next = [1];
  await PerkOps.buy(fiend, "goodShape", { force: true });
  assert.match(chat.at(-1).content, /heads: <b>\+1 Perk Point/);
  assert.equal(PerkOps.points(fiend).available, before - 2 + 1);
});

test("perk training in downtime: a week and the eb, each 6 a Perk Point, once a month", async () => {
  asUser(false);
  const rook = character("Rook");
  dice.next = [6, 3];
  const res = await DowntimeOps.perform(rook, "perkTraining", { level: "intense", aim: "deadeye" });
  assert.equal(res.sixes, 1);
  assert.equal(PerkOps.points(rook).available, 4);
  assert.equal(rook.system.wealth.value, 7500);
  assert.match(chat.at(-1).content, /toward <b>Deadeye<\/b>/);
  await assert.rejects(DowntimeOps.perform(rook, "perkTraining", { level: "intense" }), /already trained/);
  asUser(true);
});

/* ------------------------------------------ */
/*  The Perk Tree window                      */
/* ------------------------------------------ */

test("the Perk Tree renders: points, the active perks, branches, the tree and the perk", async () => {
  asUser(true);
  const vex = character("Vex", { stats: { body: 8 }, roles: [["Solo", 6]] });
  await PerkOps.buy(vex, "decentShape");
  const app = new PerksApp();
  app.actorId = vex.id;
  app.uiState.perks = { branch: "body", focus: "goodShape" };
  const ctx = await app._prepareContext();
  const html = render("shell.hbs", ctx);
  assert.ok(html.includes("nah-perk-strip") && html.includes("nah-perk-canvas"));
  assert.ok(html.includes('data-perk="goodShape"') && html.includes('data-from="decentShape"'), "Good Shape linked from Decent Shape");
  assert.ok(html.includes("Unlock: 2 Perk Point(s)"));
  assert.ok(html.includes("Decent Shape") && html.includes("Active"));
  assert.ok(!/NEONHOME\./.test(html), "no raw keys");
  for (const branch of data.BRANCHES) {
    app.uiState.perks = { branch, focus: null };
    const out = render("shell.hbs", await app._prepareContext());
    assert.ok(!/NEONHOME\./.test(out), `raw keys in ${branch}`);
  }
  assert.deepEqual([...missingKeys].filter((k) => k.includes("Perks")), []);
});
