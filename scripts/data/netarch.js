/**
 * The Deep Dive (Cyberpunk: The Unification Era, Core Rules Chapter 10, Part 2): Black ICE and
 * Demons, rigs, NET Architectures and the GM's generator (Building an Architecture). Pure: no
 * Foundry calls; dice come in as a function so the generator can be tested.
 */
import { int } from "./util.js";

/* ------------------------------------------ */
/*  Black ICE and Demons                      */
/* ------------------------------------------ */

/**
 * Black ICE (CORE p.201-207; Chapter 10's table). kind: what its Effect does, for the dive:
 * brain (damage to the runner's HP), program (damage to a random Rezzed Program), or what else.
 */
export const BLACK_ICE = {
  asp: { name: "Asp", cls: "antiPersonnel", per: 4, spd: 6, atk: 2, def: 2, rez: 15, effect: "Destroys one random program on your deck.", destroyProgram: true },
  giant: { name: "Giant", cls: "antiPersonnel", per: 2, spd: 2, atk: 8, def: 4, rez: 25, effect: "3d6 brain; unsafe Jack Out through every other Rezzed ICE.", brain: "3d6", ejects: true },
  hellhound: { name: "Hellhound", cls: "antiPersonnel", per: 6, spd: 6, atk: 6, def: 2, rez: 20, effect: "2d6 brain; deck and clothes On Fire (2/Turn).", brain: "2d6", fire: true },
  kraken: { name: "Kraken", cls: "antiPersonnel", per: 6, spd: 2, atk: 8, def: 4, rez: 30, effect: "3d6 brain; no going deeper or safe Jack Out until your next Turn ends.", brain: "3d6", locks: true },
  liche: { name: "Liche", cls: "antiPersonnel", per: 8, spd: 2, atk: 6, def: 2, rez: 25, effect: "INT, REF, DEX −1d6 for an hour.", stats: ["int", "ref", "dex"] },
  raven: { name: "Raven", cls: "antiPersonnel", per: 6, spd: 4, atk: 4, def: 2, rez: 15, effect: "Derezz a random Defender, then 1d6 brain.", brain: "1d6", derezDefender: true },
  scorpion: { name: "Scorpion", cls: "antiPersonnel", per: 2, spd: 6, atk: 2, def: 2, rez: 15, effect: "MOVE −1d6 for an hour.", stats: ["move"] },
  skunk: { name: "Skunk", cls: "antiPersonnel", per: 2, spd: 4, atk: 4, def: 2, rez: 10, effect: "−2 to Slide until Derezzed. Stacks.", slidePenalty: 2 },
  wisp: { name: "Wisp", cls: "antiPersonnel", per: 4, spd: 4, atk: 4, def: 2, rez: 15, effect: "1d6 brain; −1 NET Action next Turn.", brain: "1d6", slows: true },
  dragon: { name: "Dragon", cls: "antiProgram", per: 6, spd: 4, atk: 6, def: 6, rez: 30, effect: "6d6 to a program; Destroyed instead of Derezzed.", program: "6d6" },
  killer: { name: "Killer", cls: "antiProgram", per: 4, spd: 8, atk: 6, def: 2, rez: 20, effect: "4d6 to a program; Destroyed instead of Derezzed.", program: "4d6" },
  sabertooth: { name: "Sabertooth", cls: "antiProgram", per: 8, spd: 6, atk: 6, def: 2, rez: 25, effect: "6d6 to a program; Destroyed instead of Derezzed.", program: "6d6" }
};
export const ICE_IDS = Object.keys(BLACK_ICE);

/** Demons: they run the place (always aware; win every Speed contest; can't be Slid from). */
export const DEMONS = {
  imp: { name: "Imp", rez: 15, iface: 3, net: 2, combat: 14 },
  efreet: { name: "Efreet", rez: 25, iface: 4, net: 3, combat: 14 },
  balron: { name: "Balron", rez: 30, iface: 7, net: 4, combat: 14 }
};

/* ------------------------------------------ */
/*  Rigs and the dive                         */
/* ------------------------------------------ */

/** Cooling rigs: how long they're safe, in minutes (null: indefinitely). */
export const RIGS = {
  iceBath: { minutes: 60 },
  chair: { minutes: 480 },
  cradle: { minutes: null }
};

/** NET Actions a Turn: by Interface (2 / 3 / 4 / 5), +1 under full immersion, +1 with a Hummingbird deck. */
export function netActions(rank, { immersed = true, hummingbird = false, slowed = 0 } = {}) {
  const base = rank >= 10 ? 5 : rank >= 7 ? 4 : rank >= 4 ? 3 : 2;
  return Math.max(0, base + (immersed ? 1 : 0) + (hummingbird ? 1 : 0) - int(slowed));
}

/* ------------------------------------------ */
/*  Architectures                             */
/* ------------------------------------------ */

/** Difficulty: the DVs on its floors, and the Interface it's fair for (a step below might not make it). */
export const DIFFICULTIES = {
  basic: { dv: 6, iface: 2 },
  standard: { dv: 8, iface: 4 },
  uncommon: { dv: 10, iface: 6 },
  advanced: { dv: 12, iface: 8 }
};
export const DIFFICULTY_KEYS = Object.keys(DIFFICULTIES);

