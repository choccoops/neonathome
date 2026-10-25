import { TEMPLATE_PATH } from "../constants.js";
import { Settings } from "../settings.js";
import { CPR } from "../cpr.js";
import { Compat } from "../compat.js";
import { PerkOps, BRANCH_ICONS } from "../home/perk-ops.js";
import { LIFESTYLES } from "../data/maintenance.js";
import {
  PERKS, PERK_BY_ID, BRANCHES, treeOf, crossPrereqs, checkPerk, dormant, blockers, perkChanges, hasDeed
} from "../data/perks.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** How a requirement reads. */
function reqLabel(r) {
  const stat = (s) => L(`NEONHOME.Perks.Stat.${s}`);
  const perkName = (id) => PERK_BY_ID.get(id)?.name ?? id;
  switch (r.t) {
    case "stat": return r.max !== undefined ? L("NEONHOME.Perks.Req.atMost", { what: stat(r.stat), n: r.max }) : L("NEONHOME.Perks.Req.atLeast", { what: stat(r.stat), n: r.min });
    case "empMax": return L("NEONHOME.Perks.Req.empMax", { n: r.min });
    case "skill": return r.max !== undefined ? L("NEONHOME.Perks.Req.atMost", { what: r.skill, n: r.max }) : L("NEONHOME.Perks.Req.atLeast", { what: r.skill, n: r.min });
    case "anySkill": return L("NEONHOME.Perks.Req.anySkill", { kind: L(`NEONHOME.Perks.Kind.${r.kind}`) + (r.match ? ` (${r.match})` : ""), n: r.min });
    case "allSkills": return L("NEONHOME.Perks.Req.allSkills", { kind: L(`NEONHOME.Perks.Kind.${r.kind}`), n: r.min });
    case "role": return L("NEONHOME.Perks.Req.atLeast", { what: L(`NEONHOME.Downtime.Role.${r.role}`), n: r.min });
    case "anyRole": return L("NEONHOME.Perks.Req.anyRole", { n: r.min });
    case "perk": return L("NEONHOME.Perks.Req.perk", { perk: perkName(r.perk) });
    case "anyPerk": return L("NEONHOME.Perks.Req.perk", { perk: r.perks.map(perkName).join(L("NEONHOME.Perks.Req.or")) });
    case "noPerk": return L("NEONHOME.Perks.Req.noPerk", { perk: r.perks.map(perkName).join(L("NEONHOME.Perks.Req.or")) });
    case "perkCount": return L("NEONHOME.Perks.Req.perkCount", { n: r.n });
    case "lifestyle": return L("NEONHOME.Perks.Req.lifestyle", { lifestyle: L(`NEONHOME.Maint.Lifestyle.${LIFESTYLES[r.tier]}`) });
    case "deed": return r.text;
    case "creation": return L("NEONHOME.Perks.Req.creation");
    case "weapon": return r.types[0] === "shield" ? L("NEONHOME.Perks.Req.shield") : L("NEONHOME.Perks.Req.weapon", { types: r.types.map((t) => L(`CPR.global.weaponType.${t === "bow" ? "bowsAndCrossbows" : t}`)).join(" / ") });
    case "cyber": return L(`NEONHOME.Perks.Req.cyber${r.options ? "Options" : ""}`, { n: r.n, types: r.types ? r.types.map((t) => L(`NEONHOME.Cyber.Type.${t}`)).join(" / ") : L("NEONHOME.Perks.Req.anyCyber") });
    case "any": return r.of.map(reqLabel).join(L("NEONHOME.Perks.Req.or"));
    case "all": return r.of.map(reqLabel).join(L("NEONHOME.Perks.Req.and"));
    default: return "";
  }
}

/** Where a perk stands for a character: on, off, dormant, ready, locked, gone. */
function stateOf(perk, ctx) {
  const owned = ctx.record.owned.find((o) => o.id === perk.id);
  if (owned) {
    if (dormant(perk, ctx.sheet, ctx.record)) return "dormant";
    const e = PerkOps.effect(ctx.actor, perk.id);
    return e?.disabled ? "off" : "on";
  }
  if (ctx.record.gone.includes(perk.id)) return "gone";
  return blockers(perk, ctx.sheet, ctx.record, ctx.roles).filter((b) => b !== "points").length ? "locked" : ctx.pts.available >= perk.cost ? "ready" : "short";
}

