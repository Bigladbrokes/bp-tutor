import { TOKEN_VALUES, tokensForResult } from "./tokens";
import { tsMs } from "./progress";

// "Stuck" threshold: a student is flagged once they've gone quiet for this
// long while the session isn't finished for them yet.
//
// NOTE on why this isn't per-question: the answer-save flow (StudentPage.js)
// writes at most ONE result row per item per session — a wrong first attempt
// saves nothing (just shows "try again"); only the final resolution (correct,
// or wrong-after-hint) is saved, guarded by `saved.current`. So a single item
// can never accumulate more than one `correct:false` row in a session, and
// any "same question wrong N times" counter is structurally unreachable.
// Elapsed silence is the honest signal the data can actually support.
export const STUCK_THRESHOLD_MS = 3 * 60 * 1000;

export function dedupeResults(rows) {
  const latest = new Map();
  for (const r of rows) {
    const key = [r.studentUid, r.questionId, r.mode, r.blankId ?? "", r.stepId ?? ""].join("|");
    const prev = latest.get(key);
    const t = (x) => x.timestamp?.toMillis?.() ?? Infinity;
    if (!prev || t(r) >= t(prev)) latest.set(key, r);
  }
  return [...latest.values()];
}

export function computeSessionStats(session, questions, rawResults, joins, nowMs = Date.now()) {
  if (!session || !session.questionIds) {
    return { summary: {}, mostMissed: [], studentRows: [] };
  }

  const orderedQ = session.questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter(Boolean);

  const dedupedResults = dedupeResults(rawResults || []);

  // 1. Calculate max session tokens
  let maxSessionTokens = 0;
  for (const q of orderedQ) {
    const val = TOKEN_VALUES[q.difficulty || "Easy"];
    const qType = q.questionType || q.type || "mc";
    if (qType === "mc") {
      maxSessionTokens += val;
    } else if (qType === "fill_in_blank") {
      const blanks = q.blanks || (q.correctAnswer ? [{ id: 1, answer: q.correctAnswer }] : []);
      maxSessionTokens += val * blanks.length;
    } else {
      if (q.steps && q.steps.length > 0) {
        maxSessionTokens += val * q.steps.length;
      }
    }
  }

  // 2. Student aggregations
  const studentMap = new Map();

  for (const j of joins || []) {
    studentMap.set(j.id, {
      uid: j.id,
      name: j.studentName || "Unknown",
      lastActiveMs: tsMs(j.joinedAt),
      joinedAtMs: tsMs(j.joinedAt),
      earnedTokens: 0,
      uniqueQuestionsAttempted: new Set(),
      hintsUsed: 0,
      timeToFirstCheckMsSum: 0,
      timeToFirstCheckMsCount: 0,
    });
  }

  for (const r of dedupedResults) {
    if (!studentMap.has(r.studentUid)) {
      studentMap.set(r.studentUid, {
        uid: r.studentUid,
        name: r.studentName || "Unknown",
        lastActiveMs: 0,
        joinedAtMs: null,
        earnedTokens: 0,
        uniqueQuestionsAttempted: new Set(),
        hintsUsed: 0,
        timeToFirstCheckMsSum: 0,
        timeToFirstCheckMsCount: 0,
      });
    }
  }

  for (const r of dedupedResults) {
    const st = studentMap.get(r.studentUid);
    const q = orderedQ.find((x) => x.id === r.questionId);
    
    const rTs = tsMs(r.timestamp);
    if (rTs > st.lastActiveMs) {
      st.lastActiveMs = rTs;
    }

    if (q) {
      st.uniqueQuestionsAttempted.add(q.id);
    }

    if (q && r.correct === true) {
      st.earnedTokens += tokensForResult(q.difficulty || "Easy", true, r.attempts ?? 1);
    }

    if (r.usedHint) {
      st.hintsUsed += 1;
    }

    if (typeof r.timeToFirstCheckMs === "number" && r.timeToFirstCheckMs > 0) {
      st.timeToFirstCheckMsSum += r.timeToFirstCheckMs;
      st.timeToFirstCheckMsCount += 1;
    }
  }

  let classEarnedSum = 0;
  let classProgressSum = 0;
  let activeStudentCount = 0;

  const studentRows = Array.from(studentMap.values()).map((st) => {
    const x = st.uniqueQuestionsAttempted.size;
    const y = orderedQ.length;
    const progressPct = y > 0 ? (x / y) * 100 : 0;
    
    const scorePct = maxSessionTokens > 0 ? (st.earnedTokens / maxSessionTokens) * 100 : 0;
    
    const avgTimeMs = st.timeToFirstCheckMsCount > 0
      ? st.timeToFirstCheckMsSum / st.timeToFirstCheckMsCount
      : null;

    if (x > 0) {
      classEarnedSum += st.earnedTokens;
      classProgressSum += progressPct;
      activeStudentCount += 1;
    }

    // Stuck = quiet too long while not yet finished. "Quiet" is measured from
    // the student's last saved answer, or from join time if they haven't
    // answered anything yet — whichever is more recent (and known).
    const finished = y > 0 && x >= y;
    const lastKnownMs = st.lastActiveMs > 0 ? st.lastActiveMs : (st.joinedAtMs || 0);
    const quietMs = lastKnownMs > 0 ? nowMs - lastKnownMs : 0;
    const isStuck = y > 0 && !finished && lastKnownMs > 0 && quietMs >= STUCK_THRESHOLD_MS;

    return {
      uid: st.uid,
      name: st.name,
      progress: { x, y, label: `${x}/${y}`, pct: progressPct },
      scorePct,
      isStuck,
      quietMinutes: isStuck ? Math.floor(quietMs / 60000) : null,
      hintsUsed: st.hintsUsed,
      avgTimeMs,
      lastActiveMs: st.lastActiveMs,
    };
  });

  const missedStats = orderedQ.map(q => {
    const rowsForQ = dedupedResults.filter(r => r.questionId === q.id && r.correct !== null);
    if (rowsForQ.length === 0) return { id: q.id, wrongRate: 0, attempts: 0 };
    
    const wrongRows = rowsForQ.filter(r => r.correct === false).length;
    return {
      id: q.id,
      wrongRate: wrongRows / rowsForQ.length,
      attempts: rowsForQ.length
    };
  });

  const mostMissed = missedStats
    .filter(m => m.wrongRate > 0)
    .sort((a, b) => b.wrongRate - a.wrongRate)
    .map(m => m.id);

  const totalStudents = studentRows.length;
  const avgScorePct = activeStudentCount > 0 && maxSessionTokens > 0
    ? ((classEarnedSum / activeStudentCount) / maxSessionTokens) * 100
    : 0;
  const classProgressPct = activeStudentCount > 0
    ? classProgressSum / activeStudentCount
    : 0;

  // Raw deduped rows grouped per student, for the row drill-down. Already
  // deduped, so the detail panel is consistent with every aggregate above and
  // needs no extra Firestore reads.
  const rowsByUid = {};
  for (const r of dedupedResults) {
    (rowsByUid[r.studentUid] = rowsByUid[r.studentUid] || []).push(r);
  }

  return {
    summary: {
      totalStudents,
      avgScorePct: Math.round(avgScorePct),
      classProgressPct: Math.round(classProgressPct),
    },
    mostMissed,
    studentRows,
    rowsByUid,
  };
}

