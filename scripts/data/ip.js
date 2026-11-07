/**
 * Spend IP: Improvement Points into Skills, Role Abilities and new Roles (Cyberpunk RED core
 * rulebook, p. 410), with the gamified read-outs of the "Spend IP" macro (Character Level Up 2.4.2):
 * a character level every 1720 IP spent, a rank insignia, a Threat Level, a specialization.
 *
 * Pure data and arithmetic; home/ip-ops.js does the spending.
 */
import { levelCost } from "./living.js";

/** A level (or Rank) of anything tops out at 10. */
export const MAX_LEVEL = 10;
/** IP spent per character level. */
export const LEVEL_IP = 1720;
/** A new Role, at Rank 1. */
export const NEW_ROLE_IP = 60;
/** Every Role must be at this Rank before another is added. */
export const MULTICLASS_RANK = 4;

/** Skills the macro prices as Difficult (×2), for skill items whose difficulty isn't set. */
export const DIFFICULT_SKILLS = new Set([
  "Pilot Air Vehicle", "Martial Arts", "Autofire", "Heavy Weapons", "Demolitions", "Electronics/Security Tech", "Paramedic"
]);

/** How a skill is priced: typical (20 × level), difficult (40 × level) or as a Role Ability (60 × level). */
export function skillPricing(skill) {
  const d = skill?.system?.difficulty;
  if (d === "role") return "role";
  const name = String(skill?.name ?? "");
  if (d === "difficult" || DIFFICULT_SKILLS.has(name) || /^Martial Arts\b/i.test(name)) return "difficult";
  return "typical";
}

/** The IP a level costs: reaching level `level` of a skill priced this way, or a Role Ability Rank. */
export function costOf(pricing, level) {
  if (level < 1 || level > MAX_LEVEL) return 0;
  if (pricing === "role") return 60 * level;
  return levelCost(level, pricing === "difficult");
}

/** All the IP a level (or Rank) took to reach, from 0. */
export function spentTo(pricing, level) {
  let n = 0;
  for (let i = 1; i <= Math.min(MAX_LEVEL, level); i++) n += costOf(pricing, i);
  return n;
}

/* ---------------------------------------- */
/*  Character level, rank and threat        */
/* ---------------------------------------- */

/** The character level IP spent makes: { level, progress, pct } (progress toward the next). */
export function characterLevel(spent) {
  const level = Math.floor(spent / LEVEL_IP) + 1;
  const progress = spent - (level - 1) * LEVEL_IP;
  return { level, progress, pct: Math.round((progress / LEVEL_IP) * 1000) / 10 };
}

/** Rank insignias by character level, highest first: [from level, key, icon]. */
export const RANKS = [
  [50, "afterlifeLegend", "fa-solid fa-crown"],
  [45, "edgerunnerElite", "fa-solid fa-dragon"],
  [40, "preemTier", "fa-solid fa-bolt"],
  [35, "hardwired", "fa-solid fa-plug"],
  [30, "soloClass", "fa-solid fa-skull"],
  [26, "bladed", "fa-solid fa-khanda"],
  [22, "chromehead", "fa-solid fa-robot"],
  [18, "wireburner", "fa-solid fa-microchip"],
  [14, "edgerunner", "fa-solid fa-person-running"],
  [10, "boosted", "fa-solid fa-syringe"],
  [7, "wiredRookie", "fa-solid fa-clipboard-check"],
  [0, "gonk", "fa-solid fa-user-slash"]
];

export function rankOf(level) {
  const [, key, icon] = RANKS.find(([from]) => level >= from);
  return { key, icon };
}

/** Skill categories that count toward Threat Level (×2 a level). */
export const COMBAT_CATEGORIES = ["fightingSkills", "rangedweaponSkills"];
/** Threat a Role Rank adds, by Role (others ×2). */
export const ROLE_THREAT = { solo: 10, lawman: 6, nomad: 4 };

/** Threat Level bands, highest first: [from, key, colour token]. */
export const THREAT_BANDS = [
  [100, "extreme", "orange"],
  [80, "severe", "red"],
  [60, "high", "pink"],
  [40, "moderate", "violet"],
  [20, "low", "yellow"],
  [0, "minimal", "green"]
];

export function threatBand(threat) {
  const [, key, tone] = THREAT_BANDS.find(([from]) => threat >= from);
  return { key, tone };
}

