import { TOKEN_VALUES, tokensForResult } from "./tokens";
import { tsMs } from "./progress";

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

export function computeSessionStats(session, questions, rawResults, joins) {
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
      isStuck: false,
      stuckCounters: new Map(),
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
        isStuck: false,
        stuckCounters: new Map(),
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

  const chronologicalResults = [...(rawResults || [])].sort((a, b) => tsMs(a.timestamp) - tsMs(b.timestamp));
  
  for (const r of chronologicalResults) {
    const st = studentMap.get(r.studentUid);
    if (!st) continue;
    
    const partKey = `${r.questionId}|${r.mode}|${r.blankId ?? ""}|${r.stepId ?? ""}`;
    let counter = st.stuckCounters.get(partKey) || 0;

    if (r.correct === true) {
      counter = 0;
    } else if (r.correct === false) {
      counter += 1;
      if (counter >= 3) {
        st.isStuck = true;
      }
    }

    st.stuckCounters.set(partKey, counter);
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

    return {
      uid: st.uid,
      name: st.name,
      progress: { x, y, label: `${x}/${y}`, pct: progressPct },
      scorePct,
      isStuck: st.isStuck,
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

  return {
    summary: {
      totalStudents,
      avgScorePct: Math.round(avgScorePct),
      classProgressPct: Math.round(classProgressPct),
    },
    mostMissed,
    studentRows,
  };
}
