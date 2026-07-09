import React, { useCallback, useEffect, useRef, useState } from "react";
import { InlineMath, BlockMath } from "react-katex";

// Splits a string like "mass $m = \frac{F}{a}$ and $$E=mc^2$$"
// into alternating text / inline-math / block-math segments.
function parseSegments(text) {
  const segments = [];
  let s = text || "";

  while (s.length > 0) {
    // Block math $$...$$  (must check before single $)
    if (s.startsWith("$$")) {
      const end = s.indexOf("$$", 2);
      if (end !== -1) {
        segments.push({ type: "block", math: s.slice(2, end) });
        s = s.slice(end + 2);
        continue;
      }
    }

    const idx = s.indexOf("$");

    if (idx === -1) {
      segments.push({ type: "text", content: s });
      break;
    }

    if (idx > 0) {
      segments.push({ type: "text", content: s.slice(0, idx) });
      s = s.slice(idx);
      continue;
    }

    // Inline math $...$
    const close = s.indexOf("$", 1);
    if (close !== -1) {
      segments.push({ type: "inline", math: s.slice(1, close) });
      s = s.slice(close + 1);
    } else {
      segments.push({ type: "text", content: "$" });
      s = s.slice(1);
    }
  }

  return segments;
}

// Inline math shorter than this renders bare — no wrapper, so short formulas
// like $F = ma$ keep exact baseline alignment with the surrounding text.
const SCROLL_THRESHOLD = 24;

// Math wider than its container scrolls horizontally instead of breaking the
// layout (long equations on phones). Edge fades hint at hidden content and a
// one-time hint below invites the first scroll.
function ScrollableMath({ math, block }) {
  const scrollRef = useRef(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);
  const [scrolledOnce, setScrolledOnce] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    setHasOverflow(overflow);
    setFadeLeft(overflow && el.scrollLeft > 2);
    setFadeRight(overflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, math]);

  return (
    <span style={{ display: block ? "block" : "inline-block", maxWidth: "100%", verticalAlign: "middle" }}>
      <span style={{ display: "block", position: "relative" }}>
        <span
          ref={scrollRef}
          onScroll={() => { setScrolledOnce(true); update(); }}
          style={{
            display: "block",
            overflowX: "auto",
            overflowY: "hidden",
            whiteSpace: "nowrap",
            WebkitOverflowScrolling: "touch",
            padding: "4px 0",
            maxWidth: "100%",
          }}
        >
          {block ? <BlockMath math={math} /> : <InlineMath math={math} />}
        </span>
        {fadeLeft && (
          <span style={{ ...fadeStyle, left: 0, background: "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0))" }} />
        )}
        {fadeRight && (
          <span style={{ ...fadeStyle, right: 0, background: "linear-gradient(to left, rgba(255,255,255,0.95), rgba(255,255,255,0))" }} />
        )}
      </span>
      {hasOverflow && !scrolledOnce && (
        <span style={hintStyle}>← เลื่อนดูสมการทั้งหมด →</span>
      )}
    </span>
  );
}

const fadeStyle = {
  position: "absolute", top: 0, bottom: 0, width: "26px", pointerEvents: "none",
};

const hintStyle = {
  display: "block", textAlign: "center", fontSize: "11px", color: "#9aa5b1",
  paddingBottom: "2px", userSelect: "none",
};

export default function KaTeXRenderer({ text }) {
  if (!text) return null;

  return (
    <span>
      {parseSegments(text).map((seg, i) => {
        if (seg.type === "block") return <ScrollableMath key={i} math={seg.math} block />;
        if (seg.type === "inline") {
          return seg.math.length >= SCROLL_THRESHOLD
            ? <ScrollableMath key={i} math={seg.math} />
            : <InlineMath key={i} math={seg.math} />;
        }
        return <span key={i}>{seg.content}</span>;
      })}
    </span>
  );
}