/* ---------------------------------------- */
/*  Skill categories (Cyberpunk RED's own)  */
/* ---------------------------------------- */

export const CATEGORIES = [
  { key: "awarenessSkills", icon: "fa-solid fa-eye" },
  { key: "bodySkills", icon: "fa-solid fa-person-running" },
  { key: "controlSkills", icon: "fa-solid fa-car" },
  { key: "educationSkills", icon: "fa-solid fa-book" },
  { key: "fightingSkills", icon: "fa-solid fa-hand-fist" },
  { key: "performanceSkills", icon: "fa-solid fa-masks-theater" },
  { key: "rangedweaponSkills", icon: "fa-solid fa-crosshairs" },
  { key: "socialSkills", icon: "fa-solid fa-comments" },
  { key: "techniqueSkills", icon: "fa-solid fa-screwdriver-wrench" }
];

/* ---------------------------------------- */
/*  Roles                                   */
/* ---------------------------------------- */

/** The core Roles and their Role Abilities, as the macro offers them. */
export const ROLES = [
  { key: "exec", name: "Exec", ability: "Teamwork" },
  { key: "fixer", name: "Fixer", ability: "Operator" },
  { key: "lawman", name: "Lawman", ability: "Backup" },
  { key: "media", name: "Media", ability: "Credibility" },
  { key: "medtech", name: "Medtech", ability: "Medicine" },
  { key: "netrunner", name: "Netrunner", ability: "Interface" },
  { key: "nomad", name: "Nomad", ability: "Moto" },
  { key: "rockerboy", name: "Rockerboy", ability: "Charismatic Impact" },
  { key: "solo", name: "Solo", ability: "Combat Awareness" },
  { key: "tech", name: "Tech", ability: "Maker" }
];

export const roleKey = (name) => String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** A Role item's Role Ability name. */
export const abilityOf = (role) => role?.system?.mainRoleAbility || ROLES.find((r) => r.key === roleKey(role?.name))?.ability || role?.name || "";

/** Role Abilities whose points are shared out among their sub-abilities each time the Rank changes. */
export const SPLIT_ABILITIES = ["Combat Awareness", "Medicine", "Maker"];
/** The Fixer's Haggle follows Operator. */
export const HAGGLE_FOLLOWS = "Operator";

/** A new Role can be added with no Role yet, or once every Role is at Rank 4. */
export function canMulticlass(ranks) {
  const low = ranks.filter((r) => r.rank < MULTICLASS_RANK);
  return { ok: !ranks.length || !low.length, low };
}

/* ---------------------------------------- */
/*  Descriptions and icons                  */
/* ---------------------------------------- */

