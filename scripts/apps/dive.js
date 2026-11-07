import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Settings } from "../settings.js";
import { CPR } from "../cpr.js";
import { Compat } from "../compat.js";
import { formatMinutes } from "../home/downtime.js";
import { DiveOps } from "../home/dive-ops.js";
import {
  BLACK_ICE, ICE_IDS, DEMONS, RIGS, DIFFICULTIES, DIFFICULTY_KEYS, FLOOR_KINDS, below, floorOf, deepest, generate
} from "../data/netarch.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

const KIND_ICON = { password: "fa-solid fa-lock", file: "fa-solid fa-file-code", node: "fa-solid fa-tower-broadcast", ice: "fa-solid fa-skull", empty: "fa-solid fa-square" };

/** One floor as the map shows it: to the runner, only what they've seen or mapped; to the GM, everything. */
function floorView(f, { dive, gm, here, runners = [], arch }) {
  const seen = gm || dive?.seen.includes(f.key);
  const mapped = !seen && dive?.mapped.includes(f.key);
  const st = dive?.floors?.[f.key] ?? {};
  const ice = (st.ice ?? f.ice.map((id) => ({ id, rez: BLACK_ICE[id].rez, derezzed: false, active: false }))).map((i, n) => ({
    n, name: BLACK_ICE[i.id].name, rez: i.rez, max: BLACK_ICE[i.id].rez, pct: Math.round((i.rez / BLACK_ICE[i.id].rez) * 100), derezzed: i.derezzed, active: i.active
  }));
  const done = (f.kind === "password" && st.breached) || (f.kind === "file" && st.eyed) || (f.kind === "node" && st.controlled) || (f.kind === "ice" && (st.passed || (st.ice ?? []).length && st.ice.every((i) => i.derezzed)));
  return {
    key: f.key,
    from: f.from ?? "",
    branch: f.branch.toUpperCase(),
    depth: f.depth,
    kind: seen || mapped ? f.kind : "unknown",
    icon: seen || mapped ? KIND_ICON[f.kind] : "fa-solid fa-question",
    label: seen ? (f.label || L(`NEONHOME.Dive.Kind.${f.kind}`)) : mapped ? L(`NEONHOME.Dive.Kind.${f.kind}`) : L("NEONHOME.Dive.Unknown"),
    dv: seen && f.dv !== null && f.kind !== "ice" ? f.dv : null,
    ice: seen && f.kind === "ice" ? ice : [],
    done,
    here: here === f.key,
    virus: gm && arch.virus === f.key,
    demon: gm && arch.demon?.at === f.key,
    runners,
    note: gm ? f.note : ""
  };
}

/** The map: floors laid out by branch (columns) and depth (rows); a runner sees what they've found and the doors right below them. */
function mapOf(arch, dive, gm, runnersAt = {}) {
  const visible = arch.floors.filter((f) => gm || dive?.seen.includes(f.key) || dive?.mapped.includes(f.key) || below(arch, dive?.at ?? null).some((b) => b.key === f.key));
  const branches = [...new Set(visible.map((f) => f.branch))].sort();
  const rows = deepest({ floors: visible });
  return {
    columns: branches.length,
    rows: Array.from({ length: rows }, (_, i) => ({
      depth: i + 1,
      cells: branches.map((b) => {
        const f = visible.find((x) => x.branch === b && x.depth === i + 1);
        return f ? floorView(f, { dive, gm, here: dive?.at, runners: runnersAt[f.key] ?? [], arch }) : null;
      })
    }))
  };
}

