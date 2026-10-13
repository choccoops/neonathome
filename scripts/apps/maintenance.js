import { TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { Settings } from "../settings.js";
import { HomeStore } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { MaintOps, INSPECT_DV } from "../home/maint-ops.js";
import { LIFESTYLES, TIERS, GROUPS, TABLE_KEYS, groupOf, flattenList, tally, fieldExpertise } from "../data/maintenance.js";
import { DAMAGE_CAUSES } from "../data/item-flag.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const eb = (n) => `${Number(n || 0).toLocaleString()}eb`;

/** Which gear each cause of damage suggests (Breaking Stuff, p.5). */
const SUGGEST = {
  maintenance: (e) => e.status === "due",
  injury: (e) => e.type === "cyberware" || e.equipped === "equipped" || e.equipped === "carried",
  electrocution: (e) => e.electronic,
  environment: (e) => e.equipped === "equipped" || e.equipped === "carried",
  excessive: (e) => e.type === "cyberware" || e.equipped === "equipped",
  fire: (e) => e.type === "cyberware" || e.equipped === "equipped" || e.equipped === "carried",
  drugs: (e) => e.type === "cyberware",
  other: () => false
};

/** The condition a player sees: Damaged the GM is keeping quiet looks fine to them. */
const seen = (e, isGM) => (e.condition === "damaged" && e.hidden && !isGM ? "" : e.condition);

/** Wear: whole cycles since it was maintained, as four pips. */
const wear = (e) => Array.from({ length: 4 }, (_, i) => ({ on: e.status === "due" && i < Math.min(4, e.missed + 1) }));

/** The characters a user can have do the work: their own, and the GM's pick of anyone. */
function mechanics(actor) {
  const list = HomeStore.characters();
  if (!list.includes(actor)) list.unshift(actor);
  return list;
}

function row(e, isGM, selected) {
  const condition = seen(e, isGM);
  return {
    id: e.id,
    name: e.name,
    img: e.img,
    depth: e.depth,
    selected: e.id === selected,
    status: e.status,
    statusLabel: L(`NEONHOME.Maint.Status.${e.status}`),
    tier: e.tier,
    condition,
    conditionLabel: condition ? L(`NEONHOME.Condition.${condition}`) : "",
    hiddenDamage: isGM && e.condition === "damaged" && e.hidden,
    offline: e.state,
    emp: e.emp,
    malfunction: !!e.malfunction,
    wear: wear(e)
  };
}

function detail(actor, e, { isGM, mechanic, lifestyle }) {
  const condition = seen(e, isGM);
  const tier = TIERS[e.tier];
  const m = e.malfunction;
  const res = m ? MaintOps.result(m.table, m.roll) : null;
  const rig = fieldExpertise(mechanic.items.map((i) => i.toObject()));
  const cat = e.worth.category ? L(`NEONHOME.Maint.Price.${e.worth.category}`) : "";
  return {
    ...e,
    condition,
    conditionLabel: L(`NEONHOME.Condition.${condition || "ok"}`),
    hiddenDamage: isGM && e.condition === "damaged" && e.hidden,
    isDamaged: e.condition === "damaged",
    causeLabel: e.cause && (isGM || !e.hidden) ? L(`NEONHOME.Maint.Cause.${e.cause}`) : "",
    kindLabel: L(`NEONHOME.Maint.Kind.${e.kind}`),
    priceLabel: eb(e.price),
    tierLabel: L(`NEONHOME.Maint.Lifestyle.${LIFESTYLES[e.tier]}`),
    timeLabel: L(`NEONHOME.Maint.Time.${tier.time}`),
    statusLabel: L(`NEONHOME.Maint.Status.${e.status}`),
    statusHint: e.status === "covered"
      ? L(e.roleBonus ? "NEONHOME.Maint.CoveredRole" : "NEONHOME.Maint.CoveredBy", { lifestyle: L(`NEONHOME.Maint.Lifestyle.${LIFESTYLES[lifestyle.tier]}`), role: e.roleBonus ? L(`NEONHOME.Maint.Role.${e.roleBonus}`) : "" })
      : e.status === "exempt" ? L(`NEONHOME.Maint.Exempt.${e.exempt}`)
        : e.status === "maintained" ? L("NEONHOME.Maint.MaintainedHint")
          : L("NEONHOME.Maint.DueHint", { lifestyle: L(`NEONHOME.Maint.Lifestyle.${LIFESTYLES[e.tier]}`), missed: e.missed }),
    roleLabel: e.roleBonus ? L(`NEONHOME.Maint.Role.${e.roleBonus}`) : "",
    worthLabel: e.condition === "dbr" ? L("NEONHOME.Maint.Worthless") : e.worth.drop ? L("NEONHOME.Maint.WorthDrop", { eb: eb(e.worth.eb), category: cat }) : cat ? L("NEONHOME.Maint.WorthFull", { eb: eb(e.worth.eb), category: cat }) : "",
    malf: res ? {
      table: L(`NEONHOME.Malfunction.Table.${m.table}`),
      roll: m.roll,
      text: res.text,
      duration: L(`NEONHOME.Malfunction.Duration.${res.duration}`),
      rigged: m.rigged,
      rigMinutes: m.rigMinutes,
      page: res.page
    } : null,
    can: {
      maintain: e.condition !== "destroyed" && e.condition !== "dbr" && e.status !== "covered" && e.status !== "exempt",
      // Covered gear can still get a tune-up to clear Damage or a malfunction.
      tuneUp: (e.status === "covered" || e.status === "exempt") && (e.condition === "damaged" || !!m),
      inspect: e.condition !== "destroyed" && e.condition !== "dbr",
      repair: e.condition === "destroyed",
      rig: !!m && !m.rigged && rig > 0,
      drop: e.equipped === "equipped" && (e.type === "weapon" || e.type === "armor"),
      emp: e.electronic
    },
    inspectDv: INSPECT_DV,
    conditions: ["", "damaged", "destroyed", "dbr"].map((c) => ({ key: c, label: L(`NEONHOME.Condition.${c || "ok"}`), on: e.condition === c })),
    tables: TABLE_KEYS.map((k) => ({ key: k, label: L(`NEONHOME.Malfunction.Table.${k}`), selected: k === e.table }))
  };
}

export const Maintenance = {
  id: "maintenance",
  icon: "fa-solid fa-screwdriver-wrench",
  label: "NEONHOME.Maint.Title",
  template: `${TEMPLATE_PATH}/maintenance.hbs`,
  available: () => Settings.get("maintenance") !== false,

  async prepare(app, actor) {
    const isGM = game.user.isGM;
    const ui = (app.uiState.maint ??= { selected: null, mechanic: null });
    const cycle = await MaintOps.cycleFor(actor);
    const list = await MaintOps.list(actor, cycle);
    const flat = flattenList(list);
    if (!flat.some((e) => e.id === ui.selected)) ui.selected = flat[0]?.id ?? null;
    const crew = mechanics(actor);
    const mechanic = crew.find((a) => a.id === ui.mechanic) ?? actor;
    const lifestyle = MaintOps.lifestyle(actor);
    const t = tally(list);
    const groups = GROUPS.map((g) => {
      const tops = list.filter((e) => groupOf(e.kind) === g);
      return { key: g, label: L(`NEONHOME.Maint.Group.${g}`), rows: flattenList(tops).map((e) => row(e, isGM, ui.selected)) };
    }).filter((g) => g.rows.length);
    const sel = flat.find((e) => e.id === ui.selected);
    const mode = MaintOps.mode;
    const period = mode === "week" ? "week" : "month";
    return {
      maint: {
        isGM,
        cycleLabel: cycle.label,
        // Neon Hub's Rent Day keeps the months: when the next one is, and on which calendar
        rent: cycle.scheme !== "own",
        rentHint: cycle.calendar
          ? (cycle.next?.today ? L("NEONHOME.Maint.RentToday", { calendar: cycle.calendar.name }) : L("NEONHOME.Maint.RentIn", { n: cycle.next?.days ?? 0, calendar: cycle.calendar.name }))
          : cycle.scheme === "hub" ? L("NEONHOME.Maint.HubCounter") : "",
        canRentDay: isGM && !!cycle.calendar,
        canNewCycle: isGM && cycle.scheme === "own",
        nextLabel: L(`NEONHOME.Maint.Next.${period}`),
        lifestyle: {
          tier: lifestyle.tier,
          label: L(`NEONHOME.Maint.Lifestyle.${LIFESTYLES[lifestyle.tier]}`),
          source: L(`NEONHOME.Maint.Source.${lifestyle.source}`),
          // what it covers: gear up to the next tier's value
          covers: lifestyle.tier >= 4 ? L("NEONHOME.Maint.CoversAll") : lifestyle.tier < 1 ? L("NEONHOME.Maint.CoversNone") : L("NEONHOME.Maint.CoversUpTo", { eb: eb(TIERS[lifestyle.tier + 1].gear - 1) }),
          options: [{ key: "", label: L("NEONHOME.Maint.Auto"), selected: lifestyle.source !== "gm" }, ...LIFESTYLES.map((k, i) => ({ key: String(i), label: L(`NEONHOME.Maint.Lifestyle.${k}`), selected: lifestyle.source === "gm" && lifestyle.tier === i }))]
        },
        mechanics: crew.map((a) => ({ id: a.id, name: a.name, selected: a === mechanic })),
        mechanicName: mechanic.name,
        tally: t,
        groups,
        empty: !flat.length,
        selected: sel ? detail(actor, sel, { isGM, mechanic, lifestyle }) : null,
        tiers: TIERS.slice(1).map((tier, i) => ({ label: L(`NEONHOME.Maint.Lifestyle.${LIFESTYLES[i + 1]}`), gear: eb(tier.gear), vehicle: eb(tier.vehicle), dv: tier.dv, time: L(`NEONHOME.Maint.Time.${tier.time}`), on: lifestyle.tier === i + 1 }))
      }
    };
  },

  actions: {
    maintSelect(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      if (!id) return;
      this.uiState.maint = { ...(this.uiState.maint ?? {}), selected: id };
      this.render();
    },
    maintCheck(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      const mode = target.dataset.mode;
      const mechanic = game.actors.get(this.uiState.maint?.mechanic) ?? this.actor;
      return this.act(async () => {
        let dv = null;
        if (mode === "repair") {
          const e = await MaintOps.entry(this.actor, id);
          dv = await askDv(e?.dv ?? 13);
          if (dv === null) return;
        }
        await MaintOps.check(this.actor, id, { mode, mechanic, event, dv });
      });
    },
    maintCondition(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.setCondition(this.actor, id, target.dataset.condition || ""));
    },
    maintHidden(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.setHidden(this.actor, id, target.dataset.hidden === "1"));
    },
    maintEmp(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.setEmp(this.actor, id, target.dataset.on === "1"));
    },
    maintMalfunction(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      const table = target.closest(".nah-maint-gm")?.querySelector("[name=malfTable]")?.value ?? null;
      return this.act(() => MaintOps.malfunction(this.actor, id, { table, reason: "gm" }));
    },
    maintClear(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => MaintOps.clearMalfunction(this.actor, id));
    },
    maintDrop(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => MaintOps.dropItem(this.actor, this.actor.items.get(id)));
    },
    maintNewCycle() {
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: L("NEONHOME.Maint.NewCycleTitle"), icon: "fa-solid fa-calendar-check" },
          content: `<p>${L(`NEONHOME.Maint.NewCycleAsk.${MaintOps.mode === "week" ? "week" : "month"}`)}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await MaintOps.newCycle();
      });
    },
    maintRentDay() {
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: L("NEONHOME.Maint.ToRentDay"), icon: "fa-solid fa-calendar-day" },
          content: `<p>${L("NEONHOME.Maint.ToRentDayAsk")}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await MaintOps.toRentDay(this.actor);
      });
    },
    maintBreak() {
      return this.act(async () => {
        const answer = await askBreak(this.actor, await MaintOps.list(this.actor));
        if (answer?.ids.length) await MaintOps.damage(this.actor, answer.ids, answer);
      });
    }
  },

  onRender(app, root) {
    for (const select of root.querySelectorAll("select[data-maint]")) {
      select.addEventListener("change", () => {
        if (select.dataset.maint === "mechanic") {
          app.uiState.maint = { ...(app.uiState.maint ?? {}), mechanic: select.value || null };
          app.render();
        } else if (select.dataset.maint === "lifestyle") {
          app.act(() => MaintOps.setLifestyle(app.actor, select.value === "" ? null : Number(select.value)));
        }
      });
    }
  }
};

