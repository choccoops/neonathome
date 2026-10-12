/**
 * Compatibility layer.
 *
 * Foundry v12 exposes many classes as globals; v13+ moves them under `foundry.*`
 * and later removes the globals. Every lookup prefers the namespaced path and
 * falls back to the v12 global, so nothing else in the module touches a global
 * that is on its way out.
 */
const ns = (path) => foundry.utils.getProperty(globalThis, path);

/**
 * Foundry v12 globals, by name. v12 declares its classes with top-level `class`
 * statements: global names a script can use, but not properties of globalThis, so
 * `globalThis.FilePicker` is undefined there. Each is read as a bare identifier
 * instead (which also picks up hosts that swap one out, like The Forge's FilePicker).
 */
const V12 = {
  FilePicker: () => (typeof FilePicker === "undefined" ? undefined : FilePicker),
  TextEditor: () => (typeof TextEditor === "undefined" ? undefined : TextEditor),
  ImagePopout: () => (typeof ImagePopout === "undefined" ? undefined : ImagePopout),
  FormDataExtended: () => (typeof FormDataExtended === "undefined" ? undefined : FormDataExtended),
  renderTemplate: () => (typeof renderTemplate === "undefined" ? undefined : renderTemplate),
  loadTemplates: () => (typeof loadTemplates === "undefined" ? undefined : loadTemplates),
  loadTexture: () => (typeof loadTexture === "undefined" ? undefined : loadTexture),
  ForgeVTT: () => (typeof ForgeVTT === "undefined" ? undefined : ForgeVTT)
};
const v12 = (name) => globalThis[name] ?? V12[name]();

export const Compat = {
  get generation() {
    return Number(game.release?.generation ?? 12);
  },

  get DialogV2() {
    return foundry.applications.api.DialogV2;
  },

  get FilePicker() {
    return ns("foundry.applications.apps.FilePicker.implementation") ?? v12("FilePicker");
  },

  get TextEditor() {
    return ns("foundry.applications.ux.TextEditor.implementation") ?? v12("TextEditor");
  },

  get ImagePopout() {
    return ns("foundry.applications.apps.ImagePopout") ?? v12("ImagePopout");
  },

  get FormDataExtended() {
    return ns("foundry.applications.ux.FormDataExtended") ?? v12("FormDataExtended");
  },

  renderTemplate(path, data) {
    const fn = ns("foundry.applications.handlebars.renderTemplate") ?? v12("renderTemplate");
    return fn(path, data);
  },

  loadTemplates(paths) {
    const fn = ns("foundry.applications.handlebars.loadTemplates") ?? v12("loadTemplates");
    return fn(paths);
  },

  /** Load (or reuse) a canvas texture. */
  loadTexture(src) {
    const fn = ns("foundry.canvas.loadTexture") ?? v12("loadTexture");
    return fn(src);
  },

  getDragEventData(event) {
    return this.TextEditor.getDragEventData(event);
  },

  /** v12 hooks hand AppV1 apps jQuery; AppV2 hands HTMLElement. */
  element(html) {
    if (!html) return null;
    if (html instanceof HTMLElement) return html;
    return html[0] ?? null;
  },

  /** First active GM, the one who runs requests. */
  get activeGM() {
    return game.users.activeGM ?? game.users.find((u) => u.isGM && u.active) ?? null;
  },

  /** Where generated images are uploaded: The Forge's asset library when hosted there, else the Data folder. */
  get uploadSource() {
    const forge = v12("ForgeVTT");
    if (forge?.usingTheForge) return "forgevtt";
    return "data";
  }
};
