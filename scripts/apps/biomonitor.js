import { TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { SYNDROMES, SEVERITIES, TIERS, psycheState } from "../data/syndromes.js";

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
    // v12 passes only the event (its target is the dialog); v13 passes the dialog too.
    render: (event, dialog) => {
      const app = dialog ?? event?.target;
      const form = app.element.querySelector("form") ?? app.element;
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

export const Biomonitor = {
  id: "biomonitor",
  icon: "fa-solid fa-heart-pulse",
  label: "NEONHOME.Bio.Title",
  template: `${TEMPLATE_PATH}/biomonitor.hbs`,

  async prepare(app, actor) {
    const isGM = game.user.isGM;
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
    const injuries = actor.items.filter((i) => i.type === "criticalInjury").map(injury);
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
        headHurt: injuries.some((i) => i.location === "head"),
        bodyHurt: injuries.some((i) => i.location === "body"),
        headInjuries: injuries.filter((i) => i.location === "head").length,
        bodyInjuries: injuries.filter((i) => i.location === "body").length,
        humanity: {
          ...hum,
          pct: pct(Math.max(0, hum.value), scale),
          markers: [30, 20, 10].filter((m) => m < scale).map((m) => ({ value: m, pct: pct(m, scale) }))
        },
        emp,
        syndromesOn: !!Settings.get("syndromes")
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
    bioOpenInjury(event, target) {
      this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId)?.sheet.render(true);
    }
  }
};
