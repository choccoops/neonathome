/**
 * Just enough of Foundry VTT and Cyberpunk RED - CORE to run Neon At Home's window code and render
 * its templates in Node: documents are plain objects with the methods the module calls.
 * Import this before any module script.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const MODULE_ID = "cpr-neon-at-home";
const lang = JSON.parse(readFileSync(path.join(root, "lang", "en.json"), "utf8"));
const lookup = (key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), lang);
/** Core and system keys aren't in this module's file: show something readable for them. */
const fallback = (key) => {
  const last = key.split(".").at(-1);
  return key.startsWith("TYPES.") || key.startsWith("CPR.") ? last.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()) : key;
};
const localize = (key) => (typeof lookup(key) === "string" ? lookup(key) : fallback(key));
const format = (key, data = {}) => localize(key).replace(/{(\w+)}/g, (m, p) => (p in data ? String(data[p]) : m));
export const missingKeys = new Set();
const track = (key) => {
  if (key.startsWith("NEONHOME.") && typeof lookup(key) !== "string") missingKeys.add(key);
  return key;
};

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const getProperty = (obj, p) => p.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
const setProperty = (obj, p, v) => {
  const keys = p.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = v;
};

let idCounter = 0;
export const randomID = () => `id${String(++idCounter).padStart(14, "0")}`;

class Collection extends Map {
  get size() {
    return super.size;
  }
  get contents() {
    return [...this.values()];
  }
  filter(fn) {
    return this.contents.filter(fn);
  }
  find(fn) {
    return this.contents.find(fn);
  }
  map(fn) {
    return this.contents.map(fn);
  }
  some(fn) {
    return this.contents.some(fn);
  }
  [Symbol.iterator]() {
    return this.values();
  }
}

/** uuid -> document */
export const registry = new Map();
const settingsStore = new Map();

globalThis.Handlebars = Handlebars;
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.Hooks = { on() {}, once() {}, callAll() {} };
globalThis.fromUuidSync = (uuid) => registry.get(uuid) ?? null;
globalThis.fromUuid = async (uuid) => registry.get(uuid) ?? null;
globalThis.ChatMessage = { create: async () => null, getSpeaker: () => ({}) };

/**
 * Foundry v12's ApplicationV2, as far as subclasses can trip over it: these are getters with no
 * setter, so a subclass assigning to one (this.state = ...) throws, as it does in Foundry.
 */
