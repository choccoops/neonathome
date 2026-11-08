/** Weapon Rebuilds: the list Neon Combat Manager applies in a fight, and what the Weaponbench shows of it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTemplates, render, makeActor, callHook, missingKeys } from "./helpers/foundry.mjs";

const M = "cpr-neon-at-home";
const { REBUILDS, rebuildFor, rebuildInfo } = await import("../scripts/data/rebuilds.js");
await import("../scripts/main.js");
const { HomeApp } = await import("../scripts/apps/home-app.js");
loadTemplates();

test("each rebuild matches its items by name, and only those", () => {
  assert.equal(rebuildFor("Mono-edge Blading (Upgraded)")?.id, "monoEdgeBlading");
  assert.equal(rebuildFor("Monoblade Rebuild (Basic / Perfected / Tuned)")?.id, "monobladeRebuild");
  assert.equal(rebuildFor("Propulsion Impact (Basic)")?.id, "propulsionImpact");
  assert.equal(rebuildFor("Ricochet Compensator")?.id, "ricochetCompensator");
  assert.equal(rebuildFor("Sniping Scope"), null);
  for (const r of REBUILDS) assert.doesNotThrow(() => new RegExp(r.match, "i"), r.id);
});

test("the tier comes from the name, else the bench's pick, else the first", () => {
  assert.deepEqual(rebuildInfo("Mono-edge Blading (Excellent)").lines, [{ key: "ignoreBelowSP", data: { sp: 13 } }]);
  assert.equal(rebuildInfo("Mono-edge Blading (Excellent)").choose, false);
  const all = rebuildInfo("Monoblade Rebuild (Basic / Perfected / Tuned)");
  assert.ok(all.choose);
  assert.deepEqual(all.tiers, ["Basic", "Tuned", "Perfected"]);
  assert.equal(all.tier, "Basic");
  assert.equal(rebuildInfo("Monoblade Rebuild (Basic / Perfected / Tuned)", "perfected").lines[0].data.sp, 13);
  assert.deepEqual(rebuildInfo("Propulsion Impact (Basic)").lines, [{ key: "pushBody", data: { metres: 2, body: 13 } }]);
  assert.deepEqual(rebuildInfo("Propulsion Impact (Upgraded)").lines, [{ key: "push", data: { metres: 4, body: "" } }]);
  assert.deepEqual(rebuildInfo("Ricochet Compensator").lines, [{ key: "ricochet", data: { value: "+1" } }]);
  assert.equal(rebuildInfo("Sniping Scope"), null);
});

test("Neon Combat Manager gets the list in its registerRebuilds hook", () => {
  const got = [];
  callHook("cpr-neon-combat-manager.registerRebuilds", { registerRebuild: (def) => got.push(def.id) });
  assert.deepEqual(got, REBUILDS.map((r) => r.id));
});

test("the Weaponbench shows a Rebuild's effect in a fight and lets you pick its tier", async () => {
  const actor = makeActor({ name: "Fury" }, [
    { _id: "katana0000000000", name: "Katana", type: "weapon", system: { equipped: "equipped", weaponType: "heavyMelee", isRanged: false, installedItems: { list: ["mono000000000000"], slots: 3 } } },
    { _id: "mono000000000000", name: "Monoblade Rebuild (Basic / Perfected / Tuned)", type: "itemUpgrade", system: { type: "weapon", size: 1, isInstalled: true, modifiers: {} }, flags: { [M]: { rebuildTier: "Tuned" } } }
  ]);
  const app = new HomeApp();
  app.actorId = actor.id;
  app.tab = "bench";
  const ctx = await app._prepareContext();
  const att = ctx.bench.weapon.attachments[0];
  assert.ok(att.benefits.some((b) => b.combat && /SP11/.test(b.text)), "the Tuned tier");
  assert.deepEqual(att.rebuild.tiers.map((t) => [t.value, t.selected]), [["Basic", false], ["Tuned", true], ["Perfected", false]]);
  const html = render("shell.hbs", ctx);
  assert.match(html, /<select data-tier="mono000000000000">/);
  assert.ok(!/NEONHOME\./.test(html));
  assert.deepEqual([...missingKeys].filter((k) => k.includes("Rebuild")), []);
});
