import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Settings } from "../settings.js";
import { CPR } from "../cpr.js";
import { HomeStore } from "../home/store.js";
import { Downtime } from "../home/downtime.js";
import { DeckOps, netActions } from "../home/deck-ops.js";
import { LINKS, slotKind, slotSize, quickhackOf, deckBase, fits, cybersuiteOf } from "../data/netrun.js";
import { DnD } from "./home-app.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const strip = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Library tabs: what's on the character (and in the home stash) that a deck takes. */
const TABS = ["quickhacks", "programs", "hardware", "decks", "cybersuites"];
const tabOf = (item) => {
  if (item.type === "cyberdeck") return "decks";
  if (cybersuiteOf(item, MODULE_ID)) return "cybersuites";
  const kind = slotKind(item);
  if (kind === "hardware") return "hardware";
  if (kind === "program") return quickhackOf(item, MODULE_ID) ? "quickhacks" : "programs";
  return null;
};

const cd = (q) => (typeof q.cooldown === "number" ? L("NEONHOME.Deck.Rounds", { n: q.cooldown }) : String(q.cooldown ?? ""));

/** What an item is, in a line: a quickhack's DV, Cooldown and Quiet; a program's class; hardware's slots. */
function info(item) {
  const q = quickhackOf(item, MODULE_ID);
  if (q) return { dv: q.dv, cooldown: cd(q), quiet: !!q.quiet, needs: q.needs ?? "", type: q.vehicle ? L("NEONHOME.Deck.Vehicle") : q.type, effect: q.effect ?? strip(item.system?.description?.value) };
  if (item.type === "program") return { type: L(`CPR.global.programClass.${{ antipersonnelattacker: "antiPersonnelAttacker", antiprogramattacker: "antiProgramAttacker" }[item.system?.class] ?? item.system?.class ?? "booster"}`), effect: strip(item.system?.description?.value) };
  return { type: L("NEONHOME.Deck.Kind.hardware"), effect: strip(item.system?.description?.value) };
}

function row(item, ctx, { from = null } = {}) {
  // a Cybersuite: neuralware, installed through the character sheet (Hospital, HL 7)
  const suite = cybersuiteOf(item, MODULE_ID);
  if (suite) {
    return {
      id: item.id, from: from ?? "", name: item.name, img: item.img, kind: null, size: 0, cybersuite: true,
      installed: CPR.isInstalled(item),
      type: CPR.isInstalled(item) ? L("NEONHOME.Deck.SuiteInstalled") : L("NEONHOME.Deck.SuiteLoose"),
      effect: [suite.builtIn.length ? L("NEONHOME.Deck.SuiteBuiltIn", { list: suite.builtIn.join(", ") }) : "", suite.perk].filter(Boolean).join(" "),
      selected: ctx.focus === item.id
    };
  }
  const kind = slotKind(item);
  const i = info(item);
  return {
    id: item.id,
    from: from ?? "",
    name: item.name,
    img: item.img,
    kind,
    size: slotSize(item),
    ...i,
    fits: kind && ctx.rig.cap ? fits(ctx.rig.cap, ctx.rig.slotted, { id: item.id, kind, size: slotSize(item) }) : false,
    selected: ctx.focus === item.id
  };
}

