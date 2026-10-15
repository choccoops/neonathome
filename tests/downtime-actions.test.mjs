/** Downtime actions from the core rulebook: the rules as data, and doing them against mock documents. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser, chat, dice } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { RuleBlock } = await import("../scripts/home/ops.js");
const { DowntimeOps } = await import("../scripts/home/downtime-ops.js");
const { ProjectOps } = await import("../scripts/home/project-ops.js");
const projects = await import("../scripts/data/projects.js");
const { CPR } = await import("../scripts/cpr.js");
const data = await import("../scripts/data/downtime.js");
const { materialsItemData } = await import("../scripts/data/materials.js");

/** Tech Materials items: [tier, how many, where from]. */
const mats = (...list) => list.map(([tier, amount = 1, source = ""], i) => {
  const d = materialsItemData(tier, M, { source });
  return { ...d, _id: `mat${tier}${i}`, system: { ...d.system, amount } };
});

await game.settings.set(M, "downtimeOn", true);

/** CPR's skill roll comes out at `total`; records what was rolled. */
const rolled = [];
function rolls(total) {
  CPR.skillCheck = async (actor, skill, opts = {}) => {
    rolled.push({ actor: actor.name, skill, mods: (opts.mods ?? []).map((m) => m.value), stat: opts.stat });
    return total === null ? null : { total, html: "<roll>", critFail: false, critSuccess: false };
  };
}

function character(name, roles = [], extra = []) {
  return makeActor({
    name, type: "character",
    system: { stats: { body: { value: 6 } }, derivedStats: { hp: { value: 10, max: 40 }, humanity: { value: 30, max: 50 } }, wealth: { value: 1000, transactions: [] }, installedItems: { list: [] } }
  }, [...roles.map(([role, rank, abilities = []], i) => ({ _id: `role${i}`, name: role, type: "role", system: { rank, abilities } })), ...extra]);
}

/* ------------------------------------------ */
/*  Rules                                     */
/* ------------------------------------------ */

test("Hustle pay by Role Ability Rank band (p.381)", () => {
  assert.deepEqual(data.hustle("solo", 2, 4), { text: data.HUSTLES.solo[1][0], eb: 200 });
  assert.equal(data.hustle("solo", 2, 5).eb, 300);
  assert.equal(data.hustle("solo", 2, 8).eb, 600);
  assert.equal(data.hustle("tech", 1, 3).eb, 0, "no jobs this week");
  for (const role of data.ROLES) assert.equal(data.HUSTLES[role].length, 6, role);
});

test("Maker: DV and time by price, materials a category lower or the same (pp.148-149)", () => {
  assert.deepEqual(data.makerJob(10), { dv: 9, minutes: 60, time: "1h" });
  assert.deepEqual(data.makerJob(500), { dv: 21, minutes: 10080, time: "1w" });
  assert.equal(data.makerJob(20, { vehicle: true }).dv, 24, "vehicle upgrades count as Very Expensive");
  assert.equal(data.fabricationMaterials(10), 5, "a Cheap item: 5eb");
  assert.equal(data.fabricationMaterials(500), 100, "Expensive from Premium materials");
  assert.equal(data.fabricationMaterials(20000), 10000, "Super Luxury: half its price");
  assert.equal(data.upgradeMaterials(500), 500);
  assert.equal(data.upgradeMaterials(50000, { vehicle: true }), 1000);
});

test("an invention's planned value sets its category; Super Luxury takes a month per 10,000eb (p.149)", () => {
  assert.deepEqual(data.inventPrice("luxury"), { category: "luxury", value: 5000, ok: true }, "no value: the category's own");
  assert.deepEqual(data.inventPrice("expensive", 35000), { category: "superLuxury", value: 35000, ok: true }, "the value wins");
  assert.equal(data.inventPrice("expensive", 200).ok, false, "below Expensive");
  assert.deepEqual([data.makerJob(35000).dv, data.makerJob(35000).minutes], [29, 4 * 43200], "35,000eb: four months");
  assert.equal(data.makerJob(10000).minutes, 43200);
});