class ApplicationV2 {
  #state = 0;
  #element = null;
  constructor(options = {}) {
    this.options = options;
  }
  get element() { return this.#element; }
  get form() { return null; }
  get id() { return this.options.id; }
  get minimized() { return false; }
  get rendered() { return this.#state === 2; }
  get state() { return this.#state; }
  get classList() { return new Set(); }
  get hasFrame() { return true; }
  get title() { return ""; }
  render() {
    return this;
  }
}
globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    hasProperty: (o, p) => getProperty(o, p) !== undefined,
    deepClone: clone,
    duplicate: clone,
    randomID,
    expandObject: (flat) => {
      const out = {};
      for (const [k, v] of Object.entries(flat)) setProperty(out, k, v);
      return out;
    },
    mergeObject: (a, b) => {
      const out = clone(a) ?? {};
      for (const [k, v] of Object.entries(b ?? {})) out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" ? { ...out[k], ...v } : v;
      // keep functions (actions) that JSON cloning dropped
      for (const [k, v] of Object.entries(a ?? {})) if (typeof v === "object" && v) for (const [kk, vv] of Object.entries(v)) if (typeof vv === "function") out[k][kk] = vv;
      return out;
    }
  },
  applications: {
    api: { ApplicationV2, HandlebarsApplicationMixin: (Base) => class extends Base {}, DialogV2: {} },
    ux: {},
    handlebars: {}
  }
};

const users = [{ id: "gm", name: "GM", isGM: true, active: true }, { id: "p1", name: "Player", isGM: false, active: true }];
globalThis.game = {
  release: { generation: 12 },
  system: { id: "cyberpunk-red-core", title: "Cyberpunk RED - CORE" },
  i18n: {
    lang: "en",
    localize: (k) => localize(track(k)),
    format: (k, d) => format(track(k), d),
    has: (k) => typeof lookup(k) === "string"
  },
  user: users[0],
  users: Object.assign(users, { activeGM: users[0] }),
  modules: new Map([[MODULE_ID, { active: true }]]),
  actors: new Collection(),
  settings: {
    register(scope, key, data) {
      if (!settingsStore.has(key)) settingsStore.set(key, clone(data.default));
    },
    registerMenu() {},
    get(scope, key) {
      if (!settingsStore.has(key)) throw new Error(`Setting not registered: ${scope}.${key}`);
      return settingsStore.get(key);
    },
    async set(scope, key, value) {
      settingsStore.set(key, value);
    }
  }
};

/* ------------------------------------------ */
/*  Documents                                 */
/* ------------------------------------------ */

function flagMethods(doc) {
  doc.getFlag = (scope, key) => doc.flags?.[scope]?.[key];
  doc.setFlag = async (scope, key, value) => {
    doc.flags[scope] ??= {};
    doc.flags[scope][key] = clone(value);
  };
  doc.isOwner = true;
  doc.testUserPermission = () => true;
}

export function makeItem(actor, data) {
  const item = { effects: [], flags: {}, img: "icons/svg/item-bag.svg", ...clone(data) };
  item._id ??= randomID();
  item.id = item._id;
  item.documentName = "Item";
  item.parent = actor;
  item.uuid = `${actor.uuid}.Item.${item.id}`;
  item.system ??= {};
  flagMethods(item);
  Object.defineProperty(item.system, "isInstalled", {
    enumerable: false,
    get: () => actor.items.some((i) => i.system?.installedItems?.list?.includes(item.id))
  });
  item.toObject = () => {
    const out = clone({ _id: item._id, name: item.name, type: item.type, img: item.img, system: item.system, flags: item.flags, effects: item.effects });
    return out;
  };
  item.sheet = { render() {} };
  item.update = async (changes) => {
    for (const [k, v] of Object.entries(changes)) setProperty(item, k, clone(v));
    return item;
  };
  // CPR's container mixin, as far as Neon At Home uses it.
  const installed = () => (item.system.installedItems?.list ?? []).map((id) => actor.items.get(id)).filter(Boolean);
  item.availableInstallSlots = () => (item.system.installedItems?.slots ?? 0) - installed().reduce((n, i) => n + (i.system.size ?? 1), 0);
  item.installItems = async (list) => {
    const ii = item.system.installedItems;
    if (!ii?.allowed && ii?.allowed !== undefined) return false;
    const size = list.reduce((n, i) => n + (i.system.size ?? 1), 0);
    if (size > item.availableInstallSlots()) return false;
    for (const i of list) if (!ii.list.includes(i.id)) ii.list.push(i.id);
    return true;
  };
  item.uninstallItems = async (list) => {
    const ids = list.map((i) => i.id);
    item.system.installedItems.list = item.system.installedItems.list.filter((id) => !ids.includes(id));
  };
  item.recursiveGetAllInstalledItems = () => installed();
  // CPR brings loaded ammo along as an empty stack (the rounds stay in the magazine).
  item.createInstalledObjectData = () => installed().map((i) => {
    const o = i.toObject();
    if (o.type === "ammo") o.system.amount = 0;
    return o;
  });
  registry.set(item.uuid, item);
  return item;
}

/** Players' view: a non-GM user (tests flip this). */
export function asUser(isGM) {
  game.user = isGM ? users[0] : users[1];
}

export function makeActor(data, items = []) {
  const actor = { flags: {}, img: "icons/svg/mystery-man.svg", system: {}, ...clone(data) };
  actor._id ??= randomID();
  actor.id = actor._id;
  actor.documentName = "Actor";
  actor.uuid = `Actor.${actor.id}`;
  actor.items = new Collection();
  actor.effects = new Collection();
  actor.ownership = { default: 0 };
  flagMethods(actor);
  actor.sheet = { render() {} };
  for (const d of items) {
    const item = makeItem(actor, d);
    actor.items.set(item.id, item);
  }
  actor.update = async (changes) => {
    for (const [k, v] of Object.entries(changes)) setProperty(actor, k, clone(v));
    return actor;
  };
  actor.updateTrackedArmor = async (loc, id = null) => {
    const key = `currentArmor${loc[0].toUpperCase()}${loc.slice(1)}`;
    setProperty(actor, `system.externalData.${key}.id`, id ?? "");
  };
  actor.canHoldWeapon = () => true;
  actor.createEmbeddedDocuments = async (type, list) => {
    if (type === "ActiveEffect") {
      return list.map((data) => {
        const e = { ...clone(data), id: randomID() };
        e.getFlag = (scope, key) => e.flags?.[scope]?.[key];
        e.update = async (c) => Object.entries(c).forEach(([k, v]) => setProperty(e, k, clone(v)));
        e.delete = async () => actor.effects.delete(e.id);
        actor.effects.set(e.id, e);
        return e;
      });
    }
    const created = [];
    for (const data of list) {
      const tree = data.flags?.cprInstallTree;
      if (tree) delete data.flags.cprInstallTree;
      const { _id, ...rest } = data;
      const item = makeItem(actor, rest);
      actor.items.set(item.id, item);
      if (tree) {
        const inner = await actor.createEmbeddedDocuments("Item", tree);
        item.system.installedItems.list = inner.map((i) => i.id);
      }
      created.push(item);
    }
    return created;
  };
  actor.deleteEmbeddedDocuments = async (type, ids) => {
    for (const id of ids) actor.items.delete(id);
    for (const i of actor.items) if (i.system.installedItems?.list) i.system.installedItems.list = i.system.installedItems.list.filter((x) => !ids.includes(x));
  };
  actor.updateEmbeddedDocuments = async (type, updates) => {
    for (const u of updates) {
      const item = actor.items.get(u._id);
      for (const [k, v] of Object.entries(u)) if (k !== "_id") setProperty(item, k, clone(v));
    }
  };
  registry.set(actor.uuid, actor);
  game.actors.set(actor.id, actor);
  return actor;
}

/* ------------------------------------------ */
/*  Templates                                 */
/* ------------------------------------------ */

export function loadTemplates() {
  const dir = path.join(root, "templates");
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".hbs")) continue;
    Handlebars.registerPartial(`modules/${MODULE_ID}/templates/${file}`, readFileSync(path.join(dir, file), "utf8"));
  }
  Handlebars.registerHelper("localize", (key, options) => {
    track(key);
    const hash = options?.hash ?? {};
    return Object.keys(hash).length ? format(key, hash) : localize(key);
  });
  Handlebars.registerHelper("checked", (v) => (v ? "checked" : ""));
  Handlebars.registerHelper("eq", (a, b) => a === b);
}

export function render(file, context) {
  const src = readFileSync(path.join(root, "templates", file), "utf8");
  return Handlebars.compile(src, { strict: false })(context);
}
