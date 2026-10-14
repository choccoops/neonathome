/**
 * Long projects: Maker work (Fabrication, Upgrade, Invention) and repairs, which can take weeks or
 * a month. Pure: no Foundry calls.
 *
 * The core rulebook gives them all the same failure: "halfway through" the Tech realizes they must
 * start over (Upgrade and Fabrication p.148, Invention p.149, Item Repair p.140). So a project's
 * time is put in from downtime, its check comes due at the halfway mark, and a failure there
 * empties the meter (the materials are fine); a pass lets the rest of the time go in, and the
 * project is done when its meter is full.
 */
import { int, str } from "./util.js";

export const PROJECT_KINDS = ["fabricate", "upgrade", "invent", "repair"];

/** Fill in and clamp a stored project. */
export function normalizeProject(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const minutes = int(r.minutes, 1);
  return {
    id: str(r.id).slice(0, 32),
    kind: PROJECT_KINDS.includes(r.kind) ? r.kind : "fabricate",
    label: str(r.label).slice(0, 200),
    // the check: its skill (or a role ability, rolled TECH + rank), and the DV
    skill: str(r.skill) || "Basic Tech",
    ability: str(r.ability),
    dv: int(r.dv, 1, 40),
    minutes,
    done: int(r.done, 0, minutes),
    // "passed" once the halfway check is made
    check: r.check === "passed" ? "passed" : null,
    restarts: int(r.restarts),
    materials: int(r.materials),
    img: str(r.img),
    data: r.data && typeof r.data === "object" ? r.data : {}
  };
}

/** The halfway mark, in minutes (where the check comes due). */
export const halfway = (p) => Math.ceil(p.minutes / 2);

/**
 * Where a project stands: "build" (putting time in before the check), "check" (at the halfway
 * mark, the check to roll), "finish" (passed, the rest of the time to put in), "done".
 */
export function stage(p) {
  if (p.check === "passed") return p.done >= p.minutes ? "done" : "finish";
  return p.done >= halfway(p) ? "check" : "build";
}

/** Time still to put in before the next step: to the halfway mark before the check, to the end after. */
export function needed(p) {
  const s = stage(p);
  if (s === "build") return halfway(p) - p.done;
  if (s === "finish") return p.minutes - p.done;
  return 0;
}

/** All the time the project still needs (assuming the check passes). */
export const remaining = (p) => p.minutes - p.done;

/**
 * How time put in now splits: before the check (up to the halfway mark), then after it (only once
 * it's passed). Time past what's needed isn't taken.
 * @returns {{before: number, after: number}}
 */
export function plan(p, minutes) {
  const m = int(minutes);
  const s = stage(p);
  if (s === "build") {
    const before = Math.min(m, halfway(p) - p.done);
    return { before, after: Math.max(0, Math.min(m - before, p.minutes - halfway(p))) };
  }
  if (s === "finish") return { before: 0, after: Math.min(m, p.minutes - p.done) };
  return { before: 0, after: 0 };
}

/** A project's meter for display: percentages done and of the halfway mark. */
export function meter(p) {
  return { pct: Math.round((p.done / p.minutes) * 100), half: Math.round((halfway(p) / p.minutes) * 100) };
}
