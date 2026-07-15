import { moveInSelection } from "./selection";

const order = ["a", "b", "c", "d"];

test("moves an item up, swapping with its predecessor", () => {
  expect(moveInSelection(order, "c", -1)).toEqual(["a", "c", "b", "d"]);
});

test("moves an item down, swapping with its successor", () => {
  expect(moveInSelection(order, "b", 1)).toEqual(["a", "c", "b", "d"]);
});

test("moving the first item up is a no-op (same reference)", () => {
  const result = moveInSelection(order, "a", -1);
  expect(result).toBe(order);
});

test("moving the last item down is a no-op (same reference)", () => {
  const result = moveInSelection(order, "d", 1);
  expect(result).toBe(order);
});

test("moving an id that isn't in the selection is a no-op", () => {
  expect(moveInSelection(order, "zzz", -1)).toBe(order);
});

test("single-item selection: neither direction moves it", () => {
  const single = ["only"];
  expect(moveInSelection(single, "only", -1)).toBe(single);
  expect(moveInSelection(single, "only", 1)).toBe(single);
});

test("empty selection does not throw", () => {
  expect(moveInSelection([], "anything", -1)).toEqual([]);
});

test("does not mutate the input array", () => {
  const original = ["a", "b", "c"];
  const copy = [...original];
  moveInSelection(original, "b", 1);
  expect(original).toEqual(copy);
});

test("moving the first item down and the last item up both succeed", () => {
  expect(moveInSelection(order, "a", 1)).toEqual(["b", "a", "c", "d"]);
  expect(moveInSelection(order, "d", -1)).toEqual(["a", "b", "d", "c"]);
});
