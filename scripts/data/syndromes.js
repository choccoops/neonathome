/**
 * Syndromes & Inspiration homebrew: Empathy tiers, Syndromes and their Stressors, Catharsis,
 * Antipathy and In The System. Pure: no Foundry calls.
 *
 * Tiers are numbered by depth: 0 Functional (30+ Humanity), 1 Borderline dissociative (EMP 2),
 * 2 Borderline Cyberpsychosis (EMP 1), 3 Cyberpsychosis (EMP 0), 4 Extreme Cyberpsychosis.
 * A Syndrome belongs to the tier it was picked at: it is active while the character is at that
 * tier or deeper and goes quiet when they climb back above it (it comes back if they fall again).
 */
import { int, str } from "./util.js";

export const SEVERITIES = ["mild", "severe", "extreme"];
const POINTS = { mild: 1, severe: 2, extreme: 3 };

/**
 * The Empathy tiers. `points` and `need` encode the picks table: Mild 1 point, Severe 2, Extreme 3.
 * EMP 2: 1 Mild. EMP 1: upgrade the Mild to Severe or add a Mild, and add a Severe.
 * EMP 0: upgrade or add a Severe, and add an Extreme. Each path lands on the same total.
 */
export const TIERS = [
  { key: "functional", emp: "3", minHumanity: 30, points: 0, need: null, antipathy: false, catharsis: 0, scar: null },
  { key: "dissociative", emp: "2", minHumanity: 20, points: 1, need: "mild", antipathy: false, catharsis: 8, scar: null },
  { key: "borderline", emp: "1", minHumanity: 10, points: 4, need: "severe", antipathy: true, catharsis: 10, scar: "mild" },
  { key: "cyberpsychosis", emp: "0", minHumanity: 1, points: 8, need: "extreme", antipathy: true, catharsis: 12, scar: "severe" },
  { key: "extreme", emp: "—", minHumanity: -Infinity, points: 8, need: "extreme", antipathy: true, catharsis: 0, scar: "extreme" }
];

/** Depth of the tier a Humanity value falls in. */
export function tierOf(humanity) {
  const h = Number(humanity) || 0;
  if (h >= 30) return 0;
  if (h >= 20) return 1;
  if (h >= 10) return 2;
  if (h >= 1) return 3;
  return 4;
}

/**
 * The Syndromes list. Variants are the "choose one" options a Syndrome offers.
 * Descriptions are short summaries; the full text is in the homebrew document.
 */
