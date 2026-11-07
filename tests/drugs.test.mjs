/** Street Drug Synthesis and the Medtech as Maker (Core Rules, Chapters 04 and 08): the rules as data, and doing them against mock documents. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, chat, loadTemplates, render, missingKeys } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { CPR } = await import("../scripts/cpr.js");
const { ProjectOps } = await import("../scripts/home/project-ops.js");
const { DrugOps, makerDomains } = await import("../scripts/home/drug-ops.js");
const { DowntimeTab } = await import("../scripts/apps/downtime.js");
const drugs = await import("../scripts/data/drugs.js");
const { materialsItemData } = await import("../scripts/data/materials.js");
loadTemplates();
await game.settings.set(M, "downtimeOn", true);

/** CPR's skill roll comes out at `total`; records what was rolled. */
const rolled = [];
function rolls(total) {
  CPR.skillCheck = async (actor, skill, opts = {}) => {
    rolled.push({ actor: actor.name, skill, mods: (opts.mods ?? []).map((m) => m.value), stat: opts.stat });
    return total === null ? null : { total, html: "<roll>", critFail: false, critSuccess: false };
  };
}

const medtech = (abilities) => ["Medtech", 4, Object.entries(abilities).map(([name, rank]) => ({ name, rank }))];
function character(name, roles = [], extra = []) {
  return makeActor({
    name, type: "character",
    system: { stats: { body: { value: 6 } }, derivedStats: { hp: { value: 40, max: 40 } }, wealth: { value: 1000, transactions: [] }, installedItems: { list: [] } }
  }, [...roles.map(([role, rank, abilities = []], i) => ({ _id: `role${i}`, name: role, type: "role", system: { rank, abilities } })), ...extra]);
}
const tool = (name, id) => ({ _id: id, name, type: "gear", system: { amount: 1 } });
const recipe = (name, tier, cost, extra = {}, id = `rec${name.replace(/\W/g, "")}`) => ({ ...drugs.recipeItem({ name, tier, cost, ...extra }, M), _id: id });

/* ------------------------------------------ */
/*  Rules                                     */
/* ------------------------------------------ */

test("Synthesis: DV, time a dose, the tool, and +1 for each step down with better tools", () => {
  assert.deepEqual(drugs.SYNTH_TIERS.map((t) => drugs.SYNTH[t].dv), [9, 13, 15, 20]);
  const r = drugs.normalizeRecipe({ name: "Lite-Smash", tier: "simple", cost: 20 });
  const none = drugs.synthTools([]);
  assert.equal(drugs.synthJob(r, none).ok, false, "no tools, no cooking");
  const tower = drugs.synthTools([{ name: "Biotechnica Mobile Lab Tower" }, { name: "Fabrication Station" }]);
  assert.equal(tower.tier, "exotic");
  assert.equal(drugs.synthJob(r, tower).bonus, 3, "a Lab Tower adds +3 to Simple");
  assert.equal(drugs.synthJob(drugs.normalizeRecipe({ tier: "complex" }), tower).bonus, 1);
  assert.equal(drugs.synthJob(drugs.normalizeRecipe({ tier: "exotic" }), drugs.synthTools([{ name: "Standard Chemistry Kit" }])).ok, false);
  // a Fabrication Station on a Standard Kit or Lab Tower: a book drug for half
  const lace = drugs.normalizeRecipe({ name: "Black Lace", tier: "standard", cost: 50, book: true });
  assert.equal(drugs.synthJob(lace, tower).cost, 25);
  assert.equal(drugs.synthJob(lace, drugs.synthTools([{ name: "High School Chemistry Kit" }, { name: "Fabrication Station" }])).cost, 50, "not on a High School kit");
  assert.equal(drugs.synthJob({ ...lace, book: false }, tower).cost, 50, "only book drugs");
  // a tool flagged with its tier counts too
  assert.equal(drugs.synthTools([{ name: "Grandma's still", tier: "standard" }]).tier, "standard");
  // the Mixed Drugs and their recipes
  assert.equal(drugs.MIXED_DRUGS.length, 14);
  for (const row of drugs.MIXED_DRUGS) assert.ok(drugs.SYNTH[row[1]], row[0]);
  const item = drugs.recipeItem({ name: "Jitterbug", tier: "exotic", cost: 1000 }, M);
  assert.equal(item.system.price.market, 500, "an Exotic recipe costs 500eb");
});

