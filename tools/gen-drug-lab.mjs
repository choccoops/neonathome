// Write the Drug Lab compendium sources (packs/_source/drug-lab) from scripts/data/drugs.js: the
// synthesis tools and upgrades, the Mixed Drugs, and a recipe for each mixed drug and each of the
// book's street drugs (Core Rules, Chapter 08). Run with `npm run build:packs`.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { DRUG_LAB, MIXED_DRUGS, BOOK_DRUGS, labItem, mixedDrugItem, recipeItem } from "../scripts/data/drugs.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dest = path.join(root, "packs", "_source", "drug-lab");
const MODULE_ID = "cpr-neon-at-home";
const id = (s) => createHash("sha256").update(s).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const stats = { systemId: "cyberpunk-red-core", systemVersion: "0.92.4", coreVersion: "12.331" };

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

const FOLDERS = { tools: "Tools & Upgrades", drugs: "Mixed Drugs", recipes: "Recipes" };
const folderId = Object.fromEntries(Object.keys(FOLDERS).map((k) => [k, id(`drug-lab-folder-${k}`)]));
let fsort = 0;
for (const [k, name] of Object.entries(FOLDERS)) {
  const _id = folderId[k];
  await writeFile(path.join(dest, `folder_${k}_${_id}.json`), `${JSON.stringify({ _id, _key: `!folders!${_id}`, name, type: "Item", folder: null, sorting: "a", sort: (fsort += 100), color: "#39ff88", flags: {} }, null, 2)}\n`);
}

let sort = 0;
let n = 0;
async function write(data, folder, key) {
  const _id = id(`drug-lab-${folder}-${key}`);
  const doc = { ...data, _id, _key: `!items!${_id}`, folder: folderId[folder], sort: (sort += 100), effects: [], ownership: { default: 0 }, _stats: stats };
  await writeFile(path.join(dest, `${data.type}_${key}_${_id}.json`), `${JSON.stringify(doc, null, 2)}\n`);
  n++;
}

for (const row of DRUG_LAB) await write(labItem(row, MODULE_ID), "tools", slug(row[0]));
for (const row of MIXED_DRUGS) {
  const drug = mixedDrugItem(row, MODULE_ID);
  await write(drug, "drugs", slug(row[0]));
  // the recipe carries the drug it makes
  await write(recipeItem({ name: row[0], tier: row[1], cost: row[2], ingredients: row[3], makes: drug }, MODULE_ID), "recipes", `recipe-${slug(row[0])}`);
}
// the book's street drugs: Standard recipes at their listing's cost (the drug itself comes from Cyberpunk RED's compendium)
for (const [name, eb] of BOOK_DRUGS) await write(recipeItem({ name, tier: "standard", cost: eb, book: true }, MODULE_ID), "recipes", `recipe-${slug(name)}`);
console.log(`wrote ${n} Drug Lab items`);
