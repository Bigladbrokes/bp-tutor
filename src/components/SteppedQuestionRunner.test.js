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
