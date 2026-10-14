import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { Downtime, GATES, formatMinutes } from "../home/downtime.js";
import { features, feature, featureActions } from "./features.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/**
 * Neon At Home: a character's home suite. One window, a tab per sub-feature (Loadout, Vehicle Bay,
 * Weaponbench, Maintenance, Downtime). The shell renders the current tab's template as a partial
 * (feature templates are preloaded, which registers them as partials by path).
 *
 * Other windows reuse the shell for features that stand on their own (the Biomonitor): a subclass
 * sets APP_ID, TITLE, ICON and which features it shows.
 */
export class HomeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;
  static _opening = null;

  /** Every window built on this shell, for refreshing them all. */
  static windows = [];

  /** The window's id (after the module id), title and header icon. */
  static APP_ID = "home";
  static TITLE = "NEONHOME.Title";
  static ICON = "fa-solid fa-house-chimney-window";

  /** The features (tabs) this window shows: everything that doesn't stand on its own. */
  static featureList() {
    return features().filter((f) => !f.standalone);
  }

  /** The tab it opens on. */
  static defaultTab() {
    return Settings.get("tab") || "loadout";
  }

  constructor(options = {}) {
    super(foundry.utils.mergeObject({ id: `${MODULE_ID}-${new.target.APP_ID}`, actions: featureActions(), window: { title: new.target.TITLE, icon: new.target.ICON } }, options, { inplace: false }));
    this.actorId = null;
    this.tab = new.target.defaultTab();
    /** Per-feature UI state (selected weapon, armor, store), kept across renders. Not "state": ApplicationV2 has a read-only one. */
    this.uiState = {};
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
      scrollable: [".nah-col-doll", ".nah-col-carry", ".nah-col-store", ".nah-bay", ".nah-bio", ".nah-rack", ".nah-mat", ".nah-drawer", ".nah-cyber-list", ".nah-maint-list", ".nah-maint-bench", ".nah-dt-list", ".nah-dt-panel", ".nah-scroll"]
    }
  };

  /* ---------------------------------------- */

  /**
   * Open the window on this client.
   * @param {Actor|string|null} actor - a character or its uuid (default: the user's own)
   * @param {object} [opts] - { tab }
   */
  static open(actor = null, { tab } = {}) {
    // A second click while the window is still opening waits for the first instead of racing it.
    if (this._opening) return this._opening;
    this._opening = this._open(actor, { tab })
      .catch((err) => {
        console.error(`${MODULE_ID} | could not open the ${this.APP_ID} window`, err);
        ui.notifications.error(L("NEONHOME.Error.Open"));
      })
      .finally(() => {
        this._opening = null;
      });
    return this._opening;
  }

  static async _open(actor, { tab }) {
    if (typeof actor === "string") actor = await fromUuid(actor);
    if (actor?.isToken) actor = actor.baseActor ?? actor;
    const chars = HomeStore.characters();
    if (actor && !HomeStore.canManage(actor)) actor = null;
    if (!actor) actor = game.user.character && chars.includes(game.user.character) ? game.user.character : chars[0] ?? null;
    if (!actor) return ui.notifications.info(L("NEONHOME.NoCharacter"));
    const app = (this.instance ??= new this());
    app.actorId = actor.id;
    if (tab && this.featureList().some((f) => f.id === tab)) app.tab = tab;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Re-render every window that's open. */
  static refresh() {
    for (const W of HomeApp.windows) if (W.instance?.rendered) W.instance.render();
  }

  /** Re-render the windows showing the character a change touches (or their home). */
  static refreshFor(doc) {
    for (const W of HomeApp.windows) W._refreshFor(doc);
  }

  static _refreshFor(doc) {
    const app = this.instance;
    if (!app?.rendered || !doc) return;
    const actor = app.actor;
    if (!actor) return;
    const related = new Set([actor.uuid]);
    const home = HomeStore.home(actor);
    if (home.stash) related.add(home.stash);
    for (const v of home.vehicles) related.add(v.uuid.split(".Item.")[0]);
    const uuid = doc.documentName === "Item" ? doc.parent?.uuid : doc.uuid;
    // While an action runs, it re-renders when it's done: don't render twice.
    if (related.has(uuid) && !app.busy) app.render();
  }

  get actor() {
    return this.actorId ? game.actors.get(this.actorId) ?? null : null;
  }

  get title() {
    const actor = this.actor;
    const title = L(this.constructor.TITLE);
    return actor ? `${title}: ${actor.name}` : title;
  }

  /** This window's features that are on for the character. */
  _features(actor) {
    return this.constructor.featureList().filter((f) => !f.available || f.available(actor));
  }

  #validTab() {
    const actor = this.actor;
    const list = this._features(actor);
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
      tabs: this._features(actor).map((f) => ({ id: f.id, icon: f.icon, label: L(f.label), active: f.id === tab })),
      // a window of one feature has no tab bar, and a header of its own
      single: this.constructor.featureList().length <= 1,
      homeHeader: this.constructor.APP_ID === "home",
      windowTitle: this.constructor.TITLE,
      windowIcon: this.constructor.ICON,
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
      featureTemplate: f?.template ?? null,
      downtime: actor && this.constructor.APP_ID === "home" ? downtimeBadge(actor) : null
    };
    if (f && actor) {
      // A tab that fails shows why instead of leaving the window blank.
      try {
        Object.assign(context, await f.prepare(this, actor, context));
      } catch (err) {
        console.error(`${MODULE_ID} | the ${tab} tab failed to prepare`, err);
        context.featureTemplate = null;
        context.featureError = err?.message ?? String(err);
      }
    }
    return context;
  }


  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    root.classList.remove("is-busy");
    const picker = root.querySelector("select.nah-picker");
    if (picker && !picker.dataset.bound) {
      picker.dataset.bound = "1";
      picker.addEventListener("change", (ev) => {
        this.actorId = ev.target.value || null;
        this.uiState = {};
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
      // Whatever happened, the window must come back to life.
      this.busy = false;
      this.element?.classList.remove("is-busy");
      this.element?.querySelector(".nah-root")?.classList.remove("is-busy");
      if (this.rendered) this.render().catch((err) => console.error(`${MODULE_ID} | render failed`, err));
    }
  }

  /* ---------------------------------------- */
  /*  Shared actions                          */
  /* ---------------------------------------- */

  static #onView(event, target) {
    const tab = target.dataset.tab;
    if (!feature(tab) || tab === this.tab) return;
    this.tab = tab;
    if (this.constructor === HomeApp) game.settings.set(MODULE_ID, "tab", tab).catch(() => null);
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

HomeApp.windows.push(HomeApp);

/** The home's downtime badge: time left in downtime, or that it isn't downtime (when something waits for it). */
function downtimeBadge(actor) {
  const st = Downtime.state(actor);
  if (st.active) {
    const label = st.left === null ? L("NEONHOME.Downtime.Badge.on") : L("NEONHOME.Downtime.Badge.left", { left: formatMinutes(st.left) });
    return { active: true, label, tip: st.label ? `${st.label}: ${label}` : label };
  }
  if (!GATES.some((g) => Downtime.gated(g))) return null;
  const label = Downtime.current() ? L("NEONHOME.Downtime.Badge.notTaking") : L("NEONHOME.Downtime.Badge.off");
  return { active: false, label, tip: L("NEONHOME.Downtime.Badge.tip") };
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
