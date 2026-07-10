import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { findSessionByCode, normalizeJoinCode } from "../services/firestore";

// Typeable fallback for students whose camera can't scan the QR. On success
// it navigates to /session/:id, reusing SessionGate for all validation.
export default function JoinPage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const code = normalizeJoinCode(input);

  const submit = async () => {
    setError(null);
    if (code.length !== 6) {
      setError("The code has 6 letters and numbers — check the board.");
      return;
    }
    setBusy(true);
    try {
      const session = await findSessionByCode(code);
      if (!session) {
        setError("Code not found — check the board and try again.");
      } else if (!session.isActive) {
        setError("That session has ended — ask your teacher for the current code.");
      } else {
        navigate(`/session/${session.id}`);
        return;
      }
    } catch (err) {
      console.error("Join code lookup failed:", err);
      setError("Could not check the code — check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Join a Session</h1>
        <p style={s.sub}>Type the 6-character code from the board</p>

        <input
          style={s.codeInput}
          value={code}
          onChange={(e) => { setInput(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
          placeholder="ABC123"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
        />

        {error && <p style={s.error} role="alert">⚠️ {error}</p>}

        <button
          onClick={submit}
          disabled={busy || code.length !== 6}
          style={{ ...s.joinBtn, opacity: busy || code.length !== 6 ? 0.5 : 1 }}
        >
          {busy ? "Checking…" : "Join →"}
        </button>

        <a href="/" style={s.backLink}>← Back to the app</a>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    fontFamily: "system-ui, sans-serif", padding: "20px",
  },
  card: {
    background: "#fff", borderRadius: "16px", padding: "40px 32px",
    width: "100%", maxWidth: "380px", textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    display: "flex", flexDirection: "column", gap: "16px",
  },
  title: { margin: 0, fontSize: "26px", fontWeight: "700", color: "#0f3460" },
  sub: { margin: 0, fontSize: "14px", color: "#666" },
  codeInput: {
    width: "100%", boxSizing: "border-box", padding: "14px 10px",
    fontSize: "32px", fontWeight: "800", letterSpacing: "8px", textAlign: "center",
    textTransform: "uppercase", border: "2px solid #0f3460", borderRadius: "10px",
    outline: "none", color: "#0f3460", fontFamily: "inherit",
  },
  error: {
    margin: 0, background: "#fdecea", border: "1px solid #f5c6cb", borderRadius: "8px",
    padding: "10px 14px", color: "#c62828", fontSize: "14px", lineHeight: "1.5", textAlign: "left",
  },
  joinBtn: {
    padding: "13px 0", background: "#0f3460", color: "#fff", border: "none",
    borderRadius: "8px", fontSize: "16px", fontWeight: "700", cursor: "pointer",
  },
  backLink: { color: "#888", fontSize: "13px", textDecoration: "none" },
};
