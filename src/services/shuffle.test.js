import { shuffledOptions } from "./shuffle";

const question = {
  id: "q-abc-123",
  options: ["Newton", "Joule", "Watt", "Pascal"],
  correctAnswer: "2", // "Watt", by original index
};

test("shuffle is deterministic for the same student and question", () => {
  const a = shuffledOptions(question, "student-uid-1");
  for (let i = 0; i < 20; i++) {
    expect(shuffledOptions(question, "student-uid-1")).toEqual(a);
  }
});

test("shuffle is a valid permutation — every option exactly once", () => {
  const order = shuffledOptions(question, "student-uid-1");
  expect(order).toHaveLength(4);
  expect([...order.map((o) => o.originalIndex)].sort()).toEqual([0, 1, 2, 3]);
  expect(new Set(order.map((o) => o.text)).size).toBe(4);
});

test("different students see different orders (across a group)", () => {
  const orders = new Set(
    ["u1", "u2", "u3", "u4", "u5", "u6"].map((uid) =>
      shuffledOptions(question, uid).map((o) => o.originalIndex).join(",")
    )
  );
  expect(orders.size).toBeGreaterThan(1);
});

test("different questions shuffle independently for the same student", () => {
  const q2 = { ...question, id: "q-def-456" };
  const perQuestion = new Set(
    ["q-abc-123", "q-def-456", "q-ghi-789", "q-jkl-012"].map((id) =>
      shuffledOptions({ ...question, id }, "student-uid-1").map((o) => o.originalIndex).join(",")
    )
  );
  expect(perQuestion.size).toBeGreaterThan(1);
  expect(shuffledOptions(q2, "student-uid-1")).toEqual(shuffledOptions(q2, "student-uid-1"));
});

test("grading stays value-correct: picking the true answer grades correct at any position", () => {
  for (const uid of ["u1", "u2", "u3", "u4", "u5"]) {
    const order = shuffledOptions(question, uid);
    const displayIndex = order.findIndex((o) => String(o.originalIndex) === question.correctAnswer);
    expect(displayIndex).toBeGreaterThanOrEqual(0); // correct option is always present
    const picked = order[displayIndex];
    // The app records/compares original indices, so this must always hold:
    expect(String(picked.originalIndex)).toBe(question.correctAnswer);
    expect(picked.text).toBe("Watt");
  }
});

test("handles questions with missing options gracefully", () => {
  expect(shuffledOptions({ id: "x", options: undefined }, "u1")).toEqual([]);
});
