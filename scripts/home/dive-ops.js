import { MODULE_ID, SYSTEM_ID } from "../constants.js";
import { CPR } from "../cpr.js";
import { HomeOps, RuleBlock } from "./ops.js";
import {
  BLACK_ICE, DEMONS, RIGS, DIFFICULTIES, netActions, normalizeArch, fromCprFloors, below, floorOf, pathTo, generate, cprFloors
} from "../data/netarch.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/** Actor flag: the Deep Dive a character is on (see normalizeDive). Item flag on a NET Architecture: its full layout. */
export const DIVE_FLAG = "dive";
export const ARCH_FLAG = "arch";
/** ActiveEffect flag: when a Black ICE effect wears off (world time, seconds). */
export const DIVE_EXPIRES = "diveExpires";

const now = () => Number(game.time?.worldTime) || 0;
const roll = async (f) => (await new Roll(String(f)).evaluate());

/** Fill in a stored dive. */
export function normalizeDive(raw) {
  if (!raw || typeof raw !== "object" || !raw.arch) return null;
  return {
    arch: String(raw.arch),
    name: String(raw.name ?? ""),
    at: raw.at ? String(raw.at) : null,
    seen: Array.isArray(raw.seen) ? raw.seen.map(String) : [],
    mapped: Array.isArray(raw.mapped) ? raw.mapped.map(String) : [],
    floors: raw.floors && typeof raw.floors === "object" ? raw.floors : {},
    demon: raw.demon && typeof raw.demon === "object" ? { rez: Number(raw.demon.rez) || 0, derezzed: !!raw.demon.derezzed } : null,
    stealth: raw.stealth === "unseen" ? "unseen" : "seen",
    rig: { kind: RIGS[raw.rig?.kind] ? raw.rig.kind : null, until: raw.rig?.until ?? null },
    turn: { used: Number(raw.turn?.used) || 0, total: Number(raw.turn?.total) || 0, slowed: Number(raw.turn?.slowed) || 0, locked: !!raw.turn?.locked, slid: !!raw.turn?.slid, rezzed: Array.isArray(raw.turn?.rezzed) ? raw.turn.rezzed : [] },
    cloak: raw.cloak === null || raw.cloak === undefined ? null : Number(raw.cloak),
    virus: raw.virus ?? null,
    log: Array.isArray(raw.log) ? raw.log.slice(-40) : [],
    startedAt: Number(raw.startedAt) || 0,
    // the architecture as it was when they jacked in (a player can't always read the GM's item)
    layout: raw.layout && typeof raw.layout === "object" ? normalizeArch(raw.layout) : null
  };
}

/**
 * The Deep Dive (Chapter 10, Part 2): jacking a netrunner into a NET Architecture, moving floor to
 * floor, the NET Actions, Black ICE and Demons, Programs from their deck, stealth, and Burnout.
 * Everything a dive is rides on the netrunner (an actor flag); the architecture is a Cyberpunk RED
 * NET Architecture item, its full layout in a flag.
 */
