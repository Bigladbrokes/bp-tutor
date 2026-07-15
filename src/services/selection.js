// Pure reordering helper for the teacher's "questions to send" selection.
// Selection order is significant: it's written verbatim as sessions.questionIds,
// so it's the order students see the questions in.

// Swaps the item at `id` with its neighbor `delta` positions away (-1 = up,
// +1 = down). Returns the SAME array reference when the move is a no-op
// (unknown id, or already at that boundary) so callers can skip a rerender.
export function moveInSelection(orderedIds, id, delta) {
  const idx = orderedIds.indexOf(id);
  const target = idx + delta;
  if (idx === -1 || target < 0 || target >= orderedIds.length) return orderedIds;
  const arr = [...orderedIds];
  [arr[idx], arr[target]] = [arr[target], arr[idx]];
  return arr;
}
