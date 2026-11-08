/**
 * Weapon Rebuilds that are items, and what each does in a fight, pure (tests import it). Neon
 * Combat Manager applies them on every attack (its Neon Arsenal); this module hands it the list
 * (in the `cpr-neon-combat-manager.registerRebuilds` hook) and shows each one's effect, and the
 * tier when an item covers several, on the Weaponbench.
 *
 * Our own wording of the 2070 Item Compendium (Neon Hub's Item Compendium (2070s), Attachments &
 * Mods and its Melee Rebuilds folder). Traits are Neon Combat Manager's (see its
 * scripts/arsenal/rebuilds.js): ignoreBelowSP, push { metres, maxBody }, ricochetBonus, tag.
 * Whatever needs the GM's eye stays in the item's text (a push into hard cover's extra 1d6).
 */
export const SOURCE = "Item Compendium (2070) • Attachments & Mods";

export const REBUILDS = [
  {
    id: "monoEdgeBlading",
    label: "Mono-edge Blading",
    match: "^Mono-edge Blading\\b",
    page: SOURCE,
    tiers: {
      Basic: { ignoreBelowSP: 7, tag: "Monoblade" },
      Upgraded: { ignoreBelowSP: 11, tag: "Monoblade" },
      Excellent: { ignoreBelowSP: 13, tag: "Monoblade" }
    }
  },
  {
    id: "monobladeRebuild",
    label: "Monoblade Rebuild",
    match: "^Monoblade Rebuild\\b",
    page: SOURCE,
    tiers: {
      Basic: { ignoreBelowSP: 7, tag: "Monoblade" },
      Tuned: { ignoreBelowSP: 11, tag: "Monoblade" },
      Perfected: { ignoreBelowSP: 13, tag: "Monoblade" }
    }
  },
  {
    id: "propulsionImpact",
    label: "Propulsion Impact",
    match: "^Propulsion Impact\\b",
    page: SOURCE,
    tiers: {
      Basic: { push: { metres: 2, maxBody: 13 }, tag: "Propulsion" },
      Upgraded: { push: { metres: 4 }, tag: "Propulsion" },
      Excellent: { push: { metres: 4 }, tag: "Propulsion" }
    }
  },
  {
    id: "ricochetCompensator",
    label: "Ricochet Compensator",
    match: "^Ricochet Compensator\\b",
    page: SOURCE,
    traits: { ricochetBonus: 1 }
  }
];

/** The rebuild an upgrade is, or null. */
export function rebuildFor(name) {
  return REBUILDS.find((r) => new RegExp(r.match, "i").test(String(name ?? ""))) ?? null;
}

/**
 * What the Weaponbench shows for an upgrade: { def, tier, tiers, choose, lines } (null when it
 * isn't a rebuild). `choose` is true when its name doesn't say which tier (one item for all three,
 * "Monoblade Rebuild (Basic / Perfected / Tuned)"): the bench then offers the tiers, kept in the
 * item's `rebuildTier` flag. `lines` are [{ key, data }] for NEONHOME.Bench.Rebuild.<key>.
 */
export function rebuildInfo(name, chosen = null) {
  const def = rebuildFor(name);
  if (!def) return null;
  const tiers = def.tiers ? Object.keys(def.tiers) : [];
  const named = tiers.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(String(name)));
  const choose = tiers.length > 0 && named.length !== 1;
  const tier = !tiers.length ? null : named.length === 1 ? named[0] : tiers.find((t) => t.toLowerCase() === String(chosen ?? "").toLowerCase()) ?? tiers[0];
  const t = { ...(def.traits ?? {}), ...(tier ? def.tiers[tier] : {}) };
  const lines = [];
  if (t.ignoreBelowSP) lines.push({ key: "ignoreBelowSP", data: { sp: t.ignoreBelowSP } });
  if (t.push) lines.push({ key: t.push.maxBody ? "pushBody" : "push", data: { metres: t.push.metres, body: t.push.maxBody ?? "" } });
  if (t.ricochetBonus) lines.push({ key: "ricochet", data: { value: `+${t.ricochetBonus}` } });
  return { def, tier, tiers, choose, lines };
}
