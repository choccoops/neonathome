import { MODULE_ID, SYSTEM_ID, NEON_HUB_ID } from "../constants.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { Downtime } from "./downtime.js";
import { DowntimeOps } from "./downtime-ops.js";
import {
  SALVAGE_MINUTES, CATEGORIES, ERAS, LOCATIONS, locationsOf, salvageWorth, firstDv, rollCategory, rollPeril,
  perilGear, categoryOf, normalizeHaul, haulLeft
} from "../data/salvage.js";
import {
  TIERS, TIER_NAMES, tierEb, countMaterials, materialsItemData, partsValue, strippable, stripPlan, payMaterials, needsLabel, unitsFor
} from "../data/materials.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** Actor flag: what salvaging trips found, waiting to be picked out. */
export const HAULS_FLAG = "hauls";

/**
 * Salvaging (Salvaging Night City; a 2070 version for the Edgerunner's Handbook's Night City) and
 * Tech Materials: a trip finds a worth of salvage, picked out as Destroyed items or as materials;
 * a Tech strips gear for materials; Maker projects are paid for in materials.
 */
export const SalvageOps = {
  /** The era the salvage tables are for: the GM's setting, or Neon Hub's lifestyle era (2045 without it). */
  era() {
    const set = String(Settings.get("salvageEra") ?? "auto");
    if (ERAS.includes(set)) return set;
    if (game.modules.get(NEON_HUB_ID)?.active) {
      try {
        const hub = String(game.settings.get(NEON_HUB_ID, "lifestyleEra"));
        if (ERAS.includes(hub)) return hub;
      } catch {
        // an older Neon Hub without eras
      }
    }
    return "2045";
  },

  placeName(era, key) {
    return L(`NEONHOME.Salvage.Place.${era}.${key}`);
  },

  categoryName(key) {
    return L(`NEONHOME.Salvage.Category.${key}`);
  },

  /* ---------------------------------------- */
  /*  The GM's tables                         */
  /* ---------------------------------------- */

  /** A world RollTable the GM imported (and maybe edited) for a salvage table, if any. */
  worldTable(key) {
    return game.tables?.find?.((t) => t.getFlag?.(MODULE_ID, "salvage") === key) ?? null;
  },

  /** The GM's wording for a roll: the place's table, else the era's (2045's places share one pair). */
  _worldText(era, loc, kind, roll) {
    const table = this.worldTable(`${era}.${loc}.${kind}`) ?? this.worldTable(`${era}.${kind}`);
    const row = table?.results?.find?.((r) => r.range?.[0] <= roll && roll <= r.range?.[1]);
    return row ? String(row.description ?? row.text ?? row.name ?? "").trim() : "";
  },

  /** The category a 1d6 finds: ours, or the GM's table's (when its text names a category). */
  category(era, loc, roll) {
    const text = this._worldText(era, loc, "categories", roll).toLowerCase();
    if (text) {
      const hit = CATEGORIES.find((c) => text === c.toLowerCase() || text === this.categoryName(c).toLowerCase());
      if (hit) return hit;
    }
    return rollCategory(era, loc, roll);
  },

  /** The peril a 1d6 brings: ours, with the GM's wording if their table has some. */
  peril(era, loc, roll) {
    const p = rollPeril(era, loc, roll);
    const text = this._worldText(era, loc, "perils", roll);
    return text ? { ...p, text, custom: true } : p;
  },

  /* ---------------------------------------- */
  /*  A salvaging trip                        */
  /* ---------------------------------------- */

  hauls(actor) {
    const raw = actor?.getFlag?.(MODULE_ID, HAULS_FLAG);
    return (Array.isArray(raw) ? raw : []).map(normalizeHaul).filter((h) => h.id);
  },

  async _saveHauls(actor, list) {
    await actor.setFlag(MODULE_ID, HAULS_FLAG, list.map(normalizeHaul));
  },

  /**
   * A week of salvaging (Salvaging Night City, pp.3-5): a Basic Tech Check, whose total sets the
   * worth found; the category rolled on the place's table, unless one was chosen (a harder DV).
   * A Critical Failure finds nothing and runs into a peril.
   * @param {object} p - { location, category: a category or "any" }
   */
  async trip(actor, { location, category = "any" } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const era = this.era();
    const loc = LOCATIONS[era][location] ? location : locationsOf(era)[0];
    const specific = CATEGORIES.includes(category);
    const place = this.placeName(era, loc);
    const label = L("NEONHOME.Salvage.Label", { place });
    const res = await DowntimeOps._timedRoll(actor, SALVAGE_MINUTES, label, { action: "salvage", era, location: loc }, () => CPR.skillCheck(actor, "Basic Tech", { event }));
    if (!res) return null;
    const title = `${label} (${era})`;
    if (res.critFail) {
      await DowntimeOps._post(actor, res.html, { icon: "fa-solid fa-dumpster-fire", title, dv: firstDv(specific), total: res.total, ok: false, verdict: L("NEONHOME.Salvage.CritFail", { name: esc(actor.name) }) });
      const peril = await this.suffer(actor, era, loc);
      return { ok: false, worth: 0, peril };
    }
    const worth = salvageWorth(res.total, specific);
    if (!worth) {
      await DowntimeOps._post(actor, res.html, { icon: "fa-solid fa-dumpster", title, dv: firstDv(specific), total: res.total, ok: false, verdict: L("NEONHOME.Salvage.Nothing", { name: esc(actor.name), place: esc(place) }) });
      return { ok: false, worth: 0 };
    }
    let cat = category;
    let catRoll = null;
    if (!specific) {
      catRoll = await new Roll("1d6").evaluate();
      cat = this.category(era, loc, catRoll.total);
    }
    const haul = normalizeHaul({ id: foundry.utils.randomID(), era, location: loc, category: cat, worth, at: game.time?.worldTime ?? 0 });
    await this._saveHauls(actor, [...this.hauls(actor), haul]);
    await DowntimeOps._post(actor, res.html, {
      icon: "fa-solid fa-dumpster",
      title,
      dv: firstDv(specific),
      total: res.total,
      ok: true,
      verdict: L(`NEONHOME.Salvage.Found${catRoll ? "Rolled" : ""}`, { name: esc(actor.name), place: esc(place), eb: eb(worth), category: this.categoryName(cat), roll: catRoll?.total ?? "" })
    });
    return { ok: true, worth, category: cat, haul };
  },

  /**
   * Perils of Salvaging (p.5): roll the place's table and post what happened, its damage rolled.
   * Gear that keeps it off is named; a collapse also draws a Critical Injury to the Body.
   */
  async suffer(actor, era, loc) {
    const roll = await new Roll("1d6").evaluate();
    const peril = this.peril(era, loc, roll.total);
    const r = peril.rules ?? {};
    const gear = perilGear(peril.kind, actor.items.map((i) => ({ name: i.name, type: i.type })));
    const rolls = [roll];
    const lines = [`<p class="nah-malf-text">${esc(peril.text)}</p>`];
    if (!peril.custom) lines.push(`<p>${esc(peril.effect)}</p>`);
    if (gear && r.negate) {
      lines.push(`<p class="is-ok"><i class="fa-solid fa-shield-halved"></i> ${L("NEONHOME.Salvage.Negated", { name: esc(actor.name), item: esc(gear) })}</p>`);
    } else if (gear && r.save) {
      lines.push(`<p class="is-ok"><i class="fa-solid fa-shield-halved"></i> ${L("NEONHOME.Salvage.Saved", { name: esc(actor.name), item: esc(gear) })}</p>`);
    } else {
      if (r.damage) {
        const dmg = await new Roll(r.damage).evaluate();
        rolls.push(dmg);
        lines.push(`<p><b>${L("NEONHOME.Salvage.Damage", { n: dmg.total, dice: r.damage })}</b>${r.save ? ` ${L("NEONHOME.Salvage.OrSave", { dv: r.dv, skill: r.skill })}` : ""}</p>`);
      }
      if (r.rounds) {
        const rounds = await new Roll(r.rounds).evaluate();
        rolls.push(rounds);
        lines.push(`<p><b>${L("NEONHOME.Salvage.Rounds", { rounds: rounds.total, n: rounds.total * r.perRound })}</b></p>`);
      }
      if (r.direct) lines.push(`<p><b>${L("NEONHOME.Salvage.Resist", { dv: r.dv, skill: r.skill, dice: r.direct })}</b></p>`);
      if (r.crit) {
        const injury = await this.bodyInjury(actor);
        lines.push(`<p><b>${injury ? L("NEONHOME.Salvage.Injury", { name: esc(actor.name), injury: esc(injury) }) : L("NEONHOME.Salvage.RollInjury")}</b></p>`);
      }
    }
    await ChatMessage.create({
      content: `<div class="neon-home-chat nah-malfunction"><header><i class="fa-solid fa-dumpster-fire"></i> ${L("NEONHOME.Salvage.Peril", { name: esc(actor.name) })}</header>`
        + `<p class="nah-malf-table">${esc(this.placeName(era, loc))} (${era}) · ${roll.total}</p>${lines.join("")}`
        + `<p class="nah-malf-dur"><span class="nah-malf-src">${esc(L("NEONHOME.Salvage.Source"))}</span></p></div>`,
      rolls,
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { ...peril, roll: roll.total, gear };
  },

  /**
   * Draw a Critical Injury to the Body as the character sheet does (the system's critical injury
   * tables, the GM's choice of compendium) and give it to the character. The injury's name, or ""
   * if it couldn't be drawn (the card then asks for it to be rolled from the sheet).
   */
  async bodyInjury(actor) {
    try {
      const tablePack = game.packs?.get?.(game.settings.get(SYSTEM_ID, "criticalInjuryRollTableCompendium"));
      const table = (await tablePack?.getDocuments?.())?.find((t) => /body/i.test(t.name));
      if (!table) return "";
      const drawn = await table.draw({ displayChat: false });
      const res = drawn?.results?.[0];
      const name = String(res?.text ?? res?.name ?? res?.description ?? "").trim();
      const pack = game.packs.find((p) => p.metadata?.label === table.name && p.documentName === "Item") ?? game.packs.get(`${SYSTEM_ID}.core_critical-injuries-body`);
      const doc = (await pack?.getDocuments?.())?.find((i) => i.name === name);
      if (!doc) return "";
      await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
      return doc.name;
    } catch (err) {
      console.warn(`${MODULE_ID} | couldn't draw a Critical Injury to the Body`, err);
      return "";
    }
  },

  /* ---------------------------------------- */
  /*  Picking out a haul (p.4, Step 3)        */
  /* ---------------------------------------- */

  _haul(actor, id) {
    const h = this.hauls(actor).find((x) => x.id === id);
    if (!h) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    return h;
  },

  /** Spend some of a haul; one spent to the last eb is done with. */
  async _spend(actor, h, ebs, name) {
    const next = { ...h, spent: h.spent + ebs, taken: [...h.taken, { name, eb: ebs }] };
    const rest = this.hauls(actor).filter((x) => x.id !== h.id);
    await this._saveHauls(actor, haulLeft(next) > 0 ? [...rest, next] : rest);
    return next;
  },

  _haulSource(actor, h) {
    return L("NEONHOME.Salvage.SourceLine", { category: this.categoryName(h.category), place: this.placeName(h.era, h.location), era: h.era, name: actor.name });
  },

  /** Take Tech Materials out of a haul: any tier the worth left covers. */
  async takeMaterials(actor, haulId, tier, count = 1) {
    const h = this._haul(actor, haulId);
    const n = Math.max(1, Math.floor(Number(count) || 1));
    if (!TIERS.includes(tier) || unitsFor(haulLeft(h), tier) < n) throw new RuleBlock(L("NEONHOME.Salvage.TooDear", { left: eb(haulLeft(h)) }));
    const data = materialsItemData(tier, MODULE_ID, { source: this._haulSource(actor, h) });
    data.system.amount = n;
    await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
    const name = n > 1 ? `${data.name} ×${n}` : data.name;
    const next = await this._spend(actor, h, tierEb(tier) * n, name);
    await this._takenCard(actor, next, name);
    return next;
  },

  /**
   * Take an item out of a haul (dropped from the sidebar or a compendium): of the haul's category,
   * no dearer than what's left, and Destroyed (it needs repairing, p.140).
   */
  async takeItem(actor, haulId, uuid) {
    const h = this._haul(actor, haulId);
    const source = uuid ? await fromUuid(uuid) : null;
    if (!source || source.documentName !== "Item") throw new RuleBlock(L("NEONHOME.Salvage.DropFind"));
    const data = source.toObject();
    delete data._id;
    if (categoryOf(data.type) !== h.category) throw new RuleBlock(L("NEONHOME.Salvage.WrongCategory", { item: data.name, category: this.categoryName(h.category) }));
    const price = Number(data.system?.price?.market) || 0;
    if (price <= 0 || price > haulLeft(h)) throw new RuleBlock(L("NEONHOME.Salvage.TooDear", { left: eb(haulLeft(h)) }));
    if (data.system?.equipped) data.system.equipped = "owned";
    data.flags ??= {};
    const ours = (data.flags[MODULE_ID] ??= {});
    ours.item = { ...(ours.item ?? {}), condition: "destroyed", hidden: false, malfunction: null };
    ours.salvaged = this._haulSource(actor, h);
    await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
    const next = await this._spend(actor, h, price, data.name);
    await this._takenCard(actor, next, `${data.name} (${L("NEONHOME.Condition.destroyed")})`);
    return next;
  },

  async _takenCard(actor, h, name) {
    const left = haulLeft(h);
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-dumpster", L(`NEONHOME.Salvage.Taken${left ? "" : "Last"}`, { name: esc(actor.name), item: esc(name), left: eb(left) })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /** Done picking: whatever worth is left is lost (p.4). */
  async leave(actor, haulId) {
    const h = this._haul(actor, haulId);
    await this._saveHauls(actor, this.hauls(actor).filter((x) => x.id !== h.id));
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-dumpster", L("NEONHOME.Salvage.Left", { name: esc(actor.name), left: eb(haulLeft(h)) })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /* ---------------------------------------- */
  /*  Stripping for parts                     */
  /* ---------------------------------------- */

  /** A character's gear a Tech could break down: { item, value (per unit), amount }. */
  strippable(actor) {
    return actor.items
      .filter((i) => strippable(i, MODULE_ID))
      .map((i) => ({ item: i, value: partsValue(i, MODULE_ID), amount: Math.max(1, Math.floor(Number(i.system?.amount) || 1)) }))
      .sort((a, b) => a.item.name.localeCompare(b.item.name));
  },

  /**
   * A Tech breaks gear down into Tech Materials: items of any worth added up to the tier wanted
   * (a stack of materials can be broken down or combined the same way). What's past the materials'
   * worth is lost.
   * @param {Record<string, number>} picks - item id → how many of it (a stack's units)
   */
  async strip(actor, picks, tier, count = 1) {
    DowntimeOps._ready(actor);
    DowntimeOps._requireRole(actor, "tech");
    const can = new Map(this.strippable(actor).map((s) => [s.item.id, s]));
    const chosen = Object.entries(picks ?? {})
      .map(([id, qty]) => ({ s: can.get(id), qty: Math.floor(Number(qty) || 0) }))
      .filter((c) => c.s && c.qty > 0)
      .map((c) => ({ ...c, qty: Math.min(c.qty, c.s.amount) }));
    if (!chosen.length) throw new RuleBlock(L("NEONHOME.Strip.PickSome"));
    const n = Math.max(1, Math.floor(Number(count) || 1));
    const plan = stripPlan(chosen.map((c) => ({ value: c.s.value, qty: c.qty })), tier, n);
    if (!plan.ok) throw new RuleBlock(L("NEONHOME.Strip.Short", { have: eb(plan.total), need: eb(plan.need), materials: needsLabel({ tier, count: n }) }));
    const names = chosen.map((c) => (c.qty > 1 ? `${c.s.item.name} ×${c.qty}` : c.s.item.name));
    const del = chosen.filter((c) => c.qty >= c.s.amount).map((c) => c.s.item);
    for (const c of chosen) if (c.qty < c.s.amount) await c.s.item.update({ "system.amount": c.s.amount - c.qty });
    for (const item of del) await CPR.removeWithInstalled(item);
    const data = materialsItemData(tier, MODULE_ID, { source: L("NEONHOME.Strip.SourceLine", { items: names.join(", "), name: actor.name }) });
    data.system.amount = n;
    await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-gears", L(`NEONHOME.Strip.Card${plan.waste ? "Waste" : ""}`, {
        name: esc(actor.name), items: esc(names.join(", ")), materials: esc(needsLabel({ tier, count: n })), waste: eb(plan.waste)
      })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { ...plan, tier, count: n };
  },

  /* ---------------------------------------- */
  /*  Paying for Maker work                   */
  /* ---------------------------------------- */

  /**
   * Use up the Tech Materials a need takes from a character's items. Where they came from, or a
   * RuleBlock if there aren't enough.
   * @returns {string[]} the sources noted on the materials used
   */
  async useMaterials(actor, need) {
    if (!need?.count) return [];
    const pay = payMaterials([...actor.items], need, MODULE_ID);
    if (!pay) throw new RuleBlock(L("NEONHOME.Materials.Short", { name: actor.name, materials: needsLabel(need) }));
    for (const p of pay) {
      const item = actor.items.get(p.id);
      if (!item) continue;
      if (p.left) await item.update({ "system.amount": p.left });
      else await actor.deleteEmbeddedDocuments("Item", [item.id]);
    }
    return [...new Set(pay.map((p) => p.source).filter(Boolean))];
  },

  /** For display: a need and how many units of it a character has. */
  needLine(actor, need) {
    if (!need?.count) return "";
    const have = countMaterials([...actor.items], need.tier, MODULE_ID);
    return { text: needsLabel(need), have, ok: have >= need.count, tierName: TIER_NAMES[need.tier] };
  }
};
