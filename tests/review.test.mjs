/** The 2070 rulebook review: training, sourcing, art, bodysculpting, Night Markets, rest and health plans, Maximum Humanity, repairs, Iconics, TUps and Taking Less Time, Narrative Quickhacks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, chat, dice, asUser } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { CPR } = await import("../scripts/cpr.js");
const { LifeOps } = await import("../scripts/home/life-ops.js");
const { DowntimeOps } = await import("../scripts/home/downtime-ops.js");
const { ProjectOps } = await import("../scripts/home/project-ops.js");
const { DeckOps } = await import("../scripts/home/deck-ops.js");
const { HomeOps } = await import("../scripts/home/ops.js");
const living = await import("../scripts/data/living.js");
const maint = await import("../scripts/data/maintenance.js");
const dt = await import("../scripts/data/downtime.js");
const net = await import("../scripts/data/netrun.js");
const { materialsItemData } = await import("../scripts/data/materials.js");
await game.settings.set(M, "downtimeOn", true);

const rolled = [];
function rolls(total, critFail = false) {
  CPR.skillCheck = async (actor, skill, opts = {}) => {
    rolled.push({ skill, stat: opts.stat, mods: (opts.mods ?? []).map((m) => m.value) });
    return total === null ? null : { total, html: "", critFail, critSuccess: false };
  };
}

function character(name, roles = [], extra = [], system = {}) {
  return makeActor({
    name, type: "character",
    system: {
      stats: { body: { value: 6 }, emp: { value: 6, max: 6 } }, derivedStats: { hp: { value: 20, max: 40 }, humanity: { value: 60, max: 60 } },
      wealth: { value: 10000, transactions: [] }, improvementPoints: { value: 0 }, installedItems: { list: [] }, ...system
    }
  }, [...roles.map(([role, rank, abilities = []], i) => ({ _id: `role${i}`, name: role, type: "role", system: { rank, abilities } })), ...extra]);
}
const skill = (name, level, { category = "educationSkills", difficulty = "typical", id = `sk${name.replace(/\W/g, "")}` } = {}) => ({ _id: id, name, type: "skill", system: { level, category, difficulty } });

/* ------------------------------------------ */
/*  Training                                  */
/* ------------------------------------------ */

test("training: progress by teacher, never past their max, Skills (×2), chips, Elementary and Push Training", () => {
  const { TEACHERS, trainingWeek, applyProgress, levelCost, crewTeacher } = living;
  assert.equal(levelCost(6), 120);
  assert.equal(levelCost(6, true), 240);
  assert.deepEqual(trainingWeek(TEACHERS.street, { level: 3 }), { ok: true, why: "", progress: 10, target: 4 });
  assert.equal(trainingWeek(TEACHERS.street, { level: 6 }).why, "max", "a Street trainer stops at 6");
  assert.equal(trainingWeek(TEACHERS.selfDedicated, { level: 0 }).why, "zero", "self-study can't open a Skill");
  assert.equal(trainingWeek(TEACHERS.selfDedicated, { level: 0, chip: true }).ok, true, "a chip can");
  assert.equal(trainingWeek(TEACHERS.selfSide, { level: 2, double: true }).why, "double");
  assert.equal(trainingWeek(TEACHERS.ncu, { level: 2, academic: false }).why, "academic");
  assert.equal(trainingWeek(TEACHERS.professional, { level: 3, chip: true, elementary: true }).progress, 22, "15 + chip 5 + Elementary 2");
  assert.equal(trainingWeek(TEACHERS.professional, { level: 5, chip: true }).progress, 15, "the chip only helps up to 4");
  assert.equal(trainingWeek(TEACHERS.street, { level: 2, push: "ok" }).progress, 15);
  assert.equal(trainingWeek(TEACHERS.professional, { level: 2, push: "fail" }).progress, 7);
  assert.equal(trainingWeek(TEACHERS.street, { level: 2, push: "implode" }).progress, 0);
  // one level at a time, the rest carries
  assert.deepEqual(applyProgress(5, 130), { level: 6, progress: 10, up: true });
  assert.deepEqual(applyProgress(5, 100), { level: 5, progress: 100, up: false });
  assert.equal(crewTeacher(7).progress, 10);
  assert.equal(crewTeacher(9).max, 8);
  assert.equal(crewTeacher(5), null);
});

