import React from "react";
import { InlineMath } from "react-katex";

// Compact math keypad for phones that can't type √ or LaTeX syntax. Inserts
// at the cursor position of whichever field is currently active (tracked by
// the caller via `inputRef`/`value`/`onChange`), and supplements the native
// keyboard rather than replacing it — normal typing keeps working untouched.
//
// Every button's insertion is a { before, after } pair; the cursor always
// lands right after `before` (i.e. "inside" when `after` is non-empty, or
// simply "at the end" when there's nothing to fill).
const KEYS = [
  { label: "√",   title: "Square root",  before: "\\sqrt{", after: "}" },
  { label: "∛",   title: "Cube root",    before: "\\sqrt[3]{", after: "}" },
  { label: "x²",  title: "Squared",      before: "^2", after: "" },
  { label: "x³",  title: "Cubed",        before: "^3", after: "" },
  { label: "a/b", title: "Fraction",     before: "\\frac{", after: "}{}" },
  { label: "π",   title: "Pi",           before: "π", after: "" },
  { label: "°",   title: "Degrees",      before: "°", after: "" },
  { label: "×",   title: "Multiply",     before: "×", after: "" },
  { label: "÷",   title: "Divide",       before: "÷", after: "" },
  { label: "±",   title: "Plus/minus",   before: "±", after: "" },
];

// Renders `value` as LaTeX; falls back to plain text instead of a jarring
// red KaTeX error block while the student is still mid-expression (e.g.
// "\sqrt{" with no closing brace yet).
function LivePreview({ value }) {
  if (!value.trim()) {
    return <span style={s.previewPlaceholder}>Preview appears here as you type…</span>;
  }
  return (
    <InlineMath
      math={value}
      renderError={() => <span style={s.previewRaw}>{value}</span>}
    />
  );
}

export default function MathKeypad({ value, inputRef, onChange }) {
  const handleKey = (key) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const newValue = value.slice(0, start) + key.before + key.after + value.slice(end);
    const newCursor = start + key.before.length;

    onChange(newValue);

    // The DOM node needs the new value committed (React re-render) before
    // the cursor position can be set inside it.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });
  };

  return (
    <div style={s.wrapper}>
      <div style={s.previewBox}>
        <LivePreview value={value} />
      </div>
      <div style={s.keyRow}>
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            title={key.title}
            // Prevents the browser's default focus-shift, so the input
            // never blurs and its cursor position/selection survives the tap.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleKey(key)}
            style={s.key}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const s = {
  // Normal document flow only — never fixed/absolute, so it can't cover the
  // input or the Check button on a short screen.
  wrapper: { display: "flex", flexDirection: "column", gap: "8px", margin: "8px 0" },
  previewBox: {
    minHeight: "34px", padding: "8px 12px",
    background: "#f8f9fa", border: "1px solid #e0e0e0", borderRadius: "8px",
    fontSize: "16px", display: "flex", alignItems: "center", overflowX: "auto",
  },
  previewPlaceholder: { color: "#aaa", fontSize: "13px", fontStyle: "italic" },
  previewRaw: { color: "#888", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "14px" },
  keyRow: { display: "flex", flexWrap: "wrap", gap: "6px" },
  key: {
    minWidth: "44px", minHeight: "44px", flex: "0 0 auto",
    background: "#fff", border: "1.5px solid #ce93d8", borderRadius: "8px",
    fontSize: "16px", fontWeight: "600", color: "#6a1b9a", cursor: "pointer",
  },
};
