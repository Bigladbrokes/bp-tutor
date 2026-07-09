import React, { useEffect, useState } from "react";
import { subscribeStudents, updateStudentGrade, formatTokens } from "../services/tokens";

const GRADES = ["M.1", "M.2", "M.3"];
const MEDALS = ["🥇", "🥈", "🥉"];
const TOP_ROW_BG = ["#fff8e1", "#f1f3f5", "#fbe9e7"]; // gold / silver / bronze tints

export default function StudentRankings() {
  const [students, setStudents] = useState([]);
  const [filterGrade, setFilterGrade] = useState("All");

  useEffect(() => subscribeStudents(setStudents), []);

  // Always sorted by balance, highest first; re-ranked within the filter
  const filtered = students
    .filter((st) => filterGrade === "All" || st.grade === filterGrade)
    .sort((a, b) => (b.tokenBalance ?? 0) - (a.tokenBalance ?? 0));

  // Competition ranking: equal balances share a rank (1, 2, 2, 4, …)
  const ranks = [];
  filtered.forEach((st, i) => {
    ranks[i] = i > 0 && (st.tokenBalance ?? 0) === (filtered[i - 1].tokenBalance ?? 0)
      ? ranks[i - 1]
      : i + 1;
  });

  const handleGradeChange = (uid, grade) =>
    updateStudentGrade(uid, grade).catch((err) => alert(`Could not save grade: ${err.message}`));

  return (
    <div style={s.wrapper}>
      {/* ── Filter bar ── */}
      <div style={s.filterBar}>
        <div style={s.filterField}>
          <span style={s.filterLabel}>Grade</span>
          <select style={s.filterSelect} value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
            <option value="All">All Grades</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <span style={s.count}>
          Showing {filtered.length} student{filtered.length !== 1 ? "s" : ""}
          {filterGrade !== "All" ? ` in ${filterGrade}` : ""}
        </span>
      </div>

      {/* ── Rankings list ── */}
      {filtered.length === 0 ? (
        <p style={s.empty}>
          {students.length === 0
            ? "No students yet — they appear after their first sign-in."
            : `No students in ${filterGrade} yet. Assign grades using the dropdown on each student.`}
        </p>
      ) : (
        <div style={s.list}>
          {filtered.map((st, i) => {
            const rank = ranks[i];
            const isTop3 = rank <= 3;
            return (
              <div
                key={st.id}
                style={{
                  ...s.row,
                  ...(isTop3 ? { background: TOP_ROW_BG[rank - 1], boxShadow: "0 1px 6px rgba(0,0,0,0.1)" } : {}),
                }}
              >
                <span style={{ ...s.rank, fontSize: isTop3 ? "24px" : "15px" }}>
                  {isTop3 ? MEDALS[rank - 1] : `#${rank}`}
                </span>

                {st.photoURL ? (
                  <img src={st.photoURL} alt="" style={s.avatar} referrerPolicy="no-referrer" />
                ) : (
                  <span style={s.avatarFallback}>
                    {(st.studentName || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                )}

                <div style={s.info}>
                  <p style={s.name}>{st.studentName || "(no name)"}</p>
                  <p style={s.email}>{st.studentEmail}</p>
                </div>

                <select
                  style={s.gradeSelect}
                  value={st.grade || ""}
                  onChange={(e) => handleGradeChange(st.id, e.target.value)}
                  title="Assign grade"
                >
                  <option value="">—</option>
                  {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>

                <span style={s.balance}>
                  {formatTokens(st.tokenBalance ?? 0)}
                  <span style={s.balanceUnit}> 🪙</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { maxWidth: "720px" },

  filterBar: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
    marginBottom: "16px", padding: "12px 14px",
    background: "#fff", borderRadius: "8px", border: "1px solid #e0e0e0",
  },
  filterField: { display: "flex", alignItems: "center", gap: "6px" },
  filterLabel: { fontSize: "12px", fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: "0.4px" },
  filterSelect: { padding: "5px 8px", border: "1px solid #ddd", borderRadius: "5px", fontSize: "13px", background: "#fff", cursor: "pointer" },
  count: { marginLeft: "auto", fontSize: "13px", color: "#888" },

  empty: { color: "#999", fontSize: "14px", padding: "32px 0", textAlign: "center" },

  list: { display: "flex", flexDirection: "column", gap: "8px" },
  row: {
    display: "flex", alignItems: "center", gap: "14px",
    background: "#fff", borderRadius: "10px", padding: "12px 18px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  rank: { minWidth: "42px", textAlign: "center", fontWeight: "800", color: "#78909c" },
  avatar: { width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  avatarFallback: {
    width: "40px", height: "40px", borderRadius: "50%", background: "#0f3460", color: "#fff",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", fontWeight: "700", flexShrink: 0,
  },
  info: { flex: 1, minWidth: 0 },
  name: { margin: 0, fontSize: "15px", fontWeight: "600", color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  email: { margin: "2px 0 0", fontSize: "12px", color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  gradeSelect: { padding: "4px 6px", border: "1px solid #ddd", borderRadius: "5px", fontSize: "13px", background: "#fff", cursor: "pointer", flexShrink: 0 },
  balance: { fontSize: "26px", fontWeight: "800", color: "#b26a00", whiteSpace: "nowrap", flexShrink: 0 },
  balanceUnit: { fontSize: "16px" },
};
