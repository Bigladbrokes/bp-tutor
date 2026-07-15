import { computeSessionStats, STUCK_THRESHOLD_MS } from "./sessionStats";

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
