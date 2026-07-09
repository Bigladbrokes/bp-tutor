import React from "react";

const GRADE_MAP = { "7": "M.1", "8": "M.2", "9": "M.3" };
export const normalizeGrade = (g) => GRADE_MAP[g] || g || "M.1";

const DIFF_BADGE = {
  Easy:   { background: "#e8f5e9", color: "#2e7d32" },
  Medium: { background: "#fff8e1", color: "#e65100" },
  Hard:   { background: "#fce4ec", color: "#c62828" },
};

const s = {
  badge:        { borderRadius: "4px", fontWeight: "700", letterSpacing: "0.3px" },
  mathBadge:    { background: "#e3f2fd", color: "#1565c0" },
  scienceBadge: { background: "#e0f2f1", color: "#00695c" },
  mcqBadge:     { background: "#e3f2fd", color: "#0d47a1" },
  fitbBadge:    { background: "#f3e5f5", color: "#6a1b9a" },
};

export default function MetaBadges({ question, size = "sm" }) {
  const grade      = normalizeGrade(question.grade);
  const subject    = question.subject    || "Science";
  const difficulty = question.difficulty || "Easy";
  const qType      = question.questionType || question.type || "mc";
  const fs  = size === "sm" ? "11px" : "12px";
  const pad = size === "sm" ? "2px 8px" : "3px 10px";
  return (
    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" }}>
      <span style={{ ...s.badge, fontSize: fs, padding: pad, ...(qType === "fill_in_blank" ? s.fitbBadge : s.mcqBadge) }}>
        {qType === "fill_in_blank" ? "Fill" : "MCQ"}
      </span>
      <span style={{ ...s.badge, fontSize: fs, padding: pad, background: "#eceff1", color: "#455a64" }}>
        {grade}
      </span>
      <span style={{ ...s.badge, fontSize: fs, padding: pad, ...(subject === "Math" ? s.mathBadge : s.scienceBadge) }}>
        {subject}
      </span>
      <span style={{ ...s.badge, fontSize: fs, padding: pad, ...DIFF_BADGE[difficulty] }}>
        {difficulty}
      </span>
    </div>
  );
}
