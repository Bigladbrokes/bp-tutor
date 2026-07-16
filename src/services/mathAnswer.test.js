import { normalizeMathAnswer as n } from "./mathAnswer";

// ─── Square root — all forms equivalent to √5 ─────────────────────────────────

test("square root: sqrt5, sqrt(5), sqrt 5, √5, รูท5, \\sqrt5, \\sqrt{5} all equal", () => {
  const forms = ["sqrt5", "sqrt(5)", "sqrt 5", "√5", "รูท5", "\\sqrt5", "\\sqrt{5}"];
  const canonical = n(forms[0]);
  for (const f of forms) expect(n(f)).toBe(canonical);
});

// ─── Exponents ─────────────────────────────────────────────────────────────────

test("exponents: ^2, ², **2 all equal", () => {
  expect(n("x^2")).toBe(n("x²"));
  expect(n("x^2")).toBe(n("x**2"));
});

// ─── Operators ───────────────────────────────────────────────────────────────

test("division: / and ÷ are equivalent", () => {
  expect(n("6/2")).toBe(n("6÷2"));
});

test("multiplication: * and × are equivalent", () => {
  expect(n("2*3")).toBe(n("2×3"));
});

// ─── Fractions — simple case ───────────────────────────────────────────────────

test("simple fraction: \\frac{1}{2} equals 1/2", () => {
  expect(n("\\frac{1}{2}")).toBe(n("1/2"));
});

test("simple fraction: \\frac{3}{4} equals 3/4", () => {
  expect(n("\\frac{3}{4}")).toBe(n("3/4"));
});

// ─── Case + whitespace ─────────────────────────────────────────────────────────

test("case insensitive: SQRT(5), Sqrt(5), sqrt(5) all equal", () => {
  const c = n("sqrt(5)");
  expect(n("SQRT(5)")).toBe(c);
  expect(n("Sqrt(5)")).toBe(c);
});

test("whitespace variations collapse to the same canonical form", () => {
  expect(n(" sqrt ( 5 ) ")).toBe(n("sqrt(5)"));
});

// ─── Cube root (added since the keypad needs it — flagged when the spec was proposed) ──

test("cube root: ∛8, \\sqrt[3]{8}, \\sqrt[3]8, cbrt(8), cbrt8 all equal", () => {
  const forms = ["∛8", "\\sqrt[3]{8}", "\\sqrt[3]8", "cbrt(8)", "cbrt8"];
  const canonical = n(forms[0]);
  for (const f of forms) expect(n(f)).toBe(canonical);
});

// ─── REQUIRED CHANGE: compound fraction parts get parens, simple ones don't ────

test("compound numerator: \\frac{a+b}{c} equals (a+b)/c", () => {
  expect(n("\\frac{a+b}{c}")).toBe(n("(a+b)/c"));
});

test("compound numerator without wrapping must stay DIFFERENT: \\frac{a+b}{c} != a+b/c", () => {
  // a+b/c means a + (b/c) under standard precedence — mathematically
  // different from (a+b)/c. Dropping parens here would be a silent
  // correctness bug, exactly what this test guards against.
  expect(n("\\frac{a+b}{c}")).not.toBe(n("a+b/c"));
});

test("simple fraction is unchanged (no spurious wrapping): \\frac{1}{2} equals 1/2", () => {
  // Same case as above, restated explicitly per the required test list.
  expect(n("\\frac{1}{2}")).toBe("1/2");
});

test("nested: \\frac{\\sqrt{2}}{2} equals sqrt(2)/2", () => {
  // The numerator itself contains braces (\sqrt{2}) — this is the case a
  // plain non-nested regex ([^{}]*) cannot capture correctly; the
  // brace-depth-aware scanner is what makes this pass.
  expect(n("\\frac{\\sqrt{2}}{2}")).toBe("sqrt(2)/2");
});

test("double-paren avoidance: \\frac{(a+b)}{c} does not become ((a+b))/c", () => {
  expect(n("\\frac{(a+b)}{c}")).toBe("(a+b)/c");
  // Must also match the unwrapped-source version, proving no double-wrap:
  expect(n("\\frac{(a+b)}{c}")).toBe(n("\\frac{a+b}{c}"));
});

test("the quadratic formula's compound numerator wraps as one unit", () => {
  // The motivating case: -b ± √(b²-4ac) over 2a. The whole numerator must be
  // treated as one atomic unit divided by 2a, not split apart.
  const quadratic = n("\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}");
  expect(quadratic.startsWith("(-b")).toBe(true);
  expect(quadratic.endsWith(")/2a")).toBe(true);
});

test("multiple fractions in one expression both resolve correctly", () => {
  expect(n("\\frac{1}{2}+\\frac{3}{4}")).toBe(n("1/2+3/4"));
});

test("an unbalanced/incomplete fraction (mid-typing) does not crash", () => {
  expect(() => n("\\frac{1}{")).not.toThrow();
});

// ─── Wrong answers must STILL be wrong (the safety net) ────────────────────────

test("5 does not equal √5 (the exact false-accept this app fixed once already)", () => {
  expect(n("5")).not.toBe(n("√5"));
});

test("4 does not equal √5 (not 'any number matches any sqrt')", () => {
  expect(n("4")).not.toBe(n("√5"));
});

test("different radicands stay different: sqrt(4) != sqrt(5)", () => {
  expect(n("sqrt(4)")).not.toBe(n("sqrt(5)"));
});

test("different exponents stay different: x^2 != x^3", () => {
  expect(n("x^2")).not.toBe(n("x^3"));
});

test("different fractions stay different: 1/2 != 1/3", () => {
  expect(n("1/2")).not.toBe(n("1/3"));
});

test("multiply and divide canonicalize to DIFFERENT symbols, not merged: 2*3 != 2/3", () => {
  expect(n("2*3")).not.toBe(n("2/3"));
});

test("square root and cube root of the same number stay distinct", () => {
  expect(n("cbrt(8)")).not.toBe(n("sqrt(8)"));
});

test("empty/missing input does not crash", () => {
  expect(() => n("")).not.toThrow();
  expect(() => n(undefined)).not.toThrow();
  expect(() => n(null)).not.toThrow();
});
