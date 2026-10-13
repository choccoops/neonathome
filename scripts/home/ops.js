import { MODULE_ID, HOME_FLAG, PSYCHE_FLAG, STASH_FLAG, EFFECT_FLAG, ENCUMBRANCE_FLAG, ENCUMBRANCE_STATUS, CLT_ID, SYSTEM_ID } from "../constants.js";
import { Compat } from "../compat.js";
import { HomeSocket } from "../socket.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore, docFrom } from "./store.js";
import { normalizeHome, freeBay } from "../data/home.js";
import { computeLoadout, canInstallUpgrade, armorEffects, poolsThatWontTake } from "../data/capacity.js";
import { computeWeight, encumbrance } from "../data/weight.js";
import { normalizePsyche, psycheState, tierOf, catharsisGain, absorbLoss, TIERS } from "../data/syndromes.js";
import { canAttach, canDetach } from "../data/attachments.js";
import { cyberwareMap, flatten } from "../data/cyberware.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const { deepClone, randomID } = foundry.utils;

/** Thrown for a rule the GM set to block; shown to the user as a warning, not an error. */
export class RuleBlock extends Error {}

/**
 * Everything that changes a character's home. Players do what they own directly; moving items to
 * or from a stash or vehicle they don't own, and creating a stash, go to the GM over the socket.
 */
