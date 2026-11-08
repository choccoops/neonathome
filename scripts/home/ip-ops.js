import { MODULE_ID, SYSTEM_ID } from "../constants.js";
import { Compat } from "../compat.js";
import { Settings } from "../settings.js";
import { HomeOps } from "./ops.js";
import { RuleBlock } from "./rule-block.js";
import {
  MAX_LEVEL, NEW_ROLE_IP, ROLES, FAMILIES, FAMILY_KEYS, CATEGORIES, SPLIT_ABILITIES, HAGGLE_FOLLOWS, SCAN_MIN,
  skillPricing, costOf, tally, canMulticlass, abilityOf, roleKey, familyName, describe, iconOf,
  scanReveals, scanDepth, scanOrder, placeIcon
} from "../data/ip.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/** Skill items Neon At Home added for a character (a Language, a Martial Art...): flagged so they can be taken off again. */
export const CUSTOM_SKILL_FLAG = "customSkill";

const STATS = ["int", "ref", "dex", "tech", "cool", "will", "luck", "move", "body", "emp"];
const SKILL_IMG = `systems/${SYSTEM_ID}/icons/compendium/default/Default_Skill.svg`;

/**
 * Spend IP: buying Skill levels, Role Ability Ranks and new Roles with Improvement Points, and
 * refunding them, as the "Spend IP" macro does: the cost is worked out from the current level,
 * every change goes in the IP ledger and to chat, and a Solo's, Medtech's or Tech's points are
 * shared out among their sub-abilities each time the Rank changes (a Fixer's Haggle follows
 * Operator). Characters can also take on new specialty Skills (a Language, a Science, a Martial
 * Art...) to spend on.
 */