/** One line on what each Skill and Role Ability is for. */
const DESCRIPTIONS = {
  Athletics: "Feats of physical agility: climbing, jumping and running.",
  Concentration: "Focus, memory, and ignoring distractions.",
  "Conceal/Reveal Object": "Hide and find stashed or hidden items.",
  "Lip Reading": "Decode spoken words from lip movements.",
  Perception: "Spot clues, hidden people and traps.",
  Tracking: "Follow a trail and the clues left behind.",
  Contortionist: "Bend, twist and slip out of restraints.",
  Dance: "Dance like a pro on any stage.",
  Endurance: "Withstand hardship and harsh conditions.",
  "Resist Torture/Drugs": "Hold out against torture, drugs and pain.",
  Stealth: "Move unseen, hide, and act discreetly.",
  "Drive Land Vehicle": "Handle cars, trucks and bikes.",
  "Pilot Air Vehicle": "Fly and manoeuvre aircraft.",
  "Pilot Sea Vehicle": "Pilot all kinds of watercraft.",
  Riding: "Ride trained creatures with control.",
  Accounting: "Balance books, make budgets, spot fraud.",
  "Animal Handling": "Control, train and care for animals.",
  Bureaucracy: "Navigate red tape; get the intel, skip the line.",
  Business: "Supply, demand, sales and corporate strategy.",
  Composition: "Write lyrics, stories or articles.",
  Criminology: "Detective work: find clues, read evidence.",
  Cryptography: "Encrypt, decode and hide data.",
  Deduction: "Make leaps from small clues.",
  Education: "Reading, maths, history: what school taught you.",
  Gamble: "Play the odds in games of chance.",
  "Library Search": "Find facts in databases and archives.",
  Tactics: "Plan and run large-scale fights.",
  "Wilderness Survival": "Survive off the grid in the wilds.",
  Brawling: "Unarmed fighting: fists, kicks and grapples.",
  Evasion: "Dodge melee and ranged attacks.",
  "Melee Weapon": "Blades, clubs and everything in between.",
  Acting: "Take on roles, deceive and influence.",
  Archery: "Bows and crossbows.",
  Autofire: "Keep automatic fire on target.",
  Handgun: "Pistols and small firearms.",
  "Heavy Weapons": "Rocket launchers and the big guns.",
  "Shoulder Arms": "Rifles, shotguns and shoulder-fired weapons.",
  Bribery: "Know when, who and how much to bribe.",
  Conversation: "Draw out information without raising suspicion.",
  "Human Perception": "Read faces and body language.",
  Interrogation: "Get answers, willingly or otherwise.",
  Persuasion: "Convince, sway and influence.",
  "Personal Grooming": "Look your best, shape how you're seen.",
  Streetwise: "Find contraband and survive the streets.",
  Trading: "Make deals, barter and haggle.",
  "Wardrobe & Style": "Dress to impress, or to blend in.",
  "Air Vehicle Tech": "Fix and maintain flying machines.",
  "Basic Tech": "Repair basic electronics and mechanics.",
  Cybertech: "Diagnose and repair cyberware.",
  Demolitions: "Set explosives and disarm them.",
  "Electronics/Security Tech": "Crack, install or disable security systems.",
  "First Aid": "Stabilize the wounded; stop the bleeding.",
  Forgery: "Make and spot counterfeit documents.",
  "Land Vehicle Tech": "Repair ground vehicles.",
  "Paint/Draw/Sculpt": "Make visual art at a professional level.",
  Paramedic: "Advanced care for critical injuries.",
  "Photography/Film": "Capture images, film and braindance.",
  "Pick Lock": "Get past locks.",
  "Pick Pocket": "Lift things off people, unseen.",
  "Sea Vehicle Tech": "Maintain watercraft, from boats to subs.",
  Weaponstech: "Maintain, repair and upgrade weapons.",
  "Charismatic Impact": "Rockerboys sway crowds with sheer presence.",
  "Damage Deflection": "Roll with hits to take less damage.",
  "Fumble Recovery": "Shrug off a fumbled attack.",
  "Initiative Reaction": "Reflexes that put you first in combat.",
  "Precision Attack": "Aim true for a better chance to hit.",
  "Spot Weakness": "Find the weak point for more damage.",
  "Threat Detection": "Heightened awareness of danger.",
  Interface: "Netrunners hack and control the NET.",
  Credibility: "The Media's reach and the weight of their word.",
  Moto: "Nomads and their family's vehicles.",
  "Field Expertise": "Repair anything in the field, any time.",
  "Upgrade Expertise": "Upgrade gear beyond its specs.",
  "Fabrication Expertise": "Build items from raw materials.",
  "Invention Expertise": "Design and invent new tech.",
  Surgery: "Operate on severe injuries and install cyberware.",
  "Surgery Skill": "Operate on severe injuries and install cyberware.",
  "Medical Tech (Cryosystem Operation)": "Run cryotech to preserve lives.",
  "Medical Tech (Pharmaceuticals)": "Synthesize medicines from raw materials.",
  "Medical Tech Skill": "Medical treatments and procedures.",
  Teamwork: "Execs build a team to reach the company's goals.",
  Backup: "Lawmen call in reinforcements.",
  "Combat Awareness": "Read the fight and turn it your way.",
  Medicine: "Medtechs treat wounds and save lives.",
  Maker: "Techs make, repair and invent.",
  Operator: "Fixers work the deals and the black market.",
  Haggle: "Talk the price down."
};