/** What a floor can be. */
export const FLOOR_KINDS = ["password", "file", "node", "ice", "empty"];

const P = (dv) => ({ kind: "password", dv });
const F = (dv) => ({ kind: "file", dv });
const N = (dv) => ({ kind: "node", dv });
const I = (...ice) => ({ kind: "ice", ice });

/** Lobby (1d6): floors 1 and 2. */
export const LOBBY = [F(6), P(6), P(8), I("skunk"), I("wisp"), I("killer")];

/** Architecture Body (3d6, results 3-18), by difficulty. */
export const BODY = {
  basic: [I("hellhound"), I("sabertooth"), I("raven", "raven"), I("hellhound"), I("wisp"), I("raven"), P(6), F(6), N(6), P(6), I("skunk"), I("asp"), I("scorpion"), I("killer", "skunk"), I("wisp", "wisp", "wisp"), I("liche")],
  standard: [I("hellhound", "hellhound"), I("hellhound", "killer"), I("skunk", "skunk"), I("sabertooth"), I("scorpion"), I("hellhound"), P(8), F(8), N(8), P(8), I("asp"), I("killer"), I("liche"), I("asp"), I("raven", "raven", "raven"), I("liche", "raven")],
  uncommon: [I("kraken"), I("hellhound", "scorpion"), I("hellhound", "killer"), I("raven", "raven"), I("sabertooth"), I("hellhound"), P(10), F(10), N(10), P(10), I("killer"), I("liche"), I("dragon"), I("asp", "raven"), I("dragon", "wisp"), I("giant")],
  advanced: [I("hellhound", "hellhound", "hellhound"), I("asp", "asp"), I("hellhound", "liche"), I("wisp", "wisp", "wisp"), I("hellhound", "sabertooth"), I("kraken"), P(12), F(12), N(12), P(12), I("giant"), I("dragon"), I("killer", "scorpion"), I("kraken"), I("raven", "wisp", "hellhound"), I("dragon", "dragon")]
};

/** A floor's key: its branch letter and depth ("a3", "b5"). */
export const floorKey = (branch, depth) => `${branch}${depth}`;

const same = (a, b) => a.kind === b.kind && (a.kind === "ice" ? a.ice.join() === b.ice.join() : a.dv === b.dv);

/**
 * Build an architecture (Building an Architecture): 3d6 floors; on a d10 of 7+ a branch (roll
 * again for more), never before floor 3; the longest branch's bottom is where Viruses go. Floors
 * 1-2 from the Lobby table, the rest from the Body table for the difficulty, rerolling duplicate
 * Programs and Passwords.
 * @param {object} opts - { difficulty, name, demon: imp|efreet|balron|"" }
 * @param {(sides: number) => number} roll - a die: 1..sides
 * @returns {{name, difficulty, demon, floors: object[], virus: string}}
 */
export function generate({ difficulty = "standard", name = "", demon = "" } = {}, roll = (s) => 1 + Math.floor(Math.random() * s)) {
  const diff = DIFFICULTIES[difficulty] ? difficulty : "standard";
  const d = (n, s) => Array.from({ length: n }, () => roll(s)).reduce((a, b) => a + b, 0);
  const depth = d(3, 6);
  // branches: each hangs below a trunk floor (3 or deeper) and stays shorter than the trunk
  const branches = [];
  let guard = 0;
  while (roll(10) >= 7 && guard++ < 6 && depth >= 4) {
    const from = 2 + roll(Math.max(1, depth - 3));
    const length = Math.min(depth - from - 1, roll(6));
    if (length >= 1) branches.push({ from, length });
  }
  const used = [];
  const pick = (table, die) => {
    for (let tries = 0; tries < 20; tries++) {
      const r = table[die() - (table === LOBBY ? 1 : 3)];
      const dupe = (r.kind === "ice" || r.kind === "password") && used.some((u) => same(u, r));
      if (!dupe || tries === 19) {
        used.push(r);
        return { ...r, ice: r.ice ? [...r.ice] : undefined };
      }
    }
    return null;
  };
  const fill = (lvl) => (lvl <= 2 ? pick(LOBBY, () => roll(6)) : pick(BODY[diff], () => d(3, 6)));
  const floors = [];
  for (let lvl = 1; lvl <= depth; lvl++) floors.push({ key: floorKey("a", lvl), branch: "a", depth: lvl, from: lvl > 1 ? floorKey("a", lvl - 1) : null, ...fill(lvl) });
  branches.forEach((b, i) => {
    const letter = String.fromCharCode(98 + i); // b, c, ...
    for (let n = 1; n <= b.length; n++) {
      const lvl = b.from + n;
      floors.push({ key: floorKey(letter, lvl), branch: letter, depth: lvl, from: n === 1 ? floorKey("a", b.from) : floorKey(letter, lvl - 1), ...fill(lvl) });
    }
  });
  // a Demon minds the place from near a Control Node, or the top of the Body
  const nodeFloor = floors.find((f) => f.kind === "node") ?? floors.find((f) => f.depth === 3) ?? floors[0];
  return {
    name: name || "",
    difficulty: diff,
    demon: DEMONS[demon] ? { type: demon, at: nodeFloor.key } : null,
    floors: floors.map((f) => ({ ...f, label: "", note: "" })),
    virus: floorKey("a", depth)
  };
}

