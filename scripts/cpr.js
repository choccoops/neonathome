import { MODULE_ID, CHECKED, SYSTEM_ID } from "./constants.js";
import { Compat } from "./compat.js";

/** Operation options for writes Neon At Home has already checked against the carry rules. */
const checked = (extra = {}) => ({ ...extra, [MODULE_ID]: { [CHECKED]: true } });

const { getProperty, hasProperty, deepClone } = foundry.utils;

const EQUIPPABLE = ["armor", "clothing", "cyberdeck", "drug", "gear", "weapon"];
const STACKABLE = ["ammo", "clothing", "drug", "gear"];

/**
 * The Cyberpunk RED - CORE behaviour Neon At Home relies on, verified against the v0.92.4 source:
 * equip states, armor tracking, installing upgrades, moving items between actors with their
 * installed items, and the Humanity ledger. Each checks before use so a system update that renames
 * something degrades instead of throwing.
 */
export const CPR = {
  EQUIPPABLE,

  isEquippable(item) {
    return EQUIPPABLE.includes(item?.type);
  },

  isStackable(item) {
    return STACKABLE.includes(item?.type) || item?.type === "ammo";
  },

  /** Is the item installed in another item or in the actor (cyberware, attachments, loaded ammo)? */
  isInstalled(item) {
    try {
      return !!item?.system?.isInstalled;
    } catch {
      return false;
    }
  },

  /** Armor's tracking slot: "body", "head" or "shield". */
  armorLocation(item) {
    const s = item.system ?? {};
    if (s.isShield) return "shield";
    if (s.isHeadLocation && !s.isBodyLocation) return "head";
    return "body";
  },

  /**
   * Change an item's equip state the way the CPR character sheet does: auto-track armor when it's
   * equipped, untrack it when it comes off, and carry installed items along.
   */
  async setEquipped(actor, item, state) {
    if (!this.isEquippable(item) || item.system.equipped === state) return;
    if (item.type === "armor" && typeof actor.updateTrackedArmor === "function") {
      const loc = this.armorLocation(item);
      if (state === "equipped") await actor.updateTrackedArmor(loc, item.id);
      else if (item.system.equipped === "equipped" && getProperty(actor, `system.externalData.currentArmor${loc[0].toUpperCase()}${loc.slice(1)}.id`) === item.id) {
        await actor.updateTrackedArmor(loc);
      }
    }
    const updates = [{ _id: item.id, "system.equipped": state }];
    if (typeof item.recursiveGetAllInstalledItems === "function" && item.system.installedItems?.list?.length) {
      for (const inner of item.recursiveGetAllInstalledItems()) {
        if (this.isEquippable(inner)) updates.push({ _id: inner.id, "system.equipped": state });
      }
    }
    await actor.updateEmbeddedDocuments("Item", updates, checked());
  },

  /** Hands an actor has free (CPR counts equipped weapons' hands against 2 + bonuses). */
  canHold(actor, weapon) {
    if (typeof actor.canHoldWeapon !== "function") return true;
    try {
      return actor.canHoldWeapon(weapon);
    } catch {
      return true;
    }
  },

  /** Install items into a container item through CPR (it checks types and slots). */
  async install(container, items) {
    if (typeof container.installItems !== "function") throw new Error("This item can't take upgrades.");
    return container.installItems(items);
  },

  async uninstall(container, items) {
    if (typeof container.uninstallItems !== "function") throw new Error("This item can't take upgrades.");
    return container.uninstallItems(items, { recursive: false, unloadAmmo: true });
  },

  /**
   * Move an item (and everything installed in it) from one actor to another, as CPR does when an
   * item is dragged between sheets. Stacks can be split by amount.
   * @returns {Promise<Item|null>} the created item
   */
  async transfer(item, target, { amount = null, equipped = null } = {}) {
    const source = item.parent;
    if (!source || source === target) return null;
    if (this.isInstalled(item)) throw new Error(game.i18n.format("NEONHOME.Error.Installed", { name: item.name }));
    if (item.system?.core) throw new Error(game.i18n.format("NEONHOME.Error.Core", { name: item.name }));

    const data = item.toObject();
    delete data._id;
    const total = Number(item.system.amount ?? 1);
    const qty = amount === null ? total : Math.max(1, Math.min(total, Math.floor(amount)));
    const split = this.isStackable(item) && hasProperty(data, "system.amount") && qty < total;
    if (hasProperty(data, "system.amount")) data.system.amount = qty;
    if (this.isEquippable(item) && equipped) data.system.equipped = equipped;
    const tree = item.system.installedItems?.list?.length && typeof item.createInstalledObjectData === "function";
    if (tree && !split) {
      data.flags ??= {};
      data.flags.cprInstallTree = item.createInstalledObjectData();
    } else if (data.system.installedItems) {
      data.system.installedItems.list = [];
      data.system.installedItems.usedSlots = 0;
    }
    // Untrack worn armor before it leaves.
    if (item.type === "armor" && item.system.equipped === "equipped") await this.setEquipped(source, item, "owned");

    // createInstalled: CPR's own default, which passing options would otherwise drop.
    const [created] = await target.createEmbeddedDocuments("Item", [data], checked({ createInstalled: true }));
    if (split) {
      await item.update({ "system.amount": total - qty });
      return created ?? null;
    }
    await this.removeWithInstalled(item);
    return created ?? null;
  },

  /**
   * Delete an item from its actor with what's installed in it, as CPR does when an item leaves for
   * another actor: loaded ammo stacks stay (their rounds went with the weapon's magazine count).
   */
  async removeWithInstalled(item) {
    const source = item.parent;
    if (!source) return;
    const deleteIds = [item.id];
    if (item.system?.installedItems?.list?.length && typeof item.recursiveGetAllInstalledItems === "function") {
      for (const inner of item.recursiveGetAllInstalledItems()) {
        if (inner.type !== "ammo" || Number(inner.system.amount) === 0) deleteIds.push(inner.id);
      }
    }
    await source.deleteEmbeddedDocuments("Item", deleteIds, { unloadAmmo: false, deleteInstalled: true });
  },

  /* ---------------------------------------- */
  /*  Creating actors                         */
  /* ---------------------------------------- */

  /**
   * Cyberpunk RED 0.92's container, mook, demon and Black ICE actors don't return the new actor from
   * Actor.create (character actors do). Modules that make actors and then use them, like Item Piles
   * building its default pile actor (a container in Cyberpunk RED), break on that. Each of those
   * create() calls is wrapped to hand back the actor it made.
   */
  fixActorCreate() {
    const Doc = CONFIG.Actor?.documentClass;
    if (!Doc) return;
    for (const type of ["container", "mook", "demon", "blackIce"]) {
      // The class of an actor of that type: one in the world, or a throwaway (never saved) one.
      let cls = game.actors?.find?.((a) => a.type === type)?.constructor ?? null;
      if (!cls) {
        try {
          cls = new Doc({ name: "Neon At Home", type })?.constructor ?? null;
        } catch (err) {
          console.warn(`${MODULE_ID} | couldn't reach Cyberpunk RED's ${type} actor class`, err);
          continue;
        }
      }
      // Only Cyberpunk RED's own Actor classes, which override create themselves.
      if (!cls || cls.documentName !== "Actor" || !Object.prototype.hasOwnProperty.call(cls, "create") || cls.create[`${MODULE_ID}Returns`]) continue;
      const original = cls.create;
      const fixed = async function (data, options) {
        let made = null;
        const watch = Hooks.on("createActor", (doc, opts, userId) => {
          if (!made && userId === game.user.id && doc.type === data?.type && doc.name === data?.name) made = doc;
        });
        try {
          return (await original.call(this, data, options)) ?? made;
        } finally {
          Hooks.off("createActor", watch);
        }
      };
      fixed[`${MODULE_ID}Returns`] = true;
      cls.create = fixed;
    }
  },

  /* ---------------------------------------- */
  /*  Skill checks                            */
  /* ---------------------------------------- */

  /** A character's skill item by name (ignoring case, spaces and slashes), or null. */
  skill(actor, skillName) {
    const slug = (n) => String(n ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const want = slug(skillName);
    return actor?.items?.find((i) => i.type === "skill" && slug(i.name) === want) ?? null;
  },

  /**
   * Roll a skill check through Cyberpunk RED's own roll: its roll dialog (unless Ctrl-clicked,
   * per the system's setting), LUCK, situational modifiers, critical dice, and its roll card.
   * Without the skill it's the skill's STAT alone.
   * @param {object} [opts] - { event: the click, for the dialog; stat: when the skill is missing }
   * @returns {Promise<{total: number, html: string, critFail: boolean, critSuccess: boolean}|null>}
   *   null when the dialog was cancelled
   */
  async skillCheck(actor, skillName, { event = null, stat = "tech" } = {}) {
    const skill = this.skill(actor, skillName);
    let roll = null;
    if (skill && typeof skill.createRoll === "function") roll = skill.createRoll("skill", actor);
    else if (typeof actor.createRoll === "function") roll = actor.createRoll("stat", stat);
    if (!roll) throw new Error(game.i18n.format("NEONHOME.Error.NoSkill", { skill: skillName }));
    const ev = event ?? { type: "click", ctrlKey: false, metaKey: false };
    if (typeof roll.handleRollDialog === "function") {
      const go = await roll.handleRollDialog(ev, actor, skill);
      if (!go) return null;
    }
    if (skill && typeof skill.confirmRoll === "function") roll = await skill.confirmRoll(roll);
    await roll.roll();
    // Consume LUCK as the character sheet does.
    const luck = Number(roll.luck) || 0;
    if (luck > 0) {
      const have = Number(getProperty(actor, "system.stats.luck.value")) || 0;
      await actor.update({ "system.stats.luck.value": Math.max(0, have - luck) });
    }
    roll.entityData = { actor: actor.id, token: null, item: skill?.id ?? null };
    roll.criticalCard = typeof roll.wasCritical === "function" ? roll.wasCritical() : false;
    const html = roll.rollCard ? await Compat.renderTemplate(roll.rollCard, roll) : "";
    return {
      total: Number(roll.resultTotal) || 0,
      html,
      critFail: typeof roll.wasCritFail === "function" ? roll.wasCritFail() : false,
      critSuccess: typeof roll.wasCritSuccess === "function" ? roll.wasCritSuccess() : false,
      skill: skill?.name ?? skillName
    };
  },

  /* ---------------------------------------- */
  /*  Body                                    */
  /* ---------------------------------------- */

  hp(actor) {
    const hp = getProperty(actor, "system.derivedStats.hp") ?? {};
    return { value: Number(hp.value) || 0, max: Number(hp.max) || 0 };
  },

  humanity(actor) {
    const h = getProperty(actor, "system.derivedStats.humanity") ?? {};
    return { value: Number(h.value) || 0, max: Number(h.max) || 0 };
  },

  emp(actor) {
    const e = getProperty(actor, "system.stats.emp") ?? {};
    return { value: Number(e.value) || 0, max: Number(e.max ?? e.value) || 0 };
  },

  /**
   * Change Humanity, record it in the CPR Humanity ledger, then let CPR re-sync EMP.
   * @param {number} delta - positive restores (up to maximum), negative takes away
   */
  async changeHumanity(actor, delta, reason) {
    if (!hasProperty(actor, "system.derivedStats.humanity.value")) return 0;
    const { value, max } = this.humanity(actor);
    const next = delta > 0 ? Math.min(max, value + delta) : value + delta;
    const applied = next - value;
    if (!applied) return 0;
    const update = { "system.derivedStats.humanity.value": next };
    const ledger = getProperty(actor, "system.derivedStats.humanity.transactions");
    if (Array.isArray(ledger)) {
      const key = applied > 0 ? "CPR.ledger.increaseSentence" : "CPR.ledger.decreaseSentence";
      const sentence = game.i18n.has(key)
        ? game.i18n.format(key, { property: "humanity", amount: Math.abs(applied), total: next })
        : `humanity ${applied > 0 ? "increased" : "decreased"} by ${Math.abs(applied)} to ${next}`;
      update["system.derivedStats.humanity.transactions"] = [...deepClone(ledger), [sentence, `${reason} - ${game.user.name}`]];
    }
    await actor.update(update, { [MODULE_ID]: { humanity: true } });
    if (typeof actor.setMaxHumanity === "function") {
      try {
        await actor.setMaxHumanity();
      } catch (err) {
        console.warn(`${MODULE_ID} | setMaxHumanity failed for ${actor.name}`, err);
      }
    }
    return applied;
  },

  /**
   * CPR's bookkeeping for an effect's changes, which its character sheet reads for every effect
   * and crashes without: flags["cyberpunk-red-core"].changes.cats, a category per change.
   * Keeps any categories already there and fills in the rest (stats for system.stats.*, else skill).
   */
  effectFlags(changes, existing = {}) {
    const cats = { ...(existing?.cats ?? {}) };
    (changes ?? []).forEach((c, i) => {
      cats[i] ??= String(c?.key ?? "").startsWith("system.stats.") ? "stat" : "skill";
    });
    return { ...(existing ?? {}), cats };
  },

  /** Does this effect (document or data) have changes but not CPR's bookkeeping for them? */
  needsEffectFlags(effect) {
    const changes = effect?.changes ?? [];
    if (!changes.length) return false;
    const cats = effect?.flags?.[SYSTEM_ID]?.changes?.cats ?? null;
    return !cats || changes.some((c, i) => cats[i] === undefined);
  },

  /** LUCK value and max. */
  luck(actor) {
    const l = getProperty(actor, "system.stats.luck") ?? {};
    return { value: Number(l.value) || 0, max: Number(l.max ?? l.value) || 0 };
  },

  /** Is this a CPR container actor (shop, loot box, stash)? */
  isContainerActor(actor) {
    return actor?.type === "container";
  }
};