export const SYNDROMES = [
  // Mild
  {
    key: "selfSocialDetachment", severity: "mild", icon: "fa-solid fa-user-slash",
    summary: "Feelings for others have gone hollow: love, fear and loyalty are words more than experiences.",
    stressors: ["-1 to all social interactions.", "Loved ones and close friends from the lifepath confront the change in behavior at the next meeting; the relationship may be at risk."]
  },
  {
    key: "cyberInsomnia", severity: "mild", icon: "fa-solid fa-moon",
    summary: "Sensory and neural cyberware never lets the mind switch off. Chronic fatigue.",
    stressors: ["Fatigued every night (-2 to all rolls) unless taking sleep drugs: 50eb (Costly) a week, spoiled if the bottle is submerged. Street dealers sell a dose for 50eb."]
  },
  {
    key: "synapticHedonosis", severity: "mild", icon: "fa-solid fa-champagne-glasses",
    summary: "Ordinary sensation feels fake; the brain chases ever more intense experiences.",
    stressors: ["Choose one variant."],
    variants: [
      { key: "chemical", stressor: "Addicted to one Street Drug; therapy can't treat it before the Syndrome is treated. -1 to rolls against any Street Drug's Secondary effect." },
      { key: "nympho", stressor: "300eb a month to keep up. -2 to social rolls with anyone the character would be attracted to (or an opposed Concentration vs Personal Grooming to resist)." },
      { key: "binge", stressor: "Lifestyle costs +200eb a month. -2 to the next roll when around food for a while without eating it." }
    ]
  },
  {
    key: "kleptomania", severity: "mild", icon: "fa-solid fa-hand-holding",
    summary: "Taking things is proof of being real. The rush matters, not the object.",
    stressors: [
      "When the GM calls it on a chance to steal: Concentration or 1d6 Humanity Loss to resist. Acting on the urge and failing to get the object: 1d3 Humanity Loss. Trigger objects start no higher than Costly; worsening raises the tier.",
      "A month without stealing: -2 to all Social checks until something is stolen."
    ]
  },
  {
    key: "frontalDisinhibition", severity: "mild", icon: "fa-solid fa-bolt",
    summary: "The frontal lobe stops filtering: the immediate need is the only thing that matters.",
    stressors: [
      "On a natural 2 on any d10, the GM may override the action with an animal-immediate one (flee if hurt or afraid, attack if threatened or humiliated, blurt the truth).",
      "A new action that needs a roll is rolled normally and can't trigger this again."
    ]
  },
  // Severe
  {
    key: "pentheus", severity: "severe", icon: "fa-solid fa-eye",
    summary: "Paranoid certainty that a particular person means harm, fed by cyber-enhanced analysis of every expression.",
    stressors: [
      "Meeting a significant new NPC: 1d6, on a 1 they are out to harm or betray the character. Feigning positivity with them is at -2; resisting a chance to harm them costs 1d6 Humanity Loss (GM's call).",
      "Only for NPCs the group will deal with for a while. Never PCs."
    ]
  },
  {
    key: "paralogic", severity: "severe", icon: "fa-solid fa-chess-knight",
    summary: "A set of false beliefs about the self, held whole-cloth and at any cost.",
    stressors: ["A belief that must be inconvenient and affect daily life; social rolls where it causes trouble take penalties. Choose a variant."],
    variants: [
      { key: "netWarrior", stressor: "Must be called by the NET avatar's name and spend a day a week deep in CitiNet. Interface vs DV10 afterwards: on a fail, -1 to all rolls." },
      { key: "knight", stressor: "Protect those in need, never commit an evil act, never break your word. Breaking the oath: 1d6 Humanity Loss." },
      { key: "nightCreature", stressor: "Recoils from direct sunlight without protection. Needs blood (synth blood 20eb) or suffers as Exhausted (-2 to all rolls). Drinking from live targets risks Resist Torture/Drugs DV11 or 1d6 damage." },
      { key: "custom", stressor: "Worked out with the GM; a confabulation like one of the others uses its Stressor." }
    ]
  },
  {
    key: "carnophobia", severity: "severe", icon: "fa-solid fa-robot",
    summary: "Flesh is weak and disgusting; metal is perfection. One of the most common roads to cyberpsychosis.",
    stressors: [
      "-2 to social rolls with anyone with noticeably less cyber, except intimidation.",
      "-1 to all rolls after a month without a new or upgraded piece of cyberware."
    ]
  },
  {
    key: "megalomania", severity: "severe", icon: "fa-solid fa-crown",
    summary: "Invincible, perfect, a machine. Fear and pain have been switched off.",
    stressors: ["Can't back away from a fight. Forced to retreat or escape: 2d6 Humanity Loss."]
  },
  {
    key: "aggrosynaptic", severity: "severe", icon: "fa-solid fa-hand-fist",
    summary: "Combat cyber is tuned to kill, and holding back hurts like a straitjacket.",
    stressors: [
      "Every attack is lethal unless non-lethal intent is declared before rolling (and attacking without intent to kill is at -2). Forgetting locks in a lethal attack and can't be Flash of Luck'd.",
      "Must finish off an enemy they down: 1d6 Humanity Loss if they don't."
    ]
  },
  // Extreme
  {
    key: "egoDisassociation", severity: "extreme", icon: "fa-solid fa-masks-theater",
    summary: "An alternate personality, sometimes projected onto cyberware, that wants to break out.",
    stressors: [
      "While unconscious, the GM may wake the character as the Alter. Rendering the Alter unconscious or a dose of Prime Time hands control back. Skill changes follow the PC's limits; STATs never change.",
      "Once per day, a natural 7 on a d10 means the Alter fails the roll in some way."
    ]
  },
  {
    key: "shatteredReality", severity: "extreme", icon: "fa-solid fa-burst",
    summary: "Delusions and hallucinations blur until there's no telling which world is the lie.",
    stressors: [
      "On scene descriptions the GM may call a Perception (contextual DV); passing it, the character perceives the scene through their fears and fixations. Concentration checks may break the delusion.",
      "A defined Mental Trigger may set it off automatically."
    ]
  },
  {
    key: "homicidalIdeation", severity: "extreme", icon: "fa-solid fa-skull",
    summary: "Killing is the only thing that still feels real.",
    stressors: [
      "Must personally kill at least one person a week. Every day past that: 2d6 Humanity Loss.",
      "Can be suppressed by a dose of Immunoblockers (which must go to this Stressor first). Can't be suppressed by Prime Time."
    ]
  }
];

export const SYNDROME_KEYS = SYNDROMES.map((s) => s.key);

/* ------------------------------------------ */
/*  The character's psyche                    */
/* ------------------------------------------ */

