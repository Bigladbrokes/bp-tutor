// Deterministic per-student option shuffling for multiple-choice questions.
//
// The order is a pure function of (studentUid, questionId): stable across
// renders, retries, refreshes, and devices — a student's options never jump
// around — but different students see different orders, so "the answer is C"
// copied from a neighbor is meaningless.
//
// Selection, grading, and stored results all stay in ORIGINAL-index space;
// only the display order changes.

// FNV-1a 32-bit string hash
export const hashSeed = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// mulberry32 — tiny deterministic PRNG (also shared by steppedParams.js —
// exported so the implementation exists exactly once)
export const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Returns [{ text, originalIndex }] in the order this student should see.
export const shuffledOptions = (question, studentUid) => {
  const items = (question.options || []).map((text, originalIndex) => ({ text, originalIndex }));
  const rand = mulberry32(hashSeed(`${studentUid}:${question.id}`));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
