import { MODULE_ID, HOME_FLAG, PSYCHE_FLAG, STASH_FLAG, EFFECT_FLAG, SYSTEM_ID } from "../constants.js";
import { Compat } from "../compat.js";
import { HomeSocket } from "../socket.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore, docFrom } from "./store.js";
import { normalizeHome, freeBay } from "../data/home.js";
import { computeLoadout, canInstallUpgrade, armorEffects } from "../data/capacity.js";
import { computeWeight } from "../data/weight.js";
import { normalizePsyche, psycheState, tierOf, catharsisGain, absorbLoss, TIERS } from "../data/syndromes.js";
import { canAttach, canDetach } from "../data/attachments.js";

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
    const carry = computeLoadout(items, Settings.carry, MODULE_ID);
    const weight = computeWeight(items, Settings.weight, { body: Number(actor.system?.stats?.body?.value) || 0, moduleId: MODULE_ID });
    return { carry, weight };
  },

  /**
   * Check the GM's carry and weight rules for a change. Blocks (throws RuleBlock) or warns.
   * Only checks when the change makes things worse.
   */
  enforce(actor, change) {
    const before = this.measure(actor);
    const after = this.measure(actor, change);
    const problems = [];
    const carryMode = Settings.get("enforceCarry");
    const overPools = (c) => c.pools.reduce((n, p) => n + Math.max(0, p.used - p.slots), 0);
    const carryOver = (c) => Math.max(0, c.used - c.capacity) + overPools(c);
    if (Settings.carry.enabled && carryMode !== "off" && carryOver(after.carry) > carryOver(before.carry)) {
      problems.push({ mode: carryMode, msg: L("NEONHOME.Loadout.OverSlots", { used: after.carry.used, capacity: after.carry.capacity }) });
    }
    const weightMode = Settings.get("enforceWeight");
    if (Settings.weight.enabled && weightMode !== "off" && after.weight.current > after.weight.max && after.weight.current > before.weight.current) {
      problems.push({ mode: weightMode, msg: L("NEONHOME.Loadout.OverWeight", { current: after.weight.current, max: after.weight.max }) });
    }
    const block = problems.find((p) => p.mode === "block");
    if (block && !game.user.isGM) throw new RuleBlock(block.msg);
    for (const p of problems) ui.notifications.warn(p.msg);
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
      if (err instanceof RuleBlock) ui.notifications.warn(err.message);
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
    if (state !== "owned") this.enforce(actor, this._changed(item, { "system.equipped": state }));
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
   * @param {object} [opts] - { amount, equipped }
   */
  async transfer(actor, fromUuid, itemId, toUuid, { amount = null, equipped = null } = {}) {
    const from = docFrom(fromUuid);
    const to = docFrom(toUuid);
    const item = from?.items?.get(itemId);
    if (!from || !to || !item) throw new Error(L("NEONHOME.Error.NotFound"));
    // Coming onto the character: check the rules as it would arrive.
    if (to === actor) {
      const arriving = item.toObject();
      arriving._id = "incoming0000000";
      if (CPR.isEquippable(item)) arriving.system.equipped = equipped ?? "carried";
      if (amount !== null && arriving.system.amount !== undefined) arriving.system.amount = amount;
      if (arriving.system.installedItems) arriving.system.installedItems.list = [];
      this.enforce(actor, arriving);
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
      const newId = await this.transfer(actor, fromUuid, upgradeId, actor.uuid, { amount: 1 });
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
      const newId = await this.transfer(actor, fromUuid, upgradeId, actor.uuid, { amount: 1 });
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
