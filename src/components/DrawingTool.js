import React, { useCallback, useEffect, useRef, useState } from "react";
import { uploadBase64Image } from "../services/storageService";

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const CW = 800;
const CH = 500;

// ─── Toolbar config ───────────────────────────────────────────────────────────

const TOOLS = [
  { id: "select",     icon: "↖",   short: "Select"  },
  { id: "line",       icon: "╱",   short: "Line"    },
  { id: "dashedLine", icon: "╌",   short: "Dash"    },
  { id: "dottedLine", icon: "·····", short: "Dot"   },
  { id: "rect",       icon: "□",   short: "Rect"    },
  { id: "ellipse",    icon: "○",   short: "Circle"  },
  { id: "triangle",   icon: "△",   short: "Triangle"},
  { id: "arrow",      icon: "→",   short: "Arrow"   },
  { id: "rightAngle", icon: "∟",   short: "Right∟" },
  { id: "text",       icon: "T",   short: "Text"    },
  { id: "eraser",     icon: "⌫",   short: "Eraser"  },
];

const STROKE_COLORS = ["#000000", "#c62828", "#1565c0", "#2e7d32"];
const WIDTHS = [{ label: "Thin", v: 1.5 }, { label: "Med", v: 3 }, { label: "Thick", v: 6 }];
const TEXT_SIZES = [{ label: "S", v: 14 }, { label: "M", v: 18 }, { label: "L", v: 24 }, { label: "XL", v: 32 }];
const FILLS  = [
  { label: "None",  v: "none",    bg: null },
  { label: "White", v: "#ffffff", bg: "#ffffff" },
  { label: "Gray",  v: "#e0e0e0", bg: "#e0e0e0" },
  { label: "Blue",  v: "#bbdefb", bg: "#bbdefb" },
];

// ─── Shape ID counter ─────────────────────────────────────────────────────────

let _sid = 0;
const uid = () => `s${++_sid}`;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

const dd = (ax, ay, bx, by) => Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);

function d2seg(px, py, ax, ay, bx, by) {
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  if (len2 === 0) return dd(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2));
  return dd(px, py, ax + t * (bx - ax), ay + t * (by - ay));
}

function ptInTri(px, py, a, b, c) {
  const s = (b.y - a.y) * (px - a.x) - (b.x - a.x) * (py - a.y);
  const t = (c.y - b.y) * (px - b.x) - (c.x - b.x) * (py - b.y);
  const u = (a.y - c.y) * (px - c.x) - (a.x - c.x) * (py - c.y);
  return (s >= 0) === (t >= 0) && (t >= 0) === (u >= 0);
}

// ─── Shape rendering ──────────────────────────────────────────────────────────
// Shape fields: { id, type, strokeColor, fillColor, lineWidth, isSelected }
// Per-type:
//   rect/ellipse : x, y, width, height
//   line/arrow   : x1, y1, x2, y2
//   triangle     : pts [{x,y},{x,y},{x,y}]
//   text         : x, y, text, fontSize

