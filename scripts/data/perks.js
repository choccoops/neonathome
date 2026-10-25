/**
 * Perks (Cyberpunk: The Unification Era, Chapter 16; the house rule Cyber-Perk & Cyber-Perk+ by
 * _NullGM, adapted for 2070): what each costs, what it takes to buy, what it does, and what of it
 * Neon At Home can put on the character sheet as an Active Effect. Pure: no Foundry calls.
 */
import { int } from "./util.js";

/* ------------------------------------------ */
/*  Points (p.88)                             */
/* ------------------------------------------ */

/** Perk Points every character starts with. */
export const START_POINTS = 3;
/** Roles whose ranks come and go with Standing (Chapter 14): they grant no Perk Points. */
export const EARNED_ROLES = ["ganger", "exec"];
/** Perk training in downtime (p.88): a week, and the dice by how much it costs. Once a month. */
export const TRAINING = { intense: { eb: 2500, dice: "2d6" }, veryIntense: { eb: 5000, dice: "3d6" } };

/* ------------------------------------------ */
/*  Requirements                              */
/* ------------------------------------------ */

const S = (stat, min) => ({ t: "stat", stat, min });
const SMAX = (stat, max) => ({ t: "stat", stat, max });
const K = (skill, min) => ({ t: "skill", skill, min });
const KMAX = (skill, max) => ({ t: "skill", skill, max });
/** Any one skill of a kind at min: tech, art, language, science, martial, vehicleTech, control. */
const KA = (kind, min, match = "") => ({ t: "anySkill", kind, min, match });
/** Every skill of a kind at min (Porky: every ranged weapon skill). */
const KALL = (kind, min) => ({ t: "allSkills", kind, min });
const R = (role, min) => ({ t: "role", role, min });
const RA = (min) => ({ t: "anyRole", min });
const P = (perk) => ({ t: "perk", perk });
const PA = (perks) => ({ t: "anyPerk", perks });
const NP = (perks) => ({ t: "noPerk", perks });
const PN = (n) => ({ t: "perkCount", n });
const LS = (tier) => ({ t: "lifestyle", tier });
/** Something done in play, a Lifepath entry or an outlook: the GM confirms it. */
const D = (text) => ({ t: "deed", text });
const C = { t: "creation" };
/** Owns a weapon of one of these CPR weapon types (or a shield). */
const W = (types) => ({ t: "weapon", types });
/** n+ installed cyberware of these CPR cyberware types (options: only non-foundational ones). */
const CW = (types, n, { options = false } = {}) => ({ t: "cyber", types, n, options });
const ANY = (...of) => ({ t: "any", of });
const ALL = (...of) => ({ t: "all", of });
/** The character's original (unmodified) EMP: CPR's EMP max. */
const EMPO = (min) => ({ t: "empMax", min });

/** CPR skill names by kind, for the "any skill of a kind" requirements. */
export const SKILL_KINDS = {
  tech: { category: "techniqueSkills" },
  ranged: { category: "rangedweaponSkills" },
  language: { type: "language" },
  science: { type: "science" },
  martial: { type: "martialArt" },
  art: { names: ["Paint/Draw/Sculpt", "Photography/Film", "Forgery", "Acting"], type: "playInstrument" },
  vehicleTech: { names: ["Air Vehicle Tech", "Land Vehicle Tech", "Sea Vehicle Tech"] },
  control: { names: ["Drive Land Vehicle", "Pilot Air Vehicle", "Pilot Sea Vehicle"] }
};

/* ------------------------------------------ */
/*  Sheet effects                             */
/* ------------------------------------------ */

/**
 * What a perk puts on the sheet: CPR Active Effect changes. bonus: a CPR "bonuses.*" key; sit: a
 * situational modifier (offered in the roll dialog, off by default), else always on. stat: a STAT
 * boost with its cap (no perk raises a STAT above 10, p.88); fullHp: only while at full HP;
 * choose: the player picks the STAT when they buy it.
 */
const B = (key, value, sit = true) => ({ bonus: key, value, sit });
const ST = (stat, value, cap, opts = {}) => ({ stat, value, cap, ...opts });

/* ------------------------------------------ */
/*  The perks                                 */
/* ------------------------------------------ */

/** The tree's branches (tabs), in order. */
export const BRANCHES = ["general", "int", "will", "cool", "emp", "tech", "ref", "luck", "body", "dex", "role", "specialty", "freeCity"];

/**
 * Every perk: id, name, branch, cost, req (all must be met), text (what it does), and optional
 * group (a role, a specialty slot or a Free City section), slot ("cyber"|"weapon": one of each at
 * a time), fx (sheet effects), notes (refunds and other rules the GM applies).
 */
