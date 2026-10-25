/** The Cyberdeck tab (Unification Era, Chapter 10): the gear as data, deck slots, and slotting against mock documents. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser, loadTemplates, render } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const net = await import("../scripts/data/netrun.js");
const { DeckOps, netActions } = await import("../scripts/home/deck-ops.js");
const { HomeApp } = await import("../scripts/apps/home-app.js");
loadTemplates();
await game.settings.set(M, "downtimeOn", true);

const QH = (name, id) => ({ ...net.quickhackItem(net.QUICKHACK_BY_NAME.get(name.toLowerCase()), M), _id: id });
const HW = (name, id) => ({ ...net.hardwareItem(net.HARDWARE.find((h) => h.name === name), M), _id: id });
const DECK = (name, id, equipped = "owned") => {
  const d = net.deckItem(net.DECKS.find((x) => x.name === name), M);
  return { ...d, _id: id, system: { ...d.system, equipped } };
};
const SUITE = (name, id) => {
  const c = net.cybersuiteItem(net.CYBERSUITES.find((x) => x.name === name), M);
  return { ...c, _id: id, system: { ...c.system, isInstalled: true } };
};

function runner(items = [], { rank = 4 } = {}) {
  // installed cyberware is in the body's install list, as Cyberpunk RED keeps it
  return makeActor({ name: "Lattice", type: "character", system: { installedItems: { list: items.filter((i) => i.type === "cyberware").map((i) => i._id) } } }, [
    { _id: "role", name: "Netrunner", type: "role", system: { rank, abilities: [] } },
    ...items
  ]);
}

/* ------------------------------------------ */
/*  The gear as data                          */
/* ------------------------------------------ */

test("the book's netrunning gear: quickhacks, hardware, decks and Cybersuites", () => {
  assert.equal(net.QUICKHACKS.filter((q) => !q.vehicle).length, 30);
  assert.equal(net.QUICKHACKS.filter((q) => q.vehicle).length, 23);
  const sr = net.QUICKHACK_BY_NAME.get("system reset");
  assert.deepEqual([sr.dv, sr.cooldown, sr.slots, sr.quiet, sr.eb], [12, 40, 2, false, 5000], "an Ultimate takes 2 slots");
  assert.equal(net.QUICKHACK_BY_NAME.get("scannerz").quiet, true);
  assert.deepEqual(net.DECKS.find((d) => d.name === "Zetatech Parraline 6000").slots, { program: 3, hardware: 6, either: 0 });
  assert.deepEqual(net.DECKS.find((d) => d.name === "Cyberdeck (Excellent)").slots, { program: 0, hardware: 0, either: 9 });
  assert.deepEqual(net.CYBERSUITES.find((c) => c.name === "Arasaka Nagamasa").builtIn, ["Puppet", "Synapse Burnout", "Total System Kill"]);
  // as Cyberpunk RED items: a quickhack is an attacker program with ATK 0 (Interface + 1d10 vs DV)
  const item = net.quickhackItem(net.QUICKHACK_BY_NAME.get("synapse burnout"), M);
  assert.deepEqual([item.type, item.system.class, item.system.atk, item.system.size, item.system.damage.standard], ["program", "antipersonnelattacker", 0, 1, "3d6"]);
  assert.equal(net.hardwareItem(net.HARDWARE[0], M).system.type, "cyberdeck");
  assert.equal(netActions(4), 3);
  assert.equal(netActions(10), 5);
});

test("deck slots: Programs and Hardware fill their own slots first, then the either slots", () => {
  const parraline = { program: 3, hardware: 6, either: 0, total: 9 };
  const progs = (n, size = 1) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, kind: "program", size }));
  assert.deepEqual(net.layout(parraline, progs(4)).over, ["p3"], "only 3 Program slots");
  const std = { program: 0, hardware: 0, either: 7, total: 7 };
  const lay = net.layout(std, [{ id: "reset", kind: "program", size: 2 }, ...progs(4), { id: "hw", kind: "hardware", size: 1 }]);
  assert.deepEqual(lay.over, []);
  assert.equal(lay.cells.filter((c) => c.item === "reset").length, 2, "an Ultimate takes two cells");
  assert.equal(net.fits(std, [...progs(6)], { id: "x", kind: "program", size: 2 }), false);
  // what the rig adds
  assert.deepEqual(net.deckCapacity({ program: 0, hardware: 0, either: 7 }, "suite", { exDisks: 2, suit: true }), { program: 0, hardware: 3, either: 7, total: 10 });
  assert.deepEqual(net.deckCapacity({ program: 0, hardware: 0, either: 7 }, "arm", { armUpgrades: 1 }), { program: 0, hardware: 0, either: 9, total: 9 });
  assert.deepEqual(net.deckCapacity({ program: 0, hardware: 0, either: 7 }, "hand", { exDisks: 2 }).total, 7, "Ex-Disks only for a Cybersuite deck");
  assert.deepEqual(net.rigRange("suite", { sigboosters: 1 }), { arch: 20, port: 60 });
  assert.deepEqual(net.rigRange("hand", { rangeUpgrade: true }), { arch: 8, port: 8 });
});

/* ------------------------------------------ */
/*  Slotting                                  */
/* ------------------------------------------ */