/** Skill families with a specialty in brackets: Language (Spanish), Martial Arts (Karate)... */
export const FAMILIES = {
  language: {
    prefix: "Language", category: "educationSkills", stat: "int", difficulty: "typical", skillType: "language",
    pack: "core_skills-languages", icon: "fa-solid fa-globe", describe: (s) => `Speak ${s} fluently.`,
    suggest: ["Arabic", "Bengali", "Berber", "Burmese", "Cantonese Chinese", "Cree", "Creole", "Dari", "Dutch", "English", "Farsi", "Filipino", "Finnish", "French", "German", "Guarani", "Hausa", "Hawaiian", "Hebrew", "Hindi", "Indonesian", "Italian", "Japanese", "Khmer", "Korean", "Lingala", "Malayan", "Mandarin Chinese", "Maori", "Mayan", "Mongolian", "Navajo", "Nepali", "Norwegian", "Oromo", "Pama-Nyungan", "Polish", "Portuguese", "Quechua", "Romanian", "Russian", "Sinhalese", "Spanish", "Streetslang", "Swahili", "Swedish", "Tahitian", "Tamil", "Turkish", "Twi", "Ukrainian", "Urdu", "Vietnamese", "Yoruba"]
  },
  science: {
    prefix: "Science", category: "educationSkills", stat: "int", difficulty: "typical", skillType: "science",
    pack: "core_skills-science", icon: "fa-solid fa-flask", describe: () => "Academic study: experiment and analyze.",
    suggest: ["Anthropology", "Biology", "Biotechnology", "Chemistry", "Computer Science", "Cybernetics", "Economics", "Forensics", "Geology", "History", "Mathematics", "Mechanical Engineering", "Nanotechnology", "Pharmacology", "Physics", "Psychology", "Robotics", "Sociology", "Zoology"]
  },
  localExpert: {
    prefix: "Local Expert", category: "educationSkills", stat: "int", difficulty: "typical", skillType: "localExpert",
    pack: "core_skills-local-expert", icon: "fa-solid fa-location-dot", describe: (s) => `The customs, people and secrets of ${s}.`,
    suggest: ["Badlands", "Charter Hill", "Downtown", "Executive Zone", "Glitch City", "Heywood Docks", "Heywood Industrial Zone", "Hot Zone", "Kabuki", "Little China", "Little Europe", "Morro Rock", "New Westbrook", "NorCal Military Base", "North Heywood", "Old Combat Zone", "Old Corp Center", "Old Japantown", "Pacifica Playground", "Port of Night City", "Rancho Coronado", "Reclamation Zone", "Santo Domingo", "South Night City", "The Glen", "University District", "Upper Marina", "Watson", "Woodland Park", "Your Home"]
  },
  martialArt: {
    prefix: "Martial Arts", category: "fightingSkills", stat: "dex", difficulty: "difficult", skillType: "martialArt",
    pack: "core_skills-martial-arts", icon: "fa-solid fa-hand-fist", describe: (s) => `Trained in the ${s} martial arts form.`,
    suggest: ["Aikido", "Animal Kung Fu", "Arasaka-te", "Arnis", "Boxing", "Capoeira", "Choy Li Fut", "Drunken Fist", "Gun Fu", "Judo", "Jujutsu", "Karate", "Kendo", "Krav Maga", "Kung Fu", "Kyudo", "Militech Commando Training", "Muay Thai", "Multiarm Melee", "Panzer Faust", "Silat", "Sov-System", "Sumo", "Taekwondo", "Tai Chi", "Thamoc", "Thrash Sambo", "Wrestling"]
  },
  playInstrument: {
    prefix: "Play Instrument", category: "performanceSkills", stat: "tech", difficulty: "typical", skillType: "playInstrument",
    pack: "core_skills-play-instrument", icon: "fa-solid fa-guitar", describe: (s) => `Play the ${s.toLowerCase()} like a pro.`,
    suggest: ["Drums", "Guitar", "Harmonica", "Harp", "Piano", "Saxophone", "Singing", "Synthesizer", "Theremin", "Turntable", "Violin"]
  }
};

export const FAMILY_KEYS = Object.keys(FAMILIES);

/** A family's skill name for a specialty: Language (Spanish). */
export const familyName = (family, specialty) => `${FAMILIES[family].prefix} (${String(specialty).trim()})`;

/** Which family a skill name belongs to, and its specialty: { family, specialty } or null. */
export function familyOf(name) {
  const m = /^(.+?)\s*\((.+)\)\s*$/.exec(String(name ?? ""));
  if (!m) return null;
  const family = FAMILY_KEYS.find((k) => FAMILIES[k].prefix.toLowerCase() === m[1].trim().toLowerCase());
  return family ? { family, specialty: m[2].trim() } : null;
}

