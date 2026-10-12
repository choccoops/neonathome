/** The Foundry hooks Neon At Home registers: encumbered MOVE, and the carry limit on the sheet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeActor, asUser, dialogs, callHook } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");

const rifle = (id, equipped) => ({ _id: id, name: `Rifle ${id}`, type: "weapon", system: { equipped, weaponType: "assaultRifle", handsReq: 2, installedItems: { list: [] } } });

test("encumbrance halves MOVE (rounded down, at least 1) or makes it 1", () => {
  const actor = { system: { stats: { move: { value: 7 } } } };
  callHook("applyActiveEffect", actor, { key: "system.stats.move.value", value: `${M}.half` });
  assert.equal(actor.system.stats.move.value, 3);
  actor.system.stats.move.value = 9;
  callHook("applyActiveEffect", actor, { key: "system.stats.move.value", value: `${M}.one` });
  assert.equal(actor.system.stats.move.value, 1);
  // other modules' custom changes are left alone
  callHook("applyActiveEffect", actor, { key: "system.stats.move.value", value: "someone-else" });
  assert.equal(actor.system.stats.move.value, 1);
});

test("the sheet's equip toggle can't carry past the slots; checked writes and the GM's override go through", async () => {
  asUser(false);
  // Unarmored: 10 slots. Three carried rifles = 9; a fourth would be 12.
  const actor = makeActor({ name: "Mule", type: "character", system: { stats: { body: { value: 6 } } } },
    [rifle("a", "carried"), rifle("b", "carried"), rifle("c", "carried"), rifle("d", "owned")]);
  const item = actor.items.get("d");
  dialogs.shown.length = 0;
  dialogs.next = "ok";
  assert.equal(callHook("preUpdateItem", item, { system: { equipped: "carried" } }, {}, game.user.id), false);
  assert.equal(dialogs.shown.length, 1);
  assert.equal(callHook("preUpdateItem", item, { system: { equipped: "carried" } }, { [M]: { checked: true } }, game.user.id), true);
  assert.equal(callHook("preUpdateItem", actor.items.get("a"), { system: { equipped: "owned" } }, {}, game.user.id), true, "putting things down is fine");
  // someone else's update is their client's business
  assert.equal(callHook("preUpdateItem", item, { system: { equipped: "carried" } }, {}, "someone"), true);
  await game.settings.set(M, "enforceCarry", "warn");
  assert.equal(callHook("preUpdateItem", item, { system: { equipped: "carried" } }, {}, game.user.id), true);
  await game.settings.set(M, "enforceCarry", "block");
  asUser(true);
});
