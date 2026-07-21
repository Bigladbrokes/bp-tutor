import { useRef, useState } from "react";

// Small shared drag-and-drop hook for dropping palette chips onto labelled
// slots. The design doc calls for reusing "the inequality-template touch DnD",
// but no such code exists in this repo (the only touch handling is
// DrawingTool's canvas mouse-shim), so this is a fresh, minimal port of the
// approach the doc describes:
//   - desktop: native HTML5 drag events (dragstart / dragover / drop)
//   - iPad/touch: touchstart/move/end with a fixed-position ghost element that
//     follows the finger, and document.elementFromPoint() on release to find
//     the slot under the finger (touch never fires a drop event on the target).
//
// Usage:
//   const dnd = useChipDrag({ onDrop: (slotId, value) => ... });
//   <chip {...dnd.chipProps("m/s", "m/s")} />
//   <slot {...dnd.slotProps("d")} />
// Slots are matched on touch release via their data-chipslot attribute, so a
// drop target only needs slotProps spread onto it.
const GHOST_STYLE = {
  position: "fixed",
  transform: "translate(-50%, -140%)",
  padding: "8px 14px",
  background: "#6a1b9a",
  color: "#fff",
  borderRadius: "8px",
  fontSize: "15px",
  fontWeight: "700",
  pointerEvents: "none",
  zIndex: "3000",
  boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
};

export function useChipDrag({ onDrop }) {
  // Latest onDrop without re-binding every handler each render.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const dragValue = useRef(null);
  const ghost = useRef(null);
  const [dragging, setDragging] = useState(null);

  const removeGhost = () => {
    if (ghost.current) {
      ghost.current.remove();
      ghost.current = null;
    }
  };
  const positionGhost = (x, y) => {
    if (!ghost.current) return;
    ghost.current.style.left = `${x}px`;
    ghost.current.style.top = `${y}px`;
  };
  const startDrag = (value) => {
    dragValue.current = value;
    setDragging(value);
  };
  const endDrag = () => {
    dragValue.current = null;
    setDragging(null);
    removeGhost();
  };
  const fire = (slotId, value) => {
    if (slotId != null && value != null && value !== "") onDropRef.current(slotId, value);
  };

  // ── desktop (HTML5 DnD) ────────────────────────────────────────────────────
  const onDragStart = (value) => (e) => {
    startDrag(value);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/plain", value);
    }
  };
  const onDragOver = (e) => {
    e.preventDefault(); // allow drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDropHandler = (slotId) => (e) => {
    e.preventDefault();
    const value = dragValue.current ?? e.dataTransfer?.getData("text/plain");
    fire(slotId, value);
    endDrag();
  };

  // ── touch (iPad) ───────────────────────────────────────────────────────────
  const onTouchStart = (value, label) => (e) => {
    startDrag(value);
    const t = e.touches[0];
    if (!t) return;
    const el = document.createElement("div");
    el.textContent = label ?? value;
    Object.assign(el.style, GHOST_STYLE);
    document.body.appendChild(el);
    ghost.current = el;
    positionGhost(t.clientX, t.clientY);
  };
  const onTouchMove = (e) => {
    if (!ghost.current) return;
    e.preventDefault(); // stop the page scrolling mid-drag
    const t = e.touches[0];
    if (t) positionGhost(t.clientX, t.clientY);
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    const value = dragValue.current;
    removeGhost();
    if (t && value != null) {
      const under = document.elementFromPoint(t.clientX, t.clientY);
      const slot = under && under.closest("[data-chipslot]");
      if (slot) fire(slot.getAttribute("data-chipslot"), value);
    }
    endDrag();
  };

  const chipProps = (value, label) => ({
    draggable: true,
    onDragStart: onDragStart(value),
    onDragEnd: endDrag,
    onTouchStart: onTouchStart(value, label),
    onTouchMove,
    onTouchEnd,
  });
  const slotProps = (slotId) => ({
    "data-chipslot": slotId,
    onDragOver,
    onDrop: onDropHandler(slotId),
  });

  return { chipProps, slotProps, dragging };
}
