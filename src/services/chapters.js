// Chapter/topic helpers. A chapter is a plain string on each question doc —
// no separate collection; the list of known chapters is derived from the
// questions the teacher already subscribes to.

const GRADE_MAP = { "7": "M.1", "8": "M.2", "9": "M.3" };
export const normalizeGrade = (g) => GRADE_MAP[g] || g || "M.1";

// The anti-duplicate step: trim and collapse internal runs of whitespace,
// so "พีทาโกรัส " and "พีทาโกรัส" land on the same chapter.
export const normalizeChapter = (raw) => String(raw || "").trim().replace(/\s+/g, " ");

// Distinct chapters among `questions` for a grade + subject scope.
// Pass "All" (or falsy) to leave a dimension unscoped. Dedupes
// case-insensitively, keeps the first-seen display form, sorts A→Z.
export const chaptersFor = (questions, grade, subject) => {
  const seen = new Map();
  for (const q of questions || []) {
    if (grade && grade !== "All" && normalizeGrade(q.grade) !== grade) continue;
    if (subject && subject !== "All" && (q.subject || "Science") !== subject) continue;
    const c = normalizeChapter(q.chapter);
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};