export const Deck = {
  id: "deck",
  icon: "fa-solid fa-microchip",
  label: "NEONHOME.Deck.Title",
  template: `${TEMPLATE_PATH}/deck.hbs`,
  available: () => Settings.get("deckTab") !== false,

  async prepare(app, actor) {
    const isGM = game.user.isGM;
    const ui = (app.uiState.deck ??= { tab: "quickhacks", focus: null });
    const rig = DeckOps.rig(actor);
    const ctx = { rig, focus: ui.focus };
    const byId = new Map(rig.slotted.map((s) => [s.id, s]));
    const cells = (rig.layout?.cells ?? []).filter((c) => !c.item || c.first).map((c) => {
      const s = c.item ? byId.get(c.item) : null;
      return {
        kind: c.kind,
        kindLabel: L(`NEONHOME.Deck.Slot.${c.kind}`),
        span: s ? Math.max(1, s.size) : 1,
        item: s ? row(s.item, ctx) : null
      };
    });
    const over = (rig.layout?.over ?? []).map((id) => byId.get(id)).filter(Boolean).map((s) => row(s.item, ctx));
    // the library: on the character, not slotted anywhere; and in the home stash, when it's reachable
    const stash = HomeStore.stash(actor);
    const stashOpen = !!stash && Downtime.allows(actor, "stash");
    // Cybersuites show installed too (the one in the Neuroport, and any others the character owns)
    const loose = [...actor.items].filter((i) => tabOf(i) && (tabOf(i) === "cybersuites" || !CPR.isInstalled(i)) && i.id !== rig.deck?.id);
    const stashed = stashOpen ? [...stash.items].filter((i) => tabOf(i) && !["decks", "cybersuites"].includes(tabOf(i)) && !CPR.isInstalled(i)) : [];
    if (!TABS.includes(ui.tab)) ui.tab = "quickhacks";
    const rows = [...loose.map((i) => row(i, ctx)), ...stashed.map((i) => ({ ...row(i, ctx, { from: stash.uuid }), stash: true }))]
      .filter((r) => tabOf(r.from ? stash.items.get(r.id) : actor.items.get(r.id)) === ui.tab)
      .sort((a, b) => (a.stash - b.stash) || a.name.localeCompare(b.name));
    const all = [...rig.slotted.map((s) => s.item), ...loose, ...stashed];
    const focusItem = all.find((i) => i.id === ui.focus) ?? null;
    const used = rig.slotted.reduce((n, s) => n + s.size, 0);
    const base = rig.deck ? deckBase(rig.deck, MODULE_ID) : null;
    return {
      deck: {
        isGM,
        hasDeck: !!rig.deck,
        deck: rig.deck ? {
          id: rig.deck.id, name: rig.deck.name, img: rig.deck.img,
          quality: L(`NEONHOME.Deck.Quality.${rig.deck.system?.quality ?? "standard"}`),
          rule: rig.deck.getFlag?.(MODULE_ID, "deck")?.rule ?? "",
          split: [base.program && L("NEONHOME.Deck.Split.program", { n: base.program }), base.hardware && L("NEONHOME.Deck.Split.hardware", { n: base.hardware }), base.either && L("NEONHOME.Deck.Split.either", { n: base.either })].filter(Boolean).join(" + ")
        } : null,
        decks: rig.decks.map((d) => ({ id: d.id, name: d.name, selected: d.id === rig.deck?.id })),
        links: LINKS.map((k) => ({ key: k, label: L(`NEONHOME.Deck.Link.${k}`), selected: k === rig.link, disabled: !rig.can[k] })),
        linkHint: L(`NEONHOME.Deck.LinkHint.${rig.link}`),
        range: rig.range,
        iface: rig.interface,
        net: netActions(rig.interface) + (rig.hummingbird ? 1 : 0),
        cap: rig.cap,
        used,
        cells,
        over,
        extras: [
          rig.extras.suit && L("NEONHOME.Deck.Extra.suit"),
          rig.link === "suite" && rig.extras.exDisks && L("NEONHOME.Deck.Extra.exDisk", { n: rig.extras.exDisks }),
          rig.link === "arm" && L("NEONHOME.Deck.Extra.arm", { n: 1 + rig.extras.armUpgrades }),
          rig.link === "arm" && rig.extras.coatings && L("NEONHOME.Deck.Extra.coating", { n: 2 * rig.extras.coatings })
        ].filter(Boolean),
        cybersuite: rig.cybersuite ? { name: rig.cybersuite.name, perk: rig.cybersuite.perk } : null,
        builtIn: rig.builtIn.map((q) => ({ name: q.name, dv: q.dv, cooldown: q.cooldown !== undefined ? cd(q) : "", quiet: !!q.quiet, effect: q.effect ?? "" })),
        inCombat: DeckOps.inCombat(actor),
        tabs: TABS.map((t) => ({ key: t, label: L(`NEONHOME.Deck.Tab.${t}`), selected: t === ui.tab, count: [...loose, ...stashed].filter((i) => tabOf(i) === t).length })),
        tab: ui.tab,
        rows,
        stashLocked: !!stash && !stashOpen,
        focus: focusItem ? {
          ...row(focusItem, ctx, { from: focusItem.parent === actor ? null : stash?.uuid }),
          slotted: rig.slotted.some((s) => s.id === focusItem.id),
          canStow: !!stash && Downtime.allows(actor, "stash"),
          deckItem: focusItem.type === "cyberdeck",
          suiteItem: !!cybersuiteOf(focusItem, MODULE_ID)
        } : null
      }
    };
  },

  actions: {
    deckTab(event, target) {
      (this.uiState.deck ??= {}).tab = target.dataset.tab;
      this.render();
    },
    deckFocus(event, target) {
      (this.uiState.deck ??= {}).focus = target.closest("[data-item-id]")?.dataset.itemId ?? null;
      this.render();
    },
    deckSlot(event, target) {
      const el = target.closest("[data-item-id]");
      return this.act(() => DeckOps.slot(this.actor, el.dataset.itemId, { fromUuid: el.dataset.from || null }));
    },
    deckUnslot(event, target) {
      const el = target.closest("[data-item-id]");
      return this.act(() => DeckOps.unslot(this.actor, el.dataset.itemId, { stow: target.dataset.stow === "1" }));
    },
    deckRun(event, target) {
      const id = target.closest("[data-item-id]")?.dataset.itemId;
      return this.act(() => DeckOps.setDeck(this.actor, id));
    }
  },

  onRender(app, root) {
    for (const select of root.querySelectorAll("select[data-deck]")) {
      select.addEventListener("change", () => {
        if (select.dataset.deck === "deck") app.act(() => DeckOps.setDeck(app.actor, select.value || null));
        if (select.dataset.deck === "link") app.act(() => DeckOps.setLink(app.actor, select.value));
      });
    }
    // drag gear from the library onto the deck
    DnD.sources(root);
    DnD.targets(root, (data) => {
      if (!data?.neonHome || !data.itemId) return;
      return app.act(() => DeckOps.slot(app.actor, data.itemId, { fromUuid: data.from || null }));
    });
  }
};
