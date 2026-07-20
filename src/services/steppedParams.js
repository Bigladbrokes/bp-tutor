// Template parameter generation for stepped-solver questions (build step 1).
//
// A stepped question is a TEMPLATE: its problem text contains placeholders
// like {vi}, {a}, {d}, and each attempt renders the template with freshly
// randomized values drawn from per-parameter grids. The draw is a pure
// function of (studentUid, questionId, attemptNo) — deterministic for the
// same attempt (refresh-safe, like the MC shuffle), different across
// attempts and across students (anti-copying, restart-with-new-numbers).
//
// Pure functions only — no Firebase imports (same conventions as progress.js).

import { hashSeed, mulberry32 } from "./shuffle";

// PRNG for one (student, question, attempt) triple. Reuses the exact hash +
// PRNG the MC shuffle uses; only the seed string differs by the attempt part.
export const steppedSeed = (uid, questionId, attemptNo) =>
  mulberry32(hashSeed(`${uid}:${questionId}:${attemptNo}`));

// Draws one value per param from its grid: min, min+step, …, max (inclusive
// when (max−min) is a whole number of steps). Formula per spec:
//   value = min + floor(rand() * gridCount) * step, rounded to dp decimals.
// gridCount uses Math.round to absorb float error in (max−min)/step (e.g.
// (3.0−2.0)/0.1 = 9.999…), and the index is clamped so a pathological
// rand() ≈ 1 with accumulated float error can never land past max.
export function generateParams(paramSpecs, rand) {
  const params = {};
  for (const [name, spec] of Object.entries(paramSpecs || {})) {
    const { min, max, step, dp = 0 } = spec;
    const gridCount = Math.round((max - min) / step) + 1;
    const index = Math.min(Math.floor(rand() * gridCount), gridCount - 1);
    params[name] = Number((min + index * step).toFixed(dp));
  }
  return params;
}

// Replaces {name} placeholders in template text with the param's value
// formatted to its spec'd dp (so d=140 with dp:1 renders as "140.0", matching
// how the reference app always shows one decimal). Placeholders without a
// matching param are left untouched.
export function injectParams(text, params, paramSpecs) {
  let out = String(text ?? "");
  for (const [name, value] of Object.entries(params || {})) {
    const dp = paramSpecs?.[name]?.dp ?? 0;
    out = out.split(`{${name}}`).join(Number(value).toFixed(dp));
  }
  return out;
}

// ─── Safe expression evaluator ────────────────────────────────────────────────
// Evaluates teacher-authored answer expressions like "sqrt(vi^2 + 2*a*d)"
// against a params object. No eval(); a small recursive-descent parser
// supporting + - * / ^ (right-assoc), unary minus, parentheses, sqrt(), and
// variables. Unknown variables or malformed input throw.

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const s = String(expr ?? "");
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (Number.isNaN(num)) throw new Error(`Invalid number at position ${i} in "${s}"`);
      tokens.push({ type: "num", value: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z_0-9]/.test(s[j])) j++;
      tokens.push({ type: "ident", value: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^()".includes(c)) {
      tokens.push({ type: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}" in expression "${s}"`);
  }
  return tokens;
}

export function evaluateAnswerExpr(expr, params) {
  const tokens = tokenize(expr);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const t = next();
    if (!t || t.type !== type) throw new Error(`Expected "${type}" in expression "${expr}"`);
    return t;
  };

  // expr := term (('+'|'-') term)*
  const parseExpr = () => {
    let v = parseTerm();
    while (peek() && (peek().type === "+" || peek().type === "-")) {
      v = next().type === "+" ? v + parseTerm() : v - parseTerm();
    }
    return v;
  };

  // term := unary (('*'|'/') unary)*
  const parseTerm = () => {
    let v = parseUnary();
    while (peek() && (peek().type === "*" || peek().type === "/")) {
      v = next().type === "*" ? v * parseUnary() : v / parseUnary();
    }
    return v;
  };

  // unary := '-' unary | power   (so -x^2 parses as -(x^2))
  const parseUnary = () => {
    if (peek() && peek().type === "-") { next(); return -parseUnary(); }
    return parsePower();
  };

  // power := primary ('^' unary)?   (right-assoc: 2^3^2 = 2^(3^2))
  const parsePower = () => {
    const base = parsePrimary();
    if (peek() && peek().type === "^") {
      next();
      return Math.pow(base, parseUnary());
    }
    return base;
  };

  // primary := number | '(' expr ')' | 'sqrt' '(' expr ')' | variable
  const parsePrimary = () => {
    const t = next();
    if (!t) throw new Error(`Unexpected end of expression "${expr}"`);
    if (t.type === "num") return t.value;
    if (t.type === "(") {
      const v = parseExpr();
      expect(")");
      return v;
    }
    if (t.type === "ident") {
      if (t.value === "sqrt") {
        expect("(");
        const v = parseExpr();
        expect(")");
        return Math.sqrt(v);
      }
      if (params && Object.prototype.hasOwnProperty.call(params, t.value)) {
        return Number(params[t.value]);
      }
      throw new Error(`Unknown variable "${t.value}" in expression "${expr}"`);
    }
    throw new Error(`Unexpected token in expression "${expr}"`);
  };

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error(`Trailing input in expression "${expr}"`);
  return result;
}

// Tolerance check for the final numeric answer (doc §3.4).
//   { type: "relative", value: 0.01 } → within 1% of |expected|
//   { type: "absolute", value: 0.1 }  → within 0.1 flat
// The comparison is inclusive with a float-safety epsilon:
//   pass iff |student − expected| ≤ tolAbs + 1e-9 · max(1, |expected|)
// The epsilon sits far below any precision a student can type, so grading
// strictness is unchanged — it only stops IEEE754 artifacts from rejecting
// mathematically-exact boundary answers (e.g. expected 29.6, absolute tol
// 0.1, student 29.7: the float diff is 0.10000000000000142).
export function checkAnswer(studentValue, expectedValue, tolerance) {
  const s = Number(studentValue);
  const e = Number(expectedValue);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  let tolAbs;
  if (tolerance?.type === "relative") tolAbs = tolerance.value * Math.abs(e);
  else if (tolerance?.type === "absolute") tolAbs = tolerance.value;
  else return false;
  const epsilon = 1e-9 * Math.max(1, Math.abs(e));
  return Math.abs(s - e) <= tolAbs + epsilon;
}
