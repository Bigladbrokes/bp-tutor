import {
  computeStreak, chapterStats, UNCATEGORIZED,
  aggregateErrorClasses, weaknessProfile, classHeatmap,
} from "./progress";

// ─── Streak ───────────────────────────────────────────────────────────────────
// Sessions opened at t=1000 (S1), 2000 (S2), 3000 (S3), one question each.

const S1 = { id: "S1", startedAt: 1000, questionIds: ["q1"] };
const S2 = { id: "S2", startedAt: 2000, questionIds: ["q2"] };
const S3 = { id: "S3", startedAt: 3000, questionIds: ["q3"] };
const sessions = [S1, S2, S3];

const row = (sessionId, questionId, timestamp) => ({
  sessionId, questionId, timestamp, mode: "guided", correct: true,
});

test("case 1: completed S1, S2, S3 in time → streak 3", () => {
  const { streak, graceSession } = computeStreak(sessions, [
    row("S1", "q1", 1500), row("S2", "q2", 2500), row("S3", "q3", 3500),
  ]);
  expect(streak).toBe(3);
  expect(graceSession).toBeNull();
});

test("case 2: S2 skipped forever → streak 1 (restarts at S3)", () => {
  const { streak } = computeStreak(sessions, [
    row("S1", "q1", 1500), row("S3", "q3", 3500),
  ]);
  expect(streak).toBe(1);
});

test("case 3: S2 rescued before S3 opened → streak 3", () => {
  const { streak } = computeStreak(sessions, [
    row("S1", "q1", 1500),
    row("S2", "q2", 2500), // completed at 2500 < S3.startedAt 3000 → in time
    row("S3", "q3", 3500),
  ]);
  expect(streak).toBe(3);
});

test("case 4: only S3 completed → streak 1", () => {
  const { streak } = computeStreak(sessions, [row("S3", "q3", 3500)]);
  expect(streak).toBe(1);
});

test("edge (ruling 1): late completion of S2 after S3 opened stays broken", () => {
  const { streak, graceSession } = computeStreak(sessions, [
    row("S1", "q1", 1500),
    row("S2", "q2", 3500), // completed AFTER S3 opened (3000) — too late
    // S3 untouched
  ]);
  expect(streak).toBe(0);              // S3 in grace (uncounted), S2 broken, S1 unreachable
  expect(graceSession?.id).toBe("S3"); // reminder targets the rescuable session
});

test("grace: newest session incomplete neither counts nor breaks", () => {
  const { streak, graceSession } = computeStreak(sessions, [
    row("S1", "q1", 1500), row("S2", "q2", 2500),
    // S3 untouched
  ]);
  expect(streak).toBe(2);
  expect(graceSession?.id).toBe("S3");
});

test("lenient completion: every questionId needs at least one row", () => {
  const multi = [{ id: "M1", startedAt: 1000, questionIds: ["a", "b"] }];
  expect(computeStreak(multi, [row("M1", "a", 1500)]).streak).toBe(0); // half-done → grace
  expect(computeStreak(multi, [row("M1", "a", 1500)]).graceSession?.id).toBe("M1");
  expect(computeStreak(multi, [row("M1", "a", 1500), row("M1", "b", 1600)]).streak).toBe(1);
});

test("streak handles empty inputs", () => {
  expect(computeStreak([], []).streak).toBe(0);
  expect(computeStreak(sessions, []).streak).toBe(0);
});

// ─── Chapter understanding % ──────────────────────────────────────────────────

const questions = [
  { id: "qA", chapter: "เศษส่วน" },
  { id: "qB", chapter: "เศษส่วน " },   // trailing space — normalizes to the same chapter
  { id: "qC" },                        // no chapter → ยังไม่จัดหมวด
  { id: "qD", chapter: "เศษส่วน" },
];

const ind = (questionId, sessionId, timestamp, correct, extra = {}) => ({
  questionId, sessionId, timestamp, correct, mode: "independent", ...extra,
});

