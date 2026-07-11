import React from "react";

import { normalizeGrade, normalizeChapter } from "../services/chapters";

// Re-export so existing `import { normalizeGrade } from "./MetaBadges"` keeps working
export { normalizeGrade };

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

// chapterBadge is opt-in (teacher views only) so student-facing cards are unchanged
export default function MetaBadges({ question, size = "sm", chapterBadge = false }) {
  const grade      = normalizeGrade(question.grade);
  const subject    = question.subject    || "Science";
  const difficulty = question.difficulty || "Easy";
  const qType      = question.questionType || question.type || "mc";
  const chapter    = normalizeChapter(question.chapter);
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
      {chapterBadge && (
        <span style={{
          ...s.badge, fontSize: fs, padding: pad,
          ...(chapter ? { background: "#ede7f6", color: "#4527a0" } : { background: "#f5f5f5", color: "#9e9e9e" }),
        }}>
          📚 {chapter || "Uncategorized"}
        </span>
      )}
    </div>
  );
}
