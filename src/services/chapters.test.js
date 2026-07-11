import { normalizeChapter, chaptersFor } from "./chapters";

test("normalizeChapter trims and collapses internal whitespace", () => {
  expect(normalizeChapter("  Pythagoras   Theorem ")).toBe("Pythagoras Theorem");
  expect(normalizeChapter("พีทาโกรัส\t\tบทที่  1")).toBe("พีทาโกรัส บทที่ 1");
  expect(normalizeChapter("")).toBe("");
  expect(normalizeChapter(null)).toBe("");
  expect(normalizeChapter("   ")).toBe("");
});

const questions = [
  { grade: "M.2", subject: "Math", chapter: "Pythagoras" },
  { grade: "M.2", subject: "Math", chapter: "pythagoras  " },   // dupe by case+spacing
  { grade: "M.2", subject: "Math", chapter: "Algebra" },
  { grade: "8",   subject: "Math", chapter: "Legacy Grade" },   // numeric grade → M.2
  { grade: "M.1", subject: "Math", chapter: "Fractions" },
  { grade: "M.2", subject: "Science", chapter: "Forces" },
  { grade: "M.2", subject: "Math" },                            // no chapter — ignored
  { grade: "M.2", subject: "Math", chapter: "   " },            // blank — ignored
];

test("chaptersFor scopes to grade + subject and dedupes typo variants", () => {
  expect(chaptersFor(questions, "M.2", "Math")).toEqual(["Algebra", "Legacy Grade", "Pythagoras"]);
});

test("chaptersFor keeps M.1 and Science chapters out of M.2 Math", () => {
  const list = chaptersFor(questions, "M.2", "Math");
  expect(list).not.toContain("Fractions");
  expect(list).not.toContain("Forces");
});

test("chaptersFor with All shows every chapter once", () => {
  expect(chaptersFor(questions, "All", "All")).toEqual(
    ["Algebra", "Forces", "Fractions", "Legacy Grade", "Pythagoras"]
  );
});

test("chaptersFor handles empty input", () => {
  expect(chaptersFor([], "M.1", "Math")).toEqual([]);
  expect(chaptersFor(undefined, "M.1", "Math")).toEqual([]);
});
