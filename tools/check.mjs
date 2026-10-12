// Pre-release checks (`npm run check`, also run by the release workflows):
// every script parses, every JSON file is valid, and every NEONHOME.* key the
// code and templates use exists in lang/en.json.
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failed = 0;
const fail = (msg) => {
  failed++;
  console.error(`✗ ${msg}`);
};

async function files(dir, ext) {
  const out = [];
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith(ext)) out.push(path.join(e.parentPath ?? e.path, e.name));
  }
  return out;
}

// Scripts parse
const scripts = await files("scripts", ".js");
for (const file of scripts) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    fail(`${path.relative(root, file)}: ${err.stderr?.toString().trim()}`);
  }
}

// JSON is valid
const json = [path.join(root, "module.json"), ...(await files("lang", ".json")), ...(await files("packs/_source", ".json"))];
for (const file of json) {
  try {
    JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    fail(`${path.relative(root, file)}: ${err.message}`);
  }
}

// Localization keys used are defined (keys built at runtime end in "." and are skipped)
const flat = (obj, prefix = "") => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const defined = new Set(flat(JSON.parse(await readFile(path.join(root, "lang", "en.json"), "utf8"))));
const used = new Set();
for (const file of [...scripts, ...(await files("templates", ".hbs"))]) {
  for (const m of (await readFile(file, "utf8")).matchAll(/NEONHOME\.[A-Za-z0-9_.]*[A-Za-z0-9_]/g)) used.add(m[0]);
}
for (const key of used) {
  const isPrefix = [...defined].some((d) => d.startsWith(`${key}.`));
  if (!defined.has(key) && !isPrefix) fail(`lang/en.json is missing ${key}`);
}

console.log(`${scripts.length} scripts, ${json.length} JSON files, ${used.size} localization keys checked`);
if (failed) {
  console.error(`${failed} problem(s)`);
  process.exit(1);
}
