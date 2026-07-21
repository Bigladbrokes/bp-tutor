// Student motivation metrics — fully derived from sessions + the student's
// own result rows on every load. Nothing is stored; nothing can go stale.
//
// Streak (confirmed rules):
//   - A session counts as completed when EVERY questionId in it has at least
//     one result row from this student (lenient: streak measures
//     participation; the % metric measures understanding).
//   - Grace: the NEWEST session, while incomplete, neither counts nor breaks
//     the streak — it is still rescuable until the teacher opens the next one.
//   - A session completed AFTER the next session was opened stays broken:
//     late completion never retroactively heals ("catch up before next class").
//
// Chapter % (confirmed rules):
//   - per question, prefer independent-mode runs; a question with ZERO
//     independent rows ever falls back to its guided runs (steps-less MC/FitB
//     questions never reach Independent Mode, but the work still counts)
//   - free-form rows (correct: null) are excluded — not resolvable
//   - per question, only its most recent session run (in the chosen mode)
//     counts; correct only if ALL rows in that run are correct. A wrong
//     latest run still counts toward "attempted" — attempted means "has a
//     resolvable result," not "got it right"
//   - "previous %" = the same computation excluding the chapter's most
//     recent session, so the delta reads "since your last session"

import { normalizeChapter } from "./chapters";

export const UNCATEGORIZED = "ยังไม่จัดหมวด";

export const tsMs = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : 0);

export function computeStreak(sessions, results) {
  const rowsBySession = new Map();
  for (const r of results || []) {
    const arr = rowsBySession.get(r.sessionId) ?? [];
    arr.push(r);
    rowsBySession.set(r.sessionId, arr);
  }

  const ordered = (sessions || [])
    .filter((s) => Array.isArray(s.questionIds) && s.questionIds.length > 0)
    .sort((a, b) => tsMs(a.startedAt) - tsMs(b.startedAt));

  const info = ordered.map((s) => {
    const rows = rowsBySession.get(s.id) ?? [];
    const answered = new Set(rows.map((r) => r.questionId));
    const completed = s.questionIds.every((q) => answered.has(q));
    const completedAtMs = completed
      ? Math.max(...rows.map((r) => tsMs(r.timestamp)))
      : null;
    return { session: s, completed, completedAtMs, startedAtMs: tsMs(s.startedAt) };
  });

  let streak = 0;
  let graceSession = null;

  for (let i = info.length - 1; i >= 0; i--) {
    const cur = info[i];
    const next = info[i + 1];

    if (i === info.length - 1 && !cur.completed) {
      // Newest session, still rescuable — flag for the reminder line
      graceSession = cur.session;
      continue;
    }

    const inTime = cur.completed && (!next || cur.completedAtMs < next.startedAtMs);
    if (inTime) streak++;
    else break;
  }

  return { streak, graceSession };
}

export function chapterStats(questions, results) {
  const qById = new Map((questions || []).map((q) => [q.id, q]));

  // questionId → sessionId → rows (one "run" per session), per mode
  const buildRuns = (mode) => {
    const runs = new Map();
    for (const r of results || []) {
      if (r.mode !== mode || typeof r.correct !== "boolean") continue;
      const perSession = runs.get(r.questionId) ?? new Map();
      const arr = perSession.get(r.sessionId) ?? [];
      arr.push(r);
      perSession.set(r.sessionId, arr);
      runs.set(r.questionId, perSession);
    }
    return runs;
  };

  const independentRuns = buildRuns("independent");
  const guidedRuns = buildRuns("guided");

  // The per-question mode choice: independent wins if the question has ANY
  // independent rows ever; guided runs are the fallback, never a mix.
  const runsFor = (qid) => independentRuns.get(qid) ?? guidedRuns.get(qid);

  const runTs = (rows) => Math.max(...rows.map((r) => tsMs(r.timestamp)));

  const latestRun = (perSession, excludedSessionId) => {
    let best = null;
    for (const [sid, rows] of perSession) {
      if (sid === excludedSessionId) continue;
      const ts = runTs(rows);
      if (!best || ts > best.ts) best = { sid, rows, ts };
    }
    return best;
  };

  // chapter name → questionIds the student has attempted in it
  const chapters = new Map();
  const allQids = new Set([...independentRuns.keys(), ...guidedRuns.keys()]);
  for (const qid of allQids) {
    const name = normalizeChapter(qById.get(qid)?.chapter) || UNCATEGORIZED;
    const arr = chapters.get(name) ?? [];
    arr.push(qid);
    chapters.set(name, arr);
  }

  const statsFor = (qids, excludedSessionId) => {
    let attempted = 0;
    let correct = 0;
    for (const qid of qids) {
      const run = latestRun(runsFor(qid), excludedSessionId);
      if (!run) continue;
      attempted++;
      if (run.rows.every((r) => r.correct === true)) correct++;
    }
    return attempted === 0
      ? null
      : { attempted, correct, pct: Math.round((correct / attempted) * 100) };
  };

  const out = [];
  for (const [name, qids] of chapters) {
    const current = statsFor(qids, null);
    if (!current) continue;

    // The chapter's most recent session (by newest run timestamp,
    // across each question's CHOSEN runs)
    let newest = null;
    for (const qid of qids) {
      for (const [sid, rows] of runsFor(qid)) {
        const ts = runTs(rows);
        if (!newest || ts > newest.ts) newest = { sid, ts };
      }
    }

    const prev = newest ? statsFor(qids, newest.sid) : null;
    out.push({
      chapter: name,
      pct: current.pct,
      attempted: current.attempted,
      prevPct: prev ? prev.pct : null,
      delta: prev ? current.pct - prev.pct : null,
    });
  }

  out.sort((a, b) =>
    a.chapter === UNCATEGORIZED ? 1
    : b.chapter === UNCATEGORIZED ? -1
    : a.chapter.localeCompare(b.chapter)
  );
  return out;
}