export const PERKS = [
  // ---------------- General (pp.88-90) ----------------
  { id: "darkAppetite", name: "Dark Appetite", branch: "general", cost: 1, req: [],
    text: "You have a bad habit (agree it with the GM). Each time you indulge it, choose: Invigorating (regain 1 LUCK, take 1d6/2 Humanity Loss) or Satisfying (regain 1d6/2 Humanity, lose 1 LUCK). Go a week without it and make a DV17 Concentration Check: fail, and you must indulge or lose 2 LUCK and 1d6 Humanity. Each week in a row you resist, the DV drops by 1; at 0 the habit is gone. Stacks with Syndromes, but can't remove a permanent one." },
  { id: "bestFirearm", name: "Best Firearm Forever", branch: "general", cost: 1, req: [D("10+ kills with one weapon, or a weapon as your most valued possession")],
    text: "That weapon is your signature weapon: +1 to attack with it, −2 with any other. You know it by touch. Only one at a time. Lose or destroy it and take 2d6 Humanity Loss; this perk is refunded, and you can buy it again for a new weapon.",
    fx: [B("bonuses.universalAttack", 1)], refund: true },
  { id: "vengefulBastard", name: "Vengeful Bastard", branch: "general", cost: 1, req: [D("An enemy in your Lifepath, vengeance as motivation, or a personal enemy made in play")],
    text: "Name one enemy your nemesis. While they're in sight, +1 to all Actions. Once per session, while your nemesis lives, you automatically pass a Death Save. With no nemesis, your COOL and WILL are −1.",
    fx: [B("bonuses.allActions", 1)] },
  { id: "hopelessRomantic", name: "Hopeless Romantic", branch: "general", cost: 1, req: [D("A tragic love in your Lifepath, love as motivation, or one suffered in play")],
    text: "Not in a relationship: COOL and WILL −1. In one: +1 to all Actions while your partner is in sight, and once per session an act of love (words, time, a gift, a favor, a touch) restores 1 LUCK. If they leave you or die, take 4d6 Humanity Loss.",
    fx: [B("bonuses.allActions", 1)] },
  { id: "familyMan", name: "Family Man", branch: "general", cost: 1, req: [D("Living family, or family/friendship as motivation")],
    text: "Name up to EMP characters as family. While any is in sight, +1 to COOL, EMP and WILL Checks (doesn't stack). Rework the list once a month. Family counts for Humanity gain from people and places (Chapter 09)." },
  { id: "honorBound", name: "Honor-Bound", branch: "general", cost: 1, req: [D("Honor, your word or honesty as motivation")],
    text: "Write a code with three or more tenets with the GM. Once a day, call on it for +2 to a fitting Check. Break a tenet: 2d6 Humanity Loss. You may change one tenet a month for 2d6 Humanity Loss.",
    fx: [B("bonuses.allActions", 2)] },
  { id: "creepyFreak", name: "Creepy Freak", branch: "general", cost: 1, req: [KMAX("Personal Grooming", 2)],
    text: "+1 to Interrogation and Facedowns. When someone sees you for the first time, you can call a Facedown for free; win it and they're also Suppressed (Chapter 07). Raise Personal Grooming to 3 and this switches off.",
    fx: [B("bonuses.interrogation", 1, false)] },
  { id: "obsessivelyHealthy", name: "Obsessively Healthy", branch: "general", cost: 1, req: [K("Personal Grooming", 6), LS(3), D("Not a Full Body Conversion")],
    text: "+1 COOL and WILL (max 8), and +1 DEX while at full HP. Below full HP you lose all of it and take −1 COOL. Stop meeting the requirements and take 2d6 Humanity Loss every week until you do.",
    fx: [ST("cool", 1, 8, { fullHp: true }), ST("will", 1, 8, { fullHp: true }), ST("dex", 1, 10, { fullHp: true })] },
  { id: "corpseScrounger", name: "Corpse Scrounger", branch: "general", cost: 1, req: [D("Search 20+ bodies")],
    text: "Searching a body takes half the time, and finds 2d10×5eb extra, or 2d6 rounds of any ammo the body carried." },
  { id: "quickBumper", name: "Quick Bumper", branch: "general", cost: 2, req: [D("Use 25+ drugs, pharmaceuticals or consumables in combat")],
    text: "The first drug, pharmaceutical or consumable you use on yourself in each combat costs no Action." },
  { id: "couponCreature", name: "Coupon Creature", branch: "general", cost: 2, req: [D("Buy 20+ different items on the street, without a Fixer")],
    text: "Anything you buy on the street yourself costs 20% less, including materials for Role abilities (Pharmaceuticals, Fabrication)." },
  { id: "proudParent", name: "Proud Parent & Mentor", branch: "general", cost: 2, req: [LS(3), C],
    text: "You have a ward: a child, a pet, an apprentice. It works like an Exec's Team Member (Chapter 04). It loses 1 Loyalty each month your Lifestyle drops below Good PrePak, and each month it lives somewhere uncomfortable. A full day caring for it (500eb) gives it +1 Loyalty and you 1d6 Humanity. At 0 Loyalty it runs, or worse; take 4d6 Humanity Loss." },
  { id: "nightCitizen", name: "Night Citizen", branch: "general", cost: 2, req: [D("A Night City origin"), C],
    text: "+2 to Local Expert anywhere in Night City. Transit memberships cost half, and you get anywhere in town in half the time. Spend a week communing with the city and roll 1d10: under your EMP, pick one: Self Care (regain 1d6 Humanity), Training (gain 1d6/2 IP), Community Service (+1 Standing with the faction that holds that neighborhood), Word of Mouth (ask the GM one question about the city) or Connections (make a new friend).",
    fx: [B("bonuses.localExpert", 2)] },
  { id: "goodPerson", name: "Good Person", branch: "general", cost: 2, req: [D("A positive outlook on people (Lifepath) and a kill count under 20"), NP(["neutralPerson", "badPerson"])],
    text: "Once per session, after a genuinely good act (helping the helpless, standing up to a corp, walking away from a fight), regain 1d6/2 Humanity. If your outlook changes or your kill count reaches 20, this perk is refunded and gone for good.", refund: true },
  { id: "neutralPerson", name: "Neutral Person", branch: "general", cost: 2, req: [D("A neutral outlook (Lifepath) and a kill count under 100"), NP(["goodPerson", "badPerson"])],
    text: "Once per session, after a good act regain 2 Humanity, or after a bad one gain 2 IP. Outlook changes or kill count reaches 100: refunded and gone.", refund: true },
  { id: "badPerson", name: "Bad Person", branch: "general", cost: 2, req: [D("A negative outlook (Lifepath) and a kill count of 100+"), NP(["goodPerson", "neutralPerson"])],
    text: "Once per session, after a bad act (hurting someone for fun, using people, wrecking things for yourself) gain 4 IP. The GM may add Humanity Loss for the worse ones. Outlook changes: refunded and gone.", refund: true },
  { id: "saviorComplex", name: "Savior Complex", branch: "general", cost: 2, req: [ANY(RA(5), D("Power as motivation"))],
    text: "+1 to one STAT (max 8). Your outlook on people becomes positive.", fx: [ST(null, 1, 8, { choose: true })] },
  { id: "mainCharacter", name: "Main-Character Complex", branch: "general", cost: 3, req: [RA(6), P("saviorComplex")],
    text: "+1 to one STAT (max 8). Your outlook becomes neutral.", fx: [ST(null, 1, 8, { choose: true })] },
  { id: "godComplex", name: "God Complex", branch: "general", cost: 3, req: [RA(7), P("mainCharacter")],
    text: "+1 to one STAT (max 10). Your outlook becomes negative, permanently.", fx: [ST(null, 1, 10, { choose: true })] },
  { id: "doomed", name: "Doomed", branch: "general", cost: 3, req: [C],
    text: "Agree with the GM on the doom that will end your story. The GM writes Doom Milestones equal to your LUCK STAT. Until the last one falls, you can't die (at 0 HP you drop unconscious) and can't go cyberpsycho (chrome that would take you to 0 Humanity just won't take). Within 24 hours of the last milestone, the doom happens, and the character is retired. If a milestone becomes impossible, the perk is lost and its points with it." },
  { id: "filthLicker", name: "Filth-Licker", branch: "general", cost: 1, req: [ANY(D("Consume 5 disgusting things"), ALL(K("Acting", 4), K("Endurance", 4)))],
    text: "As an Action, roll Endurance or Acting against a target's Concentration. Win and pick: Avoidance (they won't attack you) or Anger (they attack only you). Either lasts until they spend an Action steadying themselves. Once an hour per target." },
  { id: "witchy", name: "Witchy", branch: "general", cost: 1, req: [D("A belief in the supernatural"), K("Concentration", 4)],
    text: "In downtime, spend an hour and 50eb on a ritual, then roll 1d10: a 1 succeeds. Each extra hour and 50eb (up to 8) adds 1 to the number you need. Intents: Protection (anyone harming you at home takes −4), Fortune (your next Hustle pays double), or Wisdom (ask the GM one question; the answer comes as three tarot cards)." },
  { id: "cartophilist", name: "Cartophilist", branch: "general", cost: 1, req: [ANY(D("Open 5 packs of Elflines Online cards"), K("Gamble", 4))],
    text: "Opening a pack, spend 1 LUCK to choose one card, or 2 LUCK to raise one card's rarity a tier." },
  { id: "technobabbler", name: "Technobabbler", branch: "general", cost: 1, req: [KA("language", 6), KA("tech", 4)],
    text: "Use the language as a Complementary Check for a Tech Skill you have at 4+. The DV is always 21, and each point you beat it by is +1 to the Tech Check (instead of the usual +1), as long as you can say one real-sounding technobabble phrase per point." },
  { id: "festive", name: "Festive", branch: "general", cost: 1, req: [D("Spend 500eb+ celebrating a holiday")],
    text: "During a celebration, each time you spend LUCK roll 1d10: on 1-3, get 1 LUCK back. When the celebration ends, regain 2d6 Humanity." },
  { id: "prisonPockets", name: "Prison Pockets", branch: "general", cost: 2, req: [D("25+ items carried"), K("Endurance", 4), K("Conceal/Reveal Object", 6)],
    text: "You can always carry one more main weapon than your armor allows. When searched, spend 1 LUCK to make the searcher find one item of your choice and nothing else." },
  { id: "speedrunner", name: "Speedrunner", branch: "general", cost: 2, req: [ANY(D("100+ hours in one game"), K("Electronics/Security Tech", 4))],
    text: "In any video game or game BD, use an Action to exploit it: Motherlode (1-5 LUCK: 1,000 game currency each), BunnyHop (1-5 LUCK: +2 MOVE each for two Rounds), or WrongWarp (3-6 LUCK, roll 1d10 under the LUCK spent: warp anywhere in the game)." },
  { id: "darkDreamer", name: "Dark Dreamer", branch: "general", cost: 2, req: [D("Sleep uncomfortably three nights running")],
    text: "Sleep uncomfortably whenever you like. When you do, beat a DV21 Concentration Check to steer the dream: Déjà Vu (roll any Check now; use that roll the next time you make it), Aspiration (+2d6 to your next IP award), Nightmare (1 Humanity Loss, but auto-pass your next fear, Facedown or Suppression Check), or Comfort (roll your next Humanity gain twice, keep the higher)." },
  { id: "collector", name: "Collector", branch: "general", cost: 2, req: [D("Own every item of one category or weapon type")],
    text: "Each complete set earns a Collector Point. Spend each on: Historian (+2 per point to Checks about that category's history and tech, not its use), Completionist (3d6 Humanity and 15 IP), or Flipper (that category's items are worth 50% more, once per category)." },
  { id: "underdog", name: "Underdog", branch: "general", cost: 2, req: [ANY(D("Beat a boss-level foe"), S("will", 8))],
    text: "+1 to attack a target for each Role rank they have above yours.", fx: [B("bonuses.universalAttack", 1)] },
  { id: "perkFiend", name: "Perk Fiend", branch: "general", cost: 3, req: [PN(4)],
    text: "Each time you buy a perk, flip a coin. Heads: gain a Perk Point. Tails: 2d6 Humanity Loss." },

  // ---------------- Intelligence (pp.90-91) ----------------
  { id: "elementary", name: "Elementary", branch: "int", cost: 1, req: [ANY(S("int", 6), D("Knowledge as motivation (instead of the INT)")), K("Education", 6)],
    text: "Once a day, spend an hour to make one Education-type Skill your focus: +1 to it until you sleep or switch, and raising it costs 10% less IP while it's your focus." },
  { id: "rulesLawyer", name: "Rules Lawyer", branch: "int", cost: 1, req: [S("int", 6), ANY(K("Bureaucracy", 6), D("Politely correct the GM on 3 rules"))],
    text: "+2 Bureaucracy. Once per session, when you politely catch an honest rules mistake, gain 1d6 IP and +2 to your next Action.",
    fx: [B("bonuses.bureaucracy", 2, false)] },
  { id: "talkNerdy", name: "Talk Nerdy to Me", branch: "int", cost: 1, req: [S("int", 6), P("hopelessRomantic")],
    text: "+1 COOL (max 8). Geeking out with your partner counts as an act of love and takes an hour, not a day.", fx: [ST("cool", 1, 8)] },
  { id: "gambler", name: "Gambler", branch: "int", cost: 2, req: [S("int", 6), K("Gamble", 6)],
    text: "On pure-luck games, roll twice and keep the better. Spend 2 LUCK to halve a loss or add 50% to a win." },
  { id: "numberCruncher", name: "Number Cruncher", branch: "int", cost: 2, req: [S("int", 8), K("Accounting", 6)],
    text: "Your Lifestyle and rent cost 25% less. Each act of fraud (a tricked bank login, a forged check, a counterfeiting run) earns a fraud point; each one you hold pays 100eb a month. In downtime, cash one in: roll 1d10 under your LUCK STAT minus fraud points cashed this month. Success: 1,000eb. Failure: the point's gone and you gain +1 Heat (Chapter 14)." },
  { id: "tacticalGenius", name: "Tactical Genius", branch: "int", cost: 2, req: [S("int", 8), K("Tactics", 6)],
    text: "Before Initiative, roll 1d6/2: that many Tactics Points. Spend one at the start of your Turn for a Tactics Check: 13+ Assessment (learn one visible target's wounds, armor, magazine and intent), 17+ Formation (+1 to your next held attack this Round), or 21+ Synchronicity (give up your Turn; an ally lower in Initiative who can hear you acts now instead)." },
  { id: "madScience", name: "Mad Science", branch: "int", cost: 3, req: [S("int", 8), KA("science", 6)],
    text: "Your Science never implodes, and once per session you can turn a failed Science Check into a success (not for inventing, fabricating or upgrading). When you raise your Science, also raise one other Science by 1. When you take this perk, tell the GM your breakthrough; the world changes to fit it, and you own the results." },

  // ---------------- Willpower (p.91) ----------------
  { id: "blackBlood", name: "Black Blood", branch: "will", cost: 1, req: [S("will", 6), D("Resist 5 poisons or biotoxins")],
    text: "Fail a Resist Torture/Drugs Check against a poison or biotoxin and you may spend 1 LUCK to pass instead. For three Rounds after you resist one, anyone who hits you in melee must make the same Check or take its damage." },
  { id: "aDogsLife", name: "A Dog's Life", branch: "will", cost: 3, req: [S("will", 6), ANY(D("Six months on Kibble"), K("Endurance", 8))],
    text: "The Kibble Lifestyle no longer costs you Humanity (Chapter 13). Once per session, eating a Kibble pack restores 1 LUCK and 1 Humanity. You sleep anywhere without being uncomfortable." },
  { id: "advancedObsession", name: "Advanced Obsession", branch: "will", cost: 2, req: [S("will", 8), P("obsessivelyHealthy")],
    text: "Add 500eb to your monthly Lifestyle for treatments and take one day a week for them. While you keep it up: +4 Personal Grooming, −3 to Humanity Loss from traumatic events, and heal 1d6/2 HP each time you roll Initiative. Miss a week or a payment: 2d6 Humanity Loss and no benefits until you're back on schedule.",
    fx: [B("bonuses.personalGrooming", 4, false)] },
  { id: "totalRecall", name: "Total Recall", branch: "will", cost: 2, req: [S("will", 8), K("Concentration", 6)],
    text: "You never roll to remember something you witnessed. Braindances you scroll yourself are always excellent quality, one price category higher." },
  { id: "moreWeight", name: "More Weight", branch: "will", cost: 2, req: [S("will", 8), K("Resist Torture/Drugs", 6)],
    text: "Spend 2 LUCK to automatically pass a Check against torture or interrogation." },
  { id: "partyAllNight", name: "Party All Night", branch: "will", cost: 2, req: [S("will", 8), D("Have taken every street drug")],
    text: "Against a drug's secondary effect: spend 2 LUCK to pass automatically, or choose to fail and regain 1 LUCK." },
  { id: "codeFollower", name: "Code Follower", branch: "will", cost: 3, req: [S("will", 8), P("honorBound")],
    text: "Your tenets are fixed for good. Breaking one costs Humanity equal to your WILL instead of 2d6. Call on your code WILL/2 times a day (round up) for +3, or spend a call to automatically pass a Death Save.",
    fx: [B("bonuses.allActions", 3)] },

  // ---------------- Cool (pp.91-92) ----------------
  { id: "rimbo", name: "Rimbo", branch: "cool", cost: 1, req: [S("cool", 6), P("darkAppetite")],
    text: "Your bad habit becomes intimate encounters. For 12 hours after, you and your partner both get +1 to COOL and EMP Checks, and both take the indulgence benefit." },
  { id: "whoLovesYa", name: "Who Loves Ya, Baby", branch: "cool", cost: 1, req: [S("cool", 6), ANY(D("A catchphrase used naturally 25 times"), KA("language", 6))],
    text: "Once an hour, drop your catchphrase in a conversation: Charming (+1 to your next opposed social Check against someone listening) or Annoying (−1 to everyone else's next social Check). Lasts a minute." },
  { id: "streetSmart", name: "Street Smart", branch: "cool", cost: 2, req: [S("cool", 6), K("Streetwise", 6)],
    text: "When the GM rolls a random city encounter, beat DV19 Streetwise to avoid it, or spend 1 LUCK to have the GM roll twice and pick from both. You know every Fixer of rank 2 or lower in the city." },
  { id: "foundFamily", name: "Found Family", branch: "cool", cost: 2, req: [S("cool", 6), P("familyMan")],
    text: "Your family can be up to EMP + COOL people, and you can add one mid-month into an open slot. Losing or dropping one costs 1d6 Humanity Loss." },
  { id: "persuasiveSpeaker", name: "Persuasive Speaker", branch: "cool", cost: 2, req: [S("cool", 8), K("Persuasion", 6)],
    text: "Take −4 on a Persuasion Check to make them believe it as fact. On a success, their memory and opinion change for good.",
    fx: [B("bonuses.persuasion", -4)] },
  { id: "palmGreaser", name: "Palm Greaser", branch: "cool", cost: 2, req: [S("cool", 8), K("Bribery", 6)],
    text: "On a Bribery Check, take −4 to pay half, or pay 50% more for +4.", fx: [B("bonuses.bribery", 4)] },
  { id: "level10", name: "Level 10 Attractiveness", branch: "cool", cost: 3, req: [S("cool", 8), K("Personal Grooming", 6), K("Wardrobe & Style", 6)],
    text: "+4 to seduce anyone who could be attracted to you. COOL times a day, use an Action to make a request of someone who can see and hear you. If they agree and do it, they get one: +1 to their next two Checks, 1d6/2 Humanity, 1 IP, or 1 HP (not while Mortally Wounded).",
    fx: [B("bonuses.persuasion", 4)] },

  // ---------------- Empathy (p.92) ----------------
  { id: "conversationalist", name: "Conversationalist", branch: "emp", cost: 1, req: [S("emp", 6), K("Conversation", 6)],
    text: "Make an opposed Conversation Check to butter someone up. Win, and for a minute add the difference in your Conversation levels to your social Checks against them. No bonus if theirs is equal or higher." },
  { id: "meatbagSwag", name: "Meatbag Swag", branch: "emp", cost: 1, req: [S("emp", 8), D("No new cyberware for a month")],
    text: "Each month you install no cyberware, gain an abstinence point. Spend them: 1 for 1d6 Humanity, 2 to give an ally 1d6 Humanity, 3 for +2 to Facedowns for a month. Install chrome and you lose every point; the perk is refunded.", refund: true },
  { id: "soulReader", name: "Soul Reader", branch: "emp", cost: 2, req: [S("emp", 6), K("Human Perception", 8)],
    text: "Take −2 on a Human Perception Check; on a success you earn a tell on that person. Spend a tell as an Action to automatically pass a later Human Perception Check on them.",
    fx: [B("bonuses.humanPerception", -2)] },
  { id: "moreHuman", name: "More Human Than Human", branch: "emp", cost: 3, req: [EMPO(8), SMAX("emp", 4)],
    text: "While your Humanity is 10 or more, EMP-based Checks use your original EMP." },

  // ---------------- Technique (p.92) ----------------
  { id: "fastFingers", name: "Fast Fingers", branch: "tech", cost: 1, req: [S("tech", 6), D("Pick 10 pockets and 10 locks")],
    text: "Once a Round, pick a pocket or a lock without an Action. You're only noticed on a critical failure." },
  { id: "iCanFixIt", name: "I Can Fix It", branch: "tech", cost: 1, req: [S("tech", 6), D("Repair 10 different items")],
    text: "Each repair earns a repair point for that kind of item: +1 per point (max 4) on the next repair of the same kind." },
  { id: "creative", name: "Creative", branch: "tech", cost: 1, req: [S("tech", 6), KA("art", 8)],
    text: "Your work in that Skill is excellent quality, one price category higher. Spend twice the time at −2: two categories higher. It counts as Art for your home (Chapter 13)." },
  { id: "cybertechnician", name: "Cybertechnician", branch: "tech", cost: 2, req: [S("tech", 8), K("Cybertech", 6)],
    text: "Once you've identified a piece of cyberware, you never roll to spot it again (internal chrome excepted). Aim at an identified implant at an extra −1: a hit deals double damage and switches it off, options included." },
  { id: "demolitionMan", name: "Demolition Man", branch: "tech", cost: 2, req: [S("tech", 8), K("Demolitions", 6)],
    text: "Roll explosive damage twice and keep the higher (not grenades that hit targets one by one). Making or defusing explosives takes half the time." },
  { id: "tuneUp", name: "Tune-Up", branch: "tech", cost: 2, req: [S("tech", 8), KA("vehicleTech", 6)],
    text: "Restyle a vehicle in four hours for 500eb. Spend a minute and 100eb of materials on a DV17 Vehicle Tech Check for a one-hour tune-up: Patch Job (2d6 temporary SDP), Overclock (+9 MOVE), Sealed Up (can't be targeted by aimed shots), or Oil Change (+1 to Maneuvers). As an Action in combat at −4 (−8 in a moving vehicle), it lasts only three Rounds." },
  { id: "hackerExtraordinaire", name: "Hacker Extraordinaire", branch: "tech", cost: 3, req: [S("tech", 8), K("Electronics/Security Tech", 6)],
    text: "Take −4 to do an Electronics/Security Tech job, or a Breach, in half the time or NET Actions (round up). Or take −4 on a Check to weaken a system or Neuroport: on a success its Breach and quickhack DVs drop by 3 for the scene.",
    fx: [B("bonuses.electronicsAndSecurityTech", -4)] },

  // ---------------- Reflex (pp.92-93) ----------------
  { id: "nervous", name: "Nervous", branch: "ref", cost: 1, req: [S("ref", 6), D("Top of Initiative 3 times")],
    text: "When you're first in Initiative, pick one for your first Turn: Quickdraw (+2 to Aimed Shots), Flight (a free Run, but not two), or Fight (a free attack, but not two).",
    fx: [B("bonuses.aimedShot", 2)] },
  { id: "hunter", name: "Hunter", branch: "ref", cost: 1, req: [S("ref", 6), P("vengefulBastard")],
    text: "You can have up to WILL nemeses at once. Your bonus while one is in sight equals WILL minus your current nemeses (minimum +1). New nemeses need an empty slot." },
  { id: "deadeye", name: "Deadeye", branch: "ref", cost: 2, req: [S("ref", 8), ANY(K("Handgun", 6), K("Archery", 6))],
    text: "Describe a trick shot with that Skill. The GM sets the DV and penalties: Aimed −8, complex −2, blind −4, reloading mid-shot −4. Each risk taken (including danger to allies, or to the weapon) earns a deadeye point on a hit. Spend them after damage to reroll your lowest damage die, one per point. Unspent points fade after a minute without attacking." },
  { id: "pumpAction", name: "Pump-Action", branch: "ref", cost: 2, req: [S("ref", 8), K("Shoulder Arms", 6)],
    text: "Use an Action to pump or bolt a rifle or shotgun. If your next Action attacks with it, roll damage twice and keep the higher. Pump twice: roll three times. Do anything else next and it jams (after a double pump, it's destroyed)." },
  { id: "bulletDodger", name: "Bullet Dodger", branch: "ref", cost: 3, req: [S("ref", 8), D("Dodge 5 melee attacks in a row")],
    text: "Against a ranged attack or explosion you can see, use both your dodge (DEX + Evasion + 1d10) and the range DV: the shooter must beat both. Drop below REF 8 and this switches off." },
  { id: "autofireFiend", name: "Autofire Fiend", branch: "ref", cost: 3, req: [S("ref", 8), K("Autofire", 6)],
    text: "Push the Limit on an Autofire Check costs 1 LUCK. Once per combat, empty 20 rounds instead of 10 to raise that attack's maximum multiplier by 1." },
  { id: "porky", name: "Porky", branch: "ref", cost: 3, req: [S("ref", 8), KALL("ranged", 6)],
    text: "+1 to Facedowns for each weapon visibly on you (max +3). Each kill with a firearm earns a violence point. After the fight, either heal that much HP and take that much Humanity Loss, or turn them into IP (max 10 a fight)." },

  // ---------------- Luck (p.93) ----------------
  { id: "miseryMagnet", name: "Misery Magnet", branch: "luck", cost: 3, req: [S("luck", 8), D("10 critical failures"), NP(["critMagnet", "chaosMagnet"])],
    text: "Roll a natural 1 on a Check and spend 2 LUCK to explode instead of implode, or accept the implosion and regain 1 LUCK. Once per Check." },
  { id: "critMagnet", name: "Crit Magnet", branch: "luck", cost: 3, req: [S("luck", 8), D("10 critical successes"), NP(["miseryMagnet", "chaosMagnet"])],
    text: "Roll a natural 9 on a Check and spend 3 LUCK to explode as if it were a 10. A 10 on your explosion die explodes once more, and that extra die counts toward your total (it still starts a Chain). Once per Check." },
  { id: "chaosMagnet", name: "Chaos Magnet", branch: "luck", cost: 3, req: [S("luck", 8), D("5 critical failures and 5 critical successes"), NP(["miseryMagnet", "critMagnet"])],
    text: "Spend all your LUCK (at least 1) to make a Check a coin flip: heads is a critical success, tails a critical failure. And whenever you roll a natural 1 or 10, flip a coin: heads explodes, tails implodes. Your chains run on 10s either way, and every chain die counts toward your total." },

  // ---------------- Body (p.93) ----------------
  { id: "decentShape", name: "Decent Shape", branch: "body", cost: 1, req: [S("body", 6)],
    text: "Each morning pick Athletics, Brawling or Melee Weapon: +1 to it today.",
    fx: [B("bonuses.athletics", 1), B("bonuses.brawling", 1), B("bonuses.meleeWeapon", 1)] },
  { id: "goodShape", name: "Good Shape", branch: "body", cost: 2, req: [S("body", 8), P("decentShape")],
    text: "As Decent Shape, but +2. They don't stack.",
    fx: [B("bonuses.athletics", 2), B("bonuses.brawling", 2), B("bonuses.meleeWeapon", 2)], replaces: "decentShape" },
  { id: "wrestler", name: "Wrestler", branch: "body", cost: 3, req: [S("body", 8), ANY(D("5 successful grapples"), KA("martial", 6, "wrestling"))],
    text: "In an opposed grapple, add the difference between your BODY and theirs. Nothing if theirs is equal or higher." },
  { id: "shapedByGods", name: "Shaped by the Gods", branch: "body", cost: 3, req: [S("body", 10)],
    text: "On Facedowns, Interrogation and Persuasion, add the difference between your BODY and the target's. Nothing if theirs is equal or higher." },

  // ---------------- Dexterity (pp.93-94) ----------------
  { id: "limber", name: "Limber", branch: "dex", cost: 1, req: [S("dex", 6), D("Run in combat 5 times")],
    text: "After you Run, ranged attacks against you take −2 until your next Turn." },
  { id: "coverLover", name: "Cover Lover", branch: "dex", cost: 1, req: [S("dex", 6), D("Let cover stop 5 attacks")],
    text: "Cover you're using has +10 HP. At the start of a fight, spend up to 3 LUCK: the GM adds one piece of cover to the map per point (the GM picks what and where)." },
  { id: "crouchingTiger", name: "Crouching Tiger", branch: "dex", cost: 2, req: [S("dex", 8), K("Stealth", 6)],
    text: "Fail a Stealth roll and choose one: reroll at −2, spend 3 LUCK to pass anyway, or spend 2 LUCK to have your takedown drop a Mook outright. And spend 1 LUCK to make a kill, takedown or grab from hiding silent, no roll." },
  { id: "hiddenDragon", name: "Hidden Dragon", branch: "dex", cost: 2, req: [S("dex", 8), KA("martial", 6)],
    text: "Each Martial Arts or Brawling hit earns a flow point; miss or get hit and they're gone. Spend 2 for +1 to a Brawling or Martial Arts attack, 4 to automatically succeed at a Martial Arts technique's resolution, or 6 for one extra Brawling attack at the end of your next attack." },
  { id: "meleeMaster", name: "Melee Master", branch: "dex", cost: 2, req: [S("dex", 8), K("Melee Weapon", 6)],
    text: "Melee crits add the BODY difference between you and a smaller target as bonus damage. With a melee weapon in hand you can parry at −4 instead of dodging: roll Melee Weapon, and a successful parry deals your BODY in damage to the attacker. Parrying a bullet needs REF 8+ and is at −8 against the range DV. Area attacks can't be parried." },
  { id: "necksnapper", name: "Necksnapper", branch: "dex", cost: 3, req: [S("dex", 8), D("Choke 10 targets")],
    text: "With someone grappled, use an Action to snap: deal double your BODY straight to their HP. Meat only, never non-lethal, no FBCs." },
  { id: "freerunner", name: "Freerunner", branch: "dex", cost: 3, req: [S("dex", 8), S("move", 8), K("Athletics", 6)],
    text: "On a Run, describe a stunt. The GM sets the DV and penalties: high jumps −2, climbing what can't be climbed −2, complex −2, blind −4. Each risk taken (including attacking mid-move, or danger to allies) earns a freerunner point on success. Spend them for +1m of movement each, or after melee damage to reroll your lowest die, one per point. They fade after a minute without a stunt." },

  // ---------------- Role perks (pp.94-96) ----------------
  { id: "artist", name: "Artist", branch: "role", group: "rockerboy", cost: 3, req: [R("rockerboy", 5), P("creative")],
    text: "Fans engaging with your art get +1 to anything you direct them to do with Charismatic Impact for a minute. You may add your art Skill to Charismatic Impact when winning new fans." },
  { id: "politico", name: "Politico", branch: "role", group: "rockerboy", cost: 3, req: [R("rockerboy", 6), P("persuasiveSpeaker")],
    text: "Persuasive Speaker has no penalty against your fans. Change a fan's mind WILL times and they become a follower, who'll do anything you ask without a Charismatic Impact roll." },
  { id: "charmer", name: "Charmer", branch: "role", group: "rockerboy", cost: 3, req: [R("rockerboy", 5)],
    text: "Charismatic Impact times a day, spend an Action to flatter a fan one-on-one: they regain 1d6 Humanity, and you get +1 to your next Persuasion or Charismatic Impact roll on them. Flatter the same fan more than twice a day and they roll Concentration against your Charismatic Impact; if they win, they stop being a fan. Followers never see through it." },
  { id: "highStrung", name: "High-Strung", branch: "role", group: "solo", cost: 3, req: [R("solo", 5), P("nervous")],
    text: "At the top of Initiative, shift your Combat Awareness points at the start of your Turn for free. When you spend an Action shifting them, spend 2 LUCK and flip a coin: heads, you get that Action back." },
  { id: "coolHeaded", name: "Cool-Headed", branch: "role", group: "solo", cost: 3, req: [R("solo", 6), P("meleeMaster")],
    text: "Parrying a bullet is only −4, like a melee parry. You can also parry grenades and shotgun shells at −8. Fail either and your weapon is destroyed, on top of the damage." },
  { id: "limitBreaker", name: "Limit Breaker", branch: "role", group: "solo", cost: 3, req: [R("solo", 5)],
    text: "Each morning, lower your Combat Awareness total by 2 to gain a Limit Break for the day: Big Damage (one attack; damage past armor is doubled), Big Combo (four attacks against Evasion; each hit past the first strips 1 SP instead of dealing damage), or Big Chance (on a hit, roll 1d10 three times; if all three are under your LUCK, keep rolling the weapon's damage until it crits or you stop; not for 1d6 or 2d6 weapons). Or invent one with the GM. Once a day, only while Seriously Wounded. Shout its name." },
  { id: "thief", name: "Thief", branch: "role", group: "netrunner", cost: 3, req: [R("netrunner", 5), P("fastFingers")],
    text: "When you pick a pocket with Fast Fingers, you can instead take −4 to swipe their shards and Holophone data straight into your deck. Your Breaches take half the NET Actions (round up)." },
  { id: "savant", name: "Savant", branch: "role", group: "netrunner", cost: 3, req: [R("netrunner", 6), P("hackerExtraordinaire")],
    text: "When you jack into an architecture on a Deep Dive, pick one: Summoner (your first Program rezzes for no NET Action), Doorcracker (pass the first Password without a roll), or Illusionist (the first Black ICE you meet doesn't trigger)." },
  { id: "neuromancer", name: "Neuromancer", branch: "role", group: "netrunner", cost: 3, req: [R("netrunner", 5)],
    text: "On a Deep Dive with your own Black ICE rezzed, spend a NET Action to move it up, down or across one floor. Once a dive, swap places with it. Or take 1 Humanity Loss for +1 to its next roll." },
  { id: "repairGuy", name: "Repair Guy", branch: "role", group: "tech", cost: 3, req: [R("tech", 5), P("iCanFixIt")],
    text: "Add your repair points for an item to Field Expertise, upgrade and fabrication rolls on it, not just repairs." },
  { id: "chromeDome", name: "Chrome Dome", branch: "role", group: "tech", cost: 3, req: [R("tech", 6), P("cybertechnician")],
    text: "Aiming at identified cyberware is only the normal −8. Upgrading or fabricating cyberware you've identified gets +2 and costs 25% less." },
  { id: "upgradesPeople", name: "Upgrades, People!", branch: "role", group: "tech", cost: 3, req: [R("tech", 5)],
    text: "Pay double to give an upgraded item one more Tech upgrade. It's unstable: lose all its SP or SDP, and every upgrade and attachment is destroyed. Reinforce it to make it stable: a fabrication Check at −4, double time and materials." },
  { id: "pharmaFiend", name: "Pharma Fiend", branch: "role", group: "medtech", cost: 3, req: [R("medtech", 5), P("blackBlood")],
    text: "You can take one extra dose of any pharmaceutical in its time window, for 1d6 Humanity Loss." },
  { id: "overclock", name: "Overclock", branch: "role", group: "medtech", cost: 3, req: [R("medtech", 6), P("tuneUp")],
    text: "Spend a minute and 100eb on a DV17 Cybertech Check to tune someone's chrome for an hour: Patch Job (1d6 temporary HP), Power Redistribution (+1 to one STAT, −2 to another, never BODY or EMP, never below 1), or Fluid Change (temporary Humanity equal to 1d6 + their EMP). As an Action at −4 it lasts three Rounds. A failed tune-up costs the patient 1d6 Humanity Loss." },
  { id: "hippocraticHypocrite", name: "Hippocratic Hypocrite", branch: "role", group: "medtech", cost: 3, req: [R("medtech", 5)],
    text: "As an Action, make a Deduction Check on a meat target to find a weak spot. Aim at it: roll damage twice, keep the higher (it isn't doubled for location). They then roll 1d10 under BODY or choose: +1 to their Death Save penalty, or lose their next Turn to the pain." },
  { id: "watsonian", name: "Watsonian", branch: "role", group: "media", cost: 3, req: [R("media", 5), P("elementary")],
    text: "Your Elementary focus is +2. Take −4 on an investigation Check to reconstruct what happened: the GM tells you true and in order. A failure gives you a confident, wrong version." },
  { id: "doylist", name: "Doylist", branch: "role", group: "media", cost: 3, req: [R("media", 6), P("soulReader")],
    text: "You can spend LUCK when you publish (Second Chance only). Or publish harder: lower your Believe chance by 2 in 10 (min 1) and treat your Impact as one rank higher." },
  { id: "paparazzi", name: "Paparazzi", branch: "role", group: "media", cost: 3, req: [R("media", 5)],
    text: "With a camera ready, take a snapshot with Photography/Film, Media rank times per session: Incriminating (DV21; counts as two pieces of evidence when you publish), Informative (DV17; +1 to Checks investigating it), or Irritating (DV15; the target beats your roll with Concentration or must avoid you or face you at −2 for two Rounds)." },
  { id: "scrumMaster", name: "Scrum Master", branch: "role", group: "exec", cost: 3, req: [R("exec", 5), P("whoLovesYa")],
    text: "Roll Loyalty Saves twice and keep the better. Or crunch a Team Member: on a success the task takes half the time and they lose 1 Loyalty; on a failure they lose 2." },
  { id: "sheetSpreader", name: "Sheet Spreader", branch: "role", group: "exec", cost: 3, req: [R("exec", 6), P("numberCruncher")],
    text: "Source up to Very Expensive through the company: roll 1d10 under your Exec rank (+2 to the roll for every recent failure or bad mark with your boss, −1 for each success). Luxury is +4 to the roll, Super Luxury +6." },
  { id: "worldsBestBoss", name: "World's Best Boss", branch: "role", group: "exec", cost: 3, req: [R("exec", 5)],
    text: "Team Members at Loyalty 7+ are trusted. Spend LUCK equal to Loyalty they'd lose to stop it, and they don't lose Loyalty for a quiet session. Spend a week training one to give them one of your Perk Points (you pick their perk); if they fall below 7, those points are gone." },
  { id: "narc", name: "Narc", branch: "role", group: "ganger", cost: 3, req: [ANY(R("ganger", 5), D("Heat −5 or lower")), P("rulesLawyer")],
    text: "Busting a crime, winning a Facedown, or doing something unpopular in public earns an animosity point. Enemies who see you roll 1d10: under your animosity, they must target you, and you lose a point. Spend points for +1 each to Facedowns or Interrogation. Hold more than your rank (or 5, with no rank) and your contact pulls you off the street for a week." },
  { id: "codeRed", name: "Code RED", branch: "role", group: "ganger", cost: 3, req: [R("ganger", 6), P("streetSmart")],
    text: "Spend LUCK equal to half your rank to roll Backup twice and keep the better, or to roll its arrival time twice. Random city encounters skip you unless you're in a Combat Zone or choose otherwise. You know every Fixer of rank 5 or lower." },
  { id: "uniformBrutality", name: "Uniform Brutality", branch: "role", group: "ganger", cost: 3, req: [R("ganger", 5)],
    text: "Each job done for your gang earns a requisition point. Spend one to request an item from the gang's stores. Over 100eb, you pay half. Over 500eb, you pay all of it." },
  { id: "fastTalk", name: "Fast Talk", branch: "role", group: "fixer", cost: 3, req: [R("fixer", 5), P("conversationalist")],
    text: "After you butter someone up, your next Haggle with them works at the tier above yours. Butter the same person up WILL times and they become a full contact, permanently buttered." },
  { id: "greasyGreasyGuy", name: "Greasy Greasy Guy", branch: "role", group: "fixer", cost: 3, req: [R("fixer", 6), P("palmGreaser")],
    text: "Push the Limit on Bribery costs 1 LUCK. Each time you bribe or help a contact, they owe you a debt point. Spend one for an automatic success on any Persuasion, Haggle, Interrogation, Facedown or trade with them. At debt equal to their WILL, they'll do anything you ask until you clear it." },
  { id: "nightLights", name: "Night Lights", branch: "role", group: "fixer", cost: 3, req: [R("fixer", 5)],
    text: "When you run a Night Market (Chapter 17), you can make it loud: roll 1d10. Under your Fixer rank: double the Hustle payout and +1 Rep. Over: it's busted; lose 1d10×200eb and 1 Rep." },
  { id: "roughLiving", name: "Rough Living", branch: "role", group: "nomad", cost: 2, req: [R("nomad", 5), P("aDogsLife")],
    text: "Sleeping in your vehicle or outside is never uncomfortable. You drive twice as long without rest, your vehicle carries twice the cargo without losing seats, and your Hustle pays double." },
  { id: "driveByDebutante", name: "Drive-By Debutante", branch: "role", group: "nomad", cost: 3, req: [R("nomad", 6), P("chaosMagnet")],
    text: "Driving in combat, on a critical success or failure you may roll 1d6 instead (spend 2 LUCK to roll twice and pick): 1 a ramp for a big jump, 2 a blockage (coin flip: their path or yours), 3 a tanker of something flammable, 4 civilians ahead (plowing through costs 2d6 Humanity Loss), 5 a hazard every driver must beat (losers take 6d6 to their vehicle), 6 an escape route. Also +1 to Aimed Shots while driving.",
    fx: [B("bonuses.aimedShot", 1)] },
  { id: "wellTravelled", name: "Well Travelled", branch: "role", group: "nomad", cost: 3, req: [R("nomad", 5)],
    text: "Spend 1 LUCK to add your Moto rank to a Local Expert or Education Check. Pick one more non-difficult Education Skill you can do the same with." },

  // ---------------- Specialty perks (p.96): one Cyber and one Weapon at a time ----------------
  { id: "cyberopticsSpecialist", name: "Cyberoptics Specialist", branch: "specialty", group: "cyber", slot: "cyber", cost: 2, req: [CW(["cyberEye"], 2, { options: true })],
    text: "Once an hour, spend 1 LUCK or 1 Humanity to have a quest marker point you to an object, person or point of interest in view (or to the next one, if nothing's here). Only you see it." },
  { id: "cyberaudioSpecialist", name: "Cyberaudio Specialist", branch: "specialty", group: "cyber", slot: "cyber", cost: 2, req: [CW(["cyberAudioSuite"], 2, { options: true })],
    text: "Once an hour, spend 1 LUCK or 1 Humanity to perceive by sound out to 10m for a minute: +4 to Perception and Human Perception for anything you can hear.",
    fx: [B("bonuses.perceptionHearing", 4)] },
  { id: "cyberlimbSpecialist", name: "Cyberlimb Specialist", branch: "specialty", group: "cyber", slot: "cyber", cost: 2, req: [CW(["cyberArm", "cyberLeg"], 2)],
    text: "Once an hour, spend 1 LUCK or 1 Humanity to negate a Critical Injury to a matching cyberlimb: Dismembered Arm, Dismembered Hand or Torn Muscle (arms); Dismembered Leg or Broken Leg (legs)." },
  { id: "wareSpecialist", name: "Internal/External Ware Specialist", branch: "specialty", group: "cyber", slot: "cyber", cost: 2, req: [CW(["cyberwareInternal", "cyberwareExternal"], 3)],
    text: "Once per session, spend LUCK equal to the d6s of Humanity Loss a new implant would cost to halve that loss." },
  { id: "borgwareSpecialist", name: "Borgware Specialist", branch: "specialty", group: "cyber", slot: "cyber", cost: 2, req: [CW(["borgware"], 2)],
    text: "Once an hour, spend 1 LUCK or 1 Humanity to stop anyone making a Human Perception Check or calling a Facedown on you." },
  { id: "shieldSpecialist", name: "Shield Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["shield"])],
    text: "Your shield blocks light and medium melee weapons and unarmed attacks without losing HP." },
  { id: "pistolSpecialist", name: "Pistol Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["medPistol", "heavyPistol", "vHeavyPistol"])],
    text: "Your DV with a pistol at 7-12m is 13, not 15." },
  { id: "smgSpecialist", name: "SMG Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["smg", "heavySmg"])],
    text: "Autofire and Suppressive Fire with an SMG cost 6 rounds, not 10." },
  { id: "shotgunSpecialist", name: "Shotgun Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["shotgun"])],
    text: "Shotgun shells deal 4d6, not 3d6." },
  { id: "rifleSpecialist", name: "Rifle Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["assaultRifle", "sniperRifle"])],
    text: "Rifle attacks against an uninjured target deal +1d6 damage." },
  { id: "bowSpecialist", name: "Bow Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["bow"])],
    text: "A 6 on a bow or crossbow's damage roll causes a Critical Injury." },
  { id: "heavyWeaponSpecialist", name: "Heavy Weapon Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["grenadeLauncher", "rocketLauncher"])],
    text: "Heavy Weapons attacks crit on a 9 or 10, and 5s and 6s count toward Critical Injuries on their damage." },
  { id: "thrownSpecialist", name: "Thrown Weapon Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["thrownWeapon"])],
    text: "Your thrown DV at 13-25m is 13, not 15." },
  { id: "meleeSpecialist", name: "Melee Specialist", branch: "specialty", group: "weapon", slot: "weapon", cost: 2, req: [W(["lightMelee", "medMelee", "heavyMelee", "vHeavyMelee"])],
    text: "Kill a target with a melee attack and the leftover damage carries to another target in reach." },

  // ---------------- Free City perks (pp.96-98) ----------------
  { id: "freeCityPapers", name: "Free City Papers", branch: "freeCity", group: "street", cost: 1, req: [D("A Night City origin, or a year of residency in play")],
    text: "+2 to Bureaucracy and Persuasion with officials, at checkpoints and at entry points. Once per session, a stop-and-frisk while you're Flagged (Heat +1-2) ends with a warning.",
    fx: [B("bonuses.bureaucracy", 2), B("bonuses.persuasion", 2)] },
  { id: "colorsReader", name: "Colors Reader", branch: "freeCity", group: "street", cost: 1, req: [K("Streetwise", 4), D("Deal with five different gangs in play")],
    text: "You read colors, rank tattoos and turf lines at a glance. You always know whose turf you're standing on, and get +2 Streetwise about any gang's business.",
    fx: [B("bonuses.streetwise", 2)] },
  { id: "hustler", name: "Hustler", branch: "freeCity", group: "street", cost: 1, req: [D("Six weeks of hustling")],
    text: "Once a month, reroll your Hustle die (Chapter 13) and keep the better." },
  { id: "heatSink", name: "Heat Sink", branch: "freeCity", group: "street", cost: 2, req: [S("cool", 6), D("Arrested and released three times")],
    text: "The first point of Heat you'd gain each month doesn't land. While your Heat is positive, add only a quarter of it (round up) to Security Codes, not half (Chapter 14)." },
  { id: "blackMarketNose", name: "Black Market Nose", branch: "freeCity", group: "street", cost: 2, req: [D("Self source five items")],
    text: "You can Self Source two items a week (Chapter 12). The second one's Sourcing DV is +2." },
  { id: "factionDarling", name: "Faction Darling", branch: "freeCity", group: "street", cost: 2, req: [D("+6 Standing with any faction")],
    text: "Pick that faction. Your Standing with it never cools off. Once a month, call in a small favor: an introduction, a safe night, or help worth up to 500eb." },
  { id: "doubleDealer", name: "Double Dealer", branch: "freeCity", group: "street", cost: 3, req: [S("cool", 8), K("Acting", 6), D("+4 Standing with two rival factions")],
    text: "When you gain Standing with one, the Enemies of My Enemy drop never hits you with the other. You still can't join both. If either finds out what you are (the GM decides when), both Standings fall by 5 at once." },
  { id: "edgeRider", name: "Edge Rider", branch: "freeCity", group: "edge", cost: 2, req: [S("luck", 6), D("Push the Limit ten times")],
    text: "Once per session, Push the Limit costs 1 LUCK." },
  { id: "flashbackArtist", name: "Flashback Artist", branch: "freeCity", group: "edge", cost: 2, req: [ANY(S("int", 6), S("cool", 6)), D("Pull off three Flashes of Luck")],
    text: "Your first Flash of Luck each Mission costs 1 less LUCK (min 1), and its spending limit is doubled." },
  { id: "fortuneFavors", name: "Fortune Favors", branch: "freeCity", group: "edge", cost: 3, req: [S("luck", 7), D("Take three Plot Die complications")],
    text: "Once per session, when the Plot Die shows a Complication, spend 2 LUCK: keep the bonus and cancel the Complication." },
  { id: "iceBathVeteran", name: "Ice-Bath Veteran", branch: "freeCity", group: "net", cost: 1, req: [D("Five Deep Dives")],
    text: "Your cooling rig's safe time is 50% longer, and your first Burnout each dive deals only 1d6/2." },
  { id: "cooldownJunkie", name: "Cooldown Junkie", branch: "freeCity", group: "net", cost: 2, req: [S("int", 6), R("netrunner", 4)],
    text: "Once per combat, run a quickhack that's still on Cooldown. When you do, take 1d6/2 brain damage (straight to HP)." },
  { id: "ghostHands", name: "Ghost Hands", branch: "freeCity", group: "net", cost: 2, req: [R("netrunner", 4), D("Land ten quiet quickhacks while ghosted")],
    text: "Once per combat, a quickhack that isn't Quiet counts as Quiet (◆)." },
  { id: "hardenedPort", name: "Hardened Port", branch: "freeCity", group: "net", cost: 2, req: [S("tech", 6), K("Electronics/Security Tech", 6)],
    text: "Your Neuroport has one more Passwall than its Self-ICE gives it, even past the usual limit of three." },
  { id: "wellFrozenVeteran", name: "Well Frozen Veteran", branch: "freeCity", group: "chrome", cost: 1, req: [D("Come out of a cryotank twice")],
    text: "Well Frozen (Chapter 04) lasts 3 days for you, not 7." },
  { id: "steadyChrome", name: "Steady Chrome", branch: "freeCity", group: "chrome", cost: 2, req: [S("will", 6), CW(null, 4)],
    text: "Once a month, ignore one loss die on the Monthly Humanity Check (Chapter 13)." },
  { id: "leadFoot", name: "Lead Foot", branch: "freeCity", group: "wheels", cost: 2, req: [S("ref", 6), KA("control", 6)],
    text: "+1 to Positioning Checks in a Chase (Chapter 11). Once per chase, Pull Ahead is DV15 for you, not 17." },
  { id: "quietProfessional", name: "Quiet Professional", branch: "freeCity", group: "wheels", cost: 1, req: [K("Stealth", 4), D("Ten kills with a silenced weapon")],
    text: "The Silencer DV to hear your shots is +2 (Chapter 06)." },
  { id: "patientShadow", name: "Patient Shadow", branch: "freeCity", group: "wheels", cost: 2, req: [S("dex", 6), K("Stealth", 6), D("A whole sneak without a failed roll")],
    text: "Once per sneak, when a group is Suspicious, your Stealth roll against them uses the Unaware DV." },
  { id: "hqPillar", name: "HQ Pillar", branch: "freeCity", group: "crew", cost: 2, req: [D("Your crew has a Headquarters, and three HQ Gigs done")],
    text: "Each HQ Gig you take part in earns the crew +10 HQ IP (once per gig, however many Pillars are on the crew)." },
  { id: "rideOrDie", name: "Ride or Die", branch: "freeCity", group: "crew", cost: 3, req: [R("ganger", 5)],
    text: "Once per session, your Backup arrives at the start of the next Round, without a roll." },
  { id: "cornerOffice", name: "Corner Office", branch: "freeCity", group: "crew", cost: 3, req: [R("exec", 5), PA(["worldsBestBoss", "scrumMaster"])],
    text: "Once per session, a Team Member's failed Loyalty Save becomes a success. They still lose 1 Loyalty for being asked." }
];