// Groups one student's (already deduped) rows by question in session order,
// for the drill-down panel. Within a question, guided rows come before
// independent ones: MC / blank-1..blank-N, then step-1..step-N, then any
// free-form answer last. Rows for questions no longer in the session
// (deleted mid-session) are appended at the end so nothing silently vanishes.
export function studentDetailByQuestion(rows, orderedQ) {
  const byQ = new Map();
  for (const r of rows || []) {
    if (!byQ.has(r.questionId)) byQ.set(r.questionId, []);
    byQ.get(r.questionId).push(r);
  }
  const rank = (r) => {
    if (r.mode === "guided") return r.blankId != null ? r.blankId : 0;
    if (r.stepId) return 1000 + (r.stepOrder ?? 0);
    return 2000; // free-form independent answer, last
  };
  const sortRows = (arr) => [...arr].sort((a, b) => rank(a) - rank(b));

  const out = [];
  const used = new Set();
  for (const q of orderedQ || []) {
    const qRows = byQ.get(q.id);
    if (qRows && qRows.length) {
      out.push({ question: q, rows: sortRows(qRows) });
      used.add(q.id);
    }
  }
  for (const [qid, qRows] of byQ) {
    if (!used.has(qid)) {
      out.push({ question: { id: qid, text: "(deleted question)" }, rows: sortRows(qRows) });
    }
  }
  return out;
}
