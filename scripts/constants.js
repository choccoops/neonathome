export const MODULE_ID = "cpr-neon-at-home";
export const SYSTEM_ID = "cyberpunk-red-core";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const TEMPLATE_PATH = `modules/${MODULE_ID}/templates`;

/** Modules Neon At Home reads from when they're active. */
export const NEON_HUB_ID = "cpr-neon-hub";
export const VAS_ID = "mmutons-cyberpunk-red-vas";
export const MMUTON_WEIGHT_ID = "mmutons-cyberpunk-red-weight-system";

/** Actor flag: the character's home (stash, vehicles, bay override). */
export const HOME_FLAG = "home";
/** Actor flag: Biomonitor state (syndromes, Catharsis, Inspiration, deepest tier). */
export const PSYCHE_FLAG = "psyche";
/** Item flag: per-item Neon At Home settings (carry slots, weight, armor class, upgrade data). */
export const ITEM_FLAG = "item";
/** Actor flag on a container actor: the character whose home stash it is. */
export const STASH_FLAG = "stashOf";
/** ActiveEffect flag marking the effect Neon At Home keeps in step with worn armor upgrades. */
export const EFFECT_FLAG = "loadoutEffect";

/** ActiveEffect flag marking the encumbrance effect (its value: "half" or "one"). */
export const ENCUMBRANCE_FLAG = "encumbrance";
/** Document operation option: Neon At Home already checked the carry rules for this change. */
export const CHECKED = "checked";

/** The sub-features of the home suite, in tab order. New ones register here (see apps/features.js). */
export const FEATURE_ORDER = ["loadout", "bay", "biomonitor", "bench"];
