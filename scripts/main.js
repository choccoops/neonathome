import { MODULE_ID, SYSTEM_ID, TEMPLATE_PATH, CHECKED, NEON_HUB_ID } from "./constants.js";
import { Compat } from "./compat.js";
import { HomeSocket } from "./socket.js";
import { Settings } from "./settings.js";
import { CPR } from "./cpr.js";
import { HomeStore } from "./home/store.js";
import { HomeOps } from "./home/ops.js";
import { HomeApp } from "./apps/home-app.js";
import { registerFeature, features } from "./apps/features.js";
import { Loadout } from "./apps/loadout.js";
import { Bay } from "./apps/bay.js";
import { Biomonitor } from "./apps/biomonitor.js";
import { Bench } from "./apps/bench.js";
import { Maintenance } from "./apps/maintenance.js";
import { MaintOps } from "./home/maint-ops.js";
import { ItemConfig } from "./apps/item-config.js";
import { RulesConfig } from "./apps/rules-config.js";
import { isVasVehicle } from "./data/vehicles.js";
import { psycheState } from "./data/syndromes.js";
import { encumberedMove } from "./data/weight.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

registerFeature(Loadout);
registerFeature(Bay);
registerFeature(Biomonitor);
registerFeature(Bench);
registerFeature(Maintenance);

Hooks.once("init", () => {
  Settings.register(RulesConfig);

  // Encumbered and Overloaded as status effects: on the token, in the token HUD, and (registered
  // before Condition Lab & Triggler reads the list at ready) among CLT's core effects.
  CONFIG.statusEffects.push(HomeOps.encumbranceStatus("half"), HomeOps.encumbranceStatus("one"));

  game.modules.get(MODULE_ID).api = {
    /** Open the home suite on this client (an Actor or uuid; default: your own character). tab: loadout, bay, biomonitor, bench, maintenance. */
    open: (actor = null, tab = null) => HomeApp.open(actor, { tab }),
    /** GM: open each listed user's own home suite (default: every connected player). */
    show: (tab = null, userIds = null) => HomeSocket.emit("openHome", { tab }, userIds ?? game.users.filter((u) => u.active && !u.isGM).map((u) => u.id)),
    /** Carry slots and weight for a character: { carry, weight }. */
    measure: (actor) => HomeOps.measure(actor),
    /** A character's home: { stash, bayOverride, name, vehicles }. */
    home: (actor) => HomeStore.home(actor),
    /** The character's home stash actor (creating it if needed, via the GM). */
    stash: (actor) => HomeOps.ensureStash(actor),
    /** Vehicle bays: { slots, source, homeName }. */
    bays: (actor) => HomeStore.bay(actor),
    /** Biomonitor: the character's Empathy tier, Syndromes, Catharsis and Inspiration. */
    psyche: (actor) => psycheState(HomeStore.psyche(actor), CPR.humanity(actor).value),
    /** GM: give a character Inspiration. */
    awardInspiration: (actor, n = 1) => HomeOps.updatePsyche(actor, (p) => {
      p.inspiration = Math.max(0, (Number(p.inspiration) || 0) + n);
    }),
    /** Add a sub-feature tab to the suite (see scripts/apps/features.js). */
    registerFeature,
    features: () => features().map((f) => f.id),
    /** Maintenance: a character's gear, what it needs and where it stands (see data/maintenance.js). */
    maintenance: (actor) => MaintOps.list(actor),
    /** Roll a malfunction for an item (optionally on a given table). */
    malfunction: (actor, itemId, table = null) => MaintOps.malfunction(actor, itemId, { table }),
    /** GM: set an item's condition: "", "damaged", "destroyed" or "dbr". */
    setCondition: (actor, itemId, condition, opts = {}) => HomeOps.setCondition(actor, itemId, condition, opts),
    /** GM: start the next maintenance month (or week). */
    newMaintenanceCycle: () => MaintOps.newCycle(),
    /** Drop an item where the character stands (an Item Piles pile when it's on). */
    drop: (actor, itemId) => MaintOps.dropItem(actor, actor.items.get(itemId)),
    /** Open Neon At Home's settings for an item (GM). */
    configureItem: (item) => ItemConfig.open(item),
    apps: { HomeApp, ItemConfig, RulesConfig }
  };

  Compat.loadTemplates([`${TEMPLATE_PATH}/shell.hbs`, ...features().map((f) => f.template)]);
});

