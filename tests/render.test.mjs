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
const { BiomonitorApp } = await import("../scripts/apps/biomonitor-app.js");
const { ItemConfig } = await import("../scripts/apps/item-config.js");
const { DowntimeTab } = await import("../scripts/apps/downtime.js");
loadTemplates();

const { actor } = buildFixture();

const app = new HomeApp();
app.actorId = actor.id;
const bio = new BiomonitorApp();
bio.actorId = actor.id;

async function renderTab(tab) {
  const win = tab === "biomonitor" ? bio : app;
  win.tab = tab;
  const ctx = await win._prepareContext();
  assert.equal(ctx.tab, tab);
  return { ctx, html: render("shell.hbs", ctx) };
}

test("the Biomonitor is a window of its own, not a tab of the home", async () => {
  app.tab = "loadout";
  const home = await app._prepareContext();
  assert.ok(!home.tabs.some((t) => t.id === "biomonitor"));
  assert.ok(home.homeHeader);
  const ctx = await bio._prepareContext();
  assert.equal(ctx.tab, "biomonitor");
  assert.equal(ctx.single, true);
  const html = render("shell.hbs", ctx);
  assert.ok(!html.includes('class="nah-tabs"'), "no tab bar");
  assert.ok(!html.includes("nah-downtime-badge"), "nor the home's header");
  assert.equal(bio.title, "Biomonitor: Vex");
  assert.equal(bio.id, "cpr-neon-at-home-biomonitor");
});

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
  bio.uiState.bio = { view: "cyber" };
  const { ctx, html } = await renderTab("biomonitor");
  bio.uiState.bio = { view: "vitals" };
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
  assert.ok(html.includes('data-action="cyberCondition"'));
  assert.ok(html.includes('data-action="cyberEmp"'));
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

test("Maintenance shows the cycle, the Lifestyle, the gear and the workbench", async () => {
  app.uiState.maint = { selected: "rifle0000000000a" };
  const { ctx, html } = await renderTab("maintenance");
  const m = ctx.maint;
  assert.equal(m.lifestyle.label, "Kibble");
  assert.equal(m.lifestyle.source, "(Neon Hub)");
  assert.ok(m.groups.some((g) => g.key === "weapon"));
  const stashGroup = m.groups.find((g) => g.key === "stash");
  assert.ok(stashGroup?.rows.some((r) => r.name === "Assault Rifle" && r.stash), "the home stash's gear, kept up by the character's Lifestyle");
  assert.ok(html.includes('data-holder="stash"'));
  assert.ok(!html.includes("Kibble</b></small>"), "Neon Hub's lifestyle items aren't gear");
  const sel = m.selected;
  assert.equal(sel.name, "Tsunami Arms Helix");
  assert.equal(sel.status, "due");
  assert.equal(sel.condition, "damaged");
  assert.equal(sel.can.maintain, true);
  assert.ok(sel.malf.text.includes("jams"));
  assert.ok(html.includes("Breaking Your Stuff, p.10"));
  assert.ok(html.includes('data-action="maintCheck"'));
  assert.ok(html.includes('data-action="maintCondition"'), "the GM's controls");
  assert.ok(html.includes("Sells for") || html.includes("pays"), "what it's worth");
  assert.ok(!/NEONHOME\./.test(html));
});