export const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

/** The STATs a "+1 to one STAT" perk can raise. */
export const STATS = ["int", "ref", "dex", "tech", "cool", "will", "luck", "move", "body", "emp"];

/* ------------------------------------------ */
/*  A character's perks                       */
/* ------------------------------------------ */

/**
 * The perk record kept on a character: owned perks (with any choice made when bought, and whether
 * the player switched it off), awards (Perk Points from big moments, training, the GM), points
 * forfeited (lost perks, dropped specialties), deeds the GM confirmed, the role ranks the
 * character started with (ranks raised past them earn points), the kill count, and whether
 * character creation is still open (creation-only perks).
 */
export function normalizeRecord(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const owned = (Array.isArray(r.owned) ? r.owned : [])
    .filter((o) => PERK_BY_ID.has(o?.id))
    .map((o) => ({ id: o.id, at: Number(o.at) || 0, stat: STATS.includes(o.stat) ? o.stat : null, free: !!o.free }));
  const awards = (Array.isArray(r.awards) ? r.awards : []).map((a) => ({ n: Math.trunc(Number(a?.n) || 0), reason: String(a?.reason ?? "").slice(0, 200), at: Number(a?.at) || 0 })).filter((a) => a.n);
  const deeds = {};
  for (const [id, v] of Object.entries(r.deeds ?? {})) if (PERK_BY_ID.has(id) && v) deeds[id] = true;
  const baseline = {};
  for (const [role, rank] of Object.entries(r.baseline ?? {})) baseline[String(role).toLowerCase()] = int(rank, 0, 10);
  return {
    owned: owned.filter((o, i) => owned.findIndex((x) => x.id === o.id) === i),
    awards,
    forfeit: int(r.forfeit),
    gone: (Array.isArray(r.gone) ? r.gone : []).filter((id) => PERK_BY_ID.has(id)),
    deeds,
    baseline,
    kills: int(r.kills),
    creation: r.creation !== false,
    started: !!r.started
  };
}

