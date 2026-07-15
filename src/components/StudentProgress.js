import React, { useEffect, useState } from "react";
import { getAllSessions, getMyResults, getQuestionsByIds } from "../services/firestore";
import { computeStreak, chapterStats } from "../services/progress";

// Student home panel: streak + per-chapter understanding + self-comparison.
// Everything is recomputed from sessions + this student's own results on each
// load — nothing stored, no comparison against other students anywhere.
export default function StudentProgress({ user }) {
  const [state, setState] = useState({ loading: true, error: false, streak: 0, graceSession: null, chapters: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessions, results] = await Promise.all([
          getAllSessions(),
          getMyResults(user.uid),
        ]);
        const qids = [...new Set(results.map((r) => r.questionId).filter(Boolean))];
        const questions = qids.length ? await getQuestionsByIds(qids) : [];
        if (cancelled) return;
        const { streak, graceSession } = computeStreak(sessions, results);
        setState({
          loading: false,
          error: false,
          streak,
          graceSession,
          chapters: chapterStats(questions, results),
        });
      } catch (err) {
        console.error("Could not load progress:", err);
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [user.uid]);

  if (state.loading) return <div style={s.panel}><p style={s.quiet}>กำลังโหลดความก้าวหน้า…</p></div>;
  if (state.error) return <div style={s.panel}><p style={s.quiet}>ยังโหลดความก้าวหน้าไม่ได้ในตอนนี้</p></div>;

  const { streak, graceSession, chapters } = state;

  return (
    <div style={s.panel}>
      {/* ── Streak ── */}
      <div style={s.streakCard}>
        <div style={s.streakNum}>🔥 {streak} คาบติด</div>
        {streak === 0 && !graceSession && (
          <p style={s.streakSub}>ทำครบทุกข้อในคาบหน้า เพื่อเริ่ม streak ใหม่!</p>
        )}
        {graceSession && (
          <p style={s.graceNote}>
            ตามทำ session{graceSession.joinCode ? ` ${graceSession.joinCode}` : ""} ให้ครบก่อนคาบหน้า เพื่อรักษา streak 🔥
          </p>
        )}
      </div>

      {/* ── Per-chapter understanding ── */}
      {chapters.length === 0 ? (
        <p style={s.quiet}>เริ่มทำโจทย์เพื่อดูความเข้าใจรายบท 💪</p>
      ) : (
        <div style={s.chapterList}>
          {chapters.map((c) => (
            <div key={c.chapter} style={s.chapterRow}>
              <div style={s.chapterTop}>
                <span style={s.chapterName}>{c.chapter}</span>
                <span style={s.chapterPct}>{c.pct}% <span style={s.chapterCount}>(ทำไป {c.attempted} ข้อ)</span></span>
              </div>
              <div style={s.barTrack}>
                <div style={{ ...s.barFill, width: `${c.pct}%`, background: c.pct >= 70 ? "#2e7d32" : c.pct >= 40 ? "#f9a825" : "#90a4ae" }} />
              </div>
              {c.delta !== null && (
                <p style={{ ...s.delta, color: c.delta > 0 ? "#2e7d32" : c.delta < 0 ? "#6a1b9a" : "#888" }}>
                  {c.delta > 0 && `+${c.delta}% จากครั้งก่อน เก่งขึ้นแล้ว! 💪`}
                  {c.delta < 0 && `${c.delta}% จากครั้งก่อน ไม่เป็นไร ค่อย ๆ ฝึกไป 💙`}
                  {c.delta === 0 && `เท่าครั้งก่อน รักษาระดับได้ดี ✨`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  panel: { width: "100%", maxWidth: "560px", textAlign: "left", display: "flex", flexDirection: "column", gap: "14px" },
  quiet: { margin: 0, fontSize: "14px", color: "#999", textAlign: "center" },

  streakCard: {
    background: "#fff", borderRadius: "14px", padding: "18px 20px",
    boxShadow: "0 1px 5px rgba(0,0,0,0.08)", textAlign: "center",
  },
  streakNum: { fontSize: "28px", fontWeight: "800", color: "#e65100" },
  streakSub: { margin: "6px 0 0", fontSize: "13px", color: "#888" },
  graceNote: {
    margin: "10px 0 0", fontSize: "13px", color: "#5d4037",
    background: "#fff8e1", border: "1px solid #ffe082",
    borderRadius: "8px", padding: "8px 12px", lineHeight: 1.5,
  },

  chapterList: { display: "flex", flexDirection: "column", gap: "10px" },
  chapterRow: {
    background: "#fff", borderRadius: "12px", padding: "13px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  chapterTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "7px" },
  chapterName: { fontSize: "14px", fontWeight: "700", color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chapterPct: { fontSize: "15px", fontWeight: "800", color: "#0f3460", whiteSpace: "nowrap" },
  chapterCount: { fontSize: "12px", fontWeight: "400", color: "#999" },
  barTrack: { height: "8px", background: "#f0f0f0", borderRadius: "4px", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: "4px", transition: "width 0.5s ease" },
  delta: { margin: "7px 0 0", fontSize: "12px", fontWeight: "600" },
};
