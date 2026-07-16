// Normalizes a math answer (typed by hand or via the Math Keypad) into a
// canonical string, so that many syntactically different but mathematically
// equivalent ways of writing the same thing compare equal. Used by both
// fill-in-blank and independent-step matching in StudentPage.js. The
// existing numeric-tolerance fallback is unchanged and runs separately,
// after canonical-string comparison fails.

const SUPERSCRIPT_MAP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

// True if `s` is wrapped in exactly one matching outer pair of parens, e.g.
// "(a+b)" -> true, "(a)+(b)" -> false (the leading "(" closes before the
// string ends). Used to avoid double-wrapping an already-parenthesized
// fraction part into "((a+b))".
function isFullyParenthesized(s) {
  if (s.length < 2 || s[0] !== "(" || s[s.length - 1] !== ")") return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    if (depth === 0 && i < s.length - 1) return false; // closed before the end
  }
  return depth === 0;
}

// A fraction part needs wrapping in parens when substituted into "num/den"
// if it's "compound" — contains an operator or whitespace (i.e. more than
// one token) — since division binds tighter than +/- and dropping the
// grouping would silently change the meaning (\frac{a+b}{c} must stay
// different from a+b/c). A part already fully wrapped in one pair of parens
// is left as-is rather than double-wrapped.
//
// NOTE: this is a plain substring check on the RAW captured text, not
// brace-depth-aware — a single nested term like "\sqrt{a+b}" contains a "+"
// and would be (harmlessly) wrapped too, even though it's really one atomic
// token. Over-wrapping a single term never changes its meaning, but means
// it won't textually match an unwrapped equivalent typed a different way.
// Not exercised by any case this app actually needs (quadratic-formula-style
// numerators and simpler numeric slots all wrap the way you'd expect).
function wrapFractionPart(raw) {
  const trimmed = raw.trim();
  if (!/[+\-*/^\s]/.test(trimmed)) return trimmed;
  if (isFullyParenthesized(trimmed)) return trimmed;
  return `(${trimmed})`;
}

// Extracts the content of a brace-delimited group starting at `s[start]`
// (`s[start]` must be "{"), respecting nested braces — needed because a
// fraction's numerator/denominator may itself contain e.g. \sqrt{...}, which
// a simple non-nested regex (`[^{}]*`) cannot capture correctly. Returns
// { content, endIndex } (endIndex = just past the matching "}"), or null if
// the braces never balance (e.g. mid-typing, "\frac{1}{").
function extractBraceGroup(s, start) {
  if (s[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return { content: s.slice(start + 1, i), endIndex: i + 1 };
    }
  }
  return null;
}

// Replaces every \frac{a}{b} (or bare frac{a}{b}) with a/b, wrapping either
// part in parens if it's compound. Runs BEFORE the whitespace-strip below,
// so "contains a space" is still a visible signal for compound-detection.
function replaceFractions(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const hasBackslash = s[i] === "\\" && s.slice(i + 1, i + 5) === "frac";
    const bare = s.slice(i, i + 4) === "frac";
    const fracStart = hasBackslash ? i + 1 : (bare ? i : -1);

    if (fracStart !== -1 && s[fracStart + 4] === "{") {
      const numGroup = extractBraceGroup(s, fracStart + 4);
      const denGroup = numGroup && s[numGroup.endIndex] === "{" ? extractBraceGroup(s, numGroup.endIndex) : null;
      if (numGroup && denGroup) {
        out += `${wrapFractionPart(numGroup.content)}/${wrapFractionPart(denGroup.content)}`;
        i = denGroup.endIndex;
        continue;
      }
    }
    out += s[i];
    i++;
  }
  return out;
}

export function normalizeMathAnswer(input) {
  let s = String(input ?? "").toLowerCase();

  s = replaceFractions(s);
  s = s.replace(/\s+/g, "");

  // ** and unicode superscripts -> ^
  s = s.replace(/\*\*/g, "^");
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (d) => "^" + SUPERSCRIPT_MAP[d]);

  // Cube root BEFORE square root: "\sqrt[3]{...}" contains the substring
  // "\sqrt", so handling square root first would mangle it.
  s = s.replace(/∛\(([^)]*)\)/g, "cbrt($1)");
  s = s.replace(/∛(\d+(?:\.\d+)?)/g, "cbrt($1)");
  s = s.replace(/\\sqrt\[3\]\{([^{}]*)\}/g, "cbrt($1)");
  s = s.replace(/\\sqrt\[3\](\d+(?:\.\d+)?)/g, "cbrt($1)");
  s = s.replace(/cbrt(\d+(?:\.\d+)?)/g, "cbrt($1)"); // bare "cbrt5" -> "cbrt(5)"

  // Square root.
  s = s.replace(/รูท/g, "sqrt"); // Thai for "root"
  s = s.replace(/√/g, "sqrt");
  s = s.replace(/\\sqrt/g, "sqrt");
  s = s.replace(/sqrt\{([^{}]*)\}/g, "sqrt($1)");
  s = s.replace(/sqrt(\d+(?:\.\d+)?)/g, "sqrt($1)"); // bare "sqrt5" -> "sqrt(5)"

  // Operators.
  s = s.replace(/÷/g, "/");
  s = s.replace(/×/g, "*");

  return s;
}
