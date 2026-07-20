import React, { useMemo, useReducer, useState } from "react";
import KaTeXRenderer from "./KaTeXRenderer";
import { steppedSeed, generateParams, injectParams, evaluateAnswerExpr, checkAnswer } from "../services/steppedParams";
import { initialSteppedState, steppedReducer, STEP_PASSED, STEP_FAILED, DISMISS_FEEDBACK } from "../services/steppedRunner";

// Thin UI over the pure state machine (doc §5). Owns the reducer; params are
// derived from (uid, questionId, attemptNo), so a full restart reseeds the
// numbers automatically while a same-step retry keeps them.
export default function SteppedQuestionRunner({ uid, question, sessionConfig }) {
  const [state, dispatch] = useReducer(
    steppedReducer,
    { totalSteps: question.steps.length, ...(sessionConfig?.stepped || {}) },
    initialSteppedState
  );

  const params = useMemo(
    () => generateParams(question.template.params, steppedSeed(uid, question.id, state.attemptNo)),
    [uid, question, state.attemptNo]
  );
  const expected = useMemo(
    () => evaluateAnswerExpr(question.template.answerExpr, params),
    [question, params]
  );

  const step = question.steps[state.stepIndex];

  if (state.status === "complete") {
    return (
      <div style={s.card}>
        <div style={s.completeIcon}>✅</div>
        <p style={s.completeText}>ทำครบทุกขั้นตอนแล้ว เก่งมาก!</p>
        <p style={s.completeSub}>เสร็จในความพยายามครั้งที่ {state.attemptNo}</p>
      </div>
    );
  }

  return (
    <div>
      <StepHeader
        stepIndex={state.stepIndex}
        totalSteps={question.steps.length}
        problemText={injectParams(question.template.problemText, params, question.template.params)}
      />

      {step.stepType === "compute" && (
        <StepCompute
          // Remount on restart (fresh input); retain typed value across a
          // same-step retry so the student can edit their wrong answer.
          key={`${state.attemptNo}-${state.stepIndex}`}
          step={step}
          unknown={question.template.unknown}
          disabled={state.status !== "inStep"}
          onSubmit={(value) => {
            const ok = checkAnswer(value, expected, question.template.tolerance);
            if (ok) dispatch({ type: STEP_PASSED });
            else dispatch({ type: STEP_FAILED, payload: { errorClass: step.errorClass, feedback: step.feedback } });
          }}
        />
      )}

      {state.status === "showingFeedback" && (
        <IncorrectPanel
          feedback={state.feedback}
          onDismiss={() => dispatch({ type: DISMISS_FEEDBACK })}
        />
      )}
    </div>
  );
}

function StepHeader({ stepIndex, totalSteps, problemText }) {
  return (
    <div style={s.header}>
      <span style={s.stepBadge}>Step {stepIndex + 1}/{totalSteps}</span>
      <p style={s.problemText}><KaTeXRenderer text={problemText} /></p>
    </div>
  );
}

// §3.4 compute step: the unit is PROVIDED as a label — the student types
// only the number.
function StepCompute({ step, unknown, disabled, onSubmit }) {
  const [input, setInput] = useState("");
  const value = Number(input);
  const submittable = input.trim() !== "" && Number.isFinite(value) && !disabled;

  return (
    <div style={s.card}>
      <p style={s.computeLabel}>คำนวณหาคำตอบ แล้วกรอกตัวเลข</p>
      <div style={s.answerRow}>
        <span style={s.answerSymbol}><KaTeXRenderer text={`$${unknown.symbol}$`} /> =</span>
        <input
          type="text"
          inputMode="decimal"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submittable && onSubmit(value)}
          placeholder="00.0"
          style={s.answerInput}
          autoFocus
        />
        <span style={s.answerUnit}>{step.answerField?.unitProvided ?? unknown.unit}</span>
      </div>
      <div style={s.btnRow}>
        <button
          onClick={() => onSubmit(value)}
          disabled={!submittable}
          style={{ ...s.submitBtn, opacity: submittable ? 1 : 0.4, cursor: submittable ? "pointer" : "not-allowed" }}
        >
          ตรวจคำตอบ ✓
        </button>
      </div>
    </div>
  );
}

