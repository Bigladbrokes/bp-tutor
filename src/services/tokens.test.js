import { resultRowId, tokensForResult, steppedAward, applyBalanceAdjustment, chunkRefs } from "./tokens";

const uid = "StuUID123";
const base = { sessionId: "sessABC", questionId: "qXYZ" };

test("resultRowId: guided MC answer", () => {
  expect(resultRowId({ ...base, mode: "guided" }, uid))
    .toBe("sessABC_StuUID123_qXYZ_mc");
});

test("resultRowId: guided FitB blank uses the blank id", () => {
  expect(resultRowId({ ...base, mode: "guided", blankId: 3 }, uid))
    .toBe("sessABC_StuUID123_qXYZ_blank-3");
});

test("resultRowId: independent step uses the step id", () => {
  expect(resultRowId({ ...base, mode: "independent", stepId: "s1783002918998" }, uid))
    .toBe("sessABC_StuUID123_qXYZ_step-s1783002918998");
});

test("resultRowId: independent free-form answer (stepId null)", () => {
  expect(resultRowId({ ...base, mode: "independent", stepId: null }, uid))
    .toBe("sessABC_StuUID123_qXYZ_free");
});

test("resultRowId: uid is always segment [1], as firestore.rules requires", () => {
  const rows = [
    { ...base, mode: "guided" },
    { ...base, mode: "guided", blankId: 1 },
    { ...base, mode: "independent", stepId: "s1" },
    { ...base, mode: "independent", stepId: null },
  ];
  for (const r of rows) expect(resultRowId(r, uid).split("_")[1]).toBe(uid);
});

test("tokensForResult: full, half, and zero credit", () => {
  expect(tokensForResult("Medium", true, 1)).toBe(5);
  expect(tokensForResult("Medium", true, 2)).toBe(2.5);
  expect(tokensForResult("Hard", false, 2)).toBe(0);
});

test("steppedAward: flat per-difficulty, no attempt-halving", () => {
  // Same difficulty economy as tokensForResult, but never scaled by attempts
  // (doc §7 decision 2 — completion alone earns the flat amount).
  expect(steppedAward("Easy")).toBe(1);
  expect(steppedAward("Medium")).toBe(5);
  expect(steppedAward("Hard")).toBe(10);
  expect(steppedAward(undefined)).toBe(1); // defaults to Easy
});

// ─── applyBalanceAdjustment (Task 2: floor guard) ─────────────────────────────

test("applyBalanceAdjustment: positive adjustment adds normally", () => {
  expect(applyBalanceAdjustment(10, 5)).toBe(15);
});

test("applyBalanceAdjustment: negative adjustment that stays non-negative is allowed", () => {
  expect(applyBalanceAdjustment(10, -7)).toBe(3);
});

test("applyBalanceAdjustment: landing exactly on 0 is allowed (boundary)", () => {
  expect(applyBalanceAdjustment(10, -10)).toBe(0);
});

test("applyBalanceAdjustment: going below 0 throws with a clear message", () => {
  expect(() => applyBalanceAdjustment(10, -11)).toThrow(/below 0/);
  expect(() => applyBalanceAdjustment(10, -11)).toThrow(/10/); // states the current balance
});

test("applyBalanceAdjustment: treats a missing/undefined balance as 0", () => {
  expect(applyBalanceAdjustment(undefined, 5)).toBe(5);
  expect(() => applyBalanceAdjustment(undefined, -1)).toThrow(/below 0/);
});

// ─── chunkRefs (Task 1: batch-size safety) ────────────────────────────────────

test("chunkRefs: empty list produces no chunks", () => {
  expect(chunkRefs([], 3)).toEqual([]);
});

test("chunkRefs: fewer items than the chunk size stay in one chunk", () => {
  expect(chunkRefs(["a", "b"], 3)).toEqual([["a", "b"]]);
});

test("chunkRefs: exactly the chunk size stays in one chunk", () => {
  expect(chunkRefs(["a", "b", "c"], 3)).toEqual([["a", "b", "c"]]);
});

test("chunkRefs: one more than the chunk size spills into a second chunk", () => {
  expect(chunkRefs(["a", "b", "c", "d"], 3)).toEqual([["a", "b", "c"], ["d"]]);
});

test("chunkRefs: defaults to a 400-item chunk size", () => {
  const refs = Array.from({ length: 450 }, (_, i) => i);
  const chunks = chunkRefs(refs);
  expect(chunks).toHaveLength(2);
  expect(chunks[0]).toHaveLength(400);
  expect(chunks[1]).toHaveLength(50);
});
