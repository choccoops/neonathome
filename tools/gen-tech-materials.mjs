// Write the Tech Materials compendium sources (packs/_source/tech-materials) from
// scripts/data/materials.js: one gear item per price tier. Run with `npm run build:packs`.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { TIERS, materialsItemData } from "../scripts/data/materials.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dest = path.join(root, "packs", "_source", "tech-materials");
const MODULE_ID = "cpr-neon-at-home";
const id = (s) => createHash("sha256").update(s).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
let sort = 0;
for (const tier of TIERS) {
  const _id = id(`tech-materials-${tier}`);
  const doc = {
    ...materialsItemData(tier, MODULE_ID, { id: _id }),
    _key: `!items!${_id}`,
    folder: null,
    sort: (sort += 100),
    effects: [],
    ownership: { default: 0 },
    _stats: { systemId: "cyberpunk-red-core", systemVersion: "0.92.4", coreVersion: "12.331" }
  };
  await writeFile(path.join(dest, `gear_${tier}-tech-materials_${_id}.json`), `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(`wrote ${TIERS.length} Tech Materials`);
