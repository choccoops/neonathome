// Render each tab of the home suite (and the config windows) to static HTML with the test
// character, for checking the look in a browser without Foundry: `npm run preview`, then serve
// the repository folder (e.g. `python3 -m http.server`) and open preview/index.html.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTemplates, render } from "../tests/helpers/foundry.mjs";
import { buildFixture } from "../tests/helpers/fixture.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "preview");
const { Settings } = await import("../scripts/settings.js");
const { RulesConfig } = await import("../scripts/apps/rules-config.js");
Settings.register(RulesConfig);
await import("../scripts/main.js");
const { HomeApp } = await import("../scripts/apps/home-app.js");
const { BiomonitorApp } = await import("../scripts/apps/biomonitor-app.js");
const { ItemConfig } = await import("../scripts/apps/item-config.js");
loadTemplates();
const { actor } = buildFixture();

// Foundry's own icons aren't here: stand-ins so the page isn't full of broken images.
const art = (html) => html
  .replace(/src="icons\/svg\/mystery-man\.svg"/g, 'src="../tools/preview-portrait.svg"')
  .replace(/src="icons\/[^"]*"/g, 'src="../tools/preview-item.svg"');

const page = (title, body, { width = 1220, height = 840, cls = "" } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Signika:wght@400;600&display=swap">
<link rel="stylesheet" href="../styles/neon-home.css">
<style>
  body { margin: 0; padding: 20px; background: #1b1b22; font-family: Signika, sans-serif; }
  .application { width: ${width}px; height: ${height}px; display: flex; flex-direction: column; }
  .window-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 13px; }
  .window-header h1 { margin: 0; font-size: 13px; font-weight: 400; flex: 1; }
  .window-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .window-content > * { flex: 1; min-height: 0; }
  nav.preview { margin-bottom: 12px; font: 13px Signika, sans-serif; } nav.preview a { color: #05d9e8; margin-right: 12px; }
</style></head><body>
<nav class="preview"><a href="loadout.html">Loadout</a><a href="bay.html">Vehicle Bay</a><a href="biomonitor.html">Biomonitor</a><a href="cyberware.html">Cyberware</a><a href="bench.html">Weaponbench</a><a href="maintenance.html">Maintenance</a><a href="maintenance-rent.html">Maintenance (Rent Day)</a><a href="downtime.html">Downtime</a><a href="downtime-fab.html">Downtime: Fabricate</a><a href="downtime-projects.html">Downtime: Projects</a><a href="downtime-salvage.html">Downtime: Salvage</a><a href="downtime-strip.html">Downtime: Strip</a><a href="downtime-synth.html">Downtime: Cook</a><a href="downtime-drug-invent.html">Downtime: Drug invention</a><a href="item-config.html">Item config</a><a href="blueprint-config.html">Blueprint config</a><a href="deck.html">Cyberdeck</a><a href="perks.html">Perk Tree</a><a href="perks-general.html">Perks: General</a><a href="perks-role.html">Perks: Role</a><a href="dive.html">Deep Dive</a><a href="dive-architect.html">Dive: Architect</a><a href="spend-ip.html">Spend IP</a><a href="rules.html">Rules</a></nav>
<div class="application neon-home ${cls}"><header class="window-header"><i class="window-icon fa-solid fa-house-chimney-window"></i><h1>${title}</h1><i class="fa-solid fa-xmark"></i></header>
<section class="window-content">${art(body)}</section></div>
<script>
  // Fit the window to the browser so the whole thing shows in one screenshot.
  const fit = () => { document.body.style.zoom = Math.min(1, innerWidth / (${width} + 40)); };
  addEventListener("resize", fit); fit();
</script></body></html>`;

await mkdir(out, { recursive: true });
const app = new HomeApp();
app.actorId = actor.id;
app.uiState.maint = { selected: "rifle0000000000a" };
const bio = new BiomonitorApp();
bio.actorId = actor.id;
await writeFile(path.join(out, "biomonitor.html"), page(`Biomonitor: ${actor.name}`, render("shell.hbs", await bio._prepareContext())));
for (const tab of ["loadout", "bay", "bench", "maintenance"]) {
  app.tab = tab;
  await writeFile(path.join(out, `${tab}.html`), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
}
// Maintenance following a Neon Hub calendar's Rent Day
game.modules.set("cpr-neon-hub", {
  active: true,
  api: {
    lifestyleBill: async () => ({ billing: { mode: "calendar", calendar: { id: "nc", name: "Night City" }, period: 2045 * 12 + 10, label: "November 2045", next: { days: 12, today: false } } })
  }
});
app.tab = "maintenance";
await writeFile(path.join(out, "maintenance-rent.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
game.modules.delete("cpr-neon-hub");
bio.uiState.bio = { view: "cyber" };
await writeFile(path.join(out, "cyberware.html"), page(`Biomonitor: ${actor.name}`, render("shell.hbs", await bio._prepareContext())));
bio.uiState.bio = { view: "vitals" };

// Downtime: Vex as a Tech and Medtech, in a Neon Hub downtime with 4 days 6 hours left of a week
await actor.createEmbeddedDocuments("Item", [
  { name: "Tech", type: "role", system: { rank: 4, abilities: [{ name: "Field Expertise", rank: 1 }, { name: "Fabrication Expertise", rank: 2 }, { name: "Upgrade Expertise", rank: 1 }] } },
  { name: "Medtech", type: "role", system: { rank: 2, abilities: [{ name: "Medical Tech Skill", rank: 2 }, { name: "Surgery Skill", rank: 2 }] } }
]);
actor.system.wealth = { value: 2400, transactions: [] };
const call = { id: "c", label: "After the Arasaka job", total: 10080, status: "open", participants: [actor.uuid] };
const log = [{ label: "Hustle (Tech)", minutes: 0, source: "x" }, { label: "Maintenance: Tsunami Arms Helix", minutes: 60, source: "cpr-neon-at-home" }, { label: "Rest and recover", minutes: 2820, source: "cpr-neon-at-home" }];
game.modules.set("cpr-neon-hub", { active: true, api: { downtime: {
  current: () => call, balance: () => ({ total: 10080, spent: 3960, left: 6120, taking: true }), log: () => log, spend: async () => null, open: () => null
} } });
app.tab = "downtime";
app.uiState.downtime = { action: "hustle", params: { hustle: { role: "tech" } } };
await writeFile(path.join(out, "downtime.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
actor.flags["cpr-neon-at-home"].projects = [{ id: "p0", kind: "fabricate", label: "Fabricate Militech Avenger", skill: "Weaponstech", dv: 21, minutes: 10080, done: 5040 }];
app.uiState.downtime = { action: "fabricate", params: { fabricate: { item: "x", itemInfo: { name: "Militech Avenger", img: "../tools/preview-item.svg", price: 500, skill: "Weaponstech", category: "Expensive" } } } };
await writeFile(path.join(out, "downtime-fab.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
actor.flags["cpr-neon-at-home"].projects = [
  { id: "p1", kind: "fabricate", label: "Fabricate Militech Avenger", img: "../tools/preview-item.svg", skill: "Weaponstech", ability: "Fabrication Expertise", dv: 21, minutes: 10080, done: 5040, check: null, restarts: 1, materials: 100, data: {} },
  { id: "p2", kind: "upgrade", label: "Upgrade Tsunami Arms Helix: One more option/attachment/program slot", img: "../tools/preview-item.svg", skill: "Weaponstech", ability: "Upgrade Expertise", dv: 21, minutes: 10080, done: 7200, check: "passed", restarts: 0, materials: 500, data: {} }
];
app.uiState.downtime = { action: "projects", params: {} };
await writeFile(path.join(out, "downtime-projects.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
// Salvage in 2070's Badlands, with a haul half picked out
await game.settings.set("cpr-neon-at-home", "salvageEra", "2070");
actor.flags["cpr-neon-at-home"].hauls = [{ id: "h1", era: "2070", location: "badlands", category: "weapons", worth: 500, spent: 100, taken: [{ name: "Heavy Pistol", eb: 100 }] }];
app.uiState.downtime = { action: "salvage", params: { salvage: { location: "badlands" } } };
await writeFile(path.join(out, "downtime-salvage.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
// Strip for parts: two items picked toward a Premium unit
const picks = Object.fromEntries((await import("../scripts/home/salvage-ops.js")).SalvageOps.strippable(actor).slice(0, 2).map((s) => [s.item.id, 1]));
app.uiState.downtime = { action: "strip", params: { strip: { tier: "premium", picks } } };
await writeFile(path.join(out, "downtime-strip.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
game.modules.delete("cpr-neon-hub");
// The Cyberdeck: Vex as a Netrunner with a Segotari Hexmage Cybersuite and a Standard deck
{
  const net = await import("../scripts/data/netrun.js");
  const { DeckOps } = await import("../scripts/home/deck-ops.js");
  const M = "cpr-neon-at-home";
  const qh = (n) => net.quickhackItem(net.QUICKHACK_BY_NAME.get(n.toLowerCase()), M);
  const suite = { ...net.cybersuiteItem(net.CYBERSUITES.find((c) => c.name === "Segotari Hexmage"), M) };
  const deck = net.deckItem(net.DECKS.find((d) => d.name === "Cyberdeck (Standard)"), M);
  deck.system.equipped = "equipped";
  const made = await actor.createEmbeddedDocuments("Item", [
    { name: "Netrunner", type: "role", system: { rank: 5, abilities: [] } }, suite, deck,
    net.deckItem(net.DECKS.find((d) => d.name === "Zetatech Parraline 6000"), M), net.deckItem(net.DECKS.find((d) => d.name === "Raven Microcyb Hummingbird"), M),
    qh("System Reset"), qh("Short Circuit"), qh("Overheat"), qh("Ping"), qh("Scannerz"), qh("Synapse Burnout"), qh("Weapon Glitch"), qh("Memory Wipe"),
    net.hardwareItem(net.HARDWARE.find((h) => h.name === "Orbital Air Sigbooster"), M), net.hardwareItem(net.HARDWARE.find((h) => h.name === "Raven Heat Sink"), M), net.hardwareItem(net.HARDWARE.find((h) => h.name === "Zetatech Ghost Protocol"), M),
    { name: "Eraser", type: "program", system: { class: "booster", size: 1, description: { value: "<p>+2 to Cloak while Rezzed.</p>" } } }
  ]);
  const byName = (n) => made.find((i) => i.name === n);
  actor.system.installedItems.list.push(byName("Segotari Hexmage").id);
  for (const n of ["System Reset", "Short Circuit", "Overheat", "Ping", "Orbital Air Sigbooster"]) await DeckOps.slot(actor, byName(n).id);
  app.tab = "deck";
  app.uiState.deck = { tab: "quickhacks", focus: byName("System Reset").id };
  await writeFile(path.join(out, "deck.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
}
// The Perk Tree: Vex with a few perks, on the Body branch, Good Shape in focus
{
  const { PerksApp } = await import("../scripts/apps/perks-app.js");
  const { PerkOps } = await import("../scripts/home/perk-ops.js");
  actor.system.stats.body = { value: 8, max: 8 };
  await PerkOps.award(actor, 4, "Big moment");
  for (const id of ["decentShape", "darkAppetite"]) await PerkOps.buy(actor, id, { force: true });
  const perks = new PerksApp();
  perks.actorId = actor.id;
  // the window's own script draws the tree's links and plays the unlock; a stand-in for the preview
  const demo = `<script>
    const draw = () => document.querySelectorAll(".nah-perk-group").forEach((g) => {
      const svg = g.querySelector("svg"); const box = g.getBoundingClientRect(); const z = parseFloat(document.body.style.zoom) || 1; let out = "";
      g.querySelectorAll("[data-from]").forEach((c) => c.dataset.from.split(" ").forEach((id) => {
        const p = g.querySelector('[data-perk="' + id + '"]'); if (!p) return;
        const a = p.getBoundingClientRect(), b = c.getBoundingClientRect();
        const x1 = (a.right - box.left) / z, y1 = (a.top + a.height / 2 - box.top) / z, x2 = (b.left - box.left) / z, y2 = (b.top + b.height / 2 - box.top) / z, m = (x1 + x2) / 2;
        out += '<path class="' + (["on","off","dormant"].includes(p.dataset.state) ? "lit" : "") + '" d="M' + x1 + "," + y1 + " C" + m + "," + y1 + " " + m + "," + y2 + " " + x2 + "," + y2 + '"/>';
      }));
      svg.setAttribute("viewBox", "0 0 " + box.width / z + " " + box.height / z); svg.innerHTML = out;
    });
    addEventListener("load", draw);
    document.addEventListener("click", (ev) => { const c = ev.target.closest(".nah-perk-card"); if (!c) return;
      c.classList.remove("is-unlocking"); void c.offsetWidth; c.classList.add("is-unlocking");
      for (let i = 0; i < 12; i++) { const s = document.createElement("span"); s.className = "nah-perk-spark"; s.style.setProperty("--a", i * 30 + "deg"); c.appendChild(s); }
      document.querySelector(".nah-perk-points").classList.remove("is-ticking"); void c.offsetWidth; document.querySelector(".nah-perk-points").classList.add("is-ticking"); });
  </script>`;
  for (const [file, branch, focus] of [["perks.html", "body", "goodShape"], ["perks-role.html", "role", "limitBreaker"], ["perks-general.html", "general", "godComplex"]]) {
    perks.uiState.perks = { branch, focus };
    await writeFile(path.join(out, file), page(`Perk Tree: ${actor.name}`, render("shell.hbs", await perks._prepareContext()), { width: 1240, height: 860 }).replace("</body>", `${demo}</body>`));
  }
}
// The Deep Dive: Vex three floors down a Standard architecture, and the GM's Architect over it
{
  const { DiveApp } = await import("../scripts/apps/dive-app.js");
  const { DiveOps } = await import("../scripts/home/dive-ops.js");
  const { dice } = await import("../tests/helpers/foundry.mjs");
  const layout = {
    name: "Biotechnica Sub-net 7", difficulty: "standard", demon: { type: "imp", at: "a5" },
    floors: [
      { key: "a1", branch: "a", depth: 1, from: null, kind: "password", dv: 6, ice: [] },
      { key: "a2", branch: "a", depth: 2, from: "a1", kind: "ice", dv: null, ice: ["wisp"] },
      { key: "a3", branch: "a", depth: 3, from: "a2", kind: "file", dv: 8, ice: [], label: "Payroll" },
      { key: "a4", branch: "a", depth: 4, from: "a3", kind: "ice", dv: null, ice: ["hellhound", "killer"] },
      { key: "a5", branch: "a", depth: 5, from: "a4", kind: "node", dv: 8, ice: [], label: "Lab cameras", note: "The Imp sits here" },
      { key: "a6", branch: "a", depth: 6, from: "a5", kind: "password", dv: 8, ice: [] },
      { key: "a7", branch: "a", depth: 7, from: "a6", kind: "file", dv: 8, ice: [], label: "Project Ambrosia" },
      { key: "b4", branch: "b", depth: 4, from: "a3", kind: "file", dv: 8, ice: [], label: "Shipping manifests" },
      { key: "b5", branch: "b", depth: 5, from: "b4", kind: "node", dv: 8, ice: [], label: "Loading-bay doors" }
    ],
    virus: "a7"
  };
  game.user = game.users[0];
  const item = await DiveOps.create({}, layout);
  await DiveOps.jackIn(actor, item.uuid, { rig: "chair" });
  await DiveOps.move(actor, "a1");
  dice.next = [7];
  await DiveOps.act(actor, "breach");
  dice.next = [9, 2];
  await DiveOps.move(actor, "a2");
  dice.next = [8, 1, 6];
  await DiveOps.act(actor, "zap", { target: 0 });
  await DiveOps.newTurn(actor);
  dice.next = [9, 3];
  await DiveOps.act(actor, "slide", { dir: "down" });
  dice.next = [8];
  await DiveOps.act(actor, "pathfinder");
  const dive = new DiveApp();
  dive.actorId = actor.id;
  const links = `<script>
    const draw = () => document.querySelectorAll(".nah-dive-map").forEach((g) => {
      const svg = g.querySelector("svg"); const box = g.getBoundingClientRect(); const z = g.offsetWidth ? box.width / g.offsetWidth : 1; let out = "";
      g.querySelectorAll("[data-from]").forEach((c) => { const f = g.querySelector('[data-floor="' + c.dataset.from + '"]'); if (!f) return;
        const a = f.getBoundingClientRect(), b = c.getBoundingClientRect();
        const x1 = (a.left + a.width / 2 - box.left) / z, y1 = (a.bottom - box.top) / z, x2 = (b.left + b.width / 2 - box.left) / z, y2 = (b.top - box.top) / z, m = (y1 + y2) / 2;
        out += '<path class="' + (f.classList.contains("is-done") || f.classList.contains("is-here") ? "lit" : "") + '" d="M' + x1 + "," + y1 + " C" + x1 + "," + m + " " + x2 + "," + m + " " + x2 + "," + y2 + '"/>'; });
      svg.setAttribute("viewBox", "0 0 " + g.offsetWidth + " " + g.offsetHeight); svg.innerHTML = out; });
    addEventListener("load", draw);
  </script>`;
  // the runner's own view (a player: only what they've found)
  game.user = game.users[1];
  dive.uiState.dive = { mode: "run" };
  await writeFile(path.join(out, "dive.html"), page(`Deep Dive: ${actor.name}`, render("shell.hbs", await dive._prepareContext()), { width: 1280, height: 880 }).replace("</body>", `${links}</body>`));
  game.user = game.users[0];
  dive.uiState.dive = { mode: "architect", arch: item.uuid };
  await writeFile(path.join(out, "dive-architect.html"), page(`Deep Dive: ${actor.name}`, render("shell.hbs", await dive._prepareContext()), { width: 1280, height: 880 }).replace("</body>", `${links}</body>`));
  await DiveOps.jackOut(actor);
}
// Street Drug Synthesis: Vex as a Medtech too, with a kit and two recipes
{
  const drugs = await import("../scripts/data/drugs.js");
  const M = "cpr-neon-at-home";
  await actor.createEmbeddedDocuments("Item", [
    { name: "Medtech", type: "role", system: { rank: 4, abilities: [{ name: "Medical Tech (Pharmaceuticals)", rank: 4 }, { name: "Medical Tech Skill", rank: 4 }, { name: "Surgery", rank: 0 }] } },
    drugs.labItem(drugs.DRUG_LAB[1], M), drugs.labItem(drugs.DRUG_LAB[5], M),
    drugs.recipeItem({ name: "Lite-Smash", tier: "simple", cost: 20, ingredients: "Smash, water", makes: drugs.mixedDrugItem(drugs.MIXED_DRUGS[0], M) }, M),
    drugs.recipeItem({ name: "Black Lace", tier: "standard", cost: 50, book: true }, M)
  ]);
  app.tab = "downtime";
  game.user = game.users[0];
  app.uiState.downtime = { action: "synth", params: { synth: { doses: 3 } } };
  await writeFile(path.join(out, "downtime-synth.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
  app.uiState.downtime = { action: "invent", params: { invent: { domain: "pharma", tier: "complex", name: "Steadyhand" } } };
  await writeFile(path.join(out, "downtime-drug-invent.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
}
// Spend IP: a Solo / Medtech with a spread of skills, a few picked, Control folded away
{
  const { SpendIPApp } = await import("../scripts/apps/spend-ip-app.js");
  const { SpendIP } = await import("../scripts/apps/spend-ip.js");
  const { makeActor } = await import("../tests/helpers/foundry.mjs");
  const S = (name, level, category, difficulty = "typical") => ({ name, type: "skill", system: { level, category, difficulty, stat: "int" } });
  const ipActor = makeActor({ name: "Kestrel", type: "character", system: { stats: { int: { value: 7 } }, improvementPoints: { value: 240, transactions: [] } } }, [
    S("Concentration", 2, "awarenessSkills"), S("Perception", 6, "awarenessSkills"), S("Athletics", 4, "bodySkills"), S("Stealth", 5, "bodySkills"),
    S("Drive Land Vehicle", 3, "controlSkills"), S("Education", 2, "educationSkills"), S("Language (Streetslang)", 4, "educationSkills"),
    S("Local Expert (Watson)", 3, "educationSkills"), { ...S("Language (Spanish)", 0, "educationSkills"), flags: { "cpr-neon-at-home": { customSkill: true } } },
    S("Brawling", 5, "fightingSkills"), S("Evasion", 7, "fightingSkills"), S("Martial Arts (Karate)", 2, "fightingSkills", "difficult"),
    S("Handgun", 10, "rangedweaponSkills"), S("Shoulder Arms", 6, "rangedweaponSkills"), S("Autofire", 3, "rangedweaponSkills", "difficult"),
    S("Human Perception", 2, "socialSkills"), S("Streetwise", 4, "socialSkills"), S("First Aid", 4, "techniqueSkills"), S("Paramedic", 2, "techniqueSkills", "difficult"),
    { name: "Solo", type: "role", system: { rank: 5, mainRoleAbility: "Combat Awareness", abilities: [] } },
    { name: "Medtech", type: "role", system: { rank: 2, mainRoleAbility: "Medicine", abilities: [] } }
  ]);
  const win = new SpendIPApp();
  win.actorId = ipActor.id;
  const pick = (n) => ipActor.items.find((i) => i.name === n).id;
  win.uiState.ip = { sel: [pick("Stealth"), pick("Martial Arts (Karate)")], collapsed: ["controlSkills"], search: "" };
  // the window's own listeners (picking, folding, searching), run on the static page
  const src = SpendIP.onRender.toString();
  const live = `<script>
    const L = (k, d) => k + (d ? " " + JSON.stringify(d) : ""); const ui = { notifications: { info: console.log, warn: console.log } };
    const onRender = ({ ${src} }).onRender;
    onRender({ uiState: ${JSON.stringify({ ip: win.uiState.ip })} }, document.querySelector(".nah-feature"));
  </script>`;
  await writeFile(path.join(out, "spend-ip.html"), page(`Spend IP: ${ipActor.name}`, render("shell.hbs", await win._prepareContext()), { width: 1080, height: 880 }).replace("</body>", `${live}</body>`));
}
const cfg = new ItemConfig(actor.items.get("ammoBag00000000a"));
await writeFile(path.join(out, "item-config.html"), page("Neon At Home: Ammo bag", render("item-config.hbs", await cfg._prepareContext()), { width: 560, height: 760, cls: "nah-config" }));
const [bp] = await actor.createEmbeddedDocuments("Item", [{ name: "Blueprint: Whisper Can", type: "gear", img: "icons/svg/book.svg", system: { price: { market: 2000 } }, flags: { "cpr-neon-at-home": { blueprint: { name: "Whisper Can", category: "veryExpensive", value: 2000, skill: "Weaponstech", inventor: "Vex", makes: { name: "Whisper Can Suppressor", type: "itemUpgrade", img: "icons/svg/item-bag.svg" } } } } }]);
await writeFile(path.join(out, "blueprint-config.html"), page("Neon At Home: Blueprint: Whisper Can", render("item-config.hbs", await new ItemConfig(bp)._prepareContext()), { width: 560, height: 760, cls: "nah-config" }));
const rules = new RulesConfig();
await writeFile(path.join(out, "rules.html"), page("Carry & Weight Rules", render("rules-config.hbs", await rules._prepareContext()), { width: 720, height: 760, cls: "nah-config" }));
await writeFile(path.join(out, "index.html"), page("Neon At Home previews", "<p style='padding:20px'>Pick a page above.</p>", { height: 200 }));
console.log(`previews written to ${path.relative(root, out)}/`);
