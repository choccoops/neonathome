import { test } from "node:test";
import assert from "node:assert/strict";
import { cyberwareMap, flatten } from "../scripts/data/cyberware.js";

const M = "cpr-neon-at-home";
const cw = (id, name, type, { slots = 0, list = [], size = 1, foundational = false, core = false, state } = {}) => ({
  _id: id, name, type: "cyberware",
  system: { type, size, isFoundational: foundational, core, installedItems: { slots, list } },
  flags: state ? { [M]: { item: { cyberState: state } } } : {}
});
const upg = (id, slots) => ({ _id: id, name: "Slot upgrade", type: "itemUpgrade", system: { type: "cyberware", size: 0, modifiers: { slots: { type: "modifier", value: slots } } }, flags: {} });

function body() {
  return [
    cw("link", "Neural Link", "neuralWare", { slots: 5, foundational: true, list: ["sandy", "plugs"] }),
    cw("sandy", "Sandevistan", "neuralWare", { size: 3 }),
    cw("plugs", "Interface Plugs", "neuralWare"),
    cw("armR", "Cyberarm", "cyberArm", { slots: 4, foundational: true, list: ["gun", "up"] }),
    cw("gun", "Popup Gun", "cyberArm", { size: 2 }),
    upg("up", 1),
    cw("armL", "Meat Arm", "cyberArm", { slots: 3, foundational: true }),
    cw("int", "Internal (7 Option Slots)", "cyberwareInternal", { slots: 7, core: true, list: ["bio"] }),
    cw("bio", "Biomonitor", "cyberwareInternal"),
    cw("ext", "External (7 Option Slots)", "cyberwareExternal", { slots: 7, core: true }),
    cw("loose", "Cybereye", "cyberEye", { slots: 3, foundational: true })
  ];
}
const installed = ["link", "armR", "armL", "int", "ext"];

test("groups installed cyberware by type, head to toe, with option slots used and total", () => {
  const m = cyberwareMap(body(), installed, M);
  assert.deepEqual(m.types.map((t) => t.type).slice(0, 9), ["neuralWare", "cyberEye", "cyberAudioSuite", "cyberArm", "cyberLeg", "cyberwareInternal", "cyberwareExternal", "fashionware", "borgware"]);
  const link = m.types[0].roots[0];
  assert.equal(link.slots, 5);
  assert.equal(link.used, 4);
  assert.deepEqual(link.children.map((c) => c.name), ["Sandevistan", "Interface Plugs"]);
  const arm = m.types[3].roots[0];
  assert.equal(arm.slots, 5, "a slot upgrade adds to the cyberarm's 4");
  assert.equal(arm.side, "R");
  assert.equal(m.types[3].roots[1].side, "L");
  assert.equal(m.types[3].roots[1].meat, true);
  assert.equal(m.types[1].roots.length, 0, "a cybereye that isn't installed isn't shown");
  assert.equal(m.total, 7, "the core containers (and the uninstalled cybereye) aren't counted");
});

test("an EMP'd or Destroyed piece takes what's installed in it offline too; Damaged still works", () => {
  const items = body();
  items.find((i) => i._id === "armR").flags = { [M]: { item: { emp: true } } };
  items.find((i) => i._id === "sandy").flags = { [M]: { item: { condition: "destroyed" } } };
  items.find((i) => i._id === "plugs").flags = { [M]: { item: { condition: "damaged", hidden: true } } };
  const m = cyberwareMap(items, installed, M);
  const all = flatten(m.types.flatMap((t) => t.roots));
  const byName = (n) => all.find((x) => x.name === n);
  assert.equal(byName("Cyberarm").state, "emp");
  assert.equal(byName("Popup Gun").state, "emp");
  assert.equal(byName("Popup Gun").inheritedOffline, true);
  assert.equal(byName("Sandevistan").state, "destroyed");
  assert.equal(byName("Neural Link").state, "");
  assert.equal(m.offline, 3);
  assert.equal(m.emp, 2);
  assert.equal(m.destroyed, 1);
  assert.equal(m.damaged, 1, "Damaged isn't offline");
  const link = m.marks.find((k) => k.type === "neuralWare");
  assert.equal(link.state, "destroyed", "the mark shows the worst");
  assert.equal(link.knownDamage, false, "the GM is keeping the damaged plugs quiet");
});

test("1.4.0 beta states read as the new ones: broken is Destroyed", () => {
  const items = body();
  items.find((i) => i._id === "armR").flags = { [M]: { item: { cyberState: "broken" } } };
  items.find((i) => i._id === "armL").flags = { [M]: { item: { cyberState: "emp" } } };
  const m = cyberwareMap(items, installed, M);
  assert.equal(m.types[3].roots[0].state, "destroyed");
  assert.equal(m.types[3].roots[1].state, "emp");
});

test("marks on the figure: one per piece in the body, limbs drawn in chrome unless they're meat", () => {
  const m = cyberwareMap(body(), installed, M);
  const arms = m.marks.filter((k) => k.type === "cyberArm");
  assert.deepEqual(arms.map((k) => [k.side, k.limb]), [["R", "arm"], ["L", null]]);
  assert.equal(m.marks.find((k) => k.type === "neuralWare").count, 3);
  assert.equal(m.marks.some((k) => k.type === "cyberwareExternal"), false, "an empty core container isn't marked");
  assert.equal(m.marks.find((k) => k.type === "cyberwareInternal").anchor, "chest");
});