Hooks.once("ready", () => {
  // Templates of features registered after init (by other modules) still need loading.
  Compat.loadTemplates(features().map((f) => f.template));
  HomeSocket.init();
  HomeOps.init();
  HomeSocket.on("openHome", ({ tab }) => HomeApp.open(null, { tab }));
  if (game.user.isGM && game.system.id !== SYSTEM_ID) ui.notifications.warn(L("NEONHOME.Error.WrongSystem", { system: game.system.title }));
});

/* ------------------------------------------ */
/*  Keep the window and the armor effect current */
/* ------------------------------------------ */

Hooks.on(`${MODULE_ID}.rulesChanged`, () => HomeApp.refresh());

const pending = new Map();
/** Re-sync the armor-fit and encumbrance effects once a burst of changes settles. */
function queueEffectSync(actor) {
  if (!actor || actor.type !== "character" || !actor.isOwner) return;
  clearTimeout(pending.get(actor.id));
  pending.set(actor.id, setTimeout(async () => {
    pending.delete(actor.id);
    try {
      await HomeOps.syncLoadoutEffect(actor);
      await HomeOps.syncEncumbrance(actor);
    } catch (err) {
      console.warn(`${MODULE_ID} | effect sync failed for ${actor.name}`, err);
    }
  }, 250));
}

const limbsPending = new Map();
/**
 * The lead GM keeps offline cyberlimbs' Dismembered injuries in step with the cyberware, whoever
 * changed it (a player uninstalling an EMP'd arm takes its injury with it).
 */
function queueLimbSync(actor) {
  if (!actor || actor.type !== "character" || !HomeOps.isLeadGM) return;
  clearTimeout(limbsPending.get(actor.id));
  limbsPending.set(actor.id, setTimeout(async () => {
    limbsPending.delete(actor.id);
    try {
      await HomeOps.syncCyberLimbs(actor);
    } catch (err) {
      console.warn(`${MODULE_ID} | cyberlimb sync failed for ${actor.name}`, err);
    }
  }, 300));
}

const onItem = (item, userId) => {
  HomeApp.refreshFor(item);
  if (!(item.parent instanceof Actor)) return;
  if (userId === game.user.id) queueEffectSync(item.parent);
  if (item.type === "cyberware" || item.getFlag?.(MODULE_ID, "cyberLimb")) queueLimbSync(item.parent);
};
Hooks.on("createItem", (item, options, userId) => onItem(item, userId));
Hooks.on("updateItem", (item, changes, options, userId) => onItem(item, userId));
Hooks.on("deleteItem", (item, options, userId) => onItem(item, userId));

// The GM brings everyone up to date when the rules change, and once at the start.
const syncAll = () => {
  if (!HomeOps.isLeadGM) return;
  for (const actor of game.actors) {
    if (actor.type !== "character") continue;
    queueEffectSync(actor);
    queueLimbSync(actor);
  }
};
Hooks.on(`${MODULE_ID}.rulesChanged`, syncAll);
Hooks.once("ready", async () => {
  if (HomeOps.isLeadGM) {
    try {
      await HomeOps.repairEffects();
    } catch (err) {
      console.warn(`${MODULE_ID} | effect repair failed`, err);
    }
  }
  syncAll();
});

/**
 * Safety net: an effect carrying Neon At Home's MOVE change (or its statuses), however it's made
 * (token HUD, Condition Lab, a macro), gets CPR's bookkeeping so the character sheet can read it.
 */
Hooks.on("preCreateActiveEffect", (effect, data, options, userId) => {
  if (userId !== game.user.id) return;
  if (!HomeOps._carriesOurChange(effect) || !CPR.needsEffectFlags(effect)) return;
  effect.updateSource({ [`flags.${SYSTEM_ID}.changes`]: CPR.effectFlags(effect.changes, effect.flags?.[SYSTEM_ID]?.changes) });
});

