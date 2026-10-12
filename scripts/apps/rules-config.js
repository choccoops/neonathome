import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { Settings } from "../settings.js";
import { DEFAULT_CARRY_RULES, COST_KEYS, normalizeCarryRules } from "../data/capacity.js";
import { WEAPON_TYPES, ARMOR_WEIGHT_KEYS, ITEM_WEIGHT_KEYS, AMMO_WEIGHT_KEYS, EQUIPPED_FRACTIONS, normalizeWeightRules } from "../data/weight.js";
import { ARMOR_CLASSES } from "../data/item-flag.js";
import { SEVERITIES } from "../data/syndromes.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/**
 * Carry & Weight Rules (GM, from the module settings): the Armor & Carrying numbers, the weight
 * system, and the GM's own Syndromes for the Biomonitor.
 */
export class RulesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.tab = "carry";
    this.syndromes = null;
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-rules`,
    classes: ["neon-home", "nah-config", "nah-rules"],
    tag: "form",
    window: { title: "NEONHOME.Settings.Rules.Name", icon: "fa-solid fa-scale-balanced", resizable: true },
    position: { width: 720, height: 760 },
    form: { handler: RulesConfig.#onSubmit, closeOnSubmit: true },
    actions: {
      rulesTab: RulesConfig.#onTab,
      rulesReset: RulesConfig.#onReset,
      rulesAddSyndrome: RulesConfig.#onAddSyndrome,
      rulesRemoveSyndrome: RulesConfig.#onRemoveSyndrome
    }
  };

  static PARTS = {
    form: { template: `${TEMPLATE_PATH}/rules-config.hbs`, scrollable: [".nah-config-body"] }
  };

  async _prepareContext() {
    const carry = this._carry ?? Settings.carry;
    const weight = this._weight ?? Settings.weight;
    this.syndromes ??= Settings.customSyndromes.map((s) => ({ ...s }));
    const sel = (list, value, label) => list.map((v) => ({ value: v, label: label(v), selected: v === value }));
    return {
      tab: { carry: this.tab === "carry", weight: this.tab === "weight", syndromes: this.tab === "syndromes" },
      carry: {
        ...carry,
        classes: ARMOR_CLASSES.map((c) => ({ key: c, label: L(`NEONHOME.Class.${c}`), ...carry.classes[c], sheet: DEFAULT_CARRY_RULES.classes[c] })),
        costs: COST_KEYS.map((k) => ({ key: k, label: L(`NEONHOME.Category.${k}`), value: carry.costs[k], sheet: DEFAULT_CARRY_RULES.costs[k] }))
      },
      weight: {
        ...weight,
        methods: sel(["body", "custom"], weight.method, (v) => L(`NEONHOME.Rules.Method.${v}`)),
        fractions: sel(EQUIPPED_FRACTIONS, weight.equipped, (v) => L(`NEONHOME.Rules.Fraction.${String(v).replace(".", "_")}`)),
        weapons: WEAPON_TYPES.map((k) => ({ key: k, label: L(`NEONHOME.Rules.Weapon.${k}`), value: weight.weapons[k] })),
        armor: ARMOR_WEIGHT_KEYS.map((k) => ({ key: k, label: L(`NEONHOME.Class.${k}`), value: weight.armor[k] })),
        ammo: AMMO_WEIGHT_KEYS.map((k) => ({ key: k, label: L(`NEONHOME.Rules.Ammo.${k}`), value: weight.ammo[k] })),
        items: ITEM_WEIGHT_KEYS.map((k) => ({ key: k, label: L(`TYPES.Item.${k}`), value: weight.items[k] }))
      },
      syndromes: this.syndromes.map((s, i) => ({ ...s, i, severities: sel(SEVERITIES, s.severity ?? "mild", (v) => L(`NEONHOME.Severity.${v}`)) }))
    };
  }

  /** Keep what's been typed when switching tabs or adding rows. */
  #capture() {
    const fd = new Compat.FormDataExtended(this.element);
    const data = foundry.utils.expandObject(fd.object);
    this._carry = normalizeCarryRules(data.carry);
    this._weight = normalizeWeightRules(data.weight);
    this.syndromes = Object.values(data.syndromes ?? {}).map((s) => ({ name: s.name ?? "", severity: s.severity ?? "mild", summary: s.summary ?? "", stressor: s.stressor ?? "" }));
  }

  static #onTab(event, target) {
    this.#capture();
    this.tab = target.dataset.tab;
    this.render();
  }

  static #onReset(event, target) {
    this.#capture();
    if (target.dataset.which === "carry") this._carry = normalizeCarryRules({});
    else this._weight = normalizeWeightRules({});
    this.render();
  }

  static #onAddSyndrome() {
    this.#capture();
    this.syndromes.push({ name: "", severity: "mild", summary: "", stressor: "" });
    this.render();
  }

  static #onRemoveSyndrome(event, target) {
    this.#capture();
    this.syndromes.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    await game.settings.set(MODULE_ID, "carryRules", normalizeCarryRules(data.carry));
    await game.settings.set(MODULE_ID, "weightRules", normalizeWeightRules(data.weight));
    const list = Object.values(data.syndromes ?? {}).map((s) => ({ name: String(s.name ?? "").trim(), severity: SEVERITIES.includes(s.severity) ? s.severity : "mild", summary: s.summary ?? "", stressor: s.stressor ?? "" }))
      .filter((s) => s.name);
    await game.settings.set(MODULE_ID, "customSyndromes", { list });
    ui.notifications.info(L("NEONHOME.Rules.Saved"));
  }
}

