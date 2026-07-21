import { render, screen, fireEvent } from "@testing-library/react";
import SteppedQuestionRunner from "./SteppedQuestionRunner";

// Minimal deterministic fixture: a single-value param grid (so the expected
// compute answer is always 2), with the §3.2 equation-selection step first.
const FIXTURE = {
  id: "q_test_eq",
  type: "stepped",
  template: {
    params: { x: { min: 1, max: 1, step: 1, dp: 0, unit: "u" } },
    problemText: "ค่า x คือ {x}",
    unknown: { symbol: "v_f", unit: "m/s" },
    answerExpr: "x*2",
    tolerance: { type: "absolute", value: 0.5 },
  },
  steps: [
    {
      stepType: "equationSelect",
      prompt: "เลือกสมการ",
      options: [
        { latex: "v_f = v_i + at", correct: false, errorClass: "equation.requiresTime", feedback: "ต้องรู้เวลา" },
        { latex: "d = v_i t + \\tfrac{1}{2}at^2", correct: false, errorClass: "equation.missingUnknown", feedback: "ไม่มี v_f" },
        { latex: "v_f^2 = v_i^2 + 2ad", correct: true },
      ],
    },
    {
      stepType: "compute",
      answerField: { symbol: "vf", unitProvided: "m/s" },
      errorClass: "compute.wrongValue",
      feedback: "คำนวณใหม่",
    },
  ],
};

const CORRECT = "v_f^2 = v_i^2 + 2ad";
const DISTRACTOR_TIME = "v_f = v_i + at";
const DISTRACTOR_UNKNOWN = "d = v_i t + \\tfrac{1}{2}at^2";

const renderRunner = (policy = "strict", retriesPerStep = 1) =>
  render(
    <SteppedQuestionRunner
      uid="test-user"
      question={FIXTURE}
      sessionConfig={{ stepped: { restartPolicy: policy, retriesPerStep } }}
    />
  );

const pick = (latex) => fireEvent.click(screen.getByRole("radio", { name: latex }));
const submit = () => fireEvent.click(screen.getByRole("button", { name: /ตรวจคำตอบ/ }));

test("renders all three equation options as radios, KaTeX-rendered", () => {
  renderRunner();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  // KaTeX output exists (not raw latex text)
  expect(document.querySelector(".katex")).not.toBeNull();
});

test("correct pick advances to the compute step", () => {
  renderRunner();
  expect(screen.getByText("Step 1/2")).toBeInTheDocument();
  pick(CORRECT);
  submit();
  expect(screen.getByText("Step 2/2")).toBeInTheDocument();
});

test("each distractor produces its own feedback", () => {
  const { unmount } = renderRunner();
  pick(DISTRACTOR_TIME);
  submit();
  expect(screen.getByText("ต้องรู้เวลา")).toBeInTheDocument();
  unmount();

  renderRunner();
  pick(DISTRACTOR_UNKNOWN);
  submit();
  expect(screen.getByText("ไม่มี v_f")).toBeInTheDocument();
});

test("strict policy: dismissing equation feedback restarts (เริ่มใหม่)", () => {
  renderRunner("strict");
  pick(DISTRACTOR_TIME);
  submit();
  const btn = screen.getByRole("button", { name: /เริ่มใหม่/ });
  fireEvent.click(btn);
  // Back on step 1 with nothing selected
  expect(screen.getByText("Step 1/2")).toBeInTheDocument();
  screen.getAllByRole("radio").forEach((r) => expect(r).toHaveAttribute("aria-checked", "false"));
});

test("stepRetry: equationSelect CLEARS the selection on a same-step retry", () => {
  renderRunner("stepRetry");
  pick(DISTRACTOR_TIME);
  submit();
  const btn = screen.getByRole("button", { name: /ลองอีกครั้ง/ });
  fireEvent.click(btn);
  // Same step, but the wrong pick is no longer highlighted/selected
  expect(screen.getByText("Step 1/2")).toBeInTheDocument();
  screen.getAllByRole("radio").forEach((r) => expect(r).toHaveAttribute("aria-checked", "false"));
});

test("stepRetry: compute KEEPS the typed value on a same-step retry", () => {
  renderRunner("stepRetry");
  pick(CORRECT);
  submit(); // → compute step (expected answer = 2)
  const input = screen.getByPlaceholderText("00.0");
  fireEvent.change(input, { target: { value: "999" } });
  submit();
  fireEvent.click(screen.getByRole("button", { name: /ลองอีกครั้ง/ }));
  // Value retained for editing — the numeric step's clearOnRetry is false
  expect(screen.getByPlaceholderText("00.0")).toHaveValue("999");
});

test("full pass: equation then compute completes the question", () => {
  renderRunner();
  pick(CORRECT);
  submit();
  const input = screen.getByPlaceholderText("00.0");
  fireEvent.change(input, { target: { value: "2" } });
  submit();
  expect(screen.getByText(/ทำครบทุกขั้นตอนแล้ว/)).toBeInTheDocument();
});

