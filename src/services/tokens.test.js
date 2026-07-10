import { tokensForResult, questionAwardSlot } from "./tokens";

test("tokensForResult pays full value on attempt 1, half on attempt 2, nothing when wrong", () => {
  expect(tokensForResult("Medium", true, 1)).toBe(5);
  expect(tokensForResult("Medium", true, 2)).toBe(2.5);
  expect(tokensForResult("Hard", false, 2)).toBe(0);
  expect(tokensForResult("unknown", true, 1)).toBe(1); // falls back to Easy
});

// The award slot feeds the deterministic tokenHistory doc id
// (sessionId_uid_slot) that firestore.rules enforces, making each MC
// question / FitB blank / solution step pay out at most once per session.
test("questionAwardSlot gives each question, blank, and step its own slot", () => {
  expect(questionAwardSlot({ questionId: "qAbc" })).toBe("qAbc");
  // free-form short answers save stepId: null and share the question's slot
  expect(questionAwardSlot({ questionId: "qAbc", stepId: null })).toBe("qAbc");
  expect(questionAwardSlot({ questionId: "qAbc", blankId: 2 })).toBe("qAbc_b2");
  // real step ids look like s<timestamp> (QuestionForm), on top of the _s namespace
  expect(questionAwardSlot({ questionId: "qAbc", stepId: "s1751600000000" })).toBe("qAbc_ss1751600000000");
  // a blank and a step with the same numeric id must not collide
  expect(questionAwardSlot({ questionId: "qAbc", blankId: 1 }))
    .not.toBe(questionAwardSlot({ questionId: "qAbc", stepId: 1 }));
});