/** Perk Points from Role ranks raised past the character's starting ranks (not Ganger or Exec). */
export function rankPoints(roles, baseline) {
  let n = 0;
  for (const [role, rank] of Object.entries(roles ?? {})) {
    if (EARNED_ROLES.includes(role)) continue;
    n += Math.max(0, int(rank) - int(baseline?.[role] ?? rank));
  }
  return n;
}

/** Points: total earned, spent on owned perks (free ones cost nothing), forfeited, and what's left. */
export function points(record, roles) {
  const total = START_POINTS + rankPoints(roles, record.baseline) + record.awards.reduce((n, a) => n + a.n, 0);
  const spent = record.owned.reduce((n, o) => n + (o.free ? 0 : PERK_BY_ID.get(o.id)?.cost ?? 0), 0);
  return { total, spent, forfeit: record.forfeit, available: total - spent - record.forfeit };
}

/**
 * A snapshot of what the requirements read, from a character: { stats: {int: n}, empMax, skills:
 * [{name, level, category, type}], roles: {tech: 4}, lifestyle: 0-4, weapons: [types], shield,
 * cyber: [{type, foundational}] }.
 */

const cmp = (have, r) => (r.min !== undefined ? have >= r.min : true) && (r.max !== undefined ? have <= r.max : true);
const lower = (s) => String(s ?? "").toLowerCase();

