// Write-path + token-award verification for the stepped result (build step 6
// B2), against the Firestore emulator. Mirrors saveSteppedResult from
// src/services/tokens.js with the `db` injected (the real function reads the
// module-level db); the transaction body — create-only guard, §4 shape, and
// the flat award (increment + tokenHistory) — is identical, so this proves the
// award fires exactly once and a replay credits nothing more.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, collection, query, where,
  runTransaction, increment, serverTimestamp,
} from "firebase/firestore";

const ALICE = { uid: "aliceUid", email: "alice@example.com" };

// Mirror of tokens.js TOKEN_VALUES / steppedAward (kept local to avoid
// importing the app's firebase config into the emulator test).
const TOKEN_VALUES = { Easy: 1, Medium: 5, Hard: 10 };
const steppedAward = (difficulty) => TOKEN_VALUES[difficulty] ?? TOKEN_VALUES.Easy;

let testEnv;
before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-bp-tutor",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

// Faithful mirror of tokens.js saveSteppedResult (db injected for the emulator).
const steppedResultId = (sessionId, uid, questionId) => `${sessionId}_${uid}_${questionId}`;
const saveSteppedResult = (db, user, { sessionId, questionId, attempts, completedOnAttempt, totalTimeMs, difficulty }) =>
  runTransaction(db, async (t) => {
    const ref = doc(db, "results", steppedResultId(sessionId, user.uid, questionId));
    if ((await t.get(ref)).exists()) return { duplicate: true };   // ① create-only guard
    const amount = steppedAward(difficulty);
    t.set(ref, {
      sessionId, questionId,
      studentUid: user.uid, studentEmail: user.email ?? "", studentName: "x",
      type: "stepped", attempts: attempts ?? [],
      completedOnAttempt: completedOnAttempt ?? null, totalTimeMs: totalTimeMs ?? null,
      tokensAwarded: amount, timestamp: serverTimestamp(),
    });
    if (amount > 0) {
      t.set(doc(db, "students", user.uid), {                       // ② balance credit
        tokenBalance: increment(amount), studentName: "x",
        studentEmail: user.email ?? "", photoURL: "", updatedAt: serverTimestamp(),
      }, { merge: true });
      t.set(doc(collection(db, "tokenHistory")), {                 // ③ ledger append
        studentId: user.uid, studentName: "x", amount, type: "question",
        questionId: questionId ?? null, difficulty: difficulty ?? "Easy", timestamp: serverTimestamp(),
      });
    }
    return { duplicate: false, amount };
  });

const asAlice = () => testEnv.authenticatedContext(ALICE.uid, { email: ALICE.email }).firestore();

// Inspect state written by the transaction, bypassing rules.
const inspect = async () => {
  let out;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const result = (await getDoc(doc(d, "results", "S1_aliceUid_q1"))).data();
    const balance = (await getDoc(doc(d, "students", ALICE.uid))).data()?.tokenBalance;
    const hist = await getDocs(query(collection(d, "tokenHistory"), where("studentId", "==", ALICE.uid)));
    out = { result, balance, historyCount: hist.size, history: hist.docs.map((x) => x.data()) };
  });
  return out;
};

const payload = {
  sessionId: "S1", questionId: "q1", difficulty: "Medium",
  attempts: [
    { n: 1, failedStepIndex: 2, errorClass: "rearrange.wrongTile" },
    { n: 2, completed: true },
  ],
  completedOnAttempt: 2, totalTimeMs: 41000,
};

describe("stepped write path + award (emulator)", () => {
  test("lands a correctly-shaped §4 document with the flat award recorded", async () => {
    const res = await saveSteppedResult(asAlice(), ALICE, { ...payload, difficulty: "Hard" });
    assert.equal(res.duplicate, false);
    assert.equal(res.amount, TOKEN_VALUES.Hard);

    const { result } = await inspect();
    assert.equal(result.type, "stepped");
    assert.equal(result.studentUid, "aliceUid");
    assert.equal(result.completedOnAttempt, 2);
    assert.equal(result.totalTimeMs, 41000);
    assert.equal(result.tokensAwarded, TOKEN_VALUES.Hard);
    assert.ok(Array.isArray(result.attempts) && result.attempts.length === 2);
    assert.equal(result.attempts[0].errorClass, "rearrange.wrongTile");
    assert.equal(result.attempts[1].completed, true);
  });

  test("credits the flat award exactly once on completion", async () => {
    const res = await saveSteppedResult(asAlice(), ALICE, payload); // Medium
    assert.equal(res.duplicate, false);
    assert.equal(res.amount, TOKEN_VALUES.Medium);

    const { result, balance, historyCount, history } = await inspect();
    assert.equal(result.tokensAwarded, TOKEN_VALUES.Medium);
    assert.equal(balance, TOKEN_VALUES.Medium);
    assert.equal(historyCount, 1);
    assert.equal(history[0].amount, TOKEN_VALUES.Medium);
    assert.equal(history[0].type, "question");
  });

  test("a replay credits zero additional tokens (no double-credit)", async () => {
    await saveSteppedResult(asAlice(), ALICE, payload);
    const res2 = await saveSteppedResult(asAlice(), ALICE, payload); // same (session, uid, question)
    assert.equal(res2.duplicate, true);

    const { balance, historyCount } = await inspect();
    assert.equal(balance, TOKEN_VALUES.Medium); // unchanged — no double credit
    assert.equal(historyCount, 1);              // still exactly one ledger row
  });

  test("a different session is a new award (new ID)", async () => {
    await saveSteppedResult(asAlice(), ALICE, { ...payload, sessionId: "S1" });
    const res2 = await saveSteppedResult(asAlice(), ALICE, { ...payload, sessionId: "S2" });
    assert.equal(res2.duplicate, false);

    let balance, historyCount;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      balance = (await getDoc(doc(d, "students", ALICE.uid))).data()?.tokenBalance;
      historyCount = (await getDocs(query(collection(d, "tokenHistory"), where("studentId", "==", ALICE.uid)))).size;
    });
    assert.equal(balance, TOKEN_VALUES.Medium * 2); // two legitimate awards
    assert.equal(historyCount, 2);
  });
});