/**
 * Encumbrance on MOVE (an ActiveEffect change in CUSTOM mode whose value names the level). It runs
 * after other effects (priority 100), so cyberlegs and the like count before it's halved.
 */
Hooks.on("applyActiveEffect", (actor, change) => {
  if (change.key !== "system.stats.move.value") return;
  const level = { [`${MODULE_ID}.half`]: "half", [`${MODULE_ID}.one`]: "one" }[change.value];
  if (!level) return;
  const move = Number(foundry.utils.getProperty(actor, change.key)) || 0;
  foundry.utils.setProperty(actor, change.key, encumberedMove(move, level));
});

/**
 * Carry slots are a hard limit everywhere, including the Cyberpunk RED sheet's equip toggle: a
 * change that would carry something past them is stopped with the pop-up (the GM can go ahead).
 * Neon At Home's own writes are checked before they're made and marked so.
 */
Hooks.on("preUpdateItem", (item, changes, options, userId) => {
  if (options?.[MODULE_ID]?.[CHECKED] || userId !== game.user.id) return;
  const actor = item.parent;
  if (!(actor instanceof Actor) || actor.type !== "character") return;
  const equipped = foundry.utils.getProperty(changes, "system.equipped");
  if (equipped === undefined || equipped === item.system.equipped || equipped === "owned") return;
  // Destroyed (or EMP'd) armor can't be worn until it works again.
  if (equipped === "equipped" && item.type === "armor" && !game.user.isGM) {
    const state = HomeOps.offlineState(actor, item.id);
    if (state) {
      ui.notifications.warn(L(`NEONHOME.Condition.Blocked.${state}`, { item: item.name }));
      return false;
    }
  }
  const mode = Settings.get("enforceCarry");
  if (mode === "off") return;
  const change = item.toObject();
  change._id = item.id;
  foundry.utils.setProperty(change, "system.equipped", equipped);
  const { worse, after } = HomeOps.carryCheck(actor, change);
  if (!worse) return;
  if (mode === "warn") {
    ui.notifications.warn(L("NEONHOME.Loadout.OverSlots", { used: after.carry.used, capacity: after.carry.capacity }));
    return;
  }
  HomeOps.carryPopup(actor, { name: item.name, id: item.id }, after).then((override) => {
    if (override) item.update(changes, { ...options, [MODULE_ID]: { [CHECKED]: true } });
  });
  return false;
});

/** Things arriving on a character (bought, looted, dropped on the sheet) aren't refused, but warned about. */
Hooks.on("preCreateItem", (item, data, options, userId) => {
  if (options?.[MODULE_ID]?.[CHECKED] || userId !== game.user.id) return;
  const actor = item.parent;
  if (!(actor instanceof Actor) || actor.type !== "character" || Settings.get("enforceCarry") === "off") return;
  const change = item.toObject();
  change._id ??= "arriving000000a";
  const { worse, after } = HomeOps.carryCheck(actor, change);
  if (worse) HomeOps.carryPopup(actor, { name: item.name, id: change._id }, after, { arriving: true });
});

/** Humanity before an update, passed along to every client with the update. */
Hooks.on("preUpdateActor", (actor, changes, options) => {
  if (actor.type !== "character" || options?.[MODULE_ID]?.humanity) return;
  if (!foundry.utils.hasProperty(changes, "system.derivedStats.humanity.value")) return;
  options[MODULE_ID] = { ...(options[MODULE_ID] ?? {}), before: CPR.humanity(actor).value };
});

Hooks.on("updateActor", (actor, changes, options) => {
  HomeApp.refreshFor(actor);
  if (foundry.utils.hasProperty(changes, "system.installedItems")) queueLimbSync(actor);
  const before = options?.[MODULE_ID]?.before;
  if (before === undefined || options[MODULE_ID]?.humanity || !HomeOps.isLeadGM) return;
  HomeOps.onHumanityChanged(actor, before).catch((err) => console.warn(`${MODULE_ID} | Humanity follow-up failed for ${actor.name}`, err));
});

