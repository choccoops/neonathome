import { MODULE_ID, SYSTEM_ID } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { MaintOps } from "./maint-ops.js";
import {
  PERK_BY_ID, STATS, normalizeRecord, points, checkPerk, dormant, blockers, perkChanges
} from "../data/perks.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/** Actor flag: the character's perk record (see data/perks.js normalizeRecord). */
export const PERKS_FLAG = "perks";
/** ActiveEffect flag: the perk an effect is (its id), and that Neon At Home switched it off. */
export const PERK_EFFECT = "perk";
export const PERK_DORMANT = "perkDormant";

/** Each branch's icon. */
export const BRANCH_ICONS = {
  general: "fa-solid fa-star", int: "fa-solid fa-brain", will: "fa-solid fa-shield-heart", cool: "fa-solid fa-glasses",
  emp: "fa-solid fa-hand-holding-heart", tech: "fa-solid fa-microchip", ref: "fa-solid fa-bolt", luck: "fa-solid fa-clover",
  body: "fa-solid fa-dumbbell", dex: "fa-solid fa-person-running", role: "fa-solid fa-id-badge", specialty: "fa-solid fa-crosshairs",
  freeCity: "fa-solid fa-city"
};

/** The CPR effect-sheet category of a change's key. */
function category(key) {
  if (key.startsWith("system.stats.")) return "stat";
  if (["bonuses.allActions", "bonuses.allActionsHands", "bonuses.allActionsSpeech"].includes(key)) return "misc";
  if (["bonuses.universalAttack", "bonuses.universalDamage", "bonuses.aimedShot", "bonuses.initiative", "bonuses.melee", "bonuses.ranged"].includes(key)) return "combat";
  return "skill";
}

/**
 * The Perk System (Chapter 16): buying perks with Perk Points, each owned perk an Active Effect on
 * the character (switched on and off from the sheet or the tree), the GM's awards, refunds and
 * confirmations, and perks switching off while a requirement isn't met.
 */
