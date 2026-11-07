/**
 * Street Drug Synthesis and the Medtech as Maker (Cyberpunk: The Unification Era, Core Rules,
 * Chapter 04 "The Medtech as Maker" and Chapter 08 "Street Drug Synthesis"; the Item Compendium's
 * Drug Lab). Pure: no Foundry calls.
 */
import { int } from "./util.js";

/** Minutes. */
const HOUR = 60;
const DAY = 1440;
const WEEK = 10080;
const MONTH = 43200;

/**
 * A recipe's complexity: its DV, the time each dose takes, the tool it needs, and what the recipe
 * costs to buy.
 */
export const SYNTH = {
  simple: { dv: 9, minutes: HOUR, tool: "Metal Pot", toolEb: 20, recipeEb: 50 },
  standard: { dv: 13, minutes: DAY, tool: "High School Chemistry Kit", toolEb: 100, recipeEb: 100 },
  complex: { dv: 15, minutes: WEEK, tool: "Standard Chemistry Kit", toolEb: 1000, recipeEb: 200 },
  exotic: { dv: 20, minutes: MONTH, tool: "Biotechnica Mobile Lab Tower", toolEb: 5000, recipeEb: 500 }
};
export const SYNTH_TIERS = Object.keys(SYNTH);

/** The tool upgrades (Item Compendium): what Neon At Home does with each. */
export const TOOL_UPGRADES = {
  fabricationStation: "Fabrication Station",
  chemicalSimplifier: "Chemical Simplifier",
  distillationStation: "Distillation Station"
};

const norm = (s) => String(s ?? "").trim().toLowerCase();

/**
 * The best synthesis tool among a character's items (by name, or a flag naming the tier it is),
 * and the upgrades they have.
 * @param {{name: string, tier?: string}[]} items - name, and a drugTool tier flag if set
 * @returns {{tier: string|null, index: number, name: string, upgrades: string[]}}
 */
export function synthTools(items) {
  let best = -1;
  let name = "";
  const upgrades = new Set();
  for (const it of items ?? []) {
    const flagged = SYNTH_TIERS.indexOf(it.tier);
    const named = SYNTH_TIERS.findIndex((t) => norm(SYNTH[t].tool) === norm(it.name));
    const i = Math.max(flagged, named);
    if (i > best) {
      best = i;
      name = it.name;
    }
    for (const [k, n] of Object.entries(TOOL_UPGRADES)) if (norm(n) === norm(it.name)) upgrades.add(k);
  }
  return { tier: best >= 0 ? SYNTH_TIERS[best] : null, index: best, name, upgrades: [...upgrades] };
}

/**
 * What cooking a recipe with these tools comes to: the DV, the time and ingredients for each dose,
 * and the better-tools bonus (+1 a step down). ok: false when the tools aren't up to it.
 * @param {object} recipe - normalized (see normalizeRecipe)
 * @param {object} tools - synthTools()
 */
export function synthJob(recipe, tools) {
  const t = SYNTH[recipe.tier] ?? SYNTH.standard;
  const need = SYNTH_TIERS.indexOf(recipe.tier);
  const ok = tools.index >= need;
  // a Fabrication Station on a Standard Kit or Lab Tower cooks a book drug for half its cost
  const halved = ok && recipe.book && tools.upgrades.includes("fabricationStation") && tools.index >= SYNTH_TIERS.indexOf("complex");
  return {
    ok,
    dv: t.dv,
    minutes: t.minutes,
    bonus: ok ? tools.index - need : 0,
    cost: halved ? Math.ceil(recipe.cost / 2) : recipe.cost,
    halved,
    tool: t.tool
  };
}

/** Fill in a recipe (a gear item's flag): the drug, its complexity, the ingredients a dose, the write-up. */
export function normalizeRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;
  const tier = SYNTH[raw.tier] ? raw.tier : "standard";
  return {
    name: String(raw.name ?? "").trim(),
    tier,
    cost: int(raw.cost, 0, 1000000),
    text: String(raw.text ?? ""),
    ingredients: String(raw.ingredients ?? ""),
    // a book street drug: a Fabrication Station halves it
    book: !!raw.book,
    // made only by Medtechs (a pharmaceutical, or one a Medtech invented as one)
    pharma: !!raw.pharma,
    inventor: String(raw.inventor ?? ""),
    // the drug item it makes (a copy, so it travels with the recipe)
    makes: raw.makes && typeof raw.makes === "object" ? raw.makes : null
  };
}

/* ------------------------------------------ */
/*  The Medtech as Maker                      */
/* ------------------------------------------ */

/** Points a Specialty needs before its Maker work opens up. */
export const MEDTECH_MAKER_POINTS = 4;

