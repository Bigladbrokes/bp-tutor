import {
  initialSteppedState, steppedReducer, STEP_PASSED, STEP_FAILED, DISMISS_FEEDBACK,
} from "./steppedRunner";

const strict = () => initialSteppedState({ totalSteps: 3, restartPolicy: "strict", retriesPerStep: 1 });
const retry1 = () => initialSteppedState({ totalSteps: 3, restartPolicy: "stepRetry", retriesPerStep: 1 });

const fail = (state) =>
  steppedReducer(state, { type: STEP_FAILED, payload: { errorClass: "compute.wrongValue", feedback: "ตรวจอีกครั้ง" } });
const pass = (state) => steppedReducer(state, { type: STEP_PASSED });
const dismiss = (state) => steppedReducer(state, { type: DISMISS_FEEDBACK });

// ─── Basics ───────────────────────────────────────────────────────────────────

test("initial state: inStep at step 0, attempt 1, no retries used", () => {
  const s = strict();
  expect(s.status).toBe("inStep");
  expect(s.stepIndex).toBe(0);
  expect(s.attemptNo).toBe(1);
  expect(s.retriesUsed).toBe(0);
});

test("passing a step advances stepIndex", () => {
  const s = pass(strict());
  expect(s.status).toBe("inStep");
  expect(s.stepIndex).toBe(1);
});

test("completing the last step → complete", () => {
  const s = pass(pass(pass(strict())));
  expect(s.status).toBe("complete");
});

// ─── strict policy ────────────────────────────────────────────────────────────

test("strict: fail shows feedback with a restart outcome", () => {
  const s = fail(strict());
  expect(s.status).toBe("showingFeedback");
  expect(s.feedback.outcome).toBe("restart");
  expect(s.feedback.errorClass).toBe("compute.wrongValue");
  expect(s.feedback.feedback).toBe("ตรวจอีกครั้ง");
});

test("strict: dismiss = full restart — attemptNo+1, stepIndex 0, retriesUsed 0", () => {
  // Fail on step 2 of attempt 1
  const s = dismiss(fail(pass(pass(strict()))));
  expect(s.status).toBe("inStep");
  expect(s.stepIndex).toBe(0);
  expect(s.attemptNo).toBe(2);
  expect(s.retriesUsed).toBe(0);
  expect(s.feedback).toBeNull();
});

// ─── stepRetry policy ─────────────────────────────────────────────────────────

test("stepRetry: first fail → retry outcome; dismiss keeps step, attempt, params-seed", () => {
  const failed = fail(pass(retry1())); // fail on step 1 (index 1)
  expect(failed.feedback.outcome).toBe("retry");
  const s = dismiss(failed);
  expect(s.status).toBe("inStep");
  expect(s.stepIndex).toBe(1);   // SAME step
  expect(s.attemptNo).toBe(1);   // attempt unchanged → same seed → same params
  expect(s.retriesUsed).toBe(1);
});

test("stepRetry: after retries are exhausted, the next fail restarts", () => {
  const afterRetry = dismiss(fail(retry1()));  // retriesUsed now 1 (= retriesPerStep)
  const failedAgain = fail(afterRetry);
  expect(failedAgain.feedback.outcome).toBe("restart");
  const s = dismiss(failedAgain);
  expect(s.stepIndex).toBe(0);
  expect(s.attemptNo).toBe(2);
  expect(s.retriesUsed).toBe(0);
});

test("stepRetry: retriesPerStep > 1 allows multiple same-step retries", () => {
  let s = initialSteppedState({ totalSteps: 1, restartPolicy: "stepRetry", retriesPerStep: 2 });
  s = dismiss(fail(s));
  expect(s.retriesUsed).toBe(1);
  s = dismiss(fail(s));
  expect(s.retriesUsed).toBe(2);
  expect(s.attemptNo).toBe(1);          // still the same attempt through both retries
  const third = fail(s);
  expect(third.feedback.outcome).toBe("restart"); // now exhausted
});

// ─── retriesUsed reset rules ──────────────────────────────────────────────────

test("retriesUsed resets when a step is passed", () => {
  const s = pass(dismiss(fail(retry1()))); // fail step 0, retry, then pass it
  expect(s.stepIndex).toBe(1);
  expect(s.retriesUsed).toBe(0); // fresh retries for the next step
});

test("retriesUsed resets on full restart", () => {
  // Exhaust the retry on step 0, then fail → restart
  const s = dismiss(fail(dismiss(fail(retry1()))));
  expect(s.attemptNo).toBe(2);
  expect(s.retriesUsed).toBe(0);
});

// ─── Guards ───────────────────────────────────────────────────────────────────

test("actions in the wrong status are ignored", () => {
  const showing = fail(strict());
  expect(pass(showing)).toBe(showing);      // can't pass while feedback is up
  expect(fail(showing)).toBe(showing);      // can't double-fail
  const inStep = strict();
  expect(dismiss(inStep)).toBe(inStep);     // nothing to dismiss
});

test("complete is terminal", () => {
  const done = pass(pass(pass(strict())));
  expect(pass(done)).toBe(done);
  expect(fail(done)).toBe(done);
  expect(dismiss(done)).toBe(done);
});

test("unknown actions return the state unchanged", () => {
  const s = strict();
  expect(steppedReducer(s, { type: "NOPE" })).toBe(s);
});
