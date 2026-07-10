import React, { useEffect, useRef, useState } from "react";
import { logOut } from "../services/auth";
import { subscribeActiveSession, getQuestionsByIds, markSessionJoin } from "../services/firestore";
import {
  tokensForResult, saveResultWithTokens,
  subscribeStudent, formatTokens,
} from "../services/tokens";
import KaTeXRenderer from "../components/KaTeXRenderer";
import MetaBadges from "../components/MetaBadges";
import RewardsShop from "../components/RewardsShop";

// Read question type from either field name (Firestore may have either or both)
const getQType = (q) => q.questionType || q.type || "mc";
const isFitB   = (q) => getQType(q) === "fill_in_blank";
// Questions that appear in Independent Mode: guided steps, or free-form short answer
const isIndependent = (q) => (q.steps?.length ?? 0) > 0 || getQType(q) === "sa";

// Remember per-session completion locally so a page refresh after finishing
// doesn't restart the quiz (and re-write duplicate results).
// try/catch: localStorage can be unavailable on locked-down school machines.
const doneKey = (sid) => `bp-tutor-done-${sid}`;
const wasDone = (sid) => { try { return !!localStorage.getItem(doneKey(sid)); } catch { return false; } };
const markDone = (sid) => { try { localStorage.setItem(doneKey(sid), "1"); } catch {} };

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StudentPage({ user }) {
  const [session, setSession] = useState(undefined);
  const [questions, setQuestions] = useState([]);
  const [phase, setPhase] = useState("loading");
  const [studentDoc, setStudentDoc] = useState(null);
  const [view, setView] = useState("quiz"); // "quiz" | "shop"

  useEffect(() => subscribeActiveSession(setSession), []);

  // The profile doc is created/backfilled by App.js before this page mounts
  useEffect(() => subscribeStudent(user.uid, setStudentDoc), [user]);

  const sessionId = session?.id ?? null;
  useEffect(() => {
    if (!sessionId) {
      setPhase((prev) => {
        if (prev === "loading" || prev === "waiting") return "waiting";
        if (prev === "done") return "done";
        return "ended"; // teacher ended the session mid-quiz
      });
      return;
    }
    markSessionJoin(sessionId, user).catch(() => {}); // teacher's "joined" counter
    getQuestionsByIds(session.questionIds).then((qs) => {
      const ordered = session.questionIds.map((id) => qs.find((q) => q.id === id)).filter(Boolean);
      setQuestions(ordered);
      if (wasDone(sessionId)) {
        setPhase("done");
        return;
      }
      const hasGuided = ordered.some((q) => getQType(q) === "mc" || isFitB(q));
      setPhase(hasGuided ? "guided" : ordered.some(isIndependent) ? "independent" : "done");
      setView("quiz"); // pull students out of the shop when a session starts
    });
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist completion so a refresh shows the "done" screen instead of restarting
  useEffect(() => {
    if (phase === "done" && sessionId) markDone(sessionId);
  }, [phase, sessionId]);

  const guidedQuestions = questions.filter((q) => getQType(q) === "mc" || isFitB(q));
  const independentQuestions = questions.filter(isIndependent);

  const base = () => ({
    sessionId: session?.id,
    studentUid: user.uid,
    studentName: user.displayName,
    studentEmail: user.email,
  });

  // Save a single result and credit any tokens it earned in one transaction.
  // Row IDs are deterministic, so replaying a finished session (another
  // browser, cleared storage) shows the quiz UI but never re-credits tokens.
  const persistResult = (r) => {
    const question = questions.find((q) => q.id === r.questionId);
    const difficulty = question?.difficulty || "Easy";
    const tokens = tokensForResult(difficulty, r.correct === true, r.attempts ?? 1);
    return saveResultWithTokens(user, { ...base(), ...r, tokensEarned: tokens }, tokens, { difficulty })
      .catch((err) => {
        console.error("Failed to save result:", err);
        alert("Your answer could not be saved — please check your internet connection.");
      });
  };

  const handleGuidedComplete = () =>
    setPhase(independentQuestions.length > 0 ? "independent" : "done");

  const handleStepsComplete = () => setPhase("done");

  // Keep students in the quiz while it's running — the shop is for before/after
  const inQuiz = phase === "guided" || phase === "independent";
  const balance = studentDoc?.tokenBalance ?? 0;

  return (
    <div style={s.page}>
      <Header
        user={user}
        balance={balance}
        showShopToggle={!inQuiz}
        view={view}
        onToggleView={() => setView((v) => (v === "shop" ? "quiz" : "shop"))}
      />

      {view === "shop" && !inQuiz ? (
        <RewardsShop user={user} balance={balance} />
      ) : (
        <>
          {phase === "loading" && <CenteredMsg icon="⏳" text="Loading..." />}
          {phase === "waiting" && (
            <CenteredMsg icon="📋" text="Waiting for your teacher to start a session..." sub="This page will update automatically.">
              <a href="/join" style={s.joinLink}>Have a session code? Enter it here</a>
            </CenteredMsg>
          )}
          {phase === "guided" && (
            <GuidedMode
              guidedQuestions={guidedQuestions}
              hasIndependent={independentQuestions.length > 0}
              onSaveResult={persistResult}
              onComplete={handleGuidedComplete}
            />
          )}
          {phase === "independent" && (
            <StepByStepMode
              questions={independentQuestions}
              onComplete={handleStepsComplete}
              onSaveStep={persistResult}
            />
          )}
          {phase === "done" && (
            <CenteredMsg icon="✅" text="All done! Great work." sub="Your answers have been submitted to your teacher." iconColor="#2e7d32" />
          )}
          {phase === "ended" && (
            <CenteredMsg icon="🏁" text="The session has ended." sub="Answers you already submitted were saved for your teacher." />
          )}
        </>
      )}
    </div>
  );
}

// ─── Guided Mode (MC with retry + hint) ──────────────────────────────────────

function GuidedMode({ guidedQuestions, hasIndependent, onSaveResult, onComplete }) {
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [showSummary, setShowSummary] = useState(false);

  // Persist each result as soon as the question is resolved, so nothing is
  // lost if the student closes the tab or the session ends mid-quiz.
  const handleResult = (r) => {
    setResults((prev) => [...prev, r]);
    onSaveResult(r);
  };
  const handleNext = () => {
    if (idx + 1 >= guidedQuestions.length) setShowSummary(true);
    else setIdx((i) => i + 1);
  };

  if (showSummary) {
    const correct = results.filter((r) => r.correct).length;
    return (
      <div style={s.centered}>
        <div style={s.bigIcon}>🎯</div>
        <h2 style={s.summaryTitle}>Guided Mode Complete!</h2>
        <p style={s.summarySub}>You got <strong>{correct}</strong> out of <strong>{guidedQuestions.length}</strong> correct.</p>
        {hasIndependent && (
          <p style={{ ...s.summarySub, color: "#888", marginBottom: 28 }}>Now solve each problem step by step in Independent Mode.</p>
        )}
        <button onClick={() => onComplete()} style={s.primaryBtn}>
          {hasIndependent ? "Continue →" : "Finish ✓"}
        </button>
      </div>
    );
  }

  const current = guidedQuestions[idx];
  return (
    <div style={s.quizWrapper}>
      <ModeBar label="Guided Mode" current={idx + 1} total={guidedQuestions.length} color="#0f3460" />
      {isFitB(current)
        ? <FitBQuestion key={current.id} question={current} onResult={handleResult} onNext={handleNext} />
        : <GuidedQuestion key={current.id} question={current} onResult={handleResult} onNext={handleNext} />
      }
    </div>
  );
}

function GuidedQuestion({ question, onResult, onNext }) {
  const [selected, setSelected] = useState(null);
  const [attempt, setAttempt] = useState(1);
  const [status, setStatus] = useState("answering");
  const saved = useRef(false);

  const check = () => {
    if (!selected) return;
    const ok = selected === question.correctAnswer;
    if (ok) {
      if (!saved.current) { onResult({ questionId: question.id, mode: "guided", correct: true, usedHint: attempt === 2, attempts: attempt, answer: selected }); saved.current = true; }
      setStatus("correct");
    } else if (attempt === 1) {
      setStatus("wrong");
    } else {
      if (!saved.current) { onResult({ questionId: question.id, mode: "guided", correct: false, usedHint: true, attempts: 2, answer: selected }); saved.current = true; }
      setStatus("revealed");
    }
  };

  const retry = () => { setSelected(null); setAttempt(2); setStatus("answering"); };
  const isResolved = status === "correct" || status === "revealed";
  const showHint = question.hint && (status === "wrong" || (status === "answering" && attempt === 2));

  return (
    <div style={s.card}>
      <MetaBadges question={question} size="md" />
      <p style={s.qText}><KaTeXRenderer text={question.text} /></p>
      {question.imageUrl && <img src={question.imageUrl} alt="" style={s.questionImg} />}
      {status === "correct"  && <Feedback type="correct" tokens={tokensForResult(question.difficulty || "Easy", true, attempt)} />}
      {status === "wrong"    && <Feedback type="wrong" />}
      {status === "revealed" && <Feedback type="revealed" text={<><strong>{String.fromCharCode(65 + +question.correctAnswer)}.</strong> <KaTeXRenderer text={question.options[+question.correctAnswer]} /></>} />}
      {showHint && <Hint text={question.hint} />}
      {!isResolved && (
        <div style={s.optionList}>
          {question.options.map((opt, i) => {
            const sel = selected === String(i);
            return (
              <div key={i} onClick={() => status === "answering" && setSelected(String(i))}
                style={{ ...s.optionCard, borderColor: sel ? "#0f3460" : "#e0e0e0", background: sel ? "#eef1f8" : "#fff", cursor: status === "answering" ? "pointer" : "default" }}>
                <span style={{ ...s.optDot, borderColor: sel ? "#0f3460" : "#bbb", background: sel ? "#0f3460" : "transparent" }} />
                <span style={s.optLetter}>{String.fromCharCode(65 + i)}.</span>
                <KaTeXRenderer text={opt} />
              </div>
            );
          })}
        </div>
      )}
      <div style={s.btnRow}>
        {status === "answering" && <Btn onClick={check} disabled={!selected}>Check Answer</Btn>}
        {status === "wrong"     && <Btn onClick={retry}>Try Again →</Btn>}
        {isResolved             && <Btn onClick={onNext}>Next Question →</Btn>}
      </div>
    </div>
  );
}

// ─── Fill-in-the-Blank Guided Question ───────────────────────────────────────

function FitBQuestion({ question, onResult, onNext }) {
  // backward-compat: old single-answer format → blanks array
  const blanks = question.blanks ||
    (question.correctAnswer ? [{ id: 1, answer: question.correctAnswer, hint: question.hint || "" }] : []);

  // Support all possible field names the question text may have been saved under
  const questionText = question.questionText || question.text || question.body ||
    question.question || question.description || "";

  // Use 0-indexed arrays — avoids any Firestore integer/string id-matching issues
  const [answers, setAnswers] = useState(() => Array(blanks.length).fill(""));
  // null | "correct" | "wrong" | "revealed"
  const [status, setStatus] = useState(() => Array(blanks.length).fill(null));
  const [attempt, setAttempt] = useState(1);
  const [phase, setPhase] = useState("answering"); // "answering" | "retry" | "done"
  const [earnedTokens, setEarnedTokens] = useState(0);
  const saved = useRef(false);

  const normalize = (v) => v.trim().toLowerCase().replace(/\s+/g, " ");
  const matchesOne = (val, expected) => {
    const clean = (s) => normalize(s).replace(/(\d)\s+([a-z])/g, "$1$2");
    if (clean(val) === clean(expected)) return true;
    // Numeric match with the same default tolerance as independent-mode steps
    const a = parseFloat(val), b = parseFloat(expected);
    if (isNaN(a) || isNaN(b)) return false;
    const diff = Math.abs(a - b);
    return diff <= 0.01 || diff / (Math.abs(b) || 1) <= 0.01;
  };
  // A blank may list several accepted answers separated by "|", e.g. "a|b"
  const matchesAnswer = (val, expected) =>
    String(expected).split("|").some((alt) => matchesOne(val, alt));

  const handleAnswerChange = (idx, value) => {
    if (status[idx] === "correct") return;
    setAnswers(prev => { const next = [...prev]; next[idx] = value; return next; });
  };

  const check = () => {
    const prevStatus = status;
    const nextStatus = [...prevStatus];
    blanks.forEach((blank, idx) => {
      if (nextStatus[idx] === "correct") return;
      const ok = matchesAnswer(answers[idx] || "", blank.answer);
      nextStatus[idx] = ok ? "correct" : (attempt < 2 ? "wrong" : "revealed");
    });
    setStatus(nextStatus);

    const anyWrong = nextStatus.some(s => s === "wrong");
    if (anyWrong) {
      setAttempt(2);
      setPhase("retry");
    } else {
      if (!saved.current) {
        saved.current = true;
        let earned = 0;
        blanks.forEach((blank, idx) => {
          const isCorrect = nextStatus[idx] === "correct";
          const thisAttempt = prevStatus[idx] === "correct" ? 1 : attempt;
          earned += tokensForResult(question.difficulty || "Easy", isCorrect, thisAttempt);
          onResult({
            questionId: question.id,
            blankId: blank.id ?? (idx + 1),
            mode: "guided",
            correct: isCorrect,
            usedHint: thisAttempt === 2,
            attempts: thisAttempt,
            answer: answers[idx] || "",
          });
        });
        setEarnedTokens(earned);
      }
      setPhase("done");
    }
  };

  const wrongIndices = status.reduce((acc, s, i) => (s === "wrong" ? [...acc, i] : acc), []);
  const correctCount = status.filter(s => s === "correct").length;
  const allAnswered = answers.every((a, i) => status[i] === "correct" || a.trim());

  return (
    <div style={s.card}>
      <MetaBadges question={question} size="md" />
      {question.imageUrl && <img src={question.imageUrl} alt="" style={s.questionImg} />}
      <FitBInline
        text={questionText}
        blanks={blanks}
        answers={answers}
        status={status}
        onChange={handleAnswerChange}
      />

      {wrongIndices.filter(i => blanks[i]?.hint).map(i => (
        <Hint key={i} text={`[${i + 1}] ${blanks[i].hint}`} />
      ))}

      {phase === "retry" && (
        <div style={{ ...s.feedback, background: "#fff3e0", color: "#e65100" }}>
          ❌ {wrongIndices.length} blank{wrongIndices.length !== 1 ? "s" : ""} incorrect — fix them and try again.
        </div>
      )}
      {phase === "done" && (
        <div style={{ ...s.feedback, background: correctCount === blanks.length ? "#e8f5e9" : "#f3e5f5", color: correctCount === blanks.length ? "#2e7d32" : "#6a1b9a" }}>
          {correctCount === blanks.length ? "✅ All correct! Well done!" : `✅ ${correctCount} / ${blanks.length} correct`}
          {earnedTokens > 0 && <span style={s.tokenEarned}> +{formatTokens(earnedTokens)} 🪙</span>}
        </div>
      )}

      <div style={s.btnRow}>
        {phase !== "done" && (
          <Btn onClick={check} disabled={!allAnswered}>
            {phase === "retry" ? "Try Again →" : "Check Answer"}
          </Btn>
        )}
        {phase === "done" && <Btn onClick={onNext}>Next Question →</Btn>}
      </div>
    </div>
  );
}

// Renders question text with [1], [2], [3] replaced by inline input boxes.
// Falls back to a numbered list if text is empty or has no [N] markers.
// Uses 0-indexed arrays: [N] in text → blanks[N-1], answers[N-1], status[N-1].
function FitBInline({ text, blanks, answers, status, onChange }) {
  const safeText = text || "";
  const hasMarkers = /\[\d+\]/.test(safeText);

  const blankInput = (idx, key) => {
    const blank = blanks[idx];
    const st = status[idx];
    const locked = st === "correct" || st === "revealed";
    // On reveal, show only the first accepted alternative ("a|b" → "a")
    const displayValue = st === "revealed" ? String(blank.answer).split("|")[0] : (answers[idx] || "");
    // Size the box to the expected answer (but never below a comfortable tap
    // target) so short answers keep equations on one line on phones. Grows
    // if the student types more than expected.
    const expectedLen = String(blank.answer || "").split("|")[0].trim().length;
    const typedLen = (answers[idx] || "").length;
    const chars = Math.max(expectedLen, typedLen);
    const width = Math.min(170, Math.max(44, 30 + chars * 11));
    const borderColor = st === "correct" ? "#2e7d32"
      : (st === "wrong" || st === "revealed") ? "#c62828" : "#0f3460";
    const bgColor = st === "correct" ? "#e8f5e9"
      : (st === "wrong" || st === "revealed") ? "#fce4ec" : "#eef1f8";
    const textColor = st === "correct" ? "#2e7d32"
      : st === "revealed" ? "#c62828" : "#1a1a1a";
    return (
      <input
        key={key}
        type="text"
        value={displayValue}
        onChange={(e) => !locked && onChange(idx, e.target.value)}
        readOnly={locked}
        placeholder="____"
        style={{
          display: "inline-block",
          boxSizing: "border-box",
          width: `${width}px`,
          margin: "0 4px",
          padding: "3px 8px",
          border: "none",
          borderBottom: `2px solid ${borderColor}`,
          background: bgColor,
          borderRadius: "4px 4px 0 0",
          fontSize: "15px",
          fontFamily: "inherit",
          outline: "none",
          textAlign: "center",
          verticalAlign: "middle",
          color: textColor,
          fontWeight: locked ? "700" : "400",
          transition: "border-color 0.2s, background 0.2s",
        }}
      />
    );
  };

  // Text has inline [N] markers — render text with inputs embedded in the line
  if (hasMarkers) {
    const parts = safeText.split(/(\[\d+\])/g);
    return (
      <p style={{ fontSize: "18px", lineHeight: "2.6", margin: "0 0 20px", color: "#1a1a1a", whiteSpace: "pre-line" }}>
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const idx = parseInt(match[1], 10) - 1; // [N] is 1-based, array is 0-based
            if (idx < 0 || idx >= blanks.length)
              return <span key={i} style={{ color: "#bbb" }}>{part}</span>;
            return blankInput(idx, i);
          }
          return part ? <KaTeXRenderer key={i} text={part} /> : null;
        })}
      </p>
    );
  }

  // Fallback: show question text (if any) then a numbered list of blank inputs below
  return (
    <div style={{ marginBottom: "20px" }}>
      {safeText ? (
        <p style={{ fontSize: "18px", lineHeight: "1.7", margin: "0 0 16px", color: "#1a1a1a", whiteSpace: "pre-line" }}>
          <KaTeXRenderer text={safeText} />
        </p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {blanks.map((_, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontWeight: "700", color: "#6a1b9a", minWidth: "28px", fontSize: "15px" }}>
              [{idx + 1}]
            </span>
            {blankInput(idx, `fallback-${idx}`)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Independent Mode ─────────────────────────────────────────────────────────

function StepByStepMode({ questions, onComplete, onSaveStep }) {
  const [qIdx, setQIdx] = useState(0);
  const [allResults, setAllResults] = useState([]);
  const [showSummary, setShowSummary] = useState(false);

  const handleQDone = (results) => {
    const merged = [...allResults, ...results];
    setAllResults(merged);
    if (qIdx + 1 >= questions.length) {
      setShowSummary(true);
    } else {
      setQIdx((i) => i + 1);
    }
  };

  if (showSummary || questions.length === 0) {
    return <StepSummary results={allResults} questions={questions} onFinish={onComplete} />;
  }

  const current = questions[qIdx];
  return (
    <div style={s.quizWrapper}>
      <ModeBar label="Independent Mode" current={qIdx + 1} total={questions.length} color="#6a1b9a" />
      {(current.steps?.length ?? 0) > 0
        ? <QuestionStepper key={current.id} question={current} onDone={handleQDone} onSaveStep={onSaveStep} />
        : <SimpleAnswer key={current.id} question={current} onDone={handleQDone} onSave={onSaveStep} />
      }
    </div>
  );
}

// ─── QuestionStepper: one question with steps ─────────────────────────────────

// 3-type answer matching:
//   Type 1 — exact text (case-insensitive, trimmed)
//   Type 2 — numeric with per-step tolerance + unit stripping
//   Type 3 — LaTeX formula (remove spaces, normalize ÷/×)
// The expected answer may list alternatives separated by "|", e.g. "√5|sqrt5|2.24"
function matchStep(val, step) {
  const tol = typeof step.tolerance === "number" && step.tolerance >= 0 ? step.tolerance : 0.01;
  return String(step.correctAnswer || "")
    .split("|")
    .some((alt) => matchStepOne(val, alt, tol));
}

// Parse "6 N", "5cm", "$5" as numbers, but NOT expressions like "a^2+4" or
// surds like "√5" — stripping those to digits caused false accepts.
function parseStepNum(v) {
  const t = v.trim();
  const direct = parseFloat(t);
  if (!isNaN(direct) && /^-?[\d.]/.test(t)) return direct;
  const m = t.match(/^[^\d\-.√^+=*/]{0,3}(-?\d+(?:\.\d+)?)\s*[a-zA-Z°%ก-๙.]*$/);
  return m ? parseFloat(m[1]) : NaN;
}

function matchStepOne(val, expected, tol) {
  const norm = v => v.trim().toLowerCase().replace(/\s+/g, " ");
  if (norm(val) === norm(expected)) return true;

  const normF = v => v.replace(/\s/g, "").replace(/÷/g, "/").replace(/×/g, "*").toLowerCase();
  if (val.trim() && normF(val) === normF(expected)) return true;

  const a = parseStepNum(val), b = parseStepNum(expected);
  if (!isNaN(a) && !isNaN(b)) {
    const diff = Math.abs(a - b);
    if (diff <= tol || diff / (Math.abs(b) || 1) <= tol) return true;
  }

  return false;
}

function QuestionStepper({ question, onDone, onSaveStep }) {
  const steps = question.steps || [];
  const [stepIdx, setStepIdx]   = useState(0);
  const [input, setInput]       = useState("");
  const [attempt, setAttempt]   = useState(1);
  const [status, setStatus]     = useState("answering");
  const [stepResults, setStepResults] = useState([]);
  const inputRef = useRef(null);

  const currentStep = steps[stepIdx];

  const check = () => {
    if (!input.trim()) return;
    const ok = matchStep(input, currentStep);

    if (ok) {
      const r = { questionId: question.id, stepId: currentStep.id, stepOrder: stepIdx + 1,
        mode: "independent", correct: true, usedHint: attempt === 2, attempts: attempt, studentAnswer: input.trim() };
      onSaveStep(r);
      setStepResults(prev => [...prev, r]);
      setStatus("correct");
    } else if (attempt === 1) {
      setAttempt(2);
      setStatus("wrong");
    } else {
      const r = { questionId: question.id, stepId: currentStep.id, stepOrder: stepIdx + 1,
        mode: "independent", correct: false, usedHint: true, attempts: 2, studentAnswer: input.trim() };
      onSaveStep(r);
      setStepResults(prev => [...prev, r]);
      setStatus("revealed");
    }
  };

  const nextStep = () => {
    const newIdx = stepIdx + 1;
    if (newIdx >= steps.length) {
      onDone(stepResults);
    } else {
      setStepIdx(newIdx);
      setInput("");
      setAttempt(1);
      setStatus("answering");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const isResolved = status === "correct" || status === "revealed";
  const showHint = currentStep.hint && (status === "wrong" || (status === "answering" && attempt === 2));
  const doneCount = stepResults.length;
  const correctCount = stepResults.filter(r => r.correct).length;

  return (
    <>
      {/* Original question context */}
      <div style={s.questionContext}>
        <span style={s.contextLabel}>Question</span>
        <MetaBadges question={question} size="sm" />
        <KaTeXRenderer text={question.text} />
        {question.imageUrl && <img src={question.imageUrl} alt="" style={s.questionImg} />}
      </div>

      {/* Step progress header: dots + step count + running score */}
      <div style={s.stepHeader}>
        <div style={s.stepDots}>
          {steps.map((_, i) => (
            <span key={i} style={{
              ...s.stepDot,
              background: i < stepIdx ? "#2e7d32" : i === stepIdx ? "#6a1b9a" : "#ddd",
            }} />
          ))}
        </div>
        <span style={s.stepCount}>Step {stepIdx + 1} of {steps.length}</span>
        {doneCount > 0 && (
          <span style={s.runningScore}>{correctCount}/{doneCount} ✓</span>
        )}
      </div>

      <div style={s.card}>
        <p style={s.stepInstruction}><KaTeXRenderer text={currentStep.instruction} /></p>

        {status === "correct"  && <Feedback type="correct" tokens={tokensForResult(question.difficulty || "Easy", true, attempt)} />}
        {status === "wrong"    && <Feedback type="wrong" />}
        {status === "revealed" && (
          <Feedback type="revealed" text={
            <>Correct answer: <strong><KaTeXRenderer text={currentStep.correctAnswer} /></strong></>
          } />
        )}
        {showHint && <Hint text={currentStep.hint} />}

        {!isResolved && (
          <input
            ref={inputRef}
            style={s.stepInput}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="Type your answer…"
            autoFocus
          />
        )}

        <div style={s.btnRow}>
          {status === "answering" && <Btn disabled={!input.trim()} onClick={check} color="#6a1b9a">Check ✓</Btn>}
          {status === "wrong" && (
            <Btn onClick={() => { setStatus("answering"); setTimeout(() => inputRef.current?.focus(), 50); }} color="#6a1b9a">
              Try Again →
            </Btn>
          )}
          {isResolved && (
            <Btn onClick={nextStep} color="#6a1b9a">
              {stepIdx + 1 < steps.length ? "Next Step →" : "Finish →"}
            </Btn>
          )}
        </div>
      </div>
    </>
  );
}

// ─── SimpleAnswer: question without steps ─────────────────────────────────────

function SimpleAnswer({ question, onDone, onSave }) {
  const [input, setInput] = useState("");

  const submit = () => {
    if (!input.trim()) return;
    const r = { questionId: question.id, stepId: null, mode: "independent", correct: null, usedHint: false, attempts: 1, answer: input.trim() };
    onSave(r);
    onDone([r]);
  };

  return (
    <>
      <div style={s.questionContext}>
        <span style={s.contextLabel}>Question</span>
        <MetaBadges question={question} size="sm" />
        <KaTeXRenderer text={question.text} />
        {question.imageUrl && <img src={question.imageUrl} alt="" style={s.questionImg} />}
      </div>
      <div style={s.card}>
        <p style={{ ...s.stepInstruction, color: "#888", fontStyle: "italic" }}>Write your answer in your own words.</p>
        <textarea
          style={s.textarea}
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer here…"
          autoFocus
        />
        <div style={s.btnRow}>
          <Btn disabled={!input.trim()} onClick={submit} color="#1565c0">Submit Answer →</Btn>
        </div>
      </div>
    </>
  );
}

// ─── Step Summary ─────────────────────────────────────────────────────────────

function StepSummary({ results, questions, onFinish }) {
  const stepResults = results.filter((r) => r.stepId !== null);
  const totalSteps = stepResults.length;
  const correctSteps = stepResults.filter((r) => r.correct).length;
  const hintSteps = stepResults.filter((r) => r.usedHint).length;

  return (
    <div style={s.summaryWrapper}>
      <div style={s.bigIcon}>🎉</div>
      <h2 style={s.summaryTitle}>Independent Mode Complete!</h2>

      <div style={s.scoreBox}>
        <div style={s.scoreNum}>{correctSteps}<span style={s.scoreDen}>/{totalSteps}</span></div>
        <div style={s.scoreLabel}>steps correct</div>
      </div>

      {totalSteps > 0 && (
        <div style={s.statRow}>
          <span style={s.statItem}>✅ {correctSteps} correct</span>
          <span style={s.statItem}>💡 {hintSteps} needed a hint</span>
          <span style={s.statItem}>❌ {totalSteps - correctSteps} missed</span>
        </div>
      )}

      {/* Per-question breakdown */}
      <div style={s.breakdown}>
        {questions.map((q) => {
          const qSteps = stepResults.filter((r) => r.questionId === q.id);
          const qFree = results.filter((r) => r.questionId === q.id && r.stepId === null);
          return (
            <div key={q.id} style={s.breakdownCard}>
              <p style={s.breakdownQ}><KaTeXRenderer text={q.text} /></p>
              {qSteps.length > 0 ? (
                <div style={s.stepList}>
                  {(q.steps || []).map((step, i) => {
                    const r = qSteps.find((x) => x.stepId === step.id);
                    return (
                      <div key={step.id} style={s.stepRow}>
                        <span style={{ color: r?.correct ? "#2e7d32" : "#c62828" }}>
                          {r?.correct ? "✅" : "❌"}
                        </span>
                        <span style={s.stepRowText}>
                          Step {i + 1}: <KaTeXRenderer text={step.instruction} />
                          {r?.usedHint && <span style={s.hintTag}> 💡</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : qFree.length > 0 ? (
                <p style={s.freeAnswer}>Your answer: <em>{qFree[0].answer}</em></p>
              ) : null}
            </div>
          );
        })}
      </div>

      <button onClick={onFinish} style={{ ...s.primaryBtn, marginTop: 8 }}>Finish ✓</button>
    </div>
  );
}

// ─── Shared small components ──────────────────────────────────────────────────

function Feedback({ type, text, tokens }) {
  const cfg = {
    correct:  { bg: "#e8f5e9", color: "#2e7d32", msg: "✅ Correct!" },
    wrong:    { bg: "#fff3e0", color: "#e65100", msg: "❌ Not quite — try again!" },
    revealed: { bg: "#fce4ec", color: "#c62828", msg: null },
  }[type];
  return (
    <div style={{ ...s.feedback, background: cfg.bg, color: cfg.color }}>
      {cfg.msg ?? text}
      {tokens > 0 && <span style={s.tokenEarned}> +{formatTokens(tokens)} 🪙</span>}
    </div>
  );
}

function Hint({ text }) {
  return <div style={s.hint}>💡 <strong>Hint:</strong> <KaTeXRenderer text={text} /></div>;
}

function Btn({ children, onClick, disabled, color = "#0f3460" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...s.primaryBtn, background: color, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      {children}
    </button>
  );
}

function Header({ user, balance, showShopToggle, view, onToggleView }) {
  return (
    <div style={s.header}>
      <div>
        <h1 style={s.title}>B &amp; P Tutor</h1>
        <p style={s.role}>Student</p>
      </div>
      <div style={s.userInfo}>
        <span style={s.tokenChip} title="Your tokens">🪙 {formatTokens(balance)}</span>
        {showShopToggle && (
          <button onClick={onToggleView} style={s.shopBtn}>
            {view === "shop" ? "← Quiz" : "🎁 Rewards"}
          </button>
        )}
        {user.photoURL && <img src={user.photoURL} alt="" style={s.avatar} />}
        <div>
          <p style={s.name}>{user.displayName}</p>
          <button onClick={logOut} style={s.signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function ModeBar({ label, current, total, color }) {
  return (
    <div style={s.modeBar}>
      <span style={{ ...s.modeLabel, color }}>{label}</span>
      <div style={s.modeDots}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} style={{ ...s.modeDot, background: i < current ? color : "#ddd" }} />
        ))}
      </div>
      <span style={s.modeCount}>{current} / {total}</span>
    </div>
  );
}

function CenteredMsg({ icon, text, sub, iconColor = "#888", children }) {
  return (
    <div style={s.centered}>
      <div style={{ fontSize: 52, marginBottom: 12, color: iconColor }}>{icon}</div>
      <p style={s.centeredText}>{text}</p>
      {sub && <p style={s.centeredSub}>{sub}</p>}
      {children && <div style={{ marginTop: 20 }}>{children}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  header: { background: "#1565c0", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { margin: 0, fontSize: "20px", fontWeight: "700" },
  role: { margin: "4px 0 0", fontSize: "11px", opacity: 0.65, textTransform: "uppercase", letterSpacing: "1px" },
  userInfo: { display: "flex", alignItems: "center", gap: "12px" },
  avatar: { width: "36px", height: "36px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" },
  name: { margin: 0, fontSize: "14px" },
  signOut: { marginTop: "4px", padding: "2px 10px", fontSize: "12px", background: "transparent", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: "4px", cursor: "pointer" },
  tokenChip: {
    display: "inline-flex", alignItems: "center", gap: "5px",
    background: "rgba(255,255,255,0.18)", borderRadius: "18px",
    padding: "5px 14px", fontSize: "15px", fontWeight: "700", whiteSpace: "nowrap",
  },
  shopBtn: {
    padding: "6px 14px", background: "#fff", color: "#1565c0",
    border: "none", borderRadius: "18px", cursor: "pointer",
    fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap",
  },

  centered: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", textAlign: "center", padding: "24px" },
  centeredText: { fontSize: "20px", color: "#333", margin: "0 0 8px", fontWeight: "600" },
  centeredSub: { fontSize: "14px", color: "#888", margin: 0 },
  joinLink: { color: "#1565c0", fontSize: "14px" },

  quizWrapper: { maxWidth: "640px", margin: "0 auto", padding: "24px 20px" },
  modeBar: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" },
  modeLabel: { fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" },
  modeDots: { display: "flex", gap: "4px", flex: 1 },
  modeDot: { width: "10px", height: "10px", borderRadius: "50%", transition: "background 0.3s" },
  modeCount: { fontSize: "13px", color: "#888", fontWeight: "600" },

  card: { background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  qText: { margin: "0 0 20px", fontSize: "18px", lineHeight: "1.7", color: "#1a1a1a", whiteSpace: "pre-line" },

  questionContext: { background: "#fff", border: "1px solid #e0e0e0", borderRadius: "10px", padding: "14px 18px", marginBottom: "12px", fontSize: "15px", lineHeight: "1.7" },
  contextLabel: { display: "block", fontSize: "10px", fontWeight: "700", color: "#6a1b9a", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" },

  stepHeader: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" },
  stepDots: { display: "flex", gap: "5px", alignItems: "center" },
  stepDot: { width: "12px", height: "12px", borderRadius: "50%", transition: "background 0.3s" },
  stepCount: { fontSize: "13px", color: "#6a1b9a", fontWeight: "700" },
  runningScore: { marginLeft: "auto", fontSize: "12px", color: "#6a1b9a", fontWeight: "700", background: "#f3e5f5", padding: "2px 10px", borderRadius: "20px", whiteSpace: "nowrap" },

  stepInstruction: { margin: "0 0 20px", fontSize: "17px", lineHeight: "1.7", color: "#1a1a1a", fontWeight: "500" },
  stepInput: { width: "100%", padding: "12px 14px", border: "2px solid #ce93d8", borderRadius: "8px", fontSize: "16px", fontFamily: "inherit", boxSizing: "border-box", marginBottom: "16px", outline: "none" },

  feedback: { padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontSize: "15px", fontWeight: "600", lineHeight: "1.5" },
  tokenEarned: { marginLeft: "8px", background: "#fff8e1", color: "#b26a00", borderRadius: "12px", padding: "2px 10px", fontSize: "13px", fontWeight: "700", whiteSpace: "nowrap" },
  hint: { padding: "12px 16px", background: "#fff8e1", borderLeft: "3px solid #f9a825", borderRadius: "6px", marginBottom: "16px", fontSize: "14px", color: "#5d4037" },

  optionList: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" },
  optionCard: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", border: "2px solid", borderRadius: "8px", fontSize: "15px", lineHeight: "1.5", transition: "border-color 0.15s, background 0.15s" },
  optDot: { width: "18px", height: "18px", borderRadius: "50%", border: "2px solid", flexShrink: 0, transition: "background 0.15s, border-color 0.15s" },
  optLetter: { fontWeight: "700", color: "#555", flexShrink: 0, width: "20px" },

  btnRow: { display: "flex", justifyContent: "flex-end", marginTop: "8px" },
  primaryBtn: { padding: "11px 28px", background: "#0f3460", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: "700", cursor: "pointer", transition: "opacity 0.15s" },

  textarea: { width: "100%", padding: "12px 14px", border: "1.5px solid #ddd", borderRadius: "8px", fontSize: "15px", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: "16px", minHeight: "100px" },

  summaryWrapper: { maxWidth: "640px", margin: "0 auto", padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  bigIcon: { fontSize: "56px", marginBottom: "12px" },
  summaryTitle: { margin: "0 0 8px", fontSize: "26px", color: "#1a1a1a" },
  summarySub: { margin: "0 0 8px", fontSize: "16px", color: "#555" },
  scoreBox: { background: "#f3e5f5", borderRadius: "16px", padding: "20px 40px", marginBottom: "16px" },
  scoreNum: { fontSize: "48px", fontWeight: "800", color: "#6a1b9a", lineHeight: 1 },
  scoreDen: { fontSize: "28px", fontWeight: "400", color: "#9c4dcc" },
  scoreLabel: { fontSize: "14px", color: "#7b1fa2", fontWeight: "600", marginTop: "4px" },
  statRow: { display: "flex", gap: "20px", marginBottom: "28px", flexWrap: "wrap", justifyContent: "center" },
  statItem: { fontSize: "14px", color: "#555" },

  breakdown: { width: "100%", display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px", textAlign: "left" },
  breakdownCard: { background: "#fff", borderRadius: "10px", padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  breakdownQ: { margin: "0 0 10px", fontSize: "14px", color: "#333", lineHeight: "1.6" },
  stepList: { display: "flex", flexDirection: "column", gap: "6px" },
  stepRow: { display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px" },
  stepRowText: { color: "#444", lineHeight: "1.5" },
  hintTag: { fontSize: "12px" },
  freeAnswer: { margin: 0, fontSize: "13px", color: "#666" },
  questionImg: { display: "block", maxWidth: "100%", borderRadius: "6px", marginTop: "12px", border: "1px solid #eee" },
};