/**
 * At 4 points in a Specialty a Medtech uses the Maker rules for that Specialty's work: the role
 * ability holding its points, the skill the check is made with, and what it can make.
 * ability: Cyberpunk RED's Medtech ability name; skill: a skill, or "Medical Tech" (TECH + the
 * Medical Tech Skill); rank: whether the Specialty's points add as the Maker's Specialty Rank
 * (Ripperdoc's do; Medical Tech already counts Pharmaceuticals and Cryosystem points).
 */
export const MEDTECH_MAKER = {
  ripperdoc: { ability: "Surgery", skill: "Cybertech", rank: true, kinds: ["fabricate", "upgrade", "invent"] },
  pharma: { ability: "Medical Tech (Pharmaceuticals)", skill: "Medical Tech", rank: false, kinds: ["invent"] },
  cryo: { ability: "Medical Tech (Cryosystem Operation)", skill: "Medical Tech", rank: false, kinds: ["fabricate", "upgrade", "invent"] }
};

/** Cryotank and Cryopump gear (what a Cryosystem Medtech makes): by name. */
export const isCryoGear = (item) => /cryo/i.test(String(item?.name ?? ""));

/* ------------------------------------------ */
/*  The Drug Lab (Item Compendium)            */
/* ------------------------------------------ */

/** The tools and ingredients, as gear: [name, eb, text]. */
export const DRUG_LAB = [
  ["Metal Pot", 20, "Synthesis tool: Simple recipes.", "simple"],
  ["High School Chemistry Kit", 100, "Synthesis tool: Standard recipes. +1 on Simple.", "standard"],
  ["Standard Chemistry Kit", 1000, "Synthesis tool: Complex recipes. +2 Simple, +1 Standard.", "complex"],
  ["Biotechnica Mobile Lab Tower", 5000, "Synthesis tool: Exotic recipes. +3 Simple, +2 Standard, +1 Complex.", "exotic"],
  ["Chemical Simplifier", 500, "Upgrade for any synthesis tool: a recipe you've made before needs one fewer ingredient (never fewer than two)."],
  ["Fabrication Station", 500, "Upgrade for a Standard Kit or Lab Tower: make any book street drug for half its cost in materials."],
  ["Distillation Station", 500, "Upgrade for a Standard Kit or Lab Tower: break a dose of a mixed drug back into its ingredients in a day."],
  ["Synthesis ingredients", 10, "Water, synth-honey, cinnamon 10eb • KoffPops, synth-tobacco 20eb • synth stem cell mixture 50eb • binding chemical 100eb • crate of 10 limes or 50 berries 200eb • exotic chemical 500eb. Plus the street drugs each recipe calls for."]
];

/**
 * The Mixed Drugs (Chapter 08): [name, tier, eb a dose (the ingredients), recipe, lasts, primary,
 * secondary DV, secondary].
 */