test("Downtime lists what anyone and each of the character's Roles can do, with the chosen action's terms", async () => {
  await game.settings.set("cpr-neon-at-home", "downtimeOn", true);
  app.uiState.downtime = { action: "hustle", params: {} };
  const { ctx, html } = await renderTab("downtime");
  const dt = ctx.dt;
  assert.equal(dt.state.active, true);
  assert.deepEqual(dt.groups.map((g) => g.key), ["anyone"], "no Role actions without a Role");
  assert.ok(dt.selected.blocked, "no Role, no Hustle");
  assert.ok(html.includes('data-action="dtPerform"'));
  assert.ok(html.includes("Start downtime") || html.includes("End downtime"), "the GM's switch, without Neon Hub");
  // rest: days and what it heals
  app.uiState.downtime = { action: "rest", params: { rest: { days: 2 } } };
  const restView = await renderTab("downtime");
  const rest = restView.ctx.dt.selected;
  assert.equal(rest.timeLabel, "2d");
  assert.ok(rest.canDo);
  assert.ok(restView.html.includes("Spend the time") && !restView.html.includes("Spend the time and roll"), "nothing to roll for rest");
  // treating: not yourself (a Treatment), only what a Quick Fix cures (p.222): Vex's Concussion
  app.uiState.downtime = { action: "treat", params: { treat: { patient: actor.id } } };
  const treat = (await renderTab("downtime")).ctx.dt.selected;
  assert.match(treat.fields.find((f) => f.name === "patient").options.find((o) => o.value === actor.id).label, /Quick Fix only/);
  assert.deepEqual(treat.fields.find((f) => f.name === "injury").options.map((o) => o.label), ["Concussion"], "not the Broken Ribs or the Dismembered Hand");
  const crit = actor.items.get("crit00000000000d");
  actor.items.delete(crit.id);
  const none = (await renderTab("downtime")).ctx.dt.selected;
  assert.ok(!none.fields.find((f) => f.name === "patient")?.options.some((o) => o.value === actor.id), "nothing a Quick Fix cures: not offered to themselves at all");
  actor.items.set(crit.id, crit);
  // the workshop lists what needs work
  app.uiState.downtime = { action: "workshop", params: {} };
  const shop = await renderTab("downtime");
  assert.ok(shop.ctx.dt.selected.workshop.due.some((e) => e.name === "Tsunami Arms Helix"));
  assert.ok(!/NEONHOME\./.test(shop.html));
  // projects: the meter with its halfway mark
  actor.flags["cpr-neon-at-home"].projects = [{ id: "p1", kind: "fabricate", label: "Fabricate a thing", skill: "Basic Tech", dv: 13, minutes: 360, done: 180 }];
  app.uiState.downtime = { action: "projects", params: {} };
  const proj = await renderTab("downtime");
  const row = proj.ctx.dt.selected.projects[0];
  assert.deepEqual([row.stage, row.pct, row.half, row.checkDue], ["check", 50, 50, true]);
  assert.equal(row.pick, null, "no slider while the check is due");
  assert.ok(proj.html.includes('data-action="dtProjRoll"'));
  assert.ok(!/NEONHOME\./.test(proj.html));
  // any amount into a project: a slider up to all it still needs
  actor.flags["cpr-neon-at-home"].projects = [{ id: "p2", kind: "fabricate", label: "Fabricate a thing", skill: "Basic Tech", dv: 17, minutes: 1440, done: 60 }];
  const slid = await renderTab("downtime");
  assert.deepEqual([slid.ctx.dt.selected.projects[0].pick.max, slid.ctx.dt.selected.projects[0].pick.value], [1380, 660], "up to 23h; to the check by default");
  assert.ok(slid.html.includes('data-minutes="pick"') && slid.html.includes("data-tp-range"));
  assert.ok(slid.html.includes('data-tp-unit="1440"') && slid.html.includes('data-tp-unit="60"') && slid.html.includes('data-tp-unit="1"'), "days, hours and minutes to type");
  app.uiState.downtime.picks = { p2: 90 };
  assert.equal((await renderTab("downtime")).ctx.dt.selected.projects[0].pick.label, "1h 30m", "the player's pick is kept");
  delete actor.flags["cpr-neon-at-home"].projects;
  // salvage: the place's tables, the worth DVs, and a haul to pick out
  await game.settings.set("cpr-neon-at-home", "salvageEra", "2070");
  actor.flags["cpr-neon-at-home"].hauls = [{ id: "h1", era: "2070", location: "badlands", category: "weapons", worth: 500, spent: 100, taken: [{ name: "Heavy Pistol", eb: 100 }] }];
  app.uiState.downtime = { action: "salvage", params: { salvage: { location: "badlands" } } };
  const sal = await renderTab("downtime");
  assert.equal(sal.ctx.dt.selected.timeLabel, "7d");
  assert.deepEqual(sal.ctx.dt.selected.table.map((r) => r.n), ["DV9", "DV13", "DV15", "DV17", "DV24", "DV29"]);
  const haul = sal.ctx.dt.selected.hauls[0];
  assert.equal(haul.left, "400eb");
  assert.deepEqual(haul.tiers.map((t) => t.tier), ["cheap", "everyday", "costly", "premium"], "materials the 400eb left covers");
  assert.ok(sal.html.includes("The Badlands") && sal.html.includes('data-drop="haul"') && sal.html.includes('data-action="dtHaulTier"'));
  assert.ok(!/NEONHOME\./.test(sal.html));
  app.uiState.downtime = { action: "salvage", params: { salvage: { location: "badlands", category: "cyberdecks" } } };
  const hunt = (await renderTab("downtime")).ctx.dt.selected;
  assert.deepEqual(hunt.table.map((r) => r.n), ["DV13", "DV15", "DV17", "DV21", "DV29"], "a category: harder, and no 1,000eb");
  delete actor.flags["cpr-neon-at-home"].hauls;
  // a Tech strips gear: the list, the parts picked against the tier
  const [role] = await actor.createEmbeddedDocuments("Item", [{ name: "Tech", type: "role", system: { rank: 4, abilities: [] } }]);
  // a Maker panel shows what's under way of its kind; its Start button is tied to the panel
  actor.flags["cpr-neon-at-home"].projects = [{ id: "pf", kind: "fabricate", label: "Fabricate Rifle", skill: "Weaponstech", dv: 21, minutes: 10080, done: 5040 }];
  app.uiState.downtime = { action: "fabricate", params: {} };
  const fabUnder = await renderTab("downtime");
  assert.deepEqual(fabUnder.ctx.dt.selected.underway.map((u) => u.label), ["Fabricate Rifle"]);
  assert.ok(fabUnder.html.includes('data-dt="projects"'));
  app.uiState.downtime = { action: "invent", params: { invent: { text: "draft" } } };
  const invView = await renderTab("downtime");
  assert.equal(invView.ctx.dt.selected.underway.length, 0, "only its own kind");
  assert.ok(invView.html.includes('data-dt-perform="invent"'));
  delete actor.flags["cpr-neon-at-home"].projects;
  // a stale Start click from another panel does nothing
  let started = 0;
  const { ProjectOps } = await import("../scripts/home/project-ops.js");
  const realStart = ProjectOps.start;
  ProjectOps.start = async () => started++;
  app.uiState.downtime = { action: "projects", params: { invent: { text: "draft" } } };
  await DowntimeTab.actions.dtPerform.call(app, {}, { dataset: { dtPerform: "invent" } });
  assert.equal(started, 0, "the Projects panel's clicks never start an invention");
  ProjectOps.start = realStart;
  // starting one: an amount of my choosing
  app.uiState.downtime = { action: "invent", params: { invent: { text: "x", category: "expensive", now: "custom", nowMinutes: 600 } } };
  const inv = await renderTab("downtime");
  const f = inv.ctx.dt.selected.fields.find((x) => x.name === "nowMinutes");
  assert.deepEqual([f.pick.max, f.pick.value], [10080, 600]);
  app.uiState.downtime.params.invent.nowMinutes = 20000;
  assert.match((await renderTab("downtime")).ctx.dt.selected.blocked, /More than there is: 7d at most/, "can't start with more than there is");
  assert.ok(!/NEONHOME\./.test(inv.html));
  app.uiState.downtime = { action: "strip", params: { strip: { tier: "premium" } } };
  const strip = await renderTab("downtime");
  assert.ok(strip.ctx.dt.selected.strip.length > 0, "gear to strip");
  assert.ok(strip.ctx.dt.selected.blocked, "nothing picked yet");
  assert.ok(strip.html.includes("data-strip-pick") && strip.html.includes("Strip for parts"));
  assert.ok(!/NEONHOME\./.test(strip.html));
  // Fabricate shows the materials it takes and how many the Tech has
  app.uiState.downtime = { action: "fabricate", params: { fabricate: { item: "x", itemInfo: { name: "Rifle", img: "", price: 500, skill: "Weaponstech", category: "Expensive" } } } };
  const fab = (await renderTab("downtime")).ctx.dt.selected;
  assert.ok(fab.facts.some((f) => f.value === "1 × Premium Tech Materials (has 0)"));
  assert.match(fab.blocked, /needs 1 × Premium Tech Materials/);
  await actor.deleteEmbeddedDocuments("Item", [role.id]);
  await game.settings.set("cpr-neon-at-home", "downtimeOn", false);
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
