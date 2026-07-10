import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSessionById, markSessionJoin } from "../services/firestore";
import StudentPage from "../pages/StudentPage";

// Validates a scanned /session/:sessionId link for a signed-in student, then
// hands over to the normal quiz flow. Teacher/auth routing happens in App.js.
export default function SessionGate({ user, sessionId }) {
  const [status, setStatus] = useState("checking"); // checking | active | ended | notfound

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    getSessionById(sessionId)
      .then((session) => {
        if (cancelled) return;
        if (!session) setStatus("notfound");
        else setStatus(session.isActive ? "active" : "ended");
      })
      .catch(() => { if (!cancelled) setStatus("notfound"); });
    return () => { cancelled = true; };
  }, [sessionId]);

  // Presence marker for the teacher's "X students joined" counter
  useEffect(() => {
    if (status === "active") markSessionJoin(sessionId, user).catch(() => {});
  }, [status, sessionId, user]);

  if (status === "checking") {
    return <GateScreen icon="⏳" title="Checking session…" />;
  }

  if (status === "active") {
    return <StudentPage user={user} />;
  }

  const ended = status === "ended";
  return (
    <GateScreen
      icon={ended ? "🏁" : "❓"}
      title={ended ? "This session has ended." : "Session not found."}
      sub={ended
        ? "Ask your teacher for the current QR code or join code."
        : "Check the link or code with your teacher and try again."}
    />
  );
}

function GateScreen({ icon, title, sub }) {
  const navigate = useNavigate();
  return (
    <div style={s.page}>
      <div style={s.centered}>
        <div style={s.icon}>{icon}</div>
        <p style={s.title}>{title}</p>
        {sub && <p style={s.sub}>{sub}</p>}
        {title !== "Checking session…" && (
          <div style={s.actions}>
            <button onClick={() => navigate("/")} style={s.primaryBtn}>Go to the app →</button>
            <a href="/join" style={s.link}>Enter a code instead</a>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  centered: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    minHeight: "80vh", textAlign: "center", padding: "24px",
  },
  icon: { fontSize: "52px", marginBottom: "12px" },
  title: { fontSize: "20px", color: "#333", margin: "0 0 8px", fontWeight: "600" },
  sub: { fontSize: "14px", color: "#888", margin: 0 },
  actions: { marginTop: "24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" },
  primaryBtn: {
    padding: "11px 28px", background: "#1565c0", color: "#fff", border: "none",
    borderRadius: "8px", fontSize: "15px", fontWeight: "700", cursor: "pointer",
  },
  link: { color: "#1565c0", fontSize: "14px" },
};