const results = [
  // qA in session X: two steps, both correct → run correct
  ind("qA", "X", 10, true,  { stepId: "s1" }),
  ind("qA", "X", 11, true,  { stepId: "s2" }),
  // qA in newer session Y: one step wrong → latest run incorrect (all-steps rule)
  ind("qA", "Y", 20, true,  { stepId: "s1" }),
  ind("qA", "Y", 21, false, { stepId: "s2" }),
  // qB only in session X, correct
  ind("qB", "X", 12, true),
  // qC (uncategorized) in session X, wrong
  ind("qC", "X", 13, false),
  // qD free-form (ungraded) → excluded from numerator AND denominator
  ind("qD", "Y", 22, null),
  // guided rows are ignored entirely
  { questionId: "qA", sessionId: "Y", timestamp: 23, correct: true, mode: "guided" },
];

test("chapter %: latest run per question, all steps must be correct", () => {
  const stats = chapterStats(questions, results);
  const fraction = stats.find((c) => c.chapter === "เศษส่วน");
  // qA latest run (Y) incorrect, qB (X) correct, qD excluded → 1/2
  expect(fraction.pct).toBe(50);
  expect(fraction.attempted).toBe(2);
});

test("delta: previous % excludes the chapter's most recent session", () => {
  const fraction = chapterStats(questions, results).find((c) => c.chapter === "เศษส่วน");
  // Excluding Y: qA falls back to run X (correct), qB correct → 100%
  expect(fraction.prevPct).toBe(100);
  expect(fraction.delta).toBe(-50);
});

test("questions without chapter group under ยังไม่จัดหมวด, sorted last", () => {
  const stats = chapterStats(questions, results);
  expect(stats[stats.length - 1].chapter).toBe(UNCATEGORIZED);
  const unc = stats.find((c) => c.chapter === UNCATEGORIZED);
  expect(unc.pct).toBe(0);
  expect(unc.attempted).toBe(1);
  // Its only session excluded → no previous data → no delta shown
  expect(unc.prevPct).toBeNull();
  expect(unc.delta).toBeNull();
});

test("chapter stats handle empty inputs without crashing", () => {
  expect(chapterStats([], [])).toEqual([]);
  expect(chapterStats(questions, [])).toEqual([]);
});

// ─── Guided-run fallback (confirmed rule) ─────────────────────────────────────
// Each scenario lives in its own chapter so assertions can't interfere.

const gui = (questionId, sessionId, timestamp, correct) => ({
  questionId, sessionId, timestamp, correct, mode: "guided",
});

const fbQuestions = [
  { id: "qBoth",   chapter: "หนึ่ง" },
  { id: "qGOnly",  chapter: "สอง" },
  { id: "qGWrong", chapter: "สาม" },
  { id: "qMixI",   chapter: "สี่" },
  { id: "qMixG",   chapter: "สี่" },
  { id: "qNone",   chapter: "หก" },
];

const fbResults = [
  // qBoth: has BOTH — a newer, all-correct guided run AND an older,
  // incorrect independent run. Independent must win outright.
  gui("qBoth", "GA", 100, true),
  gui("qBoth", "GA", 101, true),
  ind("qBoth", "IA", 50, false, { stepId: "s1" }),
  ind("qBoth", "IA", 51, true,  { stepId: "s2" }),

  // qGOnly: guided only; older run wrong, most recent run all-correct
  gui("qGOnly", "X1", 10, false),
  gui("qGOnly", "Y1", 20, true),
  gui("qGOnly", "Y1", 21, true),

  // qGWrong: guided only; older run all-correct, most recent run has a miss
  gui("qGWrong", "X2", 10, true),
  gui("qGWrong", "Y2", 20, true),
  gui("qGWrong", "Y2", 21, false),

  // สี่ (mixed chapter): qMixI independent-correct, qMixG guided-fallback incorrect
  ind("qMixI", "IM", 30, true),
  gui("qMixG", "GM", 40, true),
  gui("qMixG", "GM", 41, false),

  // qNone: no rows of any kind
];

