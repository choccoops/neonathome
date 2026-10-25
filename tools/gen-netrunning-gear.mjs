// Write the Netrunning Gear (2070) compendium sources (packs/_source/netrunning-gear) from
// scripts/data/netrun.js: quickhacks (Neuroport and vehicle) as programs, quickhack and Black
// ICE hardware as cyberdeck upgrades, the 2070 cyberdecks, the Cybersuites and the Ex-Disk.
// Run with `npm run build:packs`.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { QUICKHACKS, HARDWARE, DECKS, CYBERSUITES, quickhackItem, hardwareItem, deckItem, cybersuiteItem, exDiskItem } from "../scripts/data/netrun.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dest = path.join(root, "packs", "_source", "netrunning-gear");
const MODULE_ID = "cpr-neon-at-home";
const id = (s) => createHash("sha256").update(s).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// folders: one per kind
const FOLDERS = { quickhacks: "Quickhacks", vehicle: "Vehicle Quickhacks", hardware: "Hardware", decks: "Cyberdecks", cyberware: "Cybersuites & Cyberware" };
const folderId = Object.fromEntries(Object.keys(FOLDERS).map((k) => [k, id(`netrunning-folder-${k}`)]));
let fsort = 0;
for (const [k, name] of Object.entries(FOLDERS)) {
  const _id = folderId[k];
  await writeFile(path.join(dest, `folder_${k}_${_id}.json`), `${JSON.stringify({ _id, _key: `!folders!${_id}`, name, type: "Item", folder: null, sorting: "a", sort: (fsort += 100), color: "#05d9e8", flags: {} }, null, 2)}\n`);
}

const stats = { systemId: "cyberpunk-red-core", systemVersion: "0.92.4", coreVersion: "12.331" };
let sort = 0;
let n = 0;
async function write(data, folder, key) {
  const doc = { ...data, _key: `!items!${data._id}`, folder: folderId[folder], sort: (sort += 100), effects: [], ownership: { default: 0 }, _stats: stats };
  await writeFile(path.join(dest, `${data.type}_${key}_${data._id}.json`), `${JSON.stringify(doc, null, 2)}\n`);
  n++;
}
for (const q of QUICKHACKS) await write(quickhackItem(q, MODULE_ID, id(`quickhack-${q.id}`)), q.vehicle ? "vehicle" : "quickhacks", q.id);
for (const h of HARDWARE) await write(hardwareItem(h, MODULE_ID, id(`hardware-${h.id}`)), "hardware", h.id);
for (const d of DECKS) await write(deckItem(d, MODULE_ID, id(`deck-${d.id}`)), "decks", d.id);
for (const c of CYBERSUITES) await write(cybersuiteItem(c, MODULE_ID, id(`cybersuite-${c.id}`)), "cyberware", c.id);
await write(exDiskItem(MODULE_ID, id("cyberware-exDisk")), "cyberware", "exDisk");
console.log(`wrote ${n} netrunning items`);
