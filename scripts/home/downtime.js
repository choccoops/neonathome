import { MODULE_ID, NEON_HUB_ID } from "../constants.js";
import { Settings } from "../settings.js";
import { RuleBlock } from "./rule-block.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** Minutes in each unit of downtime (Neon Hub keeps downtime in minutes). A month is 30 days. */
export const MINUTES = { hour: 60, day: 1440, week: 10080, month: 43200 };

/**
 * What the home lets players do only in downtime (each a GM setting): the home stash, the
 * Weaponbench and armor upgrades, parking and swapping vehicles, and maintenance and repairs.
 */
export const GATES = ["stash", "bench", "bay", "maintenance"];

/** "5d 3h", "2h 30m", "45m". */
export function formatMinutes(total) {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const d = Math.floor(t / MINUTES.day);
  const h = Math.floor((t % MINUTES.day) / MINUTES.hour);
  const m = t % MINUTES.hour;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || !parts.length) parts.push(`${m}m`);
  return parts.join(" ");
}

/**
 * Downtime: whether a character is in it, how much time they have, and spending it.
 * With Neon Hub, downtime is a Neon Hub call: the characters taking part each have its time to
 * spend, and Neon At Home's actions spend it through Neon Hub's API (its log, refunds, and the
 * end-of-downtime clock). Without Neon Hub, the GM switches downtime on and off here, untimed.
 */
export const Downtime = {
  /** Neon Hub's downtime API, if it's on. */
  get hub() {
    const mod = game.modules.get(NEON_HUB_ID);
    const api = mod?.active ? mod.api?.downtime : null;
    return api && typeof api.current === "function" && typeof api.spend === "function" ? api : null;
  },

  /** The downtime going on: { source: "hub"|"gm", label, total } or null. */
  current() {
    const hub = this.hub;
    if (hub) {
      const call = hub.current();
      return call && call.status === "open" ? { source: "hub", id: call.id, label: call.label, total: call.total } : null;
    }
    return Settings.get("downtimeOn") ? { source: "gm", label: "", total: null } : null;
  },

  /**
   * Where a character stands: { active, source, label, total, spent, left }.
   * active: in downtime (with Neon Hub, taking part in its call). left is null when untimed.
   */
  state(actor) {
    const call = this.current();
    const none = { active: false, source: call?.source ?? null, label: call?.label ?? "", total: 0, spent: 0, left: 0 };
    if (!call || !actor) return none;
    if (call.source === "hub") {
      const b = this.hub.balance(actor);
      if (!b?.taking) return none;
      return { active: true, source: "hub", label: call.label, total: b.total, spent: b.spent, left: b.left };
    }
    return { active: true, source: "gm", label: "", total: null, spent: 0, left: null };
  },

  isActive(actor) {
    return this.state(actor).active;
  },

  /** Does the GM keep this to downtime? */
  gated(gate) {
    return Settings.get(`downtime${gate[0].toUpperCase()}${gate.slice(1)}`) !== false;
  },

  /** Can this user do it now (the GM always can)? */
  allows(actor, gate) {
    return game.user.isGM || !this.gated(gate) || this.isActive(actor);
  },

  /** Stop a player doing something kept to downtime when it isn't downtime. */
  check(actor, gate) {
    if (!this.allows(actor, gate)) throw new RuleBlock(L(`NEONHOME.Downtime.Only.${gate}`));
  },

  /**
   * Spend downtime on something (with Neon Hub, into its log). Nothing is spent outside a Neon Hub
   * call or for characters not taking part (the GM working on someone outside downtime).
   * @returns {Promise<object|null>} Neon Hub's log entry, to refund
   */
  async spend(actor, minutes, { label, data = null } = {}) {
    const st = this.state(actor);
    const m = Math.max(0, Math.floor(Number(minutes) || 0));
    if (st.source !== "hub" || !st.active || !m) return null;
    if (m > st.left) throw new RuleBlock(L("NEONHOME.Downtime.NotEnough", { name: actor.name, need: formatMinutes(m), left: formatMinutes(st.left) }));
    return this.hub.spend(actor, m, { label, source: MODULE_ID, data });
  },

  /** Give back what a spend took (a roll dialog cancelled after the time was taken). */
  async refund(entry) {
    if (entry?.id && typeof this.hub?.refund === "function") await this.hub.refund(entry.id);
  },

  /** A character's downtime log (Neon Hub), each entry placed in the downtime. */
  log(actor) {
    try {
      return this.hub?.log?.(actor) ?? [];
    } catch {
      return [];
    }
  },

  /** GM: open Neon Hub's Downtime window (to call it, see everyone's log, complete it). */
  open() {
    return this.hub?.open?.();
  },

  /** GM, without Neon Hub: switch downtime on or off for everyone. */
  async setOn(on) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    await game.settings.set(MODULE_ID, "downtimeOn", !!on);
  }
};