function drawShape(ctx, shape) {
  ctx.save();
  ctx.strokeStyle = shape.strokeColor || "#000000";
  ctx.lineWidth   = shape.lineWidth   || 2;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";
  const hasFill   = shape.fillColor && shape.fillColor !== "none";
  ctx.fillStyle   = hasFill ? shape.fillColor : "rgba(0,0,0,0)";

  switch (shape.type) {
    case "line":
      ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      break;

    case "dashedLine":
      ctx.setLineDash([8, 4]);
      ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;

    case "dottedLine":
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;

    case "arrow": {
      const ang = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
      const hl  = Math.max(14, 6 + shape.lineWidth * 3);
      ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(shape.x2, shape.y2);
      ctx.lineTo(shape.x2 - hl * Math.cos(ang - Math.PI / 6), shape.y2 - hl * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(shape.x2 - hl * Math.cos(ang + Math.PI / 6), shape.y2 - hl * Math.sin(ang + Math.PI / 6));
      ctx.closePath(); ctx.fillStyle = shape.strokeColor; ctx.fill();
      break;
    }

    case "rect":
      if (hasFill) ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      break;

    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(
        shape.x + shape.width / 2, shape.y + shape.height / 2,
        Math.max(1, Math.abs(shape.width / 2)), Math.max(1, Math.abs(shape.height / 2)),
        0, 0, Math.PI * 2
      );
      if (hasFill) ctx.fill();
      ctx.stroke();
      break;

    case "triangle":
      if (shape.pts && shape.pts.length === 3) {
        ctx.beginPath();
        ctx.moveTo(shape.pts[0].x, shape.pts[0].y);
        ctx.lineTo(shape.pts[1].x, shape.pts[1].y);
        ctx.lineTo(shape.pts[2].x, shape.pts[2].y);
        ctx.closePath();
        if (hasFill) ctx.fill();
        ctx.stroke();
      }
      break;

    case "text":
      ctx.font = `${shape.fontSize || 16}px sans-serif`;
      ctx.fillStyle = shape.strokeColor;
      ctx.fillText(shape.text, shape.x, shape.y);
      break;

    case "rightAngle": {
      // vertex is at (x, y); symbol opens up-right: two lines forming inner corner square
      const sz = shape.size || 20;
      ctx.beginPath();
      ctx.moveTo(shape.x,      shape.y - sz);
      ctx.lineTo(shape.x + sz, shape.y - sz);
      ctx.lineTo(shape.x + sz, shape.y);
      ctx.stroke();
      break;
    }

    default: break;
  }
  ctx.restore();
}

// ─── Bounding box ─────────────────────────────────────────────────────────────

function shapeBounds(shape) {
  switch (shape.type) {
    case "line": case "arrow":
      return { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2),
               w: Math.abs(shape.x2 - shape.x1) || 2, h: Math.abs(shape.y2 - shape.y1) || 2 };
    case "rect": case "ellipse":
      return { x: shape.x, y: shape.y, w: shape.width || 2, h: shape.height || 2 };
    case "triangle": {
      if (!shape.pts || shape.pts.length < 3) return null;
      const xs = shape.pts.map(p => p.x), ys = shape.pts.map(p => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys),
               w: Math.max(...xs) - Math.min(...xs) || 2,
               h: Math.max(...ys) - Math.min(...ys) || 2 };
    }
    case "text":
      return { x: shape.x - 2, y: shape.y - (shape.fontSize || 16) - 2,
               w: shape.text.length * 9 || 2, h: (shape.fontSize || 16) + 4 };
    case "dashedLine": case "dottedLine":
      return { x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2),
               w: Math.abs(shape.x2 - shape.x1) || 2, h: Math.abs(shape.y2 - shape.y1) || 2 };
    case "rightAngle": {
      const sz = shape.size || 20;
      return { x: shape.x, y: shape.y - sz, w: sz, h: sz };
    }
    default: return null;
  }
}

// ─── Hit test ─────────────────────────────────────────────────────────────────

