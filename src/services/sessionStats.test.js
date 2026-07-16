import { computeSessionStats, studentDetailByQuestion, STUCK_THRESHOLD_MS } from "./sessionStats";

// Anchor "now" so quiet-duration math is deterministic regardless of when
// the test actually runs.
const NOW = 1_000_000_000;
const minutesAgo = (m) => NOW - m * 60 * 1000;

const mockSession = { questionIds: ["q1", "q2"] };
const mockQuestions = [
  { id: "q1", type: "mc", difficulty: "Easy" },
  { id: "q2", type: "mc", difficulty: "Medium" },
];

const row = (studentUid, questionId, minsAgo, correct = true) => ({
  studentUid,
  questionId,
  mode: "guided",
  correct,
  attempts: 1,
  timestamp: { toMillis: () => minutesAgo(minsAgo) },
});

test("quiet too long while unfinished → stuck, with the correct elapsed minutes", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(10) }];
  // Only q1 answered (1/2 — not finished), 5 minutes ago
  const results = [row("s1", "q1", 5)];

  const stats = computeSessionStats(mockSession, mockQuestions, results, joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(true);
  expect(alice.quietMinutes).toBe(5);
});

test("recently active and unfinished → not stuck", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(10) }];
  const results = [row("s1", "q1", 1)]; // answered 1 minute ago

  const stats = computeSessionStats(mockSession, mockQuestions, results, joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(false);
  expect(alice.quietMinutes).toBeNull();
});

test("finished session → never stuck, even long after their last answer", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(20) }];
  const results = [row("s1", "q1", 10), row("s1", "q2", 10)]; // both done, 10 min ago

  const stats = computeSessionStats(mockSession, mockQuestions, results, joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.progress.x).toBe(2);
  expect(alice.isStuck).toBe(false);
});

test("joined but never answered, quiet since joining beyond threshold → stuck via join fallback", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(5) }];

  const stats = computeSessionStats(mockSession, mockQuestions, [], joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(true);
  expect(alice.quietMinutes).toBe(5);
});

test("joined recently, never answered, still within grace → not stuck", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(1) }];

  const stats = computeSessionStats(mockSession, mockQuestions, [], joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(false);
});

test("exactly at the threshold boundary counts as stuck", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: NOW - STUCK_THRESHOLD_MS }];

  const stats = computeSessionStats(mockSession, mockQuestions, [], joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(true);
});

test("a single wrong answer does not, by itself, trigger stuck (regression: no more same-item counter)", () => {
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(10) }];
  // Wrong on q1, but resolved just now — the OLD logic required 3 consecutive
  // wrongs on the same item, which the save flow can never produce (at most
  // one row per item per session). This proves the new logic doesn't
  // accidentally start flagging on a single miss either.
  const results = [row("s1", "q1", 0, false)];

  const stats = computeSessionStats(mockSession, mockQuestions, results, joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(false);
});

test("session with zero valid questions never flags anyone stuck", () => {
  const emptySession = { questionIds: ["deleted-q"] }; // no matching question doc
  const joins = [{ id: "s1", studentName: "Alice", joinedAt: minutesAgo(30) }];

  const stats = computeSessionStats(emptySession, mockQuestions, [], joins, NOW);
  const alice = stats.studentRows.find((r) => r.uid === "s1");

  expect(alice.isStuck).toBe(false);
});

test("multiple students: only the quiet, unfinished one is flagged", () => {
  const joins = [
    { id: "s1", studentName: "Alice", joinedAt: minutesAgo(10) },
    { id: "s2", studentName: "Bob", joinedAt: minutesAgo(10) },
  ];
  const results = [
    row("s1", "q1", 5), // Alice: 1/2, quiet 5 min → stuck
    row("s2", "q1", 5), row("s2", "q2", 1), // Bob: 2/2, finished → not stuck
  ];

  const stats = computeSessionStats(mockSession, mockQuestions, results, joins, NOW);
  const stuck = stats.studentRows.filter((r) => r.isStuck).map((r) => r.name);

  expect(stuck).toEqual(["Alice"]);
});

// ─── Per-student drill-down data (Task: click-to-expand) ──────────────────────

test("rowsByUid groups each student's deduped rows under their uid", () => {
  const results = [
    row("s1", "q1", 5), row("s1", "q2", 4),
    row("s2", "q1", 5),
  ];
  const stats = computeSessionStats(mockSession, mockQuestions, results, [], NOW);
  expect(stats.rowsByUid.s1).toHaveLength(2);
  expect(stats.rowsByUid.s2).toHaveLength(1);
  expect(stats.rowsByUid.s1.every((r) => r.studentUid === "s1")).toBe(true);
});

test("rowsByUid keeps only the latest row per item (deduped), not replayed duplicates", () => {
  const older = { ...row("s1", "q1", 10), answer: "0" };
  const newer = { ...row("s1", "q1", 2), answer: "1" };
  const stats = computeSessionStats(mockSession, mockQuestions, [older, newer], [], NOW);
  expect(stats.rowsByUid.s1).toHaveLength(1);
  expect(stats.rowsByUid.s1[0].answer).toBe("1"); // the newer one
});

describe("studentDetailByQuestion", () => {
  const orderedQ = [{ id: "q1", text: "Q one" }, { id: "q2", text: "Q two" }];

  test("groups rows by question in session order, omitting untouched questions", () => {
    const rows = [{ questionId: "q2", mode: "guided" }]; // only q2 answered
    const detail = studentDetailByQuestion(rows, orderedQ);
    expect(detail).toHaveLength(1);
    expect(detail[0].question.id).toBe("q2");
  });

  test("within a question: guided rows before independent, blanks and steps in order", () => {
    const rows = [
      { questionId: "q1", mode: "independent", stepId: "b", stepOrder: 2 },
      { questionId: "q1", mode: "independent", stepId: "a", stepOrder: 1 },
      { questionId: "q1", mode: "guided", blankId: 2 },
      { questionId: "q1", mode: "guided", blankId: 1 },
      { questionId: "q1", mode: "independent", stepId: null }, // free-form last
    ];
    const detail = studentDetailByQuestion(rows, orderedQ);
    const ordered = detail[0].rows;
    expect(ordered.map((r) => [r.mode, r.blankId ?? r.stepOrder ?? "free"])).toEqual([
      ["guided", 1],
      ["guided", 2],
      ["independent", 1],
      ["independent", 2],
      ["independent", "free"],
    ]);
  });

  test("rows for a deleted question are appended with a placeholder", () => {
    const rows = [
      { questionId: "q1", mode: "guided" },
      { questionId: "gone", mode: "guided" },
    ];
    const detail = studentDetailByQuestion(rows, orderedQ);
    expect(detail).toHaveLength(2);
    expect(detail[1].question.id).toBe("gone");
    expect(detail[1].question.text).toBe("(deleted question)");
  });

  test("empty rows yields an empty detail list", () => {
    expect(studentDetailByQuestion([], orderedQ)).toEqual([]);
    expect(studentDetailByQuestion(undefined, orderedQ)).toEqual([]);
  });
});
