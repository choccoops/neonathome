import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { features, feature, featureActions } from "./features.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/**
 * Neon At Home: a character's home suite. One window, a tab per sub-feature (Loadout, Vehicle Bay,
 * Biomonitor, Weaponbench). The shell renders the current tab's template as a partial (feature
 * templates are preloaded, which registers them as partials by path).
 */
export class HomeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  constructor(options = {}) {
    super(foundry.utils.mergeObject({ id: `${MODULE_ID}-home`, actions: featureActions() }, options, { inplace: false }));
    this.actorId = null;
    this.tab = Settings.get("tab") || "loadout";
    /** Per-feature UI state (selected weapon, selected armor, filters), kept across renders. */
    this.state = {};
    this.busy = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["neon-home"],
    tag: "div",
    window: { title: "NEONHOME.Title", icon: "fa-solid fa-house-chimney-window", resizable: true },
    position: { width: 1220, height: 840 },
    actions: {
      // Not "tab": ApplicationV2 handles data-action="tab" itself.
      view: HomeApp.#onView,
      openSheet: HomeApp.#onOpenSheet,
      openItem: HomeApp.#onOpenItem
    }
  };

  /**
   * One part: the shell, which pulls in the current feature's template as a partial.
   * Foundry keeps the scroll position of the first match of each selector, so each scrolling
   * column is listed on its own.
   */
  static PARTS = {
    body: {
      template: `${TEMPLATE_PATH}/shell.hbs`,
      scrollable: [".nah-col-doll", ".nah-col-carry", ".nah-col-store", ".nah-bay", ".nah-bio", ".nah-rack", ".nah-mat", ".nah-drawer", ".nah-scroll"]
    }
  };

  /* ---------------------------------------- */

  /**
   * Open the window on this client.
   * @param {Actor|string|null} actor - a character or its uuid (default: the user's own)
   * @param {object} [opts] - { tab }
   */
  static async open(actor = null, { tab } = {}) {
    if (typeof actor === "string") actor = await fromUuid(actor);
    if (actor?.isToken) actor = actor.baseActor ?? actor;
    const chars = HomeStore.characters();
    if (actor && !HomeStore.canManage(actor)) actor = null;
    if (!actor) actor = game.user.character && chars.includes(game.user.character) ? game.user.character : chars[0] ?? null;
    if (!actor) return ui.notifications.info(L("NEONHOME.NoCharacter"));
    const app = (this.instance ??= new this());
    app.actorId = actor.id;
    if (tab && feature(tab)) app.tab = tab;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Re-render if open. */
  static refresh() {
    if (this.instance?.rendered) this.instance.render();
  }

  /** Re-render only when the change touches the character on screen (or their home). */
  static refreshFor(doc) {
    const app = this.instance;
    if (!app?.rendered || !doc) return;
    const actor = app.actor;
    if (!actor) return;
    const related = new Set([actor.uuid]);
    const home = HomeStore.home(actor);
    if (home.stash) related.add(home.stash);
    for (const v of home.vehicles) related.add(v.uuid.split(".Item.")[0]);
    const uuid = doc.documentName === "Item" ? doc.parent?.uuid : doc.uuid;
    if (related.has(uuid)) app.render();
  }

  get actor() {
    return this.actorId ? game.actors.get(this.actorId) ?? null : null;
  }

  get title() {
    const actor = this.actor;
    return actor ? `${L("NEONHOME.Title")}: ${actor.name}` : L("NEONHOME.Title");
  }

  #validTab() {
    const actor = this.actor;
    const list = features().filter((f) => !f.available || f.available(actor));
    if (!list.some((f) => f.id === this.tab)) this.tab = list[0]?.id ?? "loadout";
    return this.tab;
  }

  /* ---------------------------------------- */
  /*  Context                                 */
  /* ---------------------------------------- */

  async _prepareContext() {
    const actor = this.actor;
    const tab = this.#validTab();
    const hp = actor ? CPR.hp(actor) : { value: 0, max: 0 };
    const hum = actor ? CPR.humanity(actor) : { value: 0, max: 0 };
    const bay = actor ? HomeStore.bay(actor) : null;
    const stash = actor ? HomeStore.stash(actor) : null;
    const pct = (v, m) => (m > 0 ? Math.max(0, Math.min(100, Math.round((v / m) * 100))) : 0);
    const f = feature(tab);
    const context = {
      isGM: game.user.isGM,
      busy: this.busy,
      tab,
      actor: actor ? { id: actor.id, uuid: actor.uuid, name: actor.name, img: actor.img } : null,
      characters: HomeStore.characters().map((a) => ({ id: a.id, name: a.name, selected: a.id === this.actorId })),
      tabs: features().filter((f) => !f.available || f.available(actor)).map((f) => ({ id: f.id, icon: f.icon, label: L(f.label), active: f.id === tab })),
      homeName: bay?.homeName || L("NEONHOME.Home.Unnamed"),
      bays: bay?.slots ?? 0,
      hasStash: !!stash,
      stashCount: stash ? stash.items.size : 0,
      vitals: {
        hp: hp.value,
        hpMax: hp.max,
        hpPct: pct(hp.value, hp.max),
        hum: hum.value,
        humMax: hum.max,
        humPct: pct(hum.value, hum.max)
      },
      featureTemplate: f?.template ?? null
    };
    if (f && actor) Object.assign(context, await f.prepare(this, actor, context));
    return context;
  }


  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    root.classList.toggle("is-busy", this.busy);
    const picker = root.querySelector("select.nah-picker");
    if (picker && !picker.dataset.bound) {
      picker.dataset.bound = "1";
      picker.addEventListener("change", (ev) => {
        this.actorId = ev.target.value || null;
        this.state = {};
        this.render({ force: true });
      });
    }
    const f = feature(this.tab);
    const part = root.querySelector(".nah-feature");
    if (f?.onRender && part) f.onRender(this, part);
  }

  /**
   * Run an operation with the window marked busy, and re-render after.
   * Rule blocks become warnings; other errors are shown and logged.
   */
  async act(fn) {
    if (this.busy) return null;
    this.busy = true;
    this.element?.classList.add("is-busy");
    try {
      return await HomeOps.run(fn);
    } finally {
      this.busy = false;
      if (this.rendered) this.render();
    }
  }

  /* ---------------------------------------- */
  /*  Shared actions                          */
  /* ---------------------------------------- */

  static #onView(event, target) {
    const tab = target.dataset.tab;
    if (!feature(tab) || tab === this.tab) return;
    this.tab = tab;
    game.settings.set(MODULE_ID, "tab", tab).catch(() => null);
    this.render();
  }

  static #onOpenSheet() {
    this.actor?.sheet?.render(true);
  }

  /** Open an item's sheet: data-item-id (and data-owner, the uuid of the actor it's on). */
  static async #onOpenItem(event, target) {
    const el = target.closest("[data-item-id]");
    const ownerUuid = el?.dataset.owner;
    const owner = ownerUuid ? await fromUuid(ownerUuid) : this.actor;
    const item = owner?.items?.get(el?.dataset.itemId);
    if (!item) return;
    if (!item.testUserPermission(game.user, "OBSERVER")) return ui.notifications.warn(L("NEONHOME.Error.NoPermission"));
    item.sheet.render(true);
  }
}

/** Drag-and-drop helpers shared by the features. */
export const DnD = {
  /** Make elements with [data-drag] draggable; they carry their dataset as JSON. */
  sources(root) {
    for (const el of root.querySelectorAll("[data-drag]")) {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ neonHome: true, ...el.dataset }));
        ev.dataTransfer.effectAllowed = "move";
        el.classList.add("is-dragging");
        root.classList.add("is-dragging");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("is-dragging");
        root.classList.remove("is-dragging");
      });
    }
  },

  /**
   * Make elements with [data-drop] accept drops.
   * @param {HTMLElement} root
   * @param {(data: object, target: HTMLElement, event: DragEvent) => any} handler
   */
  targets(root, handler) {
    for (const el of root.querySelectorAll("[data-drop]")) {
      el.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", (ev) => {
        ev.preventDefault();
        el.classList.remove("drag-over");
        root.classList.remove("is-dragging");
        let data;
        try {
          data = JSON.parse(ev.dataTransfer.getData("text/plain"));
        } catch {
          data = Compat.getDragEventData(ev);
        }
        if (data) handler(data, el, ev);
      });
    }
  }
};
