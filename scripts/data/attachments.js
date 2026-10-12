/**
 * Weapon attachments: what the itemUpgrades installed in a weapon do to it, worked out the way
 * Cyberpunk RED - CORE does (CPRItem.getTotalUpgradeValues): the largest override wins, otherwise
 * modifiers add up. Pure: no Foundry calls.
 */
import { int, idOf, str } from "./util.js";
import { itemFlag } from "./item-flag.js";

/** Data points an upgrade can change on a weapon, in the order the bench lists them. */
export const WEAPON_POINTS = ["attackmod", "damage", "rof", "magazine", "slots"];

/** Total of one data point across upgrades: { type: "modifier"|"override", value }. */
export function totalUpgrade(upgrades, point) {
  let sum = 0;
  let override = -100000;
  for (const u of upgrades) {
    const m = u.system?.modifiers?.[point];
    const v = m?.value;
    if (typeof v !== "number" || v === 0) continue;
    if (m.type === "override") override = Math.max(override, v);
    else sum += v;
  }
  if (override === 0 || override === -100000) return { type: "modifier", value: sum };
  return { type: "override", value: override };
}

const apply = (base, t) => (t.type === "override" ? t.value : base + t.value);

/**
 * A weapon's numbers before and after its attachments.
 * @returns {{slots, used, free, attackmod, rof, magazine, damage, rows}}
 */
export function effectiveWeapon(weapon, upgrades) {
  const s = weapon.system ?? {};
  const base = {
    attackmod: int(s.attackmod, -99, 99),
    rof: int(s.rof, 0, 99),
    magazine: int(s.magazine?.max, 0, 9999),
    slots: int(s.installedItems?.slots, 0, 99)
  };
  const rows = [];
  const out = {};
  for (const point of ["attackmod", "rof", "magazine", "slots"]) {
    const t = totalUpgrade(upgrades, point);
    out[point] = apply(base[point], t);
    rows.push({ point, base: base[point], value: out[point], changed: out[point] !== base[point], override: t.type === "override" && t.value !== 0 });
  }
  const dmg = totalUpgrade(upgrades, "damage");
  const damageBase = str(s.damage) || "—";
  const damage = dmg.type === "override" ? `${dmg.value}` : dmg.value ? `${damageBase} ${dmg.value > 0 ? "+" : "−"} ${Math.abs(dmg.value)}` : damageBase;
  rows.splice(1, 0, { point: "damage", base: damageBase, value: damage, changed: !!dmg.value, override: dmg.type === "override" });
  const used = upgrades.reduce((n, u) => n + int(u.system?.size ?? 1), 0);
  return { ...out, damage, used, free: out.slots - used, rows };
}

/**
 * The sockets drawn on the bench: one per slot, filled left to right by attachment size.
 * @returns {{index, upgradeId, start, span, over}[]}
 */
export function socketLayout(slots, upgrades) {
  const sockets = [];
  let i = 0;
  for (const u of upgrades) {
    const size = Math.max(1, int(u.system?.size ?? 1));
    for (let k = 0; k < size; k++) sockets.push({ index: i + k, upgradeId: idOf(u), start: k === 0, span: size, over: i + k >= slots });
    i += size;
  }
  for (; i < slots; i++) sockets.push({ index: i, upgradeId: null, start: true, span: 1, over: false });
  return sockets;
}

/**
 * What one attachment does, as lines for the bench.
 * @param {object} upgrade - itemUpgrade document or data
 * @param {string} moduleId
 * @param {object} [extra] - { effects: [{label, value}] } from its Active Effects
 * @returns {{kind, point?, value?, text?}[]}
 */
export function benefits(upgrade, moduleId, extra = {}) {
  const lines = [];
  const mods = upgrade.system?.modifiers ?? {};
  for (const point of WEAPON_POINTS) {
    const m = mods[point];
    if (typeof m?.value !== "number" || m.value === 0) continue;
    lines.push({ kind: m.type === "override" ? "override" : "modifier", point, value: m.value, situational: !!m.isSituational });
  }
  if (mods.secondaryWeapon?.configured) {
    const s = upgrade.system ?? {};
    lines.push({ kind: "secondary", weaponType: s.weaponType ?? "", damage: s.damage ?? "", rof: int(s.rof), magazine: int(s.magazine?.max) });
  }
  for (const e of extra.effects ?? []) lines.push({ kind: "effect", label: e.label, value: e.value });
  for (const text of itemFlag(upgrade, moduleId).attachment.benefits.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)) {
    lines.push({ kind: "custom", text });
  }
  return lines;
}

/**
 * Can this attachment go on this weapon?
 * @returns {{ok: boolean, reason: ""|"type"|"slots"|"installed"}}
 */
export function canAttach(weapon, upgrade, { installedElsewhere = false, free = 0 } = {}) {
  if (upgrade.type !== "itemUpgrade" || upgrade.system?.type !== weapon.type) return { ok: false, reason: "type" };
  if (installedElsewhere) return { ok: false, reason: "installed" };
  if (int(upgrade.system?.size ?? 1) > free) return { ok: false, reason: "slots" };
  return { ok: true, reason: "" };
}

/** Can this attachment be taken off? Attachments marked fixed stay on. */
export function canDetach(upgrade, moduleId) {
  return !itemFlag(upgrade, moduleId).attachment.fixed;
}