test("Believability and treatments", () => {
  assert.equal(data.believability(1), 2);
  assert.equal(data.believability(5, 1), 5);
  assert.equal(data.believability(10, 5), 10, "+1 and +2 stack");
  const ribs = { system: { treatment: { type: "paramedicSurgery", dvParamedic: 15, dvSurgery: 13 } } };
  assert.deepEqual(data.treatments(ribs).map((t) => `${t.skill}${t.dv}`), ["Paramedic15", "Surgery13"]);
  assert.deepEqual(data.treatments(ribs, { cyber: true }).map((t) => `${t.skill}${t.dv}`), ["Paramedic15", "Surgery13", "Cybertech15", "Cybertech13"]);
  const quick = { system: { treatment: { type: "quickFix" }, quickFix: { type: "firstAidParamedic", dvFirstAid: 10, dvParamedic: 10 } } };
  assert.deepEqual(data.treatments(quick).map((t) => t.skill), ["First Aid", "Paramedic"]);
});

/* ------------------------------------------ */
/*  Doing them                                */
/* ------------------------------------------ */

test("downtime actions only in downtime, for the GM too: the time is the character's", async () => {
  const solo = character("Rook", [["Solo", 4]]);
  await game.settings.set(M, "downtimeOn", false);
  try {
    asUser(false);
    await assert.rejects(DowntimeOps.perform(solo, "hustle"), RuleBlock);
    asUser(true);
    await assert.rejects(DowntimeOps.perform(solo, "rest", { days: 1 }), /taken in downtime/);
    assert.equal(solo.system.derivedStats.hp.value, 10, "no free healing");
  } finally {
    await game.settings.set(M, "downtimeOn", true);
  }
});

