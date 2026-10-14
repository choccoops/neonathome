import { MODULE_ID, TEMPLATE_PATH, NEON_HUB_ID } from "../constants.js";
import { Settings } from "../settings.js";
import { HomeStore, docFrom } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { Downtime } from "../home/downtime.js";
import { computeWeight } from "../data/weight.js";
import { DnD } from "./home-app.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/** The look of a vehicle in a bay or on the street. */
function card(v, actor) {
  const base = { uuid: v.uuid, kind: v.kind, name: v.name, img: v.img, active: v.active, missing: !!v.missing, canOpen: !!v.canOpen, bay: v.bay };
  if (v.missing) return base;
  if (v.kind === "item") {
    const s = v.stats;
    return {
      ...base,
      isItem: true,
      stats: [
        { icon: "fa-solid fa-car-burst", label: L("NEONHOME.Bay.SDP"), value: s.sdp },
        { icon: "fa-solid fa-couch", label: L("NEONHOME.Bay.Seats"), value: s.seats },
        { icon: "fa-solid fa-gauge-high", label: L("NEONHOME.Bay.Combat"), value: s.speedCombat },
        { icon: "fa-solid fa-road", label: L("NEONHOME.Bay.Narrative"), value: s.speedNarrative || "—" }
      ],
      slots: { used: s.used, max: s.slots },
      upgrades: v.upgrades.map((u) => ({ name: u.name, img: u.img })),
      owner: actor.uuid,
      itemId: v.doc.id
    };
  }
  const s = v.stats;
  const hpPct = s.hp.max ? Math.max(0, Math.min(100, Math.round((s.hp.value / s.hp.max) * 100))) : 0;
  const weightRules = Settings.weight;
  let cargo = null;
  if (weightRules.enabled) {
    const cap = Number(v.doc.getFlag(MODULE_ID, "cargo")) || Number(v.doc.getFlag("mmutons-cyberpunk-red-weight-system", "vehicleCapacity")) || null;
    const w = computeWeight(Array.from(v.doc.items), weightRules, { moduleId: MODULE_ID, vehicle: true, cargo: cap, actorInstalled: Array.from(v.doc.system?.installedItems?.list ?? []) });
    cargo = { current: w.current, max: w.max, pct: Math.min(100, w.pct), status: w.status };
  }
  return {
    ...base,
    isActor: true,
    vas: v.vas,
    hp: s.hp,
    hpPct,
    hpState: hpPct <= 25 ? "critical" : hpPct < 100 ? "hurt" : "ok",
    stats: [
      { icon: "fa-solid fa-heart-pulse", label: L("NEONHOME.Bay.HP"), value: `${s.hp.value}/${s.hp.max}` },
      { icon: "fa-solid fa-shield-halved", label: L("NEONHOME.Bay.SP"), value: s.spMax ? `${s.sp}/${s.spMax}` : "—" },
      { icon: "fa-solid fa-gauge-high", label: L("NEONHOME.Bay.Move"), value: s.move },
      { icon: "fa-solid fa-users", label: L("NEONHOME.Bay.Crew"), value: s.seatCount ? `${s.crew}/${s.seatCount}` : "—" }
    ],
    seats: s.seats.map((p) => ({
      name: p.name,
      max: p.max,
      occupants: p.occupants,
      empty: Math.max(0, p.max - p.occupants.length),
      emptyList: Array.from({ length: Math.max(0, p.max - p.occupants.length) }),
      weapons: p.weapons.map((w) => w.name).join(", "),
      glass: p.glass,
      gunner: p.canControlWeapons
    })),
    mounted: s.mounted,
    upgrades: s.upgrades.map((u) => ({ name: u.name, img: u.img })),
    injuries: s.injuries.map((i) => i.name),
    cargo
  };
}

