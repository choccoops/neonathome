import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore, docFrom } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { canInstallUpgrade, armorEffects } from "../data/capacity.js";
import { computeWeight } from "../data/weight.js";
import { itemFlag } from "../data/item-flag.js";
import { DnD } from "./home-app.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

const GROUPS = ["weapon", "armor", "ammo", "gear", "other"];
const groupOf = (type) => (["weapon", "armor", "ammo"].includes(type) ? type : ["gear", "clothing", "drug", "cyberdeck"].includes(type) ? "gear" : "other");
const TYPE_ICON = {
  weapon: "fa-solid fa-gun", armor: "fa-solid fa-shield-halved", ammo: "fa-solid fa-box-archive", gear: "fa-solid fa-toolbox",
  clothing: "fa-solid fa-shirt", drug: "fa-solid fa-pills", cyberdeck: "fa-solid fa-microchip", itemUpgrade: "fa-solid fa-puzzle-piece",
  cyberware: "fa-solid fa-robot", program: "fa-solid fa-code", vehicle: "fa-solid fa-car"
};
/** Most cells drawn in the carry grid before it just says "+N". */
const MAX_CELLS = 60;

/** Ask how many of a stack to move. */
async function askAmount(item) {
  const total = Number(item.system.amount ?? 1);
  if (!CPR.isStackable(item) || total <= 1) return null;
  const value = await Compat.DialogV2.prompt({
    window: { title: L("NEONHOME.Loadout.HowMany", { name: item.name }), icon: "fa-solid fa-layer-group" },
    content: `<div class="form-group"><label>${esc(L("NEONHOME.Loadout.Amount", { max: total }))}</label><input type="number" name="amount" value="${total}" min="1" max="${total}" autofocus></div>`,
    ok: { label: L("NEONHOME.Loadout.Move"), callback: (ev, button) => Number(button.form.elements.amount.value) },
    classes: ["neon-home-dialog"],
    rejectClose: false
  });
  if (!value) return false;
  return Math.max(1, Math.min(total, Math.floor(value)));
}