test("Train a Skill: a week and tuition, progress banked, the level when it's reached; topping off with IP", async () => {
  const fury = character("Fury", [["Solo", 4]], [skill("Handgun", 5, { category: "rangedweaponSkills" })]);
  await fury.update({ [`flags.${M}.training`]: { Handgun: 115 } });
  const res = await LifeOps.train(fury, { skill: "skHandgun", teacher: "street" });
  assert.deepEqual([res.progress, res.level, res.banked, res.up], [10, 6, 5, true], "115 + 10 reaches 120: Handgun 6, 5 carried");
  assert.equal(fury.items.get("skHandgun").system.level, 6);
  assert.equal(fury.system.wealth.value, 9800, "200eb tuition");
  await assert.rejects(LifeOps.train(fury, { skill: "skHandgun", teacher: "street" }), /only takes you to 6/);
  // Push Training: Endurance for a physical Skill
  rolled.length = 0;
  rolls(16);
  const pushed = await LifeOps.train(fury, { skill: "skHandgun", teacher: "professional", push: true });
  assert.equal(rolled[0].skill, "Endurance");
  assert.equal(pushed.progress, 20, "15 + 5 for the push");
  // topping off with IP
  fury.system.improvementPoints.value = 200;
  const top = await LifeOps.topOff(fury, "skHandgun");
  assert.deepEqual(top, { level: 7, spent: 115 });
  assert.equal(fury.system.improvementPoints.value, 85);
});

