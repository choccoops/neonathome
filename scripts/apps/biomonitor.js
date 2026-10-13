import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { SYNDROMES, SEVERITIES, TIERS, psycheState } from "../data/syndromes.js";
import { traumaMap, ANCHORS, SEVERED_SHAPES } from "../data/injuries.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const { getProperty } = foundry.utils;
const pct = (v, m) => (m > 0 ? Math.max(0, Math.min(100, Math.round((v / m) * 100))) : 0);

/** A Syndrome's name: from the catalog, or its own (custom). */
function syndromeName(s) {
  return s.key === "custom" ? s.name || L("NEONHOME.Syndrome.custom") : L(`NEONHOME.Syndrome.${s.key}`);
}

function injury(item) {
  const s = item.system ?? {};
  const q = s.quickFix ?? {};
  const t = s.treatment ?? {};
  const quick = q.type === "firstAidParamedic" ? L("NEONHOME.Bio.QuickFirstAid", { a: q.dvFirstAid, b: q.dvParamedic })
    : q.type === "paramedic" ? L("NEONHOME.Bio.QuickParamedic", { b: q.dvParamedic }) : L("NEONHOME.Bio.NA");
  const treat = t.type === "paramedicSurgery" ? L("NEONHOME.Bio.TreatBoth", { a: t.dvParamedic, b: t.dvSurgery })
    : t.type === "surgery" ? L("NEONHOME.Bio.TreatSurgery", { b: t.dvSurgery }) : L("NEONHOME.Bio.TreatQuick");
  const location = s.location === "head" ? "head" : "body";
  return { id: item.id, name: item.name, img: item.img, location, locLabel: L(`NEONHOME.Location.${location}`), quick, treat, deathSave: !!s.deathSaveIncrease };
}

/** Ask which Syndrome to add (from the list, the GM's own, or a custom one). */
async function syndromeDialog(defaultTier) {
  const custom = Settings.customSyndromes;
  const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  const groups = SEVERITIES.map((sev) => {
    const own = SYNDROMES.filter((s) => s.severity === sev).map((s) => opt(s.key, L(`NEONHOME.Syndrome.${s.key}`)));
    const gm = custom.filter((s) => s.severity === sev).map((s, i) => opt(`gm:${custom.indexOf(s)}`, s.name || `#${i + 1}`));
    return `<optgroup label="${esc(L(`NEONHOME.Severity.${sev}`))}">${[...own, ...gm].join("")}</optgroup>`;
  }).join("");
  const variants = SYNDROMES.filter((s) => s.variants).flatMap((s) => s.variants.map((v) => `<option value="${esc(v.key)}" data-for="${s.key}">${esc(L(`NEONHOME.Syndrome.Variant.${v.key}`))}</option>`)).join("");
  const tiers = [1, 2, 3].map((t) => `<option value="${t}" ${t === defaultTier ? "selected" : ""}>${esc(L(`NEONHOME.Bio.Tier.${TIERS[t].key}`))} (EMP ${TIERS[t].emp})</option>`).join("");
  const content = `
    <div class="form-group"><label>${L("NEONHOME.Bio.Syndrome")}</label><select name="key">${groups}<option value="custom">${esc(L("NEONHOME.Syndrome.custom"))}</option></select></div>
    <div class="form-group nah-variant"><label>${L("NEONHOME.Bio.Variant")}</label><select name="variant"><option value=""></option>${variants}</select></div>
    <div class="form-group"><label>${L("NEONHOME.Bio.PickedAt")}</label><select name="tier">${tiers}</select></div>
    <fieldset class="nah-custom-fields"><legend>${L("NEONHOME.Syndrome.custom")}</legend>
      <div class="form-group"><label>${L("NEONHOME.Bio.Name")}</label><input type="text" name="name"></div>
      <div class="form-group"><label>${L("NEONHOME.Bio.Severity")}</label><select name="severity">${SEVERITIES.map((s) => opt(s, L(`NEONHOME.Severity.${s}`))).join("")}</select></div>
      <div class="form-group stacked"><label>${L("NEONHOME.Bio.Summary")}</label><textarea name="summary" rows="2"></textarea></div>
      <div class="form-group stacked"><label>${L("NEONHOME.Bio.Stressor")}</label><textarea name="stressor" rows="3"></textarea></div>
    </fieldset>`;
  return Compat.DialogV2.prompt({
    window: { title: L("NEONHOME.Bio.AddSyndrome"), icon: "fa-solid fa-brain" },
    position: { width: 460 },
    content,
    classes: ["neon-home-dialog"],
    rejectClose: false,
    // v12 passes the dialog's HTML element, v13 the dialog itself; the event's target is the dialog.
    render: (event, arg) => {
      const root = arg instanceof HTMLElement ? arg : arg?.element ?? event?.target?.element;
      if (!root) return;
      const form = root.querySelector("form") ?? root;
      const key = form.querySelector("[name=key]");
      const sync = () => {
        const k = key.value;
        let any = false;
        for (const o of form.querySelectorAll("[name=variant] option[data-for]")) {
          o.hidden = o.dataset.for !== k;
          any ||= !o.hidden;
        }
        form.querySelector(".nah-variant").hidden = !any;
        if (!any) form.querySelector("[name=variant]").value = "";
        form.querySelector(".nah-custom-fields").hidden = k !== "custom";
      };
      key.addEventListener("change", sync);
      sync();
    },
    ok: {
      label: L("NEONHOME.Bio.Add"),
      callback: (event, button) => {
        const f = button.form.elements;
        return { key: f.key.value, variant: f.variant.value, tier: Number(f.tier.value), name: f.name.value, severity: f.severity.value, summary: f.summary.value, stressor: f.stressor.value };
      }
    }
  });
}

