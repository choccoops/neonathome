/**
 * A character with a home for tests and previews: armor with upgrades, weapons with attachments,
 * a stash, a VAS vehicle in the bay, a bike on the street, an injury and some Syndromes.
 * Import after tests/helpers/foundry.mjs.
 */
import { makeActor } from "./foundry.mjs";

const M = "cpr-neon-at-home";

export function buildFixture() {
  const mods = () => ({
    attackmod: { type: "modifier", value: null }, damage: { type: "modifier", value: null }, rof: { type: "modifier", value: null },
    magazine: { type: "modifier", value: null }, slots: { type: "modifier", value: null }, secondaryWeapon: { configured: false }
  });

  // The character's home stash and a VAS vehicle.
  const stash = makeActor({ name: "Vex's Stash", type: "container" }, [
    { _id: "stashRifle00000a", name: "Assault Rifle", type: "weapon", system: { equipped: "owned", weaponType: "assaultRifle", handsReq: 2, installedItems: { list: [], slots: 3 } } },
    { _id: "stashScope00000a", name: "Sniping Scope", type: "itemUpgrade", system: { type: "weapon", size: 1, modifiers: { ...mods(), attackmod: { type: "modifier", value: 1, isSituational: true } } } },
    { _id: "stashPad0000000a", name: "Plate Padding", type: "itemUpgrade", system: { type: "armor", size: 1, modifiers: mods() }, flags: { [M]: { item: { upgrade: { key: "platePadding", location: "body", classes: ["light"], effects: ["stealth"] } } } } }
  ]);
  const car = makeActor({
    name: "Thorton Galena",
    type: "character",
    flags: { "mmutons-cyberpunk-red-vas": { positions: [{ id: "p1", name: "Driver", maxOccupants: 1, occupants: [], order: 1 }, { id: "p2", name: "Gunner", maxOccupants: 2, occupants: [], order: 2, canControlWeapons: true, bulletproofGlass: true, glassHp: 10, glassHpMax: 15 }] } },
    system: { derivedStats: { hp: { value: 40, max: 50 } }, stats: { move: { value: 20 } } }
  }, [
    { name: "Pintle MG", type: "weapon", system: { equipped: "owned", weaponType: "assaultRifle", installedItems: { list: [] } }, flags: { "mmutons-cyberpunk-red-vas": { mountedPosition: "p2" } } },
    { name: "Car Armor", type: "armor", system: { equipped: "equipped", isBodyLocation: true, bodyLocation: { sp: 13, ablation: 1 }, headLocation: { sp: 0, ablation: 0 } } },
    { name: "Spare Tire", type: "gear", system: { equipped: "owned", amount: 1 }, flags: { [M]: { item: { weight: 8 } } } }
  ]);

  const actor = makeActor({
    name: "Vex",
    type: "character",
    system: {
      stats: { body: { value: 6 }, emp: { value: 1, max: 6 }, luck: { value: 3, max: 6 } },
      derivedStats: { hp: { value: 18, max: 40 }, seriouslyWounded: 20, currentWoundState: "seriouslyWounded", deathSave: { penalty: 1 }, humanity: { value: 14, max: 60 } },
      // cyberware in the body is on the actor's own list
    installedItems: { list: ["neuralink000000a", "pocket000000000a", "cyberarm0000000a"] },
    externalData: { currentArmorBody: { id: "bodyArmor000000a", value: 11, max: 12 }, currentArmorHead: { id: "", value: 0, max: 0 }, currentArmorShield: { id: "", value: 0, max: 0 } }
    },
    flags: {
      [M]: {
        home: { stash: stash.uuid, vehicles: [{ uuid: car.uuid, bay: 0, active: true }], bayOverride: 2 },
        psyche: {
          catharsis: 6,
          inspiration: 2,
          deepest: 2,
          syndromes: [
            { id: "s1", key: "kleptomania", tier: 1 },
            { id: "s2", key: "paralogic", tier: 2, variant: "knight" },
            { id: "s3", key: "custom", tier: 3, name: "Glitch Hunger", severity: "extreme", stressor: "Must eat a chip a day." }
          ]
        }
      }
    }
  }, [
    { _id: "bodyArmor000000a", name: "Medium Armorjack (Body)", type: "armor", system: { equipped: "equipped", isBodyLocation: true, isHeadLocation: false, isShield: false, penalty: -2, bodyLocation: { sp: 12, ablation: 1 }, headLocation: { sp: 0, ablation: 0 }, installedItems: { list: ["ammoBag00000000a", "flex00000000000a"], slots: 5, allowed: true, allowedTypes: ["itemUpgrade"] } } },
    { _id: "ammoBag00000000a", name: "Ammo bag", type: "itemUpgrade", system: { type: "armor", size: 1, modifiers: mods() }, flags: { [M]: { item: { upgrade: { key: "ammoBag", location: "body", pools: [{ slots: 2, accepts: "ammo" }] } } } } },
    { _id: "flex00000000000a", name: "Improved Flexibility", type: "itemUpgrade", system: { type: "armor", size: 3, modifiers: mods() }, flags: { [M]: { item: { upgrade: { key: "flex", location: "body", effects: ["reliefDex"] } } } } },
    { _id: "pistol000000000a", name: "Militech Avenger", type: "weapon", system: { equipped: "equipped", weaponType: "heavyPistol", weaponSkill: "Handgun", handsReq: 1, isRanged: true, damage: "3d6", rof: 2, attackmod: 0, magazine: { value: 8, max: 8 }, quality: "standard", installedItems: { list: ["extMag000000000a", "ammoHP000000000a"], slots: 3 } } },
    { _id: "extMag000000000a", name: "Extended Magazine", type: "itemUpgrade", system: { type: "weapon", size: 1, modifiers: { ...mods(), magazine: { type: "modifier", value: 4 } } }, flags: { [M]: { item: { attachment: { benefits: "Looks mean", fixed: true } } } } },
    { _id: "ammoHP000000000a", name: "Heavy Pistol Rounds", type: "ammo", system: { variety: "heavyPistol", amount: 40 } },
    { _id: "smartLink000000a", name: "Smartgun Link", type: "itemUpgrade", system: { type: "weapon", size: 1, modifiers: mods() } },
    { _id: "rifle0000000000a", name: "Tsunami Arms Helix", type: "weapon", system: { equipped: "carried", weaponType: "assaultRifle", handsReq: 2, price: { market: 500 }, installedItems: { list: [], slots: 3 } }, flags: { [M]: { item: { condition: "damaged", cause: "maintenance", malfunction: { table: "weapon", roll: 5, at: 0, until: null } } } } },
    { _id: "agent0000000000a", name: "Agent", type: "gear", system: { equipped: "carried", amount: 1 } },
    { _id: "cyberarm0000000a", name: "Cyberarm", type: "cyberware", system: { type: "cyberArm", isFoundational: true, size: 0, installedItems: { list: ["popupgun000000a"], slots: 4 } } },
    { _id: "popupgun000000a", name: "Popup Gun", type: "cyberware", system: { type: "cyberArm", isWeapon: true, size: 2, installedItems: { list: [] } }, flags: { [M]: { item: { emp: true } } } },
    { _id: "pocket000000000a", name: "Subdermal Pocket", type: "cyberware", system: { type: "cyberwareExternal", installedItems: { list: [] } } },
    { _id: "neuralink000000a", name: "Neural Link", type: "cyberware", system: { type: "neuralWare", price: { market: 500 }, installedItems: { list: [], slots: 5 } } },
    { _id: "kibble000000000a", name: "Kibble", type: "gear", system: { equipped: "equipped", amount: 1 }, flags: { "cpr-neon-hub": { lifestyle: { category: "lifestyle", tier: 1 } } } },
    { _id: "medkit000000000a", name: "Medtech Bag", type: "gear", system: { equipped: "owned", amount: 1 } },
    { _id: "bike0000000000aa", name: "Superbike", type: "vehicle", system: { sdp: 35, seats: 2, speedCombat: 30, speedNarrative: "150 MPH", installedItems: { list: [], slots: 3 } } },
    { _id: "crit00000000000b", name: "Broken Ribs", type: "criticalInjury", system: { location: "body", quickFix: { type: "paramedic", dvParamedic: 13 }, treatment: { type: "paramedicSurgery", dvParamedic: 15, dvSurgery: 13 }, deathSaveIncrease: false }, flags: { [M]: { side: "R" } } },
    { _id: "crit00000000000c", name: "Dismembered Hand", type: "criticalInjury", system: { location: "body", quickFix: { type: "notApplicable" }, treatment: { type: "surgery", dvSurgery: 17 }, deathSaveIncrease: true }, flags: { [M]: { side: "L" } } },
    { _id: "crit00000000000d", name: "Concussion", type: "criticalInjury", system: { location: "head", quickFix: { type: "firstAidParamedic", dvFirstAid: 13, dvParamedic: 13 }, treatment: { type: "quickFix" }, deathSaveIncrease: false } },
    { _id: "crit00000000000a", name: "Broken Ribs", type: "criticalInjury", system: { location: "body", quickFix: { type: "paramedic", dvParamedic: 13 }, treatment: { type: "paramedicSurgery", dvParamedic: 15, dvSurgery: 13 }, deathSaveIncrease: false } }
  ]);
  // Vex is driving.
  car.flags["mmutons-cyberpunk-red-vas"].positions[0].occupants = [actor.uuid];
  return { actor, stash, car };
}
