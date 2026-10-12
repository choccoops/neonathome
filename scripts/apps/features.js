import { FEATURE_ORDER } from "../constants.js";

/**
 * The home suite's sub-features (tabs). Each is a plain object:
 *
 *   {
 *     id: "loadout",                    // tab id, also the render part id
 *     icon: "fa-solid fa-person-rifle",
 *     label: "NEONHOME.Loadout.Title",  // localization key
 *     template: "modules/.../x.hbs",    // part template, rendered inside the window
 *     available(actor) { return true }, // optional: hide the tab for some characters or settings
 *     async prepare(app, actor) {},     // part context
 *     actions: { name(event, target) {} }, // data-action handlers; `this` is the window
 *     onRender(app, element) {}         // optional: listeners after each render
 *   }
 *
 * Neon At Home registers its own four; other modules can add theirs with
 * game.modules.get("cpr-neon-at-home").api.registerFeature(feature) before the window first opens.
 */
const FEATURES = new Map();

export function registerFeature(feature) {
  if (!feature?.id || !feature.template) throw new Error("A home feature needs an id and a template.");
  FEATURES.set(feature.id, feature);
}

export function features() {
  const order = (id) => {
    const i = FEATURE_ORDER.indexOf(id);
    return i < 0 ? FEATURE_ORDER.length : i;
  };
  return [...FEATURES.values()].sort((a, b) => order(a.id) - order(b.id));
}

export function feature(id) {
  return FEATURES.get(id) ?? null;
}

/** Every feature's actions, for the window's action map. */
export function featureActions() {
  const out = {};
  for (const f of FEATURES.values()) Object.assign(out, f.actions ?? {});
  return out;
}
