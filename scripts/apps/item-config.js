import { MODULE_ID, TEMPLATE_PATH, ITEM_FLAG } from "../constants.js";
import { CATEGORIES, ARMOR_CLASSES, POOL_ACCEPTS, UPGRADE_LOCATIONS, UPGRADE_EFFECTS, normalizeItemFlag } from "../data/item-flag.js";
import { describeCarry, describeArmor, isSubdermalPocket } from "../data/capacity.js";
import { baseWeight } from "../data/weight.js";
import { Settings } from "../settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

const POOL_ROWS = 3;

/**
 * Neon At Home settings for one item (GM): carry slot kind and cost, weight, armor class, what
 * carry gear and armor upgrades add, and what custom attachments do.
 */
export class ItemConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static instances = new Map();

  constructor(item, options = {}) {
    super({ id: `${MODULE_ID}-item-${item.id}`, ...options });
    this.item = item;
  }

  static DEFAULT_OPTIONS = {
    classes: ["neon-home", "nah-config"],
    tag: "form",
    window: { icon: "fa-solid fa-house-chimney-window", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: ItemConfig.#onSubmit, closeOnSubmit: true }
  };

  static PARTS = {
    form: { template: `${TEMPLATE_PATH}/item-config.hbs`, scrollable: [".nah-config-body"] }
  };

  static open(item) {
    if (!game.user.isGM) return;
    const app = this.instances.get(item.uuid) ?? new this(item);
    this.instances.set(item.uuid, app);
    return app.render({ force: true });
  }

  get title() {
    return `${L("NEONHOME.Title")}: ${this.item.name}`;
  }

  async _prepareContext() {
    const item = this.item;
    const flag = normalizeItemFlag(item.getFlag(MODULE_ID, ITEM_FLAG));
    const rules = Settings.carry;
    // What the item would be without its flag (and carried), to show as the default.
    const plain = item.toObject();
    plain.flags = {};
    if (plain.system.equipped) plain.system.equipped = "carried";
    const auto = describeCarry(plain, MODULE_ID, rules, {});
    const opt = (list, selected, label) => list.map((v) => ({ value: v, label: label(v), selected: v === selected }));
    const isUpgrade = item.type === "itemUpgrade";
    const pools = (list) => Array.from({ length: POOL_ROWS }, (_, i) => ({
      i, slots: list[i]?.slots ?? "", label: list[i]?.label ?? "", accepts: opt(POOL_ACCEPTS, list[i]?.accepts ?? "any", (v) => L(`NEONHOME.Accepts.${v}`))
    }));
    return {
      item: { name: item.name, img: item.img, type: L(`TYPES.Item.${item.type}`) },
      flag,
      physical: !["skill", "role", "criticalInjury", "netarch", "program"].includes(item.type),
      categories: [{ value: "", label: L("NEONHOME.Config.Auto", { value: auto.category === "none" ? L("NEONHOME.Category.none") : L(`NEONHOME.Category.${auto.category}`) }), selected: !flag.category },
        ...opt(CATEGORIES, flag.category, (v) => L(`NEONHOME.Category.${v}`))],
      autoWeight: baseWeight({ ...plain, flags: { "mmutons-cyberpunk-red-weight-system": item.flags["mmutons-cyberpunk-red-weight-system"] } }, Settings.weight, MODULE_ID),
      isArmor: item.type === "armor",
      armorClasses: item.type === "armor" ? [{ value: "", label: L("NEONHOME.Config.Auto", { value: L(`NEONHOME.Class.${describeArmor(plain, MODULE_ID, rules).cls}`) }), selected: !flag.armorClass },
        ...opt(ARMOR_CLASSES, flag.armorClass, (v) => L(`NEONHOME.Class.${v}`))] : [],
      // Carry slots: carry gear, and the Subdermal Pocket (the only cyberware that holds things).
      isCarryGear: ["gear", "clothing"].includes(item.type) || isSubdermalPocket(item),
      isCyberware: isSubdermalPocket(item),
      carryPools: pools(flag.carry.pools),
      isArmorUpgrade: isUpgrade && item.system.type === "armor",
      isAttachment: isUpgrade && item.system.type !== "armor",
      locations: opt(UPGRADE_LOCATIONS, flag.upgrade.location, (v) => L(`NEONHOME.Location.${v}`)),
      upgradeClasses: ARMOR_CLASSES.map((c) => ({ value: c, label: L(`NEONHOME.Class.${c}`), checked: flag.upgrade.classes.includes(c) })),
      upgradeEffects: UPGRADE_EFFECTS.filter(Boolean).map((e) => ({ value: e, label: L(`NEONHOME.Upgrade.Effect.${e}`), checked: flag.upgrade.effects.includes(e) })),
      upgradePools: pools(flag.upgrade.pools),
      canCapacity: ["cyberware", "gear", "clothing"].includes(item.type)
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const f = data.flag ?? {};
    const list = (obj) => Object.values(obj ?? {}).map((p) => ({ slots: Number(p.slots) || 0, accepts: p.accepts, label: p.label ?? "" })).filter((p) => p.slots > 0);
    const checked = (obj) => Object.entries(obj ?? {}).filter(([, v]) => v).map(([k]) => k);
    const flag = normalizeItemFlag({
      category: f.category,
      slots: f.slots,
      weight: f.weight,
      capacityBonus: f.capacityBonus,
      armorClass: f.armorClass,
      carry: { pools: list(f.carry?.pools), noArmor: f.carry?.noArmor, group: f.carry?.group, conceals: f.carry?.conceals },
      upgrade: {
        key: f.upgrade?.key, location: f.upgrade?.location, classes: checked(f.upgrade?.classes), effects: checked(f.upgrade?.effects),
        requires: f.upgrade?.requires, pair: f.upgrade?.pair, pools: list(f.upgrade?.pools)
      },
      attachment: { benefits: f.attachment?.benefits, fixed: f.attachment?.fixed }
    });
    await this.item.setFlag(MODULE_ID, ITEM_FLAG, flag);
    ui.notifications.info(L("NEONHOME.Config.Saved", { name: this.item.name }));
  }

  async close(options) {
    ItemConfig.instances.delete(this.item.uuid);
    return super.close(options);
  }
}