test("the Medtech as Maker: a Specialty's Maker work opens at 4 points", () => {
  assert.deepEqual(makerDomains(character("Doc", [medtech({ Surgery: 3, "Medical Tech (Pharmaceuticals)": 3 })])), []);
  assert.deepEqual(makerDomains(character("Doc", [medtech({ Surgery: 4, "Medical Tech (Pharmaceuticals)": 4, "Medical Tech (Cryosystem Operation)": 4 })])), ["ripperdoc", "pharma", "cryo"]);
  // Pharmaceuticals only invents
  assert.deepEqual(makerDomains(character("Doc", [medtech({ "Medical Tech (Pharmaceuticals)": 5 })]), "fabricate"), []);
  assert.deepEqual(makerDomains(character("Fixit", [["Tech", 4, []]])), ["tech"]);
});

/* ------------------------------------------ */
/*  Cooking                                   */
/* ------------------------------------------ */

test("cooking: a roll a dose, INT + Science (Chemistry), Medical Tech and better tools added, ingredients spent", async () => {
  const doc = character("Mags", [medtech({ "Medical Tech (Pharmaceuticals)": 1, "Medical Tech Skill": 2 })], [
    tool("Metal Pot", "pot"), tool("High School Chemistry Kit", "kit"), recipe("Lite-Smash", "simple", 20, { makes: drugs.mixedDrugItem(drugs.MIXED_DRUGS[0], M) })
  ]);
  rolled.length = 0;
  rolls(12);
  const res = await DrugOps.cook(doc, { recipe: "recLiteSmash", doses: 2 });
  assert.deepEqual(res, { made: 2, tried: 2 });
  assert.equal(rolled.length, 2, "one roll a dose");
  assert.equal(rolled[0].skill, "Science (Chemistry)");
  assert.equal(rolled[0].stat, "int");
  assert.deepEqual(rolled[0].mods, [2, 1], "Medical Tech 2, and the kit on a Simple recipe +1");
  assert.equal(doc.system.wealth.value, 960, "20eb of ingredients a dose");
  const made = doc.items.find((i) => i.type === "drug" && i.name === "Lite-Smash");
  assert.equal(made.system.amount, 2);
  // a failed dose wastes its ingredients; a good one stacks
  let n = 0;
  CPR.skillCheck = async () => ({ total: n++ ? 12 : 5, html: "", critFail: false, critSuccess: false });
  await DrugOps.cook(doc, { recipe: "recLiteSmash", doses: 2 });
  assert.equal(made.system.amount, 3);
  assert.equal(doc.system.wealth.value, 920);
  assert.ok(chat.some((m) => /ruins a batch/.test(m.content)));
});

test("cooking: the tools for the recipe, Medtech-only pharmaceuticals, and a Tech's Fabrication Expertise", async () => {
  const tech = character("Wrench", [["Tech", 4, [{ name: "Fabrication Expertise", rank: 3 }]]], [
    tool("Metal Pot", "pot"), recipe("Black Lace", "standard", 50, { book: true }, "recLace"), recipe("Surge-X", "simple", 30, { pharma: true }, "recSurge")
  ]);
  rolls(15);
  await assert.rejects(DrugOps.cook(tech, { recipe: "recLace" }), /needs a High School Chemistry Kit/);
  await assert.rejects(DrugOps.cook(tech, { recipe: "recSurge" }), /Medtech/);
  await tech.createEmbeddedDocuments("Item", [tool("Standard Chemistry Kit", "std"), tool("Fabrication Station", "fab")]);
  rolled.length = 0;
  await DrugOps.cook(tech, { recipe: "recLace" });
  assert.deepEqual(rolled[0].mods, [3, 1], "Fabrication Expertise 3, a Standard kit on a Standard recipe +1");
  assert.equal(tech.system.wealth.value, 975, "the Fabrication Station halves a book drug");
  await assert.rejects(DrugOps.cook(tech, { recipe: "nope" }), /Pick a recipe/);
});

/* ------------------------------------------ */
/*  The Medtech as Maker                      */
/* ------------------------------------------ */

