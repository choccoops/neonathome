/**
 * Netrunning gear for the quickhack suite: quickhacks, deck hardware, cyberdecks and Cybersuites
 * from Cyberpunk: The Unification Era (Core Rules, Chapter 10; Item Compendium, Netrunning Gear),
 * and how a deck's slots and range work. Pure: no Foundry calls.
 */
import { int } from "./util.js";

/** Neuroport quickhacks (Core Rules, Chapter 10): [id, name, type, needs, DV, cooldown (Rounds, or text), slots, eb, quiet, effect]. */
export const QUICKHACK_ROWS = [
  ["scannerz", "Scannerz", "Intel", "—", 6, 3, 1, 50, true, "List the target's installed chrome, how many Self-ICE they run, and any deck they carry. Tells you what your other quickhacks can hit."],
  ["ping", "Ping", "Intel", "—", 8, 10, 1, 500, true, "For 20 Rounds you see every Neuroport, camera and networked device within 20m of the target, through walls, and can Jack In to any of them without line of sight. Range still applies."],
  ["earw1g", "Earw1g", "Intel", "—", 8, 10, 1, 100, true, "Tap their Holophone: you hear their calls and read their texts until you're ejected or found. A bug detector finds the tap."],
  ["eReader", "E-Reader", "Intel", "—", 8, 6, 1, 100, true, "Copy what's on their Holophone. Doesn't reach data inside a NET Architecture."],
  ["whistle", "Whistle", "Covert", "—", 8, 3, 1, 100, true, "Only on a target who doesn't know you're there. Their next Move Action is yours: they walk toward a phantom noise. Not into obvious danger."],
  ["commsJam", "Comms Jam", "Covert", "—", 6, 6, 1, 100, true, "They can't call, text or receive for 20 Rounds. They won't hear the alarm until someone shouts it."],
  ["vitalsSpoof", "Vitals Spoof", "Covert", "—", 8, 20, 1, 500, true, "For 1 hour their Biomonitor reports calm, normal vitals: no flatline alert if they drop, and their Trauma Team card won't call itself."],
  ["memoryWipe", "Memory Wipe", "Covert", "—", 10, 10, 1, 1000, true, "The last 20 Rounds blur. If their group is Suspicious or Searching because of them, it drops one step on the Awareness Ladder. Useless once anyone is Alert."],
  ["popupGeddon", "PopUp-geddon", "Covert", "—", 6, 6, 1, 100, true, "Ads flood their HUD: −2 to Checks that need sight for 3 Rounds. Everyone gets ad spam. Nobody suspects a thing."],
  ["impairMovement", "Impair Movement", "Control", "—", 6, 3, 1, 50, true, "MOVE −1 for 20 Rounds. At 0 they can't use Move Actions."],
  ["slow", "Slow", "Control", "—", 10, 10, 1, 500, true, "MOVE −1d6 for 20 Rounds."],
  ["shortCircuit", "Short Circuit", "Control", "—", 8, 6, 1, 500, true, "The GM picks 3 pieces of their chrome (not cyberarms, legs, eyes, audio suite, Neuroport or Cybersuite; options in them count). Off for 20 Rounds. Also works on a drone or turret that isn't on an architecture: 3d6 to it."],
  ["cyberwareMalfunction", "Cyberware Malfunction", "Control", "—", 10, 10, 1, 1000, true, "You pick one piece of chrome (not the Neuroport or Cybersuite). Off for 20 Rounds, options included. A limb acts Broken."],
  ["rebootOptics", "Reboot Optics", "Control", "Cybereye", 8, 10, 1, 500, true, "Their cybereyes shut down for 3 Rounds. All-chrome eyes: they're blind (−4 to anything that needs sight, and they can't dodge ranged attacks). An Action and DV13 Cybertech restarts them early."],
  ["crippleMovement", "Cripple Movement", "Control", "Cyberleg", 8, 6, 1, 500, true, "Their cyberlegs lock: no Move Actions for 2 Rounds, then MOVE −2 for the rest of 20 Rounds. One cyberleg: MOVE halved for 20 Rounds."],
  ["weaponGlitch", "Weapon Glitch", "Control", "Smart weapon or Smartgun Link", 8, 6, 1, 500, true, "Their linked weapon jams (an Action to clear) and they're −2 to hit with it for 3 Rounds. It looks like a bad round."],
  ["limbSeize", "Limb Seize", "Control", "Cyberarm", 10, 10, 1, 500, true, "One cyberarm goes limp for 3 Rounds: it drops what it holds, popup weapons retract, options in it switch off."],
  ["speedwareCrash", "Speedware Crash", "Control", "Kerenzikov, Sandevistan or other speedware", 10, 10, 1, 1000, true, "Their speedware shuts off for 20 Rounds. If it was running, they lose its bonus now and take 1d6 to HP from the crash."],
  ["sonicShock", "Sonic Shock", "Control", "—", 6, 6, 1, 100, false, "Damaged Ear (no Bonus Damage) for 20 Rounds."],
  ["shardEjection", "Shard Ejection", "Control", "—", 12, 10, 1, 500, false, "Pop one chip out of their shard slot onto the floor. A slot cover (or tape) stops it."],
  ["frameLock", "Frame Lock", "Control", "Linear Frame, Borgware limbs or FBC", 12, 20, 2, 5000, false, "Their frame seizes for 3 Rounds: no Move Actions and −4 to physical Actions. A Linear Frame's BODY bonus is gone for 20 Rounds."],
  ["overheat", "Overheat", "Combat", "—", 8, 6, 1, 500, false, "On Fire: 4 to HP at the end of each of their Turns (no armor, no ablation) until they spend an Action to put it out."],
  ["synapseBurnout", "Synapse Burnout", "Combat", "—", 10, 10, 1, 1000, false, "3d6 straight to HP (no armor, no ablation)."],
  ["contagion", "Contagion", "Combat", "—", 10, 10, 1, 1000, false, "1d6 straight to HP to the target and up to two more people of your choice within 4m of them who have no Self-ICE. Roll once."],
  ["poisonPointers", "Poison Pointers", "Combat", "Netrunner's deck", 12, 10, 1, 1000, false, "Destroy one Program or quickhack on their deck (the GM picks at random)."],
  ["qKRASH", "Q-KRASH", "Combat", "Netrunner's deck", 12, 15, 1, 1000, false, "Their deck can't run quickhacks for 20 Rounds, or until they clear it with an Action and DV13 Electronics/Security Tech."],
  ["systemReset", "System Reset", "Ultimate", "—", 12, 40, 2, 5000, false, "Unconscious and Prone for 20 Rounds, or until damaged."],
  ["puppet", "Puppet", "Ultimate", "—", 12, 40, 2, 5000, false, "You control their Action and Move Action next Turn, using their STATs and Skills."],
  ["cyberpsychosis", "Cyberpsychosis", "Ultimate", "—", 14, "1 hour", 2, 10000, false, "For 3 Rounds they attack the nearest person (GM's choice) with whatever they hold. Then they take 2d6 Humanity Loss. At EMP 0 they don't stop."],
  ["totalSystemKill", "Total System Kill", "Ultimate", "—", 16, "single use", 2, 10000, false, "6d6 straight to HP (no armor). The chip burns out after one upload, hit or miss. A Backup Drive can't save it."],
];