function skillsOfKind(sheet, kind, match = "") {
  const k = SKILL_KINDS[kind] ?? {};
  return sheet.skills.filter((s) => (k.category && s.category === k.category)
    || (k.type && s.type === k.type)
    || (k.names && k.names.some((n) => lower(n) === lower(s.name))))
    .filter((s) => !match || lower(s.name).includes(lower(match)));
}

/**
 * Whether one requirement is met: true, false, or "deed" (the GM confirms it; met when the GM
 * has confirmed this perk's deeds), or "creation" (only while creation is open).
 * @returns {{ok: boolean, auto: boolean}} auto: Neon At Home can tell (a STAT, a Skill...), so
 *   losing it switches the perk off (p.88)
 */
export function checkReq(req, sheet, ctx) {
  switch (req.t) {
    case "stat": return { ok: cmp(int(sheet.stats?.[req.stat]), req), auto: true };
    case "empMax": return { ok: int(sheet.empMax) >= req.min, auto: false };
    case "skill": {
      const s = sheet.skills.find((x) => lower(x.name) === lower(req.skill));
      return { ok: cmp(int(s?.level), req), auto: true };
    }
    case "anySkill": return { ok: skillsOfKind(sheet, req.kind, req.match).some((s) => int(s.level) >= req.min), auto: true };
    case "allSkills": {
      const list = skillsOfKind(sheet, req.kind);
      return { ok: list.length > 0 && list.every((s) => int(s.level) >= req.min), auto: true };
    }
    case "role": return { ok: int(sheet.roles?.[req.role]) >= req.min, auto: false };
    case "anyRole": return { ok: Object.values(sheet.roles ?? {}).some((r) => int(r) >= req.min), auto: false };
    case "perk": return { ok: ctx.owned.includes(req.perk), auto: false };
    case "anyPerk": return { ok: req.perks.some((p) => ctx.owned.includes(p)), auto: false };
    case "noPerk": return { ok: !req.perks.some((p) => ctx.owned.includes(p) && p !== ctx.self), auto: false };
    case "perkCount": return { ok: ctx.owned.filter((p) => p !== ctx.self).length >= req.n, auto: false };
    case "lifestyle": return { ok: int(sheet.lifestyle) >= req.tier, auto: true };
    case "deed": return { ok: !!ctx.confirmed, auto: false };
    case "creation": return { ok: !!ctx.creation, auto: false };
    case "weapon": {
      const has = req.types.some((t) => (t === "shield" ? sheet.shield : sheet.weapons.includes(t)));
      return { ok: has, auto: false };
    }
    case "cyber": {
      const n = sheet.cyber.filter((c) => (!req.types || req.types.includes(c.type)) && (!req.options || !c.foundational)).length;
      return { ok: n >= req.n, auto: false };
    }
    case "any": {
      const parts = req.of.map((x) => checkReq(x, sheet, ctx));
      return { ok: parts.some((p) => p.ok), auto: parts.every((p) => p.auto) };
    }
    case "all": {
      const parts = req.of.map((x) => checkReq(x, sheet, ctx));
      return { ok: parts.every((p) => p.ok), auto: parts.some((p) => p.auto) };
    }
    default: return { ok: false, auto: false };
  }
}

