/** The Deep Dive (Unification Era, Chapter 10, Part 2): the architecture generator, and a runner under against mock documents. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser, dice, chat, loadTemplates, render, missingKeys } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const arch = await import("../scripts/data/netarch.js");
const { DiveOps } = await import("../scripts/home/dive-ops.js");
const { Dive } = await import("../scripts/apps/dive.js");
const { DiveApp } = await import("../scripts/apps/dive-app.js");
loadTemplates();

/* ------------------------------------------ */
/*  The generator                             */
/* ------------------------------------------ */

/** A die that runs through a list (then repeats it). */
const cycle = (list) => {
  let i = 0;
  return (sides) => Math.min(sides, Math.max(1, list[i++ % list.length]));
};

function checkShape(a) {
  const keys = new Set(a.floors.map((f) => f.key));
  assert.equal(keys.size, a.floors.length, "every floor has its own key");
  for (const f of a.floors) {
    if (f.depth === 1) assert.equal(f.from, null);
    else assert.ok(keys.has(f.from), `${f.key} hangs from a floor that exists`);
    if (f.branch !== "a") assert.ok(f.depth >= 4, "no branch before floor 3");
    if (f.kind === "ice") assert.ok(f.ice.length >= 1 && f.ice.every((i) => arch.BLACK_ICE[i]));
  }
  const trunk = a.floors.filter((f) => f.branch === "a");
  assert.ok(trunk.length >= 3 && trunk.length <= 18, "3d6 floors on the trunk");
  assert.equal(a.virus, trunk.at(-1).key, "a Virus goes in at the bottom");
  for (const b of new Set(a.floors.map((f) => f.branch))) {
    assert.ok(arch.deepest({ floors: a.floors.filter((f) => f.branch === b) }) < trunk.length || b === "a", "branches stay shorter than the trunk");
  }
}

test("the generator: 3d6 floors, the Lobby, the difficulty's Body table, and branches", () => {
  // 3d6 = 4+4+4 floors; a branch on the first d10 (8), none on the next (1)
  const a = arch.generate({ difficulty: "uncommon", demon: "efreet" }, cycle([4, 4, 4, 8, 3, 2, 1]));
  checkShape(a);
  assert.equal(a.difficulty, "uncommon");
  assert.ok(a.floors.some((f) => f.branch === "b"), "the d10 of 7+ made a branch");
  // floors 1 and 2 come off the Lobby's d6
  const lobbyKinds = arch.LOBBY.map((r) => r.kind);
  for (const f of a.floors.filter((x) => x.depth <= 2)) assert.ok(lobbyKinds.includes(f.kind));
  assert.equal(a.demon.type, "efreet");
  assert.ok(a.floors.some((f) => f.key === a.demon.at));
  // and at random, always a sound shape
  for (let n = 0; n < 300; n++) checkShape(arch.generate({ difficulty: arch.DIFFICULTY_KEYS[n % 4] }));
});

test("NET Actions under: by Interface, +1 for immersion", () => {
  assert.deepEqual([1, 4, 7, 10].map((r) => arch.netActions(r, { immersed: false })), [2, 3, 4, 5]);
  assert.equal(arch.netActions(4), 4);
  assert.equal(arch.netActions(4, { slowed: 1 }), 3, "a Wisp's hit");
});

test("as a Cyberpunk RED NET Architecture item's floors, and back", () => {
  const a = arch.generate({ difficulty: "standard" });
  const rows = arch.cprFloors(a);
  assert.ok(rows.every((r) => Number(r.floor) >= 1 && Number(r.floor) <= 18 && /^[a-h]$/.test(r.branch)));
  const back = arch.fromCprFloors(rows, { name: "x" });
  const kinds = (fl) => fl.filter((f) => f.kind !== "empty").map((f) => `${f.key}:${f.kind}`).sort();
  assert.deepEqual(kinds(back.floors), kinds(a.floors));
});

/* ------------------------------------------ */
/*  A run                                     */
/* ------------------------------------------ */

// a1 Password DV6 → a2 Hellhound → a3 File DV8 → a4 Control Node DV8 (the bottom); b4 hangs off a3
const LAYOUT = {
  name: "Sub-net 7",
  difficulty: "standard",
  demon: null,
  floors: [
    { key: "a1", branch: "a", depth: 1, from: null, kind: "password", dv: 6, ice: [] },
    { key: "a2", branch: "a", depth: 2, from: "a1", kind: "ice", dv: null, ice: ["hellhound"] },
    { key: "a3", branch: "a", depth: 3, from: "a2", kind: "file", dv: 8, ice: [], label: "Payroll" },
    { key: "a4", branch: "a", depth: 4, from: "a3", kind: "node", dv: 8, ice: [] },
    { key: "b4", branch: "b", depth: 4, from: "a3", kind: "file", dv: 6, ice: [] }
  ],
  virus: "a4"
};

