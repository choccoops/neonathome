import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { MaintOps } from "../home/maint-ops.js";
import { Downtime, formatMinutes } from "../home/downtime.js";
import { DowntimeOps, workSkill } from "../home/downtime-ops.js";
import { KINDS, PRICE_CATEGORIES, priceCategory, flattenList, isMaintainable } from "../data/maintenance.js";
import {
  MIN, HUSTLES, makerJob, fabricationMaterials, upgradeMaterials, UPGRADES, INVENT_CATEGORIES,
  PHARMA, PHARMA_DV, PHARMA_MATERIALS, THERAPY, RUMORS, believability, TREATMENT_MINUTES, treatments,
  NIGHT_MARKET_RANK
} from "../data/downtime.js";
import { DnD } from "./home-app.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** Downtime actions by who can take them. */
const ACTIONS = {
  anyone: [
    { id: "hustle", icon: "fa-solid fa-sack-dollar", time: MIN.week },
    { id: "rest", icon: "fa-solid fa-bed", time: MIN.day },
    { id: "treat", icon: "fa-solid fa-kit-medical", time: TREATMENT_MINUTES },
    { id: "workshop", icon: "fa-solid fa-screwdriver-wrench" }
  ],
  tech: [
    { id: "fabricate", icon: "fa-solid fa-industry" },
    { id: "upgrade", icon: "fa-solid fa-microchip" },
    { id: "invent", icon: "fa-solid fa-lightbulb" }
  ],
  medtech: [
    { id: "pharma", icon: "fa-solid fa-syringe", time: MIN.hour },
    { id: "therapy", icon: "fa-solid fa-couch", time: MIN.week }
  ],
  media: [
    { id: "rumor", icon: "fa-solid fa-user-secret" },
    { id: "story", icon: "fa-solid fa-newspaper" }
  ],
  fixer: [{ id: "nightMarket", icon: "fa-solid fa-store", time: MIN.day }]
};

/** The skills a rumor can be chased with (STAT + skill). */
const RUMOR_SKILLS = ["Library Search", "Conversation", "Interrogation", "Human Perception", "Streetwise"];

const opt = (list, selected, label) => list.map((v) => ({ value: v, label: label(v), selected: String(v) === String(selected) }));
const field = (name, label, props) => ({ name, label: L(label), ...props });

/** Characters this user can see the injuries of (for treatment and therapy). */
function patients(actor, { self = true } = {}) {
  const list = game.actors.filter((a) => a.type === "character" && a.testUserPermission(game.user, "OBSERVER") && !game.itempiles?.API?.isValidItemPile?.(a));
  return list.filter((a) => self || a !== actor).sort((a, b) => (a === actor ? -1 : b === actor ? 1 : a.name.localeCompare(b.name)));
}