// ─── givens step (build step 4) ───────────────────────────────────────────────
// Single-value param grids so the correct values are fixed: d=100, vi=2, a=1.
const GIVENS_FIXTURE = {
  id: "q_test_givens",
  type: "stepped",
  template: {
    params: {
      d:  { min: 100, max: 100, step: 1, dp: 0, unit: "m" },
      vi: { min: 2,   max: 2,   step: 1, dp: 0, unit: "m/s" },
      a:  { min: 1,   max: 1,   step: 1, dp: 0, unit: "m/s²" },
    },
    problemText: "d={d} vi={vi} a={a}",
    unknown: { symbol: "v_f", unit: "m/s" },
    answerExpr: "sqrt(vi^2 + 2*a*d)",
    tolerance: { type: "relative", value: 0.01 },
  },
  steps: [
    {
      stepType: "givens",
      title: "givens",
      fields: [
        { symbol: "d",  expectedParam: "d",  expectedUnit: "m"    },
        { symbol: "vi", expectedParam: "vi", expectedUnit: "m/s"  },
        { symbol: "a",  expectedParam: "a",  expectedUnit: "m/s²" },
      ],
      unitPalette: ["s", "m", "m/s", "m/s²"],
      feedback: { "givens.wrongValue": "ค่าไม่ถูก", "givens.wrongUnit": "หน่วยไม่ถูก" },
    },
    { stepType: "compute", answerField: { symbol: "vf", unitProvided: "m/s" }, errorClass: "compute.wrongValue", feedback: "คำนวณใหม่" },
  ],
};

const renderGivens = (policy = "strict", retriesPerStep = 1) =>
  render(
    <SteppedQuestionRunner
      uid="test-user"
      question={GIVENS_FIXTURE}
      sessionConfig={{ stepped: { restartPolicy: policy, retriesPerStep } }}
    />
  );

const makeDT = () => {
  const store = {};
  return { setData: (k, v) => { store[k] = v; }, getData: (k) => store[k], effectAllowed: "", dropEffect: "" };
};
const typeValue = (symbol, v) => fireEvent.change(screen.getByLabelText(`value-${symbol}`), { target: { value: v } });
const assignUnit = (symbol, unit) => {
  const chip = screen.getByRole("button", { name: unit });
  const slot = screen.getByTestId(`unit-slot-${symbol}`);
  const dt = makeDT();
  fireEvent.dragStart(chip, { dataTransfer: dt });
  fireEvent.drop(slot, { dataTransfer: dt });
};
const fillCorrectGivens = () => {
  typeValue("d", "100"); typeValue("vi", "2"); typeValue("a", "1");
  assignUnit("d", "m"); assignUnit("vi", "m/s"); assignUnit("a", "m/s²");
};
const submitGivens = () => fireEvent.click(screen.getByRole("button", { name: /ตรวจคำตอบ/ }));

test("givens: dragging a unit chip assigns it; tapping the assigned chip clears it", () => {
  renderGivens();
  assignUnit("d", "m");
  expect(screen.getByLabelText("clear-unit-d")).toHaveTextContent("m");
  fireEvent.click(screen.getByLabelText("clear-unit-d"));
  expect(screen.queryByLabelText("clear-unit-d")).toBeNull();
  expect(screen.getByTestId("unit-slot-d")).toHaveTextContent("ลากหน่วยมาวาง");
});

test("givens: correct values + units advance to the next step", () => {
  renderGivens();
  expect(screen.getByText("Step 1/2")).toBeInTheDocument();
  fillCorrectGivens();
  submitGivens();
  expect(screen.getByText("Step 2/2")).toBeInTheDocument();
});

test("givens: right values + one wrong unit → wrongUnit feedback, only that field flagged", () => {
  renderGivens();
  typeValue("d", "100"); typeValue("vi", "2"); typeValue("a", "1");
  assignUnit("d", "m"); assignUnit("vi", "m/s"); assignUnit("a", "s"); // wrong unit on a only
  submitGivens();
  expect(screen.getByText("หน่วยไม่ถูก")).toBeInTheDocument();
  expect(screen.getAllByText("✗")).toHaveLength(1); // exactly the one wrong field
});

test("givens: a wrong value outranks a wrong unit (wrongValue reported first)", () => {
  renderGivens();
  typeValue("d", "999"); typeValue("vi", "2"); typeValue("a", "1"); // d value wrong
  assignUnit("d", "m"); assignUnit("vi", "m/s"); assignUnit("a", "s"); // a unit also wrong
  submitGivens();
  expect(screen.getByText("ค่าไม่ถูก")).toBeInTheDocument();
});

