import { MODULE_ID } from "../constants.js";
import { CPR } from "../cpr.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { MaintOps } from "./maint-ops.js";
import { Downtime, formatMinutes } from "./downtime.js";
import { DowntimeOps, workSkill } from "./downtime-ops.js";
import { PRICE_CATEGORIES, fieldExpertise } from "../data/maintenance.js";
import { makerJob, UPGRADES, inventPrice } from "../data/downtime.js";
import { fabricationNeeds, upgradeNeeds, tierEb, needsLabel } from "../data/materials.js";
import { SalvageOps } from "./salvage-ops.js";
import { normalizeProject, stage, plan, needed, halfway, remaining } from "../data/projects.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/**
 * A finished invention's blueprint: a gear item holding the design (the player's description),
 * its price category and who invented it, priced at that category. Blueprints can be sold or handed
 * on like any gear; the GM writes up how the invention works.
 */
export function blueprintData(p, actor) {
  const cat = p.data?.category ?? "expensive";
  const price = Number(p.data?.value) || (PRICE_CATEGORIES.find((c) => c.key === cat)?.eb ?? 0);
  const title = p.data?.name || L("NEONHOME.Blueprint.Untitled");
  return {
    name: L("NEONHOME.Blueprint.Name", { name: title }),
    type: "gear",
    img: "icons/svg/book.svg",
    system: {
      description: {
        value: `<p><b>${esc(L("NEONHOME.Blueprint.Category"))}:</b> ${esc(L(`NEONHOME.Maint.Price.${cat}`))} (${price.toLocaleString()}eb)</p>`
          + `<p><b>${esc(L("NEONHOME.Blueprint.Inventor"))}:</b> ${esc(actor.name)} &middot; ${esc(p.skill)} DV${p.dv}</p>`
          + `<p>${esc(p.data?.text ?? "").replace(/\n/g, "<br>")}</p>`
          + `<p><em>${esc(L("NEONHOME.Blueprint.Note"))}</em></p>`
      },
      price: { market: price },
      amount: 1,
      equipped: "owned",
      isElectronic: false,
      concealable: { concealable: true, isConcealed: false }
    },
    flags: { [MODULE_ID]: { blueprint: { name: title, category: cat, text: p.data?.text ?? "", skill: p.skill, dv: p.dv, inventor: actor.name }, item: { category: "utility" } } }
  };
}

/** Actor flag: a character's projects under way. */
export const PROJECTS_FLAG = "projects";

/** Each kind's icon and the Expertise its check adds. */
const KIND = {
  fabricate: { icon: "fa-solid fa-industry", ability: "Fabrication Expertise" },
  upgrade: { icon: "fa-solid fa-microchip", ability: "Upgrade Expertise" },
  invent: { icon: "fa-solid fa-lightbulb", ability: "Invention Expertise" },
  repair: { icon: "fa-solid fa-toolbox", ability: "" }
};

/**
 * Long projects (see data/projects.js): Maker work and repairs, kept on the character who works on
 * them, with a meter filled from their downtime. Starting one buys the materials; the check comes
 * due halfway; a failure there starts it over (materials fine); a pass lets the rest of the time in;
 * a full meter finishes it.
 */