/** Every requirement of a perk, checked: [{ req, ok, auto }]. */
export function checkPerk(perk, sheet, record, { self = perk.id } = {}) {
  const ctx = { owned: record.owned.map((o) => o.id), self, confirmed: !!record.deeds[perk.id], creation: record.creation };
  return perk.req.map((req) => ({ req, ...checkReq(req, sheet, ctx) }));
}

/** Does a perk have something the GM has to confirm (done in play, a Lifepath entry)? */
export const hasDeed = (perk) => JSON.stringify(perk.req).includes('"t":"deed"');

/**
 * Whether an owned perk is dormant: a STAT, Skill or Lifestyle requirement no longer met switches
 * it off until it is again (p.88). Its own STAT boost doesn't count toward keeping it.
 */
export function dormant(perk, sheet, record) {
  return checkPerk(perk, sheet, record).some((c) => c.auto && !c.ok);
}

/**
 * What can stop a perk being bought now, as keys for the reasons: owned, gone (refunded for good),
 * points, reqs, slot (a specialty of that kind already held), combat.
 */
export function blockers(perk, sheet, record, roles, { inCombat = false } = {}) {
  const out = [];
  if (record.owned.some((o) => o.id === perk.id)) out.push("owned");
  if (record.gone.includes(perk.id)) out.push("gone");
  if (points(record, roles).available < perk.cost) out.push("points");
  if (checkPerk(perk, sheet, record).some((c) => !c.ok)) out.push("reqs");
  if (perk.slot && record.owned.some((o) => PERK_BY_ID.get(o.id)?.slot === perk.slot)) out.push("slot");
  if (inCombat) out.push("combat");
  return out;
}