export const DiveOps = {
  /* ---------------------------------------- */
  /*  Architectures                           */
  /* ---------------------------------------- */

  /** An architecture from its item: Neon At Home's layout, else the item's own floors. */
  arch(item) {
    if (!item) return null;
    const f = item.getFlag?.(MODULE_ID, ARCH_FLAG);
    const a = f ? normalizeArch(f) : fromCprFloors(item.system?.floors, { name: item.name });
    return { ...a, name: a.name || item.name, uuid: item.uuid, id: item.id };
  },

  /** The NET Architectures this user can see (the GM: all). */
  architectures() {
    return (game.items?.filter?.((i) => i.type === "netarch" && (game.user.isGM || i.visible)) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  },

  /** GM: a new architecture by the book's steps, saved as a Cyberpunk RED NET Architecture item. */
  async create({ difficulty = "standard", name = "", demon = "" } = {}, layout = null) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const arch = layout ? normalizeArch(layout) : generate({ difficulty, name, demon });
    const title = name || arch.name || L("NEONHOME.Dive.NewArch", { difficulty: L(`NEONHOME.Dive.Difficulty.${arch.difficulty}`) });
    const data = {
      name: title,
      type: "netarch",
      img: "icons/svg/net.svg",
      system: { floors: cprFloors(arch), description: { value: `<p>${esc(L("NEONHOME.Dive.ArchNote", { difficulty: L(`NEONHOME.Dive.Difficulty.${arch.difficulty}`), dv: DIFFICULTIES[arch.difficulty].dv }))}</p>` } },
      flags: { [MODULE_ID]: { [ARCH_FLAG]: { ...arch, name: title } } }
    };
    return Item.create(data);
  },

  /** GM: save an edited layout back to its item (and its Cyberpunk RED floors). */
  async save(item, layout) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const arch = normalizeArch(layout);
    await item.update({ "system.floors": cprFloors(arch), [`flags.${MODULE_ID}.${ARCH_FLAG}`]: arch });
    // anyone under in it now runs the new layout
    for (const a of game.actors?.filter?.((x) => x.type === "character") ?? []) {
      if (this.dive(a)?.arch === item.uuid) await a.update({ [`flags.${MODULE_ID}.${DIVE_FLAG}.layout`]: arch });
    }
  },

  /* ---------------------------------------- */
  /*  The dive                                */
  /* ---------------------------------------- */

  dive(actor) {
    return normalizeDive(actor?.getFlag?.(MODULE_ID, DIVE_FLAG));
  },

  async _save(actor, dive) {
    await actor.setFlag(MODULE_ID, DIVE_FLAG, dive);
  },

  _log(dive, text) {
    dive.log = [...dive.log, { t: now(), text: String(text).replace(/<[^>]+>/g, "") }].slice(-40);
  },

  async _card(actor, html, icon = "fa-solid fa-network-wired", rolls = []) {
    return ChatMessage.create({ content: HomeOps._card(icon, html), speaker: ChatMessage.getSpeaker({ actor }), rolls });
  },

  /** NET Actions a Turn for this runner now. */
  actions(actor, dive) {
    const { deck, rank } = CPR.netrunning(actor);
    return netActions(rank, { immersed: true, hummingbird: /hummingbird/i.test(deck?.name ?? ""), slowed: dive?.turn?.slowed ?? 0 });
  },

  /** Spend NET Actions this Turn (the GM can go past them). */
  _spend(dive, n = 1) {
    if (!game.user.isGM && dive.turn.used + n > dive.turn.total) throw new RuleBlock(L("NEONHOME.Dive.NoActions"));
    dive.turn.used += n;
  },

  /** An Immersion Cradle: +1 to every Interface Check inside the architecture. */
  _rigMods(dive) {
    return dive?.rig?.kind === "cradle" ? [{ value: 1, source: L("NEONHOME.Dive.Rig.cradle") }] : [];
  },

  _floorState(dive, key) {
    return (dive.floors[key] ??= {});
  },

  /** The Black ICE on a floor, as met (REZ, Derezzed, active, slid past). */
  _ice(dive, floor) {
    const st = this._floorState(dive, floor.key);
    if (!st.ice) st.ice = floor.ice.map((id) => ({ id, rez: BLACK_ICE[id].rez, derezzed: false, active: false }));
    return st.ice;
  },

  /** Is a floor in the way of going deeper? An unbroken Password, or Black ICE still up and not slipped past. */
  blocks(dive, floor) {
    if (!floor) return false;
    const st = dive.floors[floor.key] ?? {};
    if (floor.kind === "password") return !st.breached;
    if (floor.kind === "ice") return !st.passed && (st.ice ?? floor.ice.map(() => ({}))).some((i) => !i.derezzed);
    return false;
  },

  /**
   * Jack in to an architecture (Requirements for a Deep Dive: a deck, a cooling rig, a link). Quiet:
   * one more NET Action, Interface + 1d10 against every Watcher's (its Demon).
   * @param {object} opts - { rig: iceBath|chair|cradle, quiet, event }
   */
  async jackIn(actor, archUuid, { rig = "chair", quiet = false, event = null } = {}) {
    if (this.dive(actor)) throw new RuleBlock(L("NEONHOME.Dive.Already", { name: actor.name }));
    const item = await fromUuid(archUuid);
    const arch = this.arch(item);
    if (!arch?.floors.length) throw new RuleBlock(L("NEONHOME.Dive.NoArch"));
    const { deck, rank } = CPR.netrunning(actor);
    if (!deck && !game.user.isGM) throw new RuleBlock(L("NEONHOME.Deck.NoDeck", { name: actor.name }));
    if (!RIGS[rig] && !game.user.isGM) throw new RuleBlock(L("NEONHOME.Dive.NoRig"));
    const dive = normalizeDive({ arch: arch.uuid, name: arch.name, startedAt: now(), layout: arch });
    dive.rig = { kind: RIGS[rig] ? rig : null, until: RIGS[rig]?.minutes ? now() + RIGS[rig].minutes * 60 : null };
    dive.turn.total = this.actions(actor, dive);
    dive.demon = arch.demon ? { rez: DEMONS[arch.demon.type].rez, derezzed: false } : null;
    this._spend(dive, quiet ? 2 : 1);
    let verdict = L("NEONHOME.Dive.In", { name: esc(actor.name), arch: esc(arch.name) });
    let html = "";
    if (quiet) {
      dive.stealth = "unseen";
      if (arch.demon) {
        const me = await CPR.netCheck(actor, { ability: "cloak", event, mods: this._rigMods(dive) });
        if (!me) return null;
        const them = await roll(`1d10 + ${DEMONS[arch.demon.type].iface}`);
        html = me.html;
        if (me.total <= them.total) dive.stealth = "seen";
        verdict = L(`NEONHOME.Dive.Quiet.${dive.stealth}`, { name: esc(actor.name), arch: esc(arch.name), me: me.total, them: them.total });
      } else verdict = L("NEONHOME.Dive.Quiet.unseen", { name: esc(actor.name), arch: esc(arch.name), me: "—", them: "—" });
    }
    this._log(dive, verdict);
    await this._save(actor, dive);
    await ChatMessage.create({ content: `${html}${HomeOps._card("fa-solid fa-plug", verdict)}`, speaker: ChatMessage.getSpeaker({ actor }) });
    return dive;
  },

  /** Load the architecture a dive is in. */
  async _arch(dive) {
    const item = await fromUuid(dive.arch).catch(() => null);
    const arch = this.arch(item) ?? (dive.layout ? { ...dive.layout, name: dive.layout.name || dive.name, uuid: dive.arch } : null);
    if (!arch) throw new RuleBlock(L("NEONHOME.Dive.NoArch"));
    return arch;
  },

  /**
   * Move to a floor: one down (past nothing in the way) or back up, free. Entering a floor shows it;
   * Black ICE there is met (a Speed Check, or Interface + Cloak vs its PER if you're unseen).
   */
  async move(actor, key, { event = null } = {}) {
    const dive = this.dive(actor);
    if (!dive) throw new RuleBlock(L("NEONHOME.Dive.NotIn", { name: actor.name }));
    const arch = await this._arch(dive);
    const here = floorOf(arch, dive.at);
    // back up from the first floor: at the access point again
    if (!key) {
      if (here && !here.from) {
        dive.at = null;
        await this._save(actor, dive);
      }
      return this.dive(actor);
    }
    const to = floorOf(arch, key);
    if (!to) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    const down = below(arch, dive.at).some((f) => f.key === key);
    const up = here && here.from === key;
    if (!down && !up) throw new RuleBlock(L("NEONHOME.Dive.NotAdjacent"));
    if (down && !game.user.isGM) {
      if (this.blocks(dive, here)) throw new RuleBlock(L("NEONHOME.Dive.Blocked", { what: L(`NEONHOME.Dive.Kind.${here.kind}`) }));
      if (dive.turn.locked) throw new RuleBlock(L("NEONHOME.Dive.Locked"));
    }
    dive.at = key;
    if (!dive.seen.includes(key)) dive.seen.push(key);
    this._log(dive, L("NEONHOME.Dive.Log.move", { floor: to.depth, branch: to.branch.toUpperCase() }));
    await this._save(actor, dive);
    if (to.kind === "ice" && down) await this.meetIce(actor, to, { event });
    return this.dive(actor);
  },

  /** Meeting Black ICE on its floor, each in turn. */
  async meetIce(actor, floor, { event = null } = {}) {
    const dive = this.dive(actor);
    const ice = this._ice(dive, floor);
    const st = this._floorState(dive, floor.key);
    for (let i = 0; i < ice.length; i++) {
      const it = ice[i];
      if (it.derezzed || it.met) continue;
      const def = BLACK_ICE[it.id];
      const unseen = dive.stealth === "unseen";
      const me = await CPR.netCheck(actor, { ability: unseen ? "cloak" : "speed", event, mods: this._rigMods(dive) });
      if (!me) return;
      const them = await roll(`1d10 + ${unseen ? def.per : def.spd}`);
      it.met = true;
      const won = me.total > them.total;
      if (unseen && won) {
        st.passed = true;
        this._log(dive, L("NEONHOME.Dive.Log.unnoticed", { ice: def.name }));
      } else {
        it.active = true;
        this._log(dive, L(`NEONHOME.Dive.Log.${won ? "meetWon" : "meetLost"}`, { ice: def.name }));
      }
      await this._save(actor, dive);
      await ChatMessage.create({
        content: `${me.html}${HomeOps._card("fa-solid fa-skull", L(`NEONHOME.Dive.Meet.${unseen ? (won ? "unseen" : "spotted") : won ? "won" : "lost"}`, { name: esc(actor.name), ice: def.name, me: me.total, them: them.total }))}`,
        speaker: ChatMessage.getSpeaker({ actor }), rolls: [them]
      });
      if (!won) await this.applyIce(actor, floor.key, i);
    }
  },

  /* ---------------------------------------- */
  /*  NET Actions                             */
  /* ---------------------------------------- */

  /**
   * A NET Action against the floor the runner's on (or the ICE or Demon there).
   * @param {"breach"|"eyedee"|"control"|"pathfinder"|"slide"|"zap"|"cloak"|"virus"|"operate"} action
   * @param {object} opts - { event, target: ICE index or "demon", dv (Virus: the GM's DV), text (Virus), dir (Slide: up|down) }
   */
  async act(actor, action, { event = null, target = null, dv = null, text = "", dir = "up" } = {}) {
    const dive = this.dive(actor);
    if (!dive) throw new RuleBlock(L("NEONHOME.Dive.NotIn", { name: actor.name }));
    const arch = await this._arch(dive);
    const here = floorOf(arch, dive.at);
    const st = here ? this._floorState(dive, here.key) : {};
    const need = (cond, why) => {
      if (!cond) throw new RuleBlock(L(`NEONHOME.Dive.Need.${why}`));
    };
    const ability = { breach: "backdoor", eyedee: "eyedee", control: "control", pathfinder: "pathfinder", slide: "slide", zap: "zap", cloak: "cloak", virus: "virus" }[action];
    switch (action) {
      case "breach": need(here?.kind === "password" && !st.breached, "password"); break;
      case "eyedee": need(here?.kind === "file" && !st.eyed, "file"); break;
      case "control": need(here?.kind === "node" && !st.controlled, "node"); break;
      case "operate": need(here?.kind === "node" && st.controlled, "controlled"); break;
      case "slide": need(here?.kind === "ice" && (st.ice ?? []).some((i) => i.active && !i.derezzed) && !dive.turn.slid, "slide"); break;
      case "virus": need(here?.key === arch.virus, "bottom"); break;
      case "zap": need(target === "demon" ? dive.demon && !dive.demon.derezzed : (st.ice ?? [])[target] && !st.ice[target].derezzed, "target"); break;
      case "pathfinder": case "cloak": break;
      default: throw new Error(`Unknown NET Action: ${action}`);
    }
    if (action === "operate") {
      this._spend(dive, 1);
      this._log(dive, L("NEONHOME.Dive.Log.operate", { text: text || L("NEONHOME.Dive.Kind.node") }));
      await this._save(actor, dive);
      await this._card(actor, L("NEONHOME.Dive.Operate", { name: esc(actor.name), text: esc(text || "") }), "fa-solid fa-gamepad");
      return { ok: true };
    }
    this._spend(dive, 1);
    // Skunks still up on this floor make Sliding harder
    const mods = [...this._rigMods(dive), ...(action === "slide" ? (st.ice ?? []).filter((i) => i.id === "skunk" && !i.derezzed).map(() => ({ value: -2, source: "Skunk" })) : [])];
    const me = await CPR.netCheck(actor, { ability, event, mods });
    if (!me) {
      dive.turn.used -= 1;
      return null;
    }
    let ok = false;
    let verdict = "";
    const rolls = [];
    switch (action) {
      case "breach":
        ok = me.total > (here.dv ?? 0);
        if (ok) st.breached = true;
        verdict = L(`NEONHOME.Dive.Result.breach.${ok ? "ok" : "fail"}`, { name: esc(actor.name), dv: here.dv });
        break;
      case "eyedee":
        ok = me.total > (here.dv ?? 0);
        if (ok) st.eyed = true;
        verdict = L(`NEONHOME.Dive.Result.eyedee.${ok ? "ok" : "fail"}`, { name: esc(actor.name), dv: here.dv, file: esc(here.label || L("NEONHOME.Dive.Kind.file")) });
        break;
      case "control":
        ok = me.total > (here.dv ?? 0);
        if (ok) st.controlled = true;
        // taking a Control Node always breaks stealth
        dive.stealth = "seen";
        verdict = L(`NEONHOME.Dive.Result.control.${ok ? "ok" : "fail"}`, { name: esc(actor.name), dv: here.dv, node: esc(here.label || L("NEONHOME.Dive.Kind.node")) });
        break;
      case "pathfinder": {
        // map floors down to the roll, or to the first obstruction whose DV beats it
        const found = [];
        const walk = (key) => {
          for (const f of below(arch, key)) {
            if (f.depth > me.total) continue;
            if (!dive.mapped.includes(f.key) && !dive.seen.includes(f.key)) found.push(f.key);
            if ((f.kind === "password" || f.kind === "node" || f.kind === "file") && (f.dv ?? 0) > me.total) continue;
            walk(f.key);
          }
        };
        walk(dive.at);
        dive.mapped = [...new Set([...dive.mapped, ...found])];
        ok = true;
        verdict = L("NEONHOME.Dive.Result.pathfinder", { name: esc(actor.name), n: found.length });
        break;
      }
      case "slide": {
        const active = st.ice.map((i, n) => ({ ...i, n })).filter((i) => i.active && !i.derezzed);
        const them = await roll(`1d10 + ${Math.max(...active.map((i) => BLACK_ICE[i.id].per))}`);
        rolls.push(them);
        ok = me.total > them.total;
        dive.turn.slid = true;
        if (ok) {
          st.passed = true;
          const to = dir === "down" ? below(arch, here.key)[0] : floorOf(arch, here.from);
          dive.at = to?.key ?? null;
          if (to && !dive.seen.includes(to.key)) dive.seen.push(to.key);
        }
        verdict = L(`NEONHOME.Dive.Result.slide.${ok ? "ok" : "fail"}`, { name: esc(actor.name), them: them.total });
        break;
      }
      case "zap": {
        const isDemon = target === "demon";
        const def = isDemon ? DEMONS[arch.demon.type].iface : BLACK_ICE[st.ice[target].id].def;
        const them = await roll(`1d10 + ${def}`);
        rolls.push(them);
        ok = me.total > them.total;
        if (ok) {
          const dmg = await roll("1d6");
          rolls.push(dmg);
          const who = isDemon ? dive.demon : st.ice[target];
          who.rez = Math.max(0, who.rez - dmg.total);
          if (!who.rez) who.derezzed = true;
          verdict = L("NEONHOME.Dive.Result.zap.ok", { name: esc(actor.name), target: isDemon ? DEMONS[arch.demon.type].name : BLACK_ICE[st.ice[target].id].name, n: dmg.total, rez: who.rez });
        } else verdict = L("NEONHOME.Dive.Result.zap.fail", { name: esc(actor.name), them: them.total });
        break;
      }
      case "cloak":
        dive.cloak = me.total;
        ok = true;
        verdict = L("NEONHOME.Dive.Result.cloak", { name: esc(actor.name), n: me.total });
        break;
      case "virus": {
        const target = Number(dv) || DIFFICULTIES[arch.difficulty].dv;
        ok = me.total > target;
        if (ok) dive.virus = { text: String(text ?? ""), total: me.total };
        verdict = L(`NEONHOME.Dive.Result.virus.${ok ? "ok" : "fail"}`, { name: esc(actor.name), dv: target, text: esc(text) });
        break;
      }
    }
    this._log(dive, verdict.replace(/<[^>]+>/g, ""));
    await this._save(actor, dive);
    await ChatMessage.create({ content: `${me.html}${HomeOps._card("fa-solid fa-network-wired", verdict)}`, speaker: ChatMessage.getSpeaker({ actor }), rolls });
    return { ok, total: me.total };
  },

  /* ---------------------------------------- */
  /*  Programs                                */
  /* ---------------------------------------- */

  /** The Programs on the runner's deck (Cyberpunk RED's installed programs), with what they are. */
  programs(actor) {
    const { deck } = CPR.netrunning(actor);
    if (!deck) return [];
    return (deck.system?.installedItems?.list ?? []).map((id) => actor.items.get(id)).filter((i) => i?.type === "program");
  },

  /** Rez or Derez a Program (a NET Action; each can be activated once per Round). */
  async rez(actor, programId, on = true) {
    const dive = this.dive(actor);
    if (!dive) throw new RuleBlock(L("NEONHOME.Dive.NotIn", { name: actor.name }));
    const p = actor.items.get(programId);
    if (!p || p.type !== "program") throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    if (on && dive.turn.rezzed.includes(programId) && !game.user.isGM) throw new RuleBlock(L("NEONHOME.Dive.OncePerRound", { program: p.name }));
    this._spend(dive, 1);
    if (on) dive.turn.rezzed.push(programId);
    await p.update({ "system.isRezzed": !!on });
    this._log(dive, L(`NEONHOME.Dive.Log.${on ? "rez" : "derez"}`, { program: p.name }));
    await this._save(actor, dive);
  },

  /**
   * Attack ICE (or the Demon) with a Rezzed Program: Interface + its ATK + 1d10 vs the ICE's DEF + 1d10;
   * a hit deals the program's damage to its REZ. Attackers switch themselves off after use.
   */
  async attack(actor, programId, target, { event = null } = {}) {
    const dive = this.dive(actor);
    if (!dive) throw new RuleBlock(L("NEONHOME.Dive.NotIn", { name: actor.name }));
    const arch = await this._arch(dive);
    const p = actor.items.get(programId);
    if (!p?.system?.isRezzed) throw new RuleBlock(L("NEONHOME.Dive.NotRezzed", { program: p?.name ?? "" }));
    const st = this._floorState(dive, dive.at);
    const isDemon = target === "demon";
    const victim = isDemon ? dive.demon : (st.ice ?? [])[target];
    if (!victim || victim.derezzed) throw new RuleBlock(L("NEONHOME.Dive.Need.target"));
    this._spend(dive, 1);
    const me = await CPR.netCheck(actor, { program: p, executionType: "atk", event, mods: this._rigMods(dive) });
    if (!me) {
      dive.turn.used -= 1;
      return null;
    }
    const def = isDemon ? DEMONS[arch.demon.type].iface : BLACK_ICE[victim.id].def;
    const them = await roll(`1d10 + ${def}`);
    const rolls = [them];
    const ok = me.total > them.total;
    let verdict;
    const name = isDemon ? DEMONS[arch.demon.type].name : BLACK_ICE[victim.id].name;
    if (ok) {
      const dmg = await CPR.netCheck(actor, { program: p, executionType: "damage", event: { ctrlKey: true } });
      const n = dmg?.total ?? 0;
      if (dmg?.roll) rolls.push(dmg.roll);
      victim.rez = Math.max(0, victim.rez - n);
      if (!victim.rez) victim.derezzed = true;
      verdict = L("NEONHOME.Dive.Result.attack.ok", { name: esc(actor.name), program: esc(p.name), target: name, n, rez: victim.rez });
    } else verdict = L("NEONHOME.Dive.Result.attack.fail", { name: esc(actor.name), program: esc(p.name), target: name, them: them.total });
    if (/attacker/.test(p.system?.class ?? "")) await p.update({ "system.isRezzed": false });
    this._log(dive, verdict.replace(/<[^>]+>/g, ""));
    await this._save(actor, dive);
    await ChatMessage.create({ content: `${me.html}${HomeOps._card("fa-solid fa-burst", verdict)}`, speaker: ChatMessage.getSpeaker({ actor }), rolls });
    return { ok };
  },

  /* ---------------------------------------- */
  /*  Black ICE and Demons (the GM)           */
  /* ---------------------------------------- */

  /**
   * Black ICE on the runner's floor attacks: its ATK + 1d10 vs the runner's Interface + 1d10 (Anti-
   * Program ICE: a random Rezzed Program's DEF + 1d10). A hit applies its Effect.
   */
  async iceAttacks(actor, key, index) {
    const dive = this.dive(actor);
    if (!dive) return null;
    const arch = await this._arch(dive);
    const floor = floorOf(arch, key);
    const it = this._ice(dive, floor)[index];
    if (!it || it.derezzed) return null;
    const def = BLACK_ICE[it.id];
    const atk = await roll(`1d10 + ${def.atk}`);
    let target = null;
    let defense;
    if (def.cls === "antiProgram") {
      const rezzed = this.programs(actor).filter((p) => p.system?.isRezzed);
      target = rezzed.length ? rezzed[Math.floor(Math.random() * rezzed.length)] : null;
      defense = target ? await roll(`1d10 + ${Number(target.system?.def) || 0}`) : null;
    } else {
      const me = await CPR.netCheck(actor, { ability: "defense", event: { ctrlKey: true } });
      defense = me ? { total: me.total } : await roll("1d10");
    }
    const hit = !defense || atk.total > defense.total;
    await this._card(actor, L(`NEONHOME.Dive.IceAttack.${hit ? "hit" : "miss"}`, { ice: def.name, name: esc(actor.name), atk: atk.total, def: defense?.total ?? "—", target: esc(target?.name ?? actor.name) }), "fa-solid fa-skull", [atk]);
    if (hit) await this.applyIce(actor, key, index, { program: target });
    return { hit };
  },

  /** A Black ICE's Effect on the runner (or, for Anti-Program ICE, one of their Programs). */
  async applyIce(actor, key, index, { program = null, leaving = false } = {}) {
    const dive = this.dive(actor);
    const arch = await this._arch(dive);
    const floor = floorOf(arch, key);
    const it = this._ice(dive, floor)[index];
    const def = BLACK_ICE[it.id];
    const lines = [];
    const rolls = [];
    const programs = this.programs(actor);
    if (def.program) {
      const target = program ?? programs.filter((p) => p.system?.isRezzed)[0];
      if (target) {
        const dmg = await roll(def.program);
        rolls.push(dmg);
        const rez = Math.max(0, (Number(target.system?.rez?.value) || 0) - dmg.total);
        await target.update({ "system.rez.value": rez, ...(rez ? {} : { "system.isRezzed": false }) });
        if (!rez) await this._destroyProgram(actor, target);
        lines.push(L(`NEONHOME.Dive.Effect.program${rez ? "" : "Destroyed"}`, { program: esc(target.name), n: dmg.total }));
      } else lines.push(L("NEONHOME.Dive.Effect.noProgram"));
    }
    if (def.derezDefender) {
      const d = programs.filter((p) => p.system?.isRezzed && p.system?.class === "defender");
      if (d.length) {
        await d[0].update({ "system.isRezzed": false });
        lines.push(L("NEONHOME.Dive.Effect.derezDefender", { program: esc(d[0].name) }));
      }
    }
    if (def.brain) lines.push(await this.brain(actor, def.brain, rolls));
    if (def.destroyProgram && programs.length) {
      const victim = programs[Math.floor(Math.random() * programs.length)];
      await this._destroyProgram(actor, victim);
      lines.push(L("NEONHOME.Dive.Effect.destroyed", { program: esc(victim.name) }));
    }
    if (def.stats) {
      const n = await roll("1d6");
      rolls.push(n);
      await this._statPenalty(actor, def, n.total);
      lines.push(L("NEONHOME.Dive.Effect.stats", { stats: def.stats.map((s) => s.toUpperCase()).join(", "), n: n.total }));
    }
    const d2 = this.dive(actor);
    if (def.locks) {
      d2.turn.locked = true;
      lines.push(L("NEONHOME.Dive.Effect.locked"));
    }
    if (def.slows) {
      d2.turn.slowed += 1;
      lines.push(L("NEONHOME.Dive.Effect.slowed"));
    }
    if (def.fire) lines.push(L("NEONHOME.Dive.Effect.fire"));
    if (def.slidePenalty) lines.push(L("NEONHOME.Dive.Effect.skunk"));
    this._log(d2, `${def.name}: ${lines.join(" ").replace(/<[^>]+>/g, "")}`);
    await this._save(actor, d2);
    await this._card(actor, `<b>${def.name}</b>: ${lines.join(" ")}`, "fa-solid fa-skull-crossbones", rolls);
    // a Giant throws the runner out, through every other Rezzed ICE (not again while already on the way out)
    if (def.ejects && !leaving) await this.jackOut(actor, { unsafe: true, except: `${key}:${index}` });
  },

  /** Brain damage: straight to HP, no armor, no Critical Injuries. A Rezzed Armor program takes 4 off. */
  async brain(actor, formula, rolls = []) {
    const r = await roll(formula);
    rolls.push(r);
    const armor = this.programs(actor).some((p) => p.system?.isRezzed && /^armor$/i.test(p.name));
    const n = Math.max(0, r.total - (armor ? 4 : 0));
    const hp = CPR.hp(actor);
    await actor.update({ "system.derivedStats.hp.value": Math.max(0, hp.value - n) });
    return L(`NEONHOME.Dive.Effect.brain${armor ? "Armor" : ""}`, { n, rolled: r.total });
  },

  async _destroyProgram(actor, program) {
    const { deck } = CPR.netrunning(actor);
    if (deck && program.system?.isInstalled) await CPR.uninstall(deck, [program]);
    await HomeOps._patchFlag(program, { condition: "destroyed" });
  },

  /** INT, REF, DEX or MOVE down for an hour (world time), as an effect on the character. */
  async _statPenalty(actor, def, n) {
    const changes = def.stats.map((s) => ({ key: `system.stats.${s}.value`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(-n) }));
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: L("NEONHOME.Dive.EffectName", { ice: def.name }),
      img: "icons/svg/daze.svg",
      changes,
      duration: { seconds: 3600, startTime: now() },
      flags: { [MODULE_ID]: { [DIVE_EXPIRES]: now() + 3600 }, [SYSTEM_ID]: { changes: { cats: Object.fromEntries(changes.map((c, i) => [i, "stat"])) } } }
    }]);
  },

  /** The Demon acts: it Zaps the runner (its Interface + 1d10 vs theirs: 1d6 brain), or searches for one who's hidden. */
  async demonActs(actor, what = "zap") {
    const dive = this.dive(actor);
    if (!dive?.demon || dive.demon.derezzed) return null;
    const arch = await this._arch(dive);
    const dem = DEMONS[arch.demon.type];
    const them = await roll(`1d10 + ${dem.iface}`);
    const me = await CPR.netCheck(actor, { ability: what === "search" ? "cloak" : "defense", event: { ctrlKey: true } });
    const won = them.total > (me?.total ?? 0);
    let text;
    const rolls = [them];
    if (what === "search") {
      if (won) dive.stealth = "seen";
      text = L(`NEONHOME.Dive.Demon.${won ? "searchFound" : "searchMissed"}`, { demon: dem.name, name: esc(actor.name), them: them.total, me: me?.total ?? 0 });
      await this._save(actor, dive);
    } else {
      text = L(`NEONHOME.Dive.Demon.${won ? "zapHit" : "zapMiss"}`, { demon: dem.name, name: esc(actor.name), them: them.total, me: me?.total ?? 0 });
      if (won) text += ` ${await this.brain(actor, "1d6", rolls)}`;
    }
    await this._card(actor, text, "fa-solid fa-ghost", rolls);
    return { won };
  },

  /* ---------------------------------------- */
  /*  Turns and leaving                       */
  /* ---------------------------------------- */

  /** A new Turn: the NET Actions back, a Kraken's hold let go, Burnout past the rig's safe time. */
  async newTurn(actor) {
    const dive = this.dive(actor);
    if (!dive) return null;
    dive.turn = { used: 0, total: this.actions(actor, dive), slowed: 0, locked: false, slid: false, rezzed: [] };
    await this._save(actor, dive);
    // past the rig's safe time (or diving with no rig at all, on the GM's say-so): Burnout
    const burning = !dive.rig.kind || (dive.rig.until !== null && now() > dive.rig.until);
    if (burning) {
      const rolls = [];
      const text = await this.brain(actor, "1d6", rolls);
      await this._card(actor, L("NEONHOME.Dive.Burnout", { name: esc(actor.name) }) + ` ${text}`, "fa-solid fa-temperature-high", rolls);
    }
    return this.dive(actor);
  },

  /**
   * Jack Out. Safely (a NET Action): the architecture resets. Unsafe (ejected, out of range, the rig
   * cut out): every Rezzed enemy Black ICE met on the way out hits.
   */
  async jackOut(actor, { unsafe = false, except = null } = {}) {
    const dive = this.dive(actor);
    if (!dive) return;
    if (!unsafe && dive.turn.locked && !game.user.isGM) throw new RuleBlock(L("NEONHOME.Dive.Locked"));
    if (unsafe) {
      // every enemy Black ICE met and still Rezzed hits on the way out (ICE that never noticed a hidden runner doesn't)
      const arch = await this._arch(dive);
      const hits = [];
      for (const [key, st] of Object.entries(dive.floors)) {
        (st.ice ?? []).forEach((it, i) => {
          if (it.active && !it.derezzed && `${key}:${i}` !== except) hits.push([key, i]);
        });
      }
      for (const [key, i] of hits) {
        if (floorOf(arch, key)) await this.applyIce(actor, key, i, { leaving: true });
      }
    }
    await actor.unsetFlag(MODULE_ID, DIVE_FLAG);
    await this._card(actor, L(`NEONHOME.Dive.Out.${unsafe ? "unsafe" : "safe"}`, { name: esc(actor.name), arch: esc(dive.name) }), "fa-solid fa-plug-circle-xmark");
  },

  /** World time moved: Black ICE effects that ran their hour come off. */
  async expire() {
    const t = now();
    for (const a of game.actors?.filter?.((x) => x.type === "character") ?? []) {
      const gone = a.effects?.filter?.((e) => Number(e.getFlag?.(MODULE_ID, DIVE_EXPIRES)) && Number(e.getFlag(MODULE_ID, DIVE_EXPIRES)) <= t).map((e) => e.id) ?? [];
      if (gone.length) await a.deleteEmbeddedDocuments("ActiveEffect", gone);
    }
  },

  /** For display: the floors of an architecture this runner knows about (the GM: all). */
  known(dive, arch, gm = false) {
    return arch.floors.map((f) => ({ f, seen: gm || dive?.seen.includes(f.key), mapped: dive?.mapped.includes(f.key) }));
  },

  pathTo
};