/** Vehicle quickhacks (Core Rules, Chapter 10; after Frostipanda's Ad Astra): [id, name, needs, DV, cooldown, slots, eb, quiet, effect]. */
export const VEHICLE_HACK_ROWS = [
  ["alarmTrigger", "Alarm Trigger", "—", 6, 3, 1, 50, false, "The alarm blares. Cops, gangers and every nosy local look over."],
  ["killRadio", "Kill Radio", "—", 6, 6, 1, 100, true, "Comms, music and emergency signals off for 20 Rounds."],
  ["lockDoors", "Lock Doors", "—", 6, 6, 1, 100, true, "Doors lock for 20 Rounds. DV10 Basic Tech, or force, to open."],
  ["killHeadlights", "Kill Headlights", "—", 6, 3, 1, 100, true, "Lights off: −2 to driving Checks in low light."],
  ["seatbeltLock", "Seatbelt Lock", "—", 8, 6, 1, 100, true, "Chosen occupants (or all) can't get out without DV8 Basic Tech."],
  ["openDoor", "Open Door", "—", 8, 2, 1, 100, false, "A door or the trunk pops open. Cargo and passengers on display."],
  ["emergencyBrake", "Emergency Brake", "—", 8, 2, 1, 100, false, "Hard stop: the vehicle loses its next Move. In a chase it drops back 1 square at the end of the Round."],
  ["jammedIgnition", "Jammed Ignition", "—", 8, 6, 1, 100, false, "Engine stalls for 3 Rounds: it coasts and can't accelerate. In a chase it can't move forward when positioning."],
  ["reversePing", "Reverse Ping", "Communications Center", 8, 20, 1, 500, true, "Hijack its homing tracer: you can track it within 1.6 km for 24 hours. Doesn't alert the driver."],
  ["steeringLock", "Steering Lock", "—", 10, 10, 1, 500, false, "No turning for 3 Rounds: any Maneuver automatically fails."],
  ["engineKill", "Engine Kill", "—", 10, 6, 1, 500, false, "The engine dies. Restarting is an Action and DV13 vehicle Tech. Until then it coasts (in a chase: back 1 square a Round)."],
  ["reverseOverride", "Reverse Override", "—", 10, 6, 1, 500, false, "It slams into reverse for 1 Round. The driver makes an immediate DV15 Maneuver or Loses Control."],
  ["hydraulicLeak", "Hydraulic Leak", "Air or sea vehicle", 10, 6, 1, 500, false, "Stabilizers fail: −2 to Pilot Checks for 3 Rounds."],
  ["burnout", "Burnout", "—", 12, 10, 1, 500, false, "Throttle to max, tires smoking: a smoke screen around the vehicle for 3 Rounds."],
  ["selfEject", "Self-Eject", "Ejector seats", 12, 15, 1, 500, false, "The ejector seats fire. Everyone strapped in goes up 10m."],
  ["flightDisruptor", "Flight Disruptor", "Air vehicle", 12, 2, 1, 500, false, "A self-righting routine kicks in: it climbs or drops 10m before the pilot gets it back."],
  ["bilgeFlood", "Bilge Flood", "Sea vehicle", 12, 10, 1, 500, false, "Pumps run backwards: −5m of movement a Turn until a Manual System Reboot."],
  ["throttleSurge", "Throttle Surge", "—", 12, 6, 1, 1000, false, "Stuck at full throttle for 2 Rounds. In a chase it must try to move forward and can't keep pace or slow down."],
  ["onboardHijack", "Onboard Hijack", "Onboard weapons", 12, 6, 1, 1000, false, "You control its onboard weapons for 3 Rounds, firing them with Interface + 1d10 as your Action."],
  ["neuroSpike", "Neuro-Spike", "Driver linked by Personal Link", 12, 20, 1, 1000, false, "The linked driver makes DV14 Resist Torture/Drugs or takes 3d6 straight to HP."],
  ["systemOverride", "System Override", "—", 14, 20, 2, 5000, false, "You drive it for 3 Rounds, using Interface in place of their control Skill."],
  ["engineFire", "Engine Fire", "—", 14, 20, 2, 5000, false, "The engine catches: 1d6 SDP a Turn and −2 to driving until someone puts it out (an Action and DV13 vehicle Tech)."],
  ["totalBlackout", "Total Blackout", "—", 16, 20, 2, 10000, false, "Every electrical upgrade dies (onboard weapons, Comms Center, Personal Link control) until a Manual System Reboot. AVs and hovers drop 10m a Round until restored; a crash is 6d6 and Whiplash for all aboard."],
];