/**
 * The CPR Active Effect changes for an owned perk on a character: STAT boosts within their caps
 * (counted from the STAT before perks; "full HP" ones only at full HP), and bonuses.
 * @param {object} base - { stats: STAT values without effects, hp: {value, max} }
 * @returns {{key, value, sit}[]}
 */
export function perkChanges(perk, owned, base) {
  const out = [];
  for (const fx of perk.fx ?? []) {
    if (fx.bonus) {
      out.push({ key: fx.bonus, value: fx.value, sit: !!fx.sit });
      continue;
    }
    const stat = fx.choose ? owned?.stat : fx.stat;
    if (!stat) continue;
    if (fx.fullHp && !(int(base.hp?.value) >= int(base.hp?.max) && int(base.hp?.max) > 0)) continue;
    const from = int(base.stats?.[stat]);
    const value = Math.max(0, Math.min(fx.value, Math.min(fx.cap, 10) - from));
    if (value > 0) out.push({ key: `system.stats.${stat}.value`, value, sit: false });
  }
  return out;
}

/**
 * Where each perk sits in its branch's tree: its depth (how many of its prerequisites are in the
 * same branch, chained) and the perks in the branch it builds on.
 * @returns {Map<string, {depth: number, from: string[]}>}
 */
export function treeOf(branch) {
  const list = PERKS.filter((p) => p.branch === branch);
  const ids = new Set(list.map((p) => p.id));
  const parents = (p) => {
    const out = [];
    const walk = (r) => {
      if (r.t === "perk" && ids.has(r.perk)) out.push(r.perk);
      if (r.t === "anyPerk") for (const x of r.perks) if (ids.has(x)) out.push(x);
      if (r.of) r.of.forEach(walk);
    };
    p.req.forEach(walk);
    return out;
  };
  const memo = new Map();
  const depth = (p) => {
    if (memo.has(p.id)) return memo.get(p.id);
    memo.set(p.id, 0);
    const d = Math.max(0, ...parents(p).map((id) => depth(PERK_BY_ID.get(id)) + 1));
    memo.set(p.id, d);
    return d;
  };
  return new Map(list.map((p) => [p.id, { depth: depth(p), from: parents(p) }]));
}

/** Perks in other branches a perk builds on (shown as links). */
export function crossPrereqs(perk) {
  const out = [];
  const walk = (r) => {
    if (r.t === "perk") out.push(r.perk);
    if (r.t === "anyPerk") out.push(...r.perks);
    if (r.of) r.of.forEach(walk);
  };
  perk.req.forEach(walk);
  return out.filter((id) => PERK_BY_ID.get(id)?.branch !== perk.branch);
}
