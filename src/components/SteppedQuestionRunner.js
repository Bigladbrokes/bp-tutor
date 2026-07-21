import React, { useMemo, useReducer, useState } from "react";
import KaTeXRenderer from "./KaTeXRenderer";
import { useChipDrag } from "./useChipDrag";
import { steppedSeed, generateParams, injectParams, evaluateAnswerExpr, checkAnswer, gradeGivens } from "../services/steppedParams";
import {
  initialSteppedState, steppedReducer, STEP_PASSED, STEP_FAILED, DISMISS_FEEDBACK,
  shuffleEquationOptions, stepClearsOnRetry,
} from "../services/steppedRunner";

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

      {step.stepType === "givens" && (
        <StepGivens
          // givens clears BOTH the typed values and the assigned unit chips on
          // a same-step retry (stepClearsOnRetry: true → retriesUsed is in the
          // key, so dismissing a retry remounts empty).
          key={stepKey(state, step)}
          step={step}
          params={params}
          disabled={state.status !== "inStep"}
          onPass={() => dispatch({ type: STEP_PASSED })}
          onFail={(payload) => dispatch({ type: STEP_FAILED, payload })}
        />
      )}

      {step.stepType === "compute" && (
        <StepCompute
          // Remount on restart (fresh input). compute keeps the typed value
          // across a same-step retry (stepClearsOnRetry: false) so the
          // student can edit their wrong answer.
          key={stepKey(state, step)}
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

      {step.stepType === "equationSelect" && (
        <StepEquationSelect
          // equationSelect clears the selection on a same-step retry
          // (stepClearsOnRetry: true → retriesUsed is part of the key, so
          // dismissing a retry remounts with nothing selected).
          key={stepKey(state, step)}
          step={step}
          uid={uid}
          questionId={question.id}
          attemptNo={state.attemptNo}
          disabled={state.status !== "inStep"}
          onPass={() => dispatch({ type: STEP_PASSED })}
          onFail={(payload) => dispatch({ type: STEP_FAILED, payload })}
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

// Remount key for the current step component. A full restart (attemptNo+1)
// always remounts. Whether a same-step retry also remounts (clearing local
// input state) is a per-step-type decision — see stepClearsOnRetry.
function stepKey(state, step) {
  const base = `${state.attemptNo}-${state.stepIndex}`;
  return stepClearsOnRetry(step.stepType) ? `${base}-${state.retriesUsed}` : base;
}

function StepHeader({ stepIndex, totalSteps, problemText }) {
  return (
    <div style={s.header}>
      <span style={s.stepBadge}>Step {stepIndex + 1}/{totalSteps}</span>
      <p style={s.problemText}><KaTeXRenderer text={problemText} /></p>
    </div>
  );
}

// §3.1 givens step: for each field the student types the value (native
// numeric input — same convention as StepCompute; there is no shared
// NumericKeypad component in this repo) and drags a unit chip from the palette
// onto the field's unit slot. Value and unit are graded INDEPENDENTLY per
// field (gradeGivens); only the fields that aren't fully correct get the red-X
// while the feedback panel shows. A same-step retry remounts this component
// (clearOnRetry: true), so nothing is carried over.
function StepGivens({ step, params, disabled, onPass, onFail }) {
  const [values, setValues] = useState({});   // symbol -> typed string
  const [units, setUnits] = useState({});     // symbol -> assigned unit | undefined
  const [graded, setGraded] = useState(null); // last grade result → red-X set

  const dnd = useChipDrag({
    onDrop: (slotSymbol, unit) => {
      if (disabled) return;
      setUnits((u) => ({ ...u, [slotSymbol]: unit }));
    },
  });

  const setValue = (symbol, v) => setValues((prev) => ({ ...prev, [symbol]: v }));
  const clearUnit = (symbol) => setUnits((u) => ({ ...u, [symbol]: undefined }));

  const allFilled = step.fields.every(
    (f) => (values[f.symbol] ?? "").trim() !== "" && units[f.symbol]
  );
  const submittable = allFilled && !disabled;

  const submit = () => {
    const entries = {};
    step.fields.forEach((f) => {
      entries[f.symbol] = { value: values[f.symbol], unit: units[f.symbol] ?? null };
    });
    const result = gradeGivens(step.fields, entries, params);
    setGraded(result);
    if (result.passed) onPass();
    else onFail({ errorClass: result.errorClass, feedback: step.feedback?.[result.errorClass] });
  };

  const statusOf = (symbol) => graded?.fields.find((r) => r.symbol === symbol);

  return (
    <div style={s.card}>
      <p style={s.computeLabel}>{step.title ?? "กรอกค่าและลากหน่วยให้ถูกต้อง"}</p>

      <div style={s.givensList}>
        {step.fields.map((f) => {
          const st = statusOf(f.symbol);
          const isWrong = st ? !st.ok : false;
          const unit = units[f.symbol];
          return (
            <div
              key={f.symbol}
              style={{
                ...s.givensRow,
                borderColor: isWrong ? "#c62828" : "#e8e0f0",
                background: isWrong ? "#fce4ec" : "#faf8fd",
              }}
            >
              <span style={s.givensSymbol}><KaTeXRenderer text={`$${f.symbol}$`} /> =</span>
              <input
                type="text"
                inputMode="decimal"
                value={values[f.symbol] ?? ""}
                onChange={(e) => setValue(f.symbol, e.target.value)}
                placeholder="00.0"
                style={s.givensInput}
                disabled={disabled}
                aria-label={`value-${f.symbol}`}
              />
              <div
                {...dnd.slotProps(f.symbol)}
                data-testid={`unit-slot-${f.symbol}`}
                style={{
                  ...s.unitSlot,
                  borderColor: dnd.dragging ? "#6a1b9a" : "#c9b6e0",
                  background: dnd.dragging ? "#f3e5f5" : "#fff",
                }}
              >
                {unit ? (
                  <button
                    type="button"
                    onClick={() => !disabled && clearUnit(f.symbol)}
                    style={s.unitAssigned}
                    title="แตะเพื่อลบ"
                    aria-label={`clear-unit-${f.symbol}`}
                  >
                    {unit} <span style={s.unitClearX}>✕</span>
                  </button>
                ) : (
                  <span style={s.unitPlaceholder}>ลากหน่วยมาวาง</span>
                )}
              </div>
              {isWrong && <span style={s.eqFailMark}>✗</span>}
            </div>
          );
        })}
      </div>

      <p style={s.paletteHint}>ลากหน่วยด้านล่างไปวางในช่องของแต่ละปริมาณ</p>
      <div style={s.paletteRow}>
        {step.unitPalette.map((u) => (
          <button
            key={u}
            type="button"
            {...dnd.chipProps(u, u)}
            style={{ ...s.unitChip, opacity: dnd.dragging === u ? 0.4 : 1 }}
          >
            {u}
          </button>
        ))}
      </div>

      <div style={s.btnRow}>
        <button
          onClick={submit}
          disabled={!submittable}
          style={{ ...s.submitBtn, opacity: submittable ? 1 : 0.4, cursor: submittable ? "pointer" : "not-allowed" }}
        >
          ตรวจคำตอบ ✓
        </button>
      </div>
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

// §3.2 equation selection: options shuffled deterministically per
// (student, question, attempt), single-select, per-distractor feedback. The
// wrong pick stays visible with a red ✗ while the feedback panel is up
// (observed behavior in the reference app).
function StepEquationSelect({ step, uid, questionId, attemptNo, disabled, onPass, onFail }) {
  const [selected, setSelected] = useState(null);   // originalIndex
  const [failedPick, setFailedPick] = useState(null);

  const options = useMemo(
    () => shuffleEquationOptions(step.options, uid, questionId, attemptNo),
    [step, uid, questionId, attemptNo]
  );

  const submit = () => {
    const opt = options.find((o) => o.originalIndex === selected);
    if (!opt) return;
    if (opt.correct) {
      onPass();
    } else {
      setFailedPick(opt.originalIndex);
      onFail({ errorClass: opt.errorClass, feedback: opt.feedback });
    }
  };

  return (
    <div style={s.card}>
      <p style={s.computeLabel}>{step.prompt}</p>
      <div style={s.eqList} role="radiogroup">
        {options.map((opt) => {
          const isSelected = selected === opt.originalIndex;
          const isFailed = failedPick === opt.originalIndex;
          return (
            <div
              key={opt.originalIndex}
              role="radio"
              aria-checked={isSelected}
              aria-label={opt.latex}
              onClick={() => !disabled && setSelected(opt.originalIndex)}
              style={{
                ...s.eqOption,
                borderColor: isFailed ? "#c62828" : isSelected ? "#6a1b9a" : "#e0e0e0",
                background: isFailed ? "#fce4ec" : isSelected ? "#f3e5f5" : "#fff",
                cursor: disabled ? "default" : "pointer",
              }}
            >
              <span style={{ ...s.eqDot, borderColor: isSelected ? "#6a1b9a" : "#bbb", background: isSelected ? "#6a1b9a" : "transparent" }} />
              <span style={s.eqLatex}><KaTeXRenderer text={`$${opt.latex}$`} /></span>
              {isFailed && <span style={s.eqFailMark}>✗</span>}
            </div>
          );
        })}
      </div>
      <div style={s.btnRow}>
        <button
          onClick={submit}
          disabled={selected === null || disabled}
          style={{
            ...s.submitBtn,
            opacity: selected === null || disabled ? 0.4 : 1,
            cursor: selected === null || disabled ? "not-allowed" : "pointer",
          }}
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

  givensList: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" },
  givensRow: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
    padding: "12px 14px", border: "2px solid", borderRadius: "10px",
    transition: "border-color 0.15s, background 0.15s",
  },
  givensSymbol: { fontSize: "17px", fontWeight: "600", color: "#1a1a1a", whiteSpace: "nowrap", minWidth: "42px" },
  givensInput: {
    width: "110px", padding: "10px 12px", boxSizing: "border-box",
    border: "2px solid #ce93d8", borderRadius: "8px", fontSize: "16px",
    fontFamily: "inherit", textAlign: "center", outline: "none",
  },
  unitSlot: {
    minWidth: "108px", minHeight: "44px", padding: "6px 8px",
    border: "2px dashed", borderRadius: "8px",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "border-color 0.15s, background 0.15s",
  },
  unitPlaceholder: { fontSize: "13px", color: "#b39ddb", fontStyle: "italic" },
  unitAssigned: {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "6px 12px", background: "#ede7f6", color: "#4527a0",
    border: "1.5px solid #b39ddb", borderRadius: "16px",
    fontSize: "15px", fontWeight: "700", cursor: "pointer",
  },
  unitClearX: { fontSize: "12px", color: "#7e57c2" },
  paletteHint: { margin: "0 0 8px", fontSize: "13px", color: "#888" },
  paletteRow: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "4px" },
  unitChip: {
    minWidth: "48px", minHeight: "44px", padding: "8px 16px",
    background: "#fff", border: "1.5px solid #ce93d8", borderRadius: "16px",
    fontSize: "15px", fontWeight: "700", color: "#6a1b9a",
    cursor: "grab", touchAction: "none", userSelect: "none",
  },

  eqList: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "6px" },
  eqOption: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "14px 16px", border: "2px solid", borderRadius: "10px",
    fontSize: "16px", transition: "border-color 0.15s, background 0.15s",
  },
  eqDot: {
    width: "18px", height: "18px", borderRadius: "50%", border: "2px solid",
    flexShrink: 0, transition: "background 0.15s, border-color 0.15s",
  },
  eqLatex: { flex: 1 },
  eqFailMark: { color: "#c62828", fontSize: "20px", fontWeight: "800", flexShrink: 0 },

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
