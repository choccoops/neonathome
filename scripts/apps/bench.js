import { MODULE_ID, TEMPLATE_PATH } from "../constants.js";
import { Compat } from "../compat.js";
import { CPR } from "../cpr.js";
import { Settings } from "../settings.js";
import { HomeStore, docFrom } from "../home/store.js";
import { HomeOps } from "../home/ops.js";
import { effectiveWeapon, socketLayout, benefits, canAttach, canDetach } from "../data/attachments.js";
import { excerpt } from "../data/util.js";
import { DnD } from "./home-app.js";

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Readable name for an Active Effect key: bonuses.wardrobeAndStyle -> Wardrobe & Style. */
function keyLabel(key) {
  const stat = /^system\.stats\.(\w+)\.value$/.exec(key);
  if (stat) return stat[1].toUpperCase();
  const bonus = /^bonuses\.(\w+)$/.exec(key);
  if (!bonus) return key;
  const special = { universalAttack: L("NEONHOME.Bench.Point.attackmod"), universalDamage: L("NEONHOME.Bench.Point.damage"), allActions: L("NEONHOME.Bench.AllActions") };
  if (special[bonus[1]]) return special[bonus[1]];
  return bonus[1].replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\bAnd\b/g, "&").replace(/\bOr\b/g, "/").replace(/^./, (c) => c.toUpperCase());
}

/** An attachment's Active Effects, as { label, value }. */
function effectLines(upgrade) {
  const out = [];
  for (const e of upgrade.effects ?? []) {
    if (e.disabled) continue;
    for (const c of e.changes ?? []) out.push({ label: keyLabel(c.key), value: Number(c.value) ? signed(Number(c.value)) : c.value });
  }
  return out;
}

/** CPR's label for a weapon type (its keys and its label names differ for a few). */
const weaponTypeLabel = (t) => {
  const key = { bow: "bowsAndCrossbows", heavyMelee: "heavyMeleeWeapon", lightMelee: "lightMeleeWeapon", medMelee: "mediumMeleeWeapon", medPistol: "mediumPistol", vHeavyMelee: "veryHeavyMeleeWeapon", vHeavyPistol: "veryHeavyPistol" }[t] ?? t;
  return t ? L(`CPR.global.weaponType.${key}`) : "";
};

/** Benefit lines as text. */
function benefitText(upgrade) {
  return benefits(upgrade, MODULE_ID, { effects: effectLines(upgrade) }).map((b) => {
    switch (b.kind) {
      case "modifier":
        return { text: L(`NEONHOME.Bench.Mod.${b.point}`, { value: signed(b.value) }), situational: b.situational };
      case "override":
        return { text: L(`NEONHOME.Bench.Override.${b.point}`, { value: b.value }), situational: b.situational };
      case "secondary":
        return { text: L("NEONHOME.Bench.Secondary", { type: weaponTypeLabel(b.weaponType), damage: b.damage, rof: b.rof }) };
      case "effect":
        return { text: `${b.label} ${b.value}`, effect: true };
      default:
        return { text: b.text, custom: true };
    }
  });
}

/** The form for a custom attachment. */
async function craftDialog() {
  const row = (point) => `<div class="form-group"><label>${L(`NEONHOME.Bench.Point.${point}`)}</label>
    <div class="form-fields"><input type="number" name="${point}" step="1"><label class="checkbox"><input type="checkbox" name="${point}Override"> ${L("NEONHOME.Bench.SetTo")}</label></div></div>`;
  return Compat.DialogV2.prompt({
    window: { title: L("NEONHOME.Bench.Craft"), icon: "fa-solid fa-screwdriver-wrench" },
    position: { width: 480 },
    classes: ["neon-home-dialog"],
    rejectClose: false,
    content: `
      <div class="form-group"><label>${L("NEONHOME.Bio.Name")}</label><input type="text" name="name" placeholder="${esc(L("NEONHOME.Bench.CustomName"))}" autofocus></div>
      <div class="form-group"><label>${L("NEONHOME.Bench.Size")}</label><input type="number" name="size" value="1" min="0" max="9"></div>
      <div class="form-group"><label>${L("NEONHOME.Bench.Price")}</label><input type="number" name="price" value="0" min="0"></div>
      ${["attackmod", "damage", "rof", "magazine", "slots"].map(row).join("")}
      <div class="form-group stacked"><label>${L("NEONHOME.Bench.Benefits")}</label><textarea name="benefits" rows="3" placeholder="${esc(L("NEONHOME.Bench.BenefitsHint"))}"></textarea></div>
      <div class="form-group stacked"><label>${L("NEONHOME.Bench.Description")}</label><textarea name="description" rows="2"></textarea></div>
      <div class="form-group"><label class="checkbox"><input type="checkbox" name="fixed"> ${L("NEONHOME.Bench.FixedLabel")}</label></div>`,
    ok: {
      label: L("NEONHOME.Bench.CraftOk"),
      callback: (event, button) => {
        const f = button.form.elements;
        const mod = (p) => ({ value: f[p].value, override: f[`${p}Override`].checked });
        return {
          name: f.name.value.trim(), size: f.size.value, price: f.price.value, benefits: f.benefits.value, description: f.description.value, fixed: f.fixed.checked,
          attackmod: mod("attackmod"), damage: mod("damage"), rof: mod("rof"), magazine: mod("magazine"), slots: mod("slots")
        };
      }
    }
  });
}