/** An action's panel: its choices (fields), what it takes (facts), and whether it can go now. */
function panel(actor, id, p, { roles, state }) {
  const facts = [];
  const fields = [];
  let blocked = "";
  let time = null;
  let table = null;
  const fact = (label, value) => facts.push({ label: L(label), value });
  switch (id) {
    case "hustle": {
      const keys = Object.keys(roles).filter((r) => HUSTLES[r]);
      const role = keys.includes(p.role) ? p.role : keys[0];
      if (!role) {
        blocked = L("NEONHOME.Downtime.NoRole", { name: actor.name });
        break;
      }
      if (keys.length > 1) fields.push(field("role", "NEONHOME.Downtime.Field.role", { select: true, options: opt(keys, role, (r) => L(`NEONHOME.Downtime.Role.${r}`)) }));
      time = MIN.week;
      const rank = roles[role];
      const band = rank >= 8 ? 2 : rank >= 5 ? 1 : 0;
      fact("NEONHOME.Downtime.Fact.roll", L("NEONHOME.Downtime.HustleRoll", { role: L(`NEONHOME.Downtime.Role.${role}`), rank }));
      table = HUSTLES[role].map(([text, pay], i) => ({ n: i + 1, text, eb: eb(pay[band]) }));
      break;
    }
    case "rest": {
      const days = Math.max(1, Math.floor(Number(p.days) || 1));
      fields.push(field("days", "NEONHOME.Downtime.Field.days", { number: true, value: days, min: 1, max: 60 }));
      time = days * MIN.day;
      const body = Number(foundry.utils.getProperty(actor, "system.stats.body.value")) || 0;
      const hp = CPR.hp(actor);
      fact("NEONHOME.Downtime.Fact.heals", L("NEONHOME.Downtime.HealsHp", { n: Math.min(hp.max - hp.value, body * days), body }));
      break;
    }
    case "treat": {
      const list = patients(actor);
      const who = list.find((a) => a.id === p.patient) ?? actor;
      fields.push(field("patient", "NEONHOME.Downtime.Field.patient", { select: true, options: list.map((a) => ({ value: a.id, label: a.name, selected: a === who })) }));
      const injuries = who.items.filter((i) => i.type === "criticalInjury");
      const hurt = injuries.find((i) => i.id === p.injury) ?? injuries[0];
      if (!hurt) {
        blocked = L("NEONHOME.Downtime.NoInjuries", { name: who.name });
        break;
      }
      fields.push(field("injury", "NEONHOME.Downtime.Field.injury", { select: true, options: injuries.map((i) => ({ value: i.id, label: i.name, selected: i === hurt })) }));
      const opts = treatments(hurt, { cyber: !!hurt.getFlag(MODULE_ID, "cybertech") });
      const o = Math.min(opts.length - 1, Math.max(0, Math.floor(Number(p.option) || 0)));
      if (!opts.length) {
        blocked = L("NEONHOME.Downtime.NoTreatment", { injury: hurt.name });
        break;
      }
      fields.push(field("option", "NEONHOME.Downtime.Field.treatment", { select: true, options: opts.map((t, i) => ({ value: i, label: `${t.skill} DV${t.dv}`, selected: i === o })) }));
      const quick = hurt.system?.treatment?.type === "quickFix";
      time = quick ? 1 : TREATMENT_MINUTES;
      fact("NEONHOME.Downtime.Fact.dv", `DV${opts[o].dv}`);
      if (who === actor && !quick) blocked = L("NEONHOME.Downtime.NotYourself");
      if (opts[o].ability && !CPR.abilityRank(actor, "Surgery Skill")) blocked = L("NEONHOME.Downtime.NeedsSurgery", { name: actor.name });
      break;
    }
    case "workshop":
      return { workshop: true, facts, fields, time: null, blocked };
    case "fabricate": {
      fields.push(field("item", "NEONHOME.Downtime.Field.item", { drop: true, value: p.itemInfo ?? null }));
      if (!p.itemInfo) {
        blocked = L("NEONHOME.Downtime.DropItem");
        break;
      }
      const job = makerJob(p.itemInfo.price);
      time = job.minutes;
      fact("NEONHOME.Downtime.Fact.dv", `DV${job.dv}`);
      fact("NEONHOME.Downtime.Fact.materials", eb(fabricationMaterials(p.itemInfo.price)));
      fact("NEONHOME.Downtime.Fact.roll", L("NEONHOME.Downtime.MakerRoll", { skill: p.itemInfo.skill, rank: CPR.abilityRank(actor, "Fabrication Expertise"), expertise: L("NEONHOME.Downtime.Expertise.fabrication") }));
      break;
    }
    case "upgrade": {
      const items = actor.items.filter((i) => isMaintainable(i) && i.type !== "cyberware" && !i.getFlag(MODULE_ID, "makerUpgrade")).sort((a, b) => a.name.localeCompare(b.name));
      const item = items.find((i) => i.id === p.item) ?? items[0];
      if (!item) {
        blocked = L("NEONHOME.Downtime.PickItem");
        break;
      }
      const up = UPGRADES[p.upgrade] ? p.upgrade : "quality";
      fields.push(field("item", "NEONHOME.Downtime.Field.item", { select: true, options: items.map((i) => ({ value: i.id, label: i.name, selected: i === item })) }));
      fields.push(field("upgrade", "NEONHOME.Downtime.Field.upgrade", { select: true, options: opt(Object.keys(UPGRADES), up, (u) => L(`NEONHOME.Downtime.Upgrade.${u}`)) }));
      const vehicle = item.type === "vehicle";
      const price = Number(item.system?.price?.market) || 0;
      const job = makerJob(price, { vehicle });
      time = job.minutes;
      fact("NEONHOME.Downtime.Fact.dv", `DV${job.dv}`);
      fact("NEONHOME.Downtime.Fact.materials", eb(upgradeMaterials(price, { vehicle })));
      fact("NEONHOME.Downtime.Fact.roll", L("NEONHOME.Downtime.MakerRoll", { skill: workSkill(item.toObject()), rank: CPR.abilityRank(actor, "Upgrade Expertise"), expertise: L("NEONHOME.Downtime.Expertise.upgrade") }));
      if (!UPGRADES[up].apply) fact("NEONHOME.Downtime.Fact.note", L("NEONHOME.Downtime.UpgradeNoted"));
      break;
    }
    case "invent": {
      const cat = INVENT_CATEGORIES.includes(p.category) ? p.category : "expensive";
      const skills = [...new Set(Object.values(KINDS).map((k) => k.skill))];
      const skill = skills.includes(p.skill) ? p.skill : "Basic Tech";
      fields.push(field("text", "NEONHOME.Downtime.Field.invention", { textarea: true, value: p.text ?? "" }));
      fields.push(field("category", "NEONHOME.Downtime.Field.category", { select: true, options: opt(INVENT_CATEGORIES, cat, (c) => L(`NEONHOME.Maint.Price.${c}`)) }));
      fields.push(field("skill", "NEONHOME.Downtime.Field.skill", { select: true, options: opt(skills, skill, (s) => s) }));
      const job = makerJob(PRICE_CATEGORIES.find((c) => c.key === cat).eb);
      time = job.minutes;
      fact("NEONHOME.Downtime.Fact.dv", `DV${job.dv}`);
      fact("NEONHOME.Downtime.Fact.roll", L("NEONHOME.Downtime.MakerRoll", { skill, rank: CPR.abilityRank(actor, "Invention Expertise"), expertise: L("NEONHOME.Downtime.Expertise.invention") }));
      fact("NEONHOME.Downtime.Fact.note", L("NEONHOME.Downtime.InventNote"));
      break;
    }
    case "pharma": {
      const drug = PHARMA[p.drug] ? p.drug : "speedheal";
      fields.push(field("drug", "NEONHOME.Downtime.Field.drug", { select: true, options: opt(Object.keys(PHARMA), drug, (d) => L(`NEONHOME.Downtime.Drug.${d}`)) }));
      time = MIN.hour;
      const skill = CPR.abilityRank(actor, "Medical Tech Skill");
      fact("NEONHOME.Downtime.Fact.dv", `DV${PHARMA_DV}`);
      fact("NEONHOME.Downtime.Fact.materials", eb(PHARMA_MATERIALS));
      fact("NEONHOME.Downtime.Fact.makes", L("NEONHOME.Downtime.Doses", { n: skill }));
      fact("NEONHOME.Downtime.Fact.effect", PHARMA[drug]);
      if (!skill) blocked = L("NEONHOME.Downtime.NeedsMedTech", { name: actor.name });
      break;
    }
    case "therapy": {
      const list = patients(actor, { self: false });
      const who = list.find((a) => a.id === p.patient) ?? list[0];
      const kind = THERAPY[p.therapy] ? p.therapy : "standard";
      if (!who) {
        blocked = L("NEONHOME.Downtime.PickPatient");
        break;
      }
      fields.push(field("patient", "NEONHOME.Downtime.Field.patient", { select: true, options: list.map((a) => ({ value: a.id, label: a.name, selected: a === who })) }));
      fields.push(field("therapy", "NEONHOME.Downtime.Field.therapy", { select: true, options: opt(Object.keys(THERAPY), kind, (t) => L(`NEONHOME.Downtime.Therapy.${t}`)) }));
      time = MIN.week;
      fact("NEONHOME.Downtime.Fact.dv", `DV${THERAPY[kind].dv}`);
      fact("NEONHOME.Downtime.Fact.materials", eb(THERAPY[kind].materials));
      fact("NEONHOME.Downtime.Fact.effect", L(`NEONHOME.Downtime.TherapyEffect.${kind}`));
      const hum = CPR.humanity(who);
      if (THERAPY[kind].heal) fact("NEONHOME.Downtime.Fact.humanity", `${hum.value}/${hum.max}`);
      fact("NEONHOME.Downtime.Fact.note", L("NEONHOME.Downtime.TherapyBoth", { patient: who.name }));
      break;
    }
    case "rumor": {
      const depth = RUMORS[p.depth] ? p.depth : "typical";
      const skill = RUMOR_SKILLS.includes(p.skill) ? p.skill : RUMOR_SKILLS[0];
      const hours = Math.max(1, Math.floor(Number(p.hours) || 24));
      fields.push(field("depth", "NEONHOME.Downtime.Field.depth", { select: true, options: opt(Object.keys(RUMORS), depth, (d) => `${L(`NEONHOME.Downtime.Rumor.${d}`)} (DV${RUMORS[d]})`) }));
      fields.push(field("skill", "NEONHOME.Downtime.Field.skill", { select: true, options: opt(RUMOR_SKILLS, skill, (s) => s) }));
      fields.push(field("hours", "NEONHOME.Downtime.Field.hours", { number: true, value: hours, min: 1, max: 720, hint: L("NEONHOME.Downtime.TimeYours") }));
      time = hours * MIN.hour;
      fact("NEONHOME.Downtime.Fact.dv", `DV${RUMORS[depth]}`);
      break;
    }
    case "story": {
      const evidence = Math.max(0, Math.floor(Number(p.evidence) || 0));
      const hours = Math.max(1, Math.floor(Number(p.hours) || 24));
      fields.push(field("title", "NEONHOME.Downtime.Field.title", { text: true, value: p.title ?? "" }));
      fields.push(field("evidence", "NEONHOME.Downtime.Field.evidence", { number: true, value: evidence, min: 0, max: 20 }));
      fields.push(field("hours", "NEONHOME.Downtime.Field.hours", { number: true, value: hours, min: 1, max: 720, hint: L("NEONHOME.Downtime.TimeYours") }));
      time = hours * MIN.hour;
      fact("NEONHOME.Downtime.Fact.chance", L("NEONHOME.Downtime.Chance", { n: believability(roles.media ?? 0, evidence) }));
      break;
    }
    case "nightMarket": {
      time = MIN.day;
      const rank = roles.fixer ?? 0;
      fact("NEONHOME.Downtime.Fact.rank", L("NEONHOME.Downtime.OperatorRank", { n: rank }));
      if (rank < NIGHT_MARKET_RANK) blocked = L("NEONHOME.Downtime.NightMarketRank", { name: actor.name });
      break;
    }
  }
  if (time !== null && state.source === "hub" && state.active && time > state.left) blocked ||= L("NEONHOME.Downtime.NotEnough", { name: actor.name, need: formatMinutes(time), left: formatMinutes(state.left) });
  return { fields, facts, time, blocked, table };
}