/** Icons for Skills and Role Abilities (Font Awesome 6). */
const ICONS = {
  Athletics: "fa-solid fa-person-running",
  Concentration: "fa-solid fa-brain",
  "Conceal/Reveal Object": "fa-solid fa-eye-slash",
  "Lip Reading": "fa-solid fa-comment-dots",
  Perception: "fa-solid fa-eye",
  Tracking: "fa-solid fa-shoe-prints",
  Contortionist: "fa-solid fa-child-reaching",
  Dance: "fa-solid fa-music",
  Endurance: "fa-solid fa-heart-pulse",
  "Resist Torture/Drugs": "fa-solid fa-syringe",
  Stealth: "fa-solid fa-user-secret",
  "Drive Land Vehicle": "fa-solid fa-car",
  "Pilot Air Vehicle": "fa-solid fa-plane",
  "Pilot Sea Vehicle": "fa-solid fa-ship",
  Riding: "fa-solid fa-horse",
  Accounting: "fa-solid fa-calculator",
  "Animal Handling": "fa-solid fa-paw",
  Bureaucracy: "fa-solid fa-building",
  Business: "fa-solid fa-chart-line",
  Composition: "fa-solid fa-pencil",
  Criminology: "fa-solid fa-magnifying-glass",
  Cryptography: "fa-solid fa-lock",
  Deduction: "fa-solid fa-lightbulb",
  Education: "fa-solid fa-book",
  Gamble: "fa-solid fa-dice",
  "Library Search": "fa-solid fa-magnifying-glass",
  Tactics: "fa-solid fa-chess",
  "Wilderness Survival": "fa-solid fa-tree",
  Brawling: "fa-solid fa-hand-back-fist",
  Evasion: "fa-solid fa-person-running",
  "Melee Weapon": "fa-solid fa-gavel",
  Acting: "fa-solid fa-masks-theater",
  Archery: "fa-solid fa-bullseye",
  Autofire: "fa-solid fa-fire",
  Handgun: "fa-solid fa-hand-point-right",
  "Heavy Weapons": "fa-solid fa-bomb",
  "Shoulder Arms": "fa-solid fa-crosshairs",
  Bribery: "fa-solid fa-money-bill-wave",
  Conversation: "fa-solid fa-comments",
  "Human Perception": "fa-solid fa-user-check",
  Interrogation: "fa-solid fa-gavel",
  Persuasion: "fa-solid fa-handshake",
  "Personal Grooming": "fa-solid fa-spa",
  Streetwise: "fa-solid fa-street-view",
  Trading: "fa-solid fa-right-left",
  "Wardrobe & Style": "fa-solid fa-shirt",
  "Air Vehicle Tech": "fa-solid fa-wrench",
  "Basic Tech": "fa-solid fa-gears",
  Cybertech: "fa-solid fa-microchip",
  Demolitions: "fa-solid fa-explosion",
  "Electronics/Security Tech": "fa-solid fa-laptop-code",
  "First Aid": "fa-solid fa-kit-medical",
  Forgery: "fa-solid fa-file-signature",
  "Land Vehicle Tech": "fa-solid fa-toolbox",
  "Paint/Draw/Sculpt": "fa-solid fa-palette",
  Paramedic: "fa-solid fa-truck-medical",
  "Photography/Film": "fa-solid fa-camera",
  "Pick Lock": "fa-solid fa-key",
  "Pick Pocket": "fa-solid fa-hand-holding",
  "Sea Vehicle Tech": "fa-solid fa-anchor",
  Weaponstech: "fa-solid fa-crosshairs",
  "Charismatic Impact": "fa-solid fa-microphone-lines",
  "Damage Deflection": "fa-solid fa-shield-halved",
  "Fumble Recovery": "fa-solid fa-rotate-left",
  "Initiative Reaction": "fa-solid fa-bolt",
  "Precision Attack": "fa-solid fa-bullseye",
  "Spot Weakness": "fa-solid fa-crosshairs",
  "Threat Detection": "fa-solid fa-circle-exclamation",
  Interface: "fa-solid fa-network-wired",
  Credibility: "fa-solid fa-bullhorn",
  Moto: "fa-solid fa-motorcycle",
  "Field Expertise": "fa-solid fa-helmet-safety",
  "Upgrade Expertise": "fa-solid fa-circle-arrow-up",
  "Fabrication Expertise": "fa-solid fa-hammer",
  "Invention Expertise": "fa-solid fa-lightbulb",
  Surgery: "fa-solid fa-user-doctor",
  "Surgery Skill": "fa-solid fa-user-doctor",
  "Medical Tech (Cryosystem Operation)": "fa-solid fa-temperature-half",
  "Medical Tech (Pharmaceuticals)": "fa-solid fa-pills",
  "Medical Tech Skill": "fa-solid fa-stethoscope",
  Teamwork: "fa-solid fa-users",
  Backup: "fa-solid fa-shield-halved",
  "Combat Awareness": "fa-solid fa-crosshairs",
  Medicine: "fa-solid fa-kit-medical",
  Maker: "fa-solid fa-screwdriver-wrench",
  Operator: "fa-solid fa-briefcase",
  Haggle: "fa-solid fa-scale-balanced"
};