/** Quickhack hardware (house rule) and Black ICE / Deep Dive hardware (DLC: Midnight with the Upload): [id, name, slots, eb, effect, kind]. */
export const HARDWARE_ROWS = [
  ["orbitalAirSigbooster", "Orbital Air Sigbooster", 1, 500, "+10m quickhack range (Neuroports and vehicles).", "quickhack"],
  ["qkrashNet", "QKRASH Net", 1, 500, "+2 to your roll when a target tries to eject you.", "quickhack"],
  ["zetatechGhostProtocol", "Zetatech Ghost Protocol", 1, 1000, "+2 to Ghost Jack In and to every roll to stay Ghosted.", "quickhack"],
  ["ravenHeatSink", "Raven Heat Sink", 2, 1000, "Halve every quickhack Cooldown (round down; minimum 1 Round).", "quickhack"],
  ["kiroshiBackdoor", "Kiroshi Backdoor", 1, 500, "+2 to Reboot Optics and PopUp-geddon.", "quickhack"],
  ["rocklinLimbExploit", "Rocklin Limb Exploit", 1, 500, "+2 to Cripple Movement, Limb Seize and Frame Lock.", "quickhack"],
  ["driveLink", "Drive Link", 1, 500, "+2 to Breach and quickhacks against vehicles.", "quickhack"],
  ["militechOverclock", "Militech Overclock", 2, 1000, "+1d6 damage on Overheat (first Turn), Synapse Burnout and Contagion. You take 1 to HP from the heat each time.", "quickhack"],
  ["spreader", "Spreader", 2, 5000, "Once per Turn, a quickhack that hits also hits one other person within 4m of the target who has no Self-ICE. One roll.", "quickhack"],
  ["counterICEFeedback", "Counter-ICE Feedback", 1, 500, "Defense. Anyone who fails to Jack In on you or fails a Breach on your Passwalls takes 1d6 to the brain.", "quickhack"],
  ["partitionWall", "Partition Wall", 1, 500, "Defense. Quickhacks that need a specific piece of your chrome are +2 DV against you.", "quickhack"],
  ["overrideLock", "Override Lock", 2, 1000, "Defense. You're immune to Puppet and Cyberpsychosis.", "quickhack"],
  ["heatDiffuser", "Heat Diffuser", 1, 500, "Defense. Overheat can't set you or your deck on fire.", "quickhack"],
  ["traceBack", "Trace-Back", 1, 500, "Defense. When a quickhack hits you, you know where its Netrunner is and can Jack In to them without line of sight for 3 Rounds.", "quickhack"],
  ["aerie", "Aerie", 2, 500, "Your Raven Black ICE destroys a random Rezzed enemy Defender instead of derezzing it.", "deepDive"],
  ["bushidoAccelerator", "Bushido Accelerator", 3, 500, "+2 SPD to all your Killer Black ICE per Accelerator installed. (The DLC's summary table says 2 slots; its full entry says 3.)", "deepDive"],
  ["combatRecorder", "Combat Recorder", 1, 500, "Records the last 5 minutes when another runner in your architecture fails a Death Save. Anonymized snuff sells for about 50eb.", "deepDive"],
  ["defenseSequencer", "Defense Sequencer", 2, 500, "When an active Armor Program is derezzed or destroyed, rez an unused Armor Program at the start of your next Turn, free.", "deepDive"],
  ["felineInstinct", "Feline Instinct", 2, 500, "Each time your Sabertooth destroys a program, its damage goes up 1d6 until you Jack Out.", "deepDive"],
  ["hangryHangryDragon", "Hangry Hangry Dragon", 1, 500, "When your Dragon destroys a program, its REZ is fully restored.", "deepDive"],
  ["perfumeShoppe", "Perfume Shoppe", 2, 500, "Skunk Black ICE takes 1 slot instead of 2.", "deepDive"],
  ["smithy", "Smithy", 1, 500, "Meat Action: swap all your Sword Programs to Banhammers, and Banhammers to Swords.", "deepDive"],
  ["snaketrap", "Snaketrap", 1, 500, "Stops the first effect each run that would destroy a random program on your deck.", "deepDive"],
  ["swampMist", "Swamp Mist", 2, 500, "Your Wisp deals 2d6 instead of 1d6, but you can't run any other Black ICE.", "deepDive"],
  ["swiftyClean", "Swifty Clean", 2, 500, "Cloak twice with one NET Action and keep the better roll; only once per run.", "deepDive"],
];