function runner(name = "Lattice", extra = []) {
  return makeActor({ name, type: "character", system: { derivedStats: { hp: { value: 40, max: 40 } } } }, [
    { _id: "role", name: "Netrunner", type: "role", system: { rank: 4, abilities: [] } },
    { _id: "deck", name: "Zetatech Parraline 6000", type: "cyberdeck", system: { equipped: "equipped", installedItems: { list: ["sword"], slots: 9 } } },
    { _id: "sword", name: "Sword", type: "program", system: { class: "antiprogramattacker", atk: 3, def: 0, rez: { value: 0, max: 0 }, isRezzed: false, damage: { standard: "3d6", blackIce: "3d6" } } },
    ...extra
  ]);
}

async function newArch(layout = LAYOUT) {
  asUser(true);
  const item = await DiveOps.create({}, layout);
  return item;
}

test("jacking in: a NET Action, the rig's safe time, and the architecture kept with the dive", async () => {
  const item = await newArch();
  const a = runner();
  asUser(false);
  game.time.worldTime = 1000;
  const dive = await DiveOps.jackIn(a, item.uuid, { rig: "iceBath" });
  assert.equal(dive.turn.used, 1);
  assert.equal(dive.turn.total, 4, "Interface 4: 3, +1 immersion");
  assert.equal(dive.rig.until, 1000 + 3600, "an Ice Bath is safe for an hour");
  assert.equal(DiveOps.dive(a).layout.floors.length, 5, "the layout rides with the dive");
  // a player who can't read the GM's item still runs it
  game.items.delete(item.id);
  const arc = await DiveOps._arch(DiveOps.dive(a));
  assert.equal(arc.name, "Sub-net 7");
  game.items.set(item.id, item);
  await assert.rejects(DiveOps.jackIn(a, item.uuid), /already under/);
  await DiveOps.jackOut(a);
  assert.equal(DiveOps.dive(a), null);
  game.time.worldTime = 0;
});

test("down the elevator: a Password bars the way until Backdoored; Black ICE is met at its door", async () => {
  const item = await newArch();
  const a = runner("Spider");
  asUser(false);
  await DiveOps.jackIn(a, item.uuid, { rig: "chair" });
  await assert.rejects(DiveOps.move(a, "a2"), /one floor at a time/);
  await DiveOps.move(a, "a1");
  await assert.rejects(DiveOps.move(a, "a2"), /bars the way/);
  // Backdoor: Interface 4 + 5 = 9 beats DV6
  dice.next = [5];
  const res = await DiveOps.act(a, "breach");
  assert.equal(res.ok, true);
  assert.equal(DiveOps.dive(a).floors.a1.breached, true);
  // the Hellhound's door: Speed 4 + 8 = 12 vs its 3: the runner's faster, it's in Initiative
  dice.next = [8, 3];
  await DiveOps.move(a, "a2");
  let d = DiveOps.dive(a);
  assert.equal(d.at, "a2");
  assert.equal(d.floors.a2.ice[0].active, true);
  assert.equal(a.system.derivedStats.hp.value, 40, "no Effect: the runner won");
  await assert.rejects(DiveOps.move(a, "a3"), /bars the way/);
  // Zap it: 4 + 9 = 13 vs 2, 1d6 = 5 off its REZ
  dice.next = [9, 2, 5];
  await DiveOps.act(a, "zap", { target: 0 });
  d = DiveOps.dive(a);
  assert.equal(d.floors.a2.ice[0].rez, 15);
  assert.equal(d.turn.used, 3);
  // Slide down past it: 4 + 9 vs 1
  dice.next = [9, 1];
  await DiveOps.act(a, "slide", { dir: "down" });
  d = DiveOps.dive(a);
  assert.equal(d.at, "a3", "slid down to the next floor");
  assert.equal(d.floors.a2.passed, true);
  // out of NET Actions this Turn
  await assert.rejects(DiveOps.act(a, "eyedee"), /No NET Actions/);
  await DiveOps.newTurn(a);
  dice.next = [6];
  assert.equal((await DiveOps.act(a, "eyedee")).ok, true, "4 + 6 beats DV8");
  // two doors below a3: the trunk and the branch
  assert.deepEqual(arch.below(await DiveOps._arch(DiveOps.dive(a)), "a3").map((f) => f.key).sort(), ["a4", "b4"]);
  await DiveOps.move(a, "a4");
  await assert.rejects(DiveOps.act(a, "operate"), /Take Control/);
  dice.next = [7];
  await DiveOps.act(a, "control");
  d = DiveOps.dive(a);
  assert.equal(d.floors.a4.controlled, true);
  assert.equal(d.stealth, "seen", "taking a Node breaks stealth");
  await DiveOps.jackOut(a);
});