// Feedback card. The dismiss label states the consequence: a full restart
// regenerates the numbers ("เริ่มใหม่"), a same-step retry keeps them
// ("ลองอีกครั้ง").
function IncorrectPanel({ feedback, onDismiss }) {
  const isRetry = feedback?.outcome === "retry";
  return (
    <div style={s.panelOverlay}>
      <div style={s.panel}>
        <div style={s.panelHeader}>ยังไม่ถูกต้อง</div>
        <p style={s.panelBody}>{feedback?.feedback}</p>
        {!isRetry && (
          <p style={s.panelNote}>โจทย์จะเริ่มใหม่ด้วยตัวเลขชุดใหม่</p>
        )}
        <button onClick={onDismiss} style={s.panelBtn}>
          {isRetry ? "ลองอีกครั้ง →" : "เริ่มใหม่ ↺"}
        </button>
      </div>
    </div>
  );
}

const s = {
  header: { marginBottom: "14px" },
  stepBadge: {
    display: "inline-block", background: "#ede7f6", color: "#4527a0",
    borderRadius: "12px", padding: "3px 12px", fontSize: "12px", fontWeight: "700",
    letterSpacing: "0.5px", marginBottom: "10px",
  },
  problemText: { margin: 0, fontSize: "17px", lineHeight: "1.8", color: "#1a1a1a", whiteSpace: "pre-line" },

  card: {
    background: "#fff", borderRadius: "12px", padding: "24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  computeLabel: { margin: "0 0 16px", fontSize: "14px", color: "#888" },
  answerRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
  answerSymbol: { fontSize: "18px", fontWeight: "600", color: "#1a1a1a", whiteSpace: "nowrap" },
  answerInput: {
    width: "130px", padding: "12px 14px", boxSizing: "border-box",
    border: "2px solid #ce93d8", borderRadius: "8px", fontSize: "18px",
    fontFamily: "inherit", textAlign: "center", outline: "none",
  },
  answerUnit: { fontSize: "16px", fontWeight: "600", color: "#555", whiteSpace: "nowrap" },
  btnRow: { display: "flex", justifyContent: "flex-end", marginTop: "18px" },
  submitBtn: {
    padding: "11px 28px", background: "#6a1b9a", color: "#fff", border: "none",
    borderRadius: "8px", fontSize: "15px", fontWeight: "700",
  },

  panelOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500,
    padding: "20px",
  },
  panel: {
    background: "#fff", borderRadius: "14px", maxWidth: "420px", width: "100%",
    overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
  },
  panelHeader: {
    background: "#1b5e20", color: "#fff", padding: "12px 20px",
    fontSize: "16px", fontWeight: "700",
  },
  panelBody: { margin: 0, padding: "18px 20px 6px", fontSize: "15px", lineHeight: "1.7", color: "#333" },
  panelNote: { margin: 0, padding: "6px 20px 0", fontSize: "13px", color: "#c62828", fontWeight: "600" },
  panelBtn: {
    display: "block", margin: "16px 20px 20px auto", padding: "10px 24px",
    background: "#0f3460", color: "#fff", border: "none", borderRadius: "8px",
    fontSize: "15px", fontWeight: "700", cursor: "pointer",
  },

  completeIcon: { fontSize: "52px", textAlign: "center", marginBottom: "10px" },
  completeText: { margin: 0, fontSize: "20px", fontWeight: "700", color: "#2e7d32", textAlign: "center" },
  completeSub: { margin: "8px 0 0", fontSize: "14px", color: "#888", textAlign: "center" },
};