export const MIXED_DRUGS = [
  ["Lite-Smash", "simple", 20, "Smash, water", "2 hours", "+1 Dance, Contortionist, Conversation, Human Perception, Persuasion, Acting.", 11, "As Smash."],
  ["Smokestack", "simple", 10, "Synth-tobacco, rolls or a vape", "10 minutes", "+1 COOL.", 13, "COOL −1; cravings."],
  ["WakeUP!", "simple", 20, "KoffPops or coffee, water (needs a coffee robot, not a pot)", "1 hour", "Ignore a Rough Night; extra working hours a day by lifestyle.", 9, "−1 to all actions; cravings."],
  ["Fishnet", "simple", 50, "Black Lace, water", "1 hour", "1d6 HL (returned if you resist). Ignore Seriously Wounded.", 15, "HL kept. REF −2 unless dosed."],
  ["The Juice", "simple", 100, "Smash, Prime Time, water, lime, berries, cinnamon", "3 seconds", "The most addictive thing there is. Even if you resist, you think about it for a day.", 17, "1 HL every day without it. Nothing else has taste."],
  ["Stardust", "standard", 500, "Smash, Prime Time, The Juice, lime, Synthcoke", "4 hours", "+2 COOL and Charismatic Impact.", 17, "−1 to both; −2 before any scheduled performance unless dosed."],
  ["Suitup", "standard", 500, "Berserker ×2, Prime Time, binding chemical", "2 hours", "No Medium armor penalties; Heavy armor penalties are −2.", 15, "−2 REF, DEX and MOVE in any armor unless dosed (stacks)."],
  ["Evil Tina", "standard", 500, "Boost ×2, Sixgun, Blue Glass, binding chemical", "24 hours", "In a braindance within the hour: +4 to Checks there, and you know it's a BD. Otherwise a lucid coma: face your demons for 2d6 Humanity, or dodge them for 1d6 HL.", 15, "Trapped in the dream until DV20 Concentration (one try an hour); then addicted."],
  ["DumDum", "standard", 500, "Blue Glass ×2, Boost, Berserker, binding chemical", "12 hours", "Happy and fuzzy. Another player co-controls you, a bit goofier than usual. You won't walk into harm.", 13, "You sometimes mimic the people around you."],
  ["Bee-Happy (BH-5)", "complex", 500, "Prime Time ×2, Black Lace ×2, binding chemical, synth-honey", "24 hours", "Calm and positive. 7 Humanity armor: subtract it from any HL except new chrome; each HL that gets through ablates it by 1.", 15, "All HL doubled (chrome included) unless dosed. Nightmares."],
  ["Brainfog", "complex", 1000, "Blue Glass ×2, Smash, Timewarp, exotic chemical", "1 minute", "Erases memory: 1 dose the last hour, 2 a day, 3 a week, 4 a month, 5 a year, 6+ five years. −1 to everything. Memory returns when it wears off.", 13, "The memories are gone for good. Therapy can bring some back."],
  ["Time-2-Battle (T2B)", "complex", 500, "Sixgun ×2, Timewarp, Synthcoke, Blue Glass, binding chemical", "10 minutes", "Combat looks like a turn-based game: you see everyone's HP, and can trade your Move Action for a second, different Action.", 15, "Game UI floods reality: −2 COOL and WILL; DV15 Concentration when it glitches or 1d6 HL."],
  ["Jitterbug", "exotic", 1000, "Lite-Smash, Fishnet, The Juice, Synthcoke ×3, exotic chemical", "1 hour", "+4 Melee, Evasion and Dance; −1 COOL, Stealth and Ranged. No rushing penalties. Running gives attackers −2 to hit you. You can't end a Turn without moving; restrained, you take 1d6 HL.", 17, "Move Action or Action each Turn unless dosed. The world runs too fast or too slow."],
  ["Dark Mirror", "exotic", 1500, "Suitup, Evil Tina, DumDum, exotic chemical", "24 hours", "You become someone else: a new character with the same gear, chrome, EMP, BODY, REF, WILL and DEX; MOVE, COOL and LUCK and Skills can swap.", 12, "You flip between selves when you sleep; remembering takes DV15 Concentration. Three straight weeks of Addiction Therapy cures it."]
];

/** The book's street drugs (Chapter 08): Standard recipes at the materials cost in their listing. [name, eb]. */
export const BOOK_DRUGS = [
  ["Black Lace", 50], ["Blue Glass", 20], ["Boost", 50], ["Smash", 10], ["Synthcoke", 20], ["White Lace", 20], ["Red Lace", 110], ["Immunoblockers", 100]
];

const P = (s) => `<p>${s}</p>`;

/** A mixed drug as a Cyberpunk RED drug item. */
export function mixedDrugItem(row, moduleId) {
  const [name, tier, eb, recipe, lasts, primary, dv, secondary] = row;
  return {
    name,
    type: "drug",
    img: "icons/svg/pill.svg",
    system: {
      description: { value: P(`<b>${tier[0].toUpperCase()}${tier.slice(1)} mixed drug.</b> Lasts ${lasts}.`) + P(`<b>Primary:</b> ${primary}`) + P(`<b>Secondary (DV${dv}):</b> ${secondary}`) + P(`<b>Recipe:</b> ${recipe}.`) },
      price: { market: eb },
      amount: 1,
      equipped: "owned",
      concealable: { concealable: true, isConcealed: false }
    },
    flags: { [moduleId]: { drug: { tier, dv, lasts } } }
  };
}

/** A recipe as a gear item (one for each mixed drug, and each book drug). */
export function recipeItem({ name, tier, cost, ingredients = "", book = false, pharma = false, makes = null }, moduleId) {
  const t = SYNTH[tier];
  return {
    name: `Recipe: ${name}`,
    type: "gear",
    img: "icons/svg/book.svg",
    system: {
      description: { value: P(`<b>${tier[0].toUpperCase()}${tier.slice(1)} recipe</b> (DV${t.dv}, ${t.tool}). Ingredients ${cost}eb a dose${ingredients ? `: ${ingredients}` : ""}.`) + P("Teach it to anyone in an hour.") },
      price: { market: t.recipeEb },
      amount: 1,
      equipped: "owned",
      concealable: { concealable: true, isConcealed: false }
    },
    flags: { [moduleId]: { recipe: { name, tier, cost, ingredients, book, pharma, makes } } }
  };
}

/** A Drug Lab tool or upgrade as gear. */
export function labItem([name, eb, text, tier], moduleId) {
  return {
    name,
    type: "gear",
    img: tier ? "icons/svg/acid.svg" : "icons/svg/upgrade.svg",
    system: { description: { value: P(text) }, price: { market: eb }, amount: 1, equipped: "owned", concealable: { concealable: false, isConcealed: false } },
    flags: tier ? { [moduleId]: { drugTool: tier } } : {}
  };
}