export const PerkOps = {
  record(actor) {
    return normalizeRecord(actor?.getFlag?.(MODULE_ID, PERKS_FLAG));
  },

  async _save(actor, record) {
    await actor.setFlag(MODULE_ID, PERKS_FLAG, record);
  },

  /** Start a character's record: the Role ranks they have now are their starting ranks. */
  async ensure(actor) {
    const rec = this.record(actor);
    if (rec.started) return rec;
    const next = { ...rec, started: true, baseline: { ...CPR.roles(actor), ...rec.baseline } };
    if (actor.isOwner) await this._save(actor, next);
    return next;
  },

  /** What requirements read on a character (see data/perks.js). */
  sheet(actor) {
    const stats = {};
    for (const s of STATS) stats[s] = Number(foundry.utils.getProperty(actor, `system.stats.${s}.value`)) || 0;
    const items = [...(actor?.items ?? [])];
    return {
      stats,
      empMax: CPR.emp(actor).max,
      skills: items.filter((i) => i.type === "skill").map((i) => ({ name: i.name, level: Number(i.system?.level) || 0, category: i.system?.category ?? "", type: i.system?.skillType ?? "" })),
      roles: CPR.roles(actor),
      lifestyle: MaintOps.lifestyle(actor).tier,
      weapons: items.filter((i) => i.type === "weapon").map((i) => i.system?.weaponType),
      shield: items.some((i) => i.type === "armor" && i.system?.isShield),
      cyber: items.filter((i) => i.type === "cyberware" && i.system?.isInstalled).map((i) => ({ type: i.system?.type, foundational: !!i.system?.isFoundational }))
    };
  },

  /** STATs and HP before effects: what STAT caps count from. */
  base(actor) {
    const src = actor?._source?.system ?? actor?.system ?? {};
    const stats = {};
    for (const s of STATS) stats[s] = Number(src.stats?.[s]?.value) || 0;
    const hp = foundry.utils.getProperty(actor, "system.derivedStats.hp") ?? {};
    return { stats, hp: { value: Number(hp.value) || 0, max: Number(hp.max) || 0 } };
  },

  points(actor, record = this.record(actor)) {
    return points(record, CPR.roles(actor));
  },

  inCombat(actor) {
    const c = game.combat;
    return !!c?.started && !!c.combatants?.some?.((x) => x.actor === actor || x.actorId === actor.id);
  },

  effect(actor, id) {
    return actor.effects?.find?.((e) => e.getFlag?.(MODULE_ID, PERK_EFFECT) === id) ?? null;
  },

  /* ---------------------------------------- */
  /*  Buying                                  */
  /* ---------------------------------------- */

  /**
   * Buy a perk with Perk Points: outside combat, every requirement met, the points there (p.88).
   * The GM can grant one anyway (free: it costs no points). A "+1 to one STAT" perk asks which.
   * @param {object} [opts] - { stat, force (GM: skip the requirements), free (GM: no points) }
   */
  async buy(actor, id, { stat = null, force = false, free = false } = {}) {
    const perk = PERK_BY_ID.get(id);
    if (!perk) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    const gm = game.user.isGM;
    if ((force || free) && !gm) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const record = await this.ensure(actor);
    const why = blockers(perk, this.sheet(actor), record, CPR.roles(actor), { inCombat: this.inCombat(actor) })
      .filter((b) => !(force && ["reqs", "slot", "combat", "gone"].includes(b)) && !(free && b === "points"));
    if (why.length) throw new RuleBlock(L(`NEONHOME.Perks.Block.${why[0]}`, { name: actor.name, perk: perk.name }));
    let choice = stat;
    if (perk.fx?.some((f) => f.choose) && !STATS.includes(choice)) {
      choice = await this.askStat(actor, perk);
      if (!choice) return null;
    }
    const fiend = record.owned.some((o) => o.id === "perkFiend") && id !== "perkFiend";
    const next = { ...record, owned: [...record.owned, { id, at: Date.now(), stat: choice, free }] };
    await this._save(actor, next);
    await this.sync(actor);
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-diagram-project", L(`NEONHOME.Perks.Card.bought${free ? "Free" : ""}`, {
        name: esc(actor.name), perk: esc(perk.name), cost: perk.cost, stat: choice ? L(`NEONHOME.Perks.Stat.${choice}`) : ""
      }) + (choice ? ` <small>(${L("NEONHOME.Perks.Raised", { stat: L(`NEONHOME.Perks.Stat.${choice}`) })})</small>` : "")),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    if (fiend) await this.perkFiend(actor);
    return this.record(actor);
  },

  /** Perk Fiend (p.90): each perk bought after it, flip a coin. Heads, a Perk Point; tails, 2d6 Humanity Loss. */
  async perkFiend(actor) {
    const coin = await new Roll("1d2").evaluate();
    const heads = coin.total === 1;
    let loss = 0;
    if (heads) await this.award(actor, 1, L("NEONHOME.Perks.FiendReason"), { quiet: true, gmCheck: false });
    else {
      const roll = await new Roll("2d6").evaluate();
      loss = roll.total;
      await CPR.changeHumanity(actor, -loss, L("NEONHOME.Perks.FiendReason"));
    }
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-coins", L(`NEONHOME.Perks.Fiend.${heads ? "heads" : "tails"}`, { name: esc(actor.name), n: loss })),
      rolls: [coin],
      speaker: ChatMessage.getSpeaker({ actor })
    });
    return { heads, loss };
  },

  /** Which STAT a "+1 to one STAT" perk raises (one that isn't at its cap yet). */
  async askStat(actor, perk) {
    const fx = perk.fx.find((f) => f.choose);
    const base = this.base(actor);
    const options = STATS.filter((s) => base.stats[s] < Math.min(fx.cap, 10))
      .map((s) => `<option value="${s}">${esc(L(`NEONHOME.Perks.Stat.${s}`))} (${base.stats[s]})</option>`).join("");
    if (!options) throw new RuleBlock(L("NEONHOME.Perks.AllCapped", { cap: fx.cap }));
    return Compat.DialogV2.prompt({
      window: { title: perk.name, icon: "fa-solid fa-arrow-up" },
      content: `<p>${esc(L("NEONHOME.Perks.PickStat", { cap: fx.cap }))}</p><div class="form-group"><select name="stat">${options}</select></div>`,
      classes: ["neon-home-dialog"],
      rejectClose: false,
      ok: { label: L("NEONHOME.Perks.Unlock"), callback: (event, button) => button.form.elements.stat.value }
    });
  },

  /* ---------------------------------------- */
  /*  On the sheet                            */
  /* ---------------------------------------- */

  /** Switch an owned perk's effect on or off (as the sheet's own toggle does). */
  async toggle(actor, id, on) {
    const e = this.effect(actor, id);
    if (!e) return;
    const perk = PERK_BY_ID.get(id);
    if (on && dormant(perk, this.sheet(actor), this.record(actor))) throw new RuleBlock(L("NEONHOME.Perks.Block.dormant", { perk: perk.name }));
    await e.update({ disabled: !on });
  },

  /**
   * Keep each owned perk's Active Effect in step: made if missing (named "Perk: …", its text as
   * the description), its changes (STAT boosts recounted against their caps), switched off while
   * a requirement isn't met and back on when it is (unless the player switched it off), and the
   * effects of perks no longer owned removed.
   */
  async sync(actor) {
    if (!actor?.isOwner || actor.type !== "character") return;
    const record = this.record(actor);
    const sheet = this.sheet(actor);
    const base = this.base(actor);
    const owned = new Map(record.owned.map((o) => [o.id, o]));
    // effects of perks no longer owned, and doubles (two clients syncing at once): one per perk
    const seen = new Set();
    const stale = [];
    for (const e of actor.effects) {
      const id = e.getFlag(MODULE_ID, PERK_EFFECT);
      if (!id) continue;
      if (!owned.has(id) || seen.has(id)) stale.push(e.id);
      seen.add(id);
    }
    if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
    const create = [];
    for (const [id, o] of owned) {
      const perk = PERK_BY_ID.get(id);
      // Good Shape replaces Decent Shape: they don't stack
      const replaced = record.owned.some((x) => PERK_BY_ID.get(x.id)?.replaces === id);
      const changes = replaced ? [] : perkChanges(perk, o, base);
      const asleep = dormant(perk, sheet, record);
      const data = {
        changes: changes.map((c) => ({ key: c.key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(c.value) })),
        cats: Object.fromEntries(changes.map((c, i) => [i, category(c.key)])),
        situational: Object.fromEntries(changes.map((c, i) => [i, { isSituational: c.sit, onByDefault: false }]))
      };
      const e = this.effect(actor, id);
      if (!e) {
        create.push({
          name: L("NEONHOME.Perks.EffectName", { perk: perk.name }),
          img: "icons/svg/upgrade.svg",
          description: `<p>${esc(perk.text)}</p>`,
          disabled: asleep,
          changes: data.changes,
          flags: { [MODULE_ID]: { [PERK_EFFECT]: id, ...(asleep ? { [PERK_DORMANT]: true } : {}) }, [SYSTEM_ID]: { changes: { cats: data.cats, situational: data.situational } } }
        });
        continue;
      }
      const update = {};
      const now = JSON.stringify(e.changes.map((c) => [c.key, Number(c.value)]));
      if (now !== JSON.stringify(data.changes.map((c) => [c.key, Number(c.value)]))) {
        Object.assign(update, { changes: data.changes, [`flags.${SYSTEM_ID}.changes.cats`]: data.cats, [`flags.${SYSTEM_ID}.changes.situational`]: data.situational });
      }
      const ours = !!e.getFlag(MODULE_ID, PERK_DORMANT);
      if (asleep && !e.disabled) Object.assign(update, { disabled: true, [`flags.${MODULE_ID}.${PERK_DORMANT}`]: true });
      else if (!asleep && ours) Object.assign(update, { disabled: false, [`flags.${MODULE_ID}.-=${PERK_DORMANT}`]: null });
      if (Object.keys(update).length) await e.update(update);
    }
    if (create.length) await actor.createEmbeddedDocuments("ActiveEffect", create);
  },

  /** Whose client keeps a character's perk effects in step: an active player who owns them, else the GM. */
  leads(actor) {
    const owners = game.users.filter((u) => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER"));
    if (owners.length) return owners.sort((a, b) => a.id.localeCompare(b.id))[0] === game.user;
    return game.user.isGM && game.users.activeGM === game.user;
  },

  _timers: new Map(),
  /** Sync soon (several changes in a row sync once). */
  later(actor) {
    if (!actor || actor.type !== "character" || !this.leads(actor)) return;
    clearTimeout(this._timers.get(actor.id));
    this._timers.set(actor.id, setTimeout(() => {
      this._timers.delete(actor.id);
      this.sync(actor).catch((err) => console.warn(`${MODULE_ID} | perk effects for ${actor.name}`, err));
    }, 250));
  },

  /* ---------------------------------------- */
  /*  The GM                                  */
  /* ---------------------------------------- */

  _gm() {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
  },

  /** Award (or take back) Perk Points: a big Lifepath moment, training, the GM's call. */
  async award(actor, n, reason = "", { quiet = false, gmCheck = true } = {}) {
    if (gmCheck) this._gm();
    const k = Math.trunc(Number(n) || 0);
    if (!k) return;
    const rec = await this.ensure(actor);
    await this._save(actor, { ...rec, awards: [...rec.awards, { n: k, reason: String(reason ?? ""), at: Date.now() }] });
    if (!quiet) {
      await ChatMessage.create({
        content: HomeOps._card("fa-solid fa-diagram-project", L(`NEONHOME.Perks.Card.${k > 0 ? "award" : "takeBack"}`, { name: esc(actor.name), n: Math.abs(k), reason: esc(reason) })),
        speaker: ChatMessage.getSpeaker({ actor })
      });
    }
  },

  /** Confirm (or unconfirm) what a perk asks to have been done in play. */
  async confirm(actor, id, on = true) {
    this._gm();
    const rec = await this.ensure(actor);
    const deeds = { ...rec.deeds };
    if (on) deeds[id] = true;
    else delete deeds[id];
    await this._save(actor, { ...rec, deeds });
  },

  /**
   * Take a perk away. refund: its points come back (the perk's text says so); gone: refunded and
   * gone for good (Good Person...); otherwise lost with its points (Doomed). A specialty can be
   * dropped for 1 Perk Point to free its slot (p.96): its points stay spent.
   * @param {"refund"|"gone"|"lose"|"drop"} how
   */
  async remove(actor, id, how = "refund") {
    const perk = PERK_BY_ID.get(id);
    const rec = this.record(actor);
    const owned = rec.owned.find((o) => o.id === id);
    if (!perk || !owned) return;
    if (how === "drop") {
      if (!perk.slot) return;
      if (points(rec, CPR.roles(actor)).available < 1) throw new RuleBlock(L("NEONHOME.Perks.Block.points", { name: actor.name, perk: perk.name }));
    } else this._gm();
    const cost = owned.free ? 0 : perk.cost;
    const next = { ...rec, owned: rec.owned.filter((o) => o.id !== id) };
    if (how === "lose") next.forfeit = rec.forfeit + cost;
    if (how === "drop") next.forfeit = rec.forfeit + cost + 1;
    if (how === "gone") next.gone = [...new Set([...rec.gone, id])];
    await this._save(actor, next);
    await this.sync(actor);
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-diagram-project", L(`NEONHOME.Perks.Card.${how}`, { name: esc(actor.name), perk: esc(perk.name), cost })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /** Character creation open (creation-only perks) or closed. */
  async setCreation(actor, open) {
    this._gm();
    const rec = await this.ensure(actor);
    await this._save(actor, { ...rec, creation: !!open });
  },

  /** Count Role ranks raised from now on (the ranks the character has now are where they started). */
  async rebase(actor) {
    this._gm();
    const rec = await this.ensure(actor);
    await this._save(actor, { ...rec, baseline: CPR.roles(actor) });
  },

  /** The kill count (the player keeps it; the GM counts too). */
  async setKills(actor, n) {
    const rec = await this.ensure(actor);
    await this._save(actor, { ...rec, kills: Math.max(0, Math.floor(Number(n) || 0)) });
  },

  /** For display: every requirement of a perk checked against the character. */
  check(actor, id) {
    const perk = PERK_BY_ID.get(id);
    return perk ? checkPerk(perk, this.sheet(actor), this.record(actor)) : [];
  }
};
