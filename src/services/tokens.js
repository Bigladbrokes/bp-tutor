import {
  collection, doc, addDoc, deleteDoc, getDoc, getDocs, onSnapshot, query, where,
  runTransaction, serverTimestamp, increment, updateDoc, setDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { getAllSessions } from "./firestore";

// ─── Token values ─────────────────────────────────────────────────────────────

export const TOKEN_VALUES = { Easy: 1, Medium: 5, Hard: 10 };

// Tokens earned for one result row (MC question / FitB blank / solution step):
// full value on the 1st attempt, half on the 2nd, nothing if still wrong.
export const tokensForResult = (difficulty, correct, attempts) => {
  if (!correct) return 0;
  const base = TOKEN_VALUES[difficulty] ?? TOKEN_VALUES.Easy;
  return attempts >= 2 ? base / 2 : base;
};

export const formatTokens = (n) => {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

// ─── Student profile + balance ────────────────────────────────────────────────

// Make sure /students/{uid} exists after login. New docs get the full default
// shape (including role); existing docs only receive fields they are missing,
// so values like tokenBalance, grade, or an already-set role are never
// overwritten. Returns the profile so the caller can route on role.
export const ensureUserDoc = async (user, role) => {
  const ref = doc(db, "students", user.uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  const defaults = {
    studentName: user.displayName ?? "",
    studentEmail: user.email ?? "",
    photoURL: user.photoURL ?? "",
    role,
    tokenBalance: 0,
    createdAt: serverTimestamp(),
  };
  const missing = Object.fromEntries(
    Object.entries(defaults).filter(([key]) => existing[key] === undefined)
  );
  if (Object.keys(missing).length > 0) {
    await setDoc(ref, missing, { merge: true });
  }
  return { ...existing, ...missing };
};

// Grade is assigned by the teacher (students aren't otherwise tied to a grade)
export const updateStudentGrade = (uid, grade) =>
  setDoc(doc(db, "students", uid), { grade: grade || null }, { merge: true });

export const subscribeStudent = (uid, callback) =>
  onSnapshot(doc(db, "students", uid), (snap) =>
    callback(snap.exists() ? snap.data() : null));

// All student profiles, for teacher-facing lists (rankings, bonus tokens).
// The teacher's own profile doc is excluded; docs created before roles
// existed have no role field and are treated as students.
export const subscribeStudents = (callback) =>
  onSnapshot(collection(db, "students"), (snap) =>
    callback(snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((st) => st.role !== "teacher")));

// ─── Result rows + token award (idempotent) ───────────────────────────────────

// Deterministic result-row ID: one slot per (session, student, question, row),
// where a "row" is the MC answer, one FitB blank, one solution step, or the
// free-form independent answer. Segments are joined with "_" and none of the
// parts contain "_" themselves — firestore.rules checks segment [1] is the
// writer's uid.
export const resultRowId = (result, uid) => {
  const row = result.stepId ? `step-${result.stepId}`
    : result.mode === "independent" ? "free"
    : result.blankId != null ? `blank-${result.blankId}`
    : "mc";
  return `${result.sessionId}_${uid}_${result.questionId}_${row}`;
};

// Save one result row and credit its tokens in a single transaction. If the
// row already exists — the student is replaying a finished session from
// another browser, cleared storage, or a second tab — nothing is written and
// no tokens are credited (results are create-only for students in the rules,
// so even a race between two tabs cannot double-credit).
export const saveResultWithTokens = (user, result, amount, meta = {}) =>
  runTransaction(db, async (t) => {
    const resultRef = doc(db, "results", resultRowId(result, user.uid));
    const existing = await t.get(resultRef);
    if (existing.exists()) return { duplicate: true };
    t.set(resultRef, { ...result, timestamp: serverTimestamp() });
    if (amount > 0) {
      t.set(doc(db, "students", user.uid), {
        tokenBalance: increment(amount),
        studentName: user.displayName ?? "",
        studentEmail: user.email ?? "",
        photoURL: user.photoURL ?? "",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      t.set(doc(collection(db, "tokenHistory")), {
        studentId: user.uid,
        studentName: user.displayName ?? "",
        amount,
        type: "question",
        questionId: result.questionId ?? null,
        difficulty: meta.difficulty ?? "Easy",
        timestamp: serverTimestamp(),
      });
    }
    return { duplicate: false };
  });

export const giveBonusTokens = (student, amount, reason, teacherUid) => {
  const batch = writeBatch(db);
  batch.set(doc(db, "students", student.id), {
    tokenBalance: increment(amount),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(collection(db, "tokenHistory")), {
    studentId: student.id,
    studentName: student.studentName ?? "",
    amount,
    type: "bonus",
    reason: reason || "",
    givenBy: teacherUid,
    timestamp: serverTimestamp(),
  });
  return batch.commit();
};

// Pure floor-guard: given a current balance and a signed delta, returns the
// resulting balance or throws if it would go negative. Extracted so the
// boundary logic (exactly 0 is fine, -0.01 is not) is testable without
// mocking Firestore.
export function applyBalanceAdjustment(currentBalance, amount) {
  const next = (currentBalance ?? 0) + amount;
  if (next < 0) {
    throw new Error(`This would put the balance below 0 (currently ${formatTokens(currentBalance ?? 0)}).`);
  }
  return next;
}

// Manual balance correction — distinct from giveBonusTokens: the reason is
// mandatory (not optional), the type tag is "adjustment" (not "bonus"), and
// the balance can never be pushed negative. Read-check-write in a transaction
// because increment() has no way to express a floor.
export const adjustStudentBalance = (student, amount, reason, teacherUid) => {
  const cleanReason = (reason || "").trim();
  if (!cleanReason) return Promise.reject(new Error("A reason is required."));
  return runTransaction(db, async (t) => {
    const studentRef = doc(db, "students", student.id);
    const snap = await t.get(studentRef);
    const current = snap.exists() ? (snap.data().tokenBalance ?? 0) : 0;
    const next = applyBalanceAdjustment(current, amount);
    t.set(studentRef, { tokenBalance: next, updatedAt: serverTimestamp() }, { merge: true });
    t.set(doc(collection(db, "tokenHistory")), {
      studentId: student.id,
      studentName: student.studentName ?? "",
      amount,
      type: "adjustment",
      reason: cleanReason,
      givenBy: teacherUid,
      timestamp: serverTimestamp(),
    });
  });
};

export const subscribeMyTokenHistory = (uid, callback) =>
  onSnapshot(
    query(collection(db, "tokenHistory"), where("studentId", "==", uid)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

// ─── Rewards catalog ──────────────────────────────────────────────────────────

export const addReward = (data, teacherUid) =>
  addDoc(collection(db, "rewards"), {
    ...data,
    createdBy: teacherUid,
    createdAt: serverTimestamp(),
  });

export const updateReward = (id, data) => updateDoc(doc(db, "rewards", id), data);

export const deleteReward = (id) => deleteDoc(doc(db, "rewards", id));

export const subscribeRewards = (callback) =>
  onSnapshot(collection(db, "rewards"), (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

// ─── Redemption requests ──────────────────────────────────────────────────────
// Tokens are NOT deducted at request time — only when the teacher approves.

export const createRedemptionRequest = (user, reward) =>
  addDoc(collection(db, "redemptionRequests"), {
    studentId: user.uid,
    studentName: user.displayName ?? "",
    rewardId: reward.id,
    rewardName: reward.name,
    tokenCost: reward.tokenCost,
    status: "pending",
    requestedAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });

export const subscribeMyRequests = (uid, callback) =>
  onSnapshot(
    query(collection(db, "redemptionRequests"), where("studentId", "==", uid)),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );

export const subscribeAllRequests = (callback) =>
  onSnapshot(collection(db, "redemptionRequests"), (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

// Approve atomically: re-check status, balance, and stock inside a
// transaction, then deduct tokens, decrement stock, and log the ledger entry.
export const approveRequest = (request, teacherUid) =>
  runTransaction(db, async (t) => {
    const reqRef     = doc(db, "redemptionRequests", request.id);
    const studentRef = doc(db, "students", request.studentId);
    const rewardRef  = doc(db, "rewards", request.rewardId);

    const [reqSnap, studentSnap, rewardSnap] = await Promise.all([
      t.get(reqRef), t.get(studentRef), t.get(rewardRef),
    ]);

    if (!reqSnap.exists() || reqSnap.data().status !== "pending")
      throw new Error("This request is no longer pending.");
    const balance = studentSnap.exists() ? (studentSnap.data().tokenBalance ?? 0) : 0;
    if (balance < request.tokenCost)
      throw new Error(`Student has ${formatTokens(balance)} tokens but the reward costs ${formatTokens(request.tokenCost)}.`);
    const trackStock = rewardSnap.exists() && typeof rewardSnap.data().stock === "number";
    if (trackStock && rewardSnap.data().stock <= 0)
      throw new Error("This reward is out of stock.");

    t.set(studentRef, {
      tokenBalance: increment(-request.tokenCost),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    if (trackStock) t.update(rewardRef, { stock: increment(-1) });
    t.update(reqRef, {
      status: "approved",
      resolvedAt: serverTimestamp(),
      resolvedBy: teacherUid,
    });
    t.set(doc(collection(db, "tokenHistory")), {
      studentId: request.studentId,
      studentName: request.studentName ?? "",
      amount: -request.tokenCost,
      type: "redemption",
      rewardId: request.rewardId,
      rewardName: request.rewardName ?? "",
      timestamp: serverTimestamp(),
    });
  });

export const rejectRequest = (requestId, teacherUid, reason) =>
  updateDoc(doc(db, "redemptionRequests", requestId), {
    status: "rejected",
    resolvedAt: serverTimestamp(),
    resolvedBy: teacherUid,
    rejectReason: reason || "",
  });

// ─── Permanent student deletion ────────────────────────────────────────────────
// Two-step: gather every doc reference first (so the confirmation modal shows
// exactly what will be deleted), then delete precisely those refs — nothing
// is re-queried between preview and commit.

// Firestore hard-caps a single batch at 500 writes; 400 leaves headroom.
// Exported so it's directly testable without constructing 400 fake refs.
export function chunkRefs(refs, size = 400) {
  const chunks = [];
  for (let i = 0; i < refs.length; i += size) chunks.push(refs.slice(i, i + size));
  return chunks;
}

export const previewStudentDeletion = async (uid) => {
  const [resultsSnap, historySnap, requestsSnap, allSessions] = await Promise.all([
    getDocs(query(collection(db, "results"), where("studentUid", "==", uid))),
    getDocs(query(collection(db, "tokenHistory"), where("studentId", "==", uid))),
    getDocs(query(collection(db, "redemptionRequests"), where("studentId", "==", uid))),
    getAllSessions(),
  ]);

  // A join marker doc doesn't exist for every session the student never
  // joined, so each candidate has to be checked individually.
  const joinRefs = allSessions.map((sess) => doc(db, "sessions", sess.id, "joins", uid));
  const joinSnaps = await Promise.all(joinRefs.map((ref) => getDoc(ref)));
  const existingJoinRefs = joinRefs.filter((_, i) => joinSnaps[i].exists());

  return {
    studentRef: doc(db, "students", uid),
    resultRefs: resultsSnap.docs.map((d) => d.ref),
    tokenHistoryRefs: historySnap.docs.map((d) => d.ref),
    requestRefs: requestsSnap.docs.map((d) => d.ref),
    joinRefs: existingJoinRefs,
  };
};

// Deletes exactly the refs a prior previewStudentDeletion() collected. Each
// chunk of ≤400 commits as one atomic batch; a student with under ~400 total
// documents (true for every account in this app today) is deleted in a
// single all-or-nothing batch. A student who somehow exceeds that would be
// deleted across multiple batches — each chunk is still atomic, but the
// operation as a whole would not be, on a catastrophic failure between
// chunks. Documented rather than silently overclaimed.
export const commitStudentDeletion = async (preview) => {
  const allRefs = [
    preview.studentRef,
    ...preview.resultRefs,
    ...preview.tokenHistoryRefs,
    ...preview.requestRefs,
    ...preview.joinRefs,
  ];
  for (const chunk of chunkRefs(allRefs)) {
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};