/** Fill in a stored architecture (an item flag): floors kept in order, keys and links checked. */
export function normalizeArch(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const floors = (Array.isArray(r.floors) ? r.floors : []).map((f) => ({
    key: String(f.key ?? floorKey(f.branch ?? "a", int(f.depth, 1))),
    branch: /^[a-h]$/.test(f.branch) ? f.branch : "a",
    depth: int(f.depth, 1, 99),
    from: f.from ? String(f.from) : null,
    kind: FLOOR_KINDS.includes(f.kind) ? f.kind : "empty",
    dv: f.dv === undefined || f.dv === null ? null : int(f.dv, 0, 40),
    ice: Array.isArray(f.ice) ? f.ice.filter((i) => BLACK_ICE[i]) : [],
    label: String(f.label ?? ""),
    note: String(f.note ?? "")
  }));
  const keys = new Set(floors.map((f) => f.key));
  return {
    name: String(r.name ?? ""),
    difficulty: DIFFICULTIES[r.difficulty] ? r.difficulty : "standard",
    demon: r.demon && DEMONS[r.demon.type] ? { type: r.demon.type, at: keys.has(r.demon.at) ? r.demon.at : floors[0]?.key ?? null } : null,
    floors,
    virus: keys.has(r.virus) ? r.virus : floors.filter((f) => f.branch === "a").at(-1)?.key ?? null
  };
}

/** The floors right below one (the next on its branch, and the first of any branch hanging from it); the top's are the first floor. */
export function below(arch, key) {
  if (!key) return arch.floors.filter((f) => f.depth === 1);
  return arch.floors.filter((f) => f.from === key);
}

export const floorOf = (arch, key) => arch.floors.find((f) => f.key === key) ?? null;

/** The path from the top down to a floor: [floor 1, ..., the floor]. */
export function pathTo(arch, key) {
  const out = [];
  let f = floorOf(arch, key);
  while (f) {
    out.unshift(f);
    f = f.from ? floorOf(arch, f.from) : null;
  }
  return out;
}

/** The deepest floor of an architecture. */
export const deepest = (arch) => Math.max(0, ...arch.floors.map((f) => f.depth));

/* ------------------------------------------ */
/*  Cyberpunk RED's NET Architecture item     */
/* ------------------------------------------ */

const CPR_CONTENT = { password: "CPR.netArchitecture.floor.options.password", file: "CPR.netArchitecture.floor.options.file", node: "CPR.netArchitecture.floor.options.controlnode", ice: "CPR.global.programClass.blackice" };

/**
 * The floors as Cyberpunk RED's NET Architecture item keeps them (its sheet and its scene tiles):
 * one row per floor, the first Black ICE named (the rest in the description).
 */
export function cprFloors(arch) {
  return arch.floors.filter((f) => f.kind !== "empty").map((f) => ({
    floor: String(Math.min(18, f.depth)),
    branch: f.branch,
    content: CPR_CONTENT[f.kind],
    blackice: f.kind === "ice" ? `CPR.netArchitecture.floor.options.blackIce.${f.ice[0]}` : "--",
    dv: f.kind === "ice" ? "N/A" : String(Math.min(20, Math.max(4, f.dv ?? 6))),
    description: [f.label, f.kind === "ice" && f.ice.length > 1 ? f.ice.map((i) => BLACK_ICE[i].name).join(", ") : "", f.note].filter(Boolean).join(" · ")
  }));
}

/** An architecture read back from a NET Architecture item's own floors (one made on its sheet, not by the generator). */
export function fromCprFloors(floors, { name = "", difficulty = "standard" } = {}) {
  const kindOf = (c) => Object.entries(CPR_CONTENT).find(([, v]) => v === c)?.[0] ?? "empty";
  const rows = (floors ?? []).map((f) => ({
    branch: /^[a-h]$/.test(f.branch) ? f.branch : "a",
    depth: int(f.floor, 1, 99),
    kind: kindOf(f.content),
    dv: Number.isFinite(Number(f.dv)) ? Number(f.dv) : null,
    ice: String(f.blackice ?? "").startsWith("CPR.netArchitecture.floor.options.blackIce.") ? [f.blackice.split(".").pop()] : [],
    label: String(f.description ?? "")
  })).sort((a, b) => a.branch.localeCompare(b.branch) || a.depth - b.depth);
  // a branch hangs from the trunk floor above its first one
  const out = rows.map((r) => ({ ...r, key: floorKey(r.branch, r.depth) }));
  for (const f of out) {
    const prev = out.filter((x) => x.branch === f.branch && x.depth < f.depth).at(-1);
    f.from = prev ? prev.key : f.branch === "a" ? null : out.filter((x) => x.branch === "a" && x.depth < f.depth).at(-1)?.key ?? null;
  }
  return normalizeArch({ name, difficulty, floors: out });
}