/* ------------------------------------------ */
/*  Offline cyberware doesn't work            */
/* ------------------------------------------ */

/**
 * Cyberpunk RED has no hook before a roll, so the sheet's roll buttons are caught first (capture
 * phase): rolling with gear that doesn't work (EMP'd, Destroyed, Destroyed Beyond Repair, or
 * installed in something that is) is stopped.
 */
function guardOfflineRolls(sheet, element) {
  const actor = sheet.actor ?? sheet.document;
  const root = element?.[0] ?? element;
  if (actor?.type !== "character" || !root?.addEventListener || root.dataset?.nahOffline) return;
  root.dataset.nahOffline = "1";
  root.addEventListener("click", (ev) => {
    const roll = ev.target?.closest?.(".rollable, [data-action='roll'], [data-roll-type]");
    const id = roll?.closest("[data-item-id]")?.dataset.itemId ?? roll?.dataset.itemId;
    const item = id ? actor.items.get(id) : null;
    if (!item || item.type === "skill") return;
    const state = HomeOps.offlineState(actor, id);
    if (!state) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ui.notifications.warn(L(`NEONHOME.Condition.Blocked.${state}`, { item: item.name }));
  }, true);
}
Hooks.on("renderActorSheet", (sheet, html) => guardOfflineRolls(sheet, sheet.element ?? html));
Hooks.on("renderActorSheetV2", (sheet, element) => guardOfflineRolls(sheet, element));

/* ------------------------------------------ */
/*  Breaking Your Stuff                       */
/* ------------------------------------------ */

/**
 * Natural 1s with poorly maintained gear. Every roll Cyberpunk RED makes with an item (attacks,
 * cyberdeck actions, item macros) goes through the item's confirmRoll before it's rolled, so the
 * roll is watched from there.
 */
Hooks.once("ready", () => {
  let proto = CONFIG.Item?.documentClass?.prototype;
  while (proto && !Object.prototype.hasOwnProperty.call(proto, "confirmRoll")) proto = Object.getPrototypeOf(proto);
  if (!proto || proto.confirmRoll?.[`${MODULE_ID}Watched`]) return;
  const original = proto.confirmRoll;
  const watched = async function (cprRoll, ...rest) {
    const out = await original.call(this, cprRoll, ...rest);
    const item = this;
    if (out && typeof out.roll === "function" && item?.type !== "skill") {
      const roll = out.roll;
      out.roll = async function (...args) {
        const result = await roll.apply(this, args);
        MaintOps.onItemRoll(item, this).catch((err) => console.warn(`${MODULE_ID} | fumble check failed`, err));
        return result;
      };
    }
    return out;
  };
  watched[`${MODULE_ID}Watched`] = true;
  proto.confirmRoll = watched;
});

/** A lost arm or hand drops what it held; an item picked up from a pile gets its attachments back. */
Hooks.on("createItem", (item, options, userId) => {
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  if (item.type === "criticalInjury" && HomeOps.isLeadGM) {
    MaintOps.onInjury(actor, item).catch((err) => console.warn(`${MODULE_ID} | dropping held items failed`, err));
  }
  if (userId === game.user.id && item.getFlag(MODULE_ID, "dropTree")) {
    MaintOps.restoreDropped(item).catch((err) => console.warn(`${MODULE_ID} | restoring ${item.name}'s attachments failed`, err));
  }
});

let expiry = null;
Hooks.on("updateWorldTime", () => {
  if (!HomeOps.isLeadGM) return;
  clearTimeout(expiry);
  expiry = setTimeout(() => MaintOps.expireMalfunctions().catch((err) => console.warn(`${MODULE_ID} | malfunction expiry failed`, err)), 500);
});

// Neon Hub's new lifestyle month starts a new maintenance month.
Hooks.on(`${NEON_HUB_ID}.lifestyleChanged`, () => {
  if (HomeOps.isLeadGM) MaintOps.followHub().catch((err) => console.warn(`${MODULE_ID} | following Neon Hub's month failed`, err));
});
Hooks.once("ready", () => {
  if (HomeOps.isLeadGM) MaintOps.followHub().catch(() => null);
});

