import {
  steppedSeed, generateParams, injectParams, evaluateAnswerExpr, checkAnswer,
} from "./steppedParams";

// Fixture mirrors the reference app's "Accelerated Motion Finding Final
// Velocity" template (see docs/video-analysis-1d-kinematics.md): vi 2.0–3.0
// m/s, a 1.0–2.0 m/s², d 100–300 m, all shown with one decimal.
const SPECS = {
  vi: { min: 2.0, max: 3.0, step: 0.1, dp: 1, unit: "m/s" },
  a:  { min: 1.0, max: 2.0, step: 0.1, dp: 1, unit: "m/s²" },
  d:  { min: 100, max: 300, step: 10,  dp: 1, unit: "m" },
};

const paramsFor = (uid, questionId, attemptNo) =>
  generateParams(SPECS, steppedSeed(uid, questionId, attemptNo));

// ─── Determinism ──────────────────────────────────────────────────────────────

test("same (uid, questionId, attemptNo) → identical params on every call", () => {
  const first = paramsFor("stu-1", "qA", 1);
  for (let i = 0; i < 10; i++) {
    expect(paramsFor("stu-1", "qA", 1)).toEqual(first);
  }
});

// ─── Variation ────────────────────────────────────────────────────────────────

test("attempt 1 vs attempt 2 → different params (restart-with-new-numbers)", () => {
  expect(paramsFor("stu-1", "qA", 1)).not.toEqual(paramsFor("stu-1", "qA", 2));
});

test("different students → different params for the same question/attempt", () => {
  expect(paramsFor("stu-1", "qA", 1)).not.toEqual(paramsFor("stu-2", "qA", 1));
});

test("different questions → different params for the same student/attempt", () => {
  expect(paramsFor("stu-1", "qA", 1)).not.toEqual(paramsFor("stu-1", "qB", 1));
});

// ─── Grid validity ────────────────────────────────────────────────────────────

test("values are always within [min, max], on the step grid, at the right dp", () => {
  for (let attempt = 1; attempt <= 50; attempt++) {
    const params = paramsFor("stu-grid", "qA", attempt);
    for (const [name, spec] of Object.entries(SPECS)) {
      const v = params[name];
      expect(v).toBeGreaterThanOrEqual(spec.min);
      expect(v).toBeLessThanOrEqual(spec.max);
      // On the grid: v reconstructs from an integer number of steps
      const k = Math.round((v - spec.min) / spec.step);
      expect(Number((spec.min + k * spec.step).toFixed(spec.dp))).toBe(v);
      // Correct dp: rounding to dp is a no-op
      expect(Number(v.toFixed(spec.dp))).toBe(v);
    }
  }
});

test("a full-range grid can produce both boundary values (min and max reachable)", () => {
  const seen = new Set();
  for (let attempt = 1; attempt <= 400; attempt++) {
    seen.add(paramsFor("stu-range", "qA", attempt).vi);
  }
  expect(seen.has(2.0)).toBe(true);
  expect(seen.has(3.0)).toBe(true);
  expect(seen.size).toBe(11); // every grid point 2.0, 2.1, …, 3.0 appears
});

// ─── injectParams ─────────────────────────────────────────────────────────────

test("injectParams formats each value to its dp (140 with dp:1 → '140.0')", () => {
  const text = "A car moves at {vi} m/s with acceleration {a} m/s² over {d} m.";
  const out = injectParams(text, { vi: 2.6, a: 1.5, d: 140 }, SPECS);
  expect(out).toBe("A car moves at 2.6 m/s with acceleration 1.5 m/s² over 140.0 m.");
});

test("injectParams replaces repeated placeholders and leaves unknown ones alone", () => {
  const out = injectParams("{vi} + {vi} = twice {vi}; {mystery} stays", { vi: 2.0 }, SPECS);
  expect(out).toBe("2.0 + 2.0 = twice 2.0; {mystery} stays");
});

// ─── evaluateAnswerExpr ───────────────────────────────────────────────────────

test("kinematics answer: sqrt(vi^2 + 2*a*d) ≈ 29.611 for vi=2.6, a=1.5, d=290", () => {
  const v = evaluateAnswerExpr("sqrt(vi^2 + 2*a*d)", { vi: 2.6, a: 1.5, d: 290 });
  expect(Math.abs(v - 29.611)).toBeLessThanOrEqual(1e-3);
});

