import React, { useState, useMemo, useEffect } from "react";
import KaTeXRenderer from "./KaTeXRenderer";
import { computeSessionStats } from "../services/sessionStats";

export default function SessionDashboard({ session, questions, results, joins }) {
  const [sortCol, setSortCol] = useState("name");
  const [sortDesc, setSortDesc] = useState(false);

  // "Stuck" is time-based (quiet too long), so the dashboard needs to keep
  // re-evaluating as real time passes even when no new data arrives.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(
    () => computeSessionStats(session, questions, results, joins, nowMs),
    [session, questions, results, joins, nowMs]
  );

  const { summary, mostMissed, studentRows } = stats;

  const sortedRows = useMemo(() => {
    return [...studentRows].sort((a, b) => {
      let valA, valB;
      switch (sortCol) {
        case "name":
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case "progress":
          valA = a.progress.pct;
          valB = b.progress.pct;
          break;
        case "score":
          valA = a.scorePct;
          valB = b.scorePct;
          break;
        case "hints":
          valA = a.hintsUsed;
          valB = b.hintsUsed;
          break;
        case "time":
          valA = a.avgTimeMs ?? Infinity;
          valB = b.avgTimeMs ?? Infinity;
          break;
        case "lastActive":
          valA = a.lastActiveMs;
          valB = b.lastActiveMs;
          break;
        default:
          valA = a.name;
          valB = b.name;
      }
      if (valA < valB) return sortDesc ? 1 : -1;
      if (valA > valB) return sortDesc ? -1 : 1;
      return 0;
    });
  }, [studentRows, sortCol, sortDesc]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(col);
      setSortDesc(col !== "name"); // Default to desc for numeric columns
    }
  };

  const getSortIcon = (col) => {
    if (sortCol !== col) return "↕";
    return sortDesc ? "↓" : "↑";
  };

  const formatTime = (ms) => {
    if (ms == null) return "—";
    const s = Math.round(ms / 1000);
    return `${s}s`;
  };

  return (
    <div style={s.container}>
      <div style={s.overviewPanel}>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{summary.totalStudents || 0}</div>
          <div style={s.metricLabel}>Students Joined</div>
        </div>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{summary.classProgressPct || 0}%</div>
          <div style={s.metricLabel}>Avg Progress</div>
        </div>
        <div style={s.metricCard}>
          <div style={s.metricValue}>{summary.avgScorePct || 0}%</div>
          <div style={s.metricLabel}>Avg Score</div>
        </div>
      </div>

      {mostMissed.length > 0 && (
        <div style={s.mostMissedCard}>
          <h3 style={s.mostMissedTitle}>⚠️ Most Missed Questions (Session)</h3>
          <ul style={s.missedList}>
            {mostMissed.slice(0, 3).map((qid) => {
              const q = questions.find((x) => x.id === qid);
              if (!q) return null;
              return (
                <li key={qid} style={s.missedItem}>
                  <KaTeXRenderer text={q.text} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div style={s.tableContainer}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} onClick={() => handleSort("name")}>Student {getSortIcon("name")}</th>
              <th style={s.th} onClick={() => handleSort("progress")}>Progress {getSortIcon("progress")}</th>
              <th style={s.th} onClick={() => handleSort("score")}>Score % {getSortIcon("score")}</th>
              <th style={s.th}>Status</th>
              <th style={s.th} onClick={() => handleSort("hints")}>Hints {getSortIcon("hints")}</th>
              <th style={s.th} onClick={() => handleSort("time")}>Avg Time {getSortIcon("time")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan="6" style={s.emptyRow}>No student data yet.</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.uid} style={{ ...s.tr, backgroundColor: row.isStuck ? "#ffebee" : "#fff" }}>
                  <td style={s.tdName}>{row.name}</td>
                  <td style={s.td}>{row.progress.label}</td>
                  <td style={s.td}>{Math.round(row.scorePct)}%</td>
                  <td style={s.td}>
                    {row.isStuck ? (
                      <span style={s.stuckBadge} title="No new answers while the session isn't finished for them">
                        ⚠️ Quiet {row.quietMinutes}m
                      </span>
                    ) : (
                      <span style={s.activeBadge}>Active</span>
                    )}
                  </td>
                  <td style={s.td}>{row.hintsUsed > 0 ? `💡 ${row.hintsUsed}` : "—"}</td>
                  <td style={s.td}>{formatTime(row.avgTimeMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  container: {
    marginBottom: "32px",
    fontFamily: "system-ui, sans-serif",
  },
  overviewPanel: {
    display: "flex",
    gap: "16px",
    marginBottom: "20px",
  },
  metricCard: {
    flex: 1,
    background: "#fff",
    borderRadius: "10px",
    padding: "20px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    textAlign: "center",
    borderTop: "4px solid #0f3460",
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: "4px",
  },
  metricLabel: {
    fontSize: "13px",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    fontWeight: "600",
  },
  mostMissedCard: {
    background: "#fff8e1",
    border: "1px solid #ffe082",
    borderRadius: "10px",
    padding: "16px 20px",
    marginBottom: "20px",
  },
  mostMissedTitle: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    fontWeight: "700",
    color: "#f57f17",
    textTransform: "uppercase",
  },
  missedList: {
    margin: 0,
    paddingLeft: "20px",
    color: "#5d4037",
    fontSize: "14px",
    lineHeight: "1.6",
  },
  missedItem: {
    marginBottom: "8px",
  },
  tableContainer: {
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    padding: "12px 16px",
    borderBottom: "2px solid #eee",
    fontSize: "12px",
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    cursor: "pointer",
    userSelect: "none",
  },
  tr: {
    borderBottom: "1px solid #eee",
    transition: "background-color 0.2s",
  },
  tdName: {
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: "600",
    color: "#1565c0",
  },
  td: {
    padding: "12px 16px",
    fontSize: "14px",
    color: "#333",
  },
  emptyRow: {
    padding: "24px",
    textAlign: "center",
    color: "#999",
    fontStyle: "italic",
  },
  stuckBadge: {
    display: "inline-block",
    padding: "4px 8px",
    background: "#ffebee",
    color: "#c62828",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "700",
    border: "1px solid #ffcdd2",
  },
  activeBadge: {
    display: "inline-block",
    padding: "4px 8px",
    background: "#e8f5e9",
    color: "#2e7d32",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: "600",
  },
};
