import { MODULE_ID, SYSTEM_ID } from "../constants.js";
import { HomeSocket } from "../socket.js";
import { CPR } from "../cpr.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { MaintOps } from "./maint-ops.js";
import { Downtime, formatMinutes } from "./downtime.js";
import { KINDS, kindOf } from "../data/maintenance.js";
import {
  MIN, hustle, PHARMA, PHARMA_DV, PHARMA_MATERIALS, THERAPY, RUMORS, believability, TREATMENT_MINUTES, treatments,
  NIGHT_MARKET_RANK
} from "../data/downtime.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** The skill an item is worked on with (its maintenance kind's repair skill). */
export const workSkill = (item, moduleId = MODULE_ID) => KINDS[kindOf(item, moduleId)]?.skill ?? "Basic Tech";

/**
 * Downtime actions: spend a character's downtime (Neon Hub's credits) on what the core rulebook
 * lets them do with it. Every action: in downtime (players), the time spent first (given back if the
 * roll is cancelled), Cyberpunk RED's own roll, the result applied, a card in chat.
 */
export const DowntimeOps = {
  init() {
    HomeSocket.register("downtimePatient", (payload, user) => this._gmPatient(payload, user));
    HomeSocket.register("downtimePatientWeek", (payload, user) => this._gmPatientWeek(payload, user));
  },

  /**
   * Players act in downtime. Every action's time is spent from the character's downtime (with Neon
   * Hub, their share of its call), so the GM needs the character in it too.
   */
  _ready(actor) {
    if (!game.user.isGM && !Downtime.isActive(actor)) throw new RuleBlock(L("NEONHOME.Downtime.Only.actions"));
  },

  /** Take the eb, or say it's not there. */
  async _pay(actor, amount, reason) {
    if (!amount) return;
    if (CPR.wealth(actor) < amount) throw new RuleBlock(L("NEONHOME.Downtime.NoEb", { name: actor.name, eb: eb(amount) }));
    await CPR.changeWealth(actor, -amount, reason);
  },

  _canAfford(actor, amount) {
    if (amount && CPR.wealth(actor) < amount) throw new RuleBlock(L("NEONHOME.Downtime.NoEb", { name: actor.name, eb: eb(amount) }));
  },

  /** Spend the time, roll, and give the time back if the roll was called off. */
  async _timedRoll(actor, minutes, label, data, roll) {
    const spent = await Downtime.spend(actor, minutes, { label, data });
    let res;
    try {
      res = await roll();
    } catch (err) {
      await Downtime.refund(spent);
      throw err;
    }
    if (!res) await Downtime.refund(spent);
    return res;
  },

  /** A TECH roll with a role sub-ability's rank as the skill (a Medtech's Surgery or Medical Tech). */
  _abilityCheck(actor, ability, label, event) {
    return CPR.skillCheck(actor, `__${ability}`, { event, stat: "tech", mods: [{ value: CPR.abilityRank(actor, ability), source: label }] });
  },

  /** A chat card with the roll and what came of it. */
  _post(actor, html, { icon, title, dv = null, total = null, ok, verdict }) {
    if (dv === null) {
      return ChatMessage.create({
        content: `${html ?? ""}<div class="neon-home-chat nah-maint-verdict ${ok ? "is-ok" : "is-fail"}"><header><i class="${icon}"></i> ${title}</header><p>${verdict}</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    }
    return MaintOps._post(actor, html, { icon, title, dv, total, ok, verdict });
  },

  /**
   * Do a downtime action.
   * @param {string} id - hustle, rest, treat, pharma, therapy, rumor, story, nightMarket (Maker work and
   *   repairs are projects: ProjectOps)
   * @param {object} p - the action's choices (see each)
   */
  async perform(actor, id, p = {}, { event = null } = {}) {
    this._ready(actor);
    const fn = this[`_${id}`];
    if (typeof fn !== "function") throw new Error(`Unknown downtime action: ${id}`);
    return fn.call(this, actor, p, event);
  },

  /* ---------------------------------------- */
  /*  Anyone                                  */
  /* ---------------------------------------- */

  /** The Hustle (p.381): a week, 1d6 on the Role's table, paid by Role Ability Rank. */
  async _hustle(actor, { role } = {}) {
    const roles = CPR.roles(actor);
    const key = roles[role] !== undefined ? role : Object.keys(roles)[0];
    if (!key) throw new RuleBlock(L("NEONHOME.Downtime.NoRole", { name: actor.name }));
    const rank = roles[key];
    const label = L("NEONHOME.Downtime.Action.hustle");
    const spent = await Downtime.spend(actor, MIN.week, { label, data: { action: "hustle", role: key } });
    const roll = await new Roll("1d6").evaluate();
    const res = hustle(key, roll.total, rank);
    if (res.eb) await CPR.changeWealth(actor, res.eb, L("NEONHOME.Downtime.HustleLedger", { role: L(`NEONHOME.Downtime.Role.${key}`) }));
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-sack-dollar", L("NEONHOME.Downtime.HustleCard", {
        name: esc(actor.name), role: L(`NEONHOME.Downtime.Role.${key}`), roll: roll.total, text: esc(res.text), eb: eb(res.eb)
      })),
      rolls: [roll],
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { ...res, roll: roll.total, spent };
  },

  /** Rest (p.222): a full day of rest heals BODY HP. */
  async _rest(actor, { days = 1 } = {}) {
    const d = Math.max(1, Math.floor(Number(days) || 1));
    await Downtime.spend(actor, d * MIN.day, { label: L("NEONHOME.Downtime.Action.rest"), data: { action: "rest", days: d } });
    const body = Number(foundry.utils.getProperty(actor, "system.stats.body.value")) || 0;
    const hp = CPR.hp(actor);
    const healed = Math.min(hp.max - hp.value, body * d);
    if (healed > 0) await actor.update({ "system.derivedStats.hp.value": hp.value + healed });
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-bed", L("NEONHOME.Downtime.RestCard", { name: esc(actor.name), days: d, hp: healed })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { healed };
  },

  /**
   * Treat a critical injury (pp.222-223): four hours, the injury's skill and DV (Cybertech on a
   * cyberlimb). Not on yourself, except a Quick Fix. Success: the injury is gone.
   */
  async _treat(actor, { patient, injury, option = 0 } = {}, event) {
    const who = game.actors.get(patient) ?? actor;
    const hurt = who.items.get(injury);
    if (!hurt || hurt.type !== "criticalInjury") throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    const quick = hurt.system?.treatment?.type === "quickFix";
    if (who === actor && !quick) throw new RuleBlock(L("NEONHOME.Downtime.NotYourself"));
    const opts = treatments(hurt, { cyber: !!hurt.getFlag(MODULE_ID, "cybertech") });
    const o = opts[Math.floor(Number(option) || 0)] ?? opts[0];
    if (!o) throw new RuleBlock(L("NEONHOME.Downtime.NoTreatment", { injury: hurt.name }));
    if (o.ability && !CPR.abilityRank(actor, "Surgery Skill")) throw new RuleBlock(L("NEONHOME.Downtime.NeedsSurgery", { name: actor.name }));
    const label = L("NEONHOME.Downtime.TreatLabel", { injury: hurt.name, patient: who.name });
    const res = await this._timedRoll(actor, quick ? 1 : TREATMENT_MINUTES, label, { action: "treat", injury: hurt.uuid }, () => (o.ability
      ? this._abilityCheck(actor, "Surgery Skill", L("NEONHOME.Downtime.Surgery"), event)
      : CPR.skillCheck(actor, o.skill, { event })));
    if (!res) return null;
    const ok = res.total >= o.dv;
    if (ok) await this._patient(actor, who, { op: "deleteInjury", injury: hurt.id });
    await this._post(actor, res.html, {
      icon: "fa-solid fa-kit-medical", title: label, dv: o.dv, total: res.total, ok,
      verdict: L(`NEONHOME.Downtime.Treat.${ok ? "ok" : "fail"}`, { name: esc(actor.name), patient: esc(who.name), injury: esc(hurt.name) })
    });
    return { ok };
  },

  /* ---------------------------------------- */
  /*  Roles                                   */
  /* ---------------------------------------- */

  _requireRole(actor, role) {
    if (CPR.roles(actor)[role] === undefined) throw new RuleBlock(L("NEONHOME.Downtime.NeedsRole", { name: actor.name, role: L(`NEONHOME.Downtime.Role.${role}`) }));
  },

  /**
   * The item changes an Upgrade Expertise upgrade makes (Maker work is a project: see
   * project-ops.js): an option slot, concealable, Excellent Quality, +1 SP.
   */
  _upgradeChanges(item, apply) {
    const s = item.system ?? {};
    switch (apply) {
      case "slot":
        return s.installedItems ? { "system.installedItems.slots": (Number(s.installedItems.slots) || 0) + 1 } : {};
      case "conceal":
        return s.concealable ? { "system.concealable.concealable": true } : {};
      case "quality":
        return s.quality !== undefined ? { "system.quality": "excellent" } : {};
      case "sp": {
        const out = {};
        for (const loc of ["bodyLocation", "headLocation"]) if (Number(s[loc]?.sp) > 0) out[`system.${loc}.sp`] = Number(s[loc].sp) + 1;
        return out;
      }
      default:
        return {};
    }
  },

  /* ---------------------------------------- */
  /*  Medtech: Medicine (pp.149-150, 229-230) */
  /* ---------------------------------------- */

  /**
   * Synthesize Pharmaceuticals: an hour, DV13 Medical Tech, 200eb of materials (lost on a failure)
   * for as many doses as the Medtech's Medical Tech Skill.
   * @param {object} p - { drug: a key of PHARMA }
   */
  async _pharma(actor, { drug = "speedheal" } = {}, event) {
    this._requireRole(actor, "medtech");
    if (!PHARMA[drug]) throw new RuleBlock(L("NEONHOME.Downtime.PickDrug"));
    const skill = CPR.abilityRank(actor, "Medical Tech Skill");
    if (!skill) throw new RuleBlock(L("NEONHOME.Downtime.NeedsMedTech", { name: actor.name }));
    this._canAfford(actor, PHARMA_MATERIALS);
    const name = L(`NEONHOME.Downtime.Drug.${drug}`);
    const label = L("NEONHOME.Downtime.PharmaLabel", { drug: name });
    const res = await this._timedRoll(actor, MIN.hour, label, { action: "pharma", drug }, () => this._abilityCheck(actor, "Medical Tech Skill", L("NEONHOME.Downtime.MedicalTech"), event));
    if (!res) return null;
    await this._pay(actor, PHARMA_MATERIALS, label);
    const ok = res.total >= PHARMA_DV;
    if (ok) await actor.createEmbeddedDocuments("Item", [await this._drugData(drug, name, skill)], { [MODULE_ID]: { checked: true } });
    await this._post(actor, res.html, {
      icon: "fa-solid fa-syringe", title: label, dv: PHARMA_DV, total: res.total, ok,
      verdict: L(`NEONHOME.Downtime.Pharma.${ok ? "ok" : "fail"}`, { name: esc(actor.name), drug: esc(name), n: skill })
    });
    return { ok, doses: ok ? skill : 0 };
  },

  /** The pharmaceutical's item from Cyberpunk RED's compendium (or a plain one), with the doses. */
  async _drugData(drug, name, doses) {
    let data = null;
    try {
      const pack = game.packs?.get(`${SYSTEM_ID}.core_drugs`);
      const doc = pack ? (await pack.getDocuments({ name }))?.[0] ?? null : null;
      if (doc) data = doc.toObject();
    } catch (err) {
      console.warn(`${MODULE_ID} | couldn't read ${name} from the drugs compendium`, err);
    }
    data ??= { name, type: "drug", img: "icons/svg/pill.svg", system: { description: { value: `<p>${esc(PHARMA[drug])}</p>` } } };
    delete data._id;
    foundry.utils.setProperty(data, "system.amount", doses);
    return data;
  },

  /**
   * Therapy (p.230): a week for the Medtech and the patient, materials bought up front (lost on a
   * failure), a Medical Tech Check at the end. Not on yourself. Humanity Loss therapy restores 2d6
   * (Standard) or 4d6 (Extreme) Humanity; Addiction frees the patient of one addiction.
   * @param {object} p - { patient: an actor id, therapy: addiction|standard|extreme }
   */
  async _therapy(actor, { patient, therapy = "standard" } = {}, event) {
    this._requireRole(actor, "medtech");
    const t = THERAPY[therapy];
    const who = game.actors.get(patient);
    if (!t || !who) throw new RuleBlock(L("NEONHOME.Downtime.PickPatient"));
    if (who === actor) throw new RuleBlock(L("NEONHOME.Downtime.NotYourself"));
    this._canAfford(actor, t.materials);
    const label = L("NEONHOME.Downtime.TherapyLabel", { therapy: L(`NEONHOME.Downtime.Therapy.${therapy}`), patient: who.name });
    // a week for the patient too (p.230): they have to be in this downtime with the week left
    Downtime.require(who, MIN.week);
    const res = await this._timedRoll(actor, MIN.week, label, { action: "therapy", patient: who.uuid }, () => this._abilityCheck(actor, "Medical Tech Skill", L("NEONHOME.Downtime.MedicalTech"), event));
    if (!res) return null;
    // the roll's made: the patient's week goes in their log (through the GM if this user can't)
    const week = { label, data: { action: "therapy", doctor: actor.uuid } };
    if (who.isOwner || game.user.isGM) await Downtime.spend(who, MIN.week, week);
    else await HomeSocket.request("downtimePatientWeek", { doctor: actor.uuid, patient: who.uuid, label });
    await this._pay(actor, t.materials, label);
    const ok = res.total >= t.dv;
    let healed = 0;
    if (ok && t.heal) {
      const roll = await new Roll(t.heal).evaluate();
      healed = await this._patient(actor, who, { op: "humanity", amount: roll.total, reason: label });
    }
    await this._post(actor, res.html, {
      icon: "fa-solid fa-couch", title: label, dv: t.dv, total: res.total, ok,
      verdict: L(`NEONHOME.Downtime.TherapyResult.${ok ? (t.heal ? "ok" : "addiction") : "fail"}`, { name: esc(actor.name), patient: esc(who.name), n: healed })
    });
    return { ok, healed };
  },

  /* ---------------------------------------- */
  /*  Media: Credibility (pp.151-153)         */
  /* ---------------------------------------- */

  /**
   * Chase a rumor: STAT + an information skill against the Active DV for how detailed it is. The
   * corebook doesn't time it; the player (or GM) sets how long, a day by default.
   * @param {object} p - { depth, skill, minutes }
   */
  async _rumor(actor, { depth = "typical", skill = "Library Search", minutes = MIN.day } = {}, event) {
    this._requireRole(actor, "media");
    const dv = RUMORS[depth] ?? RUMORS.typical;
    const label = L("NEONHOME.Downtime.RumorLabel", { depth: L(`NEONHOME.Downtime.Rumor.${depth}`) });
    const res = await this._timedRoll(actor, Math.max(1, Number(minutes) || MIN.day), label, { action: "rumor", depth }, () => CPR.skillCheck(actor, skill, { event, stat: "int" }));
    if (!res) return null;
    const ok = res.total >= dv;
    await this._post(actor, res.html, {
      icon: "fa-solid fa-user-secret", title: label, dv, total: res.total, ok,
      verdict: L(`NEONHOME.Downtime.RumorResult.${ok ? "ok" : "fail"}`, { name: esc(actor.name), depth: L(`NEONHOME.Downtime.Rumor.${depth}`) })
    });
    return { ok };
  },

  /**
   * Publish a story: 1d10 against Believability (Credibility Rank, more with hard evidence). LUCK
   * can't help. The corebook doesn't time writing it; a day by default.
   * @param {object} p - { evidence: pieces of verifiable evidence, title, minutes }
   */
  async _story(actor, { evidence = 0, title = "", minutes = MIN.day } = {}) {
    this._requireRole(actor, "media");
    const chance = believability(CPR.roles(actor).media, evidence);
    const label = L("NEONHOME.Downtime.StoryLabel");
    await Downtime.spend(actor, Math.max(1, Number(minutes) || MIN.day), { label, data: { action: "story" } });
    const roll = await new Roll("1d10").evaluate();
    const ok = roll.total <= chance;
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-newspaper", `${L(`NEONHOME.Downtime.StoryResult.${ok ? "ok" : "fail"}`, { name: esc(actor.name), chance, roll: roll.total })}${title ? `<br><em>${esc(title)}</em>` : ""}`),
      rolls: [roll],
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { ok, chance, roll: roll.total };
  },

  /* ---------------------------------------- */
  /*  Fixer: Operator (pp.159-160)            */
  /* ---------------------------------------- */

  /** Set up a Night Market with other Fixers (Operator Rank 5+), once a month: a day's work. */
  async _nightMarket(actor) {
    this._requireRole(actor, "fixer");
    const rank = CPR.roles(actor).fixer ?? 0;
    if (rank < NIGHT_MARKET_RANK) throw new RuleBlock(L("NEONHOME.Downtime.NightMarketRank", { name: actor.name }));
    const cycle = await MaintOps.cycleFor(actor);
    const last = actor.getFlag(MODULE_ID, "nightMarket");
    if (!game.user.isGM && last?.scheme === cycle.scheme && last?.n === cycle.n) throw new RuleBlock(L("NEONHOME.Downtime.NightMarketMonth"));
    await Downtime.spend(actor, MIN.day, { label: L("NEONHOME.Downtime.Action.nightMarket"), data: { action: "nightMarket" } });
    await actor.setFlag(MODULE_ID, "nightMarket", { scheme: cycle.scheme, n: cycle.n });
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-store", L("NEONHOME.Downtime.NightMarketCard", { name: esc(actor.name) })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { ok: true };
  },

  /* ---------------------------------------- */
  /*  Patients                                */
  /* ---------------------------------------- */

  /**
   * Change a patient (or the owner of something repaired): take away a treated injury, restore
   * Humanity, or set a repaired item working. Directly when this user owns them, otherwise through
   * the GM.
   * @returns {Promise<number>} for Humanity, how much came back
   */
  async _patient(doctor, patient, change) {
    if (patient.isOwner) return this._applyPatient(patient, change);
    return HomeSocket.request("downtimePatient", { doctor: doctor.uuid, patient: patient.uuid, change });
  },

  async _applyPatient(patient, { op, injury, item, amount = 0, reason = "" }) {
    if (op === "deleteInjury") {
      if (patient.items.get(injury)) await patient.deleteEmbeddedDocuments("Item", [injury]);
      return 0;
    }
    if (op === "humanity") return CPR.changeHumanity(patient, Math.max(0, Math.floor(Number(amount) || 0)), reason);
    if (op === "repair") {
      const it = patient.items.get(item);
      if (!it) return 0;
      await HomeOps._patchFlag(it, { condition: "", hidden: false, cause: "", malfunction: null });
      await HomeOps.syncOfflineEffects(patient);
      return 0;
    }
    throw new Error(`Unknown patient change: ${op}`);
  },

  /** GM side: a patient's week of therapy, spent for a player whose Medtech is treating them. */
  async _gmPatientWeek({ doctor: doctorUuid, patient: patientUuid, label }, user) {
    const doctor = await fromUuid(doctorUuid);
    const patient = await fromUuid(patientUuid);
    if (!doctor || !patient) throw new Error(L("NEONHOME.Error.NotFound"));
    if (!doctor.testUserPermission(user, "OWNER")) throw new Error(L("NEONHOME.Error.NoPermission"));
    await Downtime.spend(patient, MIN.week, { label: String(label ?? ""), data: { action: "therapy", doctor: doctor.uuid } });
    return true;
  },

  /** GM side: a player's character treating someone the player doesn't own. */
  async _gmPatient({ doctor: doctorUuid, patient: patientUuid, change }, user) {
    const doctor = await fromUuid(doctorUuid);
    const patient = await fromUuid(patientUuid);
    if (!doctor || !patient) throw new Error(L("NEONHOME.Error.NotFound"));
    if (!doctor.testUserPermission(user, "OWNER")) throw new Error(L("NEONHOME.Error.NoPermission"));
    if (!["deleteInjury", "humanity", "repair"].includes(change?.op)) throw new Error("Not allowed");
    return this._applyPatient(patient, change);
  }
};
