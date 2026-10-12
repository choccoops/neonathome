/**
 * The Biomonitor's trauma map: where each critical injury sits on the body figure, how injuries
 * stack at one spot, which limbs are gone, and how bad it all is together. Pure: no Foundry calls.
 *
 * Coordinates are in the figure's viewBox (200 x 350). "L" and "R" are the character's own left
 * and right; the figure faces the viewer, so the character's left is on the viewer's right.
 */
import { idOf } from "./util.js";

/** Where things are on the figure. Sided anchors have an L and an R point. */
export const ANCHORS = {
  skull: { x: 100, y: 16 },
  brain: { x: 100, y: 28 },
  face: { x: 100, y: 42 },
  eye: { L: { x: 109, y: 35 }, R: { x: 91, y: 35 } },
  ear: { L: { x: 121, y: 40 }, R: { x: 79, y: 40 } },
  jaw: { x: 100, y: 57 },
  throat: { x: 100, y: 70 },
  chest: { x: 100, y: 104 },
  lung: { L: { x: 115, y: 106 }, R: { x: 85, y: 106 } },
  ribs: { L: { x: 124, y: 124 }, R: { x: 76, y: 124 } },
  spine: { x: 100, y: 140 },
  gut: { x: 100, y: 168 },
  arm: { L: { x: 150, y: 124 }, R: { x: 50, y: 124 } },
  forearm: { L: { x: 155, y: 160 }, R: { x: 45, y: 160 } },
  hand: { L: { x: 156, y: 196 }, R: { x: 44, y: 196 } },
  leg: { L: { x: 118, y: 272 }, R: { x: 82, y: 272 } }
};

/** Which limb an anchor is part of, so a limb's injuries share a side. */
const LIMB = { arm: "arm", forearm: "arm", hand: "arm", leg: "leg" };

/**
 * Injury names to places, checked in order. kind: "severed" (a limb is gone), "lost" (an eye or ear
 * is gone), or "" (hurt). Names are matched case-insensitively, so homebrew injuries with similar
 * names land in the right place; anything else goes to the face or the chest by its location.
 */
export const INJURY_RULES = [
  { re: /\b(?:dismember\w*|severed|lost)\s+arm\b/i, anchor: "arm", kind: "severed" },
  { re: /\b(?:dismember\w*|severed|lost)\s+hand\b/i, anchor: "hand", kind: "severed" },
  { re: /\b(?:dismember\w*|severed|lost)\s+leg\b/i, anchor: "leg", kind: "severed" },
  { re: /\b(?:arms?|forearms?|elbows?)\b/i, anchor: "forearm" },
  { re: /\b(?:fingers?|hands?|wrists?)\b/i, anchor: "hand" },
  { re: /\b(?:legs?|knees?|ankles?|feet|foot)\b/i, anchor: "leg" },
  { re: /\b(?:torn\s+muscle|shoulders?)\b/i, anchor: "arm" },
  { re: /\bribs?\b/i, anchor: "ribs" },
  { re: /\blungs?\b/i, anchor: "lung" },
  { re: /\b(?:spin\w*|back)\b/i, anchor: "spine" },
  { re: /\blost\s+eye\b/i, anchor: "eye", kind: "lost" },
  { re: /\beyes?\b/i, anchor: "eye" },
  { re: /\blost\s+ear\b/i, anchor: "ear", kind: "lost" },
  { re: /\bears?\b/i, anchor: "ear" },
  { re: /\b(?:jaw|teeth|mouth)\b/i, anchor: "jaw" },
  { re: /\b(?:windpipe|throat|whiplash|neck)\b/i, anchor: "throat" },
  { re: /\bskull\b/i, anchor: "skull" },
  { re: /\b(?:brain|concuss\w*)\b/i, anchor: "brain" }
];

