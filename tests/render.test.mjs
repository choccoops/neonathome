/**
 * Runs each tab's real context code against mock Cyberpunk RED documents and renders the real
 * templates, so template errors, missing localization keys and context mistakes show up in CI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTemplates, render, missingKeys } from "./helpers/foundry.mjs";
import { buildFixture } from "./helpers/fixture.mjs";

const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { HomeApp } = await import("../scripts/apps/home-app.js");
const { ItemConfig } = await import("../scripts/apps/item-config.js");
loadTemplates();

const { actor } = buildFixture();

const app = new HomeApp();
app.actorId = actor.id;

async function renderTab(tab) {
  app.tab = tab;
  const ctx = await app._prepareContext();
  assert.equal(ctx.tab, tab);
  return { ctx, html: render("shell.hbs", ctx) };
}

test("Loadout renders carry slots, the doll, upgrades and the stash", async () => {
  const { ctx, html } = await renderTab("loadout");
  const l = ctx.loadout;
  assert.equal(l.armorClass, "Medium Armorjack");
  assert.equal(l.capacity, 21);
  // pistol 2 + rifle 3 + agent 1 + the loose Smartgun Link 1 = 7 general; the rounds go in the ammo bag
  assert.equal(l.used, 7);
  assert.equal(l.pools[0].bar.used, 1);
  assert.ok(l.weight.max === 18);
  assert.ok(html.includes("Medium Armorjack (Body)"));
  assert.ok(html.includes("Militech Avenger"));
  assert.ok(html.includes("Medtech Bag"), "owned items are listed as not on you");
  assert.ok(!html.includes("Kibble"), "lifestyle items stay out of the Loadout");
  assert.ok(!html.includes("Neural Link"), "cyberware in the body isn't listed");
  assert.equal(l.pools[0].bar.used, 1, "...and doesn't fill the ammo bag either");
  // the carry bar: 7 used of 21, by kind, 14 free
  assert.equal(l.bar.free, 14);
  assert.deepEqual(l.bar.segments.map((g) => [g.cat, g.slots]), [["twoHanded", 3], ["oneHanded", 2], ["utility", 2]]);
  assert.ok(html.includes("14 free"));
  assert.ok(html.includes("Plate Padding"), "stash upgrades are offered");
  assert.ok(l.effects.some((e) => e.includes("DEX")), "Improved Flexibility offsets the DEX penalty");
  assert.equal(l.store.rows.length, 3);
  assert.ok(!/NEONHOME\./.test(html), "no raw localization keys in the page");
});

test("Vehicle Bay lays out bays, the street and VAS seats", async () => {
  const { ctx, html } = await renderTab("bay");
  assert.equal(ctx.bay.slots, 2);
  assert.equal(ctx.bay.bays[0].vehicle.name, "Thorton Galena");
  assert.equal(ctx.bay.bays[0].vehicle.seats.length, 2);
  assert.equal(ctx.bay.street[0].name, "Superbike");
  assert.ok(html.includes("Gunner"));
  assert.ok(html.includes("150 MPH"));
  // the spare tire (8) and the mounted MG at a third (4 x 0.33); the car's own armor isn't cargo
  assert.equal(ctx.bay.bays[0].vehicle.cargo.current, 9.3);
  assert.ok(!/NEONHOME\./.test(html));
});

test("Biomonitor shows HP, injuries, the tier and Syndromes", async () => {
  const { ctx, html } = await renderTab("biomonitor");
  const p = ctx.bio.psyche;
  assert.equal(p.tierKey, "borderline");
  assert.equal(p.antipathy, true);
  assert.equal(p.syndromes.find((s) => s.id === "s3").state, "dormant");
  assert.equal(p.syndromes.find((s) => s.id === "s2").variant, "The Knight");
  assert.ok(html.includes("Broken Ribs"));
  assert.ok(html.includes("Paramedic DV15"));
  assert.ok(html.includes("Glitch Hunger"));
  // trauma map: two broken ribs stack on the right, the left hand is gone, a concussion on the brain
  const t = ctx.bio.trauma;
  assert.equal(t.total, 4);
  assert.equal(t.level, "critical");
  const ribs = t.marks.find((m) => m.count === 2);
  assert.ok(ribs && ribs.stack === 2 && ribs.multi);
  assert.equal(t.severed.length, 1);
  assert.ok(html.includes('class="nah-severed"'));
  assert.ok(html.includes("is-severed"));
  assert.ok(html.includes("Right"), "sided injuries show their side");
  assert.ok(!/NEONHOME\./.test(html));
});

test("Weaponbench shows sockets, stats and the drawer", async () => {
  const { ctx, html } = await renderTab("bench");
  const w = ctx.bench.weapon;
  assert.equal(w.name, "Militech Avenger");
  assert.equal(w.slots, 3);
  assert.equal(w.used, 1);
  assert.equal(w.rows.find((r) => r.point === "magazine").value, 12);
  assert.equal(w.attachments[0].canDetach, false);
  const names = ctx.bench.drawer.map((d) => d.name);
  assert.deepEqual(names.sort(), ["Smartgun Link", "Sniping Scope"]);
  assert.ok(html.includes("Looks mean"));
  assert.ok(html.includes("+1 to attack"));
  assert.ok(!/NEONHOME\./.test(html));
});

test("item and rules config windows render", async () => {
  for (const id of ["bodyArmor000000a", "ammoBag00000000a", "extMag000000000a", "agent0000000000a"]) {
    const cfg = new ItemConfig(actor.items.get(id));
    const html = render("item-config.hbs", await cfg._prepareContext());
    assert.ok(html.includes(actor.items.get(id).name));
    assert.ok(!/NEONHOME\./.test(html), `raw keys in item config for ${id}`);
  }
  const rules = new RulesConfig();
  const html = render("rules-config.hbs", await rules._prepareContext());
  assert.ok(html.includes("Metal Gear"));
  assert.ok(html.includes('name="carry.classes.metalgear.carry" value="42"'));
  assert.ok(!/NEONHOME\./.test(html));
});

test("every localization key the code asked for exists", () => {
  assert.deepEqual([...missingKeys], []);
});
