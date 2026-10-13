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
  // rifle 3 + agent 1 + the loose Smartgun Link 1 = 5 general; the rounds go in the ammo bag, the pistol in the pocket
  assert.equal(l.used, 5);
  assert.equal(l.pools[0].bar.used, 1);
  assert.ok(l.weight.max === 18);
  assert.ok(html.includes("Medium Armorjack (Body)"));
  assert.ok(html.includes("Militech Avenger"));
  assert.ok(html.includes("Medtech Bag"), "owned items are listed as not on you");
  assert.ok(!html.includes("Kibble"), "lifestyle items stay out of the Loadout");
  assert.ok(!html.includes("Neural Link"), "cyberware in the body isn't listed");
  assert.equal(l.pools[0].bar.used, 1, "...and doesn't fill the ammo bag either");
  // the Subdermal Pocket's slots: the pistol moves into it from the general slots
  const pocket = l.pools.find((p) => p.name === "Subdermal Pocket");
  assert.equal(pocket.bar.slots, 2);
  assert.equal(pocket.bar.used, 2);
  assert.ok(html.includes("+2 Subdermal Pocket (Gear / utility or one-handed weapons only)"));
  // the carry bar: 5 used of 21, by kind, 16 free
  assert.equal(l.bar.free, 16);
  assert.deepEqual(l.bar.segments.map((g) => [g.cat, g.slots]), [["twoHanded", 3], ["utility", 2]]);
  assert.ok(html.includes("16 free"));
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

test("Biomonitor's cyberware view: types, slots, the chrome arm and the EMP'd gun", async () => {
  app.uiState.bio = { view: "cyber" };
  const { ctx, html } = await renderTab("biomonitor");
  app.uiState.bio = { view: "vitals" };
  const c = ctx.bio.cyber;
  assert.equal(c.total, 4, "neural link, cyberarm, popup gun, subdermal pocket");
  assert.equal(c.emp, 1);
  const arms = c.types.find((t) => t.type === "cyberArm");
  assert.equal(arms.cards[0].slots, 4);
  assert.equal(arms.cards[0].used, 2);
  assert.equal(arms.cards[0].rows[0].state, "emp");
  assert.equal(c.limbs.length, 1, "the cyberarm is drawn in chrome");
  assert.equal(c.limbs[0].state, "ok", "the arm itself works; only the gun in it is EMP'd");
  assert.equal(c.marks.find((k) => k.rootId === "cyberarm0000000a").state, "emp", "its marker flags what's offline inside");
  assert.ok(html.includes("No Neural Link") === false, "this character has one");
  assert.ok(html.includes("EMP&#x27;d") || html.includes("EMP'd"));
  assert.ok(html.includes('data-action="cyberState"'));
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
  // Bonus carry slots can only be set on a Subdermal Pocket, not on other cyberware.
  const pocketHtml = render("item-config.hbs", await new ItemConfig(actor.items.get("pocket000000000a"))._prepareContext());
  const linkHtml = render("item-config.hbs", await new ItemConfig(actor.items.get("neuralink000000a"))._prepareContext());
  assert.ok(pocketHtml.includes('name="flag.carry.pools.0.slots"'));
  assert.ok(!linkHtml.includes("flag.carry"), "no carry-slot pools on unrelated cyberware");
  assert.ok(linkHtml.includes("Slot cost when carried loose"), "and its own slot cost says when it applies");
  const rules = new RulesConfig();
  const html = render("rules-config.hbs", await rules._prepareContext());
  assert.ok(html.includes("Metal Gear"));
  assert.ok(html.includes('name="carry.classes.metalgear.carry" value="42"'));
  assert.ok(!/NEONHOME\./.test(html));
});

test("every localization key the code asked for exists", () => {
  assert.deepEqual([...missingKeys], []);
});
