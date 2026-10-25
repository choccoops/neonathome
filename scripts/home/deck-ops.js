import { MODULE_ID } from "../constants.js";
import { CPR } from "../cpr.js";
import { HomeStore } from "./store.js";
import { HomeOps, RuleBlock } from "./ops.js";
import { Downtime } from "./downtime.js";
import {
  LINKS, rigRange, deckBase, deckCapacity, layout, fits, slotKind, slotSize, quickhackOf, cybersuiteOf, QUICKHACK_BY_NAME
} from "../data/netrun.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/** Actor flag: the netrunner's rig ({ link }: how the active deck connects). */
export const RIG_FLAG = "rig";
/** A Clinic job (swapping a Cybersuite's deck): an hour (Chapter 10). */
export const CLINIC_MINUTES = 60;

/** NET Actions a Turn by Interface rank (Chapter 10, Your Rig). */
export const netActions = (rank) => (rank >= 10 ? 5 : rank >= 7 ? 4 : rank >= 4 ? 3 : 2);

const named = (re) => (i) => re.test(i.name ?? "");

/**
 * The netrunner's quickhack suite (Cyberpunk: The Unification Era, Chapter 10): the deck they run
 * (Cyberpunk RED's equipped cyberdeck), how it connects, and the Programs, quickhacks and Hardware
 * slotted in it, Program-only and Hardware-only slots kept apart as the 2070 decks have them.
 */
