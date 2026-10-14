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
<nav class="preview"><a href="loadout.html">Loadout</a><a href="bay.html">Vehicle Bay</a><a href="biomonitor.html">Biomonitor</a><a href="cyberware.html">Cyberware</a><a href="bench.html">Weaponbench</a><a href="maintenance.html">Maintenance</a><a href="maintenance-rent.html">Maintenance (Rent Day)</a><a href="downtime.html">Downtime</a><a href="downtime-fab.html">Downtime: Fabricate</a><a href="downtime-projects.html">Downtime: Projects</a><a href="item-config.html">Item config</a><a href="rules.html">Rules</a></nav>
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
app.uiState.downtime = { action: "fabricate", params: { fabricate: { item: "x", itemInfo: { name: "Militech Avenger", img: "../tools/preview-item.svg", price: 500, skill: "Weaponstech", category: "Expensive" } } } };
await writeFile(path.join(out, "downtime-fab.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
actor.flags["cpr-neon-at-home"].projects = [
  { id: "p1", kind: "fabricate", label: "Fabricate Militech Avenger", img: "../tools/preview-item.svg", skill: "Weaponstech", ability: "Fabrication Expertise", dv: 21, minutes: 10080, done: 5040, check: null, restarts: 1, materials: 100, data: {} },
  { id: "p2", kind: "upgrade", label: "Upgrade Tsunami Arms Helix: One more option/attachment/program slot", img: "../tools/preview-item.svg", skill: "Weaponstech", ability: "Upgrade Expertise", dv: 21, minutes: 10080, done: 7200, check: "passed", restarts: 0, materials: 500, data: {} }
];
app.uiState.downtime = { action: "projects", params: {} };
await writeFile(path.join(out, "downtime-projects.html"), page(`Neon At Home: ${actor.name}`, render("shell.hbs", await app._prepareContext())));
game.modules.delete("cpr-neon-hub");
const cfg = new ItemConfig(actor.items.get("ammoBag00000000a"));
await writeFile(path.join(out, "item-config.html"), page("Neon At Home: Ammo bag", render("item-config.hbs", await cfg._prepareContext()), { width: 560, height: 760, cls: "nah-config" }));
const rules = new RulesConfig();
await writeFile(path.join(out, "rules.html"), page("Carry & Weight Rules", render("rules-config.hbs", await rules._prepareContext()), { width: 720, height: 760, cls: "nah-config" }));
await writeFile(path.join(out, "index.html"), page("Neon At Home previews", "<p style='padding:20px'>Pick a page above.</p>", { height: 200 }));
console.log(`previews written to ${path.relative(root, out)}/`);
