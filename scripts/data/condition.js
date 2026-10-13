/**
 * Whether gear works, from Breaking Your Stuff's Conditions and EMP. Pure: no Foundry calls.
 *
 * Every item has a condition: working (""), Damaged (works, but can malfunction), Destroyed (doesn't
 * work until it's repaired) or Destroyed Beyond Repair. Cyberware and electronics can also be
 * knocked out by EMP. Anything that doesn't work takes what's installed in it down with it:
 * the options in a destroyed cyberarm, the scope on a destroyed rifle.
 */
import { idOf } from "./util.js";
import { itemFlag } from "./item-flag.js";

/** Offline states, least to most final. */
export const OFFLINE = ["emp", "destroyed", "dbr"];
const RANK = { "": 0, emp: 1, destroyed: 2, dbr: 3 };

/** The more final of two offline states ("" is working). */
export const worseState = (a = "", b = "") => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

/** An item's own offline state from its flag: Destroyed Beyond Repair, Destroyed, EMP'd or "". */
export function ownState(flag) {
  if (flag.condition === "dbr") return "dbr";
  if (flag.condition === "destroyed") return "destroyed";
  return flag.emp ? "emp" : "";
}

/** What each item is installed in: Map of item id to the id of the item holding it. */
export function parentMap(items) {
  const parents = new Map();
  for (const item of items) {
    for (const id of item.system?.installedItems?.list ?? []) parents.set(id, idOf(item));
  }
  return parents;
}

/**
 * Every item's state.
 * @param {object[]} items - an actor's items (documents or data)
 * @returns {Map<string, {own, state, inherited, condition, damaged, emp, hidden, parent}>}
 *   own: the item's own offline state; state: its own or what it's installed in, whichever is
 *   worse; inherited: offline only because of what it's installed in.
 */
export function itemStates(items, moduleId) {
  const byId = new Map(items.map((i) => [idOf(i), i]));
  const parents = parentMap(items);
  const out = new Map();
  const visit = (id, seen = new Set()) => {
    if (out.has(id)) return out.get(id);
    const item = byId.get(id);
    if (!item || seen.has(id)) return null;
    seen.add(id);
    const flag = itemFlag(item, moduleId);
    const own = ownState(flag);
    const parentId = parents.get(id) ?? null;
    const up = parentId ? visit(parentId, seen)?.state ?? "" : "";
    const state = worseState(own, up);
    const entry = {
      own,
      state,
      inherited: !own && !!up,
      condition: flag.condition,
      damaged: flag.condition === "damaged",
      emp: flag.emp,
      hidden: flag.condition === "damaged" && flag.hidden,
      parent: parentId
    };
    out.set(id, entry);
    return entry;
  };
  for (const id of byId.keys()) visit(id);
  return out;
}