export const DeckOps = {
  /** Everything about a character's rig, for the tab and the checks. */
  rig(actor) {
    const items = [...(actor?.items ?? [])];
    const decks = items.filter((i) => i.type === "cyberdeck");
    const deck = decks.find((d) => d.system?.equipped === "equipped") ?? null;
    const installed = items.filter((i) => i.type === "cyberware" && i.system?.isInstalled);
    const suiteItem = installed.find((i) => cybersuiteOf(i, MODULE_ID));
    const cybersuite = suiteItem ? cybersuiteOf(suiteItem, MODULE_ID) : null;
    const armDeck = installed.some(named(/^cyberdeck \(arm\)/i));
    const can = { suite: !!cybersuite, hand: true, arm: armDeck };
    const stored = actor?.getFlag?.(MODULE_ID, RIG_FLAG)?.link;
    const link = LINKS.includes(stored) && can[stored] ? stored : cybersuite ? "suite" : armDeck ? "arm" : "hand";
    const extras = {
      exDisks: installed.filter(named(/^ex-disk/i)).length,
      armUpgrades: installed.filter(named(/integrated cyberdeck upgrade/i)).length,
      coatings: installed.filter(named(/integrated bodyweight/i)).length,
      suit: items.some((i) => i.system?.equipped === "equipped" && /bodyweight suit|netsuit/i.test(i.name ?? ""))
    };
    const list = deck ? (deck.system?.installedItems?.list ?? []).map((id) => actor.items.get(id)).filter(Boolean) : [];
    const slotted = list.filter((i) => slotKind(i)).map((i) => ({ id: i.id, kind: slotKind(i), size: slotSize(i), item: i }));
    const cap = deck ? deckCapacity(deckBase(deck, MODULE_ID), link, extras) : null;
    const hw = slotted.filter((s) => s.kind === "hardware").map((s) => s.item.name);
    return {
      deck, decks, link, can, cybersuite, extras, cap, slotted,
      layout: cap ? layout(cap, slotted) : null,
      range: rigRange(link, { rangeUpgrade: hw.some((n) => /range upgrade/i.test(n)), sigboosters: hw.filter((n) => /sigbooster/i.test(n)).length }),
      // a Cybersuite's quickhacks are built in: no slots, can't be removed (only while it holds the deck)
      builtIn: link === "suite" && cybersuite ? cybersuite.builtIn.map((n) => QUICKHACK_BY_NAME.get(n.toLowerCase()) ?? { name: n }) : [],
      interface: CPR.roles(actor).netrunner ?? 0,
      hummingbird: /hummingbird/i.test(deck?.name ?? "")
    };
  },

  inCombat(actor) {
    const c = game.combat;
    return !!c?.started && !!c.combatants?.some?.((x) => x.actor === actor || x.actorId === actor.id);
  },

  /** Swapping a Program or Hardware in or out takes a minute, out of combat (the GM can anyway). */
  _swapping(actor) {
    if (!game.user.isGM && this.inCombat(actor)) throw new RuleBlock(L("NEONHOME.Deck.NotInCombat"));
  },

  /** A Clinic job (a Cybersuite's deck in or out): the GM, or the player spending an hour of downtime. */
  async _clinic(actor, label) {
    if (game.user.isGM) return null;
    if (!Downtime.isActive(actor)) throw new RuleBlock(L("NEONHOME.Deck.Clinic", { name: actor.name }));
    return Downtime.spend(actor, CLINIC_MINUTES, { label, data: { action: "clinic" } });
  },

  /**
   * Keep Cyberpunk RED's slot count on the deck in step with the rig (its install checks read it),
   * noting the deck's own split the first time so slots the link adds aren't counted as its own.
   */
  async syncSlots(actor, rig = this.rig(actor)) {
    const deck = rig.deck;
    if (!deck || !actor.isOwner) return;
    if (!deck.getFlag?.(MODULE_ID, "deck")?.slots) await deck.setFlag(MODULE_ID, "deck", { ...(deck.getFlag?.(MODULE_ID, "deck") ?? {}), slots: deckBase(deck, MODULE_ID) });
    const now = Number(deck.system?.installedItems?.slots) || 0;
    const want = Math.max(rig.cap.total, rig.slotted.reduce((n, s) => n + s.size, 0));
    if (now !== want) await deck.update({ "system.installedItems.slots": want });
  },

  /** Run another deck (a Meat Action), or none. Out of a Cybersuite's deck is a Clinic job. */
  async setDeck(actor, deckId) {
    const rig = this.rig(actor);
    const next = deckId ? actor.items.get(deckId) : null;
    if (deckId && next?.type !== "cyberdeck") throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    if (rig.deck?.id === next?.id) return;
    if (rig.link === "suite") await this._clinic(actor, L("NEONHOME.Deck.ClinicLabel", { deck: next?.name ?? rig.deck?.name ?? "" }));
    if (rig.deck) await CPR.setEquipped(actor, rig.deck, "carried");
    if (next) await CPR.setEquipped(actor, next, "equipped");
    await this.syncSlots(actor);
    await ChatMessage.create({
      content: HomeOps._card("fa-solid fa-microchip", L(`NEONHOME.Deck.Card.${next ? "deck" : "noDeck"}`, { name: esc(actor.name), deck: esc(next?.name ?? "") })),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  },

  /** How the deck connects. Into or out of a Cybersuite is a Clinic job. */
  async setLink(actor, link) {
    const rig = this.rig(actor);
    if (!LINKS.includes(link) || !rig.can[link]) throw new RuleBlock(L(`NEONHOME.Deck.Cant.${link}`, { name: actor.name }));
    if (rig.link === link) return;
    if (rig.deck && (link === "suite" || rig.link === "suite")) await this._clinic(actor, L("NEONHOME.Deck.ClinicLabel", { deck: rig.deck.name }));
    await actor.setFlag(MODULE_ID, RIG_FLAG, { ...(actor.getFlag(MODULE_ID, RIG_FLAG) ?? {}), link });
    await this.syncSlots(actor);
  },

  /**
   * Slot a Program, quickhack or Hardware into the running deck: it has to fit the slots of its
   * kind. From the home stash, it comes over first (the stash is reached in downtime).
   */
  async slot(actor, itemId, { fromUuid = null } = {}) {
    this._swapping(actor);
    let rig = this.rig(actor);
    if (!rig.deck) throw new RuleBlock(L("NEONHOME.Deck.NoDeck", { name: actor.name }));
    const from = fromUuid && fromUuid !== actor.uuid ? HomeStore.stash(actor) : null;
    let item = from ? from.items.get(itemId) : actor.items.get(itemId);
    if (!item) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
    const kind = slotKind(item);
    if (!kind) throw new RuleBlock(L("NEONHOME.Deck.NotDeckGear", { item: item.name }));
    if (CPR.isInstalled(item) && item.parent === actor) throw new RuleBlock(L("NEONHOME.Deck.Already", { item: item.name }));
    if (!fits(rig.cap, rig.slotted, { id: item.id, kind, size: slotSize(item) })) {
      throw new RuleBlock(L("NEONHOME.Deck.NoRoom", { item: item.name, kind: L(`NEONHOME.Deck.Kind.${kind}`) }));
    }
    if (from) {
      const newId = await HomeOps.transfer(actor, from.uuid, itemId, actor.uuid, { amount: 1, equipped: "owned" });
      item = actor.items.get(newId);
      if (!item) throw new RuleBlock(L("NEONHOME.Error.NotFound"));
      rig = this.rig(actor);
    }
    await this.syncSlots(actor, rig);
    const ok = await CPR.install(rig.deck, [item]);
    if (ok === false) throw new RuleBlock(L("NEONHOME.Deck.NoRoom", { item: item.name, kind: L(`NEONHOME.Deck.Kind.${kind}`) }));
    return item;
  },

  /** Take something out of the deck (and to the home stash, if asked). */
  async unslot(actor, itemId, { stow = false } = {}) {
    this._swapping(actor);
    const rig = this.rig(actor);
    const item = actor.items.get(itemId);
    if (!rig.deck || !item) return;
    await CPR.uninstall(rig.deck, [item]);
    if (stow) await HomeOps.stow(actor, itemId);
  },

  /** For display: what an item is, as a quickhack (or null). */
  quickhack(item) {
    return quickhackOf(item, MODULE_ID);
  }
};