function normalizeSyndrome(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const base = SYNDROMES.find((s) => s.key === r.key) ?? null;
  return {
    id: str(r.id) || Math.random().toString(36).slice(2, 12),
    key: base ? base.key : "custom",
    name: str(r.name).trim(),
    severity: SEVERITIES.includes(r.severity) ? r.severity : base?.severity ?? "mild",
    // the tier it was picked at (1..3; extreme picks are tier 3)
    tier: int(r.tier ?? 1, 1, 3),
    // a Mild upgraded to Severe at this tier (it is Mild again above it)
    upgradedAt: r.upgradedAt === null || r.upgradedAt === undefined || r.upgradedAt === "" ? null : int(r.upgradedAt, 1, 3),
    variant: str(r.variant),
    summary: str(r.summary),
    stressor: str(r.stressor),
    notes: str(r.notes)
  };
}

/** Clamp the Biomonitor's actor flag. */
export function normalizePsyche(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const syndromes = Array.isArray(r.syndromes) ? r.syndromes.map(normalizeSyndrome) : [];
  return {
    syndromes,
    // the deepest tier ever reached since the last therapy, for what stays at 30+ Humanity
    deepest: int(r.deepest, 0, 4),
    // the tier last seen, to spot a drop into a new tier
    lastTier: r.lastTier === null || r.lastTier === undefined ? null : int(r.lastTier, 0, 4),
    // the syndrome that stays at functional Humanity (the scar)
    scar: syndromes.some((s) => s.id === r.scar) ? r.scar : "",
    catharsis: int(r.catharsis, 0, 999),
    inspiration: int(r.inspiration, 0, 99),
    inTheSystem: !!r.inTheSystem,
    // the GM can declare a complete break regardless of Humanity
    breakdown: !!r.breakdown
  };
}

/** A Syndrome's severity at a tier depth. */
export function severityAt(s, tier) {
  if (s.upgradedAt !== null && tier >= s.upgradedAt) return s.severity === "mild" ? "severe" : s.severity;
  return s.severity;
}

/** Points the active Syndromes are worth at a tier. */
export function pointsAt(syndromes, tier) {
  return syndromes.filter((s) => tier >= s.tier).reduce((n, s) => n + POINTS[severityAt(s, tier)], 0);
}

/**
 * The state of a character's psyche.
 * @param {object} psyche - normalized flag
 * @param {number} humanity - current Humanity
 * @returns {object} { tier, tierKey, antipathy, extreme, active, dormant, scar, owed, needs, catharsis }
 */
export function psycheState(psyche, humanity) {
  const tier = psyche.breakdown ? 4 : tierOf(humanity);
  const info = TIERS[tier];
  const deepest = Math.max(psyche.deepest, tier);
  const scarSeverity = TIERS[deepest].scar;
  const list = psyche.syndromes.map((s) => {
    const active = tier >= s.tier;
    const isScar = s.id === psyche.scar && !!scarSeverity;
    return {
      ...s,
      active: active || isScar,
      dormant: !active && !isScar,
      scar: isScar && !active,
      // In a complete break every Syndrome plays at its worst.
      worst: tier === 4,
      current: isScar && !active ? scarSeverity : severityAt(s, Math.max(tier, s.tier))
    };
  });
  const points = pointsAt(psyche.syndromes, Math.min(tier, 3));
  const hasNeed = (sev) => list.some((s) => s.active && !s.scar && SEVERITIES.indexOf(s.current) >= SEVERITIES.indexOf(sev));
  const needMet = !info.need || hasNeed(info.need);
  const owed = tier > 0 && (points < info.points || !needMet);
  return {
    tier,
    tierKey: info.key,
    emp: info.emp,
    antipathy: info.antipathy,
    extreme: tier === 4,
    deepest,
    scarSeverity,
    needsScar: !!scarSeverity && tier === 0 && !psyche.scar && psyche.syndromes.length > 0,
    syndromes: list,
    points,
    pointsNeeded: info.points,
    owed,
    need: info.need
  };
}

/** Catharsis gained when Humanity falls from one tier to a deeper one (only going down). */
export function catharsisGain(fromTier, toTier) {
  if (fromTier === null || toTier <= fromTier) return 0;
  let gain = 0;
  for (let t = fromTier + 1; t <= Math.min(toTier, 3); t++) gain += TIERS[t].catharsis;
  return gain;
}

/**
 * Humanity Loss against the Catharsis buffer: the buffer takes it first, any underflow comes off
 * true Humanity.
 * @returns {{absorbed, catharsis, underflow}}
 */
export function absorbLoss(loss, catharsis) {
  const l = Math.max(0, int(loss));
  const c = Math.max(0, int(catharsis));
  const absorbed = Math.min(l, c);
  return { absorbed, catharsis: c - absorbed, underflow: l - absorbed };
}

/** Antipathy: -2 on Humanity Loss rolls (minimum 1) and Gain rolls (minimum 0). */
export function antipathy(roll, kind) {
  const r = int(roll, -999, 999);
  return kind === "loss" ? Math.max(1, r - 2) : Math.max(0, r - 2);
}
