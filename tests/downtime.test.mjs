/**
 * Downtime: whether a character is in it (Neon Hub's call, or the GM's switch), what the home keeps
 * to it, and spending its time.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { HomeOps, RuleBlock } = await import("../scripts/home/ops.js");
const { MaintOps } = await import("../scripts/home/maint-ops.js");
const { Downtime, formatMinutes } = await import("../scripts/home/downtime.js");
const { CPR } = await import("../scripts/cpr.js");

/** Neon Hub's downtime API, as of Neon Hub 1.11: a call with participants, each with its time. */
function neonHub({ total = 7 * 1440, participants = [], status = "open" } = {}) {
  const call = { id: "call1", label: "After the Arasaka job", total, participants, status, entries: [] };
  const spent = (uuid) => call.entries.filter((e) => e.actor === uuid).reduce((n, e) => n + e.minutes, 0);
  const api = {
    current: () => call,
    balance: (actor) => {
      const uuid = typeof actor === "string" ? actor : actor.uuid;
      if (!call.participants.includes(uuid)) return { total: 0, spent: 0, left: 0, taking: false };
      return { total: call.total, spent: spent(uuid), left: call.total - spent(uuid), taking: true };
    },
    log: (actor) => call.entries.filter((e) => e.actor === actor.uuid),
    spend: async (actor, minutes, details) => {
      const entry = { id: `e${call.entries.length + 1}`, actor: actor.uuid, minutes, ...details };
      call.entries.push(entry);
      return entry;
    },
    refund: async (id) => {
      call.entries = call.entries.filter((e) => e.id !== id);
    },
    open: () => "opened"
  };
  game.modules.set("cpr-neon-hub", { active: true, api: { downtime: api } });
  return call;
}
const noHub = () => game.modules.delete("cpr-neon-hub");

function vex() {
  const stash = makeActor({ name: "Vex's stash", type: "container" });
  return makeActor({ name: "Vex", type: "character", system: { stats: { body: { value: 6 } }, installedItems: { list: [] } }, flags: { [M]: { home: { stash: stash.uuid } } } }, [
    { _id: "rifle", name: "Assault Rifle", type: "weapon", system: { equipped: "carried", handsReq: 2, price: { market: 500 }, installedItems: { list: [], slots: 3 } } },
    { _id: "deck", name: "Cyberdeck", type: "cyberdeck", system: { price: { market: 100 } }, flags: { [M]: { item: { condition: "destroyed" } } } }
  ]);
}

test("without Neon Hub, the GM switches downtime on and off", async () => {
  noHub();
  const actor = vex();
  await game.settings.set(M, "downtimeOn", false);
  assert.equal(Downtime.isActive(actor), false);
  asUser(false);
  await assert.rejects(Downtime.setOn(true), RuleBlock);
  asUser(true);
  await Downtime.setOn(true);
  assert.deepEqual(Downtime.state(actor), { active: true, source: "gm", label: "", total: null, spent: 0, left: null });
  assert.equal(await Downtime.spend(actor, 60, { label: "x" }), null, "untimed: nothing to spend");
  await Downtime.setOn(false);
});

test("with Neon Hub, a character is in downtime when they take part in its call", () => {
  const actor = vex();
  neonHub({ participants: [actor.uuid] });
  try {
    const st = Downtime.state(actor);
    assert.deepEqual([st.active, st.source, st.label, st.left], [true, "hub", "After the Arasaka job", 10080]);
    assert.equal(Downtime.isActive(vex()), false, "someone not taking part isn't");
    neonHub({ participants: [actor.uuid], status: "done" });
    assert.equal(Downtime.isActive(actor), false, "a finished call isn't downtime");
  } finally {
    noHub();
  }
});

test("players reach the stash, the bench and the bay only in downtime; the GM always", async () => {
  noHub();
  await game.settings.set(M, "downtimeOn", false);
  const actor = vex();
  asUser(false);
  for (const gate of ["stash", "bench", "bay", "maintenance"]) assert.equal(Downtime.allows(actor, gate), false, gate);
  const stash = actor.flags[M].home.stash;
  await assert.rejects(HomeOps.transfer(actor, actor.uuid, "rifle", stash), /home stash/);
  await assert.rejects(HomeOps.stow(actor, "rifle"), /home stash/);
  await assert.rejects(HomeOps.attach(actor, "rifle", "scope"), /Workbench/);
  await assert.rejects(HomeOps.park(actor, "Actor.car", 0), /vehicles/);
  // the GM can turn a gate off
  await game.settings.set(M, "downtimeBay", false);
  assert.equal(Downtime.allows(actor, "bay"), true);
  await game.settings.set(M, "downtimeBay", true);
  asUser(true);
  assert.equal(Downtime.allows(actor, "stash"), true, "the GM isn't held back");
});

test("maintenance and repairs spend the worker's downtime; a cancelled roll gives it back", async () => {
  asUser(false);
  const actor = vex();
  const call = neonHub({ participants: [actor.uuid] });
  const real = CPR.skillCheck;
  try {
    let answer = { total: 20, html: "", critFail: false, critSuccess: false };
    let mods = null;
    CPR.skillCheck = async (who, skill, opts) => {
      mods = opts.mods;
      return answer;
    };
    await MaintOps.check(actor, "rifle", { mode: "maintain" });
    assert.deepEqual(call.entries.map((e) => [e.minutes, e.source]), [[60, M]], "a 500eb rifle: 1 hour");
    assert.deepEqual(mods, [], "not a Tech: no Field Expertise");
    // a repair takes the corebook's time for its price (p.140): a 100eb deck, DV17 and a day
    await MaintOps.check(actor, "deck", { mode: "repair" });
    assert.equal(call.entries.at(-1).minutes, 1440);
    assert.equal(actor.items.get("deck").flags[M].item.condition, "", "20 beats DV17");
    // the roll dialog cancelled: the time comes back
    actor.items.get("deck").flags[M].item.condition = "destroyed";
    answer = null;
    await MaintOps.check(actor, "deck", { mode: "repair" });
    assert.equal(call.entries.length, 2);
    // not enough time left
    call.total = 100;
    answer = { total: 20, html: "" };
    await assert.rejects(MaintOps.check(actor, "deck", { mode: "repair" }), /needs 1d of downtime/);
    // not taking part: stopped (players)
    const other = vex();
    await assert.rejects(MaintOps.check(other, "rifle", { mode: "maintain" }), /done in downtime/);
    // inspecting takes no downtime
    await MaintOps.check(other, "rifle", { mode: "inspect" });
  } finally {
    CPR.skillCheck = real;
    noHub();
    asUser(true);
  }
});

test("a Tech adds Field Expertise to maintenance and repair checks", async () => {
  noHub();
  await game.settings.set(M, "downtimeOn", true);
  const actor = vex();
  await actor.createEmbeddedDocuments("Item", [{ name: "Tech", type: "role", system: { abilities: [{ name: "Field Expertise", rank: 3 }] } }]);
  const real = CPR.skillCheck;
  let mods = null;
  CPR.skillCheck = async (who, skill, opts) => {
    mods = opts.mods;
    return { total: 5, html: "" };
  };
  try {
    await MaintOps.check(actor, "deck", { mode: "repair" });
    assert.deepEqual(mods.map((m) => m.value), [3]);
  } finally {
    CPR.skillCheck = real;
    await game.settings.set(M, "downtimeOn", false);
  }
});

test("downtime time reads as days, hours and minutes", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(90), "1h 30m");
  assert.equal(formatMinutes(10080), "7d");
  assert.equal(formatMinutes(1500), "1d 1h");
});