test("stepRetry: a givens retry clears both typed values and assigned units", () => {
  renderGivens("stepRetry");
  typeValue("d", "100"); typeValue("vi", "2"); typeValue("a", "1");
  assignUnit("d", "m"); assignUnit("vi", "m/s"); assignUnit("a", "s"); // wrong → fail
  submitGivens();
  fireEvent.click(screen.getByRole("button", { name: /ลองอีกครั้ง/ }));
  expect(screen.getByLabelText("value-d")).toHaveValue("");
  expect(screen.getByLabelText("value-vi")).toHaveValue("");
  expect(screen.getByLabelText("value-a")).toHaveValue("");
  expect(screen.getByTestId("unit-slot-d")).toHaveTextContent("ลากหน่วยมาวาง");
  expect(screen.queryByLabelText("clear-unit-d")).toBeNull();
});

// ─── rearrange step (build step 5) ────────────────────────────────────────────
const REARRANGE_FIXTURE = {
  id: "q_test_rearrange",
  type: "stepped",
  template: {
    params: { x: { min: 1, max: 1, step: 1, dp: 0, unit: "u" } },
    problemText: "x={x}",
    unknown: { symbol: "v_f", unit: "m/s" },
    answerExpr: "x",
    tolerance: { type: "absolute", value: 0.5 },
  },
  steps: [
    {
      stepType: "rearrange",
      reference: "v_f^2 = v_i^2 + 2ad",
      instruction: "จัดรูป",
      slots: [
        { accepts: ["vi²"] },
        { accepts: ["2", "a", "d"], group: "product" },
        { accepts: ["2", "a", "d"], group: "product" },
        { accepts: ["2", "a", "d"], group: "product" },
      ],
      palette: ["vi", "vi²", "vf", "vf²", "a", "d", "2", "½"],
      feedback: { "rearrange.wrongTile": "ตัวแปรผิด", "rearrange.incompleteProduct": "พจน์ 2ad ไม่ครบ" },
    },
    { stepType: "compute", answerField: { symbol: "vf", unitProvided: "m/s" }, errorClass: "compute.wrongValue", feedback: "x" },
  ],
};

const renderRearrange = (policy = "strict", retriesPerStep = 1) =>
  render(
    <SteppedQuestionRunner
      uid="test-user"
      question={REARRANGE_FIXTURE}
      sessionConfig={{ stepped: { restartPolicy: policy, retriesPerStep } }}
    />
  );

const dragTile = (tile, slotIdx) => {
  const chip = screen.getByRole("button", { name: tile });
  const slot = screen.getByTestId(`slot-${slotIdx}`);
  const dt = makeDT();
  fireEvent.dragStart(chip, { dataTransfer: dt });
  fireEvent.drop(slot, { dataTransfer: dt });
};
const fillCorrectRearrange = () => {
  dragTile("vi²", 0); dragTile("2", 1); dragTile("a", 2); dragTile("d", 3);
};
const submitRearrange = () => fireEvent.click(screen.getByRole("button", { name: /ตรวจคำตอบ/ }));

test("rearrange: dragging a tile fills a slot; tapping the tile clears it", () => {
  renderRearrange();
  expect(screen.getByTestId("slot-0")).toHaveTextContent("?");
  dragTile("vi²", 0);
  expect(screen.queryByLabelText("clear-slot-0")).not.toBeNull();
  fireEvent.click(screen.getByLabelText("clear-slot-0"));
  expect(screen.getByTestId("slot-0")).toHaveTextContent("?");
});

test("rearrange: correct tiles complete the step (product in order)", () => {
  renderRearrange();
  expect(screen.getByText("Step 1/2")).toBeInTheDocument();
  fillCorrectRearrange();
  submitRearrange();
  expect(screen.getByText("Step 2/2")).toBeInTheDocument();
});

test("rearrange: the 2·a·d product accepts a reordered drop", () => {
  renderRearrange();
  dragTile("vi²", 0); dragTile("d", 1); dragTile("a", 2); dragTile("2", 3);
  submitRearrange();
  expect(screen.getByText("Step 2/2")).toBeInTheDocument();
});

test("rearrange: a distractor in the fixed slot shows the wrongTile feedback", () => {
  renderRearrange();
  dragTile("vf²", 0); dragTile("2", 1); dragTile("a", 2); dragTile("d", 3);
  submitRearrange();
  expect(screen.getByText("ตัวแปรผิด")).toBeInTheDocument();
});

test("rearrange: a duplicate in the product shows the incompleteProduct feedback", () => {
  renderRearrange();
  dragTile("vi²", 0); dragTile("a", 1); dragTile("a", 2); dragTile("d", 3);
  submitRearrange();
  expect(screen.getByText("พจน์ 2ad ไม่ครบ")).toBeInTheDocument();
});

test("stepRetry: a rearrange retry clears all placed tiles", () => {
  renderRearrange("stepRetry");
  dragTile("vf²", 0); dragTile("2", 1); dragTile("a", 2); dragTile("d", 3); // wrong → fail
  submitRearrange();
  fireEvent.click(screen.getByRole("button", { name: /ลองอีกครั้ง/ }));
  [0, 1, 2, 3].forEach((i) => expect(screen.getByTestId(`slot-${i}`)).toHaveTextContent("?"));
  expect(screen.queryByLabelText("clear-slot-0")).toBeNull();
});
