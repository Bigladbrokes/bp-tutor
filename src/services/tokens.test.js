import { resultRowId, tokensForResult } from "./tokens";

const uid = "StuUID123";
const base = { sessionId: "sessABC", questionId: "qXYZ" };

test("resultRowId: guided MC answer", () => {
  expect(resultRowId({ ...base, mode: "guided" }, uid))
    .toBe("sessABC_StuUID123_qXYZ_mc");
});

test("resultRowId: guided FitB blank uses the blank id", () => {
  expect(resultRowId({ ...base, mode: "guided", blankId: 3 }, uid))
    .toBe("sessABC_StuUID123_qXYZ_blank-3");
});

test("resultRowId: independent step uses the step id", () => {
  expect(resultRowId({ ...base, mode: "independent", stepId: "s1783002918998" }, uid))
    .toBe("sessABC_StuUID123_qXYZ_step-s1783002918998");
});

test("resultRowId: independent free-form answer (stepId null)", () => {
  expect(resultRowId({ ...base, mode: "independent", stepId: null }, uid))
    .toBe("sessABC_StuUID123_qXYZ_free");
});

test("resultRowId: uid is always segment [1], as firestore.rules requires", () => {
  const rows = [
    { ...base, mode: "guided" },
    { ...base, mode: "guided", blankId: 1 },
    { ...base, mode: "independent", stepId: "s1" },
    { ...base, mode: "independent", stepId: null },
  ];
  for (const r of rows) expect(resultRowId(r, uid).split("_")[1]).toBe(uid);
});

test("tokensForResult: full, half, and zero credit", () => {
  expect(tokensForResult("Medium", true, 1)).toBe(5);
  expect(tokensForResult("Medium", true, 2)).toBe(2.5);
  expect(tokensForResult("Hard", false, 2)).toBe(0);
});