test("the rig: the running deck, its Cybersuite and built-in quickhacks, range and slots", () => {
  const a = runner([SUITE("Zetatech Poolshark", "suite"), DECK("Zetatech Parraline 6000", "deck", "equipped"), QH("Scannerz", "scan")]);
  const rig = DeckOps.rig(a);
  assert.equal(rig.deck.id, "deck");
  assert.equal(rig.link, "suite", "a Cybersuite holds the deck by default");
  assert.deepEqual(rig.builtIn.map((q) => q.name), ["Scannerz", "E-Reader"]);
  assert.deepEqual(rig.range, { arch: 20, port: 50 });
  assert.deepEqual([rig.cap.program, rig.cap.hardware, rig.cap.total], [3, 6, 9]);
  assert.equal(rig.interface, 4);
});

test("slotting and unslotting: each kind in its own slots; full is full", async () => {
  asUser(false);
  const a = runner([
    DECK("Zetatech Parraline 6000", "deck", "equipped"),
    QH("Scannerz", "q1"), QH("Short Circuit", "q2"), QH("Overheat", "q3"), QH("Ping", "q4"), HW("Raven Heat Sink", "h1")
  ]);
  for (const id of ["q1", "q2", "q3"]) await DeckOps.slot(a, id);
  await assert.rejects(DeckOps.slot(a, "q4"), /Program slots are full/);
  await DeckOps.slot(a, "h1");
  const deck = a.items.get("deck");
  assert.deepEqual(deck.system.installedItems.list, ["q1", "q2", "q3", "h1"]);
  assert.deepEqual(deck.flags[M].deck.slots, { program: 3, hardware: 6, either: 0 }, "the deck's own split noted");
  await DeckOps.unslot(a, "q2");
  await DeckOps.slot(a, "q4");
  assert.ok(deck.system.installedItems.list.includes("q4"));
  await assert.rejects(DeckOps.slot(a, "deck"), /doesn't go in a deck/);
  asUser(true);
});

test("out of combat only; a Cybersuite's deck changes at a clinic (an hour of downtime, or the GM)", async () => {
  const a = runner([SUITE("Cybersuite (standard)", "suite"), DECK("Cyberdeck (Standard)", "d1", "equipped"), DECK("Cyberdeck (Poor)", "d2"), QH("Ping", "q1")]);
  game.combat = { started: true, combatants: [{ actor: a, actorId: a.id }] };
  try {
    asUser(false);
    await assert.rejects(DeckOps.slot(a, "q1"), /out of combat/);
    asUser(true);
    await DeckOps.slot(a, "q1");
  } finally {
    game.combat = null;
  }
  asUser(false);
  await game.settings.set(M, "downtimeOn", false);
  await assert.rejects(DeckOps.setDeck(a, "d2"), /Clinic job/);
  await game.settings.set(M, "downtimeOn", true);
  await DeckOps.setDeck(a, "d2");
  assert.equal(a.items.get("d2").system.equipped, "equipped");
  assert.equal(a.items.get("d1").system.equipped, "carried");
  // a cyberarm deck needs one
  await assert.rejects(DeckOps.setLink(a, "arm"), /no cyberarm deck/);
  await DeckOps.setLink(a, "hand");
  assert.equal(DeckOps.rig(a).link, "hand");
  assert.deepEqual(DeckOps.rig(a).builtIn, [], "built-in quickhacks only while the Cybersuite holds the deck");
  asUser(true);
});

test("the Cyberdeck tab renders: the strip, the slot board, the library", async () => {
  asUser(true);
  const a = runner([
    SUITE("Segotari Hexmage", "suite"), DECK("Cyberdeck (Standard)", "deck", "equipped"), DECK("Raven Microcyb Hummingbird", "deck2"),
    QH("System Reset", "q1"), QH("Ping", "q2"), HW("Spreader", "h1"),
    { _id: "eraser", name: "Eraser", type: "program", system: { class: "booster", size: 1, description: { value: "<p>+2 to Cloak.</p>" } } }
  ]);
  await DeckOps.slot(a, "q1");
  const app = new HomeApp();
  app.actorId = a.id;
  app.tab = "deck";
  for (const tab of ["quickhacks", "programs", "hardware", "decks", "cybersuites"]) {
    app.uiState.deck = { tab, focus: tab === "quickhacks" ? "q1" : null };
    const ctx = await app._prepareContext();
    const html = render("shell.hbs", ctx);
    assert.ok(html.includes("nah-deck-grid"), tab);
    assert.ok(!/NEONHOME\./.test(html), `raw keys on ${tab}`);
    if (tab === "quickhacks") {
      assert.ok(html.includes("System Reset") && html.includes("--span: 2"), "the Ultimate spans two cells");
      assert.ok(html.includes("Cripple Movement"), "the Hexmage's built-in quickhacks");
      assert.ok(html.includes('data-item-id="q2"') && html.includes("data-drag"));
    }
    if (tab === "decks") assert.ok(html.includes("Raven Microcyb Hummingbird"));
    if (tab === "cybersuites") assert.ok(html.includes("Segotari Hexmage") && html.includes("installed in the Neuroport"), "the Cybersuite, installed");
  }
});