function card(perk, ctx, from = []) {
  const state = stateOf(perk, ctx);
  return {
    id: perk.id,
    name: perk.name,
    icon: BRANCH_ICONS[perk.branch],
    pips: Array.from({ length: perk.cost }, () => ({})),
    cost: perk.cost,
    state,
    stateLabel: L(`NEONHOME.Perks.State.${state}`),
    from: from.join(" "),
    cross: crossPrereqs(perk).map((id) => PERK_BY_ID.get(id)?.name).join(", "),
    deed: hasDeed(perk) && !ctx.record.deeds[perk.id] && state !== "on" && state !== "off" && state !== "dormant",
    selected: perk.id === ctx.focus
  };
}

/**
 * A branch as trees: groups (a role, a specialty, a Free City section, or the whole branch). In
 * each, perks that build on one another are rows (columns by depth, linked), and the stand-alone
 * ones flow in a grid after them.
 */
function tree(branch, ctx) {
  const t = treeOf(branch);
  const list = PERKS.filter((p) => p.branch === branch);
  const groupsOf = [...new Set(list.map((p) => p.group ?? ""))];
  // a character's own Roles first
  if (branch === "role") groupsOf.sort((a, b) => (ctx.roles[b] !== undefined) - (ctx.roles[a] !== undefined));
  return groupsOf.map((g) => {
    const perks = list.filter((p) => (p.group ?? "") === g);
    const ids = new Set(perks.map((p) => p.id));
    // linked perks, as connected sets (a perk and everything that builds on it, in this group)
    const links = new Map(perks.map((p) => [p.id, new Set()]));
    for (const p of perks) {
      for (const from of t.get(p.id).from) {
        if (!ids.has(from)) continue;
        links.get(p.id).add(from);
        links.get(from).add(p.id);
      }
    }
    const seen = new Set();
    const rows = [];
    const loose = [];
    for (const p of perks) {
      if (seen.has(p.id)) continue;
      const set = [];
      const stack = [p.id];
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        set.push(id);
        stack.push(...links.get(id));
      }
      if (set.length === 1) {
        loose.push(card(p, ctx));
        continue;
      }
      const members = perks.filter((x) => set.includes(x.id));
      const depth = Math.max(...members.map((x) => t.get(x.id).depth));
      rows.push({
        columns: Array.from({ length: depth + 1 }, (_, d) => ({
          cards: members.filter((x) => t.get(x.id).depth === d).map((x) => card(x, ctx, t.get(x.id).from.filter((f) => ids.has(f))))
        }))
      });
    }
    return {
      key: g || branch,
      label: g ? L(`NEONHOME.Perks.Group.${g}`) : "",
      mine: branch === "role" && ctx.roles[g] !== undefined,
      rows,
      loose
    };
  });
}

function detail(perk, ctx) {
  const owned = ctx.record.owned.find((o) => o.id === perk.id);
  const state = stateOf(perk, ctx);
  const checks = checkPerk(perk, ctx.sheet, ctx.record);
  const why = blockers(perk, ctx.sheet, ctx.record, ctx.roles, { inCombat: PerkOps.inCombat(ctx.actor) });
  const fx = perkChanges(perk, owned ?? { stat: null }, PerkOps.base(ctx.actor));
  const choose = perk.fx?.some((f) => f.choose);
  return {
    id: perk.id,
    name: perk.name,
    icon: BRANCH_ICONS[perk.branch],
    branch: L(`NEONHOME.Perks.Branch.${perk.branch}`) + (perk.group ? ` · ${L(`NEONHOME.Perks.Group.${perk.group}`)}` : ""),
    cost: perk.cost,
    pips: Array.from({ length: perk.cost }, () => ({})),
    text: perk.text,
    state,
    stateLabel: L(`NEONHOME.Perks.State.${state}`),
    owned: !!owned,
    on: state === "on",
    free: !!owned?.free,
    chosen: owned?.stat ? L(`NEONHOME.Perks.Stat.${owned.stat}`) : "",
    reqs: checks.map((c) => ({ label: reqLabel(c.req), ok: c.ok, deed: JSON.stringify(c.req).includes('"t":"deed"'), auto: c.auto })),
    none: !perk.req.length,
    hasDeed: hasDeed(perk),
    confirmed: !!ctx.record.deeds[perk.id],
    sheet: fx.map((c) => L(`NEONHOME.Perks.Fx.${c.sit ? "sit" : "on"}`, { key: L(`NEONHOME.Perks.Key.${c.key.replace(/^bonuses\.|^system\.stats\.|\.value$/g, "")}`), value: c.value > 0 ? `+${c.value}` : c.value })),
    choose: choose && !owned ? L("NEONHOME.Perks.ChooseNote") : "",
    noFx: !perk.fx?.length,
    slot: perk.slot ? L(`NEONHOME.Perks.Slot.${perk.slot}`) : "",
    refund: !!perk.refund,
    canBuy: !owned && !why.length,
    block: !owned && why.length ? L(`NEONHOME.Perks.Block.${why[0]}`, { name: ctx.actor.name, perk: perk.name }) : "",
    canForce: ctx.isGM && !owned,
    canDrop: !!owned && !!perk.slot,
    canToggle: !!owned && state !== "dormant"
  };
}