/** Cyberdecks (Core p.351; DLC: Midnight with the Upload): [id, name, slots, eb, rule]. */
export const DECK_ROWS = [
  ["cyberdeckPoor", "Cyberdeck (Poor)", {"program": 0, "hardware": 0, "either": 5}, 100, "The generic deck: any mix of Programs, quickhacks and Hardware."],
  ["cyberdeckStandard", "Cyberdeck (Standard)", {"program": 0, "hardware": 0, "either": 7}, 500, "The generic deck: any mix of Programs, quickhacks and Hardware."],
  ["cyberdeckExcellent", "Cyberdeck (Excellent)", {"program": 0, "hardware": 0, "either": 9}, 1000, "The generic deck: any mix of Programs, quickhacks and Hardware."],
  ["kiramaTrainingDeck", "Kirama Training Deck", {"program": 5, "hardware": 0, "either": 0}, 20, "Must stay within 2m of an access point to Jack In to an architecture. Brain damage you take while using it is doubled."],
  ["kiramaEntryDeck", "Kirama Entry Deck", {"program": 5, "hardware": 0, "either": 0}, 100, "Only one Attacker, Defender, Booster and Black ICE each. Unsafe Jack Outs count as safe."],
  ["kiramaAdvancedDeck", "Kirama Advanced Deck", {"program": 0, "hardware": 0, "either": 5}, 500, "Unsafe Jack Outs count as safe."],
  ["microtechAssault", "Microtech Assault", {"program": 4, "hardware": 5, "either": 0}, 500, "Only Black ICE in its Program slots."],
  ["microtechScout", "Microtech Scout", {"program": 0, "hardware": 0, "either": 5}, 500, "After you Jack In, one free Pathfinder (no NET Action)."],
  ["microtechWarrior", "Microtech Warrior", {"program": 7, "hardware": 0, "either": 0}, 1000, "After you Jack In, rez one Armor Program free."],
  ["ravenMicrocybHummingbird", "Raven Microcyb Hummingbird", {"program": 0, "hardware": 2, "either": 0}, 1000, "+1 NET Action every Turn."],
  ["ravenMicrocybKestrel2", "Raven Microcyb Kestrel 2", {"program": 7, "hardware": 0, "either": 0}, 1000, "After you Jack In, rez up to two Speedy Gonzalvez free."],
  ["ravenMicrocybPhoenix", "Raven Microcyb Phoenix", {"program": 0, "hardware": 0, "either": 6}, 1000, "After a safe Jack Out, Programs destroyed this run are restored."],
  ["sgiKerberos", "SGI Kerberos", {"program": 6, "hardware": 5, "either": 0}, 1000, "Only Hellhound Black ICE in its Program slots."],
  ["sgiVerdantKnight", "SGI Verdant Knight", {"program": 9, "hardware": 0, "either": 0}, 500, "Only Sword and Shield Programs."],
  ["sgiWarlockSBook", "SGI Warlock's Book", {"program": 0, "hardware": 0, "either": 9}, 500, "No Attacker Programs or Black ICE."],
  ["zetatechKaliya", "Zetatech Kaliya", {"program": 3, "hardware": 0, "either": 6}, 500, "No Defender but Flak; no Black ICE but Asp."],
  ["zetatechMicroMate", "Zetatech MicroMate", {"program": 0, "hardware": 0, "either": 9}, 500, "No Defender Programs. Brain damage you take while using it is doubled."],
  ["zetatechParraline6000", "Zetatech Parraline 6000", {"program": 3, "hardware": 6, "either": 0}, 500, "Made for hardware nuts."],
];