test("operator precedence: * binds tighter than +, ^ tighter than *", () => {
  expect(evaluateAnswerExpr("2 + 3 * 4", {})).toBe(14);
  expect(evaluateAnswerExpr("2 * 3 ^ 2", {})).toBe(18);
});

test("parentheses override precedence", () => {
  expect(evaluateAnswerExpr("(2 + 3) * 4", {})).toBe(20);
});

test("^ is right-associative and unary minus binds looser than ^", () => {
  expect(evaluateAnswerExpr("2 ^ 3 ^ 2", {})).toBe(512); // 2^(3^2)
  expect(evaluateAnswerExpr("-2 ^ 2", {})).toBe(-4);     // -(2^2)
});

test("division and variables", () => {
  expect(evaluateAnswerExpr("d / a", { d: 300, a: 1.5 })).toBe(200);
});

test("unknown variable throws (no silent NaN)", () => {
  expect(() => evaluateAnswerExpr("vi + oops", { vi: 1 })).toThrow(/oops/);
});

test("malformed input throws", () => {
  expect(() => evaluateAnswerExpr("2 +", {})).toThrow();
  expect(() => evaluateAnswerExpr("sqrt(4", {})).toThrow();
  expect(() => evaluateAnswerExpr("2 @ 3", {})).toThrow();
  expect(() => evaluateAnswerExpr("2 3", {})).toThrow(); // trailing input
});

// ─── checkAnswer ──────────────────────────────────────────────────────────────

test("relative tolerance: expected 29.61 at 1% — 29.5 passes, 30.2 fails", () => {
  const tol = { type: "relative", value: 0.01 };
  expect(checkAnswer(29.5, 29.61, tol)).toBe(true);
  expect(checkAnswer(30.2, 29.61, tol)).toBe(false);
});

test("absolute tolerance: within the flat band passes, outside fails", () => {
  const tol = { type: "absolute", value: 0.1 };
  expect(checkAnswer(29.55, 29.61, tol)).toBe(true);
  expect(checkAnswer(29.72, 29.61, tol)).toBe(false);
});

test("exact boundary is inclusive (float-exact constants)", () => {
  expect(checkAnswer(30.0, 29.5, { type: "absolute", value: 0.5 })).toBe(true);
});

test("float-artifact boundary passes via the §3.4 epsilon: 30.0 vs 29.7 at abs 0.3", () => {
  // 30.0-29.7 computes to 0.30000000000000426 in IEEE754 — mathematically
  // exactly on the boundary. The 1e-9-scaled epsilon absorbs the artifact.
  expect(checkAnswer(30.0, 29.7, { type: "absolute", value: 0.3 })).toBe(true);
});

test("§3.4 doc example: expected 29.6, absolute tol 0.1, student 29.7 passes", () => {
  expect(checkAnswer(29.7, 29.6, { type: "absolute", value: 0.1 })).toBe(true);
});

test("epsilon does not loosen real grading: just-beyond answers still fail", () => {
  // 0.001 past the band — far above the 1e-9-scale epsilon
  expect(checkAnswer(29.701, 29.6, { type: "absolute", value: 0.1 })).toBe(false);
  expect(checkAnswer(30.2, 29.61, { type: "relative", value: 0.01 })).toBe(false);
});

test("non-numeric or missing tolerance never passes", () => {
  expect(checkAnswer(NaN, 29.61, { type: "relative", value: 0.01 })).toBe(false);
  expect(checkAnswer("abc", 29.61, { type: "absolute", value: 0.1 })).toBe(false);
  expect(checkAnswer(29.61, 29.61, undefined)).toBe(false);
});

// ─── End-to-end: template → params → text → answer → check ────────────────────

test("full pipeline: seeded params render into text and grade their own answer", () => {
  const rand = steppedSeed("stu-e2e", "qA", 3);
  const params = generateParams(SPECS, rand);
  const text = injectParams("v={vi}, a={a}, d={d}", params, SPECS);
  for (const name of Object.keys(SPECS)) {
    expect(text).not.toContain(`{${name}}`);
  }
  const expected = evaluateAnswerExpr("sqrt(vi^2 + 2*a*d)", params);
  expect(Number.isFinite(expected)).toBe(true);
  // A student answering exactly right passes; 5% off at 1% tolerance fails
  expect(checkAnswer(expected, expected, { type: "relative", value: 0.01 })).toBe(true);
  expect(checkAnswer(expected * 1.05, expected, { type: "relative", value: 0.01 })).toBe(false);
});