export const DowntimeTab = {
  id: "downtime",
  icon: "fa-solid fa-mug-hot",
  label: "NEONHOME.Downtime.Title",
  template: `${TEMPLATE_PATH}/downtime.hbs`,
  available: () => Settings.get("downtimeTab") !== false,

  async prepare(app, actor) {
    const isGM = game.user.isGM;
    const ui = (app.uiState.downtime ??= { action: "hustle", params: {} });
    const state = Downtime.state(actor);
    const call = Downtime.current();
    const roles = CPR.roles(actor);
    const groups = Object.entries(ACTIONS)
      .filter(([key]) => key === "anyone" || roles[key] !== undefined)
      .map(([key, actions]) => ({
        key,
        label: key === "anyone" ? L("NEONHOME.Downtime.Anyone") : L(`NEONHOME.Downtime.Role.${key}`),
        actions: actions.map((a) => ({ ...a, label: L(`NEONHOME.Downtime.Action.${a.id}`), timeLabel: a.time ? formatMinutes(a.time) : "", selected: a.id === ui.action }))
      }));
    if (!groups.some((g) => g.actions.some((a) => a.selected))) ui.action = "hustle";
    for (const g of groups) for (const a of g.actions) a.selected = a.id === ui.action;
    const params = (ui.params[ui.action] ??= {});
    const sel = panel(actor, ui.action, params, { roles, state });
    const can = isGM || state.active;
    // the workshop: what needs maintaining or repairing
    let workshop = null;
    if (sel.workshop) {
      const flat = flattenList(await MaintOps.list(actor));
      workshop = {
        due: flat.filter((e) => e.status === "due" && e.condition !== "destroyed" && e.condition !== "dbr").map((e) => ({ id: e.id, name: e.name, img: e.img, dv: e.dv, time: formatMinutes(e.minutes), skill: e.skill })),
        broken: flat.filter((e) => e.condition === "destroyed").map((e) => ({ id: e.id, name: e.name, img: e.img, dv: e.repair.dv, time: formatMinutes(e.repair.minutes), skill: e.skill }))
      };
    }
    const others = Object.keys(roles).filter((r) => !ACTIONS[r]).map((r) => L(`NEONHOME.Downtime.Role.${r}`));
    return {
      dt: {
        isGM,
        hub: !!Downtime.hub,
        call: call ? { label: call.label || L("NEONHOME.Downtime.Title"), total: call.total ? formatMinutes(call.total) : "" } : null,
        state: {
          active: state.active,
          timed: state.left !== null && state.source === "hub",
          left: state.left !== null ? formatMinutes(state.left) : "",
          spent: formatMinutes(state.spent),
          pct: state.total ? Math.round((state.spent / state.total) * 100) : 0
        },
        notTaking: !!call && !state.active,
        manualOn: Settings.get("downtimeOn") === true,
        can,
        groups,
        roleNote: others.length ? L("NEONHOME.Downtime.HustleOnly", { roles: others.join(", ") }) : "",
        selected: {
          id: ui.action,
          label: L(`NEONHOME.Downtime.Action.${ui.action}`),
          blurb: L(`NEONHOME.Downtime.Blurb.${ui.action}`),
          timeLabel: sel.time ? formatMinutes(sel.time) : "",
          ...sel,
          workshop,
          canDo: can && !sel.blocked && !sel.workshop
        },
        log: Downtime.log(actor).map((e) => ({ label: e.label, time: formatMinutes(e.minutes), ours: e.source === MODULE_ID }))
      }
    };
  },

  actions: {
    dtSelect(event, target) {
      const ui = (this.uiState.downtime ??= { action: "hustle", params: {} });
      ui.action = target.closest("[data-dt]")?.dataset.dt ?? ui.action;
      this.render();
    },
    dtPerform(event) {
      const ui = this.uiState.downtime;
      const params = { ...(ui.params[ui.action] ?? {}) };
      return this.act(() => DowntimeOps.perform(this.actor, ui.action, params, { event }));
    },
    dtWork(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      const mode = target.dataset.mode;
      return this.act(() => MaintOps.check(this.actor, id, { mode, event }));
    },
    dtOpenHub() {
      Downtime.open();
    },
    dtSwitch(event, target) {
      return this.act(() => Downtime.setOn(target.dataset.on === "1"));
    }
  },

  onRender(app, root) {
    const ui = (app.uiState.downtime ??= { action: "hustle", params: {} });
    const params = () => (ui.params[ui.action] ??= {});
    for (const el of root.querySelectorAll("[data-dt-field]")) {
      const name = el.dataset.dtField;
      // text keeps its focus: stored as typed; choices re-work the panel
      if (el.tagName === "TEXTAREA" || el.type === "text") {
        el.addEventListener("input", () => (params()[name] = el.value));
      } else {
        el.addEventListener("change", () => {
          params()[name] = el.value;
          app.render();
        });
      }
    }
    // Fabrication: drop the item to make (from the sidebar or a compendium)
    DnD.targets(root, async (data) => {
      if (data?.type !== "Item" || !data.uuid) return;
      const item = await fromUuid(data.uuid);
      if (!item) return;
      const o = item.toObject();
      params().item = data.uuid;
      params().itemInfo = { name: item.name, img: item.img, price: Number(o.system?.price?.market) || 0, skill: workSkill(o), category: L(`NEONHOME.Maint.Price.${PRICE_CATEGORIES[Math.max(0, priceCategory(o.system?.price?.market))].key}`) };
      app.render();
    });
  }
};