/** Cybersuites (house rule, adapted from Quickhack Uplink Modules): [id, name, eb (0: not for sale), built-in quickhacks, perk]. */
export const CYBERSUITE_ROWS = [
  ["cybersuiteStandard", "Cybersuite (standard)", 500, [], "Installs one Cyberdeck inside your Neuroport (Chapter 10)."],
  ["zetatechPoolshark", "Zetatech Poolshark", 1000, ["Scannerz", "E-Reader"], "Ziggurat-adjacent. Popular with data thieves."],
  ["polskaWatchdog", "Polska Watchdog", 1000, ["Ping", "E-Reader"], "+2 to notice a Ghosted Netrunner in your port, and +2 to eject one."],
  ["segotariHexmage", "Segotari Hexmage", 1000, ["Cripple Movement", "PopUp-geddon"], "An Elflines Online tie-in. Comes with the game."],
  ["kangTaoCircuitBreaker", "Kang Tao Circuit Breaker", 5000, ["Short Circuit", "System Reset"], "+2 against drones, turrets and vehicles; −1 against people."],
  ["militechTunneler", "Militech Tunneler", 5000, ["Synapse Burnout", "Poison Pointers"], "+1 to Jack In."],
  ["zetatechByteforce", "Zetatech Byteforce", 5000, ["Short Circuit", "Overheat"], "Reroll the lowest damage die on its built-in quickhacks (keep the new roll). Any quickhack you run that beats its DV by 2 or less fries: 1d6 to your HP."],
  ["arasakaNagamasa", "Arasaka Nagamasa", 0, ["Puppet", "Synapse Burnout", "Total System Kill"], "+2 on the first quickhack against a target while you're undetected in the NET and meatspace. Owning one is a death sentence if Arasaka finds out."],
  ["netwatchDataRanger", "NetWatch Data Ranger", 0, ["Q-KRASH", "Short Circuit", "Memory Wipe"], "+1 to quickhacks against Netrunners. Every runner in the city wants you dead for having it."],
];

/** Damage a quickhack rolls (for Cyberpunk RED's program damage roll). */
export const QUICKHACK_DAMAGE = {"Synapse Burnout": "3d6", "Contagion": "1d6", "Total System Kill": "6d6", "Neuro-Spike": "3d6", "Engine Fire": "1d6"};

