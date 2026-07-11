import React, { useEffect, useState } from "react";
import { logOut } from "../services/auth";
import {
  addQuestion,
  updateQuestion,
  subscribeQuestions,
  deleteQuestion,
  startSession,
  endSession,
  subscribeActiveSession,
  subscribeResults,
  migrateGrades,
} from "../services/firestore";
import { deleteQuestionImage } from "../services/storageService";
import KaTeXRenderer from "../components/KaTeXRenderer";
import QuestionForm from "../components/QuestionForm";
import LiveResults from "../components/LiveResults";
import RewardsAdmin from "../components/RewardsAdmin";
import StudentRankings from "../components/StudentRankings";
import MetaBadges, { normalizeGrade } from "../components/MetaBadges";
import { chaptersFor, normalizeChapter } from "../services/chapters";
import SessionQRModal from "../components/SessionQRModal";
import { subscribeAllRequests } from "../services/tokens";

export default function TeacherPage({ user }) {
  const [questions, setQuestions] = useState([]);
  const [activeSession, setActiveSession] = useState(undefined);
  const [results, setResults] = useState([]);
  const [tab, setTab] = useState("questions");
  const [showQR, setShowQR] = useState(false);
  const [redemptionRequests, setRedemptionRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
  const [filterGrade,      setFilterGrade]      = useState("All");
  const [filterSubject,    setFilterSubject]    = useState("All");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [filterType,       setFilterType]       = useState("All");
  const [filterChapter,    setFilterChapter]    = useState("All");

  useEffect(() => {
    const unsubQ = subscribeQuestions(setQuestions);
    const unsubS = subscribeActiveSession(setActiveSession);
    const unsubR = subscribeAllRequests(setRedemptionRequests);
    return () => { unsubQ(); unsubS(); unsubR(); };
  }, []);

  const pendingRedemptions = redemptionRequests.filter((r) => r.status === "pending").length;

  // When session starts, auto-switch to results tab and subscribe to responses
  const sessionId = activeSession?.id ?? null;
  useEffect(() => {
    if (!sessionId) {
      setResults([]);
      setTab("questions");
      setShowQR(false);
      return;
    }
    setTab("results");
    return subscribeResults(sessionId, setResults);
  }, [sessionId]);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleEdit = (q) => {
    setEditingQuestion(q);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingQuestion(null);
  };

  const handleSaveQuestion = (form) =>
    editingQuestion
      ? updateQuestion(editingQuestion.id, form)
      : addQuestion(form);

  const handleDelete = async (q) => {
    if (!window.confirm("Delete this question?")) return;
    await deleteQuestion(q.id);
    if (q.imagePath) deleteQuestionImage(q.imagePath);
    setSelected((prev) => { const n = new Set(prev); n.delete(q.id); return n; });
  };

  const handleStartSession = async () => {
    if (selected.size === 0) return;
    await startSession([...selected]);
    setSelected(new Set());
    setShowQR(true); // project the join QR as soon as the session begins
  };

  const handleEndSession = async () => {
    if (activeSession) await endSession(activeSession.id);
  };

  const needsGradeMigration = questions.some(q => ["7", "8", "9"].includes(q.grade));
  const handleMigrateGrades = async () => {
    await migrateGrades();
  };

  // Chapter options track the currently selected grade + subject filters
  const chapterOptions = chaptersFor(questions, filterGrade, filterSubject);
  const hasUncategorized = questions.some((q) => !normalizeChapter(q.chapter));

  // If narrowing grade/subject removed the selected chapter, fall back to All
  useEffect(() => {
    if (filterChapter !== "All" && filterChapter !== "Uncategorized" && !chapterOptions.includes(filterChapter)) {
      setFilterChapter("All");
    }
  }, [filterChapter, chapterOptions]);

  const filteredQuestions = questions.filter(q =>
    (filterGrade      === "All" || normalizeGrade(q.grade) === filterGrade)          &&
    (filterSubject    === "All" || (q.subject    || "Science") === filterSubject)     &&
    (filterDifficulty === "All" || (q.difficulty || "Easy") === filterDifficulty)    &&
    (filterType       === "All" || (q.questionType || q.type || "mc") === filterType) &&
    (filterChapter    === "All" ||
      (filterChapter === "Uncategorized"
        ? !normalizeChapter(q.chapter)
        : normalizeChapter(q.chapter) === filterChapter))
  );

  const allExpanded = filteredQuestions.length > 0 && filteredQuestions.every((q) => expanded.has(q.id));
  const toggleExpandAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(questions.map((q) => q.id)));

  return (
    <div style={s.page}>
      <Header user={user} />

      <SessionBanner
        session={activeSession}
        selected={selected}
        onStart={handleStartSession}
        onEnd={handleEndSession}
        onShowQR={() => setShowQR(true)}
      />

      {showQR && activeSession && (
        <SessionQRModal session={activeSession} onClose={() => setShowQR(false)} />
      )}

      <div style={s.main}>
        {/* Tabs */}
        <div style={s.tabs}>
          <button
            onClick={() => setTab("questions")}
            style={{ ...s.tab, ...(tab === "questions" ? s.tabActive : {}) }}
          >
            Question Bank
            <span style={s.tabCount}>{questions.length}</span>
          </button>
          {activeSession && (
            <button
              onClick={() => setTab("results")}
              style={{ ...s.tab, ...(tab === "results" ? s.tabActive : {}) }}
            >
              Live Results
              <span style={{ ...s.tabCount, background: "#e8f5e9", color: "#2e7d32" }}>
                {new Set(results.map((r) => r.studentUid)).size}
              </span>
            </button>
          )}
          <button
            onClick={() => setTab("rewards")}
            style={{ ...s.tab, ...(tab === "rewards" ? s.tabActive : {}) }}
          >
            Rewards
            {pendingRedemptions > 0 && (
              <span style={{ ...s.tabCount, background: "#fff3e0", color: "#e65100" }}>
                {pendingRedemptions}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("rankings")}
            style={{ ...s.tab, ...(tab === "rankings" ? s.tabActive : {}) }}
          >
            🏆 Rankings
          </button>
        </div>

        {/* Question Bank tab */}
        {tab === "questions" && (
          <>
            <div style={s.toolbar}>
              <span style={s.sectionTitle}>
                {activeSession
                  ? "Session in progress — questions locked"
                  : "Select questions, then start a session"}
              </span>
              <button onClick={() => { setEditingQuestion(null); setShowForm(true); }} style={s.newBtn}>
                + New Question
              </button>
            </div>

            {/* Filter bar */}
            <div style={s.filterBar}>
              <FilterSelect label="Grade"      value={filterGrade}      onChange={setFilterGrade}
                options={["All", "M.1", "M.2", "M.3"]} display={v => v === "All" ? "All Grades" : v} />
              <FilterSelect label="Subject"    value={filterSubject}    onChange={setFilterSubject}
                options={["All", "Math", "Science"]} display={v => v === "All" ? "All Subjects" : v} />
              <FilterSelect label="Difficulty" value={filterDifficulty} onChange={setFilterDifficulty}
                options={["All", "Easy", "Medium", "Hard"]} display={v => v === "All" ? "All Levels" : v} />
              <FilterSelect label="Type"       value={filterType}       onChange={setFilterType}
                options={["All", "mc", "fill_in_blank", "sa"]}
                display={v => v === "All" ? "All Types" : v === "mc" ? "Multiple Choice" : v === "sa" ? "Short Answer" : "Fill in the Blank"} />
              <FilterSelect label="Chapter"    value={filterChapter}    onChange={setFilterChapter}
                options={["All", ...chapterOptions, ...(hasUncategorized ? ["Uncategorized"] : [])]}
                display={v => v === "All" ? "All Chapters" : v} />
              {(filterGrade !== "All" || filterSubject !== "All" || filterDifficulty !== "All" || filterType !== "All" || filterChapter !== "All") && (
                <button onClick={() => { setFilterGrade("All"); setFilterSubject("All"); setFilterDifficulty("All"); setFilterType("All"); setFilterChapter("All"); }} style={s.clearFilter}>
                  ✕ Clear filters
                </button>
              )}
              <span style={s.filterCount}>
                {filteredQuestions.length} / {questions.length} questions
              </span>
              {filteredQuestions.length > 0 && (
                <button onClick={toggleExpandAll} style={s.expandAllBtn}>
                  {allExpanded ? "▴ Collapse all" : "▾ Expand all"}
                </button>
              )}
            </div>

            {needsGradeMigration && (
              <div style={s.migrationBanner}>
                <span>Some questions use old grade labels (7/8/9). Click to update them to M.1/M.2/M.3.</span>
                <button onClick={handleMigrateGrades} style={s.migrateBtn}>Migrate Grade Labels</button>
              </div>
            )}

            {questions.length === 0 ? (
              <EmptyState onNew={() => setShowForm(true)} />
            ) : filteredQuestions.length === 0 ? (
              <p style={s.noMatch}>No questions match the current filters.</p>
            ) : (
              <div style={s.list}>
                {filteredQuestions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    selected={selected.has(q.id)}
                    disabled={!!activeSession}
                    locked={!!activeSession?.questionIds?.includes(q.id)}
                    expanded={expanded.has(q.id)}
                    onToggle={() => toggleSelect(q.id)}
                    onToggleExpand={() => toggleExpand(q.id)}
                    onEdit={() => handleEdit(q)}
                    onDelete={() => handleDelete(q)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Live Results tab */}
        {tab === "results" && activeSession && (
          <LiveResults
            questions={questions}
            results={results}
            sessionQuestionIds={activeSession.questionIds}
          />
        )}

        {/* Rewards tab */}
        {tab === "rewards" && (
          <RewardsAdmin teacherUid={user.uid} requests={redemptionRequests} />
        )}

        {/* Rankings tab */}
        {tab === "rankings" && <StudentRankings />}
      </div>

      {showForm && (
        <QuestionForm
          onSave={handleSaveQuestion}
          onClose={handleCloseForm}
          questions={questions}
          initialData={editingQuestion}
        />
      )}
    </div>
  );
}

function Header({ user }) {
  return (
    <div style={s.header}>
      <div>
        <h1 style={s.title}>B &amp; P Tutor</h1>
        <p style={s.role}>Teacher Dashboard</p>
      </div>
      <div style={s.userInfo}>
        {user.photoURL && <img src={user.photoURL} alt="" style={s.avatar} />}
        <div>
          <p style={s.name}>{user.displayName}</p>
          <button onClick={logOut} style={s.signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

function SessionBanner({ session, selected, onStart, onEnd, onShowQR }) {
  if (session === undefined) return null;

  if (session) {
    return (
      <div style={{ ...s.banner, background: "#1b5e20" }}>
        <span>
          🟢 Session Active — {session.questionIds.length} question
          {session.questionIds.length !== 1 ? "s" : ""} sent to students
          {session.joinCode && <span style={s.bannerCode}> · Code: {session.joinCode}</span>}
        </span>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onShowQR} style={s.qrBtn}>▦ Show QR</button>
          <button onClick={onEnd} style={s.endBtn}>■ End Session</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...s.banner, background: "#37474f" }}>
      <span style={{ color: "#cfd8dc" }}>
        {selected.size > 0
          ? `${selected.size} question${selected.size !== 1 ? "s" : ""} selected`
          : "Tick questions below, then start a session"}
      </span>
      <button
        onClick={onStart}
        disabled={selected.size === 0}
        style={{ ...s.startBtn, opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}
      >
        ▶ Start Session
      </button>
    </div>
  );
}

function QuestionCard({ question, selected, disabled, locked, expanded, onToggle, onToggleExpand, onEdit, onDelete }) {
  return (
    <div style={{ ...s.card, borderLeft: selected ? "4px solid #0f3460" : "4px solid transparent" }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        style={s.checkbox}
      />
      <div style={{ ...s.cardBody, cursor: "pointer" }} onClick={onToggleExpand}>
        <MetaBadges question={question} chapterBadge />
        {(question.steps?.length ?? 0) > 0 && (
          <span style={s.stepsChip} title="Students solve these steps in Independent Mode after Guided Mode">
            🪜 {question.steps.length} solution step{question.steps.length !== 1 ? "s" : ""}
          </span>
        )}
        {!expanded ? (
          <p style={s.qTextCollapsed}>
            <KaTeXRenderer text={question.text} />
          </p>
        ) : (
          <>
            <p style={s.qText}>
              <KaTeXRenderer text={question.text} />
            </p>

            {question.imageUrl && (
              <img src={question.imageUrl} alt="" style={s.thumbImg} />
            )}

            {(question.questionType || question.type || "mc") === "mc" ? (
              <div style={s.options}>
                {question.options.map((opt, i) => {
                  const isCorrect = String(i) === question.correctAnswer;
                  return (
                    <span
                      key={i}
                      style={{
                        ...s.option,
                        background: isCorrect ? "#e8f5e9" : "#f5f5f5",
                        color: isCorrect ? "#2e7d32" : "#555",
                        fontWeight: isCorrect ? "700" : "400",
                      }}
                    >
                      {String.fromCharCode(65 + i)}.&nbsp;
                      <KaTeXRenderer text={opt} />
                      {isCorrect && " ✓"}
                    </span>
                  );
                })}
              </div>
            ) : (question.questionType || question.type) === "fill_in_blank" ? (
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {(question.blanks || (question.correctAnswer ? [{ id: 1, answer: question.correctAnswer }] : [])).map(b => (
                  <p key={b.id} style={s.fitbAnswer}>
                    <span style={{ color: "#6a1b9a", fontWeight: "700", marginRight: "6px" }}>[{b.id}]</span>{b.answer}
                  </p>
                ))}
              </div>
            ) : (
              <span style={s.badge}>Short Answer</span>
            )}

            {(question.steps?.length ?? 0) > 0 && (
              <div style={{ marginTop: "10px" }}>
                <p style={s.stepsListLabel}>Solution steps — independent mode</p>
                {question.steps.map((st, i) => (
                  <p key={st.id || i} style={s.fitbAnswer}>
                    <span style={{ color: "#6a1b9a", fontWeight: "700", marginRight: "6px" }}>{i + 1}.</span>
                    <KaTeXRenderer text={st.instruction} />
                    <span style={{ color: "#2e7d32", fontWeight: "600", marginLeft: "8px" }}>→ {st.correctAnswer}</span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
        <button onClick={onToggleExpand} style={s.chevronBtn} title={expanded ? "Collapse" : "Expand"}>
          {expanded ? "▴" : "▾"}
        </button>
        <button onClick={onEdit} disabled={locked} style={{ ...s.editBtn, opacity: locked ? 0.15 : 0.5, cursor: locked ? "not-allowed" : "pointer" }}
          title={locked ? "This question is in the active session" : "Edit question"}>✏️</button>
        <button onClick={onDelete} disabled={locked} style={{ ...s.deleteBtn, opacity: locked ? 0.15 : 0.4, cursor: locked ? "not-allowed" : "pointer" }}
          title={locked ? "This question is in the active session" : "Delete question"}>🗑</button>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, display }) {
  return (
    <div style={s.filterField}>
      <span style={s.filterLabel}>{label}</span>
      <select style={s.filterSelect} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{display(o)}</option>)}
      </select>
    </div>
  );
}


function EmptyState({ onNew }) {
  return (
    <div style={s.empty}>
      <p style={s.emptyText}>No questions yet. Create your first one!</p>
      <button onClick={onNew} style={s.newBtn}>+ New Question</button>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  header: {
    background: "#0f3460", color: "#fff", padding: "16px 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  title: { margin: 0, fontSize: "22px", fontWeight: "700" },
  role: { margin: "4px 0 0", fontSize: "11px", opacity: 0.65, textTransform: "uppercase", letterSpacing: "1px" },
  userInfo: { display: "flex", alignItems: "center", gap: "12px" },
  avatar: { width: "38px", height: "38px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" },
  name: { margin: 0, fontSize: "14px" },
  signOut: {
    marginTop: "4px", padding: "2px 10px", fontSize: "12px",
    background: "transparent", border: "1px solid rgba(255,255,255,0.4)",
    color: "#fff", borderRadius: "4px", cursor: "pointer",
  },
  banner: {
    padding: "12px 32px", color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  startBtn: {
    padding: "7px 18px", background: "#0f3460", color: "#fff",
    border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: "600",
  },
  endBtn: {
    padding: "7px 18px", background: "#b71c1c", color: "#fff",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600",
  },
  qrBtn: {
    padding: "7px 18px", background: "#fff", color: "#1b5e20",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "700",
    whiteSpace: "nowrap",
  },
  bannerCode: { fontWeight: "700", letterSpacing: "2px" },
  main: { padding: "20px 32px 32px" },
  tabs: {
    display: "flex", gap: "4px", borderBottom: "2px solid #e0e0e0",
    marginBottom: "24px",
  },
  tab: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "10px 18px", background: "none", border: "none",
    borderBottom: "2px solid transparent", marginBottom: "-2px",
    cursor: "pointer", fontSize: "14px", fontWeight: "600", color: "#888",
    transition: "color 0.15s",
  },
  tabActive: { color: "#0f3460", borderBottomColor: "#0f3460" },
  tabCount: {
    background: "#e8eef7", color: "#0f3460", borderRadius: "12px",
    padding: "1px 8px", fontSize: "12px", fontWeight: "700",
  },
  toolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" },
  sectionTitle: { fontSize: "14px", color: "#666" },
  count: { color: "#888", fontWeight: "400" },
  newBtn: {
    padding: "8px 18px", background: "#0f3460", color: "#fff",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600",
  },
  list: { display: "flex", flexDirection: "column", gap: "10px" },
  card: {
    background: "#fff", borderRadius: "8px", padding: "16px 16px 16px 14px",
    display: "flex", alignItems: "flex-start", gap: "14px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)", transition: "border-left-color 0.15s",
  },
  checkbox: { marginTop: "3px", width: "17px", height: "17px", cursor: "pointer", flexShrink: 0 },
  cardBody: { flex: 1 },
  qText: { margin: "0 0 10px", fontSize: "15px", lineHeight: "1.7", color: "#1a1a1a", whiteSpace: "pre-line" },
  qTextCollapsed: {
    margin: 0, fontSize: "14px", lineHeight: "1.6", color: "#555",
    overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
  },
  chevronBtn: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "15px", padding: "2px 4px", opacity: 0.55, color: "#333",
  },
  options: { display: "flex", flexWrap: "wrap", gap: "6px" },
  option: { padding: "4px 10px", borderRadius: "4px", fontSize: "13px", lineHeight: "1.5" },
  badge: {
    display: "inline-block", padding: "3px 9px", background: "#e3f2fd",
    color: "#1565c0", borderRadius: "4px", fontSize: "12px", fontWeight: "600",
  },
  thumbImg: { display: "block", maxHeight: "80px", maxWidth: "160px", objectFit: "contain", borderRadius: "4px", border: "1px solid #eee", marginBottom: "8px" },
  editBtn: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "17px", padding: "2px 4px", opacity: 0.5,
    transition: "opacity 0.15s",
  },
  deleteBtn: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: "17px", padding: "2px 4px", opacity: 0.4,
    transition: "opacity 0.15s",
  },
  empty: { textAlign: "center", padding: "72px 0" },
  emptyText: { color: "#aaa", fontSize: "16px", marginBottom: "20px" },
  noMatch: { textAlign: "center", color: "#aaa", fontSize: "14px", padding: "40px 0" },

  filterBar: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "18px", padding: "12px 14px", background: "#fff", borderRadius: "8px", border: "1px solid #e0e0e0" },
  filterField: { display: "flex", alignItems: "center", gap: "6px" },
  filterLabel: { fontSize: "12px", fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" },
  filterSelect: { padding: "5px 8px", border: "1px solid #ddd", borderRadius: "5px", fontSize: "13px", background: "#fff", cursor: "pointer" },
  clearFilter: { padding: "5px 10px", background: "none", border: "1px solid #ffcdd2", color: "#c62828", borderRadius: "5px", cursor: "pointer", fontSize: "12px" },
  filterCount: { marginLeft: "auto", fontSize: "12px", color: "#aaa" },
  expandAllBtn: {
    padding: "5px 10px", background: "none", border: "1px solid #ddd",
    color: "#666", borderRadius: "5px", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap",
  },
  migrationBanner: { display: "flex", alignItems: "center", gap: "12px", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: "#5d4037" },
  migrateBtn: { padding: "5px 12px", background: "#f57f17", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap" },

  fitbAnswer: { margin: "6px 0 0", fontSize: "13px", color: "#555" },
  stepsChip: {
    display: "inline-block", fontSize: "11px", fontWeight: "700",
    background: "#f3e5f5", color: "#6a1b9a", padding: "2px 8px",
    borderRadius: "4px", marginBottom: "8px",
  },
  stepsListLabel: {
    margin: "0 0 4px", fontSize: "11px", fontWeight: "700", color: "#6a1b9a",
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
};
