import { MODULE_ID } from "./constants.js";
import { normalizeCarryRules } from "./data/capacity.js";
import { normalizeWeightRules } from "./data/weight.js";

const changed = () => Hooks.callAll(`${MODULE_ID}.rulesChanged`);

/**
 * World and client settings. The carry and weight rules are objects the GM edits in the
 * Carry & Weight Rules window (a button in the module settings).
 */
export const Settings = {
  register(RulesConfig) {
    const reg = (key, data) => game.settings.register(MODULE_ID, key, data);

    game.settings.registerMenu(MODULE_ID, "rulesMenu", {
      name: "NEONHOME.Settings.Rules.Name",
      label: "NEONHOME.Settings.Rules.Label",
      hint: "NEONHOME.Settings.Rules.Hint",
      icon: "fa-solid fa-scale-balanced",
      type: RulesConfig,
      restricted: true
    });
    reg("carryRules", { scope: "world", config: false, type: Object, default: {}, onChange: changed });
    reg("weightRules", { scope: "world", config: false, type: Object, default: {}, onChange: changed });
    reg("customSyndromes", { scope: "world", config: false, type: Object, default: { list: [] }, onChange: changed });

    reg("enforceCarry", {
      name: "NEONHOME.Settings.EnforceCarry.Name",
      hint: "NEONHOME.Settings.EnforceCarry.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: { off: "NEONHOME.Settings.Enforce.off", warn: "NEONHOME.Settings.Enforce.warn", block: "NEONHOME.Settings.Enforce.block" },
      default: "block",
      onChange: changed
    });
    reg("enforceWeight", {
      name: "NEONHOME.Settings.EnforceWeight.Name",
      hint: "NEONHOME.Settings.EnforceWeight.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: { off: "NEONHOME.Settings.Enforce.off", warn: "NEONHOME.Settings.Enforce.warn", block: "NEONHOME.Settings.Enforce.block" },
      default: "warn",
      onChange: changed
    });
    reg("armorEffects", {
      name: "NEONHOME.Settings.ArmorEffects.Name",
      hint: "NEONHOME.Settings.ArmorEffects.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: changed
    });
    reg("defaultBaySlots", {
      name: "NEONHOME.Settings.DefaultBay.Name",
      hint: "NEONHOME.Settings.DefaultBay.Hint",
      scope: "world",
      config: true,
      type: Number,
      range: { min: 0, max: 10, step: 1 },
      default: 0,
      onChange: changed
    });
    reg("playerCrafting", {
      name: "NEONHOME.Settings.PlayerCrafting.Name",
      hint: "NEONHOME.Settings.PlayerCrafting.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: changed
    });
    reg("syndromes", {
      name: "NEONHOME.Settings.Syndromes.Name",
      hint: "NEONHOME.Settings.Syndromes.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: changed
    });
    reg("catharsisAbsorbs", {
      name: "NEONHOME.Settings.CatharsisAbsorbs.Name",
      hint: "NEONHOME.Settings.CatharsisAbsorbs.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
    reg("tab", { scope: "client", config: false, type: String, default: "loadout" });
  },

  get(key) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch {
      return undefined;
    }
  },

  get carry() {
    return normalizeCarryRules(this.get("carryRules"));
  },

  get weight() {
    return normalizeWeightRules(this.get("weightRules"));
  },

  get customSyndromes() {
    const raw = this.get("customSyndromes");
    return Array.isArray(raw?.list) ? raw.list : [];
  }
};