/** Where a severed limb is blacked out on the figure, and where it was cut. */
export const SEVERED_SHAPES = {
  arm: {
    R: { x: 34, y: 108, w: 28, h: 98, cut: [40, 110, 64, 104] },
    L: { x: 138, y: 108, w: 28, h: 98, cut: [136, 104, 160, 110] }
  },
  hand: {
    R: { x: 34, y: 184, w: 22, h: 22, cut: [36, 186, 54, 184] },
    L: { x: 144, y: 184, w: 22, h: 22, cut: [146, 184, 164, 186] }
  },
  leg: {
    R: { x: 64, y: 224, w: 36, h: 122, cut: [64, 228, 100, 222] },
    L: { x: 100, y: 224, w: 36, h: 122, cut: [100, 222, 136, 228] }
  }
};

/** Where one injury goes. */
export function placeInjury(name, location) {
  const rule = INJURY_RULES.find((r) => r.re.test(String(name ?? "")));
  if (rule) return { anchor: rule.anchor, kind: rule.kind ?? "" };
  return { anchor: location === "head" ? "face" : "chest", kind: "" };
}

/** Is an anchor sided (left / right)? */
export const isSided = (anchor) => !!ANCHORS[anchor]?.L;

/**
 * The trauma map for a character's critical injuries.
 * @param {object[]} injuries - criticalInjury items (documents or data)
 * @param {string} moduleId - to read a side the GM or player picked (flags[moduleId].side)
 * @returns {{marks, severed, total, deathSaves, level, head, body}}
 *   marks: one per spot: { anchor, side, x, y, injuries: [{id, name, kind}], count, kind }
 */
export function traumaMap(injuries, moduleId) {
  const placed = [];
  const perLimb = {};
  for (const item of injuries) {
    const name = String(item.name ?? "");
    const location = item.system?.location === "head" ? "head" : "body";
    const { anchor, kind } = placeInjury(name, location);
    let side = null;
    if (isSided(anchor)) {
      const chosen = item.flags?.[moduleId]?.side;
      if (chosen === "L" || chosen === "R") side = chosen;
      else {
        // Spread a limb's injuries across both sides: right first, then left, then right...
        const group = LIMB[anchor] ?? anchor;
        side = (perLimb[group] = (perLimb[group] ?? 0) + 1) % 2 === 1 ? "R" : "L";
      }
    }
    placed.push({ id: idOf(item), name, kind, anchor, side, location, deathSave: !!item.system?.deathSaveIncrease });
  }

  const marks = new Map();
  for (const p of placed) {
    const key = `${p.anchor}:${p.side ?? ""}`;
    const at = p.side ? ANCHORS[p.anchor][p.side] : ANCHORS[p.anchor];
    const mark = marks.get(key) ?? { anchor: p.anchor, side: p.side, x: at.x, y: at.y, injuries: [], count: 0, kind: "" };
    mark.injuries.push({ id: p.id, name: p.name, kind: p.kind });
    mark.count += 1;
    if (p.kind === "severed" || (p.kind === "lost" && mark.kind !== "severed")) mark.kind = p.kind;
    marks.set(key, mark);
  }

  // A severed arm takes its hand with it; a severed hand alone just blacks out the hand.
  const severed = [];
  for (const p of placed) {
    if (p.kind !== "severed" || !SEVERED_SHAPES[p.anchor]) continue;
    if (severed.some((s) => s.side === p.side && (s.limb === p.anchor || (s.limb === "arm" && p.anchor === "hand")))) continue;
    if (p.anchor === "arm") for (let i = severed.length - 1; i >= 0; i--) if (severed[i].limb === "hand" && severed[i].side === p.side) severed.splice(i, 1);
    severed.push({ limb: p.anchor, side: p.side, ...SEVERED_SHAPES[p.anchor][p.side] });
  }

  const total = placed.length;
  const deathSaves = placed.filter((p) => p.deathSave).length;
  return {
    marks: [...marks.values()],
    severed,
    total,
    deathSaves,
    level: traumaLevel(total, deathSaves),
    head: placed.filter((p) => p.location === "head").length,
    body: placed.filter((p) => p.location === "body").length
  };
}

/** How bad it is overall: stable, injured, critical or failing. */
export function traumaLevel(total, deathSaves = 0) {
  if (!total) return "stable";
  if (total >= 5 || deathSaves >= 3) return "failing";
  if (total >= 3 || deathSaves >= 2) return "critical";
  return "injured";
}