test("Black ICE that wins the Speed Check hits at once; an unsafe Jack Out runs through the ICE still up", async () => {
  const item = await newArch();
  const a = runner("Ash");
  asUser(true);
  await DiveOps.jackIn(a, item.uuid, { rig: "chair" });
  await DiveOps.move(a, "a1");
  // the GM can walk them past the Password; the Hellhound wins (2 vs 9) and hits: 2d6 = 7 brain
  dice.next = [2, 9, 7];
  await DiveOps.move(a, "a2");
  assert.equal(a.system.derivedStats.hp.value, 33);
  assert.equal(DiveOps.dive(a).floors.a2.ice[0].active, true);
  assert.ok(chat.some((m) => /On Fire/.test(m.content)), "a Hellhound sets the runner on fire");
  // ejected: the Hellhound gets one more hit on the way out (2d6 = 4)
  dice.next = [4];
  await DiveOps.jackOut(a, { unsafe: true });
  assert.equal(a.system.derivedStats.hp.value, 29);
  assert.equal(DiveOps.dive(a), null);
});

test("hidden runners: a quiet Jack In past the Demon, and Black ICE that never notices", async () => {
  const item = await newArch({ ...LAYOUT, demon: { type: "imp", at: "a4" } });
  const a = runner("Ghost");
  asUser(false);
  // Cloak 4 + 9 = 13 vs the Imp's 3 + 1d10 (2)
  dice.next = [9, 2];
  let d = await DiveOps.jackIn(a, item.uuid, { rig: "cradle", quiet: true });
  assert.equal(d.stealth, "unseen");
  assert.equal(d.turn.used, 2, "a quiet Jack In takes one more NET Action");
  assert.equal(d.rig.until, null, "an Immersion Cradle: no safe-time limit");
  assert.equal(d.demon.rez, arch.DEMONS.imp.rez);
  await DiveOps.move(a, "a1");
  dice.next = [6];
  await DiveOps.act(a, "breach");
  // past the Hellhound unseen: Cloak 4 + 1 (cradle) + 8 vs its PER + 1d10 (3)
  dice.next = [8, 3];
  await DiveOps.move(a, "a2");
  d = DiveOps.dive(a);
  assert.equal(d.floors.a2.passed, true);
  assert.equal(d.floors.a2.ice[0].active, false, "it never noticed them");
  await DiveOps.move(a, "a3");
  assert.equal(DiveOps.dive(a).at, "a3", "nothing in the way of going on");
  // so an unsafe Jack Out doesn't hit
  await DiveOps.jackOut(a, { unsafe: true });
  assert.equal(a.system.derivedStats.hp.value, 40);
});

test("Programs: Rez once a Round, attack ICE, Attackers switch off after", async () => {
  const item = await newArch();
  const a = runner("Byte");
  asUser(false);
  await DiveOps.jackIn(a, item.uuid, { rig: "chair" });
  await DiveOps.rez(a, "sword", true);
  assert.equal(a.items.get("sword").system.isRezzed, true);
  await assert.rejects(DiveOps.rez(a, "sword", true), /once a Turn/);
  // to the Hellhound's floor (GM moves them past the Password), runner wins the Speed Check
  asUser(true);
  await DiveOps.move(a, "a1");
  dice.next = [9, 1];
  await DiveOps.move(a, "a2");
  asUser(false);
  // Sword: 4 + 3 + 8 = 15 vs DEF 2 + 1; 3d6 = 12
  dice.next = [8, 1, 12];
  await DiveOps.attack(a, "sword", 0);
  assert.equal(DiveOps.dive(a).floors.a2.ice[0].rez, 8);
  assert.equal(a.items.get("sword").system.isRezzed, false, "an Attacker switches itself off");
  await DiveOps.jackOut(a);
});

