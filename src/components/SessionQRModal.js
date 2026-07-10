import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { subscribeSessionJoins } from "../services/firestore";

// Projection-friendly QR for joining the active session. Rendered locally by
// qrcode.react — no network needed, so it survives flaky school wifi.
export default function SessionQRModal({ session, onClose }) {
  const [joins, setJoins] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeSessionJoins(session.id, setJoins), [session.id]);

  const joinUrl = `${window.location.origin}/session/${session.id}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (http / permissions) — the URL is shown below
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={s.closeBtn} title="Close">✕</button>

        <h2 style={s.title}>Scan to join</h2>

        <div style={s.qrBox}>
          <QRCodeSVG
            value={joinUrl}
            size={480}
            level="M"
            marginSize={3}
            style={{ width: "min(480px, 70vw, 55vh)", height: "auto", display: "block" }}
          />
        </div>

        {session.joinCode && (
          <>
            <p style={s.codeLabel}>or type this code at {window.location.host}/join</p>
            <p style={s.code}>{session.joinCode}</p>
          </>
        )}

        <p style={s.url}>{joinUrl}</p>

        <div style={s.footer}>
          <button onClick={copyLink} style={s.copyBtn}>
            {copied ? "✓ Copied" : "Copy link"}
          </button>
          <span style={s.counter}>
            <span style={s.dot} />
            {joins.length} student{joins.length !== 1 ? "s" : ""} joined
          </span>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(10, 15, 30, 0.85)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000,
    padding: "20px",
  },
  modal: {
    position: "relative", background: "#fff", borderRadius: "20px",
    padding: "32px 40px", textAlign: "center",
    maxWidth: "95vw", maxHeight: "95vh", overflowY: "auto",
    boxShadow: "0 32px 90px rgba(0,0,0,0.5)",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
  },
  closeBtn: {
    position: "absolute", top: "14px", right: "16px",
    background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#999",
  },
  title: { margin: 0, fontSize: "24px", color: "#0f3460" },
  qrBox: { background: "#fff", padding: "8px", lineHeight: 0 },
  codeLabel: { margin: "4px 0 0", fontSize: "14px", color: "#888" },
  code: {
    margin: 0, fontSize: "56px", fontWeight: "800", letterSpacing: "14px",
    color: "#0f3460", fontFamily: "ui-monospace, Consolas, monospace",
    paddingLeft: "14px", // visually balances the trailing letter-spacing
  },
  url: { margin: 0, fontSize: "13px", color: "#aaa", wordBreak: "break-all" },
  footer: { display: "flex", alignItems: "center", gap: "18px", marginTop: "6px", flexWrap: "wrap", justifyContent: "center" },
  copyBtn: {
    padding: "9px 22px", background: "#0f3460", color: "#fff", border: "none",
    borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600",
  },
  counter: {
    display: "inline-flex", alignItems: "center", gap: "8px",
    background: "#e8f5e9", color: "#2e7d32", borderRadius: "20px",
    padding: "6px 16px", fontSize: "15px", fontWeight: "700",
  },
  dot: { width: "9px", height: "9px", borderRadius: "50%", background: "#2e7d32" },
};