test("with Neon Hub: only characters in the call, only with the time left, logged there", async () => {
  asUser(true);
  const solo = character("Rook", [["Solo", 4]]);
  const out = character("Vex", [["Solo", 4]]);
  const call = downtime(solo, 1440);
  try {
    // not taking part: nothing happens, even for the GM
    await assert.rejects(DowntimeOps.perform(out, "rest", { days: 1 }), /isn't taking part/);
    assert.equal(out.system.derivedStats.hp.value, 10);
    // two days asked, one day left
    await assert.rejects(DowntimeOps.perform(solo, "rest", { days: 2 }), /needs 2d of downtime and has 1d/);
    assert.equal(solo.system.derivedStats.hp.value, 10);
    await DowntimeOps.perform(solo, "rest", { days: 1 });
    assert.equal(solo.system.derivedStats.hp.value, 16, "BODY 6 for the day");
    assert.deepEqual(call.entries.map((e) => [e.minutes, e.label]), [[1440, "Rest and recover"]]);
    // nothing left: a week's Hustle can't happen
    await assert.rejects(DowntimeOps.perform(solo, "hustle"), /has 0m left/);
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});

test("the Hustle: a week, 1d6 on the Role's table, the pay into the wealth ledger", async () => {
  asUser(false);
  const rocker = character("Kerry", [["Rockerboy", 6]]);
  dice.next = [3];
  const res = await DowntimeOps.perform(rocker, "hustle");
  assert.equal(res.eb, 500);
  assert.equal(rocker.system.wealth.value, 1500);
  assert.match(rocker.system.wealth.transactions[0][1], /Hustle \(Rockerboy\)/);
  assert.match(chat.at(-1).content, /rolled <b>3<\/b>/);
  asUser(true);
});

test("rest heals BODY a day, never past the maximum", async () => {
  const actor = character("Vex", [["Solo", 2]]);
  const res = await DowntimeOps.perform(actor, "rest", { days: 3 });
  assert.equal(res.healed, 18);
  assert.equal(actor.system.derivedStats.hp.value, 28);
  await DowntimeOps.perform(actor, "rest", { days: 5 });
  assert.equal(actor.system.derivedStats.hp.value, 40);
});

test("treating a critical injury: not on yourself, the injury's DV, gone on a success", async () => {
  const doc = character("Doc", [["Medtech", 4, [{ name: "Surgery Skill", rank: 4 }, { name: "Medical Tech Skill", rank: 3 }]]]);
  const patient = character("Rook", [["Solo", 4]], [{ _id: "ribs", name: "Broken Ribs", type: "criticalInjury", system: { treatment: { type: "paramedicSurgery", dvParamedic: 15, dvSurgery: 13 } } }]);
  rolls(14);
  await assert.rejects(DowntimeOps.perform(patient, "treat", { patient: patient.id, injury: "ribs" }), /themselves/);
  const fail = await DowntimeOps.perform(doc, "treat", { patient: patient.id, injury: "ribs", option: 0 });
  assert.equal(fail.ok, false, "14 doesn't reach Paramedic DV15");
  const ok = await DowntimeOps.perform(doc, "treat", { patient: patient.id, injury: "ribs", option: 1 });
  assert.equal(ok.ok, true, "Surgery DV13");
  assert.deepEqual(rolled.at(-1).mods, [4], "TECH + the Surgery Skill rank");
  assert.equal(patient.items.get("ribs"), undefined);
});

test("pharmaceuticals: DV13 Medical Tech, 200eb either way, doses equal to the skill", async () => {
  const doc = character("Doc", [["Medtech", 4, [{ name: "Medical Tech Skill", rank: 3 }]]]);
  rolls(10);
  const fail = await DowntimeOps.perform(doc, "pharma", { drug: "speedheal" });
  assert.equal(fail.ok, false);
  assert.equal(doc.system.wealth.value, 800, "materials wasted");
  rolls(15);
  const ok = await DowntimeOps.perform(doc, "pharma", { drug: "speedheal" });
  assert.equal(ok.doses, 3);
  assert.equal(doc.items.find((i) => i.name === "Speedheal").system.amount, 3);
  assert.equal(rolled.at(-1).stat, "tech");
  await assert.rejects(DowntimeOps.perform(character("Nurse", [["Medtech", 1]]), "pharma", { drug: "stim" }), /no Medical Tech/);
});

test("therapy restores Humanity to the patient, never to yourself", async () => {
  const doc = character("Doc", [["Medtech", 4, [{ name: "Medical Tech Skill", rank: 4 }]]]);
  const patient = character("Rook", [["Solo", 4]]);
  rolls(16);
  await assert.rejects(DowntimeOps.perform(doc, "therapy", { patient: doc.id, therapy: "standard" }), /themselves/);
  dice.next = [7];
  const res = await DowntimeOps.perform(doc, "therapy", { patient: patient.id, therapy: "standard" });
  assert.equal(res.healed, 7);
  assert.equal(patient.system.derivedStats.humanity.value, 37);
  assert.equal(doc.system.wealth.value, 900);
  rolls(16);
  const extreme = await DowntimeOps.perform(doc, "therapy", { patient: patient.id, therapy: "extreme" });
  assert.equal(extreme.ok, false, "DV17");
});

test("therapy takes the patient's week too, logged in their downtime", async () => {
  asUser(true);
  const doc = character("Doc", [["Medtech", 4, [{ name: "Medical Tech Skill", rank: 4 }]]]);
  const patient = character("Rook", [["Solo", 4]]);
  const call = downtime(doc, 10080);
  try {
    rolls(20);
    await assert.rejects(DowntimeOps.perform(doc, "therapy", { patient: patient.id, therapy: "addiction" }), /Rook isn't taking part/);
    call.participants.push(patient.uuid);
    dice.next = [5];
    await DowntimeOps.perform(doc, "therapy", { patient: patient.id, therapy: "standard" });
    assert.deepEqual(call.entries.map((e) => e.minutes), [10080, 10080], "the Medtech's week and the patient's");
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});

test("Media: rumors against the Active DV, stories against Believability", async () => {
  const media = character("Ink", [["Media", 5]]);
  rolls(15);
  assert.equal((await DowntimeOps.perform(media, "rumor", { depth: "typical", skill: "Library Search" })).ok, true);
  assert.equal((await DowntimeOps.perform(media, "rumor", { depth: "substantial" })).ok, false);
  dice.next = [5];
  const story = await DowntimeOps.perform(media, "story", { evidence: 1 });
  assert.deepEqual([story.chance, story.roll, story.ok], [5, 5, true]);
});

test("a Night Market needs Operator 5 and comes once a month", async () => {
  asUser(false);
  await assert.rejects(DowntimeOps.perform(character("Small", [["Fixer", 4]]), "nightMarket"), /Rank 5/);
  const fixer = character("Rogue", [["Fixer", 6]]);
  await DowntimeOps.perform(fixer, "nightMarket");
  await assert.rejects(DowntimeOps.perform(fixer, "nightMarket"), /already/);
  asUser(true);
});

/* ------------------------------------------ */
/*  Projects: Maker work and repairs          */
/* ------------------------------------------ */

test("a project's halfway check, and how time splits around it", () => {
  const p = projects.normalizeProject({ id: "p", kind: "fabricate", dv: 21, minutes: 10080, done: 0 });
  assert.equal(projects.halfway(p), 5040);
  assert.equal(projects.stage(p), "build");
  assert.deepEqual(projects.plan(p, 8000), { before: 5040, after: 2960 }, "past the halfway mark only once the check passes");
  const due = { ...p, done: 5040 };
  assert.equal(projects.stage(due), "check");
  assert.deepEqual(projects.plan(due, 1000), { before: 0, after: 0 }, "nothing goes in while the check is due");
  const passed = { ...due, check: "passed" };
  assert.equal(projects.stage(passed), "finish");
  assert.deepEqual(projects.plan(passed, 99999), { before: 0, after: 5040 });
  assert.equal(projects.stage({ ...passed, done: 10080 }), "done");
  assert.deepEqual(projects.meter({ ...p, done: 2520 }), { pct: 25, half: 50 });
});

/** Neon Hub's downtime with this much time for each character taking part (each has their own). */
function downtime(actor, total) {
  const call = { id: "c", label: "Downtime", total, participants: [actor.uuid], status: "open", entries: [] };
  const spent = (a) => call.entries.filter((e) => e.actor === a?.uuid).reduce((n, e) => n + e.minutes, 0);
  game.modules.set("cpr-neon-hub", { active: true, api: { downtime: {
    current: () => call,
    balance: (a) => (call.participants.includes(a?.uuid) ? { total: call.total, spent: spent(a), left: call.total - spent(a), taking: true } : { total: 0, spent: 0, left: 0, taking: false }),
    log: (a) => call.entries.filter((e) => e.actor === a?.uuid),
    spend: async (a, minutes, details) => call.entries.push({ id: `e${call.entries.length}`, actor: a.uuid, minutes, ...details }),
    refund: async () => null
  } } });
  return call;
}

test("fabricating over two downtimes: materials up front, the check at halfway, the item at the end", async () => {
  const tech = character("Gearhead", [["Tech", 4, [{ name: "Fabrication Expertise", rank: 2 }]]], mats(["premium", 2, "an old rifle"]));
  const shop = makeActor({ name: "Shop", type: "container" }, [{ _id: "rifle", name: "Assault Rifle", type: "weapon", system: { price: { market: 500 }, equipped: "carried" } }]);
  // an Expensive item: DV21 and a week; this downtime has 3 days
  let call = downtime(tech, 3 * 1440);
  try {
    rolls(25);
    const before = rolled.length;
    const p = await ProjectOps.start(tech, "fabricate", { item: shop.items.get("rifle").uuid });
    assert.equal(tech.system.wealth.value, 1000, "no eb: materials are items");
    assert.equal(tech.items.find((i) => i.flags?.[M]?.materials === "premium").system.amount, 1, "a Premium unit used when it starts");
    assert.deepEqual(p.data.sources, ["an old rifle"], "where the materials came from, for the books");
    assert.match(chat.find((m) => /starts a project/.test(m.content)).content, /1 × Premium Tech Materials/);
    assert.deepEqual([p.done, p.check, projects.stage(p)], [4320, null, "build"], "3 days in, short of the halfway mark");
    assert.equal(rolled.length, before, "no check yet");
    // the next downtime: a week; it reaches halfway, rolls, passes, and finishes
    call = downtime(tech, 10080);
    const done = await ProjectOps.work(tech, p.id, "all");
    assert.equal(done.done, true);
    assert.deepEqual(rolled.at(-1).mods, [2], "+ Fabrication Expertise");
    assert.equal(rolled.at(-1).skill, "Weaponstech");
    assert.deepEqual(call.entries.map((e) => e.minutes), [720, 5040], "to halfway, then the rest");
    assert.ok(tech.items.find((i) => i.name === "Assault Rifle"));
    assert.equal(ProjectOps.list(tech).length, 0);
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});

test("fabricating from a blueprint: the GM's linked item, at the invention's value and skill", async () => {
  const { fabricationOf, blueprintData } = await import("../scripts/home/project-ops.js");
  const tech = character("Gearhead", [["Tech", 4]], mats(["expensive", 1]));
  const bpData = blueprintData({ skill: "Weaponstech", dv: 24, data: { name: "Whisper Can", category: "veryExpensive", value: 2000, text: "A quieter suppressor" } }, tech);
  // nothing linked: a plain gear item from the design
  const plain = fabricationOf({ ...bpData, _id: "x" });
  assert.deepEqual([plain.data.name, plain.data.type, plain.price, plain.skill, plain.linked], ["Whisper Can", "gear", 2000, "Weaponstech", false]);
  assert.match(plain.data.system.description.value, /A quieter suppressor/);
  // the GM's write-up linked: that item is made
  bpData.flags[M].blueprint.makes = { name: "Whisper Can Suppressor", type: "itemUpgrade", img: "x.webp", system: { type: "weapon", price: { market: 2000 } }, flags: {} };
  const [bp] = await tech.createEmbeddedDocuments("Item", [bpData]);
  const elsewhere = makeActor({ name: "Shop", type: "container" }, [{ ...bpData, _id: "bpshop" }]);
  const call = downtime(tech, 3 * 10080);
  try {
    rolls(30);
    await assert.rejects(ProjectOps.start(tech, "fabricate", { item: elsewhere.items.get("bpshop").uuid }), /needs Blueprint: Whisper Can on hand/);
    const p = await ProjectOps.start(tech, "fabricate", { item: bp.uuid }, { minutes: "all" });
    assert.deepEqual([p.dv, p.minutes, p.skill], [24, 20160, "Weaponstech"], "Very Expensive: DV24, two weeks, the invention's skill");
    assert.equal(ProjectOps.list(tech).length, 0, "finished");
    assert.deepEqual(call.entries.map((e) => e.minutes), [10080, 10080]);
    const made = tech.items.find((i) => i.name === "Whisper Can Suppressor");
    assert.equal(made.type, "itemUpgrade");
    assert.equal(made.flags?.[M]?.blueprint, undefined, "the made item isn't a blueprint");
    assert.ok(tech.items.get(bp.id), "the blueprint is kept");
    assert.match(chat.at(-1).content, /from Blueprint: Whisper Can/);
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});

test("a failed halfway check starts the project over; the materials aren't bought again", async () => {
  const tech = character("Gearhead", [["Tech", 4]], mats(["costly"]));
  const shop = makeActor({ name: "Shop", type: "container" }, [{ _id: "agent", name: "Agent", type: "gear", system: { price: { market: 100 } } }]);
  const call = downtime(tech, 10080);
  try {
    rolls(5);
    // Premium: DV17 and a day; "all": it reaches halfway (12h) and fails there
    const p = await ProjectOps.start(tech, "fabricate", { item: shop.items.get("agent").uuid });
    assert.deepEqual([p.done, p.restarts], [0, 1], "back to the start");
    assert.deepEqual(call.entries.map((e) => e.minutes), [720], "only the first half was spent");
    assert.equal(tech.items.filter((i) => i.flags?.[M]?.materials).length, 0, "the Costly unit went in");
    rolls(17);
    const done = await ProjectOps.work(tech, p.id, "all");
    assert.equal(done.done, true, "the same materials, nothing more needed");
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});

test("a cancelled check leaves it due, and no time goes past the halfway mark", async () => {
  const tech = character("Gearhead", [["Tech", 4]]);
  const call = downtime(tech, 10080);
  try {
    rolls(null);
    const p = await ProjectOps.start(tech, "invent", { text: "A self-cleaning rifle", category: "expensive", skill: "Weaponstech" });
    assert.equal(projects.stage(ProjectOps.get(tech, p.id)), "check");
    assert.equal(call.entries.reduce((n, e) => n + e.minutes, 0), 5040);
    rolls(30);
    await ProjectOps.roll(tech, p.id);
    assert.equal(ProjectOps.get(tech, p.id).check, "passed");
    await ProjectOps.work(tech, p.id, "all");
    assert.match(chat.at(-1).content, /self-cleaning rifle/);
    // a blueprint of it, at the price category it was invented at
    const bp = tech.items.find((i) => i.flags?.[M]?.blueprint);
    assert.equal(bp.name, "Blueprint: Untitled Invention");
    assert.equal(bp.system.price.market, 500, "Expensive");
    assert.match(bp.system.description.value, /A self-cleaning rifle/);
    assert.deepEqual([bp.flags[M].blueprint.category, bp.flags[M].blueprint.inventor], ["expensive", "Gearhead"]);
    assert.match(chat.at(-1).content, /Blueprint: Untitled Invention/);
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});

test("Upgrade projects: one per item, applied when done", async () => {
  const tech = character("Gearhead", [["Tech", 4, [{ name: "Upgrade Expertise", rank: 1 }]]], [
    ...mats(["premium"]),
    { _id: "pistol", name: "Pistol", type: "weapon", system: { price: { market: 100 }, quality: "standard", installedItems: { slots: 3, list: [] }, concealable: { concealable: false } } }
  ]);
  rolls(20);
  await ProjectOps.start(tech, "upgrade", { item: "pistol", upgrade: "slot" }, { minutes: "check" });
  await assert.rejects(ProjectOps.start(tech, "upgrade", { item: "pistol", upgrade: "quality" }), /one per item/, "not while one's under way");
  const p = ProjectOps.list(tech)[0];
  await ProjectOps.work(tech, p.id, "all");
  assert.equal(tech.items.get("pistol").system.installedItems.slots, 4);
  await assert.rejects(ProjectOps.start(tech, "upgrade", { item: "pistol", upgrade: "quality" }), /one per item/);
  // no materials, no project
  const broke = character("Broke", [["Tech", 4]], [{ _id: "smg", name: "SMG", type: "weapon", system: { price: { market: 100 } } }]);
  await assert.rejects(ProjectOps.start(broke, "upgrade", { item: "smg", upgrade: "slot" }), /needs 1 × Premium Tech Materials/);
  assert.equal(ProjectOps.list(broke).length, 0);
  // not a Tech
  await assert.rejects(ProjectOps.start(character("Rook", [["Solo", 4]]), "invent", { text: "x" }), /Only a Tech/);
});

test("repairs are projects too: anyone with the skill, the item working again at the end", async () => {
  const owner = character("Rook", [["Solo", 4]], [{ _id: "deck", name: "Cyberdeck", type: "cyberdeck", system: { price: { market: 500 } }, flags: { [M]: { item: { condition: "destroyed" } } } }]);
  const tech = character("Gearhead", [["Tech", 4, [{ name: "Field Expertise", rank: 2 }]]]);
  rolls(22);
  // an Expensive deck: DV21 and a week (p.140), worked by the Tech on Rook's deck
  await ProjectOps.repair(tech, owner, "deck", { minutes: "check" });
  const p = ProjectOps.repairOf(tech, owner, "deck");
  assert.deepEqual([p.dv, p.minutes, p.check], [21, 10080, "passed"]);
  assert.deepEqual(rolled.at(-1).mods, [2], "a Tech's Field Expertise");
  assert.equal(owner.items.get("deck").flags[M].item.condition, "destroyed", "not yet");
  await ProjectOps.repair(tech, owner, "deck");
  assert.equal(owner.items.get("deck").flags[M].item.condition, "");
  assert.equal(ProjectOps.list(tech).length, 0);
});

test("any amount of downtime into a project, a bit at a time", async () => {
  const tech = character("Gearhead", [["Tech", 4]]);
  const call = downtime(tech, 10080);
  try {
    rolls(30);
    // an invention, Expensive: DV21 and a week. Put in 90 minutes, then 30
    const p = await ProjectOps.start(tech, "invent", { name: "Whisper Can", text: "A quieter suppressor", category: "expensive", skill: "Weaponstech" }, { minutes: 90 });
    assert.equal(p.label, "Invent Whisper Can");
    // a Super Luxury idea the GM valued at 25,000eb: three months, and the blueprint at that value
    const big = await ProjectOps.start(tech, "invent", { name: "Orbital Drop Pod", text: "x", value: 25000 }, { minutes: 0 });
    assert.deepEqual([big.dv, big.minutes, big.data.category, big.data.value], [29, 3 * 43200, "superLuxury", 25000]);
    await assert.rejects(ProjectOps.start(tech, "invent", { text: "x", value: 100 }, { minutes: 0 }), /Expensive \(500eb\) at the least/);
    assert.equal(ProjectOps.get(tech, p.id).done, 90);
    await ProjectOps.work(tech, p.id, 30);
    assert.equal(ProjectOps.get(tech, p.id).done, 120);
    assert.deepEqual(call.entries.map((e) => e.minutes), [90, 30]);
    // an amount past the downtime left can't be put in; "all" takes what there is
    call.total = 200;
    await assert.rejects(ProjectOps.work(tech, p.id, 600), /needs 10h of downtime and has 1h 20m left/);
    assert.equal(ProjectOps.get(tech, p.id).done, 120);
    await ProjectOps.work(tech, p.id, "all");
    assert.equal(ProjectOps.get(tech, p.id).done, 200);
    await assert.rejects(ProjectOps.work(tech, p.id, "all"), /No downtime left/);
    // starting one with more than there is: refused before anything's used
    await assert.rejects(ProjectOps.start(tech, "invent", { text: "x", category: "expensive" }, { minutes: 60 }), /has 0m left/);
    assert.equal(ProjectOps.list(tech).length, 2, "the two already started, nothing more");
  } finally {
    game.modules.delete("cpr-neon-hub");
  }
});
