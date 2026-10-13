import { MODULE_ID, NEON_HUB_ID, ITEM_PILES_ID, CHECKED } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { itemFlag } from "../data/item-flag.js";
import { traumaMap, placeInjury } from "../data/injuries.js";
import {
  MALFUNCTIONS, DURATIONS, maintenanceList, flattenList, lifestyleTier, rolesOf,
  malfunctionResult, tableOf, fieldExpertise
} from "../data/maintenance.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/** DV of the check to tell whether gear is Damaged (Breaking Your Stuff, p.2). */
export const INSPECT_DV = 13;

/**
 * Breaking Your Stuff: maintaining gear, inspecting it, repairing it, jury-rigging malfunctions,
 * malfunctions themselves (on a fumble or the GM's call), the maintenance cycle, and dropping
 * what a lost hand was holding (through Item Piles when it's there).
 */
export const MaintOps = {
  /** Neon Hub's API, when it's on and can tell a character's rent month. */
  get hub() {
    const mod = game.modules.get(NEON_HUB_ID);
    return mod?.active && typeof mod.api?.lifestyleBill === "function" ? mod.api : null;
  },

  /**
   * How maintenance months are kept: "rent" (Neon Hub's Rent Day: each character's calendar, or its
   * month counter without calendars), else "month" or "week" counted here, started by the GM.
   */
  get mode() {
    const m = Settings.get("maintCycleMode");
    if (m === "month" || m === "week") return m;
    return this.hub ? "rent" : "month";
  },

  /**
   * A character's maintenance cycle: { scheme, n, label, next, calendar }.
   * With Neon Hub's calendars, it's their calendar's rent month (it starts on Rent Day, as their
   * Lifestyle bill does); without calendars, Neon Hub's month counter; otherwise the GM's counter.
   */
  async cycleFor(actor) {
    if (this.mode === "rent") {
      try {
        const billing = (await this.hub.lifestyleBill(actor))?.billing;
        const n = Number(billing?.period);
        if (billing && Number.isFinite(n)) {
          const cal = billing.mode === "calendar" && billing.calendar ? billing.calendar : null;
          return {
            scheme: cal ? "cal" : "hub",
            n,
            label: String(billing.label ?? ""),
            next: cal && billing.next ? { days: Number(billing.next.days) || 0, today: !!billing.next.today } : null,
            calendar: cal ? { id: cal.id, name: cal.name } : null
          };
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | couldn't read ${actor.name}'s rent month from Neon Hub`, err);
      }
    }
    const n = Settings.maintCycle.n;
    return { scheme: "own", n, label: L(`NEONHOME.Maint.Cycle.${this.mode === "week" ? "week" : "month"}`, { n }), next: null, calendar: null };
  },

  /** World time in seconds, for how long malfunctions last. */
  now() {
    return Number(game.time?.worldTime) || 0;
  },

  /**
   * A character's Lifestyle tier for maintenance (0 none, 1 Kibble ... 4 Fresh Food) and where it
   * comes from: the GM's override, their Neon Hub lifestyle package (2045 or 2070), or the sheet.
   */
  lifestyle(actor) {
    const override = actor.getFlag(MODULE_ID, "maint")?.lifestyle;
    if (override !== undefined && override !== null && override !== "" && Number.isFinite(Number(override))) {
      return { tier: Math.max(0, Math.min(4, Math.floor(Number(override)))), source: "gm" };
    }
    const items = actor.items.map((i) => i.toObject());
    const hub = items.some((i) => i.flags?.[NEON_HUB_ID]?.lifestyle?.category === "lifestyle" && i.system?.equipped === "equipped");
    return { tier: lifestyleTier(items, actor.system, NEON_HUB_ID), source: hub ? "hub" : "sheet" };
  },

  /** GM: set (or with null, clear) a character's Lifestyle tier for maintenance. */
  async setLifestyle(actor, tier) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const value = tier === null || tier === "" ? null : Math.max(0, Math.min(4, Math.floor(Number(tier) || 0)));
    await actor.setFlag(MODULE_ID, "maint", { ...(actor.getFlag(MODULE_ID, "maint") ?? {}), lifestyle: value });
  },

  /** Everything the character owns that needs looking after, as trees (see data/maintenance.js). */
  async list(actor, cycle = null) {
    cycle ??= await this.cycleFor(actor);
    const items = actor.items.map((i) => i.toObject());
    return maintenanceList(items, {
      moduleId: MODULE_ID,
      cycle,
      lifestyle: this.lifestyle(actor).tier,
      roles: rolesOf(items),
      now: this.now()
    });
  },

  async entry(actor, itemId, cycle = null) {
    return flattenList(await this.list(actor, cycle)).find((e) => e.id === itemId) ?? null;
  },

  /* ---------------------------------------- */
  /*  Checks                                  */
  /* ---------------------------------------- */

  /**
   * A check on a piece of gear, rolled with Cyberpunk RED's skill roll:
   *  - maintain: the gear's maintenance skill against its DV. Success: maintained this cycle, no
   *    longer Damaged, no more malfunction. Failure: start over (the time is lost).
   *  - inspect: DV13, to tell whether it's Damaged.
   *  - repair: a Destroyed item, against the DV the GM sets (the gear's maintenance DV by default).
   *  - rig: a Tech's jury rig (Field Expertise) against the maintenance DV: the malfunction holds off
   *    for 10 minutes per point of Field Expertise.
   * @param {object} opts - { mode, mechanic (who does the work, default the owner), event, dv }
   */
  async check(actor, itemId, { mode = "maintain", mechanic = null, event = null, dv = null } = {}) {
    const item = actor.items.get(itemId);
    const cycle = await this.cycleFor(actor);
    const e = await this.entry(actor, itemId, cycle);
    if (!item || !e) return null;
    const who = mechanic ?? actor;
    const flag = itemFlag(item.toObject(), MODULE_ID);
    let rig = 0;
    if (mode === "rig") {
      rig = fieldExpertise(who.items.map((i) => i.toObject()));
      if (!rig) throw new RuleBlock(L("NEONHOME.Maint.NoExpertise", { name: esc(who.name) }));
      if (!e.malfunction) return null;
    }
    if (mode === "repair") {
      if (flag.condition === "dbr") throw new RuleBlock(L("NEONHOME.Maint.BeyondRepair", { item: esc(item.name) }));
      if (flag.condition !== "destroyed") return null;
    }
    const target = mode === "inspect" ? INSPECT_DV : Math.max(1, Math.floor(Number(dv) || e.dv));
    const res = await CPR.skillCheck(who, e.skill, { event });
    if (!res) return null;
    const ok = res.total >= target;
    let outcome = `${mode}.${ok ? "ok" : "fail"}`;
    if (ok) {
      switch (mode) {
        case "maintain": {
          const patch = { maintained: { scheme: cycle.scheme, n: cycle.n }, malfunction: null };
          if (flag.condition === "damaged") {
            Object.assign(patch, { condition: "", hidden: false, cause: "" });
            outcome = "maintain.fixed";
          }
          await HomeOps._patchFlag(item, patch);
          break;
        }
        case "inspect":
          if (flag.condition === "damaged") {
            await HomeOps._patchFlag(item, { hidden: false });
            outcome = "inspect.damaged";
          }
          break;
        case "repair":
          await HomeOps._patchFlag(item, { condition: "", hidden: false, cause: "", malfunction: null });
          await HomeOps.syncOfflineEffects(actor);
          break;
        case "rig":
          await HomeOps._patchFlag(item, { malfunction: { ...flag.malfunction, rigUntil: this.now() + rig * 600, rigMinutes: rig * 10 } });
          break;
      }
    }
    const verdict = L(`NEONHOME.Maint.Result.${outcome}`, {
      name: esc(who.name),
      owner: esc(actor.name),
      item: esc(item.name),
      minutes: rig * 10,
      time: L(`NEONHOME.Maint.Time.${e.time}`)
    });
    await this._post(who, res.html, {
      icon: { maintain: "fa-solid fa-screwdriver-wrench", inspect: "fa-solid fa-magnifying-glass", repair: "fa-solid fa-toolbox", rig: "fa-solid fa-bolt-lightning" }[mode],
      title: L(`NEONHOME.Maint.Check.${mode}`, { item: esc(item.name) }),
      dv: target,
      total: res.total,
      ok,
      verdict
    });
    return { ok, total: res.total, outcome };
  },

  /** Post a roll card with Neon At Home's verdict under it, in the user's roll mode. */
  async _post(actor, rollHtml, { icon, title, dv, total, ok, verdict }) {
    const content = `${rollHtml}<div class="neon-home-chat nah-maint-verdict ${ok ? "is-ok" : "is-fail"}">`
      + `<header><i class="${icon}"></i> ${title}</header>`
      + `<p class="nah-maint-dv">${esc(L("NEONHOME.Maint.VsDV", { total, dv }))}</p><p>${verdict}</p></div>`;
    const data = { content, speaker: ChatMessage.getSpeaker({ actor }) };
    if (typeof ChatMessage.applyRollMode === "function") ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    return ChatMessage.create(data);
  },

  /* ---------------------------------------- */
  /*  Malfunctions                            */
  /* ---------------------------------------- */

  /** A world RollTable the GM imported (and maybe edited) for a malfunction table, if any. */
  worldTable(key) {
    return game.tables?.find?.((t) => t.getFlag?.(MODULE_ID, "malfunction") === key) ?? null;
  },

  /** One malfunction: the module's summary, or the text of the GM's world table for that roll. */
  result(table, roll) {
    const res = malfunctionResult(table, roll);
    if (!res) return null;
    const world = this.worldTable(table);
    const row = world?.results?.find?.((r) => r.range?.[0] <= roll && roll <= r.range?.[1]);
    const text = row ? String(row.description ?? row.text ?? row.name ?? "") : "";
    return { ...res, text: text || res.text, custom: !!text };
  },

  /**
   * A malfunction: roll 1d6 on the item's table (or one the GM picks), keep it on the item for as
   * long as it lasts, and post it. Anyone who can change the item can do this (a fumble rolls it on
   * the roller's client); the GM's buttons on the card do what Neon At Home can do about it.
   * @param {object} [opts] - { table, reason: "gm" | "fumble" }
   */
  async malfunction(actor, itemId, { table = null, reason = "gm" } = {}) {
    const item = actor.items.get(itemId);
    if (!item) return null;
    const key = MALFUNCTIONS[table] ? table : tableOf(item.toObject(), MODULE_ID);
    const roll = await new Roll("1d6").evaluate();
    const n = Math.max(1, Math.min(6, roll.total));
    const res = this.result(key, n);
    const seconds = DURATIONS[res.duration];
    const now = this.now();
    if (res.duration !== "now") {
      await HomeOps._patchFlag(item, { malfunction: { table: key, roll: n, at: now, until: seconds ? now + seconds : null, rigUntil: null, rigMinutes: 0 } });
    }
    const action = this.actionFor(item, key, res.action);
    const content = `<div class="neon-home-chat nah-malfunction">`
      + `<header><i class="fa-solid fa-triangle-exclamation"></i> ${L("NEONHOME.Malfunction.Title", { item: esc(item.name) })}</header>`
      + `<p class="nah-malf-why">${L(`NEONHOME.Malfunction.Reason.${reason}`, { name: esc(actor.name), item: esc(item.name) })}</p>`
      + `<p class="nah-malf-table">${esc(L(`NEONHOME.Malfunction.Table.${key}`))} · ${n}</p>`
      + `<p class="nah-malf-text">${esc(res.text)}</p>`
      + `<p class="nah-malf-dur"><i class="fa-regular fa-clock"></i> ${esc(L(`NEONHOME.Malfunction.Duration.${res.duration}`))}`
      + ` · <span class="nah-malf-src">${esc(L("NEONHOME.Malfunction.Source", { page: res.page }))}</span></p>`
      + (action ? `<p class="nah-malf-actions"><button type="button" data-nah-malf="${action}"><i class="fa-solid fa-hand"></i> ${esc(L(`NEONHOME.Malfunction.Action.${action}`))}</button></p>` : "")
      + `</div>`;
    await ChatMessage.create({
      content,
      rolls: [roll],
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { malfunction: { actor: actor.uuid, item: item.id, action, table: key, roll: n } } }
    });
    return { table: key, roll: n, ...res };
  },

  /** What the card's button can do for this result on this item, or null. */
  actionFor(item, table, action) {
    if (!action) return null;
    if (action === "drop") {
      // a cyberarm drops what its hand holds; a cyberleg's glitch is a fall, nothing to drop
      if (table === "cyberlimb") return item.type === "cyberware" && item.system?.type === "cyberArm" ? "dropHeld" : null;
      return item.type === "weapon" ? "drop" : null;
    }
    if (action === "emptyMag") return item.type === "weapon" && item.system?.isRanged ? "emptyMag" : null;
    return action;
  },

  /** GM: do what a malfunction card's button says. */
  async cardAction(message) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const data = message.getFlag(MODULE_ID, "malfunction");
    const actor = data?.actor ? await fromUuid(data.actor) : null;
    const item = actor?.items?.get(data.item);
    if (!item) return;
    switch (data.action) {
      case "drop":
        await this.dropItem(actor, item, { reason: "malfunction" });
        break;
      case "dropHeld":
        await this.dropHeld(actor, this.sideOf(actor, item.id), { reason: "malfunction" });
        break;
      case "destroy":
        await HomeOps.setCondition(actor, item.id, "destroyed");
        break;
      case "emptyMag":
        await item.update({ "system.magazine.value": 0 });
        await ChatMessage.create({ content: HomeOps._card("fa-solid fa-ban", L("NEONHOME.Malfunction.Done.emptyMag", { name: esc(actor.name), item: esc(item.name) })), speaker: ChatMessage.getSpeaker({ actor }) });
        break;
      case "missCycle": {
        const cycle = await this.cycleFor(actor);
        await HomeOps._patchFlag(item, { missCycle: { scheme: cycle.scheme, n: cycle.n + 1 } });
        await ChatMessage.create({ content: HomeOps._card("fa-solid fa-calendar-xmark", L("NEONHOME.Malfunction.Done.missCycle", { item: esc(item.name) })), whisper: game.users.filter((u) => u.isGM).map((u) => u.id) });
        break;
      }
    }
    await message.setFlag(MODULE_ID, "malfunction", { ...data, done: true });
  },

  /** GM: a malfunction is over (or never happened). */
  async clearMalfunction(actor, itemId) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const item = actor.items.get(itemId);
    if (item) await HomeOps._patchFlag(item, { malfunction: null });
  },

  /** Lead GM: clear malfunctions whose time has run out (when world time moves on). */
  async expireMalfunctions() {
    const now = this.now();
    for (const actor of game.actors) {
      if (actor.type !== "character") continue;
      for (const item of actor.items) {
        const m = itemFlag(item.toObject(), MODULE_ID).malfunction;
        if (m && m.until !== null && now >= m.until) await HomeOps._patchFlag(item, { malfunction: null });
      }
    }
  },

  /**
   * After a roll with an item (from Cyberpunk RED's confirmRoll): a natural 1 with a Damaged item
   * (or, if the GM chose, any item that's due for maintenance) malfunctions. Damage rolls and
   * skills don't count.
   */
  async onItemRoll(item, cprRoll) {
    const mode = Settings.get("malfunctionOnFumble");
    if (!mode || mode === "off") return;
    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor" || item.type === "skill") return;
    if (String(cprRoll?.rollCard ?? "").includes("damage-rollcard")) return;
    if (typeof cprRoll?.wasCritFail !== "function" || !cprRoll.wasCritFail()) return;
    const e = await this.entry(actor, item.id);
    if (!e) return;
    const poorly = e.condition === "damaged" || (mode === "unmaintained" && e.status === "due" && e.missed > 0);
    if (!poorly) return;
    // An attack with a cyberweapon malfunctions as a weapon.
    const attack = /attack-rollcard|autofire-rollcard|suppressive-fire-rollcard/.test(String(cprRoll.rollCard)) && !/program/.test(String(cprRoll.rollCard));
    const table = attack && item.type !== "itemUpgrade" ? "weapon" : null;
    // after Cyberpunk RED's own roll card
    setTimeout(() => this.malfunction(actor, item.id, { table, reason: "fumble" }).catch((err) => console.warn(`${MODULE_ID} | malfunction failed`, err)), 800);
  },

  /* ---------------------------------------- */
  /*  The maintenance cycle                   */
  /* ---------------------------------------- */

  /** Player characters (not Item Piles' piles, which are character actors in Cyberpunk RED). */
  players() {
    return game.actors.filter((a) => a.type === "character" && a.hasPlayerOwner && !game.itempiles?.API?.isValidItemPile?.(a));
  },

  /** "Gearhead: 2 to maintain" lines for whoever has gear due. */
  async _dueRows(actors) {
    const rows = [];
    for (const a of actors) {
      const due = flattenList(await this.list(a)).filter((e) => e.status === "due").length;
      if (due) rows.push(`<li>${esc(a.name)}: ${L("NEONHOME.Maint.DueCount", { n: due })}</li>`);
    }
    return rows.length ? `<ul>${rows.join("")}</ul>` : "";
  },

  /**
   * GM: start the next month (or week) of the GM's own counter. With Neon Hub's Rent Day keeping
   * the months, Neon Hub starts them instead.
   */
  async newCycle() {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    if (this.mode === "rent") throw new RuleBlock(L("NEONHOME.Maint.FollowsRent"));
    const cur = Settings.maintCycle;
    const n = cur.n + 1;
    await game.settings.set(MODULE_ID, "maintCycle", { ...cur, n });
    const rows = await this._dueRows(this.players());
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-calendar-check", `${L(`NEONHOME.Maint.NewCycle.${this.mode === "week" ? "week" : "month"}`, { n })}${rows}`),
      speaker: { alias: L("NEONHOME.Maint.Title") }
    });
  },

  /**
   * Lead GM, when Neon Hub's calendars or lifestyle month change: for each calendar (or Neon Hub's
   * month counter) whose rent month moved on since last time, post who now has gear to maintain.
   * The first look only remembers where things stand.
   */
  async announceRentDay() {
    if (this.mode !== "rent") return;
    const groups = new Map();
    for (const actor of this.players()) {
      const c = await this.cycleFor(actor);
      if (c.scheme === "own") continue;
      const key = c.calendar ? `cal:${c.calendar.id}` : "hub";
      const g = groups.get(key) ?? { n: c.n, label: c.label, calendar: c.calendar, actors: [] };
      if (c.n > g.n) Object.assign(g, { n: c.n, label: c.label });
      g.actors.push(actor);
      groups.set(key, g);
    }
    const cur = Settings.maintCycle;
    const seen = { ...cur.seen };
    let changed = false;
    for (const [key, g] of groups) {
      const before = Number(seen[key]);
      if (seen[key] === undefined || !Number.isFinite(before) || g.n < before) {
        seen[key] = g.n;
        changed = true;
        continue;
      }
      if (g.n === before) continue;
      seen[key] = g.n;
      changed = true;
      const rows = await this._dueRows(g.actors);
      const head = g.calendar
        ? L("NEONHOME.Maint.RentDay", { month: esc(g.label), calendar: esc(g.calendar.name) })
        : L("NEONHOME.Maint.HubMonth", { month: esc(g.label) });
      await ChatMessage.create({
        content: HomeOps._card("fa-solid fa-calendar-check", `${head}${rows}`),
        speaker: { alias: L("NEONHOME.Maint.Title") },
        whisper: [...new Set([...g.actors.flatMap((a) => HomeOps._owners(a))])]
      });
    }
    if (changed) await game.settings.set(MODULE_ID, "maintCycle", { ...cur, seen });
  },

  /** GM: jump a character's Neon Hub calendar to its next Rent Day (Neon Hub bills and rolls the month). */
  async toRentDay(actor) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const c = await this.cycleFor(actor);
    if (!c.calendar || typeof this.hub?.toRentDay !== "function") return;
    await this.hub.toRentDay(c.calendar.id);
  },

  /* ---------------------------------------- */
  /*  Breaking stuff                          */
  /* ---------------------------------------- */

  /** GM: Damage several pieces of a character's gear for one reason (Breaking Stuff, p.5). */
  async damage(actor, itemIds, { cause = "other", hidden = false } = {}) {
    if (!game.user.isGM) throw new RuleBlock(L("NEONHOME.Cyber.GMOnly"));
    const items = itemIds.map((id) => actor.items.get(id)).filter(Boolean);
    if (!items.length) return;
    for (const item of items) await HomeOps._patchFlag(item, { condition: "damaged", hidden: !!hidden, cause });
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-screwdriver-wrench", L("NEONHOME.Maint.DamagedCard", {
        name: esc(actor.name),
        cause: L(`NEONHOME.Maint.Cause.${cause}`),
        items: items.map((i) => esc(i.name)).join(", ")
      })),
      whisper: hidden ? game.users.filter((u) => u.isGM).map((u) => u.id) : HomeOps._owners(actor),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /* ---------------------------------------- */
  /*  Dropping things                         */
  /* ---------------------------------------- */

  /** What a character holds: equipped weapons and shields (not installed ones, not cyberweapons). */
  held(actor) {
    return actor.items.filter((i) => ((i.type === "weapon") || (i.type === "armor" && i.system?.isShield))
      && i.system?.equipped === "equipped" && !CPR.isInstalled(i));
  },

  /** Hands an item takes. */
  hands(item) {
    return item.type === "armor" ? 1 : Math.max(1, Number(item.system?.handsReq) || 1);
  },

  /** The side a cyberlimb is on (as the Biomonitor draws it), or null. */
  sideOf(actor, itemId) {
    for (const t of HomeOps.cyberware(actor).types) {
      const r = t.roots.find((x) => x.id === itemId);
      if (r) return r.side ?? null;
    }
    return null;
  },

  /**
   * Drop an item where the character stands: an Item Piles pile beside their token when Item Piles
   * is on and they're on the scene (attachments go with it, and come back on when it's picked
   * up), otherwise it's just no longer on them (owned, not carried).
   */
  async dropItem(actor, item, { reason = "drop" } = {}) {
    if (!item) return;
    const api = game.modules.get(ITEM_PILES_ID)?.active ? game.itempiles?.API : null;
    const token = actor.isToken ? actor.token?.object : actor.getActiveTokens?.()?.[0] ?? null;
    let piled = false;
    if (api?.createItemPile && token?.document?.parent) {
      const data = item.toObject();
      delete data._id;
      if (data.system?.equipped) data.system.equipped = "owned";
      const tree = item.system?.installedItems?.list?.length && typeof item.createInstalledObjectData === "function";
      if (tree) {
        data.flags ??= {};
        data.flags[MODULE_ID] = { ...(data.flags[MODULE_ID] ?? {}), dropTree: item.createInstalledObjectData() };
        data.system.installedItems.list = [];
        data.system.installedItems.usedSlots = 0;
      }
      const grid = Number(token.document.parent.grid?.size ?? canvas?.grid?.size) || 100;
      try {
        await api.createItemPile({ position: { x: token.document.x + grid, y: token.document.y }, sceneId: token.document.parent.id, items: [data] });
        if (item.type === "armor" && item.system.equipped === "equipped") await CPR.setEquipped(actor, item, "owned");
        await CPR.removeWithInstalled(item);
        piled = true;
      } catch (err) {
        console.warn(`${MODULE_ID} | Item Piles couldn't take ${item.name}`, err);
      }
    }
    if (!piled) await CPR.setEquipped(actor, item, "owned");
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-hand", L(`NEONHOME.Drop.${piled ? "Piled" : "Owned"}`, { name: esc(actor.name), item: esc(item.name) })
        + (reason === "drop" ? "" : ` <em>${esc(L(`NEONHOME.Drop.Reason.${reason}`))}</em>`)),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /**
   * Drop what one hand holds. Two-handed weapons can't be held with one arm, so they go too; with
   * both arms gone, everything does. Which hand held a one-handed item isn't recorded, so the GM is
   * asked (and which arm, if that's not known either).
   * @param {"L"|"R"|null} side - the arm that's gone (null: ask)
   * @param {object} [opts] - { reason, lostSides: sides already gone, injury: to remember the side on }
   */
  async dropHeld(actor, side, { reason = "dismembered", lostSides = [], injury = null } = {}) {
    const held = this.held(actor);
    if (!held.length) return;
    const both = side && lostSides.includes(side === "L" ? "R" : "L");
    const sure = both ? held : held.filter((i) => this.hands(i) >= 2);
    const unsure = both ? [] : held.filter((i) => this.hands(i) < 2);
    let drop = sure;
    if (unsure.length || !side) {
      const answer = await this._askHand(actor, side, sure, unsure);
      if (!answer) return;
      drop = held.filter((i) => answer.ids.includes(i.id));
      if (!side && answer.side && injury) await injury.setFlag(MODULE_ID, "side", answer.side);
    }
    for (const item of drop) await this.dropItem(actor, item, { reason });
  },

  /** GM: which arm, and what was in its hand. Resolves to { side, ids } or null. */
  async _askHand(actor, side, sure, unsure) {
    const box = (i, checked) => `<label class="nah-check"><input type="checkbox" name="drop" value="${i.id}" ${checked ? "checked" : ""}> ${esc(i.name)}${this.hands(i) >= 2 ? ` <small>(${esc(L("NEONHOME.Drop.TwoHanded"))})</small>` : ""}</label>`;
    const sideField = side ? "" : `<div class="form-group"><label>${esc(L("NEONHOME.Drop.Which"))}</label><select name="side"><option value="R">${esc(L("NEONHOME.Bio.Side.R"))}</option><option value="L">${esc(L("NEONHOME.Bio.Side.L"))}</option></select></div>`;
    const content = `<p>${L("NEONHOME.Drop.Ask", { name: esc(actor.name), side: side ? esc(L(`NEONHOME.Bio.Side.${side}`)) : "" })}</p>${sideField}`
      + `<div class="nah-drop-list">${sure.map((i) => box(i, true)).join("")}${unsure.map((i) => box(i, false)).join("")}</div>`;
    return Compat.DialogV2.prompt({
      window: { title: L("NEONHOME.Drop.Title"), icon: "fa-solid fa-hand" },
      content,
      classes: ["neon-home-dialog"],
      rejectClose: false,
      ok: {
        label: L("NEONHOME.Drop.Confirm"),
        callback: (event, button) => {
          const f = button.form;
          return { side: f.elements.side?.value ?? side, ids: [...f.querySelectorAll("[name=drop]:checked")].map((el) => el.value) };
        }
      }
    });
  },

  /**
   * Lead GM: a Dismembered Arm or Hand (Cyberpunk RED's injury, or an offline cyberarm's): "drop
   * anything it was holding".
   */
  async onInjury(actor, injury) {
    if (!Settings.get("dropHeld") || actor?.type !== "character") return;
    const { anchor, kind } = placeInjury(String(injury.name ?? ""), injury.system?.location === "head" ? "head" : "body");
    if (kind !== "severed" || (anchor !== "arm" && anchor !== "hand")) return;
    const flagSide = injury.getFlag(MODULE_ID, "side");
    const side = flagSide === "L" || flagSide === "R" ? flagSide : null;
    const others = actor.items.filter((i) => i.type === "criticalInjury" && i.id !== injury.id);
    const lostSides = traumaMap(others, MODULE_ID).severed.filter((s) => s.limb === "arm" || s.limb === "hand").map((s) => s.side);
    await this.dropHeld(actor, side, { reason: "dismembered", lostSides, injury });
  },

  /**
   * Picked up from a pile: put back what was installed in it (the scope on the rifle). Runs on the
   * client that created the item.
   */
  async restoreDropped(item) {
    const tree = item.getFlag(MODULE_ID, "dropTree");
    const actor = item.parent;
    if (!tree || !actor) return;
    if (game.itempiles?.API?.isValidItemPile?.(actor)) return;
    if (typeof item.createInstalledItemsOnActor !== "function") return;
    await item.update({ "flags.cprInstallTree": tree, [`flags.${MODULE_ID}.-=dropTree`]: null }, { [MODULE_ID]: { [CHECKED]: true } });
    await item.createInstalledItemsOnActor(true);
  }
};

