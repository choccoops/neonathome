/** Spend IP: costs, the character level and its read-outs, spending and refunding, Roles, sub-abilities, new Skills, sizing up the others. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, chat, dialogs, asUser, loadTemplates, render, missingKeys } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { IPOps, CUSTOM_SKILL_FLAG } = await import("../scripts/home/ip-ops.js");
const { SpendIPApp } = await import("../scripts/apps/spend-ip-app.js");
const ip = await import("../scripts/data/ip.js");
loadTemplates();

const skill = (name, level, category, extra = {}) => ({ name, type: "skill", system: { level, category, difficulty: "typical", stat: "int", ...extra } });

function character(name, items = [], points = 1000, ownership = { default: 0 }) {
  const a = makeActor({ name, type: "character", system: { stats: { int: { value: 6 } }, improvementPoints: { value: points, transactions: [] } } }, items);
  a.ownership = ownership;
  return a;
}

// Cyberpunk RED's Roles compendium, and its Martial Arts skills
const roleDoc = (name, ability, abilities = []) => ({ name, type: "role", toObject: () => ({ _id: "x", name, type: "role", system: { rank: 0, mainRoleAbility: ability, abilities: structuredClone(abilities) } }) });
const rolesPack = {
  documentName: "Item",
  metadata: { label: "Roles", name: "core_roles" },
  getDocuments: async () => [
    roleDoc("Solo", "Combat Awareness", [{ name: "Damage Deflection", rank: 0 }, { name: "Precision Attack", rank: 0 }]),
    roleDoc("Fixer", "Operator", [{ name: "Haggle", rank: 0 }]),
    roleDoc("Netrunner", "Interface")
  ]
};
const martialPack = {
  documentName: "Item",
  metadata: { label: "Martial Arts", name: "core_skills-martial-arts" },
  getIndex: async () => [{ _id: "kar", name: "Martial Arts (Karate)" }],
  getDocument: async () => ({ toObject: () => ({ _id: "kar", name: "Martial Arts (Karate)", type: "skill", system: { level: 0, category: "fightingSkills", difficulty: "difficult", stat: "dex", skillType: "generic", description: { value: "From the book" } } }) })
};
game.packs = Object.assign(new Map([["cyberpunk-red-core.core_roles", rolesPack], ["cyberpunk-red-core.core_skills-martial-arts", martialPack]]), {
  [Symbol.iterator]() {
    return this.values();
  }
});

test("costs: 20 IP a level, 40 for a Difficult Skill, 60 a Role Ability Rank", () => {
  assert.equal(ip.costOf("typical", 3), 60);
  assert.equal(ip.costOf("difficult", 3), 120);
  assert.equal(ip.costOf("role", 5), 300);
  assert.equal(ip.costOf("typical", 11), 0);
  assert.equal(ip.spentTo("typical", 4), 20 + 40 + 60 + 80);
  assert.equal(ip.skillPricing({ name: "Martial Arts (Bujinkan)", system: { difficulty: "typical" } }), "difficult", "every Martial Art is Difficult");
  assert.equal(ip.skillPricing({ name: "Autofire", system: {} }), "difficult");
  assert.equal(ip.skillPricing({ name: "Xenobiology", system: { difficulty: "difficult" } }), "difficult");
  assert.equal(ip.skillPricing({ name: "Handgun", system: { difficulty: "typical" } }), "typical");
});

test("the character level, rank insignia and Threat Level the macro reads", () => {
  assert.deepEqual(ip.characterLevel(0), { level: 1, progress: 0, pct: 0 });
  assert.equal(ip.characterLevel(1720).level, 2);
  assert.equal(ip.characterLevel(1720 * 6 + 860).pct, 50);
  assert.equal(ip.rankOf(1).key, "gonk");
  assert.equal(ip.rankOf(7).key, "wiredRookie");
  assert.equal(ip.rankOf(50).key, "afterlifeLegend");
  const t = ip.tally(
    [skill("Handgun", 6, "rangedweaponSkills"), skill("Martial Arts (Karate)", 2, "fightingSkills"), skill("Perception", 4, "awarenessSkills")],
    [{ name: "Solo", system: { rank: 4 } }]
  );
  // Handgun 20..120 = 420, Karate 40+80 = 120, Perception 20..80 = 200, Solo 60..240 = 600
  assert.equal(t.spent, 420 + 120 + 200 + 600);
  assert.equal(t.bought, 6 + 2 + 4 + 4);
  assert.equal(t.experts, 1);
  assert.deepEqual(t.best, { name: "Handgun", level: 6 });
  assert.equal(t.special.key, "rangedweaponSkills");
  // combat skills ×2 (6 + 2), Solo ×10
  assert.equal(t.threat, 16 + 40);
  assert.equal(t.band.key, "moderate");
});

test("spending IP raises each pick one level, takes the IP and says so in chat", async () => {
  const a = character("Spender", [{ _id: "hand000000000000", ...skill("Handgun", 3, "rangedweaponSkills") }, { _id: "auto000000000000", ...skill("Autofire", 0, "rangedweaponSkills", { difficulty: "difficult" }) }, { _id: "solo000000000000", name: "Solo", type: "role", system: { rank: 4, mainRoleAbility: "Combat Awareness", abilities: [] } }], 500);
  chat.length = 0;
  const plan = await IPOps.upgrade(a, ["hand000000000000", "auto000000000000", "solo000000000000"]);
  assert.equal(plan.total, 80 + 40 + 300);
  assert.equal(a.items.get("hand000000000000").system.level, 4);
  assert.equal(a.items.get("auto000000000000").system.level, 1);
  assert.equal(a.items.get("solo000000000000").system.rank, 5);
  assert.equal(IPOps.ip(a), 500 - 420);
  assert.equal(chat.length, 3);
  assert.ok(chat[0].content.includes("Handgun") && chat[0].content.includes("Level 4"));
});

test("spending more IP than there is, or on a maxed skill, is refused", async () => {
  const a = character("Broke", [{ _id: "hand000000000000", ...skill("Handgun", 3, "rangedweaponSkills") }, { _id: "max0000000000000", ...skill("Stealth", 10, "bodySkills") }], 50);
  await assert.rejects(IPOps.upgrade(a, ["hand000000000000"]), /80 IP/);
  await assert.rejects(IPOps.upgrade(a, ["max0000000000000"]), /isn't at its max/);
  assert.equal(a.items.get("hand000000000000").system.level, 3);
});

test("a refund takes one level back and returns its IP; the GM can turn refunds off for players", async () => {
  const a = character("Refunder", [{ _id: "hand000000000000", ...skill("Handgun", 3, "rangedweaponSkills") }], 0);
  await IPOps.refund(a, ["hand000000000000"]);
  assert.equal(a.items.get("hand000000000000").system.level, 2);
  assert.equal(IPOps.ip(a), 60);
  await game.settings.set(M, "ipRefund", false);
  asUser(false);
  try {
    await assert.rejects(IPOps.refund(a, ["hand000000000000"]), /Only the GM/);
  } finally {
    asUser(true);
    await game.settings.set(M, "ipRefund", true);
  }
});

test("confirming asks first, and a Solo shares out Combat Awareness afterwards", async () => {
  const a = character("Asker", [{ _id: "solo000000000000", name: "Solo", type: "role", system: { rank: 2, mainRoleAbility: "Combat Awareness", abilities: [{ name: "Damage Deflection", rank: 1 }, { name: "Precision Attack", rank: 1 }] } }], 500);
  dialogs.next = false;
  assert.equal(await IPOps.confirm(a, ["solo000000000000"], "up"), null, "said no: nothing spent");
  assert.equal(IPOps.ip(a), 500);
  dialogs.next = true;
  dialogs.shown.length = 0;
  await IPOps.confirm(a, ["solo000000000000"], "up");
  assert.equal(a.items.get("solo000000000000").system.rank, 3);
  assert.equal(IPOps.ip(a), 320);
  // the confirmation, then the allocation (closed here)
  assert.equal(dialogs.shown.length, 2);
  assert.ok(dialogs.shown[1].content.includes("Damage Deflection"));
});

test("sub-ability points: every point placed, no more", async () => {
  const a = character("Splitter", [{ _id: "tech000000000000", name: "Tech", type: "role", system: { rank: 3, mainRoleAbility: "Maker", abilities: [{ name: "Field Expertise", rank: 0 }, { name: "Upgrade Expertise", rank: 0 }] } }]);
  await assert.rejects(IPOps.allocate(a, "tech000000000000", [2, 2]), /at most 3/);
  await assert.rejects(IPOps.allocate(a, "tech000000000000", [1, 1]), /1 point/);
  await IPOps.allocate(a, "tech000000000000", [2, 1]);
  assert.deepEqual(a.items.get("tech000000000000").system.abilities.map((x) => x.rank), [2, 1]);
});

test("a Fixer's Haggle follows Operator", async () => {
  const a = character("Fixer", [{ _id: "fix0000000000000", name: "Fixer", type: "role", system: { rank: 4, mainRoleAbility: "Operator", abilities: [{ name: "Haggle", rank: 4 }] } }], 300);
  await IPOps.upgrade(a, ["fix0000000000000"]);
  await IPOps.afterRank(a, "fix0000000000000");
  assert.equal(a.items.get("fix0000000000000").system.abilities[0].rank, 5);
});

test("a new Role: from the compendium at Rank 1 for 60 IP, once every Role is Rank 4", async () => {
  const fresh = character("Fresh", [], 100);
  assert.equal(IPOps.roleOptions(fresh).first, true);
  const solo = await IPOps.addRole(fresh, "solo");
  assert.equal(solo.system.rank, 1);
  assert.equal(solo.system.mainRoleAbility, "Combat Awareness");
  assert.equal(IPOps.ip(fresh), 40);
  await assert.rejects(IPOps.addRole(fresh, "netrunner"), /Rank 4 or higher/);
  await assert.rejects(IPOps.addRole(fresh, "solo"), /already has/);
  const vet = character("Vet", [{ name: "Solo", type: "role", system: { rank: 4 } }], 60);
  const runner = await IPOps.addRole(vet, "netrunner");
  assert.equal(runner.name, "Netrunner");
  assert.equal(IPOps.ip(vet), 0);
  const poor = character("Poor", [{ name: "Solo", type: "role", system: { rank: 4 } }], 30);
  await assert.rejects(IPOps.addRole(poor, "fixer"), /60 IP/);
});

test("new Skills: a family's specialty (from the compendium when it's there) or one of the player's own", async () => {
  const a = character("Learner", [skill("Language (Streetslang)", 4, "educationSkills")]);
  const karate = await IPOps.addSkill(a, { family: "martialArt", specialty: "Karate" });
  assert.equal(karate.name, "Martial Arts (Karate)");
  assert.equal(karate.system.description.value, "From the book");
  assert.equal(karate.system.level, 0);
  assert.equal(karate.getFlag(M, CUSTOM_SKILL_FLAG), true);
  const bujinkan = await IPOps.addSkill(a, { family: "martialArt", specialty: "Bujinkan" });
  assert.equal(bujinkan.system.difficulty, "difficult");
  assert.equal(bujinkan.system.stat, "dex");
  assert.equal(bujinkan.system.category, "fightingSkills");
  const spanish = await IPOps.addSkill(a, { family: "language", specialty: " Spanish " });
  assert.equal(spanish.name, "Language (Spanish)");
  assert.equal(spanish.system.skillType, "language");
  const xeno = await IPOps.addSkill(a, { family: "custom", name: "Xenobiology", category: "educationSkills", stat: "int", difficulty: "difficult" });
  assert.equal(xeno.system.difficulty, "difficult");
  assert.equal(IPOps.price(xeno).cost, 40);
  await assert.rejects(IPOps.addSkill(a, { family: "language", specialty: "streetslang" }), /already on the sheet/);
  await assert.rejects(IPOps.addSkill(a, { family: "science", specialty: "" }), /specialty/);
  // taken back while nothing's spent on it; not after
  await IPOps.upgrade(a, [spanish.id]);
  await assert.rejects(IPOps.removeSkill(a, spanish.id), /refund them first/);
  await IPOps.removeSkill(a, xeno.id);
  assert.ok(!a.items.get(xeno.id));
  const slang = a.items.find((i) => i.name === "Language (Streetslang)");
  await assert.rejects(IPOps.removeSkill(a, slang.id), /Only a skill added/);
});

test("Compare Skills reads others as far as Perception + INT goes", async () => {
  const me = character("Scanner", [skill("Perception", 0, "awarenessSkills")], 0);
  me.system.stats.int.value = 4;
  assert.throws(() => IPOps.compare(me, "players"), /you have 4/);
  me.system.stats.int.value = 6;
  me.items.find((i) => i.name === "Perception").system.level = 6;
  character("Rival", [skill("Handgun", 8, "rangedweaponSkills")], 0, { default: 0, p1: 3 });
  const s = IPOps.compare(me, "players");
  assert.equal(s.depth, "detailed");
  assert.equal(s.order, "threat");
  const rival = s.rows.find((r) => r.name === "Rival");
  assert.equal(rival.bought, 8);
  assert.equal(rival.best, null, "best skills take 15");
  assert.equal(rival.special, null);
  assert.ok(s.rows.find((r) => r.you).best !== null, "your own stats are all there");
  assert.equal(ip.scanDepth(20), "perfect");
  assert.deepEqual(ip.scanReveals(18), { threat: true, level: true, skills: true, best: true, special: true, ranked: true });
});

test("the Spend IP window renders the dossier, Roles, categories and new-skill cards", async () => {
  const a = character("Vex", [
    skill("Handgun", 10, "rangedweaponSkills"), skill("Martial Arts (Karate)", 2, "fightingSkills", { difficulty: "difficult" }), skill("Language (Streetslang)", 4, "educationSkills"),
    { name: "Solo", type: "role", system: { rank: 2, mainRoleAbility: "Combat Awareness", abilities: [] } }
  ], 75);
  const win = new SpendIPApp();
  win.actorId = a.id;
  const ctx = await win._prepareContext();
  assert.equal(ctx.tab, "spendIp");
  assert.equal(ctx.single, true);
  const html = render("shell.hbs", ctx);
  assert.deepEqual([...missingKeys], []);
  assert.ok(html.includes("Combat Awareness"));
  assert.ok(html.includes("Rank 2"));
  assert.ok(html.includes("Max level"), "Handgun 10 is maxed");
  assert.ok(html.includes("×2"), "Karate is Difficult");
  assert.ok(html.includes('data-family="martialArt"'));
  assert.ok(html.includes('data-family="language"'));
  assert.ok(html.includes("Every Role must be Rank 4"), "the Solo is Rank 2");
  assert.ok(html.includes("Gonk") || html.includes("Wired Rookie"));
  const hand = ctx.ip.sections.find((s) => s.key === "rangedweaponSkills").cards[0];
  assert.equal(hand.max, true);
  const karate = ctx.ip.sections.find((s) => s.key === "fightingSkills").cards[0];
  assert.equal(karate.cost, 120);
  assert.equal(karate.afford, false, "75 IP won't buy Level 3");
  assert.equal(win.id, "cpr-neon-at-home-spend-ip");
});
