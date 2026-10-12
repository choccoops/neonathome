import { test } from "node:test";
import assert from "node:assert/strict";
import { tierOf, normalizePsyche, psycheState, catharsisGain, absorbLoss, antipathy, SYNDROMES } from "../scripts/data/syndromes.js";

test("tiers follow Humanity: 30+ functional down to extreme", () => {
  assert.equal(tierOf(40), 0);
  assert.equal(tierOf(30), 0);
  assert.equal(tierOf(29), 1);
  assert.equal(tierOf(20), 1);
  assert.equal(tierOf(19), 2);
  assert.equal(tierOf(10), 2);
  assert.equal(tierOf(9), 3);
  assert.equal(tierOf(1), 3);
  assert.equal(tierOf(0), 4);
  assert.equal(tierOf(-5), 4);
});

test("the catalog covers the thirteen Syndromes in the document", () => {
  assert.equal(SYNDROMES.length, 13);
  assert.equal(SYNDROMES.filter((s) => s.severity === "mild").length, 5);
  assert.equal(SYNDROMES.filter((s) => s.severity === "severe").length, 5);
  assert.equal(SYNDROMES.filter((s) => s.severity === "extreme").length, 3);
});

test("picks owed by tier", () => {
  const none = psycheState(normalizePsyche({}), 25);
  assert.equal(none.owed, true);
  const one = normalizePsyche({ syndromes: [{ id: "a", key: "kleptomania", tier: 1 }] });
  assert.equal(psycheState(one, 25).owed, false);
  // EMP 1 needs a severe as well
  assert.equal(psycheState(one, 15).owed, true);
  const upgraded = normalizePsyche({ syndromes: [{ id: "a", key: "kleptomania", tier: 1, upgradedAt: 2 }, { id: "b", key: "megalomania", tier: 2 }] });
  assert.equal(psycheState(upgraded, 15).owed, false);
  const added = normalizePsyche({ syndromes: [{ id: "a", key: "kleptomania", tier: 1 }, { id: "c", key: "cyberInsomnia", tier: 2 }, { id: "b", key: "megalomania", tier: 2 }] });
  assert.equal(psycheState(added, 15).owed, false);
  // EMP 0: upgrade or add a severe, and an extreme
  assert.equal(psycheState(added, 5).owed, true);
  const deep = normalizePsyche({ syndromes: [...added.syndromes.map((s) => (s.id === "a" ? { ...s, upgradedAt: 3 } : s)), { id: "d", key: "homicidalIdeation", tier: 3 }] });
  assert.equal(psycheState(deep, 5).owed, false);
});

test("syndromes go quiet above their tier and come back; upgrades revert", () => {
  const p = normalizePsyche({ syndromes: [{ id: "a", key: "kleptomania", tier: 1, upgradedAt: 2 }, { id: "b", key: "megalomania", tier: 2 }] });
  const at15 = psycheState(p, 15);
  assert.equal(at15.syndromes.find((s) => s.id === "a").current, "severe");
  const at25 = psycheState(p, 25);
  assert.equal(at25.syndromes.find((s) => s.id === "a").current, "mild");
  assert.equal(at25.syndromes.find((s) => s.id === "b").dormant, true);
  const at35 = psycheState(p, 35);
  assert.equal(at35.syndromes.every((s) => s.dormant), true);
});

test("scars stay at functional Humanity by deepest tier", () => {
  const p = normalizePsyche({ deepest: 2, scar: "a", syndromes: [{ id: "a", key: "kleptomania", tier: 1 }] });
  const s = psycheState(p, 40);
  assert.equal(s.syndromes[0].active, true);
  assert.equal(s.syndromes[0].scar, true);
  assert.equal(s.syndromes[0].current, "mild");
  const noScarYet = psycheState(normalizePsyche({ deepest: 3, syndromes: [{ id: "a", key: "kleptomania", tier: 1 }] }), 40);
  assert.equal(noScarYet.needsScar, true);
  assert.equal(psycheState(normalizePsyche({ deepest: 1, syndromes: [{ id: "a", key: "kleptomania", tier: 1 }] }), 40).needsScar, false);
});

test("antipathy at EMP 1 and 0; extreme on a complete break", () => {
  assert.equal(psycheState(normalizePsyche({}), 15).antipathy, true);
  assert.equal(psycheState(normalizePsyche({}), 25).antipathy, false);
  assert.equal(psycheState(normalizePsyche({ breakdown: true }), 40).extreme, true);
  assert.equal(antipathy(2, "loss"), 1);
  assert.equal(antipathy(5, "loss"), 3);
  assert.equal(antipathy(1, "gain"), 0);
});

test("catharsis: gained going down, absorbs loss first", () => {
  assert.equal(catharsisGain(0, 1), 8);
  assert.equal(catharsisGain(1, 3), 22);
  assert.equal(catharsisGain(2, 1), 0);
  assert.equal(catharsisGain(null, 2), 0);
  assert.equal(catharsisGain(2, 4), 12);
  assert.deepEqual(absorbLoss(5, 8), { absorbed: 5, catharsis: 3, underflow: 0 });
  assert.deepEqual(absorbLoss(12, 8), { absorbed: 8, catharsis: 0, underflow: 4 });
});