/** A quickhack: { id, name, type, needs, dv, cooldown, slots, eb, quiet, effect, vehicle }. */
export const QUICKHACKS = [
  ...QUICKHACK_ROWS.map(([id, name, type, needs, dv, cooldown, slots, eb, quiet, effect]) => ({ id, name, type, needs: needs === "—" ? "" : needs, dv, cooldown, slots, eb, quiet, effect, vehicle: false })),
  ...VEHICLE_HACK_ROWS.map(([id, name, needs, dv, cooldown, slots, eb, quiet, effect]) => ({ id: `vehicle${id[0].toUpperCase()}${id.slice(1)}`, name, type: "Vehicle", needs: needs === "—" ? "" : needs, dv, cooldown, slots, eb, quiet, effect, vehicle: true }))
];
/** Hardware: { id, name, slots, eb, effect, kind: quickhack|deepDive }. */
export const HARDWARE = HARDWARE_ROWS.map(([id, name, slots, eb, effect, kind]) => ({ id, name, slots, eb, effect, kind }));
/** Decks: { id, name, slots: { program, hardware, either }, eb, rule }. */
export const DECKS = DECK_ROWS.map(([id, name, slots, eb, rule]) => ({ id, name, slots, eb, rule }));
/** Cybersuites: { id, name, eb, builtIn: [quickhack names], perk }. */
export const CYBERSUITES = CYBERSUITE_ROWS.map(([id, name, eb, builtIn, perk]) => ({ id, name, eb, builtIn, perk }));

const lower = (s) => String(s ?? "").toLowerCase().trim();
export const QUICKHACK_BY_NAME = new Map(QUICKHACKS.map((q) => [lower(q.name), q]));

/** The quickhack an item is (by its flag, else its name), or null. */
export function quickhackOf(item, moduleId) {
  const f = item?.flags?.[moduleId]?.quickhack;
  if (f && typeof f === "object") return { ...(QUICKHACK_BY_NAME.get(lower(item.name)) ?? {}), ...f, name: item.name };
  if (item?.type !== "program") return null;
  return QUICKHACK_BY_NAME.get(lower(item.name)) ?? null;
}

/** What kind of deck slot an item takes: "program" (Programs, quickhacks, Black ICE), "hardware", or null. */
export function slotKind(item) {
  if (item?.type === "program") return "program";
  if (item?.type === "itemUpgrade" && item.system?.type === "cyberdeck") return "hardware";
  return null;
}

/** How many slots an item takes (Cyberpunk RED's own size; quickhacks 1, Ultimates 2). */
export const slotSize = (item) => Math.max(0, int(item?.system?.size ?? 1));

/* ------------------------------------------ */
/*  The rig                                   */
/* ------------------------------------------ */

/**
 * How the deck connects (Chapter 10, Range by Connection), and what it adds:
 *  - suite: installed in a Cybersuite, inside the Neuroport (20m to architectures, 50m to Neuroports
 *    and vehicles); swapping its deck is a Clinic job (1 hour). Ex-Disks add Hardware-only slots.
 *  - hand: hand-held on the Personal Link (or Interface Plugs): 6m (8m with a Range Upgrade).
 *  - arm: built into a cyberarm (Cyberdeck (arm)): +1 slot, and +1 per Integrated Cyberdeck Upgrade;
 *    FBC Integrated Bodyweight Coating adds 2 Hardware-only slots per install.
 * A worn Bodyweight Suit adds a Hardware-only slot to whichever deck is connected (Item
 * Compendium; Chapter 10: a Cybersuite deck too).
 */
export const LINKS = ["suite", "hand", "arm"];

/** Range in metres to architectures and to Neuroports/vehicles, by link and hardware. */
export function rigRange(link, { rangeUpgrade = false, sigboosters = 0 } = {}) {
  const base = link === "suite" ? { arch: 20, port: 50 } : { arch: rangeUpgrade ? 8 : 6, port: rangeUpgrade ? 8 : 6 };
  return { arch: base.arch, port: base.port + 10 * int(sigboosters) };
}

/** A deck's own slots: its flag (2070 decks split Program-only, Hardware-only and either), else Cyberpunk RED's slots, any mix. */
export function deckBase(deck, moduleId) {
  const f = deck?.flags?.[moduleId]?.deck?.slots;
  if (f && typeof f === "object") return { program: int(f.program), hardware: int(f.hardware), either: int(f.either) };
  const known = DECKS.find((d) => lower(d.name) === lower(deck?.name));
  if (known) return { ...known.slots };
  return { program: 0, hardware: 0, either: int(deck?.system?.installedItems?.slots ?? 7) };
}

/**
 * A deck's slots as rigged: its own, plus what the link and the netrunner's chrome and suit add.
 * @param {object} extras - { exDisks, armUpgrades, coatings (installed cyberware), suit (a Bodyweight Suit worn) }
 */
export function deckCapacity(base, link, { exDisks = 0, armUpgrades = 0, coatings = 0, suit = false } = {}) {
  const cap = { ...base };
  if (suit) cap.hardware += 1;
  if (link === "arm") {
    cap.either += 1 + int(armUpgrades);
    cap.hardware += 2 * int(coatings);
  }
  if (link === "suite") cap.hardware += int(exDisks);
  cap.total = cap.program + cap.hardware + cap.either;
  return cap;
}

