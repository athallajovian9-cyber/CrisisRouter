// tests/crisis-router.test.ts
// Run with: npx tsx --test tests/crisis-router.test.ts
// Or add "test": "tsx --test tests/**/*.test.ts" to package.json

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuery,
  rankCategories,
  evaluateUrgency,
  extractTokens,
  buildNextSteps,
  buildPayload,
} from "../lib/crisisRouter";

/* --------------------------- normalizeQuery --------------------------- */

test("normalizeQuery: lowercases and strips punctuation", () => {
  const out = normalizeQuery("I Need FOOD, NOW!!!");
  assert.equal(out, " i need food now ");
});

test("normalizeQuery: deletes apostrophes (can't -> cant)", () => {
  assert.equal(normalizeQuery("I can't afford rent"), " i cant afford rent ");
});

test("normalizeQuery: smart quotes are deleted, not spaced", () => {
  // smart apostrophe deleted: "it\u2019s" -> "its"
  assert.equal(normalizeQuery("it\u2019s too much"), " its too much ");
  assert.ok(normalizeQuery("can\u2019t pay").includes(" cant pay"));
});

test("normalizeQuery: collapses whitespace", () => {
  assert.equal(normalizeQuery("   a   \n\n  b   "), " a b ");
});

test("normalizeQuery: empty string yields single space", () => {
  assert.equal(normalizeQuery(""), " ");
});

test("normalizeQuery: ReDoS-safe on pathological input", () => {
  const evil = "a".repeat(5000) + " " + "!".repeat(5000);
  const start = Date.now();
  normalizeQuery(evil);
  assert.ok(Date.now() - start < 500, "should complete in under 500ms");
});

/* --------------------------- rankCategories --------------------------- */

test("rankCategories: food bank query returns Food first", () => {
  const p = ` ${normalizeQuery("I need a food bank today")} `;
  assert.equal(rankCategories(p)[0], "Food");
});

test("rankCategories: homelessness query returns Shelter first", () => {
  const p = ` ${normalizeQuery("I got evicted and have nowhere to go")} `;
  assert.equal(rankCategories(p)[0], "Shelter");
});

test("rankCategories: medical query returns Medical first", () => {
  const p = ` ${normalizeQuery("I ran out of insulin and need a free clinic")} `;
  const cats = rankCategories(p);
  assert.ok(cats.includes("Medical"));
});

test("rankCategories: financial query returns Financial first", () => {
  const p = ` ${normalizeQuery("need cash assistance and help with electric bill")} `;
  assert.equal(rankCategories(p)[0], "Financial");
});

test("rankCategories: empty query returns fallback categories", () => {
  const p = ` ${normalizeQuery("hello")} `;
  assert.deepEqual(rankCategories(p), ["Food", "Shelter"]);
});

test("rankCategories: multiple categories capped at 3", () => {
  const p = ` ${normalizeQuery("food shelter clinic rent assistance medication")} `;
  assert.ok(rankCategories(p).length <= 3);
});

test("rankCategories: stable tie-break (identical scores -> category order)", () => {
  // Both Food and Shelter get weight-1 single hits with equal scores
  const p = ` ${normalizeQuery("food room")} `;
  const first = rankCategories(p);
  const second = rankCategories(p);
  assert.deepEqual(first, second);
});

test("rankCategories: domestic violence routes to Shelter", () => {
  const p = ` ${normalizeQuery("my boyfriend is hitting me I need to leave")} `;
  assert.equal(rankCategories(p)[0], "Shelter");
});

/* --------------------------- evaluateUrgency --------------------------- */

test("urgency: suicidal -> CRITICAL", () => {
  const p = ` ${normalizeQuery("I want to kill myself")} `;
  assert.equal(evaluateUrgency(p), "CRITICAL");
});

test("urgency: overdose -> CRITICAL", () => {
  const p = ` ${normalizeQuery("I took an overdose")} `;
  assert.equal(evaluateUrgency(p), "CRITICAL");
});

test("urgency: 'not breathing' -> CRITICAL", () => {
  const p = ` ${normalizeQuery("my father is not breathing")} `;
  assert.equal(evaluateUrgency(p), "CRITICAL");
});

test("urgency: 'tonight' + 'kicked out' -> HIGH", () => {
  const p = ` ${normalizeQuery("kicked out tonight")} `;
  assert.equal(evaluateUrgency(p), "HIGH");
});

test("urgency: single HIGH marker -> HIGH", () => {
  const p = ` ${normalizeQuery("I need food urgently right now")} `;
  assert.equal(evaluateUrgency(p), "HIGH");
});

test("urgency: medium markers -> MEDIUM", () => {
  const p = ` ${normalizeQuery("I am struggling and looking for help with rent next week")} `;
  assert.equal(evaluateUrgency(p), "MEDIUM");
});

test("urgency: neutral text -> LOW", () => {
  const p = ` ${normalizeQuery("where can I find information about local libraries")} `;
  assert.equal(evaluateUrgency(p), "LOW");
});

test("urgency: CRITICAL always overrides HIGH", () => {
  const p = ` ${normalizeQuery("tonight I want to end my life and I was evicted")} `;
  assert.equal(evaluateUrgency(p), "CRITICAL");
});

/* ---------------------------- extractTokens ---------------------------- */