/** The GM's buttons on malfunction cards (v12 passes jQuery, v13 an element). */
function bindMalfunctionCard(message, html) {
  const root = html?.[0] ?? html;
  const data = message.getFlag?.(MODULE_ID, "malfunction");
  if (!root?.querySelectorAll || !data || root.dataset?.nahMalf) return;
  if (root.dataset) root.dataset.nahMalf = "1";
  for (const button of root.querySelectorAll("[data-nah-malf]")) {
    if (!game.user.isGM || data.done) {
      button.disabled = true;
      if (!game.user.isGM) button.hidden = true;
      continue;
    }
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      button.disabled = true;
      HomeOps.run(() => MaintOps.cardAction(message));
    });
  }
}
Hooks.on("renderChatMessage", (message, html) => bindMalfunctionCard(message, html));
Hooks.on("renderChatMessageHTML", (message, html) => bindMalfunctionCard(message, html));

/* ------------------------------------------ */
/*  Entry points                              */
/* ------------------------------------------ */

const homeForActor = (actor) => actor?.type === "character" && !isVasVehicle(actor) && HomeStore.canManage(actor);
const configForItem = (item) => game.user.isGM && !["skill", "role", "criticalInjury", "netarch"].includes(item?.type);

// CPR 0.92 sheets are Application V1.
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.document;
  if (!homeForActor(actor)) return;
  buttons.unshift({ label: "NEONHOME.Short", class: "neon-home-open", icon: "fa-solid fa-house-chimney-window", onclick: () => HomeApp.open(actor) });
});
Hooks.on("getItemSheetHeaderButtons", (sheet, buttons) => {
  const item = sheet.item ?? sheet.document;
  if (!configForItem(item)) return;
  buttons.unshift({ label: "NEONHOME.Short", class: "neon-home-config", icon: "fa-solid fa-house-chimney-window", onclick: () => ItemConfig.open(item) });
});
// Application V2 sheets (a later CPR release on Foundry v13+).
Hooks.on("getHeaderControlsActorSheetV2", (sheet, controls) => {
  if (!homeForActor(sheet.document)) return;
  controls.unshift({ label: "NEONHOME.Short", icon: "fa-solid fa-house-chimney-window", action: "neonHomeOpen", onClick: () => HomeApp.open(sheet.document) });
});
Hooks.on("getHeaderControlsItemSheetV2", (sheet, controls) => {
  if (!configForItem(sheet.document)) return;
  controls.unshift({ label: "NEONHOME.Short", icon: "fa-solid fa-house-chimney-window", action: "neonHomeConfig", onClick: () => ItemConfig.open(sheet.document) });
});

Hooks.on("renderActorDirectory", (app, html) => {
  if (!HomeStore.characters().length) return;
  const root = Compat.element(html);
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".neon-home-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "neon-home-open";
  btn.innerHTML = `<i class="fa-solid fa-house-chimney-window"></i> ${esc(L("NEONHOME.Short"))}`;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    HomeApp.open();
  });
  actions.appendChild(btn);
});

/** A home button in the left toolbar's Token Controls. v12 passes an array, v13 an object. */
Hooks.on("getSceneControlButtons", (controls) => {
  const tool = { name: "neonHome", title: "NEONHOME.Title", icon: "fa-solid fa-house-chimney-window", button: true, visible: true };
  if (Array.isArray(controls)) {
    controls.find((c) => c.name === "token")?.tools.push({ ...tool, onClick: () => HomeApp.open() });
    return;
  }
  const token = controls.tokens ?? controls.token;
  if (!token) return;
  token.tools.neonHome = { ...tool, order: Object.keys(token.tools).length, onChange: () => HomeApp.open() };
});

// With no scene on the canvas Foundry ignores tool clicks.
Hooks.on("renderSceneControls", (app, html) => {
  if (canvas?.ready) return;
  const button = Compat.element(html)?.querySelector('[data-tool="neonHome"]');
  if (!button || button.dataset.neonHome) return;
  button.dataset.neonHome = "1";
  button.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    HomeApp.open();
  });
});
