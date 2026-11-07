import { MODULE_ID, SYSTEM_ID } from "../constants.js";
import { CPR } from "../cpr.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { Downtime } from "./downtime.js";
import { DowntimeOps } from "./downtime-ops.js";
import { PRICE_CATEGORIES, priceCategory } from "../data/maintenance.js";
import { SYNTH, synthTools, synthJob, normalizeRecipe, MEDTECH_MAKER, MEDTECH_MAKER_POINTS } from "../data/drugs.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** Most doses one go at a recipe makes (a roll each). */
export const MAX_DOSES = 20;

/**
 * Who can do Maker work of a kind, and as what: "tech" (a Tech's Maker), or a Medtech's Specialty
 * at 4 points or more (ripperdoc, pharma, cryo: The Medtech as Maker, Chapter 04).
 * @param {string} [kind] - fabricate, upgrade or invent (default: any)
 * @returns {string[]}
 */
export function makerDomains(actor, kind = null) {
  const roles = CPR.roles(actor);
  const out = [];
  if (roles.tech !== undefined) out.push("tech");
  if (roles.medtech !== undefined) {
    for (const [k, m] of Object.entries(MEDTECH_MAKER)) {
      if ((!kind || m.kinds.includes(kind)) && CPR.abilityRank(actor, m.ability) >= MEDTECH_MAKER_POINTS) out.push(k);
    }
  }
  return out;
}

/** A finished drug invention's recipe: a gear item a Medtech keeps, teaches or sells. */
export function recipeData(p, actor) {
  const d = p.data ?? {};
  const name = d.name || L("NEONHOME.Drug.Untitled");
  const tier = SYNTH[d.tier] ? d.tier : "standard";
  const cost = Math.max(0, Math.floor(Number(d.doseCost) || 0));
  return {
    name: L("NEONHOME.Drug.RecipeName", { name }),
    type: "gear",
    img: "icons/svg/book.svg",
    system: {
      description: {
        value: `<p><b>${esc(L(`NEONHOME.Drug.Tier.${tier}`))}</b> (DV${SYNTH[tier].dv}, ${esc(SYNTH[tier].tool)}) &middot; ${esc(L("NEONHOME.Drug.CostADose", { eb: eb(cost) }))}</p>`
          + `<p><b>${esc(L("NEONHOME.Blueprint.Inventor"))}:</b> ${esc(actor.name)}${d.pharma ? ` &middot; ${esc(L("NEONHOME.Drug.PharmaOnly"))}` : ""}</p>`
          + `<p>${esc(d.text ?? "").replace(/\n/g, "<br>")}</p>`
          + `<p><em>${esc(L("NEONHOME.Drug.RecipeNote"))}</em></p>`
      },
      price: { market: SYNTH[tier].recipeEb },
      amount: 1,
      equipped: "owned",
      concealable: { concealable: true, isConcealed: false }
    },
    flags: { [MODULE_ID]: { recipe: { name, tier, cost, text: d.text ?? "", pharma: !!d.pharma, inventor: actor.name } } }
  };
}

/**
 * Street Drug Synthesis (Chapter 08) and the Medtech as Maker's extras: recipes, the tools for them,
 * cooking doses (INT + Science (Chemistry) + 1d10, a roll a dose), and a Ripperdoc blueprinting a
 * real piece of cyberware.
 */
