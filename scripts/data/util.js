/** Small pure helpers shared by the data modules (no Foundry calls). */

export const int = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

export const num = (v, fallback = 0, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const str = (v) => (typeof v === "string" ? v : "");

/** Round to one decimal, for weights. */
export const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

/** Nullable number: "" / null / undefined / NaN stay null (meaning "not set, use the default"). */
export const optNum = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Read a nested property by dot path from a plain object or document. */
export const prop = (obj, path) => path.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

/** Item id from a document or plain data. */
export const idOf = (item) => item?.id ?? item?._id ?? null;

/** Strip HTML to a short plain-text excerpt. */
export function excerpt(html, max = 180) {
  const text = String(html ?? "")
    .replace(/@UUID\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/<\/?(?:strong|b|em|i|u|span|a|small|sub|sup)\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * A Neon Hub lifestyle item (housing, a lifestyle package, a membership, transit...): a CPR gear
 * item that's really a monthly expense, so it is never carried, stored or weighed.
 */
export const isLifestyle = (item) => !!item?.flags?.["cpr-neon-hub"]?.lifestyle;
