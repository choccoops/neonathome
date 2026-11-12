import { MODULE_ID, SYSTEM_ID, NEON_HUB_ID } from "../constants.js";
import { CPR } from "../cpr.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { Downtime } from "./downtime.js";
import { DowntimeOps } from "./downtime-ops.js";
import { PerkOps } from "./perk-ops.js";
import { MaintOps } from "./maint-ops.js";
import { MIN } from "../data/downtime.js";
import { PRICE_CATEGORIES, priceCategory } from "../data/maintenance.js";
import {
  TEACHERS, crewTeacher, trainingWeek, applyProgress, levelCost, PHYSICAL, ACADEMIC, NCU, PUSH_DV,
  SOURCING_DV, SOURCERS, canReach, ART, artJob, BODYSCULPT, BODYSCULPT_MINUTES, BODYSCULPT_FAIL_MINUTES,
  HEALTH_PLANS, MARKET_FIND, stockMarket, maxHumanity, borgwareBy
} from "../data/living.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** Actor flags: Training Progress by skill name; NCU enrollment and terms; the health plan. */
export const TRAINING_FLAG = "training";
export const NCU_FLAG = "ncu";
export const PLAN_FLAG = "healthPlan";
/** ActiveEffect flag: 2070's corrections to Maximum Humanity. */
export const MAXHUM_FLAG = "maxHumanity";

/** A skill item's category and whether it's a Skill (×2). */
const skillInfo = (skill) => ({
  level: Number(skill?.system?.level) || 0,
  double: skill?.system?.difficulty === "difficult",
  category: String(skill?.system?.category ?? ""),
  name: skill?.name ?? ""
});

/**
 * Downtime from Cyberpunk: The Unification Era beyond the corebook's: training a Skill with a
 * teacher (Chapter 15), sourcing an item (Chapter 12), making art (Chapter 13), bodysculpting
 * (Chapter 08), and finding a Night Market (Chapter 17).
 */
