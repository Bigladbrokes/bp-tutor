import { generateJoinCode, normalizeJoinCode, JOIN_CODE_ALPHABET } from "./firestore";

test("generateJoinCode produces 6 chars from the safe alphabet", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateJoinCode();
    expect(code).toHaveLength(6);
    for (const c of code) expect(JOIN_CODE_ALPHABET).toContain(c);
  }
});

test("the alphabet excludes ambiguous characters", () => {
  for (const c of ["0", "O", "1", "I", "L"]) {
    expect(JOIN_CODE_ALPHABET).not.toContain(c);
  }
});

test("generateJoinCode avoids codes already taken by active sessions", () => {
  // Force the first attempt to collide: Math.random() = 0 → "AAAAAA",
  // then a different sequence for the retry.
  const seq = [...Array(6).fill(0), ...Array(6).fill(0.5)];
  const spy = jest.spyOn(Math, "random").mockImplementation(() => seq.shift() ?? 0.9);
  const code = generateJoinCode(new Set(["AAAAAA"]));
  spy.mockRestore();
  expect(code).toHaveLength(6);
  expect(code).not.toBe("AAAAAA");
});

test("normalizeJoinCode uppercases, strips spaces and punctuation", () => {
  expect(normalizeJoinCode(" km3 pxw ")).toBe("KM3PXW");
  expect(normalizeJoinCode("ab-cd_ef!!")).toBe("ABCDEF");
});

test("normalizeJoinCode drops ambiguous characters and caps at 6", () => {
  expect(normalizeJoinCode("ilo015abcdef")).toBe("5ABCDE");
  expect(normalizeJoinCode("ABCDEF23")).toBe("ABCDEF");
  expect(normalizeJoinCode("")).toBe("");
  expect(normalizeJoinCode(null)).toBe("");
});