/**
 * Lay what's slotted out in the deck's slots: Programs fill Program-only slots first, Hardware fills
 * Hardware-only slots first, both spill into the either slots. A 2-slot item takes two cells.
 * @param {{id, kind, size}[]} items
 * @returns {{cells: {kind, item: string|null, first: boolean}[], over: string[], free: {program, hardware}}}
 */
export function layout(cap, items) {
  const cells = [
    ...Array.from({ length: cap.program }, () => ({ kind: "program", item: null, first: false })),
    ...Array.from({ length: cap.hardware }, () => ({ kind: "hardware", item: null, first: false })),
    ...Array.from({ length: cap.either }, () => ({ kind: "either", item: null, first: false }))
  ];
  const over = [];
  // bigger first, so a 2-slot quickhack isn't split up by 1-slot ones
  const order = [...items].sort((a, b) => b.size - a.size);
  for (const it of order) {
    const want = Math.max(1, it.size);
    const pick = (kinds) => {
      const free = cells.map((c, i) => (kinds.includes(c.kind) && !c.item ? i : -1)).filter((i) => i >= 0);
      return free.length >= want ? free.slice(0, want) : null;
    };
    const at = pick([it.kind]) ?? pick([it.kind, "either"]);
    if (!at) {
      over.push(it.id);
      continue;
    }
    at.forEach((i, n) => Object.assign(cells[i], { item: it.id, first: n === 0, size: want }));
  }
  const free = {
    program: cells.filter((c) => !c.item && (c.kind === "program" || c.kind === "either")).length,
    hardware: cells.filter((c) => !c.item && (c.kind === "hardware" || c.kind === "either")).length
  };
  return { cells, over, free };
}

/** Would this item fit with what's slotted? */
export function fits(cap, items, add) {
  return !layout(cap, [...items, add]).over.length;
}

/** The Cybersuite an item is (installed cyberware), with its built-in quickhacks, or null. */
export function cybersuiteOf(item, moduleId) {
  if (item?.type !== "cyberware") return null;
  const f = item.flags?.[moduleId]?.cybersuite;
  const known = CYBERSUITES.find((c) => lower(c.name) === lower(item.name));
  if (!f && !known && !/cybersuite/i.test(item.name ?? "")) return null;
  return { name: item.name, builtIn: f?.builtIn ?? known?.builtIn ?? [], perk: f?.perk ?? known?.perk ?? "" };
}

/* ------------------------------------------ */
/*  Items (the Netrunning Gear compendium)    */
/* ------------------------------------------ */

const tierOf = (eb) => (eb >= 10000 ? "Super Luxury" : eb >= 5000 ? "Luxury" : eb >= 1000 ? "Very Expensive" : eb >= 500 ? "Expensive" : eb >= 100 ? "Premium" : eb >= 50 ? "Costly" : eb >= 20 ? "Everyday" : "Cheap");
const p = (s) => `<p>${s}</p>`;

/** A quickhack as a Cyberpunk RED program: an attacker with ATK 0, so its roll is Interface + 1d10 against the DV. */
export function quickhackItem(q, moduleId, _id) {
  const cd = typeof q.cooldown === "number" ? `${q.cooldown} Rounds` : q.cooldown;
  return {
    ...(_id ? { _id } : {}),
    name: q.name,
    type: "program",
    img: q.vehicle ? "icons/svg/wing.svg" : "icons/svg/lightning.svg",
    system: {
      class: "antipersonnelattacker",
      blackIceType: "antipersonnel",
      atk: 0, def: 0, per: 0, spd: 0, interface: 0,
      rez: { value: 0, max: 0 },
      damage: { standard: QUICKHACK_DAMAGE[q.name] ?? "", blackIce: "" },
      size: q.slots,
      installLocation: "mall",
      price: { market: q.eb },
      description: {
        value: p(`<b>${q.vehicle ? "Vehicle quickhack" : `${q.type} quickhack`}</b>${q.quiet ? " · ◆ Quiet" : ""} · DV${q.dv} · Cooldown ${cd} · ${q.slots} slot${q.slots > 1 ? "s" : ""}${q.needs ? ` · Needs: ${q.needs}` : ""}`)
          + p(q.effect) + p(`<em>Interface + 1d10 vs DV${q.dv}. ${q.eb.toLocaleString()}eb (${tierOf(q.eb)}). Cyberpunk: The Unification Era, Core Rules Chapter 10.</em>`)
      },
      usage: "toggled"
    },
    flags: { [moduleId]: { quickhack: { type: q.type, needs: q.needs, dv: q.dv, cooldown: q.cooldown, quiet: q.quiet, vehicle: q.vehicle, effect: q.effect } } }
  };
}