const CATEGORY_ICON = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

/** A Skill's or Role Ability's one-liner (its family's, for Language (…) and the like). */
export function describe(name, item = null) {
  if (DESCRIPTIONS[name]) return DESCRIPTIONS[name];
  const fam = familyOf(name);
  if (fam) return FAMILIES[fam.family].describe(fam.specialty);
  const own = String(item?.system?.description?.value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return own.length > 90 ? `${own.slice(0, 88)}…` : own;
}

/** A Skill's or Role Ability's icon (its family's, else its category's). */
export function iconOf(name, category = null) {
  if (ICONS[name]) return ICONS[name];
  const fam = familyOf(name);
  if (fam) return FAMILIES[fam.family].icon;
  return CATEGORY_ICON[category] ?? "fa-solid fa-circle-question";
}

/* ---------------------------------------- */
/*  A character's tally                     */
/* ---------------------------------------- */

const lvl = (s) => Math.max(0, Number(s?.system?.level) || 0);
const rnk = (r) => Math.max(0, Number(r?.system?.rank) || 0);

/**
 * The read-outs for a character's Skills and Roles: IP spent (worked back from their levels),
 * character level and rank, levels bought, best skill, expert count (6+), totals by category,
 * specialization and Threat Level.
 */
export function tally(skills, roles) {
  let spent = 0;
  let bought = 0;
  let threat = 0;
  let best = { name: "", level: 0 };
  let experts = 0;
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.key, { total: 0, count: 0 }]));
  for (const s of skills) {
    const l = lvl(s);
    spent += spentTo(skillPricing(s), l);
    bought += l;
    if (l > best.level) best = { name: s.name, level: l };
    if (l >= 6) experts++;
    const c = cats[s.system?.category];
    if (c) {
      c.total += l;
      c.count++;
    }
    if (COMBAT_CATEGORIES.includes(s.system?.category)) threat += l * 2;
  }
  for (const r of roles) {
    const k = rnk(r);
    spent += spentTo("role", k);
    bought += k;
    if (k >= 6) experts++;
    threat += k * (ROLE_THREAT[roleKey(r.name)] ?? 2);
  }
  let special = { key: null, score: 0 };
  for (const c of CATEGORIES) if (cats[c.key].total > special.score) special = { key: c.key, score: cats[c.key].total };
  const lv = characterLevel(spent);
  return {
    spent,
    bought,
    best,
    experts,
    cats,
    special,
    threat,
    band: threatBand(threat),
    ...lv,
    rank: rankOf(lv.level)
  };
}

/* ---------------------------------------- */
/*  Sizing up the others (Perception + INT) */
/* ---------------------------------------- */

/** The least Perception + INT that reads other characters at all. */
export const SCAN_MIN = 6;

/** What a scan of this Perception + INT shows of another character. */
export function scanReveals(p) {
  return { threat: p >= 6, level: p >= 10, skills: p >= 10, best: p >= 15, special: p >= 18, ranked: p >= 10 };
}

/** How deep the scan goes: perfect, expert, detailed, basic, none. */
export function scanDepth(p) {
  if (p >= 20) return "perfect";
  if (p >= 15) return "expert";
  if (p >= 10) return "detailed";
  if (p >= SCAN_MIN) return "basic";
  return "none";
}

/** How the scan orders the characters: by levels bought (15+), by threat (10+), else shuffled. */
export function scanOrder(p) {
  return p >= 15 ? "bought" : p >= 10 ? "threat" : "random";
}

/** Place icons: crown, medal, award, two stars, then chevrons. */
export const PLACE_ICONS = ["fa-solid fa-crown", "fa-solid fa-medal", "fa-solid fa-award", "fa-solid fa-star", "fa-solid fa-star"];
export const placeIcon = (n) => PLACE_ICONS[n - 1] ?? (n <= 10 ? "fa-solid fa-chevron-up" : "fa-solid fa-user");