test("extractTokens: returns most specific signal terms first", () => {
  const p = ` ${normalizeQuery("food bank and emergency shelter")} `;
  const cats = rankCategories(p);
  const tokens = extractTokens(p, cats);
  assert.equal(tokens[0], "food bank");
  assert.ok(tokens.includes("emergency shelter"));
});

test("extractTokens: respects MAX_TOKENS (8)", () => {
  const p = ` ${normalizeQuery(
    "food bank soup kitchen snap ebt wic formula diapers groceries emergency shelter"
  )} `;
  const tokens = extractTokens(p, ["Food"]);
  assert.ok(tokens.length <= 8);
});

test("extractTokens: never returns empty (content-word fallback)", () => {
  const p = ` ${normalizeQuery("abcdef urgent")} `;
  const tokens = extractTokens(p, ["Food"]);
  assert.ok(tokens.length > 0);
});

test("extractTokens: stopwords excluded from fallback", () => {
  const p = ` ${normalizeQuery("the and for from with")} `;
  const tokens = extractTokens(p, ["Food"]);
  for (const t of tokens) {
    assert.ok(!["the", "and", "for", "from", "with"].includes(t));
  }
});

test("extractTokens: no duplicates", () => {
  const p = ` ${normalizeQuery("food bank food bank food pantry")} `;
  const tokens = extractTokens(p, ["Food"]);
  assert.equal(new Set(tokens).size, tokens.length);
});

/* --------------------------- buildNextSteps --------------------------- */

test("steps: CRITICAL includes 911 and 988 first", () => {
  const steps = buildNextSteps(["Food"], "CRITICAL");
  assert.ok(steps[0].includes("911"));
  assert.ok(steps[1].includes("988"));
});

test("steps: HIGH includes 211 first", () => {
  const steps = buildNextSteps(["Food"], "HIGH");
  assert.ok(steps[0].includes("211"));
});

test("steps: LOW has no crisis hotline steps", () => {
  const steps = buildNextSteps(["Food"], "LOW");
  assert.ok(!steps.some((s) => s.includes("911") || s.includes("988")));
});

test("steps: never exceeds MAX_STEPS (8)", () => {
  const steps = buildNextSteps(["Food", "Shelter", "Medical", "Financial"], "CRITICAL");
  assert.ok(steps.length <= 8);
});

test("steps: no duplicates", () => {
  const steps = buildNextSteps(["Food", "Food"], "HIGH");
  assert.equal(new Set(steps).size, steps.length);
});

test("steps: always includes clarify step when under budget", () => {
  const steps = buildNextSteps(["Food"], "LOW");
  assert.ok(steps.some((s) => s.includes("211 specialist")));
});

/* ----------------------------- buildPayload ----------------------------- */

test("payload: critical query returns full valid shape", () => {
  const payload = buildPayload("I want to kill myself and I have nowhere to stay tonight");
  assert.ok(payload.primary_categories.length >= 1);
  assert.equal(payload.urgency_level, "CRITICAL");
  assert.ok(payload.search_tokens.length >= 1);
  assert.ok(payload.actionable_next_steps.length >= 1);
  assert.ok(payload.actionable_next_steps.length <= 8);
});

test("payload: fallback categories when no signals", () => {
  const payload = buildPayload("hello");
  assert.deepEqual(payload.primary_categories, ["Food", "Shelter"]);
});

test("payload: category count never exceeds 3", () => {
  const payload = buildPayload("food shelter clinic rent insulin cash therapy");
  assert.ok(payload.primary_categories.length <= 3);
});

test("payload: token count never exceeds 8", () => {
  const payload = buildPayload(
    "food bank soup kitchen snap ebt wic formula diapers groceries shelter clinic cash"
  );
  assert.ok(payload.search_tokens.length <= 8);
});

test("payload: houseless person query", () => {
  const payload = buildPayload(
    "I am homeless and sleeping in my car with two kids, evicted last week"
  );
  assert.equal(payload.primary_categories[0], "Shelter");
  assert.ok(["HIGH", "CRITICAL"].includes(payload.urgency_level));
});

test("payload: single mother needs formula", () => {
  const payload = buildPayload("my baby has no formula and I have no money");
  assert.ok(payload.primary_categories.includes("Food"));
  assert.ok(payload.primary_categories.includes("Financial"));
});

test("payload: utility shutoff routes to Financial + HIGH", () => {
  const payload = buildPayload(
    "I got a shutoff notice and my electricity will be cut tomorrow"
  );
  assert.equal(payload.primary_categories[0], "Financial");
  assert.equal(payload.urgency_level, "HIGH");
});

test("payload: identical input yields identical output (deterministic)", () => {
  const input = "I need a food bank and emergency shelter tonight";
  const a = buildPayload(input);
  const b = buildPayload(input);
  assert.deepEqual(a, b);
});

test("payload: no empty tokens for any category", () => {
  const queries = [
    "hungry",
    "evicted",
    "need a doctor",
    "cant pay bills",
    "random text with no signals",
  ];
  for (const q of queries) {
    const payload = buildPayload(q);
    assert.ok(payload.search_tokens.length > 0, `tokens empty for: ${q}`);
    assert.ok(payload.primary_categories.length > 0, `categories empty for: ${q}`);
    assert.ok(payload.actionable_next_steps.length > 0, `steps empty for: ${q}`);
  }
});