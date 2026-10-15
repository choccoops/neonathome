import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { MaintOps } from "../home/maint-ops.js";
import { HomeStore } from "../home/store.js";
import { Downtime, formatMinutes } from "../home/downtime.js";
import { DowntimeOps, workSkill } from "../home/downtime-ops.js";
import { ProjectOps } from "../home/project-ops.js";
import { SalvageOps } from "../home/salvage-ops.js";
import { stage, meter, needed, remaining } from "../data/projects.js";
import { Compat } from "../compat.js";
import { KINDS, PRICE_CATEGORIES, priceCategory, flattenList, isMaintainable } from "../data/maintenance.js";
import {
  MIN, HUSTLES, makerJob, UPGRADES, INVENT_CATEGORIES,
  PHARMA, PHARMA_DV, PHARMA_MATERIALS, THERAPY, RUMORS, believability, TREATMENT_MINUTES, treatments,
  NIGHT_MARKET_RANK
} from "../data/downtime.js";
import { SALVAGE_MINUTES, CATEGORIES, WORTH, locationsOf, locationOf, haulLeft } from "../data/salvage.js";
import { TIERS, TIER_NAMES, tierEb, fabricationNeeds, upgradeNeeds, stripPlan, unitsFor } from "../data/materials.js";
import { DnD } from "./home-app.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** Downtime actions by who can take them. */
const ACTIONS = {
  anyone: [
    { id: "hustle", icon: "fa-solid fa-sack-dollar", time: MIN.week },
    { id: "rest", icon: "fa-solid fa-bed", time: MIN.day },
    { id: "treat", icon: "fa-solid fa-kit-medical", time: TREATMENT_MINUTES },
    { id: "salvage", icon: "fa-solid fa-dumpster", time: SALVAGE_MINUTES },
    { id: "workshop", icon: "fa-solid fa-screwdriver-wrench" },
    { id: "projects", icon: "fa-solid fa-diagram-project" }
  ],
  tech: [
    { id: "fabricate", icon: "fa-solid fa-industry" },
    { id: "upgrade", icon: "fa-solid fa-microchip" },
    { id: "invent", icon: "fa-solid fa-lightbulb" },
    { id: "strip", icon: "fa-solid fa-gears" }
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

/** The actions that start a project. */
const MAKER = ["fabricate", "upgrade", "invent"];

/**
 * A time picker: a slider, and days, hours and minutes to type, for any amount from nothing up to
 * `max` minutes (the downtime left, or what the work still needs, whichever is less).
 * @param {boolean} byLeft - the downtime left is what sets the max
 */
function timePick(max, value, name = "", byLeft = false) {
  const m = Math.max(0, Math.floor(max));
  const v = Math.max(0, Math.floor(Number(value) || 0));
  return {
    name, max: m, value: v, label: formatMinutes(v), maxText: formatMinutes(m),
    d: Math.floor(v / MIN.day), h: Math.floor((v % MIN.day) / MIN.hour), m: v % MIN.hour,
    maxLabel: L(`NEONHOME.Project.UpTo.${byLeft ? "left" : "needs"}`, { max: formatMinutes(m) }),
    over: v > m,
    empty: v <= 0,
    stop: v > m || v <= 0
  };
}

/** A project for the Projects panel: its meter, where it stands, and the time buttons. */
function projectRow(p, state, picked) {
  const st = stage(p);
  const m = meter(p);
  const left = state.active && state.source === "hub" ? state.left : null;
  const steps = [];
  if (st === "build") steps.push({ minutes: "check", label: L("NEONHOME.Project.ToCheck", { time: formatMinutes(needed(p)) }) });
  if (st === "build" || st === "finish") steps.push({ minutes: "all", label: L("NEONHOME.Project.AllOfIt", { time: formatMinutes(remaining(p)) }) });
  for (const [n, key] of [[MIN.hour, "hour"], [MIN.day, "day"], [MIN.week, "week"]]) if (n < needed(p)) steps.push({ minutes: n, label: L(`NEONHOME.Project.One.${key}`) });
  return {
    id: p.id,
    label: p.label,
    img: p.img,
    icon: ProjectOps.icon(p.kind),
    kind: L(`NEONHOME.Project.Kind.${p.kind}`),
    dv: p.dv,
    skill: p.skill,
    done: formatMinutes(p.done),
    total: formatMinutes(p.minutes),
    pct: m.pct,
    half: m.half,
    stage: st,
    stageLabel: L(`NEONHOME.Project.Stage.${st}`, { left: formatMinutes(p.minutes - p.done) }),
    restarts: p.restarts,
    checkDue: st === "check",
    passed: p.check === "passed",
    steps: left === 0 ? [] : steps,
    noTime: left === 0,
    // any amount: up to all it still needs, or the downtime left
    pick: left === 0 || st === "check" || st === "done" ? null : timePick(Math.min(remaining(p), left ?? Infinity), picked ?? Math.min(needed(p), left ?? Infinity), "", left !== null && left < remaining(p))
  };
}

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
  // Maker work is a project: its time can be spread over several downtimes
  let spread = false;
  // how much of the project's time goes in now: all, to the check, none, or any amount
  const startNow = (total) => {
    fields.push(field("now", "NEONHOME.Downtime.Field.now", { select: true, options: opt(["all", "check", "custom", "none"], p.now ?? "all", (v) => L(`NEONHOME.Project.Now.${v}`)) }));
    if (p.now !== "custom") return;
    const left = state.active && state.source === "hub" ? state.left : Infinity;
    const pick = timePick(Math.min(total, left), p.nowMinutes ?? Math.min(Math.ceil(total / 2), left), "nowMinutes", left < total);
    fields.push(field("nowMinutes", "NEONHOME.Downtime.Field.nowMinutes", { pick }));
    // only as much as there is (and something)
    if (pick.over) blocked ||= L("NEONHOME.Project.TooMuch", { max: formatMinutes(pick.max) });
    else if (pick.empty) blocked ||= L("NEONHOME.Project.PickSome");
  };
  const fact = (label, value) => facts.push({ label: L(label), value });
  // Maker work is paid for in Tech Materials (items), not eb
  const materials = (need) => {
    const line = SalvageOps.needLine(actor, need);
    fact("NEONHOME.Downtime.Fact.materials", L("NEONHOME.Materials.Have", { materials: line.text, have: line.have }));
    if (!line.ok) blocked ||= L("NEONHOME.Materials.Short", { name: actor.name, materials: line.text });
  };
  let strip = null;
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
    case "projects":
      return { projects: true, facts, fields, time: null, blocked };
    case "fabricate": {
      fields.push(field("item", "NEONHOME.Downtime.Field.item", { drop: true, value: p.itemInfo ?? null }));
      if (!p.itemInfo) {
        blocked = L("NEONHOME.Downtime.DropItem");
        break;
      }
      const job = makerJob(p.itemInfo.price);
      time = job.minutes;
      spread = true;
      startNow(job.minutes);
      fact("NEONHOME.Downtime.Fact.dv", `DV${job.dv}`);
      materials(fabricationNeeds(p.itemInfo.price));
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
      spread = true;
      startNow(job.minutes);
      fact("NEONHOME.Downtime.Fact.dv", `DV${job.dv}`);
      materials(upgradeNeeds(price, { vehicle }));
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
      spread = true;
      startNow(job.minutes);
      fact("NEONHOME.Downtime.Fact.dv", `DV${job.dv}`);
      fact("NEONHOME.Downtime.Fact.roll", L("NEONHOME.Downtime.MakerRoll", { skill, rank: CPR.abilityRank(actor, "Invention Expertise"), expertise: L("NEONHOME.Downtime.Expertise.invention") }));
      fact("NEONHOME.Downtime.Fact.note", L("NEONHOME.Downtime.InventNote"));
      break;
    }
    case "salvage": {
      const era = SalvageOps.era();
      const places = locationsOf(era);
      const loc = places.includes(p.location) ? p.location : places[0];
      const cat = CATEGORIES.includes(p.category) ? p.category : "any";
      const specific = cat !== "any";
      fields.push(field("location", "NEONHOME.Salvage.Field.location", { select: true, options: places.map((k) => ({ value: k, label: SalvageOps.placeName(era, k), selected: k === loc })) }));
      fields.push(field("category", "NEONHOME.Salvage.Field.category", { select: true, options: opt(["any", ...CATEGORIES], cat, (c) => (c === "any" ? L("NEONHOME.Salvage.Any") : SalvageOps.categoryName(c))) }));
      time = SALVAGE_MINUTES;
      fact("NEONHOME.Salvage.Fact.era", L(`NEONHOME.Salvage.Era.${era}`));
      fact("NEONHOME.Salvage.Fact.place", L(`NEONHOME.Salvage.About.${era}.${loc}`));
      fact("NEONHOME.Downtime.Fact.roll", L("NEONHOME.Salvage.Roll"));
      if (!specific) fact("NEONHOME.Salvage.Fact.finds", locationOf(era, loc).categories.map((c, i) => `${i + 1} ${SalvageOps.categoryName(c)}`).join(" · "));
      fact("NEONHOME.Salvage.Fact.fumble", L("NEONHOME.Salvage.FumbleNote"));
      table = WORTH.filter((w) => (specific ? w.specific : w.any) !== null).map((w) => ({ n: `DV${specific ? w.specific : w.any}`, text: L("NEONHOME.Salvage.WorthRow"), eb: eb(w.eb) }));
      break;
    }
    case "strip": {
      const tier = TIERS.includes(p.tier) ? p.tier : "costly";
      const count = Math.min(99, Math.max(1, Math.floor(Number(p.count) || 1)));
      fields.push(field("tier", "NEONHOME.Strip.Field.tier", { select: true, options: opt(TIERS, tier, (t) => `${TIER_NAMES[t]} (${eb(tierEb(t))})`) }));
      fields.push(field("count", "NEONHOME.Strip.Field.count", { number: true, value: count, min: 1, max: 99 }));
      const picks = p.picks ?? {};
      const list = SalvageOps.strippable(actor);
      const qty = (s) => Math.min(s.amount, Math.max(1, Math.floor(Number(picks[s.item.id]) || 1)));
      const plan = stripPlan(list.filter((s) => picks[s.item.id]).map((s) => ({ value: s.value, qty: qty(s) })), tier, count);
      strip = list.map((s) => ({ id: s.item.id, name: s.item.name, img: s.item.img, value: eb(s.value), multi: s.amount > 1, amount: s.amount, picked: !!picks[s.item.id], qty: qty(s) }));
      fact("NEONHOME.Strip.Fact.parts", eb(plan.total));
      fact("NEONHOME.Strip.Fact.need", `${eb(plan.need)} (${count} × ${TIER_NAMES[tier]})`);
      if (plan.ok && plan.waste) fact("NEONHOME.Strip.Fact.waste", eb(plan.waste));
      if (!list.length) blocked = L("NEONHOME.Strip.Nothing", { name: actor.name });
      else if (!plan.ok) blocked = plan.total ? L("NEONHOME.Strip.Short", { have: eb(plan.total), need: eb(plan.need), materials: `${count} × ${TIER_NAMES[tier]} Tech Materials` }) : L("NEONHOME.Strip.PickSome");
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
  if (spread) fact("NEONHOME.Downtime.Fact.project", L("NEONHOME.Project.HowItGoes"));
  else if (time !== null && state.source === "hub" && state.active && time > state.left) blocked ||= L("NEONHOME.Downtime.NotEnough", { name: actor.name, need: formatMinutes(time), left: formatMinutes(state.left) });
  // nothing to roll: just the time spent
  return { fields, facts, time, blocked, table, maker: spread, strip, stripping: id === "strip", noRoll: id === "rest" || id === "nightMarket" };
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
    const projects = ProjectOps.list(actor);
    for (const g of groups) for (const a of g.actions) if (a.id === "projects" && projects.length) a.timeLabel = String(projects.length);
    if (!groups.some((g) => g.actions.some((a) => a.selected))) ui.action = "hustle";
    for (const g of groups) for (const a of g.actions) a.selected = a.id === ui.action;
    const params = (ui.params[ui.action] ??= {});
    const sel = panel(actor, ui.action, params, { roles, state });
    // downtime actions spend the character's downtime: they need to be in it (the GM too)
    const can = state.active;
    ui.can = can;
    // the workshop: what needs maintaining or repairing
    let workshop = null;
    if (sel.workshop) {
      // the character's gear, then what's in their home stash
      const stored = await MaintOps.stashList(actor);
      const flat = [
        ...flattenList(await MaintOps.list(actor)).map((e) => ({ ...e, holder: actor })),
        ...flattenList(stored?.list ?? []).map((e) => ({ ...e, holder: stored.stash, stash: true }))
      ];
      workshop = {
        due: flat.filter((e) => e.status === "due" && e.condition !== "destroyed" && e.condition !== "dbr").map((e) => ({ id: e.id, name: e.name, img: e.img, dv: e.dv, time: formatMinutes(e.minutes), skill: e.skill, stash: !!e.stash })),
        broken: flat.filter((e) => e.condition === "destroyed").map((e) => {
          const under = ProjectOps.repairOf(actor, e.holder, e.id);
          return { id: e.id, name: e.name, img: e.img, dv: e.repair.dv, time: formatMinutes(e.repair.minutes), skill: e.skill, pct: under ? meter(under).pct : null, stash: !!e.stash };
        })
      };
    }
    // salvage waiting to be picked out (any time: the trip's already made)
    let hauls = null;
    if (ui.action === "salvage") {
      hauls = SalvageOps.hauls(actor).map((h) => {
        const left = haulLeft(h);
        return {
          id: h.id,
          title: L("NEONHOME.Salvage.HaulTitle", { category: SalvageOps.categoryName(h.category), place: SalvageOps.placeName(h.era, h.location), era: h.era }),
          worth: eb(h.worth),
          left: eb(left),
          pct: h.worth ? Math.round((left / h.worth) * 100) : 0,
          taken: h.taken.map((t) => t.name).join(", "),
          tiers: TIERS.filter((t) => unitsFor(left, t) >= 1).map((t) => ({ tier: t, label: `${TIER_NAMES[t]} (${eb(tierEb(t))})` })),
          category: SalvageOps.categoryName(h.category)
        };
      });
    }
    // projects under way: the meter, the halfway mark, and what can be done next
    const projectRows = sel.projects ? projects.map((pr) => projectRow(pr, state, ui.picks?.[pr.id])) : null;
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
          projects: projectRows,
          hauls,
          canDo: can && !sel.blocked && !sel.workshop && !sel.projects
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
      const id = ui.action;
      const params = { ...(ui.params[id] ?? {}) };
      if (MAKER.includes(id)) {
        return this.act(async () => {
          const now = params.now === "none" ? 0 : params.now === "custom" ? Math.max(0, Math.floor(Number(params.nowMinutes) || 0)) : params.now ?? "all";
          const started = await ProjectOps.start(this.actor, id, params, { minutes: now, event });
          if (started) {
            ui.params[id] = {};
            ui.action = "projects";
          }
        });
      }
      if (id === "salvage") return this.act(() => SalvageOps.trip(this.actor, params, { event }));
      if (id === "strip") {
        return this.act(async () => {
          const res = await SalvageOps.strip(this.actor, params.picks, params.tier ?? "costly", params.count ?? 1);
          if (res) ui.params.strip = { tier: params.tier, count: params.count };
        });
      }
      return this.act(() => DowntimeOps.perform(this.actor, id, params, { event }));
    },
    dtWork(event, target) {
      const el = target.closest("[data-item-id]");
      const id = el?.dataset.itemId;
      const mode = target.dataset.mode;
      const holder = el?.dataset.holder === "stash" ? HomeStore.stash(this.actor) ?? this.actor : this.actor;
      if (mode === "repair") return this.act(() => ProjectOps.repair(this.actor, holder, id, { event }));
      return this.act(() => MaintOps.check(holder, id, { mode, mechanic: this.actor, event }));
    },
    dtProjWork(event, target) {
      const row = target.closest("[data-project]");
      const id = row?.dataset.project;
      // the slider's amount, or a step button's
      const m = target.dataset.minutes === "pick" ? row.querySelector(".nah-timepick")?.dataset.value : target.dataset.minutes;
      if (target.dataset.minutes === "pick" && this.uiState.downtime?.picks) delete this.uiState.downtime.picks[id];
      return this.act(() => ProjectOps.work(this.actor, id, m === "check" || m === "all" ? m : Number(m), { event }));
    },
    dtProjRoll(event, target) {
      const id = target.closest("[data-project]")?.dataset.project;
      return this.act(() => ProjectOps.roll(this.actor, id, { event }));
    },
    dtProjAbandon(event, target) {
      const id = target.closest("[data-project]")?.dataset.project;
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: L("NEONHOME.Project.Abandon"), icon: "fa-solid fa-trash" },
          content: `<p>${L("NEONHOME.Project.AbandonAsk")}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await ProjectOps.abandon(this.actor, id);
      });
    },
    dtHaulTier(event, target) {
      const id = target.closest("[data-haul]")?.dataset.haul;
      return this.act(() => SalvageOps.takeMaterials(this.actor, id, target.dataset.tier, 1));
    },
    dtHaulLeave(event, target) {
      const id = target.closest("[data-haul]")?.dataset.haul;
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: L("NEONHOME.Salvage.Leave"), icon: "fa-solid fa-dumpster" },
          content: `<p>${L("NEONHOME.Salvage.LeaveAsk")}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await SalvageOps.leave(this.actor, id);
      });
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
      // a time picker's slider is kept as it moves (below), without redrawing the panel
      if (el.type === "range") continue;
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
    // Time pickers: the slider and the typed days/hours/minutes move together. A project's pick is
    // kept across renders; its Put in button only takes something up to the max.
    for (const tp of root.querySelectorAll(".nah-timepick")) {
      const range = tp.querySelector("[data-tp-range]");
      const boxes = [...tp.querySelectorAll("[data-tp-unit]")];
      const msg = tp.querySelector("[data-tp-msg]");
      const max = Number(tp.dataset.max) || 0;
      const confirm = tp.closest("[data-project]")?.querySelector("[data-tp-confirm]");
      const show = (total) => {
        const over = total > max;
        tp.dataset.value = String(total);
        tp.classList.toggle("is-over", over);
        msg.textContent = over ? L("NEONHOME.Project.TooMuch", { max: formatMinutes(max) }) : `${formatMinutes(total)} · ${tp.dataset.maxLabel}`;
        if (confirm) confirm.disabled = !ui.can || over || total <= 0;
        const pid = tp.closest("[data-project]")?.dataset.project;
        if (pid) (ui.picks ??= {})[pid] = total;
      };
      const typed = () => boxes.reduce((n, b) => n + Math.max(0, Math.floor(Number(b.value) || 0)) * Number(b.dataset.tpUnit), 0);
      range.addEventListener("input", () => {
        const v = Number(range.value);
        boxes[0].value = Math.floor(v / MIN.day);
        boxes[1].value = Math.floor((v % MIN.day) / MIN.hour);
        boxes[2].value = v % MIN.hour;
        show(v);
      });
      for (const b of boxes) {
        b.addEventListener("input", () => {
          const total = typed();
          range.value = String(Math.min(max, total));
          show(total);
        });
      }
      // starting a project: the amount goes into its choices, and the panel says if it's too much
      if (tp.dataset.field) {
        const save = () => {
          params()[tp.dataset.field] = Number(tp.dataset.value) || 0;
          app.render();
        };
        range.addEventListener("change", save);
        for (const b of boxes) b.addEventListener("change", save);
      }
      show(Number(tp.dataset.value) || 0);
    }
    // Strip for parts: tick items, and how many of a stack
    const picks = () => (params().picks ??= {});
    for (const el of root.querySelectorAll("[data-strip-pick]")) {
      el.addEventListener("change", () => {
        const id = el.dataset.stripPick;
        if (el.checked) picks()[id] = Number(root.querySelector(`[data-strip-qty="${id}"]`)?.value) || 1;
        else delete picks()[id];
        app.render();
      });
    }
    for (const el of root.querySelectorAll("[data-strip-qty]")) {
      el.addEventListener("change", () => {
        const id = el.dataset.stripQty;
        if (!(id in picks())) return;
        picks()[id] = Math.max(1, Number(el.value) || 1);
        app.render();
      });
    }
    // Fabrication: drop the item to make; a haul: drop what was found (from the sidebar or a compendium)
    DnD.targets(root, async (data, target) => {
      if (data?.type !== "Item" || !data.uuid) return;
      if (target?.dataset.drop === "haul") {
        const id = target.closest("[data-haul]")?.dataset.haul;
        return app.act(() => SalvageOps.takeItem(app.actor, id, data.uuid));
      }
      const item = await fromUuid(data.uuid);
      if (!item) return;
      const o = item.toObject();
      params().item = data.uuid;
      params().itemInfo = { name: item.name, img: item.img, price: Number(o.system?.price?.market) || 0, skill: workSkill(o), category: L(`NEONHOME.Maint.Price.${PRICE_CATEGORIES[Math.max(0, priceCategory(o.system?.price?.market))].key}`) };
      app.render();
    });
  }
};