const fb = chapterStats(fbQuestions, fbResults);
const chapterOf = (name) => fb.find((c) => c.chapter === name);

test("fallback: independent wins when both modes exist — guided ignored entirely", () => {
  const c = chapterOf("หนึ่ง");
  // Chosen run is the independent one (a step wrong) even though the
  // guided run is newer and all-correct.
  expect(c.attempted).toBe(1);
  expect(c.pct).toBe(0);
});

test("fallback: guided-only question, latest run all-correct → attempted + correct", () => {
  const c = chapterOf("สอง");
  expect(c.attempted).toBe(1);
  expect(c.pct).toBe(100);
});

test("fallback: guided-only question, latest run wrong → attempted + incorrect, still in denominator", () => {
  const c = chapterOf("สาม");
  expect(c.attempted).toBe(1); // marked incorrect, NOT dropped
  expect(c.pct).toBe(0);
});

test("question with zero rows of any kind does not appear at all", () => {
  expect(chapterOf("หก")).toBeUndefined();
});

test("mixed chapter: independent and guided-fallback questions combine", () => {
  const c = chapterOf("สี่");
  expect(c.attempted).toBe(2);   // both count
  expect(c.pct).toBe(50);        // qMixI correct, qMixG incorrect
});

test("delta still works when the fallback applies", () => {
  const c = chapterOf("สาม");
  // Excluding the chapter's newest session (Y2) falls back to run X2 (correct)
  expect(c.prevPct).toBe(100);
  expect(c.delta).toBe(-100);
});

// ─── Stepped-solver analytics (build step 6 part A) ───────────────────────────
// Result-document helpers matching the §4 schema.
const fail = (n, failedStepIndex, errorClass) => ({ n, failedStepIndex, errorClass });
const done = (n) => ({ n, completed: true });
const doc = (uid, questionId, attempts) => ({ sessionId: "S1", uid, questionId, type: "stepped", attempts });

// A 4-step stepped question: givens, equationSelect, rearrange, compute.
const STEPS = [
  { stepType: "givens" }, { stepType: "equationSelect" },
  { stepType: "rearrange" }, { stepType: "compute" },
];

// ── aggregateErrorClasses ──
test("aggregateErrorClasses: empty input → {}", () => {
  expect(aggregateErrorClasses([])).toEqual({});
  expect(aggregateErrorClasses(undefined)).toEqual({});
});

test("aggregateErrorClasses: counts each failed attempt, skips completions", () => {
  const results = [
    doc("u1", "q1", [fail(1, 0, "givens.wrongUnit"), fail(2, 2, "rearrange.wrongTile"), done(3)]),
  ];
  expect(aggregateErrorClasses(results)).toEqual({
    "givens.wrongUnit": 1,
    "rearrange.wrongTile": 1,
  });
});

test("aggregateErrorClasses: sums across multiple students and questions", () => {
  const results = [
    doc("u1", "q1", [fail(1, 0, "givens.wrongUnit"), done(2)]),
    doc("u2", "q1", [fail(1, 0, "givens.wrongUnit"), fail(2, 0, "givens.wrongValue"), done(3)]),
    doc("u2", "q2", [fail(1, 2, "rearrange.wrongTile"), done(2)]),
  ];
  expect(aggregateErrorClasses(results)).toEqual({
    "givens.wrongUnit": 2,
    "givens.wrongValue": 1,
    "rearrange.wrongTile": 1,
  });
});

