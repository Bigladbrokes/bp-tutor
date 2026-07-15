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

const tsMs = (v) => v?.toMillis?.() ?? (typeof v === "number" ? v : 0);

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
