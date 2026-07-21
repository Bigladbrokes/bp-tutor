// Firestore security-rules tests (build step 6 B1). Runs OUTSIDE Create React
// App's jest (it lives outside src/), against the Firestore emulator via
// `npm run test:rules`, which wraps this in `firebase emulators:exec`.
//
// Focus: the NEW stepped result shape must be writable only by its own student
// and never rewritable (anti-replay), while every existing (legacy 4-segment)
// result behavior is unchanged.
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs,
} from "firebase/firestore";

const PROJECT_ID = "demo-bp-tutor";
const TEACHER_EMAIL = "bigladbrokes1@gmail.com"; // must match isTeacher() in firestore.rules

const ALICE = { uid: "aliceUid", email: "alice@example.com" };
const BOB = { uid: "bobUid", email: "bob@example.com" };

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
after(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

const asStudent = ({ uid, email }) => testEnv.authenticatedContext(uid, { email }).firestore();

// A well-formed stepped result owned by `user`, in the §4 shape.
const steppedDocFor = ({ uid, email }, over = {}) => ({
  sessionId: "S1",
  questionId: "q1",
  studentUid: uid,
  studentEmail: email,
  studentName: "x",
  type: "stepped",
  attempts: [
    { n: 1, failedStepIndex: 0, errorClass: "givens.wrongValue" },
    { n: 2, completed: true },
  ],
  completedOnAttempt: 2,
  totalTimeMs: 1000,
  tokensAwarded: 0,
  ...over,
});
const steppedId = ({ uid }, qid = "q1") => `S1_${uid}_${qid}`;

// A legacy 4-segment MC result in the OLD shape (no type / attempts).
const legacyDocFor = ({ uid, email }, over = {}) => ({
  sessionId: "S1",
  questionId: "q1",
  studentUid: uid,
  studentEmail: email,
  studentName: "x",
  mode: "guided",
  correct: true,
  difficulty: "Easy",
  ...over,
});
const legacyId = ({ uid }) => `S1_${uid}_q1_mc`;

const seed = (fn) => testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

describe("stepped result create — ownership", () => {
  test("a student creates their own stepped result", async () => {
    const db = asStudent(ALICE);
    await assertSucceeds(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE)));
  });

  test("cannot create another student's stepped result", async () => {
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", steppedId(BOB)), steppedDocFor(BOB)));
  });

  test("cannot write another uid's ID slot even carrying own studentUid", async () => {
    const db = asStudent(ALICE);
    // id segment [1] is bob, so the deterministic-ID check fails regardless of fields
    await assertFails(setDoc(doc(db, "results", `S1_${BOB.uid}_q1`), steppedDocFor(ALICE)));
  });

  test("mismatched studentEmail is rejected", async () => {
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE, { studentEmail: "evil@example.com" })));
  });

  test("an unauthenticated user cannot create a stepped result", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE)));
  });
});

describe("stepped result — anti-replay (the token-farming guard)", () => {
  test("a student cannot update an existing stepped result", async () => {
    await seed((db) => setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE)));
    const db = asStudent(ALICE);
    await assertFails(updateDoc(doc(db, "results", steppedId(ALICE)), { tokensAwarded: 999 }));
  });

  test("a student cannot overwrite (setDoc) an existing stepped result", async () => {
    await seed((db) => setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE)));
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE, { tokensAwarded: 999 })));
  });
});

describe("stepped result — shape enforcement", () => {
  test("a 3-segment ID with a non-stepped type is rejected", async () => {
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE, { type: "mc" })));
  });

  test("a 3-segment ID with a non-list attempts is rejected", async () => {
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE, { attempts: "nope" })));
  });

  test("a stepped create with tokensAwarded != 0 is rejected (B1 token lock)", async () => {
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE, { tokensAwarded: 5 })));
  });

  test("a stepped create with tokensAwarded == 0 still succeeds", async () => {
    const db = asStudent(ALICE);
    await assertSucceeds(setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE, { tokensAwarded: 0 })));
  });
});

describe("stepped result — reads", () => {
  test("a student can get their own but not another's stepped result", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE));
      await setDoc(doc(db, "results", steppedId(BOB)), steppedDocFor(BOB));
    });
    const db = asStudent(ALICE);
    await assertSucceeds(getDoc(doc(db, "results", steppedId(ALICE))));
    await assertFails(getDoc(doc(db, "results", steppedId(BOB))));
  });

  test("a student can list only their own results, not a broad query", async () => {
    await seed(async (db) => {
      await setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE));
      await setDoc(doc(db, "results", steppedId(BOB)), steppedDocFor(BOB));
    });
    const db = asStudent(ALICE);
    await assertSucceeds(getDocs(query(collection(db, "results"), where("studentUid", "==", ALICE.uid))));
    await assertFails(getDocs(query(collection(db, "results"), where("studentUid", "==", BOB.uid))));
    await assertFails(getDocs(collection(db, "results")));
  });
});

describe("legacy result behavior — regression (must be unchanged)", () => {
  test("a legacy 4-segment MC result still creates with the old shape", async () => {
    const db = asStudent(ALICE);
    await assertSucceeds(setDoc(doc(db, "results", legacyId(ALICE)), legacyDocFor(ALICE)));
  });

  test("a student still cannot update a legacy result (anti-replay unchanged)", async () => {
    await seed((db) => setDoc(doc(db, "results", legacyId(ALICE)), legacyDocFor(ALICE)));
    const db = asStudent(ALICE);
    await assertFails(updateDoc(doc(db, "results", legacyId(ALICE)), { correct: false }));
  });

  test("a legacy create still requires the ownership fields", async () => {
    const db = asStudent(ALICE);
    await assertFails(setDoc(doc(db, "results", legacyId(ALICE)), legacyDocFor(ALICE, { studentUid: BOB.uid })));
  });

  test("the tokensAwarded==0 lock does NOT apply to legacy 4-segment IDs", async () => {
    const db = asStudent(ALICE);
    // A legacy row carrying a nonzero token field still creates — the lock is
    // stepped-only (this row's tokens are credited separately, as they always
    // were), proving the new constraint never leaked to the legacy path.
    await assertSucceeds(setDoc(doc(db, "results", legacyId(ALICE)), legacyDocFor(ALICE, { tokensAwarded: 5 })));
  });
});

describe("teacher access — sanity", () => {
  test("the teacher can read and update any result", async () => {
    await seed((db) => setDoc(doc(db, "results", steppedId(ALICE)), steppedDocFor(ALICE)));
    const tdb = testEnv.authenticatedContext("teacherUid", { email: TEACHER_EMAIL }).firestore();
    await assertSucceeds(getDoc(doc(tdb, "results", steppedId(ALICE))));
    await assertSucceeds(updateDoc(doc(tdb, "results", steppedId(ALICE)), { tokensAwarded: 5 }));
  });
});
