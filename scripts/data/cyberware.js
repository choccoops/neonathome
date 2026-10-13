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
import { ownState, worseState } from "./condition.js";
import { totalUpgrade } from "./attachments.js";

/** Cyberware types in head-to-toe order (the keys of CPR.cyberwareTypes). */
export const CYBER_TYPES = ["neuralWare", "cyberEye", "cyberAudioSuite", "cyberArm", "cyberLeg", "cyberwareInternal", "cyberwareExternal", "fashionware", "borgware"];

/**
 * Gauntlets and gloves Cyberpunk RED installs as foundational cyberarms (Battleglove, the smart
 * gloves): worn over a hand, not limbs.
 */
export const GLOVE = /glove|gauntlet/i;

/**
 * Cyberarm options in the hand (cyberfingers, hands, palm, knuckle and finger blades, grips): they
 * go with a lost hand. Everything in a cyberarm goes with a lost arm.
 */
export const HAND_OPTION = /hand|finger|knuck|ripp|scratcher|wolver|slice|grip|grapple|palm|quick change|waldo|glove|gauntlet/i;

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

/** What a mark or card shows: an offline state, else Damaged, else "" (working). */
const shown = (n) => n.state || (n.damaged ? "damaged" : "");
const SHOWN_RANK = { "": 0, damaged: 1, emp: 2, destroyed: 3, dbr: 4 };
const worseShown = (a, b) => (SHOWN_RANK[a] >= SHOWN_RANK[b] ? a : b);

/**
 * One installed piece and everything installed in it.
 * @param {string} inherited - the state of what it's installed in ("" when that works)
 */
function node(item, byId, moduleId, inherited = "") {
  const s = item.system ?? {};
  const flag = itemFlag(item, moduleId);
  const own = ownState(flag);
  const state = worseState(own, inherited);
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
    // a gauntlet or glove, not a limb
    glove: s.type === "cyberArm" && GLOVE.test(String(item.name ?? "")),
    own,
    state,
    condition: flag.condition,
    damaged: flag.condition === "damaged",
    hidden: flag.condition === "damaged" && flag.hidden,
    emp: flag.emp,
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
 * @returns {{types: {type, roots: object[]}[], marks: object[], total, offline, emp, destroyed, damaged}}
 */
export function cyberwareMap(items, actorInstalled, moduleId) {
  const byId = new Map(items.map((i) => [idOf(i), i]));
  const roots = (actorInstalled ?? []).map((id) => byId.get(id)).filter((i) => i?.type === "cyberware").map((i) => node(i, byId, moduleId));
  const types = CYBER_TYPES.map((type) => {
    const these = roots.filter((r) => r.type === type);
    // limbs pair up right then left; gloves pair up the same way among themselves
    if (PAIRED.includes(type)) {
      these.filter((r) => !r.glove).forEach((r, i) => (r.side = i % 2 === 0 ? "R" : "L"));
      these.filter((r) => r.glove).forEach((r, i) => (r.side = i % 2 === 0 ? "R" : "L"));
    }
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
        state: all.reduce((w, n) => worseShown(w, shown(n)), ""),
        rootState: shown(r),
        // Damage the players know about (the GM can keep it quiet)
        knownDamage: all.some((n) => n.damaged && !n.hidden),
        rootKnown: r.damaged && !r.hidden,
        count: all.length,
        limb: ["cyberArm", "cyberLeg"].includes(t.type) && !r.meat && !r.glove ? (t.type === "cyberArm" ? "arm" : "leg") : null
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
    destroyed: pieces.filter((n) => n.state === "destroyed" || n.state === "dbr").length,
    damaged: pieces.filter((n) => !n.state && n.damaged).length
  };
}