/** A position on the figure as a share of its size. */
function onFigure(anchor, side) {
  const a = ANCHORS[anchor] ?? ANCHORS.chest;
  const p = a.L ? a[side ?? "R"] : a;
  return { left: Math.round((p.x / 200) * 1000) / 10, top: Math.round((p.y / 350) * 1000) / 10 };
}

/** The cyberware monitor: the scan's marks and chrome limbs, and each type's pieces and slots. */
function cyberContext(actor, isGM) {
  const m = HomeOps.cyberware(actor);
  // What's shown: why it's offline, else Damaged (unless the GM is keeping that quiet), else ok.
  const shownKey = (n) => n.state || (n.damaged && (isGM || !n.hidden) ? "damaged" : "ok");
  const stateKey = (st) => st || "ok";
  const sets = (n) => ({
    is: { ok: !n.condition, damaged: n.condition === "damaged", destroyed: n.condition === "destroyed", dbr: n.condition === "dbr" },
    emp: n.emp,
    hiddenDamage: isGM && n.hidden
  });
  const row = (n, depth) => [
    {
      id: n.id,
      name: n.name,
      img: n.img,
      depth,
      size: n.size,
      weapon: n.weapon,
      state: shownKey(n),
      own: stateKey(n.own),
      ...sets(n),
      inherited: n.inheritedOffline,
      stateLabel: L(`NEONHOME.Cyber.State.${shownKey(n)}`)
    },
    ...n.children.flatMap((c) => row(c, depth + 1))
  ];
  const card = (n) => ({
    id: n.id,
    name: n.name,
    img: n.img,
    core: n.core,
    meat: n.meat,
    side: n.side ? L(`NEONHOME.Bio.Side.${n.side}`) : "",
    state: shownKey(n),
    own: stateKey(n.own),
    ...sets(n),
    stateLabel: L(`NEONHOME.Cyber.State.${shownKey(n)}`),
    slots: n.slots,
    used: n.used,
    over: n.used > n.slots,
    upgrades: n.upgrades.join(", "),
    // one socket per option slot, filled by what's installed (by size)
    sockets: Array.from({ length: Math.max(n.slots, n.used) }, (_, i) => ({ filled: i < n.used, over: i >= n.slots })),
    rows: n.children.flatMap((c) => row(c, 0))
  });
  return {
    total: m.total,
    offline: m.offline,
    emp: m.emp,
    destroyed: m.destroyed,
    damaged: isGM ? m.damaged : 0,
    canEdit: isGM,
    marks: m.marks.map((k) => ({
      ...onFigure(k.anchor, k.side),
      state: stateKey(k.state === "damaged" && !isGM && !k.knownDamage ? "" : k.state),
      count: k.count,
      multi: k.count > 1,
      rootId: k.rootId,
      tip: [`<b>${esc(L(`NEONHOME.Cyber.Type.${k.type}`))}</b>`, ...k.names.map((nm) => esc(nm))].join("<br>")
    })),
    limbs: m.marks.filter((k) => k.limb && k.side).map((k) => ({ ...SEVERED_SHAPES[k.limb][k.side], state: stateKey(k.rootState === "damaged" && !isGM && !k.rootKnown ? "" : k.rootState) })),
    types: m.types.map((t) => ({
      type: t.type,
      label: L(`NEONHOME.Cyber.Type.${t.type}`),
      icon: { neuralWare: "fa-solid fa-brain", cyberEye: "fa-solid fa-eye", cyberAudioSuite: "fa-solid fa-ear-listen", cyberArm: "fa-solid fa-hand-fist", cyberLeg: "fa-solid fa-person-walking", cyberwareInternal: "fa-solid fa-lungs", cyberwareExternal: "fa-solid fa-shield-halved", fashionware: "fa-solid fa-gem", borgware: "fa-solid fa-robot" }[t.type] ?? "fa-solid fa-microchip",
      empty: L(t.type === "neuralWare" ? "NEONHOME.Cyber.NoLink" : "NEONHOME.Cyber.None"),
      cards: t.roots.map(card)
    }))
  };
}