/** Deck hardware as a Cyberpunk RED cyberdeck upgrade. */
export function hardwareItem(h, moduleId, _id) {
  return {
    ...(_id ? { _id } : {}),
    name: h.name,
    type: "itemUpgrade",
    img: "icons/svg/circuit.svg",
    system: {
      type: "cyberdeck",
      size: h.slots,
      price: { market: h.eb },
      description: { value: p(`<b>${h.kind === "quickhack" ? "Quickhack hardware" : "Black ICE / Deep Dive hardware"}</b> · ${h.slots} slot${h.slots > 1 ? "s" : ""}`) + p(h.effect) + p(`<em>${h.eb.toLocaleString()}eb (${tierOf(h.eb)}).</em>`) },
      modifiers: {}
    },
    flags: { [moduleId]: { hardware: { kind: h.kind, effect: h.effect } } }
  };
}

/** A deck as a Cyberpunk RED cyberdeck, its slots split as the 2070 decks are. */
export function deckItem(d, moduleId, _id) {
  const total = d.slots.program + d.slots.hardware + d.slots.either;
  const parts = [d.slots.program && `${d.slots.program} Program-only`, d.slots.hardware && `${d.slots.hardware} Hardware-only`, d.slots.either && `${d.slots.either} either`].filter(Boolean).join(" + ");
  return {
    ...(_id ? { _id } : {}),
    name: d.name,
    type: "cyberdeck",
    img: "icons/svg/chest.svg",
    system: {
      installedItems: { allowed: true, allowedTypes: ["itemUpgrade", "program"], list: [], slots: total, usedSlots: 0 },
      price: { market: d.eb },
      equipped: "owned",
      quality: d.name.includes("Poor") ? "poor" : d.name.includes("Excellent") ? "excellent" : "standard",
      description: { value: p(`<b>Slots:</b> ${parts}`) + p(d.rule) + p(`<em>${d.eb.toLocaleString()}eb (${tierOf(d.eb)}). Installs in a Cybersuite, a Bodyweight Suit or a cyberarm, or runs hand-held on your Personal Link.</em>`) }
    },
    flags: { [moduleId]: { deck: { slots: d.slots, rule: d.rule } } }
  };
}

/** A Cybersuite as Cyberpunk RED neuralware. */
export function cybersuiteItem(c, moduleId, _id) {
  return {
    ...(_id ? { _id } : {}),
    name: c.name,
    type: "cyberware",
    img: "icons/svg/daze.svg",
    system: {
      type: "neuralWare",
      isFoundational: false,
      installLocation: "hospital",
      humanityLoss: { static: 7, roll: "2d6" },
      size: 1,
      price: { market: c.eb },
      description: { value: p("<b>Cybersuite</b> · Neuralware, Hospital, HL 7 (2d6), 1 Neural Link slot. Requires a Neuroport. Installs one Cyberdeck inside your Neuroport, Hardware slots and all: 20m to architectures, 50m to Neuroports and vehicles. Swapping the deck is a Clinic job (1 hour).")
        + (c.builtIn.length ? p(`<b>Built-in quickhacks</b> (take no deck slots, can't be removed): ${c.builtIn.join(", ")}`) : "") + p(c.perk) + p(`<em>${c.eb ? `${c.eb.toLocaleString()}eb (${tierOf(c.eb)})` : "Not for sale"}.</em>`) }
    },
    flags: { [moduleId]: { cybersuite: { builtIn: c.builtIn, perk: c.perk } } }
  };
}

/** Ex-Disk (CEMK): a Hardware-only slot for your Cybersuite deck. */
export function exDiskItem(moduleId, _id) {
  return {
    ...(_id ? { _id } : {}),
    name: "Ex-Disk",
    type: "cyberware",
    img: "icons/svg/item-bag.svg",
    system: {
      type: "neuralWare", isFoundational: false, installLocation: "hospital", humanityLoss: { static: 3, roll: "1d6" }, size: 1,
      price: { market: 1000 },
      description: { value: p("Requires a Cybersuite. A Hardware-only slot for your Cybersuite deck. Two or more: +1 NET Action while physically jacked into an access point by your Personal Link.") + p("<em>1,000eb (Very Expensive). CEMK.</em>") }
    },
    flags: { [moduleId]: { exDisk: true } }
  };
}