test("Burnout: past the rig's safe time, 1d6 brain damage at the start of each Turn", async () => {
  const item = await newArch();
  const a = runner("Cinder");
  asUser(false);
  game.time.worldTime = 0;
  await DiveOps.jackIn(a, item.uuid, { rig: "iceBath" });
  await DiveOps.newTurn(a);
  assert.equal(a.system.derivedStats.hp.value, 40, "inside the hour");
  game.time.worldTime = 3601;
  dice.next = [5];
  await DiveOps.newTurn(a);
  assert.equal(a.system.derivedStats.hp.value, 35);
  await DiveOps.jackOut(a);
  game.time.worldTime = 0;
});

test("Pathfinder maps down to the roll, stopping at an obstruction whose DV beats it", async () => {
  const item = await newArch();
  const a = runner("Map");
  asUser(false);
  await DiveOps.jackIn(a, item.uuid, { rig: "chair" });
  // 4 + 1 = 5: the Password's DV6 stops it at floor 1
  dice.next = [1];
  await DiveOps.act(a, "pathfinder");
  assert.deepEqual(DiveOps.dive(a).mapped, ["a1"]);
  // 4 + 6 = 10: past the Password, the ICE and the DV8 File, down to floor 4 (both doors)
  dice.next = [6];
  await DiveOps.act(a, "pathfinder");
  assert.deepEqual(DiveOps.dive(a).mapped.sort(), ["a1", "a2", "a3", "a4", "b4"]);
  await DiveOps.jackOut(a);
});

/* ------------------------------------------ */
/*  The window                                */
/* ------------------------------------------ */

test("the Deep Dive renders: jacking in, the runner's map and HUD, and the GM's Architect", async () => {
  const item = await newArch();
  const a = runner("View");
  const app = { uiState: {}, actor: a };
  asUser(false);
  let ctx = await Dive.prepare(app, a);
  assert.equal(ctx.dive.out, true);
  let html = render("dive.hbs", ctx);
  assert.ok(html.includes('data-action="diveJackIn"'));
  await DiveOps.jackIn(a, item.uuid, { rig: "chair" });
  await DiveOps.move(a, "a1");
  ctx = await Dive.prepare(app, a);
  assert.equal(ctx.dive.here.key, "a1");
  assert.equal(ctx.dive.can.breach, true);
  assert.equal(ctx.dive.left, 3);
  // the runner sees where they've been and the door below, not the rest
  const shown = ctx.dive.map.rows.flatMap((r) => r.cells).filter(Boolean);
  assert.deepEqual(shown.map((c) => c.key), ["a1", "a2"]);
  assert.equal(shown[1].kind, "unknown");
  html = render("dive.hbs", ctx);
  assert.ok(html.includes('data-floor="a1"') && html.includes("nah-dive-here"));
  assert.ok(html.includes('data-act="breach"'));
  assert.ok(!html.includes("Payroll"), "nothing of the floors not found yet");
  // the GM's Architect: every floor, and who's under
  asUser(true);
  app.uiState.dive.mode = "architect";
  app.uiState.dive.arch = item.uuid;
  ctx = await Dive.prepare(app, a);
  assert.equal(ctx.dive.map.rows.flatMap((r) => r.cells).filter(Boolean).length, 5);
  assert.equal(ctx.dive.runners[0].name, "View");
  html = render("dive.hbs", ctx);
  assert.ok(html.includes("Payroll") && html.includes('data-floor-row="b4"'));
  assert.ok(html.includes('data-action="diveGenerate"'));
  await DiveOps.jackOut(a);
  assert.equal(DiveApp.APP_ID, "dive");
  assert.deepEqual(DiveApp.featureList().map((f) => f.id), ["dive"]);
  assert.deepEqual([...missingKeys].filter((k) => k.startsWith("NEONHOME.Dive")), []);
});

test("the GM rolls an architecture as a Cyberpunk RED NET Architecture item", async () => {
  asUser(true);
  const item = await DiveOps.create({ difficulty: "advanced", demon: "balron", name: "Arasaka Vault" });
  assert.equal(item.type, "netarch");
  assert.equal(item.name, "Arasaka Vault");
  const a = DiveOps.arch(item);
  assert.equal(a.demon.type, "balron");
  assert.ok(item.system.floors.length >= 1);
  assert.ok(DiveOps.architectures().some((i) => i.id === item.id));
  asUser(false);
  await assert.rejects(DiveOps.create({}), /GM/);
});