export const Bench = {
  id: "bench",
  icon: "fa-solid fa-screwdriver-wrench",
  label: "NEONHOME.Bench.Title",
  template: `${TEMPLATE_PATH}/bench.hbs`,

  async prepare(app, actor) {
    const st = (app.uiState.bench ??= { weapon: null });
    const weapons = actor.items.filter((i) => i.type === "weapon" && i.system.installedItems).sort((a, b) => a.name.localeCompare(b.name));
    if (!weapons.some((w) => w.id === st.weapon)) st.weapon = weapons.find((w) => w.system.equipped === "equipped")?.id ?? weapons[0]?.id ?? null;
    const weapon = actor.items.get(st.weapon) ?? null;
    const canCraft = game.user.isGM || !!Settings.get("playerCrafting");
    const rack = weapons.map((w) => ({
      id: w.id, name: w.name, img: w.img, type: weaponTypeLabel(w.system.weaponType), selected: w.id === st.weapon,
      equipped: w.system.equipped === "equipped", attached: (w.system.installedItems.list ?? []).filter((id) => actor.items.get(id)?.type === "itemUpgrade").length
    }));
    if (!weapon) return { bench: { rack, weapon: null, canCraft } };

    const upgrades = (weapon.system.installedItems.list ?? []).map((id) => actor.items.get(id)).filter((u) => u?.type === "itemUpgrade");
    const ammo = (weapon.system.installedItems.list ?? []).map((id) => actor.items.get(id)).find((u) => u?.type === "ammo");
    const eff = effectiveWeapon(weapon, upgrades);
    const byId = new Map(upgrades.map((u) => [u.id, u]));
    const sockets = socketLayout(eff.slots, upgrades).map((s) => {
      const u = s.upgradeId ? byId.get(s.upgradeId) : null;
      return { ...s, filled: !!u, name: u?.name ?? "", img: u?.img ?? "" };
    });

    // The drawer: attachments for this kind of item on the character or in the stash.
    const stash = HomeStore.stash(actor);
    const drawer = [];
    for (const src of [{ doc: actor, label: L("NEONHOME.Loadout.OnYou") }, ...(stash ? [{ doc: stash, label: L("NEONHOME.Stash.Short") }] : [])]) {
      for (const u of src.doc.items) {
        if (u.type !== "itemUpgrade" || u.system.type !== weapon.type) continue;
        if (src.doc === actor && CPR.isInstalled(u)) continue;
        const check = canAttach(weapon, u, { free: eff.free });
        drawer.push({
          id: u.id, owner: src.doc.uuid, name: u.name, img: u.img, size: Number(u.system.size ?? 1), from: src.label,
          benefits: benefitText(u), ok: check.ok, reason: check.ok ? "" : L(`NEONHOME.Bench.Reason.${check.reason}`, { name: u.name }),
          amount: Number(u.system.amount ?? 1) > 1 ? Number(u.system.amount) : null
        });
      }
    }
    drawer.sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));

    return {
      bench: {
        rack,
        canCraft,
        drawer,
        stashed: !!stash,
        weapon: {
          id: weapon.id,
          name: weapon.name,
          img: weapon.img,
          type: weaponTypeLabel(weapon.system.weaponType),
          skill: weapon.system.weaponSkill,
          quality: weapon.system.quality ? L(`CPR.global.itemQuality.${weapon.system.quality}`) : "",
          hands: Number(weapon.system.handsReq) || 0,
          concealable: !!weapon.system.concealable?.concealable,
          ranged: !!weapon.system.isRanged,
          ammo: ammo ? `${ammo.name} (${weapon.system.magazine?.value ?? 0}/${eff.magazine})` : null,
          description: excerpt(weapon.system.description?.value, 220),
          rows: eff.rows.filter((r) => r.point !== "magazine" || weapon.system.isRanged || r.changed).map((r) => ({ ...r, label: L(`NEONHOME.Bench.Point.${r.point}`) })),
          used: eff.used,
          slots: eff.slots,
          free: eff.free,
          over: eff.free < 0,
          sockets,
          attachments: upgrades.map((u) => ({
            id: u.id, name: u.name, img: u.img, size: Number(u.system.size ?? 1), benefits: benefitText(u),
            canDetach: canDetach(u, MODULE_ID), description: excerpt(u.system.description?.value, 160)
          }))
        }
      }
    };
  },

  onRender(app, el) {
    DnD.sources(el);
    DnD.targets(el, (data, target) => {
      if (!data.neonHome || !data.itemId) return;
      const weaponId = app.uiState.bench?.weapon;
      if (target.dataset.drop === "bench" && data.kind === "attachment") return app.act(() => HomeOps.attach(app.actor, weaponId, data.itemId, data.owner));
      if (target.dataset.drop === "drawer" && data.kind === "installed") return app.act(() => HomeOps.detach(app.actor, weaponId, data.itemId));
    });
  },

  actions: {
    benchSelect(event, target) {
      this.uiState.bench.weapon = target.closest("[data-item-id]").dataset.itemId;
      this.render();
    },
    benchAttach(event, target) {
      const el = target.closest("[data-item-id]");
      return this.act(() => HomeOps.attach(this.actor, this.uiState.bench.weapon, el.dataset.itemId, el.dataset.owner));
    },
    benchDetach(event, target) {
      const id = target.closest("[data-item-id]").dataset.itemId;
      return this.act(() => HomeOps.detach(this.actor, this.uiState.bench.weapon, id, { stow: target.dataset.stow === "1" }));
    },
    async benchCraft() {
      const data = await craftDialog();
      if (!data) return;
      return this.act(async () => {
        const item = await HomeOps.createAttachment(this.actor, { ...data, for: "weapon" });
        if (item) ui.notifications.info(L("NEONHOME.Bench.Crafted", { name: item.name }));
      });
    },
    benchOpen(event, target) {
      const el = target.closest("[data-item-id]");
      const doc = docFrom(el.dataset.owner) ?? this.actor;
      doc?.items?.get(el.dataset.itemId)?.sheet.render(true);
    }
  }
};
