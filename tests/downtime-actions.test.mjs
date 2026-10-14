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
const { CPR } = await import("../scripts/cpr.js");
const data = await import("../scripts/data/downtime.js");

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

test("players act in downtime only; the GM any time", async () => {
  const solo = character("Rook", [["Solo", 4]]);
  await game.settings.set(M, "downtimeOn", false);
  asUser(false);
  await assert.rejects(DowntimeOps.perform(solo, "hustle"), RuleBlock);
  asUser(true);
  dice.next = [1];
  await DowntimeOps.perform(solo, "hustle");
  await game.settings.set(M, "downtimeOn", true);
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

test("Fabrication: materials paid on a success, the item made; a failure keeps the materials", async () => {
  const tech = character("Gearhead", [["Tech", 4, [{ name: "Fabrication Expertise", rank: 2 }]]]);
  const blueprint = makeActor({ name: "Shop", type: "container" }, [{ _id: "smg", name: "Heavy SMG", type: "weapon", system: { price: { market: 100 }, equipped: "carried" } }]).items.get("smg");
  rolls(10);
  const fail = await DowntimeOps.perform(tech, "fabricate", { item: blueprint.uuid });
  assert.equal(fail.ok, false, "a Premium item: DV17");
  assert.equal(tech.system.wealth.value, 1000);
  assert.equal(rolled.at(-1).skill, "Weaponstech");
  assert.deepEqual(rolled.at(-1).mods, [2]);
  rolls(20);
  const ok = await DowntimeOps.perform(tech, "fabricate", { item: blueprint.uuid });
  assert.equal(ok.materials, 50, "Costly materials");
  assert.equal(tech.system.wealth.value, 950);
  const made = tech.items.find((i) => i.name === "Heavy SMG");
  assert.equal(made.system.equipped, "owned");
  // not a Tech
  await assert.rejects(DowntimeOps.perform(character("Rook", [["Solo", 4]]), "fabricate", { item: blueprint.uuid }), /Only a Tech/);
});

test("Upgrade: one per item; slots, concealable, quality and SP are applied", async () => {
  const tech = character("Gearhead", [["Tech", 4, [{ name: "Upgrade Expertise", rank: 1 }]]], [
    { _id: "pistol", name: "Pistol", type: "weapon", system: { price: { market: 100 }, quality: "standard", installedItems: { slots: 3, list: [] }, concealable: { concealable: false } } },
    { _id: "jack", name: "Armorjack", type: "armor", system: { price: { market: 100 }, bodyLocation: { sp: 11 }, headLocation: { sp: 0 } } }
  ]);
  rolls(20);
  await DowntimeOps.perform(tech, "upgrade", { item: "pistol", upgrade: "slot" });
  assert.equal(tech.items.get("pistol").system.installedItems.slots, 4);
  assert.equal(tech.system.wealth.value, 900, "Premium materials");
  await assert.rejects(DowntimeOps.perform(tech, "upgrade", { item: "pistol", upgrade: "quality" }), /one per item/);
  await DowntimeOps.perform(tech, "upgrade", { item: "jack", upgrade: "sp" });
  assert.equal(tech.items.get("jack").system.bodyLocation.sp, 12);
  assert.equal(tech.items.get("jack").system.headLocation.sp, 0, "no SP there: none added");
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
