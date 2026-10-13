// Write the Malfunction Tables compendium sources (packs/_source/malfunction-tables) from
// scripts/data/maintenance.js, so the pack always matches what the module rolls. GMs can import a
// table and edit its wording; the module reads world tables flagged with their key first.
// Run with `npm run build:tables` (the release workflow runs it before building the packs).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { MALFUNCTIONS, TABLE_KEYS } from "../scripts/data/maintenance.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dest = path.join(root, "packs", "_source", "malfunction-tables");
const MODULE_ID = "cpr-neon-at-home";
const lang = JSON.parse(readFileSync(path.join(root, "lang", "en.json"), "utf8")).NEONHOME;

/** A stable 16-character id from a string. */
const id = (s) => createHash("sha256").update(s).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
const DURATION = lang.Malfunction.Duration;

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
let sort = 0;
for (const key of TABLE_KEYS) {
  const t = MALFUNCTIONS[key];
  const tableId = id(`malfunction-${key}`);
  const name = `Malfunctions: ${lang.Malfunction.Table[key]}`;
  const results = t.results.map(([text, duration], i) => {
    const rid = id(`malfunction-${key}-${i + 1}`);
    return {
      _id: rid,
      _key: `!tables.results!${tableId}.${rid}`,
      type: "text",
      text: `${text} <em>(${DURATION[duration]})</em>`,
      img: "icons/svg/hazard.svg",
      range: [i + 1, i + 1],
      weight: 1,
      drawn: false,
      flags: {}
    };
  });
  const doc = {
    _id: tableId,
    _key: `!tables!${tableId}`,
    name,
    img: "icons/svg/hazard.svg",
    description: `<p>Breaking Your Stuff, p.${t.page}. A short summary by Neon At Home; the DLC has the full text. Import this table and edit it to use your own wording: Neon At Home rolls from your copy.</p>`,
    results,
    formula: "1d6",
    replacement: true,
    displayRoll: true,
    folder: null,
    sort: (sort += 100),
    ownership: { default: 0 },
    flags: { [MODULE_ID]: { malfunction: key } }
  };
  await writeFile(path.join(dest, `malfunctions_${key}_${tableId}.json`), `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(`wrote ${TABLE_KEYS.length} malfunction tables`);
