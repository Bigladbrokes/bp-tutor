// Pure state machine for the stepped-solver question runner (doc §5, §7.1).
// No Firebase imports, no React imports — progress.js conventions. The React
// component owns a useReducer over this and derives params from
// steppedSeed(uid, questionId, state.attemptNo) — so a full restart
// (attemptNo+1) reseeds the numbers for free, while a same-step retry
// (attemptNo unchanged) keeps them.
//
// Policy semantics (doc §7.1):
//   "strict"    — any fail shows feedback; dismissing = full restart
//                 (attemptNo+1, stepIndex 0, retriesUsed 0).
//   "stepRetry" — while retriesUsed < retriesPerStep, dismissing = retry the
//                 SAME step with the SAME params (retriesUsed+1, attemptNo
//                 unchanged); once retries are exhausted, dismissing = full
//                 restart as above.
// retriesUsed resets on step pass and on every full restart.

import { hashSeed, mulberry32 } from "./shuffle";

export const STEP_PASSED = "STEP_PASSED";
export const STEP_FAILED = "STEP_FAILED";
export const DISMISS_FEEDBACK = "DISMISS_FEEDBACK";

// Deterministic per-student option order for an equationSelect step (doc
// §3.2, same mechanics as the MC shuffle). The ":eq:" segment keeps this
// random stream independent of the params seed for the same attempt, and
// attemptNo in the seed reshuffles the options on every full restart.
export function shuffleEquationOptions(options, uid, questionId, attemptNo) {
  const items = (options || []).map((opt, originalIndex) => ({ ...opt, originalIndex }));
  const rand = mulberry32(hashSeed(`${uid}:${questionId}:eq:${attemptNo}`));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Per-step-type retry behavior: on a same-step retry, select/drag steps CLEAR
// the student's work (a wrong pick left highlighted anchors them to the
// mistake), while numeric entry keeps the typed value for editing. rearrange
// (build step 5) inherits the select/drag behavior.
const CLEAR_ON_RETRY = { equationSelect: true, rearrange: true, compute: false };
export const stepClearsOnRetry = (stepType) => CLEAR_ON_RETRY[stepType] ?? false;

// config: { totalSteps, restartPolicy: "strict"|"stepRetry", retriesPerStep }
// Carried inside the state so the reducer stays a pure 2-arg (state, action).
export function initialSteppedState(config) {
  return {
    status: "inStep", // "inStep" | "showingFeedback" | "complete"
    stepIndex: 0,
    attemptNo: 1,
    retriesUsed: 0,
    feedback: null, // { errorClass, feedback, outcome: "retry"|"restart" } while showingFeedback
    config: {
      totalSteps: config?.totalSteps ?? 1,
      restartPolicy: config?.restartPolicy ?? "strict",
      retriesPerStep: config?.retriesPerStep ?? 1,
    },
  };
}

export function steppedReducer(state, action) {
  const { config } = state;

  switch (action.type) {
    case STEP_PASSED: {
      if (state.status !== "inStep") return state;
      const nextIndex = state.stepIndex + 1;
      if (nextIndex >= config.totalSteps) {
        return { ...state, status: "complete", retriesUsed: 0, feedback: null };
      }
      return { ...state, stepIndex: nextIndex, retriesUsed: 0, feedback: null };
    }

    case STEP_FAILED: {
      if (state.status !== "inStep") return state;
      // The dismiss outcome is decided AT FAIL TIME and stored, so the
      // feedback panel can label its button correctly (ลองอีกครั้ง vs เริ่มใหม่)
      // and DISMISS_FEEDBACK needs no re-derivation.
      const canRetry =
        config.restartPolicy === "stepRetry" && state.retriesUsed < config.retriesPerStep;
      return {
        ...state,
        status: "showingFeedback",
        feedback: {
          errorClass: action.payload?.errorClass ?? null,
          feedback: action.payload?.feedback ?? "",
          outcome: canRetry ? "retry" : "restart",
        },
      };
    }

    case DISMISS_FEEDBACK: {
      if (state.status !== "showingFeedback") return state;
      if (state.feedback?.outcome === "retry") {
        // Same step, same params (attemptNo unchanged → same seed)
        return { ...state, status: "inStep", retriesUsed: state.retriesUsed + 1, feedback: null };
      }
      // Full restart: new attempt → caller reseeds params
      return {
        ...state,
        status: "inStep",
        stepIndex: 0,
        attemptNo: state.attemptNo + 1,
        retriesUsed: 0,
        feedback: null,
      };
    }

    default:
      return state;
  }
}
