import React from "react";
import KaTeXRenderer from "./KaTeXRenderer";
import { dedupeResults } from "../services/sessionStats";

// Read question type from either field name (older docs may only have `type`)
const getQType = (q) => q.questionType || q.type || "mc";

export default function LiveResults({ questions = [], results: rawResults = [], sessionQuestionIds = [] }) {
  const results = dedupeResults(rawResults);
  const guided = results.filter((r) => r.mode === "guided");
  const studentCount = new Set(guided.map((r) => r.studentUid)).size;

  const ordered = sessionQuestionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter(Boolean);

  return (
    <div style={s.wrapper}>
      <div style={s.topBar}>
        <span style={s.topTitle}>Live Results</span>
        <span style={s.badge}>
          <span style={s.dot} />
          {studentCount} student{studentCount !== 1 ? "s" : ""} responded
        </span>
      </div>

      {ordered.length === 0 && <p style={s.empty}>Loading questions...</p>}

      <div style={s.list}>
        {ordered.map((q, idx) => (
          <QuestionResult
            key={q.id}
            question={q}
            index={idx}
            results={results}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionResult({ question, index, results = [] }) {
  const guidedForQ = results.filter(
    (r) => r.questionId === question.id && r.mode === "guided"
  );
  const indForQ = results.filter(
    (r) => r.questionId === question.id && r.mode === "independent"
  );
  const total = guidedForQ.length;
  const qType = getQType(question);

  return (
    <div style={s.card}>
      <p style={s.qLabel}>Q{index + 1}</p>
      <p style={s.qText}><KaTeXRenderer text={question.text} /></p>

      {/* Guided Mode results — multiple choice */}
      {qType === "mc" && (
        <div style={s.section}>
          <p style={s.sectionLabel}>Guided Mode — {total} answered</p>
          {question.options.map((opt, i) => {
            const isCorrect = String(i) === question.correctAnswer;
            const count = guidedForQ.filter((r) => r.answer === String(i)).length;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <BarRow
                key={i}
                letter={String.fromCharCode(65 + i)}
                text={opt}
                count={count}
                pct={pct}
                isCorrect={isCorrect}
              />
            );
          })}
          {total > 0 && (
            <div style={s.statsRow}>
              <span style={s.statGreen}>
                ✓ {guidedForQ.filter((r) => r.correct).length} correct
              </span>
              <span style={s.statOrange}>
                💡 {guidedForQ.filter((r) => r.usedHint).length} used hint
              </span>
            </div>
          )}
        </div>
      )}

      {/* Guided Mode results — fill in the blank */}
      {qType === "fill_in_blank" && (
        <FitBResults question={question} guidedForQ={guidedForQ} />
      )}

      {/* Independent Mode answers */}
      <div style={s.section}>
        <p style={s.sectionLabel}>
          Independent Mode — {indForQ.length} answered
        </p>
        {indForQ.length === 0 ? (
          <p style={s.noAnswers}>No answers yet.</p>
        ) : (
          <div style={s.saList}>
            {indForQ.map((r, i) => (
              <div key={i} style={s.saRow}>
                <span style={s.saName}>{r.studentName}</span>
                <span style={s.saText}>
                  {r.stepOrder != null && <span style={s.stepTag}>Step {r.stepOrder}</span>}
                  {/* Step results save the field as studentAnswer; free-form saves answer */}
                  {r.studentAnswer ?? r.answer}
                  {r.correct === true && " ✅"}
                  {r.correct === false && " ❌"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FitBResults({ question, guidedForQ }) {
  const blanks = question.blanks ||
    (question.correctAnswer ? [{ id: 1, answer: question.correctAnswer }] : []);
  const studentCount = new Set(guidedForQ.map((r) => r.studentUid)).size;

  return (
    <div style={s.section}>
      <p style={s.sectionLabel}>Guided Mode — {studentCount} answered</p>
      {blanks.map((blank, i) => {
        const rows = guidedForQ.filter((r) => (r.blankId ?? 1) === (blank.id ?? i + 1));
        const correct = rows.filter((r) => r.correct).length;
        const hints = rows.filter((r) => r.usedHint).length;
        const pct = rows.length > 0 ? Math.round((correct / rows.length) * 100) : 0;
        return (
          <BarRow
            key={i}
            letter={`[${i + 1}]`}
            text={`${blank.answer}${hints > 0 ? `  ·  💡 ${hints} used hint` : ""}`}
            count={correct}
            pct={pct}
            isCorrect={rows.length > 0 && correct === rows.length}
          />
        );
      })}
    </div>
  );
}

function BarRow({ letter, text, count, pct, isCorrect }) {
  return (
    <div style={s.barRow}>
      <div style={s.barTop}>
        <span style={{ ...s.barLetter, color: isCorrect ? "#2e7d32" : "#555" }}>
          {letter}.
        </span>
        <span style={s.barText}><KaTeXRenderer text={text} /></span>
        {isCorrect && <span style={s.correctMark}>✓ correct</span>}
        <span style={s.barCount}>{count} ({pct}%)</span>
      </div>
      <div style={s.barTrack}>
        <div
          style={{
            ...s.barFill,
            width: `${pct}%`,
            background: isCorrect ? "#2e7d32" : "#1565c0",
          }}
        />
      </div>
    </div>
  );
}

const s = {
  wrapper: { padding: "0 0 32px" },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: "20px",
  },
  topTitle: { fontSize: "18px", fontWeight: "600", color: "#222" },
  badge: {
    display: "flex", alignItems: "center", gap: "6px",
    background: "#e8f5e9", color: "#2e7d32",
    padding: "4px 14px", borderRadius: "20px", fontSize: "13px", fontWeight: "600",
  },
  dot: {
    width: "8px", height: "8px", borderRadius: "50%", background: "#2e7d32",
  },
  list: { display: "flex", flexDirection: "column", gap: "14px" },
  card: {
    background: "#fff", borderRadius: "10px", padding: "20px 22px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  qLabel: {
    margin: "0 0 4px", fontSize: "11px", fontWeight: "700",
    textTransform: "uppercase", letterSpacing: "0.5px", color: "#1565c0",
  },
  qText: { margin: "0 0 16px", fontSize: "15px", lineHeight: "1.7", color: "#1a1a1a" },
  section: { marginBottom: "16px" },
  sectionLabel: {
    fontSize: "11px", fontWeight: "700", textTransform: "uppercase",
    letterSpacing: "0.5px", color: "#888", margin: "0 0 8px",
  },
  statsRow: { display: "flex", gap: "16px", marginTop: "8px" },
  statGreen: { fontSize: "13px", color: "#2e7d32", fontWeight: "600" },
  statOrange: { fontSize: "13px", color: "#e65100", fontWeight: "600" },
  barRow: { marginBottom: "8px" },
  barTop: { display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px", flexWrap: "wrap" },
  barLetter: { fontWeight: "700", fontSize: "14px", flexShrink: 0 },
  barText: { fontSize: "14px", flex: 1 },
  correctMark: {
    fontSize: "11px", fontWeight: "700", color: "#2e7d32",
    background: "#e8f5e9", padding: "1px 7px", borderRadius: "4px",
  },
  barCount: { fontSize: "13px", color: "#888", flexShrink: 0, marginLeft: "auto" },
  barTrack: { height: "10px", background: "#f0f0f0", borderRadius: "5px", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: "5px", transition: "width 0.6s ease", minWidth: "2px" },
  noAnswers: { color: "#bbb", fontSize: "14px", margin: 0 },
  saList: { display: "flex", flexDirection: "column", gap: "6px" },
  saRow: {
    display: "flex", gap: "10px", padding: "8px 12px",
    background: "#f8f9fa", borderRadius: "7px", alignItems: "flex-start",
  },
  saName: {
    fontSize: "12px", fontWeight: "700", color: "#1565c0",
    whiteSpace: "nowrap", paddingTop: "1px", minWidth: "80px",
  },
  saText: { fontSize: "14px", color: "#333", lineHeight: "1.5" },
  stepTag: {
    fontSize: "11px", fontWeight: "700", color: "#6a1b9a", background: "#f3e5f5",
    padding: "1px 7px", borderRadius: "4px", marginRight: "8px", whiteSpace: "nowrap",
  },
  empty: { color: "#bbb", textAlign: "center", padding: "40px 0" },
};