export const Dive = {
  id: "dive",
  // its own window (DiveApp), not a tab of the home
  standalone: true,
  icon: "fa-solid fa-network-wired",
  label: "NEONHOME.Dive.Title",
  template: `${TEMPLATE_PATH}/dive.hbs`,
  available: () => Settings.get("deckTab") !== false,

  async prepare(app, actor) {
    const gm = game.user.isGM;
    const ui = (app.uiState.dive ??= { mode: "run", arch: null, target: 0, draft: null });
    if (!gm) ui.mode = "run";
    const items = DiveOps.architectures();
    const dive = DiveOps.dive(actor);
    const base = {
      gm,
      mode: ui.mode,
      architect: ui.mode === "architect",
      actorName: actor.name,
      archs: items.map((i) => ({ uuid: i.uuid, id: i.id, name: i.name, selected: ui.arch === i.uuid })),
      rigs: Object.keys(RIGS).map((k) => ({ key: k, label: L(`NEONHOME.Dive.Rig.${k}`), selected: (ui.rig ?? "chair") === k })),
      difficulties: DIFFICULTY_KEYS.map((k) => ({ key: k, label: `${L(`NEONHOME.Dive.Difficulty.${k}`)} (DV${DIFFICULTIES[k].dv})`, selected: (ui.difficulty ?? "standard") === k })),
      demons: [{ key: "", label: L("NEONHOME.Dive.NoDemon") }, ...Object.entries(DEMONS).map(([k, d]) => ({ key: k, label: d.name, selected: ui.demon === k }))]
    };

    // ---------------- the GM's architect ----------------
    if (ui.mode === "architect") {
      const item = items.find((i) => i.uuid === ui.arch) ?? null;
      const arch = item ? DiveOps.arch(item) : null;
      // who's diving it now
      const runnersAt = {};
      const runners = [];
      for (const a of game.actors.filter((x) => x.type === "character")) {
        const d = DiveOps.dive(a);
        if (!d || !arch || d.arch !== arch.uuid) continue;
        const f = floorOf(arch, d.at);
        runners.push({ id: a.id, name: a.name, img: a.img, at: f ? `${f.depth}${f.branch.toUpperCase()}` : "", stealth: L(`NEONHOME.Dive.Stealth.${d.stealth}`) });
        if (d.at) (runnersAt[d.at] ??= []).push({ name: a.name, img: a.img });
      }
      return {
        dive: {
          ...base,
          arch: arch ? {
            uuid: arch.uuid, name: arch.name, difficulty: L(`NEONHOME.Dive.Difficulty.${arch.difficulty}`), dv: DIFFICULTIES[arch.difficulty].dv,
            demon: arch.demon ? DEMONS[arch.demon.type].name : "", depth: deepest(arch), floors: arch.floors.length,
            branches: new Set(arch.floors.map((f) => f.branch)).size
          } : null,
          map: arch ? mapOf(arch, null, true, runnersAt) : null,
          rows: arch ? arch.floors.map((f) => ({
            key: f.key, branch: f.branch.toUpperCase(), depth: f.depth, dv: f.dv ?? "", ice: f.ice.join(", "), label: f.label, note: f.note,
            kinds: FLOOR_KINDS.map((k) => ({ key: k, label: L(`NEONHOME.Dive.Kind.${k}`), selected: k === f.kind }))
          })) : [],
          iceList: ICE_IDS.join(", "),
          runners
        }
      };
    }

    // ---------------- the runner ----------------
    const { deck, rank } = CPR.netrunning(actor);
    if (!dive) return { dive: { ...base, out: true, hasDeck: !!deck, iface: rank } };
    const arch = await DiveOps._arch(dive).catch(() => null);
    if (!arch) return { dive: { ...base, out: true, lost: true, hasDeck: !!deck, iface: rank } };
    const here = floorOf(arch, dive.at);
    const st = here ? dive.floors[here.key] ?? {} : {};
    const hereView = here ? floorView(here, { dive, gm, here: dive.at, arch }) : null;
    const programs = DiveOps.programs(actor).map((p) => {
      const rez = p.system?.rez ?? {};
      const max = Number(rez.max) || Number(rez.value) || 0;
      return {
        id: p.id, name: p.name, img: p.img, rezzed: !!p.system?.isRezzed, cls: L(`CPR.global.programClass.${{ antipersonnelattacker: "antiPersonnelAttacker", antiprogramattacker: "antiProgramAttacker" }[p.system?.class] ?? p.system?.class ?? "booster"}`),
        atk: Number(p.system?.atk) || 0, def: Number(p.system?.def) || 0, rez: Number(rez.value) || 0, max, pct: max ? Math.round(((Number(rez.value) || 0) / max) * 100) : 0,
        canAttack: !!p.system?.isRezzed && (Number(p.system?.atk) > 0 || /attacker|blackice/.test(p.system?.class ?? ""))
      };
    });
    const targets = [
      ...(hereView?.ice ?? []).filter((i) => !i.derezzed).map((i) => ({ value: String(i.n), label: i.name, selected: String(ui.target) === String(i.n) })),
      ...(dive.demon && !dive.demon.derezzed ? [{ value: "demon", label: DEMONS[arch.demon.type].name, selected: ui.target === "demon" }] : [])
    ];
    const hp = CPR.hp(actor);
    const safeLeft = dive.rig.until === null ? null : Math.max(0, Math.floor((dive.rig.until - (Number(game.time?.worldTime) || 0)) / 60));
    const downs = below(arch, dive.at).map((f) => ({ key: f.key, label: dive.seen.includes(f.key) || dive.mapped.includes(f.key) ? `${L("NEONHOME.Dive.Floor", { n: f.depth })} ${f.branch.toUpperCase()} · ${L(`NEONHOME.Dive.Kind.${f.kind}`)}` : `${L("NEONHOME.Dive.Floor", { n: f.depth })} ${f.branch.toUpperCase()}` }));
    const blocked = here ? DiveOps.blocks(dive, here) : false;
    return {
      dive: {
        ...base,
        out: false,
        name: arch.name,
        difficulty: L(`NEONHOME.Dive.Difficulty.${arch.difficulty}`),
        iface: rank,
        pips: Array.from({ length: Math.max(dive.turn.total, dive.turn.used) }, (_, i) => ({ used: i < dive.turn.used })),
        left: Math.max(0, dive.turn.total - dive.turn.used),
        stealth: dive.stealth,
        stealthLabel: L(`NEONHOME.Dive.Stealth.${dive.stealth}`),
        rig: dive.rig.kind ? L(`NEONHOME.Dive.Rig.${dive.rig.kind}`) : L("NEONHOME.Dive.NoRigShort"),
        safe: safeLeft === null ? L("NEONHOME.Dive.Indefinite") : safeLeft > 0 ? formatMinutes(safeLeft) : L("NEONHOME.Dive.BurningOut"),
        burning: safeLeft === 0 || !dive.rig.kind,
        hp: hp.value, hpMax: hp.max, hpPct: hp.max ? Math.round((hp.value / hp.max) * 100) : 0,
        cloak: dive.cloak,
        virus: dive.virus,
        locked: dive.turn.locked,
        map: mapOf(arch, dive, false),
        here: hereView,
        atTop: !here,
        downs: blocked ? [] : downs,
        blocked: blocked ? L("NEONHOME.Dive.Blocked", { what: L(`NEONHOME.Dive.Kind.${here.kind}`) }) : "",
        up: here?.from ?? (here ? "" : null),
        canUp: !!here,
        can: {
          breach: here?.kind === "password" && !st.breached,
          eyedee: here?.kind === "file" && !st.eyed,
          control: here?.kind === "node" && !st.controlled,
          operate: here?.kind === "node" && !!st.controlled,
          slide: here?.kind === "ice" && (st.ice ?? []).some((i) => i.active && !i.derezzed) && !dive.turn.slid,
          virus: here?.key === arch.virus,
          zap: targets.length > 0
        },
        targets,
        programs,
        demon: dive.demon ? { name: DEMONS[arch.demon.type].name, rez: dive.demon.rez, max: DEMONS[arch.demon.type].rez, derezzed: dive.demon.derezzed } : null,
        log: [...dive.log].reverse().map((l) => l.text)
      }
    };
  },

  actions: {
    diveMode(event, target) {
      (this.uiState.dive ??= {}).mode = target.dataset.mode;
      this.render();
    },
    diveArch(event, target) {
      (this.uiState.dive ??= {}).arch = target.closest("[data-arch]")?.dataset.arch ?? null;
      this.render();
    },
    diveJackIn(event, target) {
      const ui = (this.uiState.dive ??= {});
      const root = target.closest(".nah-dive");
      const arch = root?.querySelector("[name=diveArch]")?.value ?? ui.arch;
      const rig = root?.querySelector("[name=diveRig]")?.value ?? "chair";
      const quiet = !!root?.querySelector("[name=diveQuiet]")?.checked;
      return this.act(() => DiveOps.jackIn(this.actor, arch, { rig, quiet, event }));
    },
    diveMove(event, target) {
      return this.act(() => DiveOps.move(this.actor, target.dataset.key, { event }));
    },
    diveAct(event, target) {
      const ui = (this.uiState.dive ??= {});
      const root = target.closest(".nah-dive");
      const act = target.dataset.act;
      const tgt = root?.querySelector("[name=diveTarget]")?.value ?? ui.target;
      const text = root?.querySelector("[name=diveText]")?.value ?? "";
      const dv = root?.querySelector("[name=diveDv]")?.value ?? null;
      return this.act(() => DiveOps.act(this.actor, act, { event, target: tgt === "demon" ? "demon" : Number(tgt), text, dv, dir: target.dataset.dir ?? "up" }));
    },
    diveRez(event, target) {
      const id = target.closest("[data-program]")?.dataset.program;
      return this.act(() => DiveOps.rez(this.actor, id, target.dataset.on === "1"));
    },
    diveAttack(event, target) {
      const id = target.closest("[data-program]")?.dataset.program;
      const tgt = target.closest(".nah-dive")?.querySelector("[name=diveTarget]")?.value ?? "0";
      return this.act(() => DiveOps.attack(this.actor, id, tgt === "demon" ? "demon" : Number(tgt), { event }));
    },
    diveTurn() {
      return this.act(() => DiveOps.newTurn(this.actor));
    },
    diveOut(event, target) {
      const unsafe = target.dataset.unsafe === "1";
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: L("NEONHOME.Dive.JackOut"), icon: "fa-solid fa-plug-circle-xmark" },
          content: `<p>${L(`NEONHOME.Dive.Ask.${unsafe ? "unsafe" : "safe"}`)}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await DiveOps.jackOut(this.actor, { unsafe });
      });
    },
    diveIce(event, target) {
      const key = target.dataset.key;
      const n = Number(target.dataset.n);
      return this.act(() => DiveOps.iceAttacks(this.actor, key, n));
    },
    diveDemon(event, target) {
      return this.act(() => DiveOps.demonActs(this.actor, target.dataset.what));
    },
    // the GM's architect
    diveGenerate(event, target) {
      const root = target.closest(".nah-dive");
      const ui = (this.uiState.dive ??= {});
      ui.difficulty = root?.querySelector("[name=archDifficulty]")?.value ?? "standard";
      ui.demon = root?.querySelector("[name=archDemon]")?.value ?? "";
      const name = root?.querySelector("[name=archName]")?.value ?? "";
      return this.act(async () => {
        const item = await DiveOps.create({ difficulty: ui.difficulty, demon: ui.demon, name });
        if (item) ui.arch = item.uuid;
      });
    },
    diveRegen() {
      const ui = (this.uiState.dive ??= {});
      return this.act(async () => {
        const item = await fromUuid(ui.arch);
        const arch = DiveOps.arch(item);
        if (!item || !arch) return;
        const fresh = generate({ difficulty: arch.difficulty, name: arch.name, demon: arch.demon?.type ?? "" });
        await DiveOps.save(item, fresh);
      });
    },
    diveSave(event, target) {
      const ui = (this.uiState.dive ??= {});
      const root = target.closest(".nah-dive");
      return this.act(async () => {
        const item = await fromUuid(ui.arch);
        const arch = DiveOps.arch(item);
        if (!item || !arch) return;
        const floors = arch.floors.map((f) => {
          const row = root.querySelector(`[data-floor-row="${f.key}"]`);
          if (!row) return f;
          const val = (n) => row.querySelector(`[name=${n}]`)?.value ?? "";
          const ice = val("ice").split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => BLACK_ICE[x]);
          return { ...f, kind: val("kind") || f.kind, dv: val("dv") === "" ? null : Number(val("dv")), ice, label: val("label"), note: val("note") };
        });
        await DiveOps.save(item, { ...arch, floors });
        ui.flash = "saved";
      });
    },
    diveSend(event, target) {
      const ui = (this.uiState.dive ??= {});
      const root = target.closest(".nah-dive");
      const rig = root?.querySelector("[name=diveRig]")?.value ?? "chair";
      return this.act(() => DiveOps.jackIn(this.actor, ui.arch, { rig }));
    }
  },

  onRender(app, root) {
    const ui = (app.uiState.dive ??= {});
    // remember the picks between redraws
    for (const [name, key] of [["diveTarget", "target"], ["diveRig", "rig"], ["diveArch", "arch"]]) {
      const el = root.querySelector(`[name=${name}]`);
      el?.addEventListener("change", () => (ui[key] = el.value));
    }
    // the links between floors: down the branch, and out to each branch from the floor it hangs from
    const grid = root.querySelector(".nah-dive-map");
    const svg = grid?.querySelector("svg.nah-dive-links");
    if (grid && svg) {
      const box = grid.getBoundingClientRect();
      // screen pixels to the map's own (an interface scale or zoom shrinks the one, not the other)
      const k = grid.offsetWidth ? box.width / grid.offsetWidth : 1;
      const out = [];
      for (const cell of grid.querySelectorAll("[data-from]")) {
        const from = grid.querySelector(`[data-floor="${cell.dataset.from}"]`);
        if (!from) continue;
        const a = from.getBoundingClientRect();
        const b = cell.getBoundingClientRect();
        const x1 = (a.left + a.width / 2 - box.left) / k;
        const y1 = (a.bottom - box.top) / k;
        const x2 = (b.left + b.width / 2 - box.left) / k;
        const y2 = (b.top - box.top) / k;
        const lit = from.classList.contains("is-done") || from.classList.contains("is-here");
        out.push(`<path class="${lit ? "lit" : ""}" d="M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}"/>`);
      }
      svg.setAttribute("viewBox", `0 0 ${grid.offsetWidth} ${grid.offsetHeight}`);
      svg.innerHTML = out.join("");
    }
    root.querySelector(".nah-dive-here")?.scrollIntoView?.({ block: "center", inline: "nearest" });
  }
};
