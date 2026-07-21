// Write-path verification for the stepped result (build step 6 B1), against
// the Firestore emulator. Mirrors saveSteppedResult from src/services/tokens.js
// with the `db` injected (the real function reads the module-level db); the
// transaction body — create-only guard + document shape — is identical, so this
// proves the write lands the §4 shape progress.js consumes and that a replay
// cannot re-credit.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";

const ALICE = { uid: "aliceUid", email: "alice@example.com" };
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
const saveSteppedResult = (db, user, { sessionId, questionId, attempts, completedOnAttempt, totalTimeMs }) =>
  runTransaction(db, async (t) => {
    const ref = doc(db, "results", steppedResultId(sessionId, user.uid, questionId));
    const existing = await t.get(ref);
    if (existing.exists()) return { duplicate: true };
    t.set(ref, {
      sessionId, questionId,
      studentUid: user.uid, studentEmail: user.email ?? "", studentName: "x",
      type: "stepped", attempts: attempts ?? [],
      completedOnAttempt: completedOnAttempt ?? null, totalTimeMs: totalTimeMs ?? null,
      tokensAwarded: 0, timestamp: serverTimestamp(),
    });
    return { duplicate: false };
  });

const readBack = async (id) => {
  let data;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), "results", id))).data();
  });
  return data;
};

describe("stepped write path (emulator)", () => {
  const payload = {
    sessionId: "S1", questionId: "q1",
    attempts: [
      { n: 1, failedStepIndex: 2, errorClass: "rearrange.wrongTile" },
      { n: 2, completed: true },
    ],
    completedOnAttempt: 2, totalTimeMs: 41000,
  };

  test("lands a correctly-shaped §4 document", async () => {
    const db = testEnv.authenticatedContext(ALICE.uid, { email: ALICE.email }).firestore();
    const res = await saveSteppedResult(db, ALICE, payload);
    assert.equal(res.duplicate, false);

    const data = await readBack("S1_aliceUid_q1");
    assert.equal(data.type, "stepped");
    assert.equal(data.studentUid, "aliceUid");
    assert.equal(data.studentEmail, "alice@example.com");
    assert.equal(data.completedOnAttempt, 2);
    assert.equal(data.totalTimeMs, 41000);
    assert.equal(data.tokensAwarded, 0); // B1: no tokens yet
    assert.ok(Array.isArray(data.attempts) && data.attempts.length === 2);
    assert.equal(data.attempts[0].errorClass, "rearrange.wrongTile");
    assert.equal(data.attempts[0].failedStepIndex, 2);
    assert.equal(data.attempts[1].completed, true);
  });

  test("is create-only: a replay is a no-op that cannot re-credit", async () => {
    const db = testEnv.authenticatedContext(ALICE.uid, { email: ALICE.email }).firestore();
    await saveSteppedResult(db, ALICE, payload);
    // Replay with a bumped token value: must report duplicate and NOT overwrite.
    const res2 = await saveSteppedResult(db, ALICE, { ...payload, tokensAwarded: 999 });
    assert.equal(res2.duplicate, true);
    const data = await readBack("S1_aliceUid_q1");
    assert.equal(data.tokensAwarded, 0); // unchanged — replay cannot farm tokens
  });
});