test("Night City University: enrollment, then a term's fee every four weeks, academic Skills only", async () => {
  const lattice = character("Lattice", [["Netrunner", 4]], [skill("Cryptography", 4), skill("Brawling", 2, { category: "fightingSkills" })]);
  await assert.rejects(LifeOps.train(lattice, { skill: "skCryptography", teacher: "ncu" }), /Enroll at NCU/);
  rolls(15);
  assert.equal((await LifeOps.enroll(lattice)).ok, true);
  await LifeOps.train(lattice, { skill: "skCryptography", teacher: "ncu" });
  assert.equal(lattice.system.wealth.value, 8800, "the first week pays the term");
  await LifeOps.train(lattice, { skill: "skCryptography", teacher: "ncu" });
  assert.equal(lattice.system.wealth.value, 8800, "the rest of the term is paid");
  await assert.rejects(LifeOps.train(lattice, { skill: "skBrawling", teacher: "ncu" }), /doesn't teach|teaches Education/);
});

/* ------------------------------------------ */
/*  Sourcing, art, Night Markets              */
/* ------------------------------------------ */

test("Self Sourcing: a week; reach by Rank; Media and Rockerboys roll the Sourcing DV and pay double", async () => {
  asUser(true);
  const rifle = await Item.create({ name: "Militech Crusher", type: "weapon", system: { price: { market: 1000 } } });
  const pistol = await Item.create({ name: "Pistol", type: "weapon", system: { price: { market: 50 } } });
  const fixer = character("Rogue", [["Fixer", 4]]);
  const res = await LifeOps.source(fixer, { item: rifle.uuid });
  assert.deepEqual(res, { ok: true, cost: 1000 });
  assert.ok(fixer.items.find((i) => i.name === "Militech Crusher"));
  await assert.rejects(LifeOps.source(fixer, { item: pistol.uuid }), /off the shelf/);
  const lux = await Item.create({ name: "Luxury thing", type: "gear", system: { price: { market: 5000 } } });
  await assert.rejects(LifeOps.source(fixer, { item: lux.uuid }), /past Rogue's reach/);
  const media = character("Lens", [["Media", 7]], [skill("Library Search", 6)]);
  rolled.length = 0;
  rolls(16);
  const m = await LifeOps.source(media, { item: rifle.uuid });
  assert.equal(rolled[0].skill, "Library Search");
  assert.deepEqual(m, { ok: true, cost: 2000 }, "DV15 for Very Expensive, double price");
  rolls(10);
  assert.deepEqual(await LifeOps.source(media, { item: rifle.uuid }), { ok: false, cost: 0 });
  const runner = character("Wire", [["Netrunner", 9]]);
  await assert.rejects(LifeOps.source(runner, { item: rifle.uuid }), /quickhacks, deck gear/);
});

test("art: the quality's materials, time and DV; a finished piece adds Humanity a month", async () => {
  assert.deepEqual(living.artJob("superLuxury", 30000), { eb: 30000, minutes: 3 * 43200, dv: 29, humanity: 6, months: 3 });
  const kerry = character("Kerry", [["Rockerboy", 6]], [skill("Composition", 8)]);
  rolls(22);
  const res = await LifeOps.art(kerry, { skill: "Composition", quality: "expensive", title: "Chippin' In" });
  assert.deepEqual(res, { ok: true, humanity: 2 });
  const piece = kerry.items.find((i) => i.name === "Artwork: Chippin' In");
  assert.equal(piece.flags[M].art.humanity, 2);
  assert.equal(kerry.system.wealth.value, 9500);
  rolls(10);
  assert.equal((await LifeOps.art(kerry, { quality: "premium" })).ok, false);
  assert.equal(kerry.system.wealth.value, 9400, "the materials go either way");
});

test("Night Markets: two categories, a d10 of different items each; finding one is Streetwise DV13 or Trading DV15", async () => {
  const seq = (list) => {
    let i = 0;
    return () => list[i++ % list.length];
  };
  const stock = living.stockMarket(seq([3, 3, 4]), seq([3, 1, 1, 2, 3]), null);
  assert.deepEqual(stock.map((c) => c.category), ["weapons", "cyberware"], "a repeated category is rerolled");
  assert.deepEqual(stock[0].items, ["Medium Pistols, used", "Heavy Pistols", "SMGs and Heavy SMGs"]);
  assert.equal(living.stockMarket(seq([1, 2]), seq([1, 1]), "survival")[0].category, "survival", "the Fixer's pick");
  const ash = character("Ash", [["Solo", 2]], [skill("Streetwise", 4)]);
  rolls(13);
  const res = await LifeOps.market(ash, { skill: "Streetwise" });
  assert.equal(res.ok, true);
  assert.equal(res.stock.length, 2);
  assert.match(chat.at(-1).content, /On the shelves/);
});

/* ------------------------------------------ */
/*  Medicine                                  */
/* ------------------------------------------ */

test("bodysculpting: Surgery DV15/17 and the materials; Exotic costs the patient 4d6 Humanity; nobody sculpts themselves", async () => {
  const doc = character("Doc", [["Medtech", 4, [{ name: "Surgery Skill", rank: 8 }]]]);
  const kid = character("Kid", [["Solo", 2]]);
  await assert.rejects(LifeOps.bodysculpt(doc, { patient: doc.id }), /sculpt themselves/);
  rolls(18);
  dice.next = [14];
  const res = await LifeOps.bodysculpt(doc, { patient: kid.id, kind: "exotic", look: "fox ears" });
  assert.deepEqual(res, { ok: true, lost: 14 });
  assert.equal(kid.system.derivedStats.humanity.value, 46);
  assert.equal(doc.system.wealth.value, 9500);
  rolls(14);
  assert.equal((await LifeOps.bodysculpt(doc, { patient: kid.id, kind: "standard" })).ok, false, "DV15");
});

test("rest: a hospital bed or a cryotank by the day (the plan may cover it); a cryotank or Enhanced Antibodies heals double", async () => {
  assert.deepEqual(living.restDay("cryoHospital", "ttSilver"), { eb: 0, rate: 2 });
  assert.deepEqual(living.restDay("hospital", "ttExecutive"), { eb: 50, rate: 1 });
  assert.deepEqual(living.restDay("home", null, { antibodies: true }), { eb: 0, rate: 2 });
  const vex = character("Vex", [["Solo", 2]]);
  const res = await DowntimeOps.perform(vex, "rest", { days: 1, place: "cryoMedtech" });
  assert.equal(res.healed, 12, "2 × BODY 6");
  assert.equal(vex.system.wealth.value, 9500, "a Medtech's tank: 500eb a night");
  await LifeOps.setPlan(vex, "ttSilver");
  await DowntimeOps.perform(vex, "rest", { days: 1, place: "cryoHospital" });
  assert.equal(vex.system.wealth.value, 9500, "free with Trauma Team Silver");
  dice.next = [5, 9];
  const call = await LifeOps.callPlan(vex);
  assert.deepEqual(call, { rounds: 5, reo: null }, "REO's 9 didn't beat them");
});

test("Maximum Humanity (2070): the free Neuroport, an FBC's free chrome, Linear Frame Ω, Borgware, Fresh Food", () => {
  const c = (name, hl = 7, borgware = false, extra = {}) => ({ name, hl, borgware, ...extra });
  const m = living.maxHumanity([c("Neural Link"), c("Cybereye"), c("Grafted Muscle and Bone Lace"), c("Implanted Linear Frame Sigma", 14, true), c("Linear Frame Omega", 14, true), c("Mantis Blades", 7, false, { countsAsBorgware: true }), c("Chipware Socket", 0)], { emp: 8, freshFood: true });
  // 80 − (eye 2 + muscle 2 + sigma 4 + omega 8 + mantis 4) + 10
  assert.equal(m.max, 70);
  // Cyberpunk RED's own count: 80 − (2 + 2 + 2 + 4 + 4 + 2)
  assert.equal(m.cpr, 64);
  assert.equal(m.adjust, 6);
  const fbc = living.maxHumanity([c("Full Body Conversion Biosystem", 0, true), c("Cyberarm"), c("Cyberleg"), c("Mantis Blades")], { emp: 6 });
  assert.equal(fbc.max, 60 - 4 - 2, "the Biosystem and the Mantis Blades; the limbs are free");
});

test("an Operating System or Enhancement that says so makes its piece count as Borgware: −4 in place of −2", async () => {
  const HUB = "cpr-neon-hub";
  // Pure: a hand flag, the piece's own entry, Neon Hub's flag on what's installed in it, or the words in an older copy.
  assert.equal(living.borgwareBy({ flag: true }), "flag");
  assert.equal(living.borgwareBy({ text: "One more Neuralware slot; counts as Borgware for your Maximum Humanity" }), "self");
  assert.equal(living.borgwareBy({}, [{ name: "Militech ‘Falcon’ OS", hub: true }]), "Militech ‘Falcon’ OS");
  assert.equal(living.borgwareBy({}, [{ name: "Old Falcon", text: "<p>The Sandevistan counts as Borgware for your Maximum Humanity.</p>" }]), "Old Falcon");
  assert.equal(living.borgwareBy({ text: "+3 Initiative" }, [{ name: "Qiant ‘Warp Dancer’ OS", text: "Runs: Sandevistan" }]), null);
  assert.equal(living.borgwareBy({ text: "Counts as 2 Borgware for therapy" }), null, "Linear Frame Ω has its own rule");

  // On a sheet: a Sandevistan (−2) with the Falcon OS installed in it is −4; the OS out again, −2.
  const sande = { _id: "sande", name: "Sandevistan", type: "cyberware", system: { type: "neuralWare", isInstalled: true, humanityLoss: { static: 14 }, installedItems: { allowed: true, allowedTypes: ["itemUpgrade"], list: [] } } };
  const falcon = { _id: "falcon", name: "Militech ‘Falcon’ OS", type: "itemUpgrade", system: { type: "cyberware", size: 0 }, flags: { [HUB]: { countsAsBorgware: true } } };
  const dancer = { _id: "dancer", name: "Qiant ‘Warp Dancer’ OS", type: "itemUpgrade", system: { type: "cyberware", size: 0, description: { value: "<p>Runs: Sandevistan</p>" } } };
  const fury = character("Fury", [["Solo", 4]], [sande, falcon, dancer], { installedItems: { list: ["sande"] } });
  assert.equal(LifeOps.maxHumanity(fury).max, 58, "carried, not installed: the Sandevistan is ordinary chrome");
  assert.equal(LifeOps.maxHumanity(fury).adjust, 0);
  fury.items.get("sande").system.installedItems.list = ["dancer"];
  assert.equal(LifeOps.maxHumanity(fury).max, 58, "an Operating System that doesn't say so changes nothing");
  fury.items.get("sande").system.installedItems.list = ["falcon"];
  const m = LifeOps.maxHumanity(fury);
  assert.equal(m.max, 56);
  assert.equal(m.adjust, -2, "Cyberpunk RED counts −2; 2070 takes 2 more");
  assert.deepEqual(m.lines.at(-1), { label: "Sandevistan + Militech ‘Falcon’ OS", n: -4 });
  fury.items.get("sande").system.installedItems.list = [];
  assert.equal(LifeOps.maxHumanity(fury).adjust, 0);
});

/* ------------------------------------------ */
/*  Repairs                                   */
/* ------------------------------------------ */

test("repairs: armor back to full SP, vehicle SDP by how bad, shop labor; Solos and Gangers' perk", async () => {
  assert.equal(maint.roleBonus(["ganger"], "weapon", { name: "Pistol" }), "ganger");
  assert.equal(maint.shopLabor(1000), 400);
  assert.equal(maint.shopLabor(100), 50);
  assert.deepEqual(maint.vehicleRepair(20, 50), { state: "half", dv: 13, minutes: 1440, labor: 100 });
  assert.equal(maint.vehicleRepair(0, 50).dv, 17);
  assert.equal(maint.vehicleRepair(50, 50), null);
  const jack = { _id: "jack", name: "Light Armorjack", type: "armor", system: { price: { market: 100 }, bodyLocation: { sp: 11, ablation: 4 }, headLocation: { sp: 0, ablation: 0 } } };
  assert.deepEqual(maint.armorRepair(jack), { dv: 17, minutes: 1440, time: "1d", labor: 50 }, "the book's example: DV17, a day, or 50eb");
  const tech = character("Wrench", [["Tech", 4]], [jack]);
  rolls(20);
  await ProjectOps.repairArmor(tech, tech, "jack");
  assert.equal(tech.items.get("jack").system.bodyLocation.ablation, 0, "full SP");
  tech.items.get("jack").system.bodyLocation.ablation = 6;
  const shop = await ProjectOps.shop(tech, { owner: tech, item: "jack", what: "armor" });
  assert.deepEqual(shop, { labor: 50 });
  assert.equal(tech.items.get("jack").system.bodyLocation.ablation, 0);
  assert.equal(tech.system.wealth.value, 9950);
  // a vehicle's SDP
  const car = makeActor({ name: "Thorton Galena", type: "container", system: { derivedStats: { hp: { value: 10, max: 40 } } } });
  rolls(15);
  await ProjectOps.repairVehicle(tech, car);
  assert.equal(car.system.derivedStats.hp.value, 40);
});

test("Iconics: not Destroyed without the owner's say-so, and fabricated only from their blueprint", async () => {
  asUser(true);
  const fury = character("Fury", [["Solo", 4]], [{ _id: "kat", name: "Satori", type: "weapon", flags: { [M]: { iconic: true } }, system: { price: { market: 5000 } } }]);
  await HomeOps.setCondition(fury, "kat", "destroyed", { ownerAgreed: false });
  assert.equal(fury.items.get("kat").flags[M].item.condition, "damaged", "Damaged instead");
  await HomeOps.setCondition(fury, "kat", "destroyed", { ownerAgreed: true });
  assert.equal(fury.items.get("kat").flags[M].item.condition, "destroyed");
  const tech = character("Wrench", [["Tech", 4]]);
  await assert.rejects(ProjectOps.start(tech, "fabricate", { item: fury.items.get("kat").uuid }), /Iconic Blueprint/);
});

test("Maker: an invented TUp at its heat's DV with its kit; Hurrying and Rushing; a crewmate's Complementary Check", async () => {
  assert.equal(dt.pacedMinutes(43200, "hurry"), 20160, "a month drops to two weeks");
  assert.equal(dt.pacedMinutes(20160, "rush"), 1440, "two weeks, two categories lower: a day");
  assert.equal(dt.pacedMinutes(60, "hurry"), 12, "below Cheap: a fifth");
  assert.equal(dt.pacedMinutes(60, "rush"), 6, "a tenth");
  assert.equal(dt.pacedMinutes(3 * 43200, "hurry"), 2 * 43200, "months halve, rounded up");
  const mats = materialsItemData("premium", M);
  const tech = character("Wrench", [["Tech", 4, [{ name: "Upgrade Expertise", rank: 2 }]]], [
    { _id: "gun", name: "Heavy Pistol", type: "weapon", system: { price: { market: 100 } } },
    { ...mats, _id: "mat", system: { ...mats.system, amount: 3 } }
  ]);
  rolled.length = 0;
  rolls(30);
  const p = await ProjectOps.start(tech, "upgrade", { item: "gun", upgrade: "invented", heat: "hot", pace: "hurry" }, { minutes: 0 });
  assert.equal(p.dv, 24, "a Hot TUp: DV24");
  assert.equal(p.minutes, 360, "a day's job, hurried: 6 hours");
  assert.equal(tech.system.wealth.value, 9000, "the Hot kit: 1,000eb");
  await ProjectOps.setHelp(tech, p.id, true);
  await ProjectOps.work(tech, p.id, "check");
  assert.deepEqual(rolled[0].mods, [-4, 1, 2], "Hurried −4, the crewmate +1, Upgrade Expertise 2");
});

test("Narrative Quickhacks: the job's DV, the area's Security or Utility Code, a watcher", async () => {
  assert.equal(net.narrativeDv("brief"), 8);
  assert.equal(net.narrativeDv("big", { code: 9, by: "security" }), 13);
  assert.equal(net.narrativeDv("simple", { code: 0, by: "utility", watched: true }), 12);
  assert.equal(net.narrativeDv("lasting", { code: 0, by: "security" }), 10);
  assert.equal(net.VEHICLE_ICE.length, 8);
  assert.equal(net.VEHICLE_ICE.at(-1).name, "Counterhack Protocol");
  const runner = character("Lattice", [["Netrunner", 6]]);
  dice.next = [9];
  const res = await DeckOps.narrative(runner, { job: "brief", what: "call the elevator" });
  assert.equal(res.ok, true);
  assert.match(chat.at(-1).content, /call the elevator/);
});

test("the Downtime tab renders the new panels: training, sourcing, art, Night Markets, bodysculpting, rest, the workshop", async () => {
  const { loadTemplates, render, missingKeys } = await import("./helpers/foundry.mjs");
  const { DowntimeTab } = await import("../scripts/apps/downtime.js");
  loadTemplates();
  const jack = { _id: "jack", name: "Light Armorjack", type: "armor", system: { price: { market: 100 }, bodyLocation: { sp: 11, ablation: 4 }, headLocation: { sp: 0, ablation: 0 } } };
  const doc = character("Panel", [["Medtech", 4, [{ name: "Surgery Skill", rank: 6 }]], ["Fixer", 5], ["Tech", 3]], [skill("Handgun", 3, { category: "rangedweaponSkills" }), skill("Streetwise", 4), { ...jack }, { _id: "gun", name: "Pistol", type: "weapon", system: { price: { market: 100 } } }]);
  character("Patient", [["Solo", 2]]);
  const app = { uiState: { downtime: { action: "train", params: {} } } };
  for (const [action, params] of [["train", { teacher: "professional", push: "1" }], ["source", {}], ["art", { quality: "superLuxury", value: 20000 }], ["market", {}], ["bodysculpt", { kind: "exotic" }], ["rest", { place: "cryoHospital" }], ["workshop", {}], ["nightMarket", { pick: "cyberware" }], ["upgrade", { item: "gun", upgrade: "invented", heat: "medium", pace: "rush" }], ["hustle", {}], ["salvage", {}]]) {
    app.uiState.downtime = { action, params: { [action]: params } };
    const ctx = await DowntimeTab.prepare(app, doc);
    assert.equal(ctx.dt.selected.id, action, action);
    const html = render("downtime.hbs", ctx);
    assert.ok(html.length > 500, action);
    if (action === "workshop") assert.ok(html.includes('data-mode="armor"') && html.includes('data-mode="shopArmor"'), "the armor waiting for a repair");
    if (action === "upgrade") assert.ok(ctx.dt.selected.facts.some((f) => /DV21/.test(f.value)), "a Medium TUp's DV");
  }
  assert.deepEqual([...missingKeys].filter((k) => /NEONHOME\.(Train|Source|Art|Sculpt|Market|Rest|Plan|Workshop|Maker|Iconic|MaxHumanity|Downtime\.(Interesting|Action|Blurb))/.test(k)), []);
});