export const LifeOps = {
  /* ---------------------------------------- */
  /*  Training                                */
  /* ---------------------------------------- */

  /** Training Progress banked toward each Skill's next level: { [skill name]: progress }. */
  progress(actor) {
    const raw = actor?.getFlag?.(MODULE_ID, TRAINING_FLAG);
    return raw && typeof raw === "object" ? { ...raw } : {};
  },

  ncu(actor) {
    const raw = actor?.getFlag?.(MODULE_ID, NCU_FLAG);
    return { enrolled: !!raw?.enrolled, weeks: Number(raw?.weeks) || 0 };
  },

  /** The teacher's terms: a TEACHERS row, or a crewmate's by their level in the Skill. */
  teacher(key, { crewmate = null, skillName = "" } = {}) {
    if (key !== "crewmate") return TEACHERS[key] ?? null;
    const mate = game.actors?.get?.(crewmate);
    const lvl = Number(CPR.skill(mate, skillName)?.system?.level) || 0;
    return mate ? crewTeacher(lvl) : null;
  },

  /**
   * A week of training (or a side-rate week alongside other downtime): the teacher's progress, a
   * Skill Chip's +5, Elementary's +2 for its focus, Push Training; the cost; and the level, once
   * the progress reaches it (one level at a time, the rest carries).
   * @param {object} p - { skill: item id, teacher, crewmate, chip, focus, push }
   */
  async train(actor, { skill: skillId, teacher = "street", crewmate = null, chip = false, focus = false, push = false } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const skill = actor.items.get(skillId);
    if (!skill || skill.type !== "skill") throw new RuleBlock(L("NEONHOME.Train.PickSkill"));
    const s = skillInfo(skill);
    const t = this.teacher(teacher, { crewmate, skillName: s.name });
    if (!t) throw new RuleBlock(L("NEONHOME.Train.NoTeacher"));
    const mate = t.crew ? game.actors.get(crewmate) : null;
    if (mate === actor) throw new RuleBlock(L("NEONHOME.Train.NotYourself"));
    const elementary = !!focus && PerkOps.record(actor).owned.some((o) => o.id === "elementary") && ACADEMIC.includes(s.category);
    const check = trainingWeek(t, { level: s.level, double: s.double, academic: ACADEMIC.includes(s.category), chip, elementary });
    if (!check.ok) throw new RuleBlock(L(`NEONHOME.Train.Why.${check.why}`, { skill: s.name, max: t.max }));
    // NCU: enrolled, and a term's fee every four weeks
    const ncu = this.ncu(actor);
    let fee = t.eb;
    if (teacher === "ncu") {
      if (!ncu.enrolled) throw new RuleBlock(L("NEONHOME.Train.NotEnrolled"));
      fee = ncu.weeks % NCU.termWeeks === 0 ? t.term : 0;
    }
    DowntimeOps._canAfford(actor, fee);
    const minutes = t.side ? 0 : MIN.week;
    if (minutes) Downtime.require(actor, minutes);
    if (mate) {
      if (!mate.isOwner) throw new RuleBlock(L("NEONHOME.Salvage.NotYours", { name: mate.name }));
      Downtime.require(mate, MIN.week);
    }
    // Push Training: DV15 Endurance for a physical Skill, Concentration for anything else
    let pushed = null;
    let html = "";
    if (push) {
      const res = await CPR.skillCheck(actor, PHYSICAL.includes(s.category) ? "Endurance" : "Concentration", { event, stat: "will" });
      if (!res) return null;
      html = res.html;
      pushed = res.critFail ? "implode" : res.total >= PUSH_DV ? "ok" : "fail";
    }
    const week = trainingWeek(t, { level: s.level, double: s.double, academic: true, chip, elementary, push: pushed });
    const label = L("NEONHOME.Train.Label", { skill: s.name });
    if (minutes) await Downtime.spend(actor, minutes, { label, data: { action: "train", skill: s.name } });
    if (mate) await Downtime.spend(mate, MIN.week, { label: L("NEONHOME.Train.Teaching", { name: actor.name, skill: s.name }), data: { action: "teach" } });
    if (fee) await DowntimeOps._pay(actor, fee, label);
    if (teacher === "ncu") await actor.setFlag(MODULE_ID, NCU_FLAG, { enrolled: true, weeks: ncu.weeks + 1 });
    if (pushed === "implode" && PHYSICAL.includes(s.category)) {
      const dmg = await new Roll("2d6").evaluate();
      const hp = CPR.hp(actor);
      await actor.update({ "system.derivedStats.hp.value": Math.max(0, hp.value - dmg.total) });
    }
    const banked = (this.progress(actor)[s.name] ?? 0) + week.progress;
    const after = applyProgress(s.level, banked, s.double);
    if (after.up) await skill.update({ "system.level": after.level });
    await actor.update({ [`flags.${MODULE_ID}.${TRAINING_FLAG}.${s.name}`]: after.progress });
    const pushText = pushed ? ` ${L(`NEONHOME.Train.Push.${pushed}`)}` : "";
    await ChatMessage.create({
      content: `${html}${HomeOps._card("fa-solid fa-graduation-cap", L(after.up ? "NEONHOME.Train.LevelUp" : "NEONHOME.Train.Card", {
        name: esc(actor.name), skill: esc(s.name), n: week.progress, have: after.progress, need: levelCost(Math.min(10, after.level + 1), s.double), level: after.level, teacher: esc(L(`NEONHOME.Train.Teacher.${teacher}`))
      }) + pushText)}`,
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { progress: week.progress, level: after.level, banked: after.progress, up: after.up };
  },

  /** NCU enrollment: a DV13 Bureaucracy Check, or a 1,500eb donation to skip it. */
  async enroll(actor, { donate = false } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    if (this.ncu(actor).enrolled) return { ok: true };
    let ok = false;
    let html = "";
    let total = null;
    if (donate) {
      await DowntimeOps._pay(actor, NCU.donation, L("NEONHOME.Train.Donation"));
      ok = true;
    } else {
      const res = await CPR.skillCheck(actor, "Bureaucracy", { event, stat: "int" });
      if (!res) return null;
      html = res.html;
      total = res.total;
      ok = res.total >= NCU.enrollDv;
    }
    if (ok) await actor.setFlag(MODULE_ID, NCU_FLAG, { enrolled: true, weeks: 0 });
    await DowntimeOps._post(actor, html, {
      icon: "fa-solid fa-building-columns", title: L("NEONHOME.Train.Enroll"), dv: donate ? null : NCU.enrollDv, total, ok,
      verdict: L(`NEONHOME.Train.Enrolled.${ok ? (donate ? "donated" : "ok") : "fail"}`, { name: esc(actor.name) })
    });
    return { ok };
  },

  /** Top off a Skill with IP: pay the gap between its progress and the next level. */
  async topOff(actor, skillId) {
    const skill = actor.items.get(skillId);
    if (!skill) throw new RuleBlock(L("NEONHOME.Train.PickSkill"));
    const s = skillInfo(skill);
    if (s.level >= 10) return null;
    const have = this.progress(actor)[s.name] ?? 0;
    const gap = Math.max(0, levelCost(s.level + 1, s.double) - have);
    const ip = Number(foundry.utils.getProperty(actor, "system.improvementPoints.value")) || 0;
    if (ip < gap) throw new RuleBlock(L("NEONHOME.Train.NoIp", { name: actor.name, n: gap }));
    await actor.update({ "system.improvementPoints.value": ip - gap, [`flags.${MODULE_ID}.${TRAINING_FLAG}.${s.name}`]: 0 });
    await skill.update({ "system.level": s.level + 1 });
    await ChatMessage.create({ content: HomeOps._card("fa-solid fa-graduation-cap", L("NEONHOME.Train.ToppedOff", { name: esc(actor.name), skill: esc(s.name), n: gap, level: s.level + 1 })), speaker: ChatMessage.getSpeaker({ actor }) });
    return { level: s.level + 1, spent: gap };
  },

  /* ---------------------------------------- */
  /*  Sourcing                                */
  /* ---------------------------------------- */

  /** The Roles a character can source with, and their Ranks. */
  sourcers(actor) {
    const roles = CPR.roles(actor);
    return Object.keys(SOURCERS).filter((r) => roles[r] !== undefined).map((r) => ({ role: r, rank: roles[r] }));
  },

  /**
   * Source an item (Self Sourcing): a week. Fixers, Netrunners (their goods) and Nomads (vehicles)
   * at market; Media and Rockerboys pass a Check at the Sourcing DV and pay double.
   * @param {object} p - { item: uuid, role }
   */
  async source(actor, { item: uuid, role = null } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const doc = uuid ? await fromUuid(uuid) : null;
    if (!doc || doc.documentName !== "Item") throw new RuleBlock(L("NEONHOME.Downtime.DropItem"));
    const can = this.sourcers(actor);
    const who = can.find((c) => c.role === role) ?? can[0];
    if (!who) throw new RuleBlock(L("NEONHOME.Source.NoRole", { name: actor.name }));
    const s = SOURCERS[who.role];
    if (s.goods && !s.goods.includes(doc.type)) throw new RuleBlock(L(`NEONHOME.Source.Goods.${who.role}`));
    const price = Number(doc.system?.price?.market) || 0;
    const category = PRICE_CATEGORIES[Math.max(0, priceCategory(price))].key;
    if (!SOURCING_DV[category]) throw new RuleBlock(L("NEONHOME.Source.OffTheShelf", { item: doc.name }));
    if (!canReach(who.role, who.rank, category)) throw new RuleBlock(L("NEONHOME.Source.OutOfReach", { name: actor.name, item: doc.name, category: L(`NEONHOME.Maint.Price.${category}`) }));
    const cost = price * s.mult;
    DowntimeOps._canAfford(actor, cost);
    const label = L("NEONHOME.Source.Label", { item: doc.name });
    let ok = true;
    let res = null;
    if (s.check) {
      // Media: Streetwise or Library Search; Rockerboy: Charismatic Impact (COOL + its rank)
      res = await DowntimeOps._timedRoll(actor, MIN.week, label, { action: "source", item: doc.name }, () => (who.role === "rockerboy"
        ? CPR.skillCheck(actor, "__Charismatic Impact", { event, stat: "cool", mods: [{ value: who.rank, source: "Charismatic Impact" }] })
        : CPR.skillCheck(actor, (CPR.skill(actor, "Library Search")?.system?.level ?? 0) > (CPR.skill(actor, "Streetwise")?.system?.level ?? 0) ? "Library Search" : "Streetwise", { event, stat: "int" })));
      if (!res) return null;
      ok = res.total >= SOURCING_DV[category];
    } else {
      await Downtime.spend(actor, MIN.week, { label, data: { action: "source", item: doc.name } });
    }
    if (ok) {
      await DowntimeOps._pay(actor, cost, label);
      const data = doc.toObject();
      for (const k of ["_id", "folder", "sort", "ownership", "_stats"]) delete data[k];
      if (data.system?.equipped) data.system.equipped = "owned";
      await actor.createEmbeddedDocuments("Item", [data], { [MODULE_ID]: { checked: true } });
    }
    await DowntimeOps._post(actor, res?.html ?? "", {
      icon: "fa-solid fa-truck-ramp-box", title: label, dv: s.check ? SOURCING_DV[category] : null, total: res?.total ?? null, ok,
      verdict: L(`NEONHOME.Source.${ok ? "ok" : "fail"}`, { name: esc(actor.name), item: esc(doc.name), eb: eb(cost) }) + (who.role === "fixer" ? ` <small>${L("NEONHOME.Source.Haggle")}</small>` : "")
    });
    return { ok, cost: ok ? cost : 0 };
  },

  /* ---------------------------------------- */
  /*  Art                                     */
  /* ---------------------------------------- */

  /**
   * Make art: the materials and the time, then the roll. A good piece is an Artwork item that adds
   * Humanity every month on an AR Art Display.
   * @param {object} p - { skill, quality, value (Super Luxury), title }
   */
  async art(actor, { skill = "Paint/Draw/Sculpt", quality = "premium", value = 0, title = "" } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const q = ART[quality] ? quality : "premium";
    const job = artJob(q, value);
    Downtime.require(actor, job.minutes);
    DowntimeOps._canAfford(actor, job.eb);
    const name = String(title ?? "").trim().slice(0, 100) || L("NEONHOME.Art.Untitled");
    const label = L("NEONHOME.Art.Label", { title: name });
    const res = await DowntimeOps._timedRoll(actor, job.minutes, label, { action: "art", quality: q }, () => CPR.skillCheck(actor, skill, { event, stat: "emp" }));
    if (!res) return null;
    await DowntimeOps._pay(actor, job.eb, label);
    const ok = res.total >= job.dv;
    if (ok) {
      await actor.createEmbeddedDocuments("Item", [{
        name: L("NEONHOME.Art.Item", { title: name }),
        type: "gear",
        img: "icons/svg/sun.svg",
        system: {
          description: { value: `<p>${esc(L("NEONHOME.Art.About", { quality: L(`NEONHOME.Maint.Price.${q}`), name: actor.name, skill, n: job.humanity }))}</p>` },
          price: { market: job.eb },
          amount: 1,
          equipped: "owned"
        },
        flags: { [MODULE_ID]: { art: { quality: q, humanity: job.humanity, skill, artist: actor.name } } }
      }], { [MODULE_ID]: { checked: true } });
    }
    await DowntimeOps._post(actor, res.html, {
      icon: "fa-solid fa-palette", title: label, dv: job.dv, total: res.total, ok,
      verdict: L(`NEONHOME.Art.${ok ? "ok" : "fail"}`, { name: esc(actor.name), title: esc(name), n: job.humanity })
    });
    return { ok, humanity: ok ? job.humanity : 0 };
  },

  /* ---------------------------------------- */
  /*  Bodysculpting                           */
  /* ---------------------------------------- */

  /**
   * A Medtech bodysculpts a patient (not themselves): Surgery DV15 (standard) or DV17 (exotic), the
   * materials, 4 hours. A failure wastes the materials and 2 hours. Exotic costs the patient 4d6
   * Humanity.
   * @param {object} p - { patient: an actor id, kind: standard|exotic, look }
   */
  async bodysculpt(actor, { patient, kind = "standard", look = "" } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    DowntimeOps._requireRole(actor, "medtech");
    const b = BODYSCULPT[kind] ?? BODYSCULPT.standard;
    const who = game.actors.get(patient);
    if (!who) throw new RuleBlock(L("NEONHOME.Downtime.PickPatient"));
    if (who === actor) throw new RuleBlock(L("NEONHOME.Sculpt.NotYourself"));
    if (!CPR.abilityRank(actor, "Surgery Skill")) throw new RuleBlock(L("NEONHOME.Downtime.NeedsSurgery", { name: actor.name }));
    Downtime.require(actor, BODYSCULPT_MINUTES);
    DowntimeOps._canAfford(actor, b.materials);
    const res = await DowntimeOps._abilityCheck(actor, "Surgery Skill", L("NEONHOME.Downtime.Surgery"), event);
    if (!res) return null;
    const ok = res.total >= b.dv;
    const label = L(`NEONHOME.Sculpt.Label.${kind}`, { patient: who.name });
    await Downtime.spend(actor, ok ? BODYSCULPT_MINUTES : BODYSCULPT_FAIL_MINUTES, { label, data: { action: "bodysculpt", patient: who.uuid } });
    await DowntimeOps._pay(actor, b.materials, label);
    let lost = 0;
    const rolls = [];
    if (ok && b.hl) {
      const hl = await new Roll(b.hl).evaluate();
      rolls.push(hl);
      lost = hl.total;
      await DowntimeOps._patient(actor, who, { op: "humanityLoss", amount: lost, reason: label });
    }
    await DowntimeOps._post(actor, res.html, {
      icon: "fa-solid fa-user-pen", title: label, dv: b.dv, total: res.total, ok,
      verdict: L(`NEONHOME.Sculpt.${ok ? "ok" : "fail"}`, { name: esc(actor.name), patient: esc(who.name), look: esc(look || L("NEONHOME.Sculpt.NewLook")), n: lost })
    });
    return { ok, lost };
  },

  /* ---------------------------------------- */
  /*  Health plans                            */
  /* ---------------------------------------- */

  plan(actor) {
    const p = actor?.getFlag?.(MODULE_ID, PLAN_FLAG);
    return HEALTH_PLANS[p] ? p : null;
  },

  async setPlan(actor, plan) {
    if (!HEALTH_PLANS[plan]) return actor.unsetFlag(MODULE_ID, PLAN_FLAG);
    return actor.setFlag(MODULE_ID, PLAN_FLAG, plan);
  },

  /** Call your plan: how many Rounds until they land (REO races Trauma Team on a 1d12). */
  async callPlan(actor) {
    const key = this.plan(actor);
    const p = HEALTH_PLANS[key];
    if (!p?.arrives) throw new RuleBlock(L("NEONHOME.Plan.NoCall", { name: actor.name }));
    const roll = await new Roll(p.arrives).evaluate();
    const rolls = [roll];
    let reo = null;
    if (key === "ttSilver" || key === "ttExecutive") {
      reo = await new Roll("1d12").evaluate();
      rolls.push(reo);
    }
    const beat = reo && reo.total < roll.total;
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-truck-medical", L("NEONHOME.Plan.Called", { name: esc(actor.name), plan: L(`NEONHOME.Plan.Name.${key}`), n: roll.total })
        + (beat ? ` ${L("NEONHOME.Plan.ReoFirst", { n: reo.total })}` : "")),
      rolls,
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { rounds: roll.total, reo: beat ? reo.total : null };
  },

  /* ---------------------------------------- */
  /*  Maximum Humanity                        */
  /* ---------------------------------------- */

  /** 2070's Maximum Humanity for a character: { max, cpr, adjust, lines }. */
  maxHumanity(actor) {
    const read = (i) => ({ name: i.name, hub: !!i.flags?.[NEON_HUB_ID]?.countsAsBorgware, text: String(i.system?.description?.value ?? "") });
    const chrome = actor.items.filter((i) => i.type === "cyberware" && (i.system?.isInstalledInActor ?? i.system?.isInstalled)).map((i) => {
      // What's installed in the piece: an Operating System or Enhancement can make it count as Borgware.
      const upgrades = (i.system?.installedItems?.list ?? []).map((id) => actor.items.get(id)).filter((u) => u?.type === "itemUpgrade").map(read);
      const by = borgwareBy({ ...read(i), flag: !!i.getFlag?.(MODULE_ID, "countsAsBorgware") }, upgrades);
      return {
        name: i.name,
        borgware: i.system?.type === "borgware",
        hl: Number.parseInt(i.system?.humanityLoss?.static, 10) || 0,
        countsAsBorgware: !!by,
        borgwareBy: by
      };
    });
    const emp = Number(foundry.utils.getProperty(actor, "system.stats.emp.max")) || 0;
    return maxHumanity(chrome, { emp, freshFood: MaintOps.lifestyle(actor).tier >= 4 });
  },

  /**
   * Keep 2070's corrections to Maximum Humanity on the character as an effect Cyberpunk RED adds in
   * (bonuses.maxHumanity), and have it work the maximum out again.
   */
  async syncMaxHumanity(actor) {
    if (!actor?.isOwner || actor.type !== "character") return;
    const { adjust } = this.maxHumanity(actor);
    const existing = actor.effects.find((e) => e.getFlag?.(MODULE_ID, MAXHUM_FLAG));
    const current = Number(existing?.changes?.[0]?.value) || 0;
    if (!adjust && existing) await existing.delete();
    else if (adjust && !existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: L("NEONHOME.MaxHumanity.EffectName"),
        img: "icons/svg/heal.svg",
        changes: [{ key: "bonuses.maxHumanity", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(adjust) }],
        flags: { [MODULE_ID]: { [MAXHUM_FLAG]: true }, [SYSTEM_ID]: { changes: { cats: { 0: "combat" } } } }
      }]);
    } else if (adjust && current !== adjust) await existing.update({ changes: [{ key: "bonuses.maxHumanity", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(adjust) }] });
    else return;
    if (typeof actor.setMaxHumanity === "function") await actor.setMaxHumanity();
  },

  /* ---------------------------------------- */
  /*  Night Markets                           */
  /* ---------------------------------------- */

  /** What's on the shelves: a card listing the two categories and their items. */
  async _stock(actor, pick = null) {
    // many small rolls (rerolling repeats): Foundry's dice randomizer, without a roll card each
    const rand = () => (typeof globalThis.CONFIG?.Dice?.randomUniform === "function" ? globalThis.CONFIG.Dice.randomUniform() : Math.random());
    const die = (sides) => () => Math.max(1, Math.ceil(rand() * sides));
    const stock = stockMarket(die(6), die(10), pick);
    const body = stock.map((c) => `<p><b>${L(`NEONHOME.Market.Category.${c.category}`)}</b></p><ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("");
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-store", `${L("NEONHOME.Market.Shelves")}${body}<p><small>${L("NEONHOME.Market.Rules")}</small></p>`),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return stock;
  },

  /**
   * Hear of a Night Market: Streetwise DV13 or Trading DV15, a day asking around. Found: what's on
   * the shelves.
   * @param {object} p - { skill: Streetwise|Trading }
   */
  async market(actor, { skill = "Streetwise" } = {}, { event = null } = {}) {
    DowntimeOps._ready(actor);
    const sk = MARKET_FIND[skill] ? skill : "Streetwise";
    const label = L("NEONHOME.Downtime.Action.market");
    const res = await DowntimeOps._timedRoll(actor, MIN.day, label, { action: "market" }, () => CPR.skillCheck(actor, sk, { event, stat: "cool" }));
    if (!res) return null;
    const ok = res.total >= MARKET_FIND[sk];
    await DowntimeOps._post(actor, res.html, {
      icon: "fa-solid fa-store", title: label, dv: MARKET_FIND[sk], total: res.total, ok,
      verdict: L(`NEONHOME.Market.${ok ? "found" : "missed"}`, { name: esc(actor.name) })
    });
    const stock = ok ? await this._stock(actor) : null;
    return { ok, stock };
  }
};

