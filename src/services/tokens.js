import {
  collection, doc, addDoc, deleteDoc, getDoc, onSnapshot, query, where,
  runTransaction, serverTimestamp, increment, updateDoc, setDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";

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

// Record "finished this session" on the student's own doc, so clearing
// localStorage or switching devices shows the done screen instead of
// restarting the quiz (StudentPage keeps localStorage as the fast path).
export const markSessionCompleted = (uid, sessionId) =>
  setDoc(doc(db, "students", uid), {
    completedSessions: { [sessionId]: true },
  }, { merge: true });

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

// One award "slot" per result row: an MC question, a FitB blank, or a
// solution step. Blank/step ids only need to be unique within their question.
export const questionAwardSlot = ({ questionId, blankId, stepId }) =>
  blankId != null ? `${questionId}_b${blankId}`
    : stepId != null ? `${questionId}_s${stepId}`
    : String(questionId);

// Award earned tokens and write the ledger entry in one atomic batch.
// The ledger doc id is deterministic per (session, student, slot) and
// tokenHistory forbids updates, so re-answering the same slot — from another
// device, or after clearing localStorage — rejects the whole batch instead
// of paying twice. Balance and ledger can therefore never drift apart.
export const awardQuestionTokens = (user, amount, meta) => {
  if (!amount || amount <= 0) return Promise.resolve();
  const slot = questionAwardSlot(meta);
  const batch = writeBatch(db);
  batch.set(doc(db, "students", user.uid), {
    tokenBalance: increment(amount),
    studentName: user.displayName ?? "",
    studentEmail: user.email ?? "",
    photoURL: user.photoURL ?? "",
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(db, "tokenHistory", `${meta.sessionId}_${user.uid}_${slot}`), {
    studentId: user.uid,
    studentName: user.displayName ?? "",
    amount,
    type: "question",
    sessionId: meta.sessionId,
    questionId: meta.questionId ?? null,
    slot,
    difficulty: meta.difficulty ?? "Easy",
    timestamp: serverTimestamp(),
  });
  return batch.commit();
};

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
