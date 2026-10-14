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
    reg("maintCycleMode", {
      name: "NEONHOME.Settings.MaintCycleMode.Name",
      hint: "NEONHOME.Settings.MaintCycleMode.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: {
        rent: "NEONHOME.Settings.MaintCycleMode.rent",
        month: "NEONHOME.Settings.MaintCycleMode.month",
        week: "NEONHOME.Settings.MaintCycleMode.week"
      },
      default: "rent",
      onChange: changed
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
    reg("dropCyberlimbs", {
      name: "NEONHOME.Settings.DropCyberlimbs.Name",
      hint: "NEONHOME.Settings.DropCyberlimbs.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });
    reg("downtimeTab", {
      name: "NEONHOME.Settings.DowntimeTab.Name",
      hint: "NEONHOME.Settings.DowntimeTab.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: changed
    });
    reg("salvageEra", {
      name: "NEONHOME.Settings.SalvageEra.Name",
      hint: "NEONHOME.Settings.SalvageEra.Hint",
      scope: "world",
      config: true,
      type: String,
      choices: {
        auto: "NEONHOME.Settings.SalvageEra.auto",
        2045: "NEONHOME.Settings.SalvageEra.2045",
        2070: "NEONHOME.Settings.SalvageEra.2070"
      },
      default: "auto",
      onChange: changed
    });
    // Downtime: what's kept to it, and (without Neon Hub) whether it's on
    for (const [key, name, hint] of [
      ["downtimeStash", "NEONHOME.Settings.DowntimeStash.Name", "NEONHOME.Settings.DowntimeStash.Hint"],
      ["downtimeBench", "NEONHOME.Settings.DowntimeBench.Name", "NEONHOME.Settings.DowntimeBench.Hint"],
      ["downtimeBay", "NEONHOME.Settings.DowntimeBay.Name", "NEONHOME.Settings.DowntimeBay.Hint"],
      ["downtimeMaintenance", "NEONHOME.Settings.DowntimeMaintenance.Name", "NEONHOME.Settings.DowntimeMaintenance.Hint"]
    ]) {
      reg(key, {
        name,
        hint,
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: changed
      });
    }
    reg("downtimeOn", { scope: "world", config: false, type: Boolean, default: false, onChange: (on) => {
      changed();
      Hooks.callAll(`${MODULE_ID}.downtimeSwitched`, on);
    } });
    // the GM's own maintenance counter: { n }
    reg("maintCycle", { scope: "world", config: false, type: Object, default: { n: 1 }, onChange: changed });
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

  /** The GM's own maintenance counter: { n }. */
  get maintCycle() {
    const raw = this.get("maintCycle") ?? {};
    return { n: Math.max(1, Math.floor(Number(raw.n) || 1)) };
  },

  get customSyndromes() {
    const raw = this.get("customSyndromes");
    return Array.isArray(raw?.list) ? raw.list : [];
  }
};