export const Loadout = {
  id: "loadout",
  icon: "fa-solid fa-person-rifle",
  label: "NEONHOME.Loadout.Title",
  template: `${TEMPLATE_PATH}/loadout.hbs`,

  async prepare(app, actor) {
    const st = (app.state.loadout ??= { armor: null, store: null });
    const { carry, weight } = HomeOps.measure(actor);
    const rules = Settings.carry;
    const weightRules = Settings.weight;
    const weightOf = new Map(weight.items.map((w) => [w.id, w.total]));
    const stash = HomeStore.stash(actor);
    const vehicles = HomeStore.vehicles(actor).filter((v) => v.kind === "actor");

    // Where things are stored: the stash, or a vehicle's cargo.
    const stores = [];
    if (stash) stores.push({ uuid: stash.uuid, name: L("NEONHOME.Stash.Short"), icon: "fa-solid fa-box-archive", doc: stash });
    for (const v of vehicles) stores.push({ uuid: v.uuid, name: v.name, icon: "fa-solid fa-car", doc: v.doc });
    if (!stores.some((s) => s.uuid === st.store)) st.store = stores[0]?.uuid ?? null;
    const store = stores.find((s) => s.uuid === st.store) ?? null;

    const byId = new Map(carry.items.map((d) => [d.id, d]));
    const poolName = new Map(carry.pools.map((p) => [p.id, p.name]));
    const row = (item) => {
      const d = byId.get(item.id);
      const eq = item.system.equipped;
      return {
        id: item.id,
        owner: actor.uuid,
        name: item.name,
        img: item.img,
        icon: TYPE_ICON[item.type] ?? "fa-solid fa-cube",
        type: item.type,
        typeLabel: L(`TYPES.Item.${item.type}`),
        amount: CPR.isStackable(item) ? Number(item.system.amount ?? 1) : null,
        equippable: CPR.isEquippable(item),
        state: { owned: eq === "owned", carried: eq === "carried", equipped: eq === "equipped" },
        category: d?.category && d.category !== "none" ? L(`NEONHOME.Category.${d.category}`) : null,
        cost: d?.cost ?? 0,
        pool: d?.pool && d.pool !== "general" ? poolName.get(d.pool) : null,
        weight: weightRules.enabled ? weightOf.get(item.id) ?? 0 : null,
        attachments: (item.system.installedItems?.list ?? []).length,
        canStow: !CPR.isInstalled(item) && !item.system.core
      };
    };

    // What's on the character: on their person, or owned but not with them.
    const physical = actor.items.filter((i) => !["skill", "role", "criticalInjury", "netarch", "vehicle"].includes(i.type) && !CPR.isInstalled(i) && !i.system.core);
    const onYou = physical.filter((i) => byId.get(i.id)?.onPerson);
    const notCarried = physical.filter((i) => !byId.get(i.id)?.onPerson && i.type !== "program");
    const groups = GROUPS.map((g) => ({
      key: g,
      label: L(`NEONHOME.Loadout.Group.${g}`),
      rows: onYou.filter((i) => groupOf(i.type) === g).sort((a, b) => a.name.localeCompare(b.name)).map(row)
    })).filter((g) => g.rows.length);

    // The paper doll: worn armor, wielded weapons, worn gear.
    const armorCard = (a) => (a ? {
      id: a.id, name: a.name, img: a.img, sp: a.sp, ablation: a.ablation, penalty: a.penalty, cls: L(`NEONHOME.Class.${a.cls}`),
      upgrades: a.upgrades.length, upgradeSlots: a.upgradeSlots, upgradesUsed: a.upgradesUsed, selected: st.armor === a.id
    } : null);
    const worn = carry.armors.filter((a) => a.worn);
    const wornAt = (loc) => armorCard(worn.find((a) => a.location === loc && a.id === carry.body) ?? worn.find((a) => a.location === loc));
    const hands = actor.items.filter((i) => i.type === "weapon" && i.system.equipped === "equipped")
      .map((i) => ({ id: i.id, name: i.name, img: i.img, hands: Number(i.system.handsReq) || 0 }));
    const wornGear = carry.items.filter((d) => d.worn && d.type !== "armor").map((d) => ({
      id: d.id, name: d.name, img: d.img, gear: d.flag.carry.pools.length > 0 || d.flag.carry.conceals > 0
    }));

    // Armor upgrades for the selected armor (default: worn body armor).
    if (!carry.armors.some((a) => a.id === st.armor)) st.armor = carry.body ?? worn[0]?.id ?? carry.armors[0]?.id ?? null;
    const sel = carry.armors.find((a) => a.id === st.armor) ?? null;
    let armorPanel = null;
    if (sel) {
      const sockets = [];
      for (const u of sel.upgrades) for (let k = 0; k < Math.max(1, u.size); k++) sockets.push({ filled: true, start: k === 0, name: u.name, img: u.img, zero: u.size === 0 });
      for (let i = sel.upgradesUsed; i < sel.upgradeSlots; i++) sockets.push({ filled: false });
      const upgradeSources = [{ doc: actor, label: L("NEONHOME.Loadout.OnYou") }];
      if (stash) upgradeSources.push({ doc: stash, label: L("NEONHOME.Stash.Short") });
      const available = [];
      for (const src of upgradeSources) {
        for (const u of src.doc.items) {
          if (u.type !== "itemUpgrade" || u.system.type !== "armor" || CPR.isInstalled(u)) continue;
          const check = canInstallUpgrade(sel, u, MODULE_ID);
          available.push({
            id: u.id, owner: src.doc.uuid, name: u.name, img: u.img, size: Number(u.system.size ?? 1), from: src.label,
            ok: check.ok, reason: check.ok ? "" : L(`NEONHOME.Upgrade.Reason.${check.reason}`, { name: u.name }),
            location: L(`NEONHOME.Location.${itemFlag(u, MODULE_ID).upgrade.location}`)
          });
        }
      }
      available.sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));
      armorPanel = {
        ...armorCard(sel),
        location: L(`NEONHOME.Location.${sel.location}`),
        worn: sel.worn,
        sockets,
        installed: sel.upgrades.map((u) => ({ id: u.id, name: u.name, img: u.img, size: u.size, fixed: u.flag.attachment.fixed })),
        available,
        choices: carry.armors.map((a) => ({ id: a.id, name: a.name, selected: a.id === sel.id, worn: a.worn }))
      };
    }
    const fx = armorEffects(carry.armors);
    const effects = [
      ...fx.changes.map((c) => L("NEONHOME.Loadout.EffectChange", { label: c.label, value: c.value })),
      ...fx.notes.map((n) => L(`NEONHOME.Upgrade.Note.${n.effect}`, { value: n.value ?? "" }))
    ];

    // The carry grid.
    const general = carry.items.filter((d) => d.pool === "general").sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
    const cells = [];
    for (const d of general) for (let k = 0; k < d.cost; k++) cells.push({ cat: d.category, name: d.name, start: k === 0 });
    for (let i = cells.length; i < carry.capacity; i++) cells.push({ cat: "empty" });
    cells.forEach((c, i) => (c.over = i >= carry.capacity));
    const shown = cells.slice(0, MAX_CELLS);
    const pools = carry.pools.map((p) => {
      const pc = [];
      for (const id of p.items) {
        const d = byId.get(id);
        for (let k = 0; k < d.cost; k++) pc.push({ cat: d.category, name: d.name, start: k === 0 });
      }
      for (let i = pc.length; i < p.slots; i++) pc.push({ cat: "empty" });
      return { name: p.name, accepts: L(`NEONHOME.Accepts.${p.accepts}`), used: p.used, slots: p.slots, cells: pc };
    });

    // The store (stash or vehicle cargo).
    let storeCtx = null;
    if (store) {
      const items = store.doc.items.filter((i) => !["skill", "role", "criticalInjury"].includes(i.type) && !CPR.isInstalled(i));
      const cargo = store.doc === stash ? null : computeWeight(Array.from(store.doc.items), weightRules, {
        moduleId: MODULE_ID, vehicle: true, cargo: Number(store.doc.getFlag(MODULE_ID, "cargo")) || Number(store.doc.getFlag("mmutons-cyberpunk-red-weight-system", "vehicleCapacity")) || null
      });
      storeCtx = {
        uuid: store.uuid,
        name: store.doc.name,
        isStash: store.doc === stash,
        canOpen: store.doc.testUserPermission(game.user, "OBSERVER"),
        cargo: cargo && weightRules.enabled ? { current: cargo.current, max: cargo.max, pct: Math.min(100, cargo.pct), status: cargo.status } : null,
        rows: items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map((i) => ({
          id: i.id, owner: store.uuid, name: i.name, img: i.img, icon: TYPE_ICON[i.type] ?? "fa-solid fa-cube",
          typeLabel: L(`TYPES.Item.${i.type}`), amount: CPR.isStackable(i) ? Number(i.system.amount ?? 1) : null,
          equippable: CPR.isEquippable(i)
        }))
      };
    }

    return {
      loadout: {
        enabled: rules.enabled,
        armorClass: L(`NEONHOME.Class.${carry.armorClass}`),
        base: carry.base,
        bonuses: carry.bonuses,
        capacity: carry.capacity,
        used: carry.used,
        free: carry.free,
        over: carry.over,
        pct: carry.capacity ? Math.min(100, Math.round((carry.used / carry.capacity) * 100)) : 100,
        cells: shown,
        moreCells: cells.length - shown.length,
        pools,
        warnings: carry.warnings.map((w) => L(`NEONHOME.Loadout.Warn.${w.key}`, { name: w.name })),
        weight: weightRules.enabled ? { current: weight.current, max: weight.max, bonus: weight.bonus, pct: Math.min(100, weight.pct), status: weight.status } : null,
        doll: { head: wornAt("head"), body: wornAt("body"), shield: wornAt("shield"), hands, worn: wornGear },
        armorPanel,
        effects,
        effectsOn: Settings.get("armorEffects"),
        groups,
        notCarried: notCarried.sort((a, b) => a.name.localeCompare(b.name)).map(row),
        stores: stores.map((s) => ({ uuid: s.uuid, name: s.name, selected: s.uuid === st.store })),
        store: storeCtx,
        hasStash: !!stash
      }
    };
  },

  onRender(app, el) {
    DnD.sources(el);
    DnD.targets(el, (data, target) => Loadout.onDrop(app, data, target));
    el.querySelector("select[name=store]")?.addEventListener("change", (ev) => {
      app.state.loadout.store = ev.target.value;
      app.render();
    });
    el.querySelector("select[name=armor]")?.addEventListener("change", (ev) => {
      app.state.loadout.armor = ev.target.value;
      app.render();
    });
    const filter = el.querySelector("input[name=storeFilter]");
    filter?.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      for (const li of el.querySelectorAll(".nah-store-list > li")) li.hidden = !!q && !li.dataset.name?.toLowerCase().includes(q);
    });
  },

  /** Drops: onto the person, the store, the "not carried" shelf, a doll socket, or an upgrade socket. */
  async onDrop(app, data, target) {
    const actor = app.actor;
    if (!actor || !data) return;
    const zone = target.dataset.drop;
    // A container actor dropped by the GM on the store panel becomes the stash.
    if (data.type === "Actor" && zone === "store" && game.user.isGM) {
      const doc = await fromUuid(data.uuid);
      if (doc?.type === "container") return app.act(() => HomeOps.linkStash(actor, doc));
      return;
    }
    if (!data.neonHome || !data.itemId) return;
    const fromActor = data.owner === actor.uuid;
    const item = docFrom(data.owner)?.items?.get(data.itemId);
    if (!item) return;
    switch (zone) {
      case "person":
        if (fromActor) return app.act(() => HomeOps.equip(actor, item.id, item.system.equipped === "owned" ? "carried" : item.system.equipped));
        return Loadout.retrieve(app, item, data.owner, "carried");
      case "equip":
        if (item.type === "itemUpgrade" && item.system.type === "armor") return Loadout.install(app, item, data.owner);
        if (fromActor) return app.act(() => HomeOps.equip(actor, item.id, "equipped"));
        return Loadout.retrieve(app, item, data.owner, "equipped");
      case "owned":
        if (fromActor && CPR.isEquippable(item)) return app.act(() => HomeOps.equip(actor, item.id, "owned"));
        return;
      case "store": {
        const to = app.state.loadout.store;
        if (!to || data.owner === to) return;
        return Loadout.stow(app, item, to);
      }
      case "upgrade":
        if (item.type === "itemUpgrade") return Loadout.install(app, item, data.owner);
        return;
      default:
    }
  },

  async stow(app, item, to = null) {
    const actor = app.actor;
    const amount = await askAmount(item);
    if (amount === false) return;
    return app.act(async () => {
      if (!to) return HomeOps.stow(actor, item.id, amount);
      return HomeOps.transfer(actor, actor.uuid, item.id, to, { amount, equipped: "owned" });
    });
  },

  async retrieve(app, item, from, equipped = "carried") {
    const amount = await askAmount(item);
    if (amount === false) return;
    return app.act(() => HomeOps.retrieve(app.actor, from, item.id, amount, equipped));
  },

  async install(app, upgrade, from) {
    const armorId = app.state.loadout?.armor;
    if (!armorId) return ui.notifications.warn(L("NEONHOME.Upgrade.PickArmor"));
    return app.act(() => HomeOps.installArmorUpgrade(app.actor, armorId, upgrade.id, from));
  },

  actions: {
    loadoutEquip(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.equip(this.actor, id, target.dataset.state));
    },
    loadoutStow(event, target) {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      if (item) return Loadout.stow(this, item, this.state.loadout?.store);
    },
    loadoutRetrieve(event, target) {
      const el = target.closest("[data-item-id]");
      const item = docFrom(el.dataset.owner)?.items?.get(el.dataset.itemId);
      if (item) return Loadout.retrieve(this, item, el.dataset.owner, target.dataset.state || "carried");
    },
    loadoutCreateStash() {
      return this.act(() => HomeOps.ensureStash(this.actor));
    },
    loadoutOpenStore() {
      const doc = docFrom(this.state.loadout?.store);
      if (doc?.testUserPermission(game.user, "OBSERVER")) doc.sheet.render(true);
    },
    loadoutSelectArmor(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      if (!id) return;
      this.state.loadout.armor = id;
      this.render();
    },
    loadoutInstall(event, target) {
      const el = target.closest("[data-item-id]");
      const item = docFrom(el.dataset.owner)?.items?.get(el.dataset.itemId);
      if (item) return Loadout.install(this, item, el.dataset.owner);
    },
    loadoutUninstall(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => HomeOps.removeArmorUpgrade(this.actor, this.state.loadout.armor, id));
    }
  }
};

