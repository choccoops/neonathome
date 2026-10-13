import { test } from "node:test";
import assert from "node:assert/strict";
import { placeInjury, traumaMap, traumaLevel } from "../scripts/data/injuries.js";

const M = "cpr-neon-at-home";
let n = 0;
const inj = (name, location = "body", { deathSave = false, side } = {}) => ({
  _id: `c${++n}`, name, type: "criticalInjury",
  system: { location, deathSaveIncrease: deathSave },
  flags: side ? { [M]: { side } } : {}
});

test("every core critical injury lands somewhere specific", () => {
  const expect = {
    "Broken Arm": "forearm", "Broken Ribs": "ribs", "Crushed Fingers": "hand", "Broken Leg": "leg", "Collapsed Lung": "lung",
    "Dismembered Arm": "arm", "Dismembered Leg": "leg", "Dismembered Hand": "hand", "Spinal Injury": "spine", "Torn Muscle": "arm",
    "Broken Jaw": "jaw", "Damaged Ear": "ear", "Lost Ear": "ear", "Lost Eye": "eye", "Damaged Eye": "eye", "Concussion": "brain",
    "Brain Injury": "brain", "Crushed Windpipe": "throat", "Whiplash": "throat", "Cracked Skull": "skull"
  };
  for (const [name, anchor] of Object.entries(expect)) assert.equal(placeInjury(name, "body").anchor, anchor, name);
  assert.equal(placeInjury("Foreign Object", "body").anchor, "chest");
  assert.equal(placeInjury("Foreign Object (H)", "head").anchor, "face");
  assert.equal(placeInjury("Dismembered Arm").kind, "severed");
  assert.equal(placeInjury("Lost Eye").kind, "lost");
  // whole words only
  assert.equal(placeInjury("Nerve Harm", "body").anchor, "chest");
  assert.equal(placeInjury("Neural Backlash", "head").anchor, "face");
});

test("injuries at one spot stack; a limb's injuries spread across both sides", () => {
  const map = traumaMap([inj("Broken Ribs"), inj("Broken Ribs"), inj("Broken Ribs"), inj("Concussion", "head")], M);
  const ribs = map.marks.filter((m) => m.anchor === "ribs");
  assert.deepEqual(ribs.map((m) => [m.side, m.count]).sort(), [["L", 1], ["R", 2]]);
  assert.equal(map.total, 4);
  assert.equal(map.head, 1);
  assert.equal(map.body, 3);
  const arms = traumaMap([inj("Broken Arm"), inj("Crushed Fingers")], M).marks;
  assert.deepEqual(arms.map((m) => m.side), ["R", "L"], "the second arm injury goes to the other arm");
  const chosen = traumaMap([inj("Broken Arm", "body", { side: "L" }), inj("Broken Arm", "body", { side: "L" })], M).marks;
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].count, 2);
  assert.equal(chosen[0].side, "L");
});

test("severed limbs are blacked out; a lost arm takes the hand's shape with it", () => {
  const map = traumaMap([inj("Dismembered Hand", "body", { side: "R" }), inj("Dismembered Arm", "body", { side: "R" }), inj("Dismembered Leg", "body", { side: "L" })], M);
  assert.deepEqual(map.severed.map((s) => `${s.limb}:${s.side}`).sort(), ["arm:R", "leg:L"]);
  assert.equal(map.marks.find((m) => m.anchor === "leg").kind, "severed");
});

test("trauma levels by how many and how dangerous", () => {
  assert.equal(traumaLevel(0), "stable");
  assert.equal(traumaLevel(2), "injured");
  assert.equal(traumaLevel(3), "critical");
  assert.equal(traumaLevel(1, 2), "critical");
  assert.equal(traumaLevel(5), "failing");
  assert.equal(traumaLevel(3, 3), "failing");
});

test("an offline cyberlimb's Dismembered injury blacks out that limb, on its side", () => {
  const t = traumaMap([
    { name: "Dismembered Arm (EMP'd Cyberarm)", system: { location: "body" }, flags: { [M]: { side: "L" } } },
    { name: "Dismembered Leg (Broken Cyberleg)", system: { location: "body" }, flags: { [M]: { side: "R" } } }
  ], M);
  assert.deepEqual(t.severed.map((s) => `${s.limb}${s.side}`), ["armL", "legR"]);
});
