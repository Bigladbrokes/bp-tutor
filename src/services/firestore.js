import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs, setDoc,
  query, orderBy, serverTimestamp, documentId,
  where, updateDoc, onSnapshot, writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";

// --- Questions ---

export const addQuestion = (data) =>
  addDoc(collection(db, "questions"), { ...data, createdAt: serverTimestamp() });

export const subscribeQuestions = (callback) => {
  const q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
};

export const deleteQuestion = (id) => deleteDoc(doc(db, "questions", id));

export const updateQuestion = (id, data) =>
  updateDoc(doc(db, "questions", id), data);

export const migrateGrades = async () => {
  const GRADE_MAP = { "7": "M.1", "8": "M.2", "9": "M.3" };
  const snap = await getDocs(collection(db, "questions"));
  const batch = writeBatch(db);
  snap.docs.forEach(d => {
    const mapped = GRADE_MAP[d.data().grade];
    if (mapped) batch.update(doc(db, "questions", d.id), { grade: mapped });
  });
  await batch.commit();
};

// --- Sessions ---

// Join codes avoid characters students confuse on a projector: no 0/O, 1/I/L
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const generateJoinCode = (taken = new Set()) => {
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)]
    ).join("");
  } while (taken.has(code));
  return code;
};

// Uppercase, drop spaces and anything outside the code alphabet, cap at 6
export const normalizeJoinCode = (raw) =>
  String(raw || "")
    .toUpperCase()
    .split("")
    .filter((c) => JOIN_CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, 6);

export const startSession = async (questionIds) => {
  // joinCode must be unique among ACTIVE sessions so /join is unambiguous
  const active = await getDocs(query(collection(db, "sessions"), where("isActive", "==", true)));
  const taken = new Set(active.docs.map((d) => d.data().joinCode).filter(Boolean));
  return addDoc(collection(db, "sessions"), {
    questionIds,
    joinCode: generateJoinCode(taken),
    isActive: true,
    startedAt: serverTimestamp(),
    endedAt: null,
  });
};

export const getSessionById = async (sessionId) => {
  const snap = await getDoc(doc(db, "sessions", sessionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Single-field equality query — auto-indexed, and permitted for any signed-in
// user because the sessions read rule has no per-document conditions.
export const findSessionByCode = async (code) => {
  const snap = await getDocs(query(collection(db, "sessions"), where("joinCode", "==", code)));
  const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return (
    sessions.find((s) => s.isActive) ??
    sessions.sort((a, b) => (b.startedAt?.toMillis() ?? 0) - (a.startedAt?.toMillis() ?? 0))[0] ??
    null
  );
};

// Presence marker so the teacher's QR modal can count joined students
export const markSessionJoin = (sessionId, user) =>
  setDoc(doc(db, "sessions", sessionId, "joins", user.uid), {
    studentName: user.displayName ?? "",
    joinedAt: serverTimestamp(),
  }, { merge: true });

export const subscribeSessionJoins = (sessionId, callback) =>
  onSnapshot(collection(db, "sessions", sessionId, "joins"), (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));

export const endSession = (sessionId) =>
  updateDoc(doc(db, "sessions", sessionId), {
    isActive: false,
    endedAt: serverTimestamp(),
  });

// --- Responses ---

export const getQuestionsByIds = async (ids) => {
  // Firestore "in" queries take at most 10 values, so fetch in chunks
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, "questions"), where(documentId(), "in", chunk)))
    )
  );
  return snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
};

// Result rows are written by saveResultWithTokens in services/tokens.js — one
// transaction that stores the row and credits its tokens idempotently.

export const subscribeResults = (sessionId, callback) => {
  const q = query(
    collection(db, "results"),
    where("sessionId", "==", sessionId)
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
};

// --- Sessions ---

export const subscribeActiveSession = (callback) => {
  const q = query(collection(db, "sessions"), where("isActive", "==", true));
  return onSnapshot(q, (snap) => {
    // If more than one session is somehow active, use the most recent one
    const first = [...snap.docs].sort(
      (a, b) => (b.data().startedAt?.toMillis() ?? 0) - (a.data().startedAt?.toMillis() ?? 0)
    )[0];
    callback(first ? { id: first.id, ...first.data() } : null);
  });
};