export const ProjectOps = {
  list(actor) {
    const raw = actor?.getFlag?.(MODULE_ID, PROJECTS_FLAG);
    return (Array.isArray(raw) ? raw : []).map(normalizeProject).filter((p) => p.id);
  },

  get(actor, id) {
    return this.list(actor).find((p) => p.id === id) ?? null;
  },

  async _save(actor, list) {
    await actor.setFlag(MODULE_ID, PROJECTS_FLAG, list.map(normalizeProject));
  },

  async _put(actor, project) {
    const list = this.list(actor).filter((p) => p.id !== project.id);
    await this._save(actor, [...list, project]);
  },

  async _drop(actor, id) {
    await this._save(actor, this.list(actor).filter((p) => p.id !== id));
  },

  /** A repair under way on an item (by whoever's doing it). */
  repairOf(worker, owner, itemId) {
    return this.list(worker).find((p) => p.kind === "repair" && p.data.owner === owner.uuid && p.data.item === itemId) ?? null;
  },

  /* ---------------------------------------- */
  /*  Starting                                */
  /* ---------------------------------------- */

  /**
   * Start a Maker project and put time in right away.
   * @param {string} kind - fabricate, upgrade or invent
   * @param {object} p - fabricate { item: uuid }, upgrade { item: id, upgrade }, invent { text, category, skill }
   * @param {object} [opts] - { minutes: time to put in now ("check", "all" or minutes), event }
   */
  async start(actor, kind, p = {}, { minutes = "all", event = null } = {}) {
    DowntimeOps._ready(actor);
    DowntimeOps._requireRole(actor, "tech");
    let project;
    switch (kind) {
      case "fabricate": {
        const source = p.item ? await fromUuid(p.item) : null;
        if (!source || source.documentName !== "Item") throw new RuleBlock(L("NEONHOME.Downtime.DropItem"));
        const data = source.toObject();
        delete data._id;
        const price = Number(data.system?.price?.market) || 0;
        const job = makerJob(price);
        project = { kind, label: L("NEONHOME.Downtime.FabricateLabel", { item: data.name }), img: data.img, skill: workSkill(data), dv: job.dv, minutes: job.minutes, data: { item: data, need: fabricationNeeds(price) } };
        break;
      }
      case "upgrade": {
        const item = actor.items.get(p.item);
        if (!item) throw new RuleBlock(L("NEONHOME.Downtime.PickItem"));
        if (!UPGRADES[p.upgrade]) throw new RuleBlock(L("NEONHOME.Downtime.PickUpgrade"));
        if (item.getFlag(MODULE_ID, "makerUpgrade") || this.list(actor).some((x) => x.kind === "upgrade" && x.data.item === item.id)) {
          throw new RuleBlock(L("NEONHOME.Downtime.AlreadyUpgraded", { item: item.name }));
        }
        const vehicle = item.type === "vehicle";
        const price = Number(item.system?.price?.market) || 0;
        const job = makerJob(price, { vehicle });
        project = {
          kind, label: L("NEONHOME.Downtime.UpgradeLabel", { item: item.name, upgrade: L(`NEONHOME.Downtime.Upgrade.${p.upgrade}`) }), img: item.img,
          skill: workSkill(item.toObject()), dv: job.dv, minutes: job.minutes, data: { item: item.id, upgrade: p.upgrade, need: upgradeNeeds(price, { vehicle }) }
        };
        break;
      }
      case "invent": {
        const text = String(p.text ?? "").trim();
        if (!text) throw new RuleBlock(L("NEONHOME.Downtime.DescribeIt"));
        // the GM's planned value sets the category; Super Luxury takes a month per 10,000eb (p.149)
        const price = inventPrice(p.category, p.value);
        if (!price.ok) throw new RuleBlock(L("NEONHOME.Downtime.InventTooCheap"));
        const cat = price.category;
        const job = makerJob(price.value);
        const name = String(p.name ?? "").trim().slice(0, 100);
        project = {
          kind, label: name ? L("NEONHOME.Downtime.InventNamed", { name }) : L("NEONHOME.Downtime.InventLabel"), img: "", skill: p.skill || "Basic Tech",
          dv: job.dv, minutes: job.minutes, data: { text, category: cat, value: price.value, name }
        };
        break;
      }
      default:
        throw new Error(`Not a Maker project: ${kind}`);
    }
    // the time asked for has to be there before the materials go in
    if (minutes !== 0) Downtime.require(actor, typeof minutes === "number" ? Math.min(Math.floor(minutes), project.minutes) : 0);
    const need = project.data.need ?? null;
    project = normalizeProject({ ...project, id: foundry.utils.randomID(), ability: KIND[kind].ability, materials: need ? tierEb(need.tier) * need.count : 0 });
    // the Tech's Tech Materials go in up front (a failure leaves them unharmed for the next try)
    const sources = await SalvageOps.useMaterials(actor, need);
    project.data.sources = sources;
    await this._put(actor, project);
    const materials = need ? needsLabel(need) : L("NEONHOME.Project.NoMaterials");
    const from = sources.length ? `<br><small>${L("NEONHOME.Materials.From", { from: esc(sources.join("; ")) })}</small>` : "";
    await ChatMessage.create({
      content: HomeOps._card(KIND[kind].icon, L("NEONHOME.Project.Started", { name: esc(actor.name), label: esc(project.label), time: formatMinutes(project.minutes), dv: project.dv, materials: esc(materials) }) + from),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    await this.work(actor, project.id, minutes, { event });
    return this.get(actor, project.id) ?? project;
  },

  /**
   * Start (or carry on) repairing a Destroyed item: the corebook's DV and time for its price
   * (p.140), worked by `worker` (the owner, or anyone with the skill).
   */
  async repair(worker, owner, itemId, { minutes = "all", event = null } = {}) {
    Downtime.check(worker, "maintenance");
    if (MaintOps.isStash(owner)) Downtime.check(worker, "stash");
    const existing = this.repairOf(worker, owner, itemId);
    if (existing) return this.work(worker, existing.id, minutes, { event });
    const item = owner.items.get(itemId);
    const e = await MaintOps.entry(owner, itemId);
    if (!item || !e) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    if (e.condition === "dbr") throw new RuleBlock(L("NEONHOME.Maint.BeyondRepair", { item: esc(item.name) }));
    if (e.condition !== "destroyed") return null;
    const project = normalizeProject({
      id: foundry.utils.randomID(), kind: "repair", label: L("NEONHOME.Project.RepairLabel", { item: item.name }), img: item.img,
      skill: e.skill, dv: e.repair.dv, minutes: e.repair.minutes, materials: 0, data: { owner: owner.uuid, item: itemId }
    });
    await this._put(worker, project);
    return this.work(worker, project.id, minutes, { event });
  },

  /* ---------------------------------------- */
  /*  Working on it                           */
  /* ---------------------------------------- */

  /** How much time "check", "all" or a number of minutes comes to, within the downtime left. */
  _amount(actor, p, minutes) {
    let m = minutes === "check" ? needed(p) : minutes === "all" ? remaining(p) : Math.floor(Number(minutes) || 0);
    const st = Downtime.state(actor);
    if (st.active && st.source === "hub") m = Math.min(m, st.left);
    return Math.max(0, m);
  },

  /**
   * Put time into a project from the worker's downtime: up to the halfway mark, the check there,
   * and (once it's passed) the rest. A failed check starts it over and takes no more time.
   * @param {"check"|"all"|number} minutes
   */
  async work(actor, id, minutes = "all", { event = null } = {}) {
    DowntimeOps._ready(actor);
    let p = this.get(actor, id);
    if (!p) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    if (p.kind === "repair") Downtime.check(actor, "maintenance");
    // Maker work is downtime work; a repair is when the GM keeps repairs to downtime
    const strict = p.kind !== "repair" || Downtime.gated("maintenance");
    const st = stage(p);
    if (strict && (st === "build" || st === "finish") && minutes !== 0) {
      // an amount the player picked can't be more than their downtime left ("all" and "check" take
      // what there is); and there has to be some
      const asked = typeof minutes === "number" ? Math.min(Math.floor(minutes), remaining(p)) : 0;
      Downtime.require(actor, asked);
      if (this._amount(actor, p, minutes) <= 0) throw new RuleBlock(L("NEONHOME.Project.NoTime"));
    }
    const amount = this._amount(actor, p, minutes);
    const { before, after } = plan(p, amount);
    if (before) {
      await Downtime.spend(actor, before, { label: p.label, data: { project: p.id, kind: p.kind }, strict });
      p = { ...p, done: p.done + before };
      await this._put(actor, p);
    }
    if (stage(p) === "check") {
      const res = await this.roll(actor, p.id, { event });
      if (!res?.ok) return res;
      p = this.get(actor, p.id);
    }
    if (after && stage(p) === "finish") {
      await Downtime.spend(actor, after, { label: p.label, data: { project: p.id, kind: p.kind }, strict });
      p = { ...p, done: Math.min(p.minutes, p.done + after) };
      await this._put(actor, p);
    }
    if (stage(p) === "done") return this._complete(actor, p);
    return { ok: true, project: p };
  },

  /**
   * The halfway check. Pass: the rest of the time can go in. Fail: the worker realizes they have to
   * start over; the meter empties, the materials are fine. A cancelled roll leaves it due.
   */
  async roll(actor, id, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const p = this.get(actor, id);
    if (!p || stage(p) !== "check") return null;
    const mods = [];
    const rank = p.ability ? CPR.abilityRank(actor, p.ability) : 0;
    if (rank) mods.push({ value: rank, source: p.ability });
    // a repair isn't Maker work: a Tech adds Field Expertise (p.147)
    if (p.kind === "repair") {
      const fe = fieldExpertise(actor.items.map((i) => i.toObject()));
      if (fe) mods.push({ value: fe, source: L("NEONHOME.Maint.FieldExpertise") });
    }
    const res = await CPR.skillCheck(actor, p.skill, { event, mods });
    if (!res) return null;
    const ok = res.total >= p.dv;
    if (ok) await this._put(actor, { ...p, check: "passed" });
    else await this._put(actor, { ...p, done: 0, check: null, restarts: p.restarts + 1 });
    await DowntimeOps._post(actor, res.html, {
      icon: KIND[p.kind].icon,
      title: p.label,
      dv: p.dv,
      total: res.total,
      ok,
      verdict: L(`NEONHOME.Project.Check.${ok ? "ok" : "fail"}`, { name: esc(actor.name), label: esc(p.label), left: formatMinutes(p.minutes - halfway(p)), lost: formatMinutes(p.done) })
    });
    return { ok, total: res.total };
  },

  /** The meter's full: make the item, apply the upgrade, write up the invention, or fix the item. */
  async _complete(actor, p) {
    await this._drop(actor, p.id);
    let verdict = "";
    switch (p.kind) {
      case "fabricate": {
        const data = foundry.utils.deepClone(p.data.item ?? {});
        if (data.system?.equipped) data.system.equipped = "owned";
        await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
        verdict = L("NEONHOME.Project.Done.fabricate", { name: esc(actor.name), item: esc(data.name) });
        break;
      }
      case "upgrade": {
        const item = actor.items.get(p.data.item);
        if (item) await item.update({ ...DowntimeOps._upgradeChanges(item, UPGRADES[p.data.upgrade]?.apply), [`flags.${MODULE_ID}.makerUpgrade`]: p.data.upgrade });
        verdict = L(`NEONHOME.Project.Done.${UPGRADES[p.data.upgrade]?.apply ? "upgrade" : "upgradeNoted"}`, { name: esc(actor.name), item: esc(item?.name ?? "") });
        break;
      }
      case "invent": {
        // the design, as a blueprint the character keeps (and can sell or hand over)
        const data = blueprintData(p, actor);
        await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
        verdict = `${L("NEONHOME.Project.Done.invent", { name: esc(actor.name), category: L(`NEONHOME.Maint.Price.${p.data.category}`), blueprint: esc(data.name) })}<br><em>${esc(p.data.text)}</em>`;
        break;
      }
      case "repair": {
        const owner = await fromUuid(p.data.owner);
        const item = owner?.items?.get(p.data.item);
        if (owner && item) await DowntimeOps._patient(actor, owner, { op: "repair", item: item.id });
        verdict = L("NEONHOME.Project.Done.repair", { name: esc(actor.name), item: esc(item?.name ?? "") });
        break;
      }
    }
    await ChatMessage.create({ content: HomeOps._card(KIND[p.kind].icon, verdict), speaker: ChatMessage.getSpeaker({ actor }) });
    return { ok: true, done: true, project: { ...p, done: p.minutes } };
  },

  /** Give up on a project (the time and materials already spent stay spent). */
  async abandon(actor, id) {
    const p = this.get(actor, id);
    if (!p) return;
    await this._drop(actor, id);
    await ChatMessage.create({
      content: HomeOps._card(KIND[p.kind].icon, L("NEONHOME.Project.Abandoned", { name: esc(actor.name), label: esc(p.label) })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /** For display: each kind's icon. */
  icon(kind) {
    return KIND[kind]?.icon ?? "fa-solid fa-hammer";
  }
};
