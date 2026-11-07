import { TEMPLATE_PATH, MODULE_ID } from "../constants.js";
import { Settings } from "../settings.js";
import { Compat } from "../compat.js";
import { IPOps, CUSTOM_SKILL_FLAG } from "../home/ip-ops.js";
import { LEVEL_IP, MAX_LEVEL, NEW_ROLE_IP, CATEGORIES, FAMILIES, FAMILY_KEYS, abilityOf, describe, iconOf } from "../data/ip.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

const pips = (n) => Array.from({ length: MAX_LEVEL }, (_, i) => ({ on: i < n }));

function card(item, ip, sel) {
  const p = IPOps.price(item);
  const name = p.kind === "ability" ? abilityOf(item) : item.name;
  return {
    id: item.id,
    name,
    sub: p.kind === "ability" ? item.name : "",
    icon: iconOf(name, item.system?.category),
    desc: describe(name, item),
    level: p.level,
    levelLabel: L(p.kind === "ability" ? "NEONHOME.IP.RankN" : "NEONHOME.IP.LevelN", { n: p.level }),
    max: p.max,
    cost: p.max ? 0 : p.cost,
    refund: p.refund,
    afford: p.max || p.cost <= ip,
    difficult: p.pricing === "difficult",
    pips: pips(p.level),
    selected: sel.has(item.id),
    custom: !!item.getFlag?.(MODULE_ID, CUSTOM_SKILL_FLAG) && p.level === 0,
    find: `${name} ${item.name}`.toLowerCase()
  };
}

