/**
 * The Biomonitor's cyberware monitor: what's installed, where, in which slots, and whether it works.
 * Pure: no Foundry calls.
 *
 * Cyberpunk RED keeps cyberware installed in the body on the actor's own installedItems list:
 * foundational pieces (a Neural Link, Cybereyes, a Cyberarm...) and the system's three core
 * containers (Internal, External, Fashionware, 7 option slots each). Optional cyberware is
 * installed inside those, and can hold more of its own.
 */
import { int, idOf } from "./util.js";
import { itemFlag } from "./item-flag.js";
import { totalUpgrade } from "./attachments.js";

/** Cyberware types in head-to-toe order (the keys of CPR.cyberwareTypes). */
export const CYBER_TYPES = ["neuralWare", "cyberEye", "cyberAudioSuite", "cyberArm", "cyberLeg", "cyberwareInternal", "cyberwareExternal", "fashionware", "borgware"];

/** Types that come in pairs: the first installed goes on the right, the next on the left. */
export const PAIRED = ["cyberEye", "cyberArm", "cyberLeg"];

/** Where each type sits on the body figure (anchors from the trauma map's figure). */
export const CYBER_ANCHOR = {
  neuralWare: "brain",
  cyberEye: "eye",
  cyberAudioSuite: "ear",
  cyberArm: "forearm",
  cyberLeg: "leg",
  cyberwareInternal: "chest",
  cyberwareExternal: "gut",
  fashionware: "face",
  borgware: "spine"
};

/** The worse of two states: broken beats EMP beats working. */
const worse = (a, b) => (a === "broken" || b === "broken" ? "broken" : a === "emp" || b === "emp" ? "emp" : "");

/**
 * One installed piece and everything installed in it.
 * @param {string} inherited - the state of what it's installed in ("" when that works)
 */
function node(item, byId, moduleId, inherited = "") {
  const s = item.system ?? {};
  const own = itemFlag(item, moduleId).cyberState;
  const state = worse(own, inherited);
  const inside = (s.installedItems?.list ?? []).map((id) => byId.get(id)).filter(Boolean);
  const upgrades = inside.filter((i) => i.type === "itemUpgrade");
  const slotsUp = totalUpgrade(upgrades, "slots");
  const baseSlots = int(s.installedItems?.slots);
  const slots = slotsUp.type === "override" ? slotsUp.value : baseSlots + slotsUp.value;
  const used = inside.reduce((n, i) => n + int(i.system?.size ?? 1), 0);
  return {
    id: idOf(item),
    name: String(item.name ?? ""),
    img: item.img ?? "",
    type: s.type ?? "",
    size: int(s.size ?? 1),
    core: !!s.core,
    foundational: !!s.isFoundational,
    weapon: !!s.isWeapon,
    // a limb of meat that hosts options, not chrome
    meat: /\bmeat\b/i.test(String(item.name ?? "")),
    own,
    state,
    // offline only because what it's installed in is
    inheritedOffline: !own && !!inherited,
    slots,
    used,
    upgrades: upgrades.map((u) => String(u.name ?? "")),
    children: inside.filter((i) => i.type === "cyberware").map((c) => node(c, byId, moduleId, state))
  };
}

/** Every node in a tree, depth first. */
export function flatten(nodes) {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/**
 * The cyberware monitor for a character.
 * @param {object[]} items - the character's items
 * @param {string[]} actorInstalled - the actor's own installedItems list
 * @returns {{types: {type, roots: object[]}[], marks: object[], total, offline, emp, broken}}
 */
export function cyberwareMap(items, actorInstalled, moduleId) {
  const byId = new Map(items.map((i) => [idOf(i), i]));
  const roots = (actorInstalled ?? []).map((id) => byId.get(id)).filter((i) => i?.type === "cyberware").map((i) => node(i, byId, moduleId));
  const types = CYBER_TYPES.map((type) => {
    const these = roots.filter((r) => r.type === type);
    if (PAIRED.includes(type)) these.forEach((r, i) => (r.side = i % 2 === 0 ? "R" : "L"));
    return { type, roots: these };
  });
  // anything installed in the body with a type the list doesn't know goes last
  const known = new Set(CYBER_TYPES);
  const other = roots.filter((r) => !known.has(r.type));
  if (other.length) types.push({ type: "other", roots: other });

  // One mark on the figure per root (not the core containers when they're empty).
  const marks = [];
  for (const t of types) {
    for (const r of t.roots) {
      if (r.core && !r.children.length) continue;
      const all = flatten([r]).filter((n) => !n.core);
      marks.push({
        type: t.type,
        anchor: CYBER_ANCHOR[t.type] ?? "chest",
        side: r.side ?? null,
        rootId: r.id,
        names: all.map((n) => n.name),
        // the mark shows the worst of anything in it; a chrome limb shows the limb itself
        state: all.reduce((w, n) => worse(w, n.state), ""),
        rootState: r.state,
        count: all.length,
        limb: ["cyberArm", "cyberLeg"].includes(t.type) && !r.meat ? (t.type === "cyberArm" ? "arm" : "leg") : null
      });
    }
  }

  const pieces = flatten(roots).filter((n) => !n.core);
  return {
    types,
    marks,
    total: pieces.length,
    offline: pieces.filter((n) => n.state).length,
    emp: pieces.filter((n) => n.state === "emp").length,
    broken: pieces.filter((n) => n.state === "broken").length
  };
}
