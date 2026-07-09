import React, { useEffect, useState } from "react";
import {
  subscribeRewards, createRedemptionRequest, subscribeMyRequests,
  subscribeMyTokenHistory, formatTokens,
} from "../services/tokens";

const fmtDate = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";

const TYPE_LABEL = { question: "Question", bonus: "Bonus", redemption: "Redemption" };

const STATUS_CHIP = {
  pending:  { background: "#fff8e1", color: "#e65100", label: "⏳ Pending" },
  approved: { background: "#e8f5e9", color: "#2e7d32", label: "✅ Approved" },
  rejected: { background: "#fce4ec", color: "#c62828", label: "✕ Rejected" },
};

export default function RewardsShop({ user, balance }) {
  const [rewards, setRewards] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const u1 = subscribeRewards(setRewards);
    const u2 = subscribeMyRequests(user.uid, setRequests);
    const u3 = subscribeMyTokenHistory(user.uid, setHistory);
    return () => { u1(); u2(); u3(); };
  }, [user.uid]);

  const sortedRewards = [...rewards].sort((a, b) => (a.tokenCost ?? 0) - (b.tokenCost ?? 0));
  const myRequests = [...requests].sort(
    (a, b) => (b.requestedAt?.toMillis() ?? 0) - (a.requestedAt?.toMillis() ?? 0)
  );
  const pendingCost = myRequests
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + (r.tokenCost ?? 0), 0);

  // Running balance: accumulate oldest → newest, then display newest first
  const historyAsc = [...history].sort(
    (a, b) => (a.timestamp?.toMillis() ?? 0) - (b.timestamp?.toMillis() ?? 0)
  );
  let running = 0;
  const historyRows = historyAsc
    .map((h) => { running += h.amount ?? 0; return { ...h, running }; })
    .reverse();

  const redeem = async (reward) => {
    if (!window.confirm(`Redeem "${reward.name}" for ${formatTokens(reward.tokenCost)} tokens?`)) return;
    setBusyId(reward.id);
    try {
      await createRedemptionRequest(user, reward);
      setMessage("Request sent! Waiting for teacher approval.");
    } catch (err) {
      console.error("Redemption request failed:", err);
      alert("Could not send the request — please check your connection.");
    }
    setBusyId(null);
  };

  return (
    <div style={s.wrapper}>
      {/* ── Balance ── */}
      <div style={s.balanceCard}>
        <div style={s.balanceNum}>🪙 {formatTokens(balance)}</div>
        <div style={s.balanceLabel}>your tokens</div>
        {pendingCost > 0 && (
          <div style={s.pendingNote}>
            {formatTokens(pendingCost)} tokens in pending requests — deducted only when approved
          </div>
        )}
      </div>

      {message && (
        <div style={s.messageBanner}>
          🎉 {message}
          <button onClick={() => setMessage(null)} style={s.messageClose}>✕</button>
        </div>
      )}

      {/* ── Rewards grid ── */}
      <h2 style={s.sectionTitle}>Rewards Shop</h2>
      {sortedRewards.length === 0 ? (
        <p style={s.empty}>No rewards yet — check back soon!</p>
      ) : (
        <div style={s.grid}>
          {sortedRewards.map((r) => {
            const outOfStock = typeof r.stock === "number" && r.stock <= 0;
            const cantAfford = balance < (r.tokenCost ?? 0);
            const disabled = outOfStock || cantAfford || busyId === r.id;
            return (
              <div key={r.id} style={s.rewardCard}>
                {r.imageUrl ? (
                  <img src={r.imageUrl} alt={r.name} style={s.rewardImg} />
                ) : (
                  <div style={s.rewardImgPlaceholder}>🎁</div>
                )}
                <p style={s.rewardName}>{r.name}</p>
                <div style={s.rewardMeta}>
                  <span style={s.costChip}>🪙 {formatTokens(r.tokenCost)}</span>
                  {typeof r.stock === "number" && (
                    <span style={{ ...s.stockText, color: outOfStock ? "#c62828" : "#888" }}>
                      {outOfStock ? "Out of stock" : `${r.stock} left`}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => redeem(r)}
                  disabled={disabled}
                  style={{ ...s.redeemBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
                >
                  {outOfStock ? "Out of stock" : cantAfford ? "Not enough tokens" : "Redeem"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── My requests ── */}
      {myRequests.length > 0 && (
        <>
          <h2 style={s.sectionTitle}>My Requests</h2>
          <div style={s.list}>
            {myRequests.map((r) => {
              const chip = STATUS_CHIP[r.status] ?? STATUS_CHIP.pending;
              return (
                <div key={r.id} style={s.requestRow}>
                  <div style={{ flex: 1 }}>
                    <p style={s.requestName}>{r.rewardName}</p>
                    <p style={s.requestDate}>
                      {fmtDate(r.requestedAt)}
                      {r.status === "rejected" && r.rejectReason && ` — ${r.rejectReason}`}
                    </p>
                  </div>
                  <span style={s.requestCost}>🪙 {formatTokens(r.tokenCost)}</span>
                  <span style={{ ...s.statusChip, background: chip.background, color: chip.color }}>
                    {chip.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Token history ── */}
      <h2 style={s.sectionTitle}>Token History</h2>
      {historyRows.length === 0 ? (
        <p style={s.empty}>No tokens yet — answer questions to earn some!</p>
      ) : (
        <div style={s.historyTableWrap}>
          <table style={s.historyTable}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Detail</th>
                <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
                <th style={{ ...s.th, textAlign: "right" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((h) => (
                <tr key={h.id}>
                  <td style={s.td}>{fmtDate(h.timestamp)}</td>
                  <td style={s.td}>{TYPE_LABEL[h.type] ?? h.type}</td>
                  <td style={{ ...s.td, color: "#888" }}>
                    {h.type === "bonus" ? (h.reason || "")
                      : h.type === "redemption" ? (h.rewardName || "")
                      : (h.difficulty || "")}
                  </td>
                  <td style={{ ...s.td, textAlign: "right", fontWeight: 700,
                    color: (h.amount ?? 0) >= 0 ? "#2e7d32" : "#c62828" }}>
                    {(h.amount ?? 0) >= 0 ? "+" : ""}{formatTokens(h.amount)}
                  </td>
                  <td style={{ ...s.td, textAlign: "right", color: "#555" }}>
                    {formatTokens(h.running)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  wrapper: { maxWidth: "760px", margin: "0 auto", padding: "24px 20px 48px" },

  balanceCard: {
    background: "#1565c0", color: "#fff", borderRadius: "16px",
    padding: "24px 28px", textAlign: "center", marginBottom: "20px",
  },
  balanceNum: { fontSize: "40px", fontWeight: "800", lineHeight: 1.1 },
  balanceLabel: { fontSize: "13px", opacity: 0.75, textTransform: "uppercase", letterSpacing: "1px", marginTop: "4px" },
  pendingNote: { marginTop: "10px", fontSize: "12px", background: "rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 12px", display: "inline-block" },

  messageBanner: {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
    background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7",
    borderRadius: "8px", padding: "10px 16px", marginBottom: "16px", fontSize: "14px", fontWeight: "600",
  },
  messageClose: { background: "none", border: "none", color: "#2e7d32", cursor: "pointer", fontSize: "14px" },

  sectionTitle: { fontSize: "17px", color: "#333", margin: "26px 0 12px" },
  empty: { color: "#999", fontSize: "14px" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
  rewardCard: {
    background: "#fff", borderRadius: "12px", padding: "14px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: "8px",
  },
  rewardImg: { width: "100%", height: "110px", objectFit: "contain", borderRadius: "8px", background: "#f8f9fa" },
  rewardImgPlaceholder: {
    width: "100%", height: "110px", borderRadius: "8px", background: "#f0f2f5",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "42px",
  },
  rewardName: { margin: 0, fontSize: "14px", fontWeight: "600", color: "#1a1a1a", lineHeight: 1.4 },
  rewardMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" },
  costChip: { background: "#fff8e1", color: "#b26a00", borderRadius: "12px", padding: "2px 10px", fontSize: "13px", fontWeight: "700" },
  stockText: { fontSize: "12px" },
  redeemBtn: {
    marginTop: "auto", padding: "8px 0", background: "#1565c0", color: "#fff",
    border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "700",
  },

  list: { display: "flex", flexDirection: "column", gap: "8px" },
  requestRow: {
    display: "flex", alignItems: "center", gap: "12px",
    background: "#fff", borderRadius: "10px", padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  requestName: { margin: 0, fontSize: "14px", fontWeight: "600", color: "#1a1a1a" },
  requestDate: { margin: "2px 0 0", fontSize: "12px", color: "#999" },
  requestCost: { fontSize: "13px", fontWeight: "700", color: "#b26a00", whiteSpace: "nowrap" },
  statusChip: { fontSize: "12px", fontWeight: "700", borderRadius: "12px", padding: "3px 10px", whiteSpace: "nowrap" },

  historyTableWrap: { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", overflowX: "auto" },
  historyTable: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: {
    textAlign: "left", padding: "10px 14px", fontSize: "11px", color: "#888",
    textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #eee",
  },
  td: { padding: "9px 14px", borderBottom: "1px solid #f5f5f5", color: "#333", whiteSpace: "nowrap" },
};