test("aggregateErrorClasses: a doc with no attempts[] contributes nothing", () => {
  const results = [
    { sessionId: "S1", uid: "u1", questionId: "qMC", mode: "guided", correct: true }, // non-stepped
    doc("u1", "q1", [fail(1, 3, "compute.wrongValue"), done(2)]),
  ];
  expect(aggregateErrorClasses(results)).toEqual({ "compute.wrongValue": 1 });
});

// ── weaknessProfile ──
test("weaknessProfile: a student who never fails → null", () => {
  expect(weaknessProfile([doc("u1", "q1", [done(1)])])).toBeNull();
  expect(weaknessProfile([])).toBeNull();
});

test("weaknessProfile: picks the most frequent error class with its step type", () => {
  const student = [
    doc("u1", "q1", [fail(1, 2, "rearrange.wrongTile"), fail(2, 2, "rearrange.wrongTile"), done(3)]),
    doc("u1", "q2", [fail(1, 0, "givens.wrongUnit"), done(2)]),
  ];
  expect(weaknessProfile(student)).toEqual({
    errorClass: "rearrange.wrongTile",
    stepType: "rearrange",
    count: 2,
    totalFailures: 3,
  });
});

test("weaknessProfile: a tie is broken by solving order (earlier stage wins)", () => {
  // givens.wrongUnit and compute.wrongValue both appear twice; givens is earlier
  // in the solve, so it is the more fundamental weakness and wins the tie.
  const student = [
    doc("u1", "q1", [fail(1, 0, "givens.wrongUnit"), fail(2, 3, "compute.wrongValue"), done(3)]),
    doc("u1", "q2", [fail(1, 0, "givens.wrongUnit"), fail(2, 3, "compute.wrongValue"), done(3)]),
  ];
  const p = weaknessProfile(student);
  expect(p.errorClass).toBe("givens.wrongUnit");
  expect(p.count).toBe(2);
  expect(p.totalFailures).toBe(4);
});

// ── classHeatmap ──
test("classHeatmap: empty class → 0% at every step", () => {
  expect(classHeatmap([], STEPS)).toEqual([
    { stepIndex: 0, stepType: "givens", failCount: 0, total: 0, failPct: 0 },
    { stepIndex: 1, stepType: "equationSelect", failCount: 0, total: 0, failPct: 0 },
    { stepIndex: 2, stepType: "rearrange", failCount: 0, total: 0, failPct: 0 },
    { stepIndex: 3, stepType: "compute", failCount: 0, total: 0, failPct: 0 },
  ]);
});

test("classHeatmap: per-step failure % over a class, counting each student once", () => {
  // 4 students. Step 1 (equationSelect): u1, u2, u3 failed → 75%.
  // Step 2 (rearrange): u4 only → 25%. u1 failed step 1 twice but counts once.
  const cls = [
    doc("u1", "q1", [fail(1, 1, "equation.requiresTime"), fail(2, 1, "equation.other"), done(3)]),
    doc("u2", "q1", [fail(1, 1, "equation.missingUnknown"), done(2)]),
    doc("u3", "q1", [fail(1, 1, "equation.requiresTime"), done(2)]),
    doc("u4", "q1", [fail(1, 2, "rearrange.wrongTile"), done(2)]),
  ];
  const heat = classHeatmap(cls, STEPS);
  expect(heat.map((h) => h.failPct)).toEqual([0, 75, 25, 0]);
  expect(heat[1]).toEqual({ stepIndex: 1, stepType: "equationSelect", failCount: 3, total: 4, failPct: 75 });
});

test("classHeatmap: different students fail at different steps", () => {
  const cls = [
    doc("u1", "q1", [fail(1, 0, "givens.wrongValue"), done(2)]),
    doc("u2", "q1", [fail(1, 3, "compute.wrongValue"), done(2)]),
    doc("u3", "q1", [done(1)]), // never failed
  ];
  const heat = classHeatmap(cls, STEPS);
  expect(heat.map((h) => h.failPct)).toEqual([33, 0, 0, 33]);
  expect(heat[0].total).toBe(3);
});