export const Bay = {
  id: "bay",
  icon: "fa-solid fa-warehouse",
  label: "NEONHOME.Bay.Title",
  template: `${TEMPLATE_PATH}/bay.hbs`,

  async prepare(app, actor) {
    const { bay, bays, street, moved } = HomeStore.layout(actor);
    const cards = new Map();
    const make = (v) => {
      if (!cards.has(v.uuid)) cards.set(v.uuid, card(v, actor));
      return cards.get(v.uuid);
    };
    const active = [...bays.map((b) => b.vehicle), ...street].find((v) => v?.active);
    return {
      bay: {
        // parking and swapping vehicles is done in downtime (the GM's setting)
        locked: !Downtime.allows(actor, "bay"),
        homeName: bay.homeName || L("NEONHOME.Home.Unnamed"),
        slots: bay.slots,
        used: bays.filter((b) => b.vehicle).length,
        source: L(`NEONHOME.Bay.Source.${bay.source}`),
        override: HomeStore.home(actor).bayOverride,
        bays: bays.map((b) => ({ index: b.index, number: String(b.index + 1).padStart(2, "0"), vehicle: b.vehicle ? make(b.vehicle) : null })),
        street: street.map(make),
        moved: moved.length,
        active: active ? active.name : null,
        candidates: HomeStore.candidateVehicles(actor).map((a) => ({ uuid: a.uuid, name: a.name })),
        vasActive: HomeStore.vasActive(),
        hubActive: !!game.modules.get(NEON_HUB_ID)?.active,
        canManage: HomeStore.canManage(actor)
      }
    };
  },

  onRender(app, el) {
    DnD.sources(el);
    DnD.targets(el, (data, target) => Bay.onDrop(app, data, target));
    el.querySelector("input[name=bayOverride]")?.addEventListener("change", (ev) => {
      const v = ev.target.value;
      app.act(() => HomeOps.updateHome(app.actor, { bayOverride: v === "" ? null : Number(v) }));
    });
  },

  async onDrop(app, data, target) {
    const actor = app.actor;
    const bay = target.dataset.drop === "bay" ? Number(target.dataset.bay) : null;
    // A vehicle card moved between bays and the street.
    if (data.neonHome && data.vehicle) return app.act(() => HomeOps.park(actor, data.vehicle, bay));
    // An actor from the sidebar, or a vehicle item: add it to the garage, then park it.
    if ((data.type === "Actor" || data.type === "Item") && data.uuid) {
      return app.act(async () => {
        await HomeOps.addVehicle(actor, data.uuid);
        if (bay !== null || target.dataset.drop === "street") await HomeOps.park(actor, data.uuid, bay);
      });
    }
  },

  actions: {
    bayOpen(event, target) {
      const doc = docFrom(target.closest("[data-vehicle]")?.dataset.vehicle);
      if (!doc) return;
      if (!doc.testUserPermission(game.user, "OBSERVER")) return ui.notifications.warn(L("NEONHOME.Error.NoPermission"));
      doc.sheet.render(true);
    },
    bayActive(event, target) {
      return this.act(() => HomeOps.setActive(this.actor, target.closest("[data-vehicle]").dataset.vehicle));
    },
    bayStreet(event, target) {
      return this.act(() => HomeOps.park(this.actor, target.closest("[data-vehicle]").dataset.vehicle, null));
    },
    async bayPark(event, target) {
      const uuid = target.closest("[data-vehicle]").dataset.vehicle;
      const { bays } = HomeStore.layout(this.actor);
      const free = bays.find((b) => !b.vehicle);
      if (!free) return ui.notifications.warn(L("NEONHOME.Bay.Full"));
      return this.act(() => HomeOps.park(this.actor, uuid, free.index));
    },
    bayRemove(event, target) {
      const uuid = target.closest("[data-vehicle]").dataset.vehicle;
      return this.act(() => HomeOps.removeVehicle(this.actor, uuid));
    },
    bayAdd(event, target) {
      const uuid = target.closest(".nah-bay-add")?.querySelector("select[name=vehicle]")?.value;
      if (!uuid) return;
      return this.act(() => HomeOps.addVehicle(this.actor, uuid));
    }
  }
};