/** The DV for repairing a Destroyed item: the gear's maintenance DV unless the GM says otherwise. */
function askDv(dv) {
  return Compat.DialogV2.prompt({
    window: { title: L("NEONHOME.Maint.RepairTitle"), icon: "fa-solid fa-toolbox" },
    content: `<p class="hint">${esc(L("NEONHOME.Maint.RepairHint"))}</p><div class="form-group"><label>DV</label><input type="number" name="dv" value="${dv}" min="1" max="40"></div>`,
    classes: ["neon-home-dialog"],
    rejectClose: false,
    ok: { label: L("NEONHOME.Maint.Roll"), callback: (event, button) => Number(button.form.elements.dv.value) || dv }
  }).then((v) => (v === undefined ? null : v));
}

/** GM: what broke, and why (Breaking Stuff, p.5). Resolves to { cause, hidden, ids } or null. */
function askBreak(actor, list) {
  const all = flattenList(list).filter((e) => e.condition !== "destroyed" && e.condition !== "dbr");
  const causes = DAMAGE_CAUSES.filter(Boolean);
  const rows = all.map((e) => {
    const suggest = causes.filter((c) => SUGGEST[c](e)).join(" ");
    return `<label class="nah-check" style="--depth:${e.depth}"><input type="checkbox" name="item" value="${e.id}" data-suggest="${suggest}"> ${esc(e.name)}${e.condition === "damaged" ? ` <small>(${esc(L("NEONHOME.Condition.damaged"))})</small>` : ""}</label>`;
  }).join("");
  const content = `<p class="hint">${esc(L("NEONHOME.Maint.BreakHint"))}</p>`
    + `<div class="form-group"><label>${esc(L("NEONHOME.Maint.Why"))}</label><select name="cause">${causes.map((c) => `<option value="${c}">${esc(L(`NEONHOME.Maint.Cause.${c}`))}</option>`).join("")}</select></div>`
    + `<p class="hint nah-cause-hint"></p>`
    + `<label class="nah-check"><input type="checkbox" name="hidden"> ${esc(L("NEONHOME.Maint.KeepQuiet"))}</label>`
    + `<div class="nah-drop-list nah-break-list">${rows || `<em>${esc(L("NEONHOME.Maint.Nothing"))}</em>`}</div>`;
  return Compat.DialogV2.prompt({
    window: { title: L("NEONHOME.Maint.BreakTitle", { name: actor.name }), icon: "fa-solid fa-hammer" },
    position: { width: 480 },
    content,
    classes: ["neon-home-dialog"],
    rejectClose: false,
    // v12 passes the dialog's HTML element, v13 the dialog itself
    render: (event, arg) => {
      const root = arg instanceof HTMLElement ? arg : arg?.element ?? event?.target?.element;
      const form = root?.querySelector("form") ?? root;
      const cause = form?.querySelector("[name=cause]");
      if (!cause) return;
      const sync = () => {
        for (const box of form.querySelectorAll("[name=item]")) box.checked = box.dataset.suggest.split(" ").includes(cause.value);
        form.querySelector(".nah-cause-hint").textContent = L(`NEONHOME.Maint.CauseHint.${cause.value}`);
      };
      cause.addEventListener("change", sync);
      sync();
    },
    ok: {
      label: L("NEONHOME.Maint.BreakConfirm"),
      callback: (event, button) => {
        const f = button.form;
        return { cause: f.elements.cause.value, hidden: f.elements.hidden.checked, ids: [...f.querySelectorAll("[name=item]:checked")].map((el) => el.value) };
      }
    }
  });
}