test("Pharmaceuticals 4+: inventing a drug makes its recipe", async () => {
  const doc = character("Viktor", [medtech({ "Medical Tech (Pharmaceuticals)": 4, "Medical Tech Skill": 5 })]);
  rolled.length = 0;
  rolls(30);
  const res = await ProjectOps.start(doc, "invent", { text: "Calms the shakes", name: "Steadyhand", category: "expensive", domain: "pharma", tier: "complex", doseCost: 300, pharma: "pharma" }, { minutes: "all" });
  assert.equal(ProjectOps.get(doc, res.id), null, "finished");
  assert.equal(rolled[0].skill, "__Medical Tech Skill", "TECH + Medical Tech");
  assert.equal(rolled[0].stat, "tech");
  assert.deepEqual(rolled[0].mods, [5], "no Specialty Rank on top: Medical Tech already counts it");
  const rec = doc.items.find((i) => i.getFlag(M, "recipe"));
  assert.equal(rec.name, "Recipe: Steadyhand");
  assert.deepEqual([rec.getFlag(M, "recipe").tier, rec.getFlag(M, "recipe").cost, rec.getFlag(M, "recipe").pharma], ["complex", 300, true]);
  // it can't fabricate or upgrade
  await assert.rejects(ProjectOps.start(doc, "fabricate", { item: rec.uuid }), /4 points/);
});

test("Ripperdoc 4+: cyberware from a blueprint of a real piece, TECH + Cybertech + Ripperdoc points", async () => {
  const mats = materialsItemData("premium", M);
  const doc = character("Ripper", [medtech({ Surgery: 4 })], [
    { _id: "eye", name: "Cybereye", type: "cyberware", system: { price: { market: 500 } } },
    { _id: "gun", name: "Pistol", type: "weapon", system: { price: { market: 100 } } },
    { ...mats, _id: "mat", system: { ...mats.system, amount: 2 } }
  ]);
  const eye = doc.items.get("eye");
  await assert.rejects(ProjectOps.start(doc, "fabricate", { item: eye.uuid }), /blueprint/);
  await assert.rejects(ProjectOps.start(doc, "fabricate", { item: doc.items.get("gun").uuid }), /cyberware only/);
  const bp = await DrugOps.blueprintPiece(doc, "eye");
  assert.equal(bp.getFlag(M, "blueprint").makes.name, "Cybereye");
  rolled.length = 0;
  rolls(30);
  const res = await ProjectOps.start(doc, "fabricate", { item: bp.uuid }, { minutes: "all" });
  assert.equal(ProjectOps.get(doc, res.id), null, "finished");
  assert.equal(rolled[0].skill, "Cybertech");
  assert.deepEqual(rolled[0].mods, [4], "the Ripperdoc points as the Specialty Rank");
  assert.equal(doc.items.filter((i) => i.name === "Cybereye").length, 2, "a second Cybereye");
  // a Tech can't blueprint that way
  await assert.rejects(DrugOps.blueprintPiece(character("Fixit", [["Tech", 4, []]], [{ _id: "eye", name: "Cybereye", type: "cyberware", system: {} }]), "eye"), /Ripperdoc/);
});

/* ------------------------------------------ */
/*  The Downtime tab                          */
/* ------------------------------------------ */

test("the Downtime tab: cooking, and a Medtech's Maker panels", async () => {
  const doc = character("Panel", [medtech({ "Medical Tech (Pharmaceuticals)": 4, "Medical Tech Skill": 4, Surgery: 4 })], [
    tool("High School Chemistry Kit", "kit"), recipe("Lite-Smash", "simple", 20)
  ]);
  const app = { uiState: { downtime: { action: "synth", params: {} } } };
  let ctx = await DowntimeTab.prepare(app, doc);
  const med = ctx.dt.groups.find((g) => g.key === "medtech").actions.map((a) => a.id);
  assert.ok(["fabricate", "upgrade", "invent"].every((k) => med.includes(k)), "Maker panels for the Medtech");
  assert.equal(ctx.dt.selected.blocked, "");
  assert.ok(ctx.dt.selected.facts.some((f) => /\+1/.test(f.value)), "the kit's bonus shows");
  let html = render("downtime.hbs", ctx);
  assert.ok(html.includes("Lite-Smash"));
  app.uiState.downtime = { action: "invent", params: { invent: { domain: "pharma" } } };
  ctx = await DowntimeTab.prepare(app, doc);
  assert.ok(ctx.dt.selected.fields.some((f) => f.name === "tier"));
  assert.ok(ctx.dt.selected.fields.some((f) => f.name === "domain"), "Ripperdoc or Pharmaceuticals");
  html = render("downtime.hbs", ctx);
  assert.ok(html.includes("Recipe complexity"));
  assert.deepEqual([...missingKeys].filter((k) => /NEONHOME\.(Drug|Medtech)/.test(k)), []);
});
