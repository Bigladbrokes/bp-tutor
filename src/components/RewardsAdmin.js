import React, { useEffect, useState } from "react";
import {
  subscribeStudents, giveBonusTokens, formatTokens,
  subscribeRewards, addReward, updateReward, deleteReward,
  approveRequest, rejectRequest,
  adjustStudentBalance, previewStudentDeletion, commitStudentDeletion,
} from "../services/tokens";
import { uploadRewardImage, deleteQuestionImage } from "../services/storageService";

const fmtDate = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";

export default function RewardsAdmin({ teacherUid, requests }) {
  const [students, setStudents] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingReward, setEditingReward] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const u1 = subscribeStudents(setStudents);
    const u2 = subscribeRewards(setRewards);
    return () => { u1(); u2(); };
  }, []);

  const pending = requests
    .filter((r) => r.status === "pending")
    .sort((a, b) => (a.requestedAt?.toMillis() ?? 0) - (b.requestedAt?.toMillis() ?? 0));
  const resolved = requests
    .filter((r) => r.status !== "pending")
    .sort((a, b) => (b.resolvedAt?.toMillis() ?? 0) - (a.resolvedAt?.toMillis() ?? 0))
    .slice(0, 10);
  const sortedStudents = [...students].sort((a, b) =>
    (a.studentName || "").localeCompare(b.studentName || ""));
  const sortedRewards = [...rewards].sort((a, b) => (a.tokenCost ?? 0) - (b.tokenCost ?? 0));

  const handleApprove = async (req) => {
    setBusyId(req.id);
    try {
      await approveRequest(req, teacherUid);
    } catch (err) {
      alert(`Could not approve: ${err.message}`);
    }
    setBusyId(null);
  };

  const handleReject = async (req) => {
    const reason = window.prompt("Reason for rejecting (optional):", "");
    if (reason === null) return; // dialog cancelled
    setBusyId(req.id);
    try {
      await rejectRequest(req.id, teacherUid, reason.trim());
    } catch (err) {
      alert(`Could not reject: ${err.message}`);
    }
    setBusyId(null);
  };

  const handleDeleteReward = async (reward) => {
    if (!window.confirm(`Delete reward "${reward.name}"?`)) return;
    await deleteReward(reward.id);
    if (reward.imagePath) deleteQuestionImage(reward.imagePath);
  };

  return (
    <div style={s.wrapper}>

      {/* ── Redemption requests ── */}
      <section>
        <h2 style={s.sectionTitle}>
          Redemption Requests
          {pending.length > 0 && <span style={s.pendingBadge}>{pending.length} pending</span>}
        </h2>
        {pending.length === 0 ? (
          <p style={s.empty}>No pending requests.</p>
        ) : (
          <div style={s.list}>
            {pending.map((r) => (
              <div key={r.id} style={s.requestRow}>
                <div style={{ flex: 1 }}>
                  <p style={s.rowMain}>
                    <strong>{r.studentName || r.studentId}</strong> wants <strong>{r.rewardName}</strong>
                  </p>
                  <p style={s.rowSub}>{fmtDate(r.requestedAt)} · 🪙 {formatTokens(r.tokenCost)}</p>
                </div>
                <button onClick={() => handleApprove(r)} disabled={busyId === r.id} style={s.approveBtn}>
                  ✓ Approve
                </button>
                <button onClick={() => handleReject(r)} disabled={busyId === r.id} style={s.rejectBtn}>
                  ✕ Reject
                </button>
              </div>
            ))}
          </div>
        )}
        {resolved.length > 0 && (
          <details style={s.resolvedDetails}>
            <summary style={s.resolvedSummary}>Recently resolved ({resolved.length})</summary>
            <div style={{ ...s.list, marginTop: "8px" }}>
              {resolved.map((r) => (
                <div key={r.id} style={{ ...s.requestRow, opacity: 0.75 }}>
                  <div style={{ flex: 1 }}>
                    <p style={s.rowMain}>{r.studentName || r.studentId} — {r.rewardName}</p>
                    <p style={s.rowSub}>
                      {fmtDate(r.resolvedAt)} · 🪙 {formatTokens(r.tokenCost)}
                      {r.status === "rejected" && r.rejectReason && ` · ${r.rejectReason}`}
                    </p>
                  </div>
                  <span style={{
                    ...s.statusChip,
                    background: r.status === "approved" ? "#e8f5e9" : "#fce4ec",
                    color: r.status === "approved" ? "#2e7d32" : "#c62828",
                  }}>
                    {r.status === "approved" ? "✅ Approved" : "✕ Rejected"}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ── Rewards catalog ── */}
      <section>
        <div style={s.sectionHeader}>
          <h2 style={s.sectionTitle}>Rewards</h2>
          <button onClick={() => { setEditingReward(null); setShowForm(true); }} style={s.addBtn}>
            + Add Reward
          </button>
        </div>
        {sortedRewards.length === 0 ? (
          <p style={s.empty}>No rewards yet. Add the first one!</p>
        ) : (
          <div style={s.list}>
            {sortedRewards.map((r) => (
              <div key={r.id} style={s.rewardRow}>
                {r.imageUrl ? (
                  <img src={r.imageUrl} alt="" style={s.rewardThumb} />
                ) : (
                  <div style={s.rewardThumbPlaceholder}>🎁</div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={s.rowMain}>{r.name}</p>
                  <p style={s.rowSub}>
                    🪙 {formatTokens(r.tokenCost)} ·{" "}
                    {typeof r.stock === "number"
                      ? (r.stock <= 0 ? "Out of stock" : `${r.stock} in stock`)
                      : "Unlimited stock"}
                  </p>
                </div>
                <button onClick={() => { setEditingReward(r); setShowForm(true); }} style={s.iconBtn} title="Edit reward">✏️</button>
                <button onClick={() => handleDeleteReward(r)} style={s.iconBtn} title="Delete reward">🗑</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Students & tokens ── */}
      <section>
        <h2 style={s.sectionTitle}>Students &amp; Tokens</h2>
        {sortedStudents.length === 0 ? (
          <p style={s.empty}>No students yet — they appear after their first sign-in.</p>
        ) : (
          <div style={s.list}>
            {sortedStudents.map((st) => (
              <StudentRow key={st.id} student={st} teacherUid={teacherUid} />
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <RewardForm
          initial={editingReward}
          teacherUid={teacherUid}
          pendingRequests={requests.filter((r) => r.status === "pending" && r.rewardId === editingReward?.id)}
          onClose={() => { setShowForm(false); setEditingReward(null); }}
        />
      )}
    </div>
  );
}

// ─── One student row with inline bonus form ─────────────────────────────────

function StudentRow({ student, teacherUid }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [giving, setGiving] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const give = async () => {
    const n = parseFloat(amount);
    if (isNaN(n) || n === 0) {
      alert("Enter a bonus amount (negative values correct mistakes).");
      return;
    }
    setGiving(true);
    try {
      await giveBonusTokens(student, n, reason.trim(), teacherUid);
      setAmount("");
      setReason("");
    } catch (err) {
      alert(`Could not give bonus: ${err.message}`);
    }
    setGiving(false);
  };

  return (
    <>
      <div style={s.studentRow}>
        <div style={s.studentInfo}>
          <p style={s.rowMain}>{student.studentName || "(no name)"}</p>
          <p style={s.rowSub}>{student.studentEmail}</p>
        </div>
        <span style={s.balanceChip}>🪙 {formatTokens(student.tokenBalance ?? 0)}</span>
        <input
          type="number"
          step="0.5"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={s.bonusAmount}
        />
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={s.bonusReason}
        />
        <button onClick={give} disabled={giving} style={s.giveBtn}>
          {giving ? "…" : "Give Bonus"}
        </button>
        <button onClick={() => setShowAdjust(true)} style={s.iconBtn} title="Adjust balance (correction, requires a reason)">⚖️</button>
        <button onClick={() => setShowDelete(true)} style={s.iconBtn} title="Delete this student permanently">🗑</button>
      </div>

      {showAdjust && (
        <AdjustBalanceModal student={student} teacherUid={teacherUid} onClose={() => setShowAdjust(false)} />
      )}
      {showDelete && (
        <DeleteStudentModal student={student} onClose={() => setShowDelete(false)} />
      )}
    </>
  );
}

// ─── Adjust balance modal (Task 2) ────────────────────────────────────────────
// Distinct from "Give Bonus" above: the reason is mandatory, the ledger entry
// is tagged "adjustment" (not "bonus"), and the balance can never go negative.

function AdjustBalanceModal({ student, teacherUid, onClose }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const current = student.tokenBalance ?? 0;
  const parsed = parseFloat(amount);
  const hasAmount = !isNaN(parsed) && parsed !== 0;
  const projected = hasAmount ? current + parsed : current;
  const wouldGoNegative = hasAmount && projected < 0;
  const canSave = hasAmount && !wouldGoNegative && reason.trim().length > 0 && !saving;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await adjustStudentBalance(student, parsed, reason.trim(), teacherUid);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Adjust Balance — {student.studentName || "(no name)"}</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <p style={s.rowSub}>Current balance: <strong>🪙 {formatTokens(current)}</strong></p>

          <label style={s.label}>Amount (+ or −)</label>
          <input type="number" step="0.5" style={s.input} value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="e.g. -5 or 10" autoFocus />

          {hasAmount && (
            <p style={{ ...s.rowSub, color: wouldGoNegative ? "#c62828" : "#2e7d32" }}>
              New balance would be: 🪙 {formatTokens(projected)}
              {wouldGoNegative && " — not allowed, balance cannot go below 0"}
            </p>
          )}

          <label style={s.label}>Reason <span style={{ color: "#c62828" }}>*</span> (required — explains this change in the token history)</label>
          <textarea style={{ ...s.input, minHeight: "60px", resize: "vertical" }} value={reason}
            onChange={(e) => setReason(e.target.value)} placeholder="e.g. Corrected a duplicate bonus given on 7/10" />

          {error && <p style={{ ...s.rowSub, color: "#c62828" }}>{error}</p>}
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={save} disabled={!canSave} style={{ ...s.saveBtn, opacity: canSave ? 1 : 0.5 }}>
            {saving ? "Saving…" : "Save Adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete student modal (Task 1) ────────────────────────────────────────────
// Irreversible. Requires typing the student's name to confirm, shows exact
// counts of everything that will be deleted, and warns that signing in again
// creates a fresh empty profile (their Google account can't be blocked).

function DeleteStudentModal({ student, onClose }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    previewStudentDeletion(student.id)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [student.id]);

  // Type the student's exact name to confirm; fall back to the Thai word for
  // "delete" if the account somehow has no name to type.
  const confirmWord = (student.studentName || "").trim() || "ลบ";
  const confirmed = confirmText.trim().toLowerCase() === confirmWord.toLowerCase();

  const handleDelete = async () => {
    if (!preview || !confirmed) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await commitStudentDeletion(preview);
      onClose();
    } catch (err) {
      // Logged explicitly — Firestore doesn't always surface a batch
      // rejection to the console on its own, and this is the one place a
      // developer can find out what actually happened.
      console.error("Student delete failed:", err.code, err.message);
      const deniedByRules = err.code === "permission-denied";
      setDeleteError(
        deniedByRules
          ? "การลบถูกปฏิเสธโดยเซิร์ฟเวอร์ (permission denied) — most likely the Firestore security rules for delete haven't been deployed yet. Nothing was deleted. Tell your developer."
          : `การลบล้มเหลว: ${err.message}`
      );
      setDeleting(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h2 style={{ ...s.modalTitle, color: "#c62828" }}>ลบนักเรียนถาวร</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          {loadError && <p style={{ color: "#c62828" }}>ไม่สามารถโหลดข้อมูลได้: {loadError}</p>}

          {!preview && !loadError && <p style={s.rowSub}>กำลังตรวจสอบข้อมูลที่จะลบ…</p>}

          {preview && (
            <>
              <p style={s.rowMain}>
                ลบ <strong>{student.studentName || "(no name)"}</strong> ถาวร? จะลบ:
              </p>
              <ul style={{ margin: "4px 0 0", paddingLeft: "20px", fontSize: "14px", color: "#333", lineHeight: "1.8" }}>
                <li>ข้อมูลนักเรียน (โปรไฟล์และยอด token)</li>
                <li>ผลการทำโจทย์ {preview.resultRefs.length} แถว</li>
                <li>ประวัติ token {preview.tokenHistoryRefs.length} รายการ</li>
                <li>คำขอแลกรางวัล {preview.requestRefs.length} รายการ</li>
                <li>ประวัติการเข้าร่วมคาบเรียน {preview.joinRefs.length} คาบ</li>
              </ul>

              <div style={s.deleteWarning}>
                ⚠️ การลบนี้ย้อนกลับไม่ได้ และถ้านักเรียนคนนี้ล็อกอินเข้ามาอีกครั้ง ระบบจะสร้างโปรไฟล์ใหม่ที่ว่างเปล่าให้อัตโนมัติ
                (เราปิดกั้นบัญชี Google ของเขาไม่ได้) — เป็นเรื่องปกติ ไม่ใช่บั๊ก
              </div>

              <label style={s.label}>
                พิมพ์ "{confirmWord}" เพื่อยืนยัน
              </label>
              <input style={s.input} value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder={confirmWord} autoFocus />

              {deleteError && (
                <div style={s.deleteFailedBanner}>
                  ❌ Delete failed — nothing was removed.<br />{deleteError}
                </div>
              )}
            </>
          )}
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button
            onClick={handleDelete}
            disabled={!preview || !confirmed || deleting}
            style={{ ...s.deleteConfirmBtn, opacity: !preview || !confirmed || deleting ? 0.5 : 1 }}
          >
            {deleting ? "กำลังลบ…" : "ลบถาวร"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / edit reward modal ──────────────────────────────────────────────────

function RewardForm({ initial, teacherUid, pendingRequests = [], onClose }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [tokenCost, setTokenCost] = useState(initial?.tokenCost ?? 10);
  // Each pending request locked in the reward's price at the moment it was
  // requested (see createRedemptionRequest / approveRequest) — changing the
  // price here never touches those already-locked amounts.
  const lockedPrices = [...new Set(pendingRequests.map((r) => r.tokenCost))];
  const [trackStock, setTrackStock] = useState(typeof initial?.stock === "number");
  const [stock, setStock] = useState(typeof initial?.stock === "number" ? initial.stock : 10);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl || "");
  const [imagePath, setImagePath] = useState(initial?.imagePath || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (imagePath) deleteQuestionImage(imagePath);
      const { url, path } = await uploadRewardImage(file);
      setImageUrl(url);
      setImagePath(path);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    }
    setUploading(false);
    e.target.value = "";
  };

  const save = async () => {
    const cost = parseFloat(tokenCost);
    if (!name.trim() || isNaN(cost) || cost <= 0) {
      alert("A reward needs a name and a positive token cost.");
      return;
    }
    setSaving(true);
    const data = {
      name: name.trim(),
      tokenCost: cost,
      stock: trackStock ? Math.max(0, parseInt(stock, 10) || 0) : null,
      imageUrl,
      imagePath,
    };
    try {
      if (isEdit) await updateReward(initial.id, data);
      else await addReward(data, teacherUid);
      onClose();
    } catch (err) {
      alert(`Could not save reward: ${err.message}`);
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>{isEdit ? "Edit Reward" : "Add Reward"}</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        <div style={s.modalBody}>
          <label style={s.label}>Reward name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ดินสอกด" />

          <label style={s.label}>Image (optional)</label>
          {imageUrl && <img src={imageUrl} alt="" style={s.formImg} />}
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} style={{ fontSize: "13px" }} />
          {uploading && <p style={s.uploadNote}>Uploading…</p>}

          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "120px" }}>
              <label style={s.label}>Token cost</label>
              <input type="number" min="0.5" step="0.5" style={s.input}
                value={tokenCost} onChange={(e) => setTokenCost(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: "160px" }}>
              <label style={s.label}>Stock</label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={s.checkLabel}>
                  <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
                  Track stock
                </label>
                {trackStock && (
                  <input type="number" min="0" step="1" style={{ ...s.input, width: "80px" }}
                    value={stock} onChange={(e) => setStock(e.target.value)} />
                )}
              </div>
            </div>
          </div>

          {lockedPrices.length > 0 && (
            <div style={s.priceWarning}>
              ⚠️ {pendingRequests.length} pending request{pendingRequests.length !== 1 ? "s" : ""} for this reward.
              {" "}Changing the price here will <strong>not</strong> affect{pendingRequests.length !== 1 ? " them" : " it"} —
              {lockedPrices.length === 1
                ? <> approval will still charge 🪙 {formatTokens(lockedPrices[0])}, the price when requested.</>
                : <> each will still be charged the price locked in at request time: {lockedPrices.map((p) => `🪙 ${formatTokens(p)}`).join(", ")}.</>}
            </div>
          )}
        </div>

        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={save} disabled={saving || uploading}
            style={{ ...s.saveBtn, opacity: saving || uploading ? 0.5 : 1 }}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Reward"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  wrapper: { display: "flex", flexDirection: "column", gap: "32px" },

  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: "17px", color: "#333", margin: "0 0 12px", display: "flex", alignItems: "center", gap: "10px" },
  pendingBadge: {
    background: "#fff3e0", color: "#e65100", borderRadius: "12px",
    padding: "2px 10px", fontSize: "12px", fontWeight: "700",
  },
  empty: { color: "#999", fontSize: "14px", margin: 0 },
  list: { display: "flex", flexDirection: "column", gap: "8px" },

  requestRow: {
    display: "flex", alignItems: "center", gap: "10px",
    background: "#fff", borderRadius: "10px", padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  rowMain: { margin: 0, fontSize: "14px", color: "#1a1a1a" },
  rowSub: { margin: "2px 0 0", fontSize: "12px", color: "#999" },
  approveBtn: {
    padding: "7px 14px", background: "#2e7d32", color: "#fff", border: "none",
    borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap",
  },
  rejectBtn: {
    padding: "7px 14px", background: "#fff", color: "#c62828", border: "1px solid #ffcdd2",
    borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap",
  },
  statusChip: { fontSize: "12px", fontWeight: "700", borderRadius: "12px", padding: "3px 10px", whiteSpace: "nowrap" },
  resolvedDetails: { marginTop: "10px" },
  resolvedSummary: { fontSize: "13px", color: "#888", cursor: "pointer" },

  addBtn: {
    padding: "8px 18px", background: "#0f3460", color: "#fff",
    border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600",
  },
  rewardRow: {
    display: "flex", alignItems: "center", gap: "12px",
    background: "#fff", borderRadius: "10px", padding: "10px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  rewardThumb: { width: "48px", height: "48px", objectFit: "contain", borderRadius: "6px", background: "#f8f9fa", flexShrink: 0 },
  rewardThumbPlaceholder: {
    width: "48px", height: "48px", borderRadius: "6px", background: "#f0f2f5",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0,
  },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "16px", padding: "2px 4px", opacity: 0.55 },

  studentRow: {
    display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
    background: "#fff", borderRadius: "10px", padding: "12px 16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  },
  studentInfo: { flex: 1, minWidth: "150px" },
  balanceChip: {
    background: "#fff8e1", color: "#b26a00", borderRadius: "12px",
    padding: "4px 12px", fontSize: "14px", fontWeight: "700", whiteSpace: "nowrap",
  },
  bonusAmount: { width: "80px", padding: "7px 8px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "13px" },
  bonusReason: { width: "180px", padding: "7px 10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "13px" },
  giveBtn: {
    padding: "7px 14px", background: "#f57f17", color: "#fff", border: "none",
    borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap",
  },

  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "#fff", borderRadius: "12px", width: "480px", maxWidth: "95vw",
    maxHeight: "92vh", display: "flex", flexDirection: "column",
    boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
  },
  modalHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "18px 22px", borderBottom: "1px solid #eee",
  },
  modalTitle: { margin: 0, fontSize: "17px", color: "#0f3460" },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999", lineHeight: 1 },
  modalBody: { padding: "22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" },
  modalFooter: { padding: "14px 22px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: "10px" },
  label: { display: "block", fontSize: "12px", fontWeight: "700", color: "#555", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" },
  input: { width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "14px", boxSizing: "border-box" },
  checkLabel: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap", cursor: "pointer" },
  formImg: { maxWidth: "140px", maxHeight: "100px", objectFit: "contain", borderRadius: "6px", border: "1px solid #eee" },
  uploadNote: { margin: 0, fontSize: "12px", color: "#888", fontStyle: "italic" },
  priceWarning: {
    background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "8px",
    padding: "10px 14px", fontSize: "13px", color: "#5d4037", lineHeight: "1.5",
  },
  cancelBtn: { padding: "8px 18px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: "6px", cursor: "pointer", fontSize: "14px" },
  saveBtn: { padding: "8px 22px", background: "#0f3460", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "600" },
  deleteConfirmBtn: { padding: "8px 22px", background: "#c62828", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "700" },
  deleteWarning: {
    background: "#fdecea", border: "1px solid #f5c6cb", borderRadius: "8px",
    padding: "10px 14px", fontSize: "13px", color: "#7a1f1f", lineHeight: "1.6",
  },
  deleteFailedBanner: {
    background: "#c62828", color: "#fff", borderRadius: "8px",
    padding: "12px 16px", fontSize: "13px", fontWeight: "600", lineHeight: "1.6",
  },
};