export const SpendIP = {
  id: "spendIp",
  // its own window (SpendIPApp), not a tab of the home
  standalone: true,
  icon: "fa-solid fa-angles-up",
  label: "NEONHOME.IP.Title",
  template: `${TEMPLATE_PATH}/spend-ip.hbs`,
  available: () => Settings.get("spendIp") !== false,

  async prepare(app, actor) {
    const ui = (app.uiState.ip ??= { sel: [], collapsed: [], search: "" });
    const sum = IPOps.summary(actor);
    // picks of items no longer there (or now maxed) drop out
    ui.sel = ui.sel.filter((id) => {
      const it = actor.items.get(id);
      return it && ["skill", "role"].includes(it.type);
    });
    const sel = new Set(ui.sel);
    const collapsed = new Set(ui.collapsed);
    const roles = IPOps.roles(actor);
    const skills = IPOps.skills(actor).sort((a, b) => a.name.localeCompare(b.name));
    const opts = IPOps.roleOptions(actor);
    const catLabel = (k) => L(`NEONHOME.IP.Cat.${k}`);
    const sections = CATEGORIES.map((c) => {
      const list = skills.filter((s) => s.system?.category === c.key);
      const t = sum.cats[c.key];
      return {
        key: c.key,
        label: catLabel(c.key),
        icon: c.icon,
        total: t.total,
        count: t.count,
        collapsed: collapsed.has(c.key),
        cards: list.map((s) => card(s, sum.ip, sel)),
        families: FAMILY_KEYS.filter((k) => FAMILIES[k].category === c.key).map((k) => ({ key: k, label: L(`NEONHOME.IP.Add.Family.${k}`), icon: FAMILIES[k].icon }))
      };
    });
    // skills in a category Cyberpunk RED doesn't have (homebrew) still show, at the end
    const known = new Set(CATEGORIES.map((c) => c.key));
    const stray = skills.filter((s) => !known.has(s.system?.category));
    if (stray.length) sections.push({ key: "other", label: L("NEONHOME.IP.Cat.other"), icon: "fa-solid fa-shapes", total: stray.reduce((n, s) => n + (Number(s.system?.level) || 0), 0), count: stray.length, collapsed: collapsed.has("other"), cards: stray.map((s) => card(s, sum.ip, sel)), families: [] });
    const status = opts.first
      ? L("NEONHOME.IP.Role.First", { n: NEW_ROLE_IP })
      : !opts.roles.length ? L("NEONHOME.IP.Role.All")
        : opts.open ? L("NEONHOME.IP.Role.Open", { n: NEW_ROLE_IP })
          : L("NEONHOME.IP.Role.Locked", { low: opts.low.map((r) => `${r.name} (${r.rank})`).join(", ") });
    const compareMode = Settings.get("ipCompare") ?? "players";
    return {
      ip: {
        owner: actor.isOwner,
        isGM: game.user.isGM,
        points: sum.ip,
        canRefund: game.user.isGM || Settings.get("ipRefund") !== false,
        level: sum.level,
        next: sum.level + 1,
        progress: sum.progress,
        pct: sum.pct,
        perLevel: LEVEL_IP,
        rank: { icon: sum.rank.icon, label: L(`NEONHOME.IP.Rank.${sum.rank.key}`), key: sum.rank.key },
        spent: sum.spent,
        bought: sum.bought,
        best: sum.best.name ? `${sum.best.name} (${sum.best.level})` : L("NEONHOME.IP.None"),
        experts: sum.experts,
        special: sum.special.key ? `${catLabel(sum.special.key)} (${sum.special.score})` : L("NEONHOME.IP.Generalist"),
        threat: sum.threat,
        band: { label: L(`NEONHOME.IP.Threat.${sum.band.key}`), tone: sum.band.tone },
        cats: CATEGORIES.map((c) => ({ key: c.key, label: catLabel(c.key), icon: c.icon, total: sum.cats[c.key].total })),
        catTip: CATEGORIES.map((c) => {
          const t = sum.cats[c.key];
          return `${catLabel(c.key)}: ${t.total} (${L("NEONHOME.IP.Avg", { n: t.count ? (t.total / t.count).toFixed(1) : 0 })})`;
        }).join(" | "),
        compare: compareMode !== "off",
        nav: [{ key: "roles", label: L("NEONHOME.IP.Nav.roles"), icon: "fa-solid fa-user-tie" }, ...CATEGORIES.map((c) => ({ key: c.key, label: L(`NEONHOME.IP.Nav.${c.key}`), icon: c.icon }))],
        search: ui.search,
        roles: {
          collapsed: collapsed.has("roles"),
          badges: roles.map((r) => ({ name: r.name, rank: Number(r.system?.rank) || 0, icon: iconOf(abilityOf(r)) })),
          cards: roles.map((r) => card(r, sum.ip, sel)),
          plural: roles.length !== 1,
          add: opts.roles.length || opts.first ? { first: opts.first, locked: !opts.first && !opts.open, status } : null
        },
        sections,
        selCount: ui.sel.length
      }
    };
  },

  actions: {
    ipConfirm() {
      const ui = (this.uiState.ip ??= { sel: [], collapsed: [], search: "" });
      return this.act(async () => {
        if (await IPOps.confirm(this.actor, ui.sel, "up")) ui.sel = [];
      });
    },
    ipRefund() {
      const ui = (this.uiState.ip ??= { sel: [], collapsed: [], search: "" });
      return this.act(async () => {
        if (await IPOps.confirm(this.actor, ui.sel, "refund")) ui.sel = [];
      });
    },
    ipClear() {
      const ui = (this.uiState.ip ??= { sel: [], collapsed: [], search: "" });
      ui.sel = [];
      this.render();
    },
    ipAddRole() {
      return this.act(() => IPOps.chooseRole(this.actor));
    },
    ipAddSkill(event, target) {
      return this.act(() => IPOps.askSkill(this.actor, target.dataset.family || "custom"));
    },
    ipRemoveSkill(event, target) {
      const id = target.closest("[data-ip-pick]")?.dataset.ipPick;
      const item = this.actor?.items.get(id);
      if (!item) return;
      return this.act(async () => {
        const ok = await Compat.DialogV2.confirm({
          window: { title: item.name, icon: "fa-solid fa-trash" },
          content: `<p>${L("NEONHOME.IP.Add.RemoveAsk", { skill: Handlebars.escapeExpression(item.name) })}</p>`,
          classes: ["neon-home-dialog"],
          rejectClose: false
        });
        if (ok) await IPOps.removeSkill(this.actor, id);
      });
    },
    ipCompare() {
      return this.act(() => IPOps.showCompare(this.actor));
    },
    ipTop() {
      this.element?.querySelector(".nah-ip-body")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  },

  onRender(app, root) {
    const ui = (app.uiState.ip ??= { sel: [], collapsed: [], search: "" });
    const body = root.querySelector(".nah-ip-body");
    const count = root.querySelector("[data-ip-count]");
    const cost = root.querySelector("[data-ip-cost]");
    const back = root.querySelector("[data-ip-back]");
    const points = Number(root.querySelector(".nah-ip")?.dataset.points) || 0;
    // the running total of the pick
    const tally = () => {
      const picked = [...root.querySelectorAll(".nah-ip-card.selected")];
      const up = picked.reduce((n, el) => n + (Number(el.dataset.cost) || 0), 0);
      const down = picked.reduce((n, el) => n + (Number(el.dataset.refund) || 0), 0);
      if (count) count.textContent = picked.length;
      if (cost) {
        cost.textContent = up;
        cost.closest(".nah-ip-sel")?.classList.toggle("is-short", up > points);
      }
      if (back) back.textContent = down;
    };
    // picking a card: toggled here, without a render
    for (const el of root.querySelectorAll("[data-ip-pick]")) {
      const toggle = (ev) => {
        if (ev.target.closest("[data-action]")) return;
        const id = el.dataset.ipPick;
        const on = !el.classList.contains("selected");
        el.classList.toggle("selected", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
        ui.sel = on ? [...new Set([...ui.sel, id])] : ui.sel.filter((x) => x !== id);
        tally();
      };
      el.addEventListener("click", toggle);
      el.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        toggle(ev);
      });
    }
    tally();
    // collapsing a category
    for (const head of root.querySelectorAll("[data-ip-toggle]")) {
      head.addEventListener("click", () => {
        const key = head.dataset.ipToggle;
        const section = head.closest(".nah-ip-section");
        const shut = !section.classList.contains("is-collapsed");
        section.classList.toggle("is-collapsed", shut);
        head.setAttribute("aria-expanded", shut ? "false" : "true");
        ui.collapsed = shut ? [...new Set([...ui.collapsed, key])] : ui.collapsed.filter((x) => x !== key);
      });
    }
    const open = (section) => {
      if (!section?.classList.contains("is-collapsed")) return;
      section.classList.remove("is-collapsed");
      section.querySelector("[data-ip-toggle]")?.setAttribute("aria-expanded", "true");
      ui.collapsed = ui.collapsed.filter((x) => x !== section.dataset.ipSection);
    };
    // jumping to a category
    for (const b of root.querySelectorAll("[data-ip-jump]")) {
      b.addEventListener("click", () => {
        const section = root.querySelector(`[data-ip-section="${b.dataset.ipJump}"]`);
        open(section);
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    // the search: filters as you type; Enter goes to the matches (and lights them up)
    const search = root.querySelector("[data-ip-search]");
    const filter = (term) => {
      for (const el of root.querySelectorAll("[data-ip-pick]")) el.classList.toggle("is-hidden", !!term && !el.dataset.find.includes(term) && !el.querySelector("p")?.textContent.toLowerCase().includes(term));
      for (const section of root.querySelectorAll(".nah-ip-section")) section.classList.toggle("is-hidden", !!term && !section.querySelector("[data-ip-pick]:not(.is-hidden)"));
    };
    filter(ui.search);
    search?.addEventListener("input", () => {
      ui.search = search.value.trim().toLowerCase();
      filter(ui.search);
    });
    search?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      const term = search.value.trim().toLowerCase();
      if (!term) return;
      const cards = [...root.querySelectorAll("[data-ip-pick]:not(.is-hidden)")];
      const exact = cards.filter((el) => el.querySelector("b")?.textContent.trim().toLowerCase() === term);
      const hits = exact.length ? exact : cards.filter((el) => el.dataset.find.includes(term));
      if (!hits.length) return ui.notifications.warn(L("NEONHOME.IP.Find.None", { term }));
      const names = hits.map((el) => el.querySelector("b")?.textContent.trim());
      // the other categories fold away, the ones with matches open
      const keep = new Set(hits.map((el) => el.closest(".nah-ip-section")));
      for (const section of root.querySelectorAll(".nah-ip-section")) {
        if (keep.has(section)) open(section);
        else if (section.dataset.ipSection !== "roles" && !section.classList.contains("is-collapsed")) {
          section.classList.add("is-collapsed");
          ui.collapsed = [...new Set([...ui.collapsed, section.dataset.ipSection])];
        }
      }
      setTimeout(() => hits[0].scrollIntoView({ behavior: "smooth", block: "center" }), 100);
      for (const el of hits) el.classList.add("is-found");
      setTimeout(() => hits.forEach((el) => el.classList.remove("is-found")), 3000);
      if (exact.length) ui.notifications.info(L("NEONHOME.IP.Find.Exact", { skill: names[0] }));
      else if (hits.length === 1) ui.notifications.info(L("NEONHOME.IP.Find.Partial", { skill: names[0] }));
      else ui.notifications.warn(L("NEONHOME.IP.Find.Many", { n: hits.length, skills: names.join(", ") }));
    });
    // the back-to-top button shows once the list has scrolled
    const top = root.querySelector(".nah-ip-top");
    const showTop = () => top?.classList.toggle("is-on", (body?.scrollTop ?? 0) > 240);
    body?.addEventListener("scroll", showTop, { passive: true });
    showTop();
  }
};