export const Biomonitor = {
  id: "biomonitor",
  icon: "fa-solid fa-heart-pulse",
  label: "NEONHOME.Bio.Title",
  template: `${TEMPLATE_PATH}/biomonitor.hbs`,

  async prepare(app, actor) {
    const isGM = game.user.isGM;
    const view = (app.uiState.bio ??= { view: "vitals" }).view;
    const hp = CPR.hp(actor);
    const serious = Number(getProperty(actor, "system.derivedStats.seriouslyWounded")) || Math.ceil(hp.max / 2);
    const wound = String(getProperty(actor, "system.derivedStats.currentWoundState") ?? "");
    const deathPenalty = Number(getProperty(actor, "system.derivedStats.deathSave.penalty")) || 0;
    const ext = getProperty(actor, "system.externalData") ?? {};
    const armor = (key) => {
      const a = ext[key] ?? {};
      const item = a.id ? actor.items.get(a.id) : null;
      return item ? { name: item.name, value: Number(a.value) || 0, max: Number(a.max) || 0, pct: pct(Number(a.value) || 0, Number(a.max) || 0) } : null;
    };
    const injuryItems = actor.items.filter((i) => i.type === "criticalInjury");
    const trauma = traumaMap(injuryItems, MODULE_ID);
    const sideOf = new Map(trauma.marks.flatMap((m) => m.injuries.map((i) => [i.id, m.side])));
    const injuries = injuryItems.map((item) => {
      const d = injury(item);
      const side = sideOf.get(item.id);
      return { ...d, side, sideLabel: side ? L(`NEONHOME.Bio.Side.${side}`) : "" };
    });
    const byId = new Map(injuries.map((i) => [i.id, i]));
    const stack = (n) => Math.min(3, n);
    const hum = CPR.humanity(actor);
    const emp = CPR.emp(actor);
    const scale = Math.max(hum.max, 1);
    const ctx = {
      bio: {
        isGM,
        hp: {
          ...hp,
          pct: pct(hp.value, hp.max),
          seriousPct: pct(serious, hp.max),
          serious,
          state: wound ? L(`CPR.global.woundState.${wound}`) : "",
          stateKey: wound || "notWounded"
        },
        deathPenalty,
        armor: { head: armor("currentArmorHead"), body: armor("currentArmorBody"), shield: armor("currentArmorShield") },
        injuries,
        headHurt: stack(trauma.head),
        bodyHurt: stack(trauma.body),
        headInjuries: trauma.head,
        bodyInjuries: trauma.body,
        trauma: {
          level: trauma.level,
          label: L(`NEONHOME.Bio.Trauma.${trauma.level}`),
          total: trauma.total,
          deathSaves: trauma.deathSaves,
          // one marker per spot, positioned as a share of the figure
          marks: trauma.marks.map((m) => ({
            left: Math.round((m.x / 200) * 1000) / 10,
            top: Math.round((m.y / 350) * 1000) / 10,
            stack: stack(m.count),
            count: m.count,
            multi: m.count > 1,
            kind: m.kind,
            first: m.injuries[0].id,
            tip: [
              `<b>${esc(L(`NEONHOME.Bio.Place.${m.anchor}`))}${m.side ? ` (${esc(L(`NEONHOME.Bio.Side.${m.side}`))})` : ""}</b>`,
              ...m.injuries.map((i) => `${esc(i.name)} · ${esc(byId.get(i.id)?.quick ?? "")}`)
            ].join("<br>")
          })),
          severed: trauma.severed.map((sv) => ({ ...sv, x1: sv.cut[0], y1: sv.cut[1], x2: sv.cut[2], y2: sv.cut[3] }))
        },
        humanity: {
          ...hum,
          pct: pct(Math.max(0, hum.value), scale),
          markers: [30, 20, 10].filter((m) => m < scale).map((m) => ({ value: m, pct: pct(m, scale) }))
        },
        emp,
        syndromesOn: !!Settings.get("syndromes"),
        view: { vitals: view !== "cyber", cyber: view === "cyber" },
        cyber: cyberContext(actor, isGM)
      }
    };
    if (!ctx.bio.syndromesOn) return ctx;

    const psyche = HomeStore.psyche(actor);
    const state = psycheState(psyche, hum.value);
    const catalog = new Map(SYNDROMES.map((s) => [s.key, s]));
    ctx.bio.psyche = {
      tier: state.tier,
      tierLabel: L(`NEONHOME.Bio.Tier.${state.tierKey}`),
      tierKey: state.tierKey,
      tierEmp: state.emp,
      antipathy: state.antipathy,
      extreme: state.extreme,
      inTheSystem: psyche.inTheSystem,
      breakdown: psyche.breakdown,
      catharsis: psyche.catharsis,
      catharsisPct: pct(psyche.catharsis, scale),
      inspiration: psyche.inspiration,
      pips: Array.from({ length: Math.max(psyche.inspiration, 3) }, (_, i) => ({ on: i < psyche.inspiration })),
      owed: state.owed,
      owedText: state.owed ? L(`NEONHOME.Bio.Owed.${state.need ?? "mild"}`, { points: state.points, need: state.pointsNeeded }) : "",
      needsScar: state.needsScar,
      scarSeverity: state.scarSeverity ? L(`NEONHOME.Severity.${state.scarSeverity}`) : "",
      tiers: TIERS.map((t, i) => ({ label: L(`NEONHOME.Bio.Tier.${t.key}`), emp: t.emp, current: i === state.tier, reached: i <= state.deepest, catharsis: t.catharsis })),
      syndromes: state.syndromes.map((s) => {
        const base = catalog.get(s.key);
        const variant = base?.variants?.find((v) => v.key === s.variant);
        const stressors = [...(base?.stressors ?? []), ...(variant ? [variant.stressor] : []), ...(s.stressor ? s.stressor.split(/\r?\n/).filter(Boolean) : [])];
        return {
          id: s.id,
          name: syndromeName(s),
          variant: variant ? L(`NEONHOME.Syndrome.Variant.${variant.key}`) : "",
          icon: base?.icon ?? "fa-solid fa-brain",
          severity: L(`NEONHOME.Severity.${s.current}`),
          severityKey: s.current,
          upgraded: s.upgradedAt !== null && s.current !== s.severity,
          summary: s.summary || base?.summary || "",
          stressors,
          state: s.scar ? "scar" : s.dormant ? "dormant" : "active",
          stateLabel: L(`NEONHOME.Bio.State.${s.scar ? "scar" : s.dormant ? "dormant" : "active"}`),
          worst: s.worst && s.active,
          pickedAt: L(`NEONHOME.Bio.Tier.${TIERS[s.tier].key}`),
          canUpgrade: s.severity === "mild" && s.upgradedAt === null && state.tier >= 2 && s.active,
          isScar: psyche.scar === s.id,
          canScar: !!state.scarSeverity && psyche.scar !== s.id
        };
      })
    };
    return ctx;
  },

  actions: {
    async bioAddSyndrome() {
      const actor = this.actor;
      const state = psycheState(HomeStore.psyche(actor), CPR.humanity(actor).value);
      const pick = await syndromeDialog(Math.max(1, Math.min(3, state.tier)));
      if (!pick) return;
      let data = { key: pick.key, variant: pick.variant, tier: pick.tier };
      if (pick.key.startsWith("gm:")) {
        const s = Settings.customSyndromes[Number(pick.key.slice(3))] ?? {};
        data = { key: "custom", tier: pick.tier, name: s.name, severity: s.severity, summary: s.summary, stressor: s.stressor };
      } else if (pick.key === "custom") {
        data = { key: "custom", tier: pick.tier, name: pick.name, severity: pick.severity, summary: pick.summary, stressor: pick.stressor };
      }
      return this.act(() => HomeOps.addSyndrome(actor, data));
    },
    bioUpgrade(event, target) {
      const id = target.closest("[data-syndrome]").dataset.syndrome;
      const tier = Math.max(2, Math.min(3, psycheState(HomeStore.psyche(this.actor), CPR.humanity(this.actor).value).tier));
      return this.act(() => HomeOps.upgradeSyndrome(this.actor, id, tier));
    },
    bioScar(event, target) {
      const id = target.closest("[data-syndrome]").dataset.syndrome;
      return this.act(() => HomeOps.updatePsyche(this.actor, (p) => {
        p.scar = id;
      }));
    },
    async bioRemove(event, target) {
      const id = target.closest("[data-syndrome]").dataset.syndrome;
      const ok = await Compat.DialogV2.confirm({
        window: { title: L("NEONHOME.Bio.RemoveTitle") },
        content: `<p>${esc(L("NEONHOME.Bio.RemoveConfirm"))}</p>`,
        classes: ["neon-home-dialog"],
        rejectClose: false
      });
      if (ok) return this.act(() => HomeOps.removeSyndrome(this.actor, id));
    },
    async bioTherapy() {
      if (!game.user.isGM) return;
      const ok = await Compat.DialogV2.confirm({
        window: { title: L("NEONHOME.Bio.Therapy") },
        content: `<p>${esc(L("NEONHOME.Bio.TherapyConfirm"))}</p>`,
        classes: ["neon-home-dialog"],
        rejectClose: false
      });
      if (ok) return this.act(() => HomeOps.therapy(this.actor));
    },
    bioAdjust(event, target) {
      if (!game.user.isGM) return;
      const field = target.dataset.field;
      const delta = Number(target.dataset.delta) || 0;
      return this.act(() => HomeOps.updatePsyche(this.actor, (p) => {
        p[field] = Math.max(0, (Number(p[field]) || 0) + delta);
      }));
    },
    bioToggle(event, target) {
      if (!game.user.isGM) return;
      const field = target.dataset.field;
      return this.act(() => HomeOps.updatePsyche(this.actor, (p) => {
        p[field] = !p[field];
      }));
    },
    bioSpend(event, target) {
      return this.act(() => HomeOps.spendInspiration(this.actor, target.dataset.use));
    },
    /** Move an injury on a paired body part (arm, eye, ribs...) to the other side. */
    bioFlipSide(event, target) {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      if (!item) return;
      const side = traumaMap(this.actor.items.filter((i) => i.type === "criticalInjury"), MODULE_ID)
        .marks.find((m) => m.injuries.some((i) => i.id === item.id))?.side;
      return this.act(() => item.setFlag(MODULE_ID, "side", side === "L" ? "R" : "L"));
    },
    bioView(event, target) {
      this.uiState.bio = { ...(this.uiState.bio ?? {}), view: target.dataset.view };
      this.render();
    },
    /** GM: a piece of cyberware's condition (Breaking Your Stuff): working, Damaged, Destroyed, Destroyed Beyond Repair. */
    cyberCondition(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.setCondition(this.actor, id, target.dataset.condition || ""));
    },
    /** GM: knock a piece of cyberware out with EMP, or bring it back. */
    cyberEmp(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.setEmp(this.actor, id, target.dataset.on === "1"));
    },
    bioOpenInjury(event, target) {
      this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId)?.sheet.render(true);
    }
  }
};
