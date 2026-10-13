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
    reg("cltEncumbered", {
      name: "NEONHOME.Settings.CltEncumbered.Name",
      hint: "NEONHOME.Settings.CltEncumbered.Hint",
      scope: "world",
      config: true,
      type: String,
      default: "Encumbered"
    });
    reg("cltOverloaded", {
      name: "NEONHOME.Settings.CltOverloaded.Name",
      hint: "NEONHOME.Settings.CltOverloaded.Hint",
      scope: "world",
      config: true,
      type: String,
      default: "Overloaded"
    });
    // Breaking Your Stuff: maintenance, malfunctions and dropped gear
    reg("maintenance", {
      name: "NEONHOME.Settings.Maintenance.Name",
      hint: "NEONHOME.Settings.Maintenance.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: changed
    });
    reg("maintPeriod", {
      name: "NEONHOME.Settings.MaintPeriod.Name",
      hint: "NEONHOME.Settings.MaintPeriod.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: { month: "NEONHOME.Settings.MaintPeriod.month", week: "NEONHOME.Settings.MaintPeriod.week" },
      default: "month",
      onChange: changed
    });
    reg("maintFollowHub", {
      name: "NEONHOME.Settings.MaintFollowHub.Name",
      hint: "NEONHOME.Settings.MaintFollowHub.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
    reg("malfunctionOnFumble", {
      name: "NEONHOME.Settings.MalfunctionOnFumble.Name",
      hint: "NEONHOME.Settings.MalfunctionOnFumble.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: {
        damaged: "NEONHOME.Settings.MalfunctionOnFumble.damaged",
        unmaintained: "NEONHOME.Settings.MalfunctionOnFumble.unmaintained",
        off: "NEONHOME.Settings.MalfunctionOnFumble.off"
      },
      default: "damaged"
    });
    reg("dropHeld", {
      name: "NEONHOME.Settings.DropHeld.Name",
      hint: "NEONHOME.Settings.DropHeld.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
    // the maintenance cycle: { n, hubMonth }
    reg("maintCycle", { scope: "world", config: false, type: Object, default: { n: 1, hubMonth: null }, onChange: changed });
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

  /** The maintenance cycle: { n, hubMonth }. */
  get maintCycle() {
    const raw = this.get("maintCycle") ?? {};
    const n = Math.max(1, Math.floor(Number(raw.n) || 1));
    return { n, hubMonth: Number.isFinite(Number(raw.hubMonth)) && raw.hubMonth !== null ? Number(raw.hubMonth) : null };
  },

  get customSyndromes() {
    const raw = this.get("customSyndromes");
    return Array.isArray(raw?.list) ? raw.list : [];
  }
};
