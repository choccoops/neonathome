// Write the Salvage Tables compendium sources (packs/_source/salvage-tables) from
// scripts/data/salvage.js, so the pack always matches what the module rolls: each era's (and in
// 2070, each place's) categories and perils. GMs can import a table and edit its wording; the
// module reads world tables flagged with their key first. Run with `npm run build:tables`.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { LOCATIONS, PERIL_EFFECTS } from "../scripts/data/salvage.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dest = path.join(root, "packs", "_source", "salvage-tables");
const MODULE_ID = "cpr-neon-at-home";
const lang = JSON.parse(readFileSync(path.join(root, "lang", "en.json"), "utf8")).NEONHOME.Salvage;

/** A stable 16-character id from a string. */
const id = (s) => createHash("sha256").update(s).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

/** 2045's places share the DLC's tables: one pair for the era. 2070: a pair per place. */
const sets = [
  { key: "2045", era: "2045", place: null, ...Object.values(LOCATIONS[2045])[0] },
  ...Object.entries(LOCATIONS[2070]).map(([loc, t]) => ({ key: `2070.${loc}`, era: "2070", place: loc, ...t }))
];

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
let sort = 0;
let n = 0;
for (const set of sets) {
  const where = set.place ? `${lang.Place[set.era][set.place]}, ${set.era}` : `${set.era}`;
  const source = set.era === "2045"
    ? "Salvaging Night City (R. Talsorian Games), pp.3, 5. A short summary by Neon At Home; the DLC has the full text."
    : "Neon At Home's 2070 version of Salvaging Night City's tables, for the Night City of the Edgerunner's Handbook.";
  for (const kind of ["categories", "perils"]) {
    const key = `${set.key}.${kind}`;
    const tableId = id(`salvage-${key}`);
    const rows = kind === "categories"
      ? set.categories.map((c) => lang.Category[c])
      : set.perils.map(([k, text]) => `${text} ${PERIL_EFFECTS[k]}`);
    const results = rows.map((text, i) => {
      const rid = id(`salvage-${key}-${i + 1}`);
      return {
        _id: rid,
        _key: `!tables.results!${tableId}.${rid}`,
        type: "text",
        text,
        img: kind === "categories" ? "icons/svg/item-bag.svg" : "icons/svg/hazard.svg",
        range: [i + 1, i + 1],
        weight: 1,
        drawn: false,
        flags: {}
      };
    });
    const hint = kind === "categories"
      ? "Edit a result to another category's name (Cyberware, Weapons, General Gear, Armor, Cyberdecks & Programs) to change what's found."
      : "Edit a result's wording and Neon At Home shows yours; the peril's dice stay the module's.";
    const doc = {
      _id: tableId,
      _key: `!tables!${tableId}`,
      name: `${kind === "categories" ? "Salvage Categories" : "Perils of Salvaging"} (${where})`,
      img: kind === "categories" ? "icons/svg/item-bag.svg" : "icons/svg/hazard.svg",
      description: `<p>${source} Import this table to use your own wording: Neon At Home rolls from your copy. ${hint}</p>`,
      results,
      formula: "1d6",
      replacement: true,
      displayRoll: true,
      folder: null,
      sort: (sort += 100),
      ownership: { default: 0 },
      flags: { [MODULE_ID]: { salvage: key } }
    };
    await writeFile(path.join(dest, `salvage_${key.replace(/\./g, "-")}_${tableId}.json`), `${JSON.stringify(doc, null, 2)}\n`);
    n++;
  }
}
console.log(`wrote ${n} salvage tables`);