export const HomeOps = {
  init() {
    HomeSocket.register("transfer", (payload, user) => this._gmTransfer(payload, user));
    HomeSocket.register("createStash", (payload, user) => this._gmCreateStash(payload, user));
  },

  /* ---------------------------------------- */
  /*  Rules                                   */
  /* ---------------------------------------- */

  /** Carry slots and weight for an actor, optionally with one item changed or added. */
  measure(actor, change = null) {
    const items = actor.items.map((i) => i.toObject());
    if (change) {
      const idx = items.findIndex((i) => i._id === change._id);
      if (idx >= 0) items[idx] = change;
      else items.push(change);
    }
    // Cyberware installed in the body is listed on the actor, not inside another item.
    const actorInstalled = Array.from(actor.system?.installedItems?.list ?? []);
    const carry = computeLoadout(items, Settings.carry, MODULE_ID, { actorInstalled });
    const weight = computeWeight(items, Settings.weight, { body: Number(actor.system?.stats?.body?.value) || 0, moduleId: MODULE_ID, actorInstalled });
    return { carry, weight };
  },

  /**
   * Would this change put the character further over their carry slots?
   * @returns {{worse: boolean, before, after}} before/after from measure()
   */
  carryCheck(actor, change) {
    const before = this.measure(actor);
    const after = this.measure(actor, change);
    const overPools = (c) => c.pools.reduce((n, p) => n + Math.max(0, p.used - p.slots), 0);
    const over = (c) => Math.max(0, c.used - c.capacity) + overPools(c);
    const worse = Settings.carry.enabled && over(after.carry) > over(before.carry);
    return { worse, before, after };
  },

  /**
   * The carry-slot pop-up: what doesn't fit and why. The GM can carry it anyway. For things that
   * arrived on the character (bought, looted) it only tells them they're over.
   * @returns {Promise<boolean>} true when the GM chose to go over
   */
  async carryPopup(actor, item, after, { arriving = false } = {}) {
    const c = after.carry;
    const pool = c.pools.find((p) => p.used > p.slots);
    // Bonus slots with room that only take other things (a Gear bag for a pistol): say so.
    const closed = poolsThatWontTake(c, item.id);
    const body = arriving ? "NEONHOME.Loadout.Blocked.Arrived" : "NEONHOME.Loadout.Blocked.Body";
    const content = `<p>${L(body, { name: esc(actor.name), item: esc(item.name), used: c.used, capacity: c.capacity })}</p>`
      + (pool ? `<p>${L("NEONHOME.Loadout.Blocked.Pool", { pool: esc(pool.name), used: pool.used, slots: pool.slots })}</p>` : "")
      + closed.map((p) => `<p>${L("NEONHOME.Loadout.Blocked.WrongPool", { pool: esc(p.name), free: p.free, accepts: L(`NEONHOME.Accepts.${p.accepts}`) })}</p>`).join("")
      + `<p class="hint">${L("NEONHOME.Loadout.Blocked.Hint")}</p>`;
    const buttons = [{ action: "ok", label: L("NEONHOME.Loadout.Blocked.Ok"), icon: "fa-solid fa-check", default: true }];
    if (game.user.isGM && !arriving) buttons.push({ action: "override", label: L("NEONHOME.Loadout.Blocked.Override"), icon: "fa-solid fa-triangle-exclamation" });
    const choice = await Compat.DialogV2.wait({
      window: { title: L("NEONHOME.Loadout.Blocked.Title"), icon: "fa-solid fa-table-cells" },
      content,
      buttons,
      classes: ["neon-home-dialog"],
      rejectClose: false
    });
    return game.user.isGM && choice === "override";
  },

  /**
   * Check the GM's rules for a change onto the character. Carry slots are a hard limit (a pop-up
   * stops it; the GM may override) unless the GM set them to warn or off; weight warns or blocks.
   * Only checks changes that make things worse. Throws RuleBlock when stopped.
   */
  async enforce(actor, change, itemName = change?.name ?? "") {
    const { worse, before, after } = this.carryCheck(actor, change);
    const carryMode = Settings.get("enforceCarry");
    if (worse && carryMode === "block") {
      if (!(await this.carryPopup(actor, { name: itemName, id: change._id }, after))) throw new RuleBlock("");
    } else if (worse && carryMode === "warn") {
      ui.notifications.warn(L("NEONHOME.Loadout.OverSlots", { used: after.carry.used, capacity: after.carry.capacity }));
    }
    const weightMode = Settings.get("enforceWeight");
    if (Settings.weight.enabled && weightMode !== "off" && after.weight.current > after.weight.max && after.weight.current > before.weight.current) {
      const msg = L("NEONHOME.Loadout.OverWeight", { current: after.weight.current, max: after.weight.max });
      if (weightMode === "block" && !game.user.isGM) throw new RuleBlock(msg);
      ui.notifications.warn(msg);
    }
  },

  /** Plain data for an item as it would be after an update. */
  _changed(item, update) {
    const data = item.toObject();
    data._id = item.id;
    for (const [k, v] of Object.entries(update)) foundry.utils.setProperty(data, k, v);
    return data;
  },

  /** Run an operation, turning rule blocks into warnings and errors into notifications. */
  async run(fn) {
    try {
      return await fn();
    } catch (err) {
      // A rule block with no message has already said why (the carry-slot pop-up).
      if (err instanceof RuleBlock) {
        if (err.message) ui.notifications.warn(err.message);
      }
      else {
        console.error(`${MODULE_ID} |`, err);
        ui.notifications.error(err.message ?? String(err));
      }
      return null;
    }
  },

  /* ---------------------------------------- */
  /*  Loadout                                 */
  /* ---------------------------------------- */

  /** Set an item to owned, carried or equipped. */
  async equip(actor, itemId, state) {
    const item = actor.items.get(itemId);
    if (!item || !CPR.isEquippable(item)) return;
    if (state === "equipped" && item.type === "weapon" && item.system.equipped !== "equipped" && !CPR.canHold(actor, item)) {
      ui.notifications.warn(L("NEONHOME.Loadout.TooManyHands", { name: item.name }));
    }
    if (state !== "owned") await this.enforce(actor, this._changed(item, { "system.equipped": state }), item.name);
    await CPR.setEquipped(actor, item, state);
    await this.syncLoadoutEffect(actor);
  },

  /** Make sure the character has a home stash, asking the GM to create one if needed. */
  async ensureStash(actor) {
    const existing = HomeStore.stash(actor);
    if (existing) return existing;
    const uuid = game.user.isGM ? await this._gmCreateStash({ actor: actor.uuid }, game.user) : await HomeSocket.request("createStash", { actor: actor.uuid });
    return docFrom(uuid);
  },

  /**
   * Move an item between the character, their stash and their vehicles.
   * @param {Actor} actor - the character whose home this is
   * @param {string} fromUuid - actor the item is on
   * @param {string} itemId
   * @param {string} toUuid - actor it goes to
   * @param {object} [opts] - { amount, equipped, check: false to skip the carry rules (an upgrade
   *   brought over only to be installed, which then costs nothing) }
   */
  async transfer(actor, fromUuid, itemId, toUuid, { amount = null, equipped = null, check = true } = {}) {
    const from = docFrom(fromUuid);
    const to = docFrom(toUuid);
    const item = from?.items?.get(itemId);
    if (!from || !to || !item) throw new Error(L("NEONHOME.Error.NotFound"));
    // Coming onto the character: check the rules as it would arrive.
    if (to === actor && check) {
      const arriving = item.toObject();
      arriving._id = "incoming0000000";
      if (CPR.isEquippable(item)) arriving.system.equipped = equipped ?? "carried";
      if (amount !== null && arriving.system.amount !== undefined) arriving.system.amount = amount;
      if (arriving.system.installedItems) arriving.system.installedItems.list = [];
      await this.enforce(actor, arriving, item.name);
    }
    const payload = { actor: actor.uuid, from: fromUuid, to: toUuid, item: itemId, amount, equipped };
    const direct = game.user.isGM || (from.isOwner && to.isOwner);
    const result = direct ? await this._doTransfer(payload) : await HomeSocket.request("transfer", payload);
    await this.syncLoadoutEffect(actor);
    return result;
  },

  /** Send something to the home stash (as owned: it's not on the character). */
  async stow(actor, itemId, amount = null) {
    const stash = await this.ensureStash(actor);
    if (!stash) throw new Error(L("NEONHOME.Error.NoStash"));
    return this.transfer(actor, actor.uuid, itemId, stash.uuid, { amount, equipped: "owned" });
  },

  /** Take something from the stash or a vehicle onto the character, carried. */
  async retrieve(actor, fromUuid, itemId, amount = null, equipped = "carried") {
    return this.transfer(actor, fromUuid, itemId, actor.uuid, { amount, equipped });
  },

  async _doTransfer({ from, to, item, amount, equipped }) {
    const source = docFrom(from);
    const target = docFrom(to);
    const doc = source?.items?.get(item);
    if (!doc || !target) throw new Error(L("NEONHOME.Error.NotFound"));
    const created = await CPR.transfer(doc, target, { amount, equipped });
    return created?.id ?? null;
  },

  /** GM: move an item for a player, if both ends belong to their character's home. */
  async _gmTransfer(payload, user) {
    const actor = docFrom(payload.actor);
    if (!actor || !actor.testUserPermission(user, "OWNER")) throw new Error(L("NEONHOME.Error.NotYours"));
    const home = HomeStore.home(actor);
    const allowed = (uuid) => uuid === actor.uuid || uuid === home.stash || home.vehicles.some((v) => v.uuid === uuid);
    if (!allowed(payload.from) || !allowed(payload.to)) throw new Error(L("NEONHOME.Error.NotYours"));
    return this._doTransfer(payload);
  },

  /** GM: create a character's stash, a CPR container actor owned by the character's players. */
  async _gmCreateStash({ actor: actorUuid }, user) {
    const actor = docFrom(actorUuid);
    if (!actor || !actor.testUserPermission(user, "OWNER")) throw new Error(L("NEONHOME.Error.NotYours"));
    const existing = HomeStore.stash(actor);
    if (existing) return existing.uuid;
    const folderName = L("NEONHOME.Stash.Folder");
    let folder = game.folders.find((f) => f.type === "Actor" && f.name === folderName);
    folder ??= await Folder.create({ name: folderName, type: "Actor", color: "#ff2a6d" });
    const ownership = { default: 0 };
    for (const [id, level] of Object.entries(actor.ownership ?? {})) if (id !== "default" && level >= 3) ownership[id] = 3;
    const stash = await Actor.create({
      name: L("NEONHOME.Stash.Name", { name: actor.name }),
      type: "container",
      img: "icons/svg/chest.svg",
      folder: folder?.id ?? null,
      ownership,
      flags: { [MODULE_ID]: { [STASH_FLAG]: actor.uuid } }
    });
    if (typeof stash.setContainerType === "function") await stash.setContainerType("stash");
    else await stash.setFlag(SYSTEM_ID, "container-type", "stash");
    const home = HomeStore.home(actor);
    await actor.setFlag(MODULE_ID, HOME_FLAG, { ...home, stash: stash.uuid });
    return stash.uuid;
  },

  /** GM: point a character's home at an existing container actor. */
  async linkStash(actor, stash) {
    if (!game.user.isGM) return;
    await stash.setFlag(MODULE_ID, STASH_FLAG, actor.uuid);
    await this.updateHome(actor, { stash: stash.uuid });
  },

  async updateHome(actor, patch) {
    const home = { ...HomeStore.home(actor), ...patch };
    await actor.setFlag(MODULE_ID, HOME_FLAG, normalizeHome(home));
  },

  /* ---------------------------------------- */
  /*  Armor upgrades                          */
  /* ---------------------------------------- */

  /**
   * Install an armor upgrade, from the character or (moved over first) their stash.
   * The armor's upgrade slots are set from its class before CPR checks them.
   */
  async installArmorUpgrade(actor, armorId, upgradeId, fromUuid = null) {
    let upgrade = fromUuid && fromUuid !== actor.uuid ? docFrom(fromUuid)?.items.get(upgradeId) : actor.items.get(upgradeId);
    const armor = actor.items.get(armorId);
    if (!armor || !upgrade) throw new Error(L("NEONHOME.Error.NotFound"));
    const loadout = this.measure(actor).carry;
    const info = loadout.armors.find((a) => a.id === armorId);
    const check = canInstallUpgrade(info, upgrade, MODULE_ID);
    if (!check.ok) throw new RuleBlock(L(`NEONHOME.Upgrade.Reason.${check.reason}`, { name: upgrade.name }));
    if (upgrade.parent !== actor) {
      const newId = await this.transfer(actor, fromUuid, upgradeId, actor.uuid, { amount: 1, check: false });
      upgrade = actor.items.get(newId);
      if (!upgrade) throw new Error(L("NEONHOME.Error.NotFound"));
    }
    await this._syncArmorSlots(armor, info.upgradeSlots);
    await CPR.install(armor, [upgrade]);
    await this.syncLoadoutEffect(actor);
  },

  async removeArmorUpgrade(actor, armorId, upgradeId) {
    const armor = actor.items.get(armorId);
    const upgrade = actor.items.get(upgradeId);
    if (!armor || !upgrade) return;
    if (!canDetach(upgrade, MODULE_ID)) throw new RuleBlock(L("NEONHOME.Bench.Fixed", { name: upgrade.name }));
    await CPR.uninstall(armor, [upgrade]);
    await this.syncLoadoutEffect(actor);
  },

  /** Give armor the upgrade slots its class has (CPR's own field, which CPR checks on install). */
  async _syncArmorSlots(armor, slots) {
    const ii = armor.system.installedItems ?? {};
    const update = {};
    if (ii.slots !== slots) update["system.installedItems.slots"] = slots;
    if (!ii.allowed) update["system.installedItems.allowed"] = true;
    if (!(ii.allowedTypes ?? []).includes("itemUpgrade")) update["system.installedItems.allowedTypes"] = [...(ii.allowedTypes ?? []), "itemUpgrade"];
    if (Object.keys(update).length) await armor.update(update);
  },

  /**
   * Keep the actor's "armor fit" Active Effect in step with worn armor upgrades: penalty relief,
   * Plate Padding, War Paint, the AI Armor Interface.
   */
  async syncLoadoutEffect(actor) {
    if (!actor?.isOwner || actor.type !== "character") return;
    const existing = actor.effects.find((e) => e.getFlag(MODULE_ID, EFFECT_FLAG));
    const changes = Settings.get("armorEffects") ? armorEffects(this.measure(actor).carry.armors).changes : [];
    if (!changes.length) {
      if (existing) await existing.delete();
      return;
    }
    // CPR's effect sheet files each change under a category: stats, or skills for bonuses.*.
    const cats = Object.fromEntries(changes.map((c, i) => [i, c.key.startsWith("system.stats.") ? "stat" : "skill"]));
    const data = {
      name: L("NEONHOME.Loadout.EffectName"),
      img: "icons/svg/shield.svg",
      changes: changes.map((c) => ({ key: c.key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(c.value) })),
      flags: { [MODULE_ID]: { [EFFECT_FLAG]: true }, [SYSTEM_ID]: { changes: { cats } } }
    };
    if (!existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      return;
    }
    const same = JSON.stringify(existing.changes.map((c) => [c.key, Number(c.value)])) === JSON.stringify(data.changes.map((c) => [c.key, Number(c.value)]));
    if (!same) await existing.update({ changes: data.changes, [`flags.${SYSTEM_ID}.changes.cats`]: cats });
  },

  /** The MOVE change for an encumbrance level (resolved by the applyActiveEffect hook in main.js). */
  encumbranceChange(level) {
    // CUSTOM: the hook works out the new MOVE from whatever MOVE is by then; priority 100 runs it last.
    return { key: "system.stats.move.value", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: `${MODULE_ID}.${level}`, priority: 100 };
  },

  /** The status effect for an encumbrance level, as registered in CONFIG.statusEffects. */
  encumbranceStatus(level) {
    return {
      id: ENCUMBRANCE_STATUS[level],
      name: `NEONHOME.Encumbrance.${level}.Status`,
      img: `modules/${MODULE_ID}/assets/${level === "one" ? "overloaded" : "encumbered"}.svg`,
      changes: [this.encumbranceChange(level)],
      // Placed from the token HUD, the effect is made from this: it needs CPR's bookkeeping too.
      flags: { [SYSTEM_ID]: { changes: CPR.effectFlags([this.encumbranceChange(level)]) } }
    };
  },

  /**
   * The Condition Lab & Triggler condition for a level, when that module is running and the GM has
   * made a condition with the name set in Neon At Home's settings.
   * @returns {{name: string, id: string}|null}
   */
  cltCondition(level) {
    if (!game.modules.get(CLT_ID)?.active || !game.clt?.supported) return null;
    const name = String(Settings.get(level === "one" ? "cltOverloaded" : "cltEncumbered") ?? "").trim();
    if (!name) return null;
    try {
      const c = game.clt.getCondition(name);
      const cond = Array.isArray(c) ? c[0] : c;
      return cond ? { name: cond.name, id: cond.id } : null;
    } catch {
      return null;
    }
  },

  /** Is this effect an encumbrance status someone placed by hand (token HUD, Condition Lab)? */
  _manualEncumbrance(effect) {
    if (effect.getFlag(MODULE_ID, ENCUMBRANCE_FLAG)) return false;
    const statuses = [...(effect.statuses ?? [])];
    if (statuses.some((s) => Object.values(ENCUMBRANCE_STATUS).includes(s))) return true;
    const clt = effect.getFlag?.(CLT_ID, "conditionId");
    return !!clt && ["half", "one"].some((level) => this.cltCondition(level)?.id === clt);
  },

  /**
   * Keep encumbrance in step with the character's weight: over the limit MOVE is halved, over
   * double it MOVE is 1. It's a status effect (Encumbered / Overloaded) shown on the token, or the
   * GM's Condition Lab & Triggler condition of that name, so CLT's macros, chat and triggers run.
   * A status placed by hand is the GM's call and is left alone. Tells the player and GM in chat.
   */
  async syncEncumbrance(actor) {
    if (!actor?.isOwner || actor.type !== "character") return;
    const level = encumbrance(this.measure(actor).weight, Settings.weight);
    const ours = actor.effects.find((e) => e.getFlag(MODULE_ID, ENCUMBRANCE_FLAG));
    const was = ours?.getFlag(MODULE_ID, ENCUMBRANCE_FLAG) ?? "none";
    if (level === was) return;
    if (ours) await this._removeEncumbrance(actor, ours);
    const manual = actor.effects.some((e) => this._manualEncumbrance(e));
    if (level !== "none" && !manual) await this._applyEncumbrance(actor, level);
    await ChatMessage.create({
      content: this._card("fa-solid fa-weight-hanging", L(`NEONHOME.Encumbrance.${level}.Card`, { name: esc(actor.name) })),
      whisper: this._owners(actor),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  async _applyEncumbrance(actor, level) {
    const change = this.encumbranceChange(level);
    const clt = this.cltCondition(level);
    if (clt) {
      await game.clt.addCondition(clt.name, actor);
      const effect = actor.effects.find((e) => e.getFlag(CLT_ID, "conditionId") === clt.id && !e.getFlag(MODULE_ID, ENCUMBRANCE_FLAG));
      if (effect) {
        // The GM's condition may not change MOVE itself: add the penalty, and mark it as ours.
        const has = effect.changes.some((c) => c.key === change.key && c.value === change.value);
        const changes = has ? effect.changes : [...effect.changes, change];
        await effect.update({
          changes,
          [`flags.${MODULE_ID}.${ENCUMBRANCE_FLAG}`]: level,
          // CPR's sheet reads a category for every change; CLT's effect doesn't have them.
          [`flags.${SYSTEM_ID}.changes`]: CPR.effectFlags(changes, effect.flags?.[SYSTEM_ID]?.changes)
        });
        return;
      }
    }
    const status = this.encumbranceStatus(level);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: L(status.name),
      img: status.img,
      statuses: [status.id],
      changes: status.changes,
      flags: { [MODULE_ID]: { [ENCUMBRANCE_FLAG]: level }, [SYSTEM_ID]: { changes: CPR.effectFlags(status.changes) } }
    }]);
  },

  /** Is this one of Neon At Home's effects, or another module's effect carrying its MOVE change? */
  _carriesOurChange(effect) {
    return (effect?.changes ?? []).some((c) => String(c?.value ?? "").startsWith(`${MODULE_ID}.`))
      || [...(effect?.statuses ?? [])].some((s) => Object.values(ENCUMBRANCE_STATUS).includes(s));
  },

  /**
   * GM, once per load: give CPR's bookkeeping to any effect carrying Neon At Home's change that
   * lacks it (made by 1.2.0-1.3.0 through Condition Lab or the token HUD), which breaks the sheet.
   */
  async repairEffects() {
    for (const actor of game.actors) {
      const updates = actor.effects
        .filter((e) => this._carriesOurChange(e) && CPR.needsEffectFlags(e))
        .map((e) => ({ _id: e.id, [`flags.${SYSTEM_ID}.changes`]: CPR.effectFlags(e.changes, e.flags?.[SYSTEM_ID]?.changes) }));
      if (updates.length) {
        await actor.updateEmbeddedDocuments("ActiveEffect", updates);
        console.log(`${MODULE_ID} | repaired ${updates.length} effect(s) on ${actor.name}`);
      }
    }
  },

  async _removeEncumbrance(actor, effect) {
    const cltId = effect.getFlag(CLT_ID, "conditionId");
    // Through CLT when it put it there, so its "on removal" macros and triggers run too.
    if (cltId && game.clt?.removeCondition && game.modules.get(CLT_ID)?.active) {
      await game.clt.removeCondition(effect.name, actor, { warn: false });
      if (!actor.effects.has(effect.id)) return;
    }
    await effect.delete();
  },

  /* ---------------------------------------- */
  /*  Cyberware monitor                       */
  /* ---------------------------------------- */

  /** The cyberware monitor for a character (see data/cyberware.js). */
  cyberware(actor) {
    return cyberwareMap(actor.items.map((i) => i.toObject()), Array.from(actor.system?.installedItems?.list ?? []), MODULE_ID);
  },

  /**
   * Mark a piece of cyberware working, EMP'd or broken / worn out. Offline cyberware, and anything
   * installed in it, has its effects switched off (and back on when it works again).
   * @param {string} state - "" (working), "emp" or "broken"
   */
  async setCyberState(actor, itemId, state) {
    const item = actor.items.get(itemId);
    if (!item || item.type !== "cyberware") return;
    const was = item.getFlag(MODULE_ID, "item")?.cyberState ?? "";
    if (was === state) return;
    await item.setFlag(MODULE_ID, "item", { ...(item.getFlag(MODULE_ID, "item") ?? {}), cyberState: state });
    await this.syncCyberEffects(actor);
    const key = state ? `NEONHOME.Cyber.Card.${state}` : "NEONHOME.Cyber.Card.ok";
    await ChatMessage.create({
      content: this._card("fa-solid fa-microchip", L(key, { name: esc(actor.name), item: esc(item.name) })),
      whisper: this._owners(actor),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /**
   * Switch off the effects of offline cyberware and switch back on the ones Neon At Home switched
   * off when it works again. Effects the player or GM disabled themselves are left alone.
   */
  async syncCyberEffects(actor) {
    const nodes = flatten(this.cyberware(actor).types.flatMap((t) => t.roots));
    for (const n of nodes) {
      const item = actor.items.get(n.id);
      if (!item?.effects?.size) continue;
      const updates = [];
      for (const e of item.effects) {
        const ours = !!e.getFlag(MODULE_ID, "offline");
        if (n.state && !e.disabled) updates.push({ _id: e.id, disabled: true, [`flags.${MODULE_ID}.offline`]: true });
        else if (!n.state && ours) updates.push({ _id: e.id, disabled: false, [`flags.${MODULE_ID}.-=offline`]: null });
      }
      if (updates.length) await item.updateEmbeddedDocuments("ActiveEffect", updates);
    }
  },

  /* ---------------------------------------- */
  /*  Weaponbench                             */
  /* ---------------------------------------- */

  async attach(actor, weaponId, upgradeId, fromUuid = null) {
    const weapon = actor.items.get(weaponId);
    let upgrade = fromUuid && fromUuid !== actor.uuid ? docFrom(fromUuid)?.items.get(upgradeId) : actor.items.get(upgradeId);
    if (!weapon || !upgrade) throw new Error(L("NEONHOME.Error.NotFound"));
    const free = typeof weapon.availableInstallSlots === "function" ? weapon.availableInstallSlots() : 0;
    const check = canAttach(weapon, upgrade, { free, installedElsewhere: upgrade.parent === actor && CPR.isInstalled(upgrade) });
    if (!check.ok) throw new RuleBlock(L(`NEONHOME.Bench.Reason.${check.reason}`, { name: upgrade.name }));
    if (upgrade.parent !== actor) {
      const newId = await this.transfer(actor, fromUuid, upgradeId, actor.uuid, { amount: 1, check: false });
      upgrade = actor.items.get(newId);
      if (!upgrade) throw new Error(L("NEONHOME.Error.NotFound"));
    }
    await CPR.install(weapon, [upgrade]);
  },

  async detach(actor, weaponId, upgradeId, { stow = false } = {}) {
    const weapon = actor.items.get(weaponId);
    const upgrade = actor.items.get(upgradeId);
    if (!weapon || !upgrade) return;
    if (!canDetach(upgrade, MODULE_ID)) throw new RuleBlock(L("NEONHOME.Bench.Fixed", { name: upgrade.name }));
    await CPR.uninstall(weapon, [upgrade]);
    if (stow) await this.stow(actor, upgradeId);
  },

  /** Make a custom attachment item on the character (GM, or players if the GM allows it). */
  async createAttachment(actor, data) {
    if (!game.user.isGM && !Settings.get("playerCrafting")) throw new RuleBlock(L("NEONHOME.Bench.NoCrafting"));
    const mod = (v) => ({ type: v?.override ? "override" : "modifier", value: Number(v?.value) || null, isSituational: false, onByDefault: false });
    const itemData = {
      name: data.name || L("NEONHOME.Bench.CustomName"),
      type: "itemUpgrade",
      img: data.img || "icons/svg/upgrade.svg",
      system: {
        type: data.for || "weapon",
        size: Math.max(0, Math.floor(Number(data.size) || 1)),
        description: { value: data.description ? `<p>${esc(data.description)}</p>` : "" },
        price: { market: Math.max(0, Math.floor(Number(data.price) || 0)) },
        modifiers: { attackmod: mod(data.attackmod), damage: mod(data.damage), rof: mod(data.rof), magazine: mod(data.magazine), slots: mod(data.slots) }
      },
      flags: { [MODULE_ID]: { item: { attachment: { benefits: String(data.benefits ?? ""), fixed: !!data.fixed } } } }
    };
    const [created] = await actor.createEmbeddedDocuments("Item", [itemData]);
    return created;
  },

  /* ---------------------------------------- */
  /*  Vehicle Bay                             */
  /* ---------------------------------------- */

  async addVehicle(actor, uuid) {
    const doc = docFrom(uuid);
    const isVehicle = doc?.documentName === "Item" ? doc.type === "vehicle" : doc?.documentName === "Actor" && doc !== actor && doc.type !== "container";
    if (!isVehicle) throw new Error(L("NEONHOME.Bay.NotVehicle"));
    const home = HomeStore.home(actor);
    if (home.vehicles.some((v) => v.uuid === uuid)) return;
    const slots = HomeStore.bay(actor).slots;
    const all = HomeStore.vehicles(actor);
    home.vehicles = all.map(({ uuid: u, bay, active }) => ({ uuid: u, bay, active }));
    home.vehicles.push({ uuid, bay: freeBay(all, slots), active: false });
    await this.updateHome(actor, home);
  },

  async removeVehicle(actor, uuid) {
    const home = HomeStore.home(actor);
    home.vehicles = home.vehicles.filter((v) => v.uuid !== uuid);
    await this.updateHome(actor, home);
  },

  /** Park a vehicle in a bay (swapping with whatever is there) or on the street (bay null). */
  async park(actor, uuid, bay) {
    const all = HomeStore.vehicles(actor).map(({ uuid: u, bay: b, active }) => ({ uuid: u, bay: b, active }));
    const v = all.find((x) => x.uuid === uuid);
    if (!v) return;
    const occupant = bay === null ? null : all.find((x) => x.bay === bay && x.uuid !== uuid);
    if (occupant) occupant.bay = v.bay;
    v.bay = bay;
    await this.updateHome(actor, { vehicles: all });
  },

  /** The ride the character is using: one at a time. */
  async setActive(actor, uuid) {
    const all = HomeStore.vehicles(actor).map(({ uuid: u, bay, active }) => ({ uuid: u, bay, active: u === uuid ? !active : false }));
    await this.updateHome(actor, { vehicles: all });
  },

  /* ---------------------------------------- */
  /*  Biomonitor                              */
  /* ---------------------------------------- */

  async updatePsyche(actor, mutate) {
    const psyche = deepClone(HomeStore.psyche(actor));
    mutate(psyche);
    await actor.setFlag(MODULE_ID, PSYCHE_FLAG, normalizePsyche(psyche));
  },

  async addSyndrome(actor, data) {
    await this.updatePsyche(actor, (p) => p.syndromes.push({ ...data, id: randomID(12) }));
  },

  async upgradeSyndrome(actor, id, tier) {
    await this.updatePsyche(actor, (p) => {
      const s = p.syndromes.find((x) => x.id === id);
      if (s && s.severity === "mild") s.upgradedAt = tier;
    });
  },

  async removeSyndrome(actor, id) {
    await this.updatePsyche(actor, (p) => {
      p.syndromes = p.syndromes.filter((s) => s.id !== id);
      if (p.scar === id) p.scar = "";
    });
  },

  /** Intensive Therapy: Syndromes that only linger as scars are removed and the scars reset. */
  async therapy(actor) {
    const h = CPR.humanity(actor).value;
    await this.updatePsyche(actor, (p) => {
      const state = psycheState(normalizePsyche(p), h);
      const keep = new Set(state.syndromes.filter((s) => s.active && !s.scar).map((s) => s.id));
      p.syndromes = p.syndromes.filter((s) => keep.has(s.id));
      p.scar = "";
      p.deepest = state.tier;
    });
    await ChatMessage.create({ content: this._card("fa-solid fa-couch", L("NEONHOME.Bio.TherapyCard", { name: esc(actor.name) })), speaker: ChatMessage.getSpeaker({ actor }) });
  },

  /** Spend an Inspiration: a free reroll, a loot box roll, or 2 LUCK back. */
  async spendInspiration(actor, use) {
    const psyche = HomeStore.psyche(actor);
    if (psyche.inspiration < 1) throw new RuleBlock(L("NEONHOME.Bio.NoInspiration"));
    if (use === "luck") {
      const luck = CPR.luck(actor);
      await actor.update({ "system.stats.luck.value": Math.min(luck.max, luck.value + 2) });
    }
    await this.updatePsyche(actor, (p) => {
      p.inspiration -= 1;
    });
    await ChatMessage.create({
      content: this._card("fa-solid fa-star", L(`NEONHOME.Bio.Spend.${use}Card`, { name: esc(actor.name) })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  _card(icon, html) {
    return `<div class="neon-home-chat"><header><i class="${icon}"></i> ${L("NEONHOME.Title")}</header><p>${html}</p></div>`;
  },

  /**
   * GM: after a character's Humanity changes. Catharsis takes Humanity Loss first (if the GM uses
   * that rule), and falling into a deeper Empathy tier grants Catharsis and asks for Syndromes.
   * @param {Actor} actor
   * @param {number} before - Humanity before the change
   */
  async onHumanityChanged(actor, before) {
    if (!Settings.get("syndromes")) return;
    let after = CPR.humanity(actor).value;
    const psyche = HomeStore.psyche(actor);
    let catharsis = psyche.catharsis;
    if (after < before && catharsis > 0 && Settings.get("catharsisAbsorbs")) {
      const { absorbed: wanted } = absorbLoss(before - after, catharsis);
      // Only what can come back counts: a lower maximum (new cyberware at full Humanity) caps it.
      const absorbed = wanted ? await CPR.changeHumanity(actor, wanted, L("NEONHOME.Bio.CatharsisLedger")) : 0;
      if (absorbed) {
        after += absorbed;
        catharsis -= absorbed;
        await ChatMessage.create({
          content: this._card("fa-solid fa-shield-heart", L("NEONHOME.Bio.AbsorbedCard", { name: esc(actor.name), n: absorbed, left: catharsis })),
          whisper: this._owners(actor),
          speaker: ChatMessage.getSpeaker({ actor })
        });
      }
    }
    const from = psyche.lastTier ?? tierOf(before);
    const to = tierOf(after);
    const gain = catharsisGain(from, to);
    await this.updatePsyche(actor, (p) => {
      p.catharsis = catharsis + gain;
      p.lastTier = to;
      p.deepest = Math.max(p.deepest, to);
    });
    if (to > from) {
      await ChatMessage.create({
        content: this._card("fa-solid fa-brain", L("NEONHOME.Bio.TierCard", { name: esc(actor.name), tier: L(`NEONHOME.Bio.Tier.${TIERS[to].key}`), gain })),
        whisper: this._owners(actor),
        speaker: ChatMessage.getSpeaker({ actor })
      });
    }
  },

  _owners(actor) {
    return game.users.filter((u) => u.isGM || actor.testUserPermission(u, "OWNER")).map((u) => u.id);
  },

  /** The active GM, for work only one client should do. */
  get isLeadGM() {
    return game.user.isGM && Compat.activeGM?.id === game.user.id;
  }
};