// ─── Stepped-solver analytics (doc §4, §4.2) ──────────────────────────────────
// Pure aggregations over stepped-question result documents. One document per
// (session, student, question); the shape these functions consume (§4):
//
//   {
//     sessionId, uid, questionId, type: "stepped",
//     attempts: [
//       { n, failedStepIndex, errorClass, wrongElement?, tMs? }, // a failed attempt
//       { n, completed: true, tMs? },                            // the completing attempt
//     ],
//     completedOnAttempt, totalTimeMs, tokensAwarded,
//   }
//
// Only attempts[].errorClass and attempts[].failedStepIndex are read here. A
// document without an attempts[] array (e.g. a non-stepped result) contributes
// nothing, so these are safe to run over a mixed result set. Part B (Firestore
// writing) just has to produce documents in this shape.

// Solving-order rank for the §4.1 taxonomy — the weaknessProfile tiebreak:
// when two error classes tie on count, the one earlier in the solve (the more
// fundamental weakness) wins. Classes outside the taxonomy rank last.
const ERROR_CLASS_ORDER = [
  "givens.wrongValue", "givens.wrongUnit",
  "equation.requiresTime", "equation.missingUnknown", "equation.other",
  "rearrange.wrongTile", "rearrange.incompleteProduct",
  "compute.wrongValue",
];
const classRank = (ec) => {
  const i = ERROR_CLASS_ORDER.indexOf(ec);
  return i === -1 ? ERROR_CLASS_ORDER.length : i;
};

// Count each error class across every failed attempt in a result set.
//   results: array of result documents → { [errorClass]: count }
// Completing attempts (no errorClass) are skipped.
export function aggregateErrorClasses(results) {
  const counts = {};
  for (const doc of results || []) {
    for (const a of doc?.attempts || []) {
      if (a && a.errorClass) counts[a.errorClass] = (counts[a.errorClass] || 0) + 1;
    }
  }
  return counts;
}

// The dominant failure for ONE student across their result documents.
//   studentResults: array of that student's result docs
//   → null if they never failed, else
//     { errorClass, stepType, count, totalFailures }
// stepType is the taxonomy namespace (e.g. "rearrange.wrongTile" → "rearrange"),
// so the result directly names which step is the student's weakness. Ties on
// count are broken by ERROR_CLASS_ORDER (earlier solving stage wins).
export function weaknessProfile(studentResults) {
  const counts = aggregateErrorClasses(studentResults);
  const classes = Object.keys(counts);
  if (classes.length === 0) return null;

  const totalFailures = classes.reduce((sum, ec) => sum + counts[ec], 0);
  classes.sort((a, b) => counts[b] - counts[a] || classRank(a) - classRank(b));
  const errorClass = classes[0];
  return {
    errorClass,
    stepType: errorClass.split(".")[0],
    count: counts[errorClass],
    totalFailures,
  };
}

// Per-step failure rate across a class for one stepped question.
//   sessionResults: one result doc per student, all for the same question
//   steps: the question's steps array (drives the entry count + stepType labels)
// A student "failed at step i" if ANY of their attempts has failedStepIndex === i
// (counted once per student, not per attempt). failPct denominator is the number
// of students with a result document — the honest base, since a student with no
// document can't be measured.
//   → array aligned with steps: { stepIndex, stepType, failCount, total, failPct }
export function classHeatmap(sessionResults, steps) {
  const docs = (sessionResults || []).filter((d) => Array.isArray(d?.attempts));
  const total = docs.length;

  return (steps || []).map((step, i) => {
    let failCount = 0;
    for (const doc of docs) {
      if (doc.attempts.some((a) => a && a.failedStepIndex === i)) failCount++;
    }
    return {
      stepIndex: i,
      stepType: step?.stepType ?? null,
      failCount,
      total,
      failPct: total === 0 ? 0 : Math.round((failCount / total) * 100),
    };
  });
}