function hitShape(px, py, shape) {
  switch (shape.type) {
    case "line": case "arrow":
      return d2seg(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= 8;
    case "rect": {
      const { x, y, w, h } = shapeBounds(shape);
      return px >= x - 5 && px <= x + w + 5 && py >= y - 5 && py <= y + h + 5;
    }
    case "ellipse": {
      const cx = shape.x + shape.width / 2;
      const cy = shape.y + shape.height / 2;
      const rx = Math.abs(shape.width  / 2) + 5;
      const ry = Math.abs(shape.height / 2) + 5;
      return ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
    }
    case "triangle":
      if (shape.pts && shape.pts.length === 3) {
        if (ptInTri(px, py, shape.pts[0], shape.pts[1], shape.pts[2])) return true;
        for (let j = 0; j < 3; j++) {
          const a = shape.pts[j], b = shape.pts[(j + 1) % 3];
          if (d2seg(px, py, a.x, a.y, b.x, b.y) <= 8) return true;
        }
      }
      return false;
    case "text": {
      const b = shapeBounds(shape);
      return b && px >= b.x - 5 && px <= b.x + b.w + 5 && py >= b.y - 5 && py <= b.y + b.h + 5;
    }
    case "dashedLine": case "dottedLine":
      return d2seg(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= 8;
    case "rightAngle": {
      const b = shapeBounds(shape);
      return b && px >= b.x - 5 && px <= b.x + b.w + 5 && py >= b.y - 5 && py <= b.y + b.h + 5;
    }
    default: return false;
  }
}

// ─── Selection handles ────────────────────────────────────────────────────────

function drawHandles(ctx, shape) {
  const b = shapeBounds(shape);
  if (!b) return;
  ctx.save();
  ctx.strokeStyle = "#1976d2";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
  ctx.setLineDash([]);
  ctx.fillStyle = "#1976d2";
  [[b.x - 6, b.y - 6], [b.x + b.w + 6, b.y - 6],
   [b.x - 6, b.y + b.h + 6], [b.x + b.w + 6, b.y + b.h + 6]].forEach(([hx, hy]) => {
    ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// ─── Move shape ───────────────────────────────────────────────────────────────

function moveShape(shape, dx, dy) {
  switch (shape.type) {
    case "line": case "arrow":
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    case "rect": case "ellipse":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case "triangle":
      return { ...shape, pts: shape.pts.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case "text":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case "dashedLine": case "dottedLine":
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    case "rightAngle":
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    default: return shape;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DrawingTool({ onInsert, onClose, backgroundUrl, initialShapes }) {
  const canvasRef  = useRef(null);
  const tiInputRef = useRef(null);

  // Canvas mutable state — in refs so mutations don't cause re-renders
  // If the question already has saved vector shapes, restore them (fully
  // editable) instead of loading the exported PNG as a locked background.
  const shapesRef  = useRef(null);
  const histRef    = useRef(null);   // history stack; [0] = initial state
  if (shapesRef.current === null) {
    const restored = (initialShapes || []).map((sh) => {
      const copy = { ...sh, id: uid(), isSelected: false };
      if (copy.pts) copy.pts = copy.pts.map((p) => ({ ...p }));
      return copy;
    });
    shapesRef.current = restored;
    histRef.current = [restored];
  }
  const hasRestoredShapes = (initialShapes?.length ?? 0) > 0;
  const histIdxRef = useRef(0);
  const prevRef    = useRef(null);   // shape being drawn (preview)
  const triPtsRef  = useRef([]);     // clicked points while drawing triangle
  const mouseRef   = useRef({ x: 0, y: 0 });
  const bgImageRef = useRef(null);   // { img, x, y, w, h } — locked background layer

  // dragRef: null when idle
  //   drawing mode  → { mx, my }
  //   select mode   → { mx, my, origShape }
  const dragRef = useRef(null);

  // Style refs mirror React state so event handlers (stable refs) always read current values
  const toolRef  = useRef("select");
  const colorRef = useRef("#000000");
  const lwRef    = useRef(1.5);
  const fillRef  = useRef("none");
  const fsRef    = useRef(18);

  // React state — only for UI rendering
  const [tool,        setToolSt]      = useState("select");
  const [color,       setColorSt]     = useState("#000000");
  const [lw,          setLwSt]        = useState(1.5);
  const [fill,        setFillSt]      = useState("none");
  const [fontSize,    setFontSizeSt]  = useState(18);
  const [triCount,    setTriCount]    = useState(0);
  const [saving,      setSaving]      = useState(false);
  const [hasBg,       setHasBg]       = useState(false);
  const [bgLoadFailed, setBgLoadFailed] = useState(false);
  const [textInput,   setTextInput]   = useState({ visible: false, sx: 0, sy: 0, cx: 0, cy: 0, value: "" });
  const textInputRef = useRef({ visible: false, sx: 0, sy: 0, cx: 0, cy: 0, value: "" });
  const snapRef      = useRef(false);

  const [snapGrid, setSnapGrid] = useState(false);

  // Setters keep state + ref in sync
  const setTool  = v => { toolRef.current = v; setToolSt(v); if (v !== "triangle") { triPtsRef.current = []; setTriCount(0); } };
  const setColor = v => { colorRef.current = v; setColorSt(v); };
  const setLw    = v => { lwRef.current    = v; setLwSt(v); };
  const setFill  = v => { fillRef.current  = v; setFillSt(v); };
  const setFontSize = (v) => {
    fsRef.current = v;
    setFontSizeSt(v);
    // If a text label is currently selected, resize it immediately
    const sel = shapesRef.current.find((sh) => sh.isSelected && sh.type === "text");
    if (sel) {
      shapesRef.current = shapesRef.current.map((sh) =>
        sh.id === sel.id ? { ...sh, fontSize: v } : sh
      );
      pushHist();
      redraw();
    }
  };

  // Style snapshot for a new shape
  const styleNow = () => ({
    strokeColor: colorRef.current,
    fillColor:   fillRef.current,
    lineWidth:   lwRef.current,
    isSelected:  false,
  });

  // ── Render: clear → background → shapes → handles → preview → triangle ──────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // 1. Clear with white
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CW, CH);

    // 1.5. Snap grid dots (drawn before background so bg covers them — intentional)
    if (snapRef.current) {
      ctx.fillStyle = "#c8d4e8";
      for (let gx = 0; gx <= CW; gx += 20) {
        for (let gy = 0; gy <= CH; gy += 20) {
          ctx.fillRect(gx - 1, gy - 1, 2, 2);
        }
      }
    }

    // 2. Background image — locked, non-selectable layer
    if (bgImageRef.current) {
      const { img, x, y, w, h } = bgImageRef.current;
      ctx.drawImage(img, x, y, w, h);
    }

    // 3. All committed shapes
    shapesRef.current.forEach(shape => drawShape(ctx, shape));

    // 4. Selection handles on the currently selected shape
    const selected = shapesRef.current.find(s => s.isSelected);
    if (selected) drawHandles(ctx, selected);

    // 5. In-progress preview shape (while drag-drawing)
    if (prevRef.current) drawShape(ctx, prevRef.current);

    // 6. Triangle placement preview (dashed lines + dot markers)
    const tpts = triPtsRef.current;
    if (toolRef.current === "triangle" && tpts.length > 0) {
      ctx.save();
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth   = lwRef.current;
      ctx.lineCap     = "round";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tpts[0].x, tpts[0].y);
      if (tpts.length >= 2) ctx.lineTo(tpts[1].x, tpts[1].y);
      const m = mouseRef.current;
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.setLineDash([]);
      tpts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = colorRef.current; ctx.fill();
      });
      ctx.restore();
    }
  }, []);

  useEffect(() => { redraw(); }, [redraw]);

  // ── Load background image (data: URL → direct; https: URL → fetch→blob) ──────

  useEffect(() => {
    // Vector shapes were restored — the PNG background isn't needed
    if (!backgroundUrl || hasRestoredShapes) return;
    let blobUrl = null;

    const applyImage = (src) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(CW / img.width, CH / img.height);
        const w = img.width  * scale;
        const h = img.height * scale;
        const x = (CW - w) / 2;
        const y = (CH - h) / 2;
        bgImageRef.current = { img, x, y, w, h };
        setHasBg(true);
        redraw();
      };
      img.onerror = () => setBgLoadFailed(true);
      img.src = src;
    };

    if (backgroundUrl.startsWith("data:")) {
      // Data URL is always same-origin — no CORS concern
      applyImage(backgroundUrl);
      return;
    }

    // Firebase Storage URL — fetch as blob to avoid canvas cross-origin taint
    const load = async () => {
      try {
        const response = await fetch(backgroundUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
        applyImage(blobUrl);
      } catch (err) {
        console.warn("[DrawingTool] Could not load background image:", err);
        setBgLoadFailed(true);
      }
    };

    load();
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [backgroundUrl, hasRestoredShapes, redraw]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CW / r.width),
      y: (e.clientY - r.top)  * (CH / r.height),
    };
  };

  const pushHist = () => {
    const h = histRef.current.slice(0, histIdxRef.current + 1);
    h.push(shapesRef.current.map(s => ({ ...s, pts: s.pts ? [...s.pts] : undefined })));
    histRef.current    = h;
    histIdxRef.current = h.length - 1;
  };

  const deselectAll = () =>
    shapesRef.current.map(s => ({ ...s, isSelected: false }));

  const setSnap = v => { snapRef.current = v; setSnapGrid(v); redraw(); };
  const snap    = v => snapRef.current ? Math.round(v / 20) * 20 : v;

  // ── Mouse / touch event handlers ──────────────────────────────────────────────

  const onMouseDown = (e) => {
    const { x, y } = getPos(e);
    const t = toolRef.current;

    // ── SELECT: find topmost shape under cursor, deselect everything else ──
    if (t === "select") {
      let found = null;
      for (let i = shapesRef.current.length - 1; i >= 0; i--) {
        if (hitShape(x, y, shapesRef.current[i])) { found = shapesRef.current[i]; break; }
      }
      shapesRef.current = shapesRef.current.map(s => ({ ...s, isSelected: s.id === found?.id }));
      // Selecting a text label syncs the Text size control to its size
      if (found?.type === "text" && found.fontSize) {
        fsRef.current = found.fontSize;
        setFontSizeSt(found.fontSize);
      }
      // Store drag origin only when a shape was found
      dragRef.current = found
        ? { mx: x, my: y, origShape: { ...found, pts: found.pts ? [...found.pts] : undefined } }
        : null;
      redraw();
      return;
    }

    // ── ERASER: remove topmost shape under cursor ──
    if (t === "eraser") {
      for (let i = shapesRef.current.length - 1; i >= 0; i--) {
        if (hitShape(x, y, shapesRef.current[i])) {
          shapesRef.current = shapesRef.current.filter((_, idx) => idx !== i);
          pushHist();
          break;
        }
      }
      redraw();
      return;
    }

    // ── TEXT: show floating input at click position ──
    if (t === "text") {
      const r = canvasRef.current.getBoundingClientRect();
      const ti = { visible: true, sx: e.clientX - r.left, sy: e.clientY - r.top, cx: x, cy: y, value: "" };
      textInputRef.current = ti;
      setTextInput(ti);
      setTimeout(() => tiInputRef.current?.focus(), 0);
      return;
    }

    if (t === "triangle" || t === "rightAngle") return; // placed via onClick

    // ── LINE / ARROW / DASH / DOT / RECT / ELLIPSE: start drag-draw ──
    const sx = snap(x), sy = snap(y);
    dragRef.current = { mx: sx, my: sy };
    const base = styleNow();
    if (t === "line")        prevRef.current = { ...base, type: "line",       x1: sx, y1: sy, x2: sx, y2: sy };
    if (t === "dashedLine")  prevRef.current = { ...base, type: "dashedLine", x1: sx, y1: sy, x2: sx, y2: sy };
    if (t === "dottedLine")  prevRef.current = { ...base, type: "dottedLine", x1: sx, y1: sy, x2: sx, y2: sy };
    if (t === "arrow")       prevRef.current = { ...base, type: "arrow",      x1: sx, y1: sy, x2: sx, y2: sy };
    if (t === "rect")        prevRef.current = { ...base, type: "rect",       x: sx, y: sy, width: 0, height: 0 };
    if (t === "ellipse")     prevRef.current = { ...base, type: "ellipse",    x: sx, y: sy, width: 0, height: 0 };
    redraw();
  };

  const onMouseMove = (e) => {
    const { x, y } = getPos(e);
    mouseRef.current = { x, y };
    const t = toolRef.current;

    // Triangle preview updates on every move
    if (t === "triangle") {
      if (triPtsRef.current.length > 0) redraw();
      return;
    }

    if (!dragRef.current) return;

    // ── SELECT drag: move the selected shape from its original position ──
    if (t === "select") {
      if (!dragRef.current.origShape) return;
      const dx = x - dragRef.current.mx;
      const dy = y - dragRef.current.my;
      const moved = moveShape(dragRef.current.origShape, dx, dy);
      shapesRef.current = shapesRef.current.map(s =>
        s.id === moved.id ? { ...moved, isSelected: true } : s
      );
      redraw();
      return;
    }

    // ── Drawing tools: update preview shape ──
    const { mx, my } = dragRef.current;
    const sx = snap(x), sy = snap(y);
    if (t === "line" || t === "arrow" || t === "dashedLine" || t === "dottedLine") {
      prevRef.current = { ...prevRef.current, x2: sx, y2: sy };
    } else if (t === "rect" || t === "ellipse") {
      prevRef.current = {
        ...prevRef.current,
        x: Math.min(mx, sx), y: Math.min(my, sy),
        width: Math.abs(sx - mx), height: Math.abs(sy - my),
      };
    }
    redraw();
  };

  const onMouseUp = (e) => {
    const { x, y } = getPos(e);
    const t = toolRef.current;

    // ── SELECT mouse-up: commit move or restore if it was just a click ──
    if (t === "select") {
      if (dragRef.current?.origShape) {
        const dx = x - dragRef.current.mx;
        const dy = y - dragRef.current.my;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          pushHist(); // commit the drag-move to history
        } else {
          // Click without drag → restore original position, keep selected
          const orig = dragRef.current.origShape;
          shapesRef.current = shapesRef.current.map(s =>
            s.id === orig.id ? { ...orig, isSelected: true } : s
          );
        }
      }
      dragRef.current = null;
      redraw();
      return;
    }

    if (!dragRef.current) return;
    dragRef.current = null;

    const p = prevRef.current;
    prevRef.current = null;
    if (!p) { redraw(); return; }

    // Commit shape if it has a minimum size
    const MIN = 3;
    let shape = null;
    if ((t === "line" || t === "arrow" || t === "dashedLine" || t === "dottedLine") && dd(p.x1, p.y1, p.x2, p.y2) > MIN) {
      shape = { ...p, id: uid() };
    } else if ((t === "rect" || t === "ellipse") && p.width > MIN && p.height > MIN) {
      shape = { ...p, id: uid() };
    }

    if (shape) {
      shapesRef.current = [...deselectAll(), shape];
      pushHist();
    }
    redraw();
  };

  const onClick = (e) => {
    const { x: rx, y: ry } = getPos(e);
    const x = snap(rx), y = snap(ry);
    const t = toolRef.current;

    if (t === "rightAngle") {
      shapesRef.current = [
        ...deselectAll(),
        { ...styleNow(), id: uid(), type: "rightAngle", x, y, size: 20 },
      ];
      pushHist();
      redraw();
      return;
    }

    if (t !== "triangle") return;
    const npts = [...triPtsRef.current, { x, y }];
    if (npts.length === 3) {
      shapesRef.current = [
        ...deselectAll(),
        { ...styleNow(), id: uid(), type: "triangle", pts: npts },
      ];
      pushHist();
      triPtsRef.current = [];
      setTriCount(0);
    } else {
      triPtsRef.current = npts;
      setTriCount(npts.length);
    }
    redraw();
  };

  const commitText = () => {
    const ti = textInputRef.current;
    if (!ti.visible) return;
    if (ti.value.trim()) {
      shapesRef.current = [
        ...deselectAll(),
        { ...styleNow(), id: uid(), type: "text", x: ti.cx, y: ti.cy,
          text: ti.value.trim(), fontSize: fsRef.current },
      ];
      pushHist();
      redraw();
    }
    const cleared = { visible: false, sx: 0, sy: 0, cx: 0, cy: 0, value: "" };
    textInputRef.current = cleared;
    setTextInput(cleared);
  };

  // ── Touch support ─────────────────────────────────────────────────────────────

  const touchFake = (e) => {
    e.preventDefault();
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY };
  };
  const onTouchStart = e => onMouseDown(touchFake(e));
  const onTouchMove  = e => onMouseMove(touchFake(e));
  const onTouchEnd   = e => { const f = touchFake(e); onMouseUp(f); onClick(f); };

  // ── Actions ───────────────────────────────────────────────────────────────────

  const undo = () => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    shapesRef.current = histRef.current[histIdxRef.current].map(s => ({
      ...s, pts: s.pts ? [...s.pts] : undefined, isSelected: false,
    }));
    prevRef.current   = null;
    triPtsRef.current = [];
    dragRef.current   = null;
    setTriCount(0);
    redraw();
  };

  const clearShapes = () => {
    shapesRef.current = [];
    pushHist();
    prevRef.current   = null;
    triPtsRef.current = [];
    dragRef.current   = null;
    setTriCount(0);
    redraw();
  };

  const clearBackground = () => {
    bgImageRef.current = null;
    setHasBg(false);
    setBgLoadFailed(false);
    redraw();
  };

  const handleInsert = async () => {
    setSaving(true);
    try {
      shapesRef.current = deselectAll(); // hide selection handles from exported image
      redraw();
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const base64  = dataUrl.split(",")[1];
      const { url, path } = await uploadBase64Image(base64);
      // JSON round-trip drops undefined values so shapes are Firestore-safe
      const shapes = JSON.parse(JSON.stringify(shapesRef.current))
        .map(({ isSelected, ...sh }) => sh);
      onInsert(url, path, dataUrl, shapes);
    } catch (err) {
      console.error("[DrawingTool] Insert failed:", err);
      setSaving(false);
    }
  };

  const cursor = { select: "default", eraser: "cell", text: "text" }[tool] || "crosshair";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={s.overlay}>
      <div style={s.modal}>

        {/* ── Header ── */}
        <div style={s.header}>
          <h2 style={s.htitle}>{backgroundUrl || hasRestoredShapes ? "Edit Drawing" : "Draw Shape"}</h2>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {/* ── Toolbar ── */}
        <div style={s.toolbar}>

          <div style={s.tgroup}>
            {TOOLS.map(({ id, icon, short }) => (
              <button key={id} title={short} onClick={() => setTool(id)}
                style={{ ...s.toolBtn, ...(tool === id ? s.toolActive : {}) }}>
                <span style={s.toolIcon}>{icon}</span>
                <span style={s.toolLabel}>{short}</span>
              </button>
            ))}
          </div>

          <div style={s.sep} />

          <div style={s.optGroup}>
            <span style={s.optLabel}>Stroke</span>
            <div style={s.swatchRow}>
              {STROKE_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  style={{ ...s.swatch, background: c,
                    boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "0 0 0 1px #bbb" }} />
              ))}
            </div>
          </div>

          <div style={s.sep} />

          <div style={s.optGroup}>
            <span style={s.optLabel}>Width</span>
            <div style={s.swatchRow}>
              {WIDTHS.map(w => (
                <button key={w.v} onClick={() => setLw(w.v)}
                  style={{ ...s.widthBtn,
                    background: lw === w.v ? "#e8eef7" : "#f0f0f0",
                    fontWeight: lw === w.v ? "700" : "400",
                    border:     lw === w.v ? "2px solid #0f3460" : "2px solid transparent" }}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div style={s.sep} />

          <div style={s.optGroup}>
            <span style={s.optLabel}>Fill</span>
            <div style={s.swatchRow}>
              {FILLS.map(f => (
                <button key={f.v} onClick={() => setFill(f.v)} title={f.label}
                  style={{ ...s.swatch,
                    background: f.bg
                      ? f.bg
                      : "repeating-linear-gradient(45deg,#ccc 0,#ccc 2px,#fff 0,#fff 6px)",
                    boxShadow: fill === f.v
                      ? "0 0 0 2px #fff, 0 0 0 4px #0f3460"
                      : "0 0 0 1px #bbb" }} />
              ))}
            </div>
          </div>

          <div style={s.sep} />

          <div style={s.optGroup}>
            <span style={s.optLabel}>Text size</span>
            <div style={s.swatchRow}>
              {TEXT_SIZES.map(t => (
                <button key={t.v} onClick={() => setFontSize(t.v)} title={`${t.v}px`}
                  style={{ ...s.widthBtn,
                    background: fontSize === t.v ? "#e8eef7" : "#f0f0f0",
                    fontWeight: fontSize === t.v ? "700" : "400",
                    border:     fontSize === t.v ? "2px solid #0f3460" : "2px solid transparent" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={s.sep} />

          <div style={s.optGroup}>
            <span style={s.optLabel}>Grid</span>
            <button onClick={() => setSnap(!snapGrid)} title="Snap all shapes to 20px grid"
              style={{ ...s.widthBtn, minWidth: "58px",
                background: snapGrid ? "#e8eef7" : "#f0f0f0",
                fontWeight: snapGrid ? "700" : "400",
                border: snapGrid ? "2px solid #0f3460" : "2px solid transparent",
                color: snapGrid ? "#0f3460" : "#555" }}>
              ⊞ Snap
            </button>
          </div>

        </div>

        {/* ── Canvas area ── */}
        <div style={s.canvasArea}>

          {/* Background load failure warning */}
          {bgLoadFailed && (
            <div style={s.bgWarn}>
              ⚠️ Previous drawing could not be loaded. Draw new shapes below — they will replace it.
            </div>
          )}

          {/* Background loaded info bar */}
          {hasBg && (
            <div style={s.bgInfo}>
              <span style={s.bgInfoText}>📌 Background locked — add new shapes on top</span>
              <button onClick={clearBackground} style={s.clearBgBtn}>✕ Clear Background</button>
            </div>
          )}

          <div style={s.canvasWrap}>
            <canvas
              ref={canvasRef}
              width={CW}
              height={CH}
              style={{ ...s.canvas, cursor }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onClick={onClick}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />

            {/* Floating text input overlay */}
            {textInput.visible && (
              <input
                ref={tiInputRef}
                style={{ ...s.tiOverlay, left: textInput.sx, top: textInput.sy, fontSize }}
                value={textInput.value}
                placeholder="Type label…"
                onChange={e => {
                  const v = { ...textInputRef.current, value: e.target.value };
                  textInputRef.current = v;
                  setTextInput(v);
                }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commitText(); }}
                onBlur={commitText}
              />
            )}
          </div>

          {/* Contextual hints */}
          {tool === "triangle" && (
            <div style={s.hint}>
              {triCount === 0 ? "Click to place point 1 of 3"
               : triCount === 1 ? "Click to place point 2 of 3"
               : "Click to place point 3 — triangle will close automatically"}
            </div>
          )}
          {tool === "text" && !textInput.visible && (
            <div style={s.hint}>Click anywhere on the canvas to place a text label — pick a Text size first</div>
          )}
          {tool === "select" && (
            <div style={s.hint}>Click a shape to select it · Drag to move · Text size resizes a selected label</div>
          )}
          {tool === "rightAngle" && (
            <div style={s.hint}>Click any corner to place a right angle symbol ∟ (opens up-right from click point)</div>
          )}
          {(tool === "dashedLine" || tool === "dottedLine") && (
            <div style={s.hint}>Click and drag to draw a {tool === "dashedLine" ? "dashed" : "dotted"} line</div>
          )}
          {snapGrid && (
            <div style={s.hint}>⊞ Snap ON — shapes and lines snap to the nearest 20px grid point</div>
          )}

          {/* Static label for editing an existing drawing */}
          {hasRestoredShapes ? (
            <div style={s.bgLabel}>
              Editing existing drawing — every shape can be selected, moved, or erased
            </div>
          ) : backgroundUrl && !bgLoadFailed ? (
            <div style={s.bgLabel}>
              You can add new shapes on top of the existing drawing
            </div>
          ) : null}

        </div>

        {/* ── Footer ── */}
        <div style={s.footer}>
          <div style={s.footL}>
            <button onClick={undo}        style={s.ghostBtn}>↩ Undo</button>
            <button onClick={clearShapes} style={s.ghostBtn}>✕ Clear Shapes</button>
          </div>
          <div style={s.footR}>
            <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
            <button onClick={handleInsert} disabled={saving}
              style={{ ...s.insertBtn, opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Uploading…" : "Insert into Question ✓"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000,
  },
  modal: {
    background: "#fff", borderRadius: "12px",
    width: "min(96vw, 940px)", maxHeight: "95vh",
    display: "flex", flexDirection: "column",
    boxShadow: "0 32px 80px rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 20px", borderBottom: "1px solid #eee", flexShrink: 0,
  },
  htitle:   { margin: 0, fontSize: "17px", color: "#0f3460", fontWeight: "700" },
  closeBtn: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#999" },

  toolbar: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px",
    padding: "10px 16px", borderBottom: "1px solid #eee",
    background: "#fafafa", flexShrink: 0,
  },
  tgroup:   { display: "flex", gap: "3px", flexWrap: "wrap" },
  toolBtn:  {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "5px 7px", minWidth: "44px",
    background: "#f0f0f0", border: "2px solid transparent",
    borderRadius: "6px", cursor: "pointer", gap: "1px", lineHeight: 1,
  },
  toolActive: { background: "#e8eef7", border: "2px solid #0f3460" },
  toolIcon:   { fontSize: "16px" },
  toolLabel:  { fontSize: "9px", color: "#666", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.3px" },
  sep: { width: "1px", height: "44px", background: "#ddd", margin: "0 2px", alignSelf: "center", flexShrink: 0 },

  optGroup:  { display: "flex", flexDirection: "column", gap: "4px" },
  optLabel:  { fontSize: "9px", fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" },
  swatchRow: { display: "flex", gap: "5px" },
  swatch:    { width: "22px", height: "22px", borderRadius: "50%", border: "none", cursor: "pointer", transition: "box-shadow 0.12s", flexShrink: 0 },
  widthBtn:  { padding: "3px 9px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", border: "2px solid transparent" },

  canvasArea: {
    flex: 1, overflowX: "auto", overflowY: "auto",
    padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px",
    minHeight: 0,
  },
  canvasWrap: { position: "relative", display: "inline-block", lineHeight: 0, flexShrink: 0 },
  canvas: {
    display: "block", borderRadius: "6px",
    border: "1px solid #d0d0d0",
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
    maxWidth: "100%",
    touchAction: "none",
  },
  tiOverlay: {
    position: "absolute",
    background: "rgba(255,255,255,0.95)", border: "2px solid #0f3460",
    borderRadius: "4px", padding: "3px 8px", fontSize: "15px",
    outline: "none", minWidth: "90px",
    transform: "translate(-4px, calc(-100% - 4px))",
    boxShadow: "0 2px 10px rgba(0,0,0,0.15)", zIndex: 10,
  },
  hint: {
    fontSize: "12px", color: "#555", fontStyle: "italic",
    padding: "5px 10px", background: "#f0f4ff",
    borderRadius: "4px", border: "1px solid #c5cae9",
    alignSelf: "flex-start", flexShrink: 0,
  },
  bgWarn: {
    fontSize: "13px", color: "#7f4c00", background: "#fff8e1",
    border: "1px solid #ffe082", borderRadius: "6px",
    padding: "8px 14px", flexShrink: 0,
  },
  bgInfo: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "7px 12px", background: "#e8f4fd",
    border: "1px solid #90caf9", borderRadius: "6px", flexShrink: 0,
  },
  bgInfoText: { fontSize: "13px", color: "#0d47a1" },
  clearBgBtn: {
    padding: "4px 10px", background: "#fff", border: "1px solid #90caf9",
    borderRadius: "4px", cursor: "pointer", fontSize: "12px", color: "#1565c0",
  },
  bgLabel: {
    fontSize: "12px", color: "#555", fontStyle: "italic",
    padding: "4px 0", flexShrink: 0,
  },

  footer: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", borderTop: "1px solid #eee", gap: "12px", flexShrink: 0,
  },
  footL:     { display: "flex", gap: "8px" },
  footR:     { display: "flex", gap: "10px" },
  ghostBtn:  { padding: "7px 14px", background: "none", border: "1px solid #ddd", borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: "#555" },
  cancelBtn: { padding: "7px 16px", background: "#f0f0f0", border: "1px solid #ddd", borderRadius: "6px", cursor: "pointer", fontSize: "14px" },
  insertBtn: { padding: "8px 20px", background: "#0f3460", color: "#fff", border: "none", borderRadius: "6px", fontSize: "14px", fontWeight: "600" },
};