export const IPOps = {
  ip(actor) {
    return Number(foundry.utils.getProperty(actor, "system.improvementPoints.value")) || 0;
  },

  skills(actor) {
    return (actor?.items ?? []).filter((i) => i.type === "skill");
  },

  roles(actor) {
    return (actor?.items ?? []).filter((i) => i.type === "role");
  },

  /** A character's read-outs (see data/ip.js tally) and their IP. */
  summary(actor) {
    return { ip: this.ip(actor), ...tally(this.skills(actor), this.roles(actor)) };
  },

  /** What raising (or refunding) an item takes: { kind, pricing, level, max, next, cost, refund }. */
  price(item) {
    const kind = item.type === "role" ? "ability" : "skill";
    const pricing = kind === "ability" ? "role" : skillPricing(item);
    const level = Math.max(0, Number(kind === "ability" ? item.system?.rank : item.system?.level) || 0);
    return { kind, pricing, level, max: level >= MAX_LEVEL, next: level + 1, cost: costOf(pricing, level + 1), refund: costOf(pricing, level) };
  },

  /**
   * What a pick of Skills and Role Abilities comes to: each item one level up (or, refunding, one
   * level down), and the total.
   */
  plan(actor, ids, mode = "up") {
    const lines = [];
    for (const id of new Set(ids)) {
      const item = actor.items.get(id);
      if (!item || !["skill", "role"].includes(item.type)) continue;
      const p = this.price(item);
      if (mode === "up" ? p.max : p.level < 1) continue;
      lines.push({ item, ...p, to: mode === "up" ? p.next : p.level - 1, ip: mode === "up" ? p.cost : p.refund });
    }
    return { lines, total: lines.reduce((n, l) => n + l.ip, 0) };
  },

  _owner(actor) {
    if (!actor?.isOwner) throw new RuleBlock(L("NEONHOME.Error.NoPermission"));
  },

  /** Raise each picked Skill or Role Ability one level, for its IP. */
  async upgrade(actor, ids) {
    this._owner(actor);
    const plan = this.plan(actor, ids, "up");
    if (!plan.lines.length) throw new RuleBlock(L("NEONHOME.IP.PickSome"));
    if (plan.total > this.ip(actor)) throw new RuleBlock(L("NEONHOME.IP.TooDear", { need: plan.total, have: this.ip(actor) }));
    await this._apply(actor, plan);
    await this._ledger(actor, -plan.total, `${L("NEONHOME.IP.Ledger.up")}: ${plan.lines.map((l) => l.item.name).join(", ")}`);
    this._sound("ipSoundUp");
    await this._announce(actor, plan, "up");
    ui.notifications.info(L("NEONHOME.IP.Done.up", { n: plan.lines.length }));
    return plan;
  },

  /** Take each picked Skill or Role Ability down one level, and give its IP back. */
  async refund(actor, ids) {
    this._owner(actor);
    if (!game.user.isGM && Settings.get("ipRefund") === false) throw new RuleBlock(L("NEONHOME.IP.NoRefund"));
    const plan = this.plan(actor, ids, "refund");
    if (!plan.lines.length) throw new RuleBlock(L("NEONHOME.IP.PickRefund"));
    await this._apply(actor, plan);
    await this._ledger(actor, plan.total, `${L("NEONHOME.IP.Ledger.refund")}: ${plan.lines.map((l) => l.item.name).join(", ")}`);
    this._sound("ipSoundRefund");
    await this._announce(actor, plan, "refund");
    ui.notifications.info(L("NEONHOME.IP.Done.refund", { n: plan.lines.length }));
    return plan;
  },

  async _apply(actor, plan) {
    const updates = plan.lines.map((l) => ({ _id: l.item.id, [l.kind === "ability" ? "system.rank" : "system.level"]: l.to }));
    await actor.updateEmbeddedDocuments("Item", updates);
  },

  async _announce(actor, plan, mode) {
    for (const l of plan.lines) {
      const what = l.kind === "ability" ? abilityOf(l.item) : l.item.name;
      await ChatMessage.create({
        content: HomeOps._card(mode === "up" ? "fa-solid fa-angles-up" : "fa-solid fa-rotate-left", L(`NEONHOME.IP.Card.${mode}`, { name: esc(actor.name), what: esc(what), level: l.to })),
        speaker: ChatMessage.getSpeaker({ actor })
      });
    }
  },

  /** The IP change, through Cyberpunk RED's ledger (its record on the sheet) when it has one. */
  async _ledger(actor, delta, reason) {
    if (typeof actor.deltaLedgerProperty === "function") {
      const out = actor.deltaLedgerProperty("improvementPoints", delta, reason);
      if (out instanceof Promise) await out;
      return;
    }
    await actor.update({ "system.improvementPoints.value": this.ip(actor) + delta });
  },

  _sound(key) {
    const src = Settings.get(key);
    if (!src) return;
    const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    try {
      helper?.play({ src, volume: 0.5, autoplay: true, loop: false }, false);
    } catch (err) {
      console.warn(`${MODULE_ID} | could not play ${src}`, err);
    }
  },

  /* ---------------------------------------- */
  /*  Roles                                   */
  /* ---------------------------------------- */

  /** A new Role: which ones the character can add, and whether they can yet (every Role at Rank 4). */
  roleOptions(actor) {
    const roles = this.roles(actor);
    const have = new Set(roles.map((r) => roleKey(r.name)));
    const gate = canMulticlass(roles.map((r) => ({ name: r.name, rank: Number(r.system?.rank) || 0 })));
    return { first: !roles.length, open: gate.ok, low: gate.low, roles: ROLES.filter((r) => !have.has(r.key)) };
  },

  /** The Role's item from Cyberpunk RED's Roles compendium (or any Item compendium of roles). */
  async _roleSource(role) {
    const packs = [game.packs?.get?.(`${SYSTEM_ID}.core_roles`), ...(game.packs ?? [])].filter((p) => p?.documentName === "Item");
    const candidates = packs.filter((p, i) => i === 0 || /role/i.test(`${p.metadata?.label ?? ""} ${p.metadata?.name ?? ""}`));
    for (const pack of new Set(candidates)) {
      const docs = (await pack.getDocuments()).filter((d) => d.type === "role");
      const want = role.name.toLowerCase();
      const hit = docs.find((d) => d.name.toLowerCase() === want) || docs.find((d) => roleKey(d.name) === role.key)
        || docs.find((d) => new RegExp(`\\b${want}\\b`).test(d.name.toLowerCase()));
      if (hit) return hit.toObject();
    }
    return null;
  },

  /** Add a Role at Rank 1, for 60 IP. */
  async addRole(actor, key) {
    this._owner(actor);
    const role = ROLES.find((r) => r.key === key);
    const opts = this.roleOptions(actor);
    if (!role || !opts.roles.includes(role)) throw new RuleBlock(L("NEONHOME.IP.Role.Have"));
    if (!opts.open) throw new RuleBlock(L("NEONHOME.IP.Role.Locked", { low: opts.low.map((r) => `${r.name} (${r.rank})`).join(", ") }));
    if (this.ip(actor) < NEW_ROLE_IP) throw new RuleBlock(L("NEONHOME.IP.TooDear", { need: NEW_ROLE_IP, have: this.ip(actor) }));
    const data = await this._roleSource(role);
    if (!data) throw new RuleBlock(L("NEONHOME.IP.Role.NotFound", { role: role.name }));
    delete data._id;
    data.system ??= {};
    data.system.rank = 1;
    const [item] = await actor.createEmbeddedDocuments("Item", [data]);
    await this._ledger(actor, -NEW_ROLE_IP, `${L("NEONHOME.IP.Ledger.role")}: ${role.name}`);
    this._sound("ipSoundUp");
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-user-plus", L("NEONHOME.IP.Card.role", { name: esc(actor.name), role: esc(role.name), ability: esc(role.ability) })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
    ui.notifications.info(L("NEONHOME.IP.Role.Added", { role: role.name }));
    return item;
  },

  /**
   * After a Role Ability's Rank changes: a Fixer's Haggle follows Operator, and a Solo's, Medtech's
   * or Tech's points are shared out again among their sub-abilities (asked of the player).
   */
  async afterRank(actor, roleId) {
    const role = actor.items.get(roleId);
    if (!role) return;
    const ability = abilityOf(role);
    const rank = Number(role.system?.rank) || 0;
    if (ability === HAGGLE_FOLLOWS) await this.followHaggle(actor, roleId);
    if (SPLIT_ABILITIES.includes(ability) && role.system?.abilities?.length) {
      if (rank === 0) await this.allocate(actor, roleId, role.system.abilities.map(() => 0));
      else await this.askAllocation(actor, roleId);
    }
  },

  async followHaggle(actor, roleId) {
    const role = actor.items.get(roleId);
    const list = this._abilities(role);
    const haggle = list.find((a) => String(a?.name).toLowerCase() === "haggle");
    if (!haggle) return;
    haggle.rank = Number(role.system.rank) || 0;
    await actor.updateEmbeddedDocuments("Item", [{ _id: roleId, "system.abilities": list }]);
    ui.notifications.info(L("NEONHOME.IP.Haggle", { n: haggle.rank }));
  },

  /** A Role's sub-abilities as plain data (its own are data models, not to be changed in place). */
  _abilities(role) {
    return foundry.utils.deepClone(role?.toObject?.().system?.abilities ?? role?.system?.abilities ?? []);
  },

  /** Share a Role Ability's Rank out among its sub-abilities: every point, no more. */
  async allocate(actor, roleId, ranks) {
    this._owner(actor);
    const role = actor.items.get(roleId);
    const rank = Number(role?.system?.rank) || 0;
    const list = this._abilities(role);
    const pts = list.map((_, i) => Math.max(0, Math.floor(Number(ranks[i]) || 0)));
    const sum = pts.reduce((a, b) => a + b, 0);
    if (sum > rank) throw new RuleBlock(L("NEONHOME.IP.Split.Over", { n: rank }));
    if (sum < rank) throw new RuleBlock(L("NEONHOME.IP.Split.Under", { n: rank - sum }));
    list.forEach((a, i) => {
      a.rank = pts[i];
    });
    await actor.updateEmbeddedDocuments("Item", [{ _id: roleId, "system.abilities": list }]);
    ui.notifications.info(L("NEONHOME.IP.Split.Done", { role: role.name }));
    return list;
  },

  /** Ask the player to share out the points, until every one is placed (or they close it). */
  async askAllocation(actor, roleId) {
    for (;;) {
      const role = actor.items.get(roleId);
      if (!role) return null;
      const rank = Number(role.system?.rank) || 0;
      const ability = abilityOf(role);
      const rows = role.system.abilities.map((a, i) => {
        const r = Number(a.rank) || 0;
        const pips = Array.from({ length: MAX_LEVEL }, (_, n) => `<i class="${n < r ? "on" : ""}"></i>`).join("");
        return `<div class="nah-ip-split-row"><i class="${iconOf(a.name)}"></i><div><b>${esc(a.name)}</b><small>${esc(describe(a.name))}</small><span class="nah-ip-pips">${pips}</span></div>`
          + `<input type="number" name="split" data-index="${i}" value="${r}" min="0" max="${rank}" step="1" aria-label="${esc(a.name)}"></div>`;
      }).join("");
      const content = `<div class="nah-ip-split"><p class="nah-ip-split-head">${L("NEONHOME.IP.Split.Hint", { n: rank, ability: esc(ability) })}</p>`
        + `<p class="nah-ip-split-count">${esc(L("NEONHOME.IP.Split.Placed"))} <b data-placed>0</b> / ${rank}</p>${rows}</div>`;
      const ranks = await Compat.DialogV2.prompt({
        window: { title: L("NEONHOME.IP.Split.Title", { ability }), icon: "fa-solid fa-sliders" },
        position: { width: 460 },
        content,
        classes: ["neon-home-dialog", "nah-ip-dialog"],
        rejectClose: false,
        render: (event, arg) => {
          const root = arg instanceof HTMLElement ? arg : arg?.element ?? event?.target?.element;
          const inputs = [...(root?.querySelectorAll("[name=split]") ?? [])];
          const out = root?.querySelector("[data-placed]");
          const count = () => {
            const n = inputs.reduce((a, el) => a + (Number(el.value) || 0), 0);
            if (out) {
              out.textContent = n;
              out.classList.toggle("is-off", n !== rank);
            }
          };
          for (const el of inputs) el.addEventListener("input", count);
          count();
        },
        ok: {
          label: L("NEONHOME.IP.Split.Confirm"),
          callback: (event, button) => [...button.form.querySelectorAll("[name=split]")].map((el) => Number(el.value) || 0)
        }
      });
      if (!ranks) return null;
      try {
        return await this.allocate(actor, roleId, ranks);
      } catch (err) {
        if (!(err instanceof RuleBlock)) throw err;
        ui.notifications.error(err.message);
      }
    }
  },

  /* ---------------------------------------- */
  /*  New Skills                              */
  /* ---------------------------------------- */

  /**
   * Give a character a Skill at Level 0 to spend on: a specialty of a family (a Language, Science,
   * Local Expert, Martial Art or Instrument: { family, specialty }), from Cyberpunk RED's compendium
   * when it has it, or a Skill of its own ({ name, category, stat, difficulty }).
   */
  async addSkill(actor, spec = {}) {
    this._owner(actor);
    const fam = FAMILIES[spec.family];
    let data;
    if (fam) {
      const specialty = String(spec.specialty ?? "").trim();
      if (!specialty) throw new RuleBlock(L("NEONHOME.IP.Add.NeedSpecialty"));
      const name = familyName(spec.family, specialty);
      this._unique(actor, name);
      data = (await this._skillSource(fam.pack, name)) ?? this._skillData(name, { category: fam.category, stat: fam.stat, difficulty: fam.difficulty, skillType: fam.skillType });
    } else {
      const name = String(spec.name ?? "").trim();
      if (!name) throw new RuleBlock(L("NEONHOME.IP.Add.NeedName"));
      this._unique(actor, name);
      const category = CATEGORIES.some((c) => c.key === spec.category) ? spec.category : "educationSkills";
      const stat = STATS.includes(spec.stat) ? spec.stat : "int";
      const difficulty = spec.difficulty === "difficult" ? "difficult" : "typical";
      data = this._skillData(name, { category, stat, difficulty, skillType: "generic" });
    }
    delete data._id;
    data.system.level = 0;
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${CUSTOM_SKILL_FLAG}`, true);
    const [item] = await actor.createEmbeddedDocuments("Item", [data]);
    ui.notifications.info(L("NEONHOME.IP.Add.Done", { skill: data.name }));
    return item;
  },

  _unique(actor, name) {
    const want = name.toLowerCase();
    if (this.skills(actor).some((s) => s.name.toLowerCase() === want)) throw new RuleBlock(L("NEONHOME.IP.Add.Have", { skill: name }));
  },

  _skillData(name, { category, stat, difficulty, skillType }) {
    return { name, type: "skill", img: SKILL_IMG, system: { level: 0, stat, category, difficulty, skillType, core: false, basic: false, description: { value: "" } } };
  },

  async _skillSource(packName, name) {
    const pack = game.packs?.get?.(`${SYSTEM_ID}.${packName}`);
    if (!pack) return null;
    const index = await pack.getIndex();
    const hit = [...index].find((e) => String(e.name).toLowerCase() === name.toLowerCase());
    if (!hit) return null;
    return (await pack.getDocument(hit._id))?.toObject() ?? null;
  },

  /** Take back a Skill added here that hasn't been spent on. */
  async removeSkill(actor, id) {
    this._owner(actor);
    const item = actor.items.get(id);
    if (!item?.getFlag?.(MODULE_ID, CUSTOM_SKILL_FLAG)) throw new RuleBlock(L("NEONHOME.IP.Add.NotOurs"));
    if ((Number(item.system?.level) || 0) > 0) throw new RuleBlock(L("NEONHOME.IP.Add.Spent", { skill: item.name }));
    await actor.deleteEmbeddedDocuments("Item", [id]);
  },

  /* ---------------------------------------- */
  /*  Sizing up the others                    */
  /* ---------------------------------------- */

  perception(actor) {
    const skill = Number(this.skills(actor).find((s) => s.name === "Perception")?.system?.level) || 0;
    const int = Number(actor.system?.stats?.int?.value) || 0;
    return { skill, int, total: skill + int };
  },

  /** The characters to size up: every player's character, or every actor with a token in the scene. */
  _others(actor, mode) {
    if (mode === "scene") {
      const seen = new Set([actor.id]);
      const out = [];
      for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
        const a = t.actor;
        if (!a || seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(a);
      }
      return out;
    }
    const isGM = (id) => (game.users.get?.(id) ?? game.users.find?.((u) => u.id === id))?.isGM;
    return game.actors.filter((a) => a.type === "character" && a.id !== actor.id
      && Object.entries(a.ownership ?? {}).some(([id, level]) => level === 3 && id !== "default" && !isGM(id)));
  },

  /**
   * Size up the others, as far as the character's Perception + INT reads them (6 to see anything,
   * 10 for levels and skill totals, 15 for best skills, 18 for specializations), in the order it
   * reads them (shuffled under 10, by Threat under 15, else by levels bought).
   */
  compare(actor, mode = Settings.get("ipCompare") ?? "players") {
    if (mode === "off") throw new RuleBlock(L("NEONHOME.IP.Scan.Off"));
    const per = this.perception(actor);
    if (per.total < SCAN_MIN) throw new RuleBlock(L("NEONHOME.IP.Scan.TooLow", { n: SCAN_MIN, have: per.total }));
    const others = this._others(actor, mode);
    if (!others.length) throw new RuleBlock(L(`NEONHOME.IP.Scan.None.${mode}`));
    const shows = scanReveals(per.total);
    let rows = [actor, ...others].map((a) => ({ actor: a, you: a.id === actor.id, t: tally(this.skills(a), this.roles(a)) }));
    const order = scanOrder(per.total);
    if (order === "bought") rows.sort((a, b) => b.t.bought - a.t.bought);
    else if (order === "threat") rows.sort((a, b) => b.t.threat - a.t.threat);
    else rows = rows.map((r) => [Math.random(), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    return {
      mode,
      perception: per,
      depth: scanDepth(per.total),
      order,
      scene: globalThis.canvas?.scene?.name ?? "",
      rows: rows.map((r, i) => {
        const see = r.you ? { threat: true, level: true, skills: true, best: true, special: true } : shows;
        return {
          place: i + 1,
          placeIcon: placeIcon(i + 1),
          ranked: shows.ranked,
          name: r.actor.name,
          img: r.actor.img,
          you: r.you,
          level: see.level ? r.t.level : null,
          bought: see.skills ? r.t.bought : null,
          threat: see.threat ? r.t.band : null,
          best: see.best ? (r.t.best.name ? `${r.t.best.name} (${r.t.best.level})` : "—") : null,
          special: see.special ? (r.t.special.key ? r.t.special.key : "generalist") : null,
          specialScore: r.t.special.score
        };
      })
    };
  },

  /** The scan, in a window. */
  async showCompare(actor) {
    const s = this.compare(actor);
    const hidden = `<span class="nah-ip-hidden">??</span>`;
    const cards = s.rows.map((r) => {
      const threat = r.threat ? `<span class="tone-${r.threat.tone}">${esc(L(`NEONHOME.IP.Threat.${r.threat.key}`))}</span>` : hidden;
      const special = r.special ? esc(r.special === "generalist" ? L("NEONHOME.IP.Generalist") : `${L(`NEONHOME.IP.Cat.${r.special}`)} (${r.specialScore})`) : hidden;
      const row = (label, value) => `<div><small>${esc(L(label))}</small><b>${value}</b></div>`;
      return `<article class="nah-ip-scan-card${r.you ? " is-you" : ""}">`
        + `<span class="nah-ip-scan-place"><i class="${r.placeIcon}"></i> ${r.ranked || r.you ? `#${r.place}` : "#???"}</span>`
        + `<img src="${esc(r.img)}" alt="">`
        + `<div class="nah-ip-scan-info"><h3>${esc(r.name)}${r.you ? ` <small>(${esc(L("NEONHOME.IP.Scan.You"))})</small>` : ""}</h3>`
        + (r.level !== null ? row("NEONHOME.IP.Level", r.level) : "")
        + row("NEONHOME.IP.Bought", r.bought !== null ? r.bought : hidden)
        + row("NEONHOME.IP.ThreatLevel", threat)
        + row("NEONHOME.IP.Best", r.best !== null ? esc(r.best) : hidden)
        + row("NEONHOME.IP.Specialization", special)
        + `</div></article>`;
    }).join("");
    const where = s.mode === "scene" ? L("NEONHOME.IP.Scan.Scene", { scene: s.scene, n: s.rows.length - 1 }) : L("NEONHOME.IP.Scan.World", { n: s.rows.length - 1 });
    const legend = ["basic", "detailed", "expert", "perfect"].map((k) => `<li>${L(`NEONHOME.IP.Scan.Legend.${k}`)}</li>`).join("");
    const content = `<div class="nah-ip-scan">`
      + `<p class="nah-ip-scan-tag">${esc(L("NEONHOME.IP.Scan.Tag"))}</p>`
      + `<p class="nah-ip-scan-meta">${esc(where)} · ${esc(L("NEONHOME.IP.Scan.Perception", { total: s.perception.total, skill: s.perception.skill, int: s.perception.int }))} · ${esc(L(`NEONHOME.IP.Scan.Depth.${s.depth}`))} · ${esc(L(`NEONHOME.IP.Scan.Order.${s.order}`))}</p>`
      + `<div class="nah-ip-scan-grid">${cards}</div>`
      + `<h4>${esc(L("NEONHOME.IP.Scan.LegendTitle"))}</h4><ul class="nah-ip-scan-legend">${legend}</ul></div>`;
    return Compat.DialogV2.prompt({
      window: { title: L("NEONHOME.IP.Scan.Title"), icon: "fa-solid fa-users-viewfinder", resizable: true },
      position: { width: 820, height: 640 },
      content,
      classes: ["neon-home-dialog", "nah-ip-dialog"],
      rejectClose: false,
      ok: { label: L("NEONHOME.IP.Scan.Close") }
    });
  },

  /* ---------------------------------------- */
  /*  Asking first                            */
  /* ---------------------------------------- */

  /** Confirm a pick (its lines and total), then spend or refund. Returns the plan, or null. */
  async confirm(actor, ids, mode) {
    const plan = this.plan(actor, ids, mode);
    if (!plan.lines.length) throw new RuleBlock(L(mode === "up" ? "NEONHOME.IP.PickSome" : "NEONHOME.IP.PickRefund"));
    if (mode === "up" && plan.total > this.ip(actor)) throw new RuleBlock(L("NEONHOME.IP.TooDear", { need: plan.total, have: this.ip(actor) }));
    const lines = plan.lines.map((l) => `<li><span>${esc(l.kind === "ability" ? abilityOf(l.item) : l.item.name)} <small>${l.kind === "ability" ? esc(L("NEONHOME.IP.RankN", { n: l.to })) : esc(L("NEONHOME.IP.LevelN", { n: l.to }))}</small></span><b>${mode === "up" ? "−" : "+"}${l.ip} IP</b></li>`).join("");
    const ok = await Compat.DialogV2.confirm({
      window: { title: L(`NEONHOME.IP.Confirm.${mode}`), icon: mode === "up" ? "fa-solid fa-angles-up" : "fa-solid fa-rotate-left" },
      content: `<div class="nah-ip-confirm"><p>${esc(L(`NEONHOME.IP.Confirm.${mode}Ask`))}</p><ul>${lines}</ul>`
        + `<p class="nah-ip-confirm-total">${esc(L(`NEONHOME.IP.Confirm.${mode}Total`))} <b>${plan.total} IP</b>${mode === "up" ? ` <small>${esc(L("NEONHOME.IP.Confirm.Left", { n: this.ip(actor) - plan.total }))}</small>` : ""}</p></div>`,
      classes: ["neon-home-dialog", "nah-ip-dialog"],
      rejectClose: false
    });
    if (!ok) return null;
    const done = mode === "up" ? await this.upgrade(actor, ids) : await this.refund(actor, ids);
    for (const l of done.lines) if (l.kind === "ability") await this.afterRank(actor, l.item.id);
    return done;
  },

  /** Pick a Role to add, confirm it, and add it. */
  async chooseRole(actor) {
    const opts = this.roleOptions(actor);
    if (!opts.roles.length) throw new RuleBlock(L("NEONHOME.IP.Role.All"));
    if (!opts.open) throw new RuleBlock(L("NEONHOME.IP.Role.Locked", { low: opts.low.map((r) => `${r.name} (${r.rank})`).join(", ") }));
    const cards = opts.roles.map((r, i) => `<label class="nah-ip-role-pick"><input type="radio" name="role" value="${r.key}" ${i === 0 ? "checked" : ""}>`
      + `<i class="${iconOf(r.ability)}"></i><span><b>${esc(r.name)}</b><small>${esc(r.ability)} · ${NEW_ROLE_IP} IP</small><em>${esc(describe(r.ability))}</em></span></label>`).join("");
    const key = await Compat.DialogV2.prompt({
      window: { title: L("NEONHOME.IP.Role.Title"), icon: "fa-solid fa-user-plus" },
      position: { width: 560 },
      content: `<div class="nah-ip-roles"><p class="nah-ip-split-head">${esc(L("NEONHOME.IP.Role.Tag"))}</p><div class="nah-ip-role-grid">${cards}</div></div>`,
      classes: ["neon-home-dialog", "nah-ip-dialog"],
      rejectClose: false,
      ok: { label: L("NEONHOME.IP.Role.Buy"), callback: (event, button) => button.form.querySelector("[name=role]:checked")?.value ?? null }
    });
    if (!key) return null;
    const role = ROLES.find((r) => r.key === key);
    if (this.ip(actor) < NEW_ROLE_IP) throw new RuleBlock(L("NEONHOME.IP.TooDear", { need: NEW_ROLE_IP, have: this.ip(actor) }));
    const ok = await Compat.DialogV2.confirm({
      window: { title: L("NEONHOME.IP.Role.ConfirmTitle"), icon: "fa-solid fa-user-plus" },
      content: `<p>${L("NEONHOME.IP.Role.ConfirmAsk", { role: esc(role.name), ability: esc(role.ability), n: NEW_ROLE_IP })}</p>`,
      classes: ["neon-home-dialog", "nah-ip-dialog"],
      rejectClose: false
    });
    if (!ok) return null;
    const item = await this.addRole(actor, key);
    if (item && SPLIT_ABILITIES.includes(role.ability)) await this.afterRank(actor, item.id);
    return item;
  },

  /** Ask which Skill to add: a family's specialty (with suggestions) or a Skill of its own. */
  async askSkill(actor, family = "language") {
    const opt = (v, label, on) => `<option value="${v}" ${on ? "selected" : ""}>${esc(label)}</option>`;
    const families = [...FAMILY_KEYS, "custom"].map((k) => opt(k, L(`NEONHOME.IP.Add.Family.${k}`), k === family)).join("");
    const lists = FAMILY_KEYS.map((k) => `<datalist id="nah-ip-list-${k}">${FAMILIES[k].suggest.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>`).join("");
    const cats = CATEGORIES.map((c) => opt(c.key, L(`NEONHOME.IP.Cat.${c.key}`), c.key === "educationSkills")).join("");
    const stats = STATS.map((s) => opt(s, L(`NEONHOME.Perks.Stat.${s}`), s === "int")).join("");
    const content = `<div class="nah-ip-add">`
      + `<div class="form-group"><label>${esc(L("NEONHOME.IP.Add.Kind"))}</label><select name="family">${families}</select></div>`
      + `<div class="form-group" data-for="family"><label>${esc(L("NEONHOME.IP.Add.Specialty"))}</label><input type="text" name="specialty" list="nah-ip-list-${FAMILY_KEYS.includes(family) ? family : "language"}" placeholder="${esc(L("NEONHOME.IP.Add.SpecialtyHint"))}"></div>`
      + `<div class="form-group" data-for="custom"><label>${esc(L("NEONHOME.IP.Add.Name"))}</label><input type="text" name="name" placeholder="${esc(L("NEONHOME.IP.Add.NameHint"))}"></div>`
      + `<div class="form-group" data-for="custom"><label>${esc(L("NEONHOME.IP.Add.Category"))}</label><select name="category">${cats}</select></div>`
      + `<div class="form-group" data-for="custom"><label>${esc(L("NEONHOME.IP.Add.Stat"))}</label><select name="stat">${stats}</select></div>`
      + `<div class="form-group" data-for="custom"><label>${esc(L("NEONHOME.IP.Add.Difficulty"))}</label><select name="difficulty">${opt("typical", L("NEONHOME.IP.Pricing.typical"), true)}${opt("difficult", L("NEONHOME.IP.Pricing.difficult"), false)}</select></div>`
      + `<p class="nah-ip-add-preview" data-preview></p>${lists}</div>`;
    const spec = await Compat.DialogV2.prompt({
      window: { title: L("NEONHOME.IP.Add.Title"), icon: "fa-solid fa-square-plus" },
      position: { width: 460 },
      content,
      classes: ["neon-home-dialog", "nah-ip-dialog"],
      rejectClose: false,
      render: (event, arg) => {
        const root = arg instanceof HTMLElement ? arg : arg?.element ?? event?.target?.element;
        const f = root?.querySelector("form") ?? root;
        const pick = f?.querySelector("[name=family]");
        if (!pick) return;
        const sync = () => {
          const k = pick.value;
          const fam = FAMILIES[k];
          for (const el of f.querySelectorAll("[data-for]")) el.hidden = el.dataset.for !== (fam ? "family" : "custom");
          if (fam) f.querySelector("[name=specialty]").setAttribute("list", `nah-ip-list-${k}`);
          const name = fam ? familyName(k, f.querySelector("[name=specialty]").value || "…") : f.querySelector("[name=name]").value || "…";
          const stat = fam ? fam.stat : f.querySelector("[name=stat]").value;
          const cat = fam ? fam.category : f.querySelector("[name=category]").value;
          const diff = fam ? fam.difficulty : f.querySelector("[name=difficulty]").value;
          f.querySelector("[data-preview]").textContent = `${name} · ${L(`NEONHOME.Perks.Stat.${stat}`)} · ${L(`NEONHOME.IP.Cat.${cat}`)} · ${L(`NEONHOME.IP.Pricing.${diff}`)}`;
        };
        f.addEventListener("input", sync);
        f.addEventListener("change", sync);
        sync();
      },
      ok: {
        label: L("NEONHOME.IP.Add.Confirm"),
        callback: (event, button) => {
          const e = button.form.elements;
          const v = (n) => e.namedItem(n)?.value ?? "";
          return { family: v("family"), specialty: v("specialty"), name: v("name"), category: v("category"), stat: v("stat"), difficulty: v("difficulty") };
        }
      }
    });
    if (!spec) return null;
    return this.addSkill(actor, spec);
  }
};