export const DrugOps = {
  /** The recipes a character holds: [{ item, recipe }]. */
  recipes(actor) {
    return (actor?.items?.filter?.((i) => i.getFlag?.(MODULE_ID, "recipe")) ?? [])
      .map((item) => ({ item, recipe: normalizeRecipe({ name: item.name.replace(/^[^:]*:\s*/, ""), ...item.getFlag(MODULE_ID, "recipe") }) }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  },

  /** The best synthesis tool a character has, and its upgrades. */
  tools(actor) {
    return synthTools(actor?.items?.map?.((i) => ({ name: i.name, tier: i.getFlag?.(MODULE_ID, "drugTool") })) ?? []);
  },

  /** What a character adds to a synthesis roll: a Medtech's Medical Tech (with a point of Pharmaceuticals), a Tech's Fabrication Expertise. */
  bonuses(actor) {
    const out = [];
    if (CPR.abilityRank(actor, "Medical Tech (Pharmaceuticals)") >= 1) {
      const mt = CPR.abilityRank(actor, "Medical Tech Skill");
      if (mt) out.push({ value: mt, source: L("NEONHOME.Downtime.MedicalTech") });
    }
    const fab = CPR.abilityRank(actor, "Fabrication Expertise");
    if (fab) out.push({ value: fab, source: L("NEONHOME.Downtime.Expertise.fabrication") });
    return out;
  },

  /**
   * Cook doses of a recipe: each dose takes its time and its ingredients (lost on a failure), and a
   * roll: INT + Science (Chemistry) + 1d10 + the bonuses + better tools, against the recipe's DV.
   * @param {object} p - { recipe: the recipe item's id, doses }
   */
  async cook(actor, { recipe: recipeId, doses = 1 } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const found = this.recipes(actor).find((r) => r.item.id === recipeId);
    if (!found) throw new RuleBlock(L("NEONHOME.Drug.PickRecipe"));
    const { recipe } = found;
    if (recipe.pharma) DowntimeOps._requireRole(actor, "medtech");
    const job = synthJob(recipe, this.tools(actor));
    if (!job.ok) throw new RuleBlock(L("NEONHOME.Drug.NeedTool", { name: actor.name, tool: job.tool }));
    const n = Math.min(MAX_DOSES, Math.max(1, Math.floor(Number(doses) || 1)));
    // all of it has to be there before the first pot goes on
    Downtime.require(actor, job.minutes * n);
    DowntimeOps._canAfford(actor, job.cost * n);
    const mods = [...this.bonuses(actor)];
    if (job.bonus) mods.push({ value: job.bonus, source: L("NEONHOME.Drug.BetterTools") });
    const label = L("NEONHOME.Drug.CookLabel", { drug: recipe.name });
    let made = 0;
    let tried = 0;
    for (let i = 0; i < n; i++) {
      const res = await DowntimeOps._timedRoll(actor, job.minutes, label, { action: "synth", recipe: recipe.name }, () => CPR.skillCheck(actor, "Science (Chemistry)", { event, stat: "int", mods }));
      if (!res) break;
      tried++;
      await DowntimeOps._pay(actor, job.cost, label);
      const ok = res.total >= job.dv;
      if (ok) made++;
      await DowntimeOps._post(actor, res.html, {
        icon: "fa-solid fa-flask", title: label, dv: job.dv, total: res.total, ok,
        verdict: L(`NEONHOME.Drug.Cook.${ok ? "ok" : "fail"}`, { name: esc(actor.name), drug: esc(recipe.name), n: i + 1, of: n })
      });
    }
    if (made) await this._give(actor, found, made);
    return { made, tried };
  },

  /** The doses: onto a stack of the drug the character has, or a new one (the recipe's drug, the system's, or a plain one). */
  async _give(actor, { item, recipe }, n) {
    const have = actor.items.find((i) => i.type === "drug" && i.name === (recipe.makes?.name ?? recipe.name));
    if (have) {
      await have.update({ "system.amount": (Number(have.system?.amount) || 0) + n });
      return have;
    }
    let data = recipe.makes ? foundry.utils.deepClone(recipe.makes) : null;
    if (!data) {
      try {
        const pack = game.packs?.get(`${SYSTEM_ID}.core_drugs`);
        const doc = pack ? (await pack.getDocuments({ name: recipe.name }))?.[0] ?? null : null;
        if (doc) data = doc.toObject();
      } catch (err) {
        console.warn(`${MODULE_ID} | couldn't read ${recipe.name} from the drugs compendium`, err);
      }
    }
    data ??= { name: recipe.name, type: "drug", img: "icons/svg/pill.svg", system: { description: { value: `<p>${esc(recipe.text)}</p>` }, price: { market: recipe.cost } } };
    delete data._id;
    foundry.utils.setProperty(data, "system.amount", n);
    if (data.system?.equipped) data.system.equipped = "owned";
    const [made] = await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
    return made;
  },

  /**
   * A Ripperdoc (4+) blueprints a real piece of cyberware they've sourced, before fabricating it: a
   * blueprint of it (the piece is the item it makes).
   */
  async blueprintPiece(actor, itemId) {
    if (!makerDomains(actor, "fabricate").includes("ripperdoc")) throw new RuleBlock(L("NEONHOME.Medtech.NeedRipperdoc", { name: actor.name }));
    const piece = actor.items.get(itemId);
    if (!piece || piece.type !== "cyberware" || piece.getFlag(MODULE_ID, "blueprint")) throw new RuleBlock(L("NEONHOME.Medtech.NeedPiece"));
    const makes = piece.toObject();
    for (const k of ["_id", "folder", "sort", "ownership", "_stats"]) delete makes[k];
    if (makes.system?.equipped) makes.system.equipped = "owned";
    if (makes.system && "isInstalled" in makes.system) makes.system.isInstalled = false;
    const value = Number(piece.system?.price?.market) || 0;
    const category = PRICE_CATEGORIES[Math.max(0, priceCategory(value))].key;
    const data = {
      name: L("NEONHOME.Blueprint.Name", { name: piece.name }),
      type: "gear",
      img: "icons/svg/book.svg",
      system: {
        description: { value: `<p>${esc(L("NEONHOME.Medtech.BlueprintOf", { item: piece.name, name: actor.name }))}</p>` },
        price: { market: value },
        amount: 1,
        equipped: "owned",
        concealable: { concealable: true, isConcealed: false }
      },
      flags: { [MODULE_ID]: { blueprint: { name: piece.name, category, value, text: "", skill: "Cybertech", inventor: actor.name, makes } } }
    };
    const [bp] = await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
    await ChatMessage.create({ content: HomeOps._card("fa-solid fa-scroll", L("NEONHOME.Medtech.Blueprinted", { name: esc(actor.name), item: esc(piece.name) })), speaker: ChatMessage.getSpeaker({ actor }) });
    return bp;
  }
};