export const Perks = {
  id: "perks",
  // its own window (PerksApp), not a tab of the home
  standalone: true,
  icon: "fa-solid fa-diagram-project",
  label: "NEONHOME.Perks.Title",
  template: `${TEMPLATE_PATH}/perks.hbs`,
  available: () => Settings.get("perks") !== false,

  async prepare(app, actor) {
    const isGM = game.user.isGM;
    const ui = (app.uiState.perks ??= { branch: "general", focus: null });
    const record = PerkOps.record(actor);
    const roles = CPR.roles(actor);
    const pts = PerkOps.points(actor, record);
    const ctx = { actor, record, roles, pts, sheet: PerkOps.sheet(actor), isGM, focus: ui.focus };
    if (!BRANCHES.includes(ui.branch)) ui.branch = "general";
    const inBranch = PERKS.filter((p) => p.branch === ui.branch);
    if (!PERK_BY_ID.get(ui.focus)) ui.focus = inBranch[0]?.id ?? null;
    ctx.focus = ui.focus;
    const ownedIds = record.owned.map((o) => o.id);
    const active = record.owned.map((o) => {
      const perk = PERK_BY_ID.get(o.id);
      const state = stateOf(perk, ctx);
      return { id: o.id, name: perk.name, icon: BRANCH_ICONS[perk.branch], state, stateLabel: L(`NEONHOME.Perks.State.${state}`), branch: perk.branch };
    });
    const slotName = (slot) => PERK_BY_ID.get(ownedIds.find((id) => PERK_BY_ID.get(id)?.slot === slot))?.name ?? "";
    return {
      perks: {
        isGM,
        owner: actor.isOwner,
        pts,
        spentAll: pts.spent + pts.forfeit,
        onCount: active.filter((a) => a.state === "on").length,
        ownedCount: active.length,
        dormantCount: active.filter((a) => a.state === "dormant").length,
        cyber: slotName("cyber"),
        weapon: slotName("weapon"),
        kills: record.kills,
        creation: record.creation,
        awards: record.awards.slice(-6).reverse().map((a) => ({ n: a.n > 0 ? `+${a.n}` : String(a.n), reason: a.reason })),
        active,
        branches: BRANCHES.map((b) => ({
          key: b,
          label: L(`NEONHOME.Perks.Branch.${b}`),
          icon: BRANCH_ICONS[b],
          selected: b === ui.branch,
          owned: PERKS.filter((p) => p.branch === b && ownedIds.includes(p.id)).length,
          count: PERKS.filter((p) => p.branch === b).length
        })),
        branchLabel: L(`NEONHOME.Perks.Branch.${ui.branch}`),
        groups: tree(ui.branch, ctx),
        focus: ui.focus ? detail(PERK_BY_ID.get(ui.focus), ctx) : null,
        flash: ui.flash ?? null
      }
    };
  },

  actions: {
    perkBranch(event, target) {
      const ui = (this.uiState.perks ??= {});
      ui.branch = target.dataset.branch;
      ui.focus = null;
      this.render();
    },
    perkFocus(event, target) {
      const ui = (this.uiState.perks ??= {});
      const id = target.closest("[data-perk]")?.dataset.perk;
      const perk = PERK_BY_ID.get(id);
      if (!perk) return;
      ui.focus = id;
      ui.branch = perk.branch;
      this.render();
    },
    perkBuy(event, target) {
      const id = target.closest("[data-perk]")?.dataset.perk;
      const mode = target.dataset.mode;
      const ui = (this.uiState.perks ??= {});
      return this.act(async () => {
        const res = await PerkOps.buy(this.actor, id, { force: mode === "force", free: mode === "free" });
        if (res) ui.flash = id;
      });
    },
    perkToggle(event, target) {
      const id = target.closest("[data-perk]")?.dataset.perk;
      return this.act(() => PerkOps.toggle(this.actor, id, target.dataset.on === "1"));
    },
    perkRemove(event, target) {
      const id = target.closest("[data-perk]")?.dataset.perk;
      const how = target.dataset.how;
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: PERK_BY_ID.get(id)?.name ?? "", icon: "fa-solid fa-diagram-project" },
          content: `<p>${L(`NEONHOME.Perks.Ask.${how}`)}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await PerkOps.remove(this.actor, id, how);
      });
    },
    perkConfirm(event, target) {
      const id = target.closest("[data-perk]")?.dataset.perk;
      return this.act(() => PerkOps.confirm(this.actor, id, target.dataset.on === "1"));
    },
    perkAward(event, target) {
      const root = target.closest(".nah-perk-gm");
      const n = Number(root?.querySelector("[name=perkAwardN]")?.value) || 0;
      const reason = root?.querySelector("[name=perkAwardWhy]")?.value ?? "";
      return this.act(() => PerkOps.award(this.actor, n, reason));
    },
    perkCreation(event, target) {
      return this.act(() => PerkOps.setCreation(this.actor, target.dataset.on === "1"));
    },
    perkRebase() {
      return this.act(() => PerkOps.rebase(this.actor));
    }
  },

  onRender(app, root) {
    const ui = (app.uiState.perks ??= {});
    // the kill count, kept by the player
    const kills = root.querySelector("[data-perk-kills]");
    kills?.addEventListener("change", () => app.act(() => PerkOps.setKills(app.actor, kills.value)));
    // the tree's links: a line from each perk to the perks built on it (lit once the first is owned)
    const canvas = root.querySelector(".nah-perk-canvas");
    for (const group of root.querySelectorAll(".nah-perk-group")) {
      const svg = group.querySelector("svg.nah-perk-links");
      if (!svg) continue;
      const box = group.getBoundingClientRect();
      const lines = [];
      for (const child of group.querySelectorAll("[data-from]")) {
        for (const id of child.dataset.from.split(" ").filter(Boolean)) {
          const parent = group.querySelector(`[data-perk="${id}"]`);
          if (!parent) continue;
          const a = parent.getBoundingClientRect();
          const b = child.getBoundingClientRect();
          const x1 = a.right - box.left;
          const y1 = a.top + a.height / 2 - box.top;
          const x2 = b.left - box.left;
          const y2 = b.top + b.height / 2 - box.top;
          const mid = (x1 + x2) / 2;
          const lit = ["on", "off", "dormant"].includes(parent.dataset.state);
          lines.push(`<path class="${lit ? "lit" : ""} ${ui.flash === id ? "surge" : ""}" d="M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}"/>`);
        }
      }
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      svg.innerHTML = lines.join("");
    }
    // a perk just unlocked: the card and the panel light up, once
    if (ui.flash) {
      const id = ui.flash;
      ui.flash = null;
      const motion = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      for (const el of root.querySelectorAll(`[data-perk="${id}"].nah-perk-card, .nah-perk-detail[data-perk="${id}"]`)) {
        el.classList.add("is-unlocking");
        if (motion && el.classList.contains("nah-perk-card")) {
          for (let i = 0; i < 12; i++) {
            const s = document.createElement("span");
            s.className = "nah-perk-spark";
            s.style.setProperty("--a", `${i * 30}deg`);
            el.appendChild(s);
          }
        }
        setTimeout(() => el.classList.remove("is-unlocking"), 1800);
      }
      root.querySelector(".nah-perk-points")?.classList.add("is-ticking");
      canvas?.querySelector(`[data-perk="${id}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  }
};
