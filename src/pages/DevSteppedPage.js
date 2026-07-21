import React from "react";
import SteppedQuestionRunner from "../components/SteppedQuestionRunner";

// ─── DEV-ONLY HARNESS ─────────────────────────────────────────────────────────
// Local fixture for exercising the stepped-solver skeleton (build step 2).
// Zero production surface: the /dev/stepped route is registered only when
// NODE_ENV === "development" (see App.js). No Firestore reads or writes, no
// auth, no tokens, no session integration — result writing is build step 6.

// Flip this one line to try the other policy (doc §7.1):
const SESSION_CONFIG = { stepped: { restartPolicy: "strict", retriesPerStep: 1 } };
// const SESSION_CONFIG = { stepped: { restartPolicy: "stepRetry", retriesPerStep: 1 } };

// Shared §2 kinematics template.
const KINEMATICS_TEMPLATE = {
  params: {
    vi: { min: 2.0, max: 3.0, step: 0.1, dp: 1, unit: "m/s" },
    a:  { min: 1.0, max: 2.0, step: 0.1, dp: 1, unit: "m/s²" },
    d:  { min: 100, max: 300, step: 10,  dp: 1, unit: "m"   },
  },
  problemText:
    "รถคันหนึ่งกำลังวิ่งด้วยความเร็ว {vi} m/s แล้วเร่งด้วยความเร่งคงที่ {a} m/s² เป็นระยะทาง {d} m จงหาความเร็วสุดท้ายของรถ",
  unknown: { symbol: "v_f", unit: "m/s" },
  answerExpr: "sqrt(vi^2 + 2*a*d)",
  tolerance: { type: "relative", value: 0.01 },
};

const COMPUTE_STEP = {
  stepType: "compute",
  answerField: { symbol: "vf", unitProvided: "m/s" },
  errorClass: "compute.wrongValue",
  feedback: "ตรวจการแทนค่าและการคำนวณอีกครั้ง (ยกกำลังก่อน คูณก่อน แล้วค่อยถอดราก)",
};

// §3.2 equation selection. Note: the doc tags both distractors
// equation.requiresTime; per the build-step-3 spec the second distractor
// carries equation.missingUnknown instead (its own feedback text is about
// the missing v_f, so that's the truer class anyway).
const EQUATION_STEP = {
  stepType: "equationSelect",
  prompt: "จาก givens และ unknown ของเรา ควรใช้สมการใด",
  options: [
    {
      latex: "v_f = v_i + at",
      correct: false,
      errorClass: "equation.requiresTime",
      feedback: "สมการนี้ต้องรู้เวลา (t) แต่โจทย์ไม่ได้ให้เวลา และไม่ได้ถามหาเวลา",
    },
    {
      latex: "d = v_i t + \\tfrac{1}{2}at^2",
      correct: false,
      errorClass: "equation.missingUnknown",
      feedback: "สมการนี้ต้องรู้เวลา และไม่มี v_f ที่โจทย์ถามหา",
    },
    { latex: "v_f^2 = v_i^2 + 2ad", correct: true },
  ],
};

// §3.1 givens step: extract each value + attach its unit. Values are graded
// against the generated params for the attempt; units against expectedUnit.
const GIVENS_STEP = {
  stepType: "givens",
  title: "กรอกค่าที่โจทย์ให้มา แล้วลากหน่วยให้ถูกต้อง",
  fields: [
    { symbol: "d",  expectedParam: "d",  expectedUnit: "m"    },
    { symbol: "vi", expectedParam: "vi", expectedUnit: "m/s"  },
    { symbol: "a",  expectedParam: "a",  expectedUnit: "m/s²" },
  ],
  unitPalette: ["s", "m", "m/s", "m/s²"],
  feedback: {
    "givens.wrongValue":
      "อ่านโจทย์อีกครั้ง แล้วสังเกตหน่วยที่เขียนติดกับตัวเลข: m คือระยะทาง, m/s คือความเร็ว, s คือเวลา, m/s² คือความเร่ง",
    "givens.wrongUnit":
      "หน่วยนี้ไม่ตรงกับปริมาณ ลองดูว่าตัวเลขนี้ในโจทย์บอกปริมาณอะไร",
  },
};

// §3.3 rearrange step: drag tiles into a fixed radical scaffold. The palette
// carries distractors (vf, vf², ½, unsquared vi). slot 0 is the vi² term; the
// three group:"product" slots are 2·a·d (any order valid, no duplicates).
const REARRANGE_STEP = {
  stepType: "rearrange",
  reference: "v_f^2 = v_i^2 + 2ad",
  instruction: "จัดรูปสมการเพื่อหา v_f แล้วลากตัวแปรมาวางในช่องให้ถูกต้อง",
  // Documented scaffold shape; the component composes the radical + slots
  // itself rather than hosting drop targets inside KaTeX.
  scaffold: "v_f = \\sqrt{ \\square + \\square\\square\\square }",
  slots: [
    { accepts: ["vi²"] },
    { accepts: ["2", "a", "d"], group: "product" },
    { accepts: ["2", "a", "d"], group: "product" },
    { accepts: ["2", "a", "d"], group: "product" },
  ],
  palette: ["vi", "vi²", "vf", "vf²", "a", "d", "2", "½"],
  feedback: {
    "rearrange.wrongTile":
      "ดูสมการอ้างอิงอีกครั้ง — ตัวแปรตัวไหนกำลังสอง ตัวไหนไม่ได้กำลังสอง และ ½ มาจากสมการอื่น",
    "rearrange.incompleteProduct":
      "ในเครื่องหมายรากต้องมีพจน์ 2·a·d ครบทั้งสาม (2, a และ d) อย่างละหนึ่ง ไม่ซ้ำและไม่ขาด",
  },
};

// Fixture 1: [compute] only (build step 2).
const FIXTURE_COMPUTE_ONLY = {
  id: "q_phys_kin_fv_001",
  type: "stepped",
  template: KINEMATICS_TEMPLATE,
  steps: [COMPUTE_STEP],
};

// Fixture 2: [equationSelect, compute] (build step 3).
const FIXTURE_EQ_THEN_COMPUTE = {
  id: "q_phys_kin_fv_002",
  type: "stepped",
  template: KINEMATICS_TEMPLATE,
  steps: [EQUATION_STEP, COMPUTE_STEP],
};

// Fixture 3: [givens, equationSelect, compute] — the full observed flow
// (build step 4).
const FIXTURE_FULL_FLOW = {
  id: "q_phys_kin_fv_003",
  type: "stepped",
  template: KINEMATICS_TEMPLATE,
  steps: [GIVENS_STEP, EQUATION_STEP, COMPUTE_STEP],
};

// Fixture 4: [givens, equationSelect, rearrange, compute] — the full 4-step
// observed flow (build step 5).
const FIXTURE_FULL_SOLVE = {
  id: "q_phys_kin_fv_004",
  type: "stepped",
  template: KINEMATICS_TEMPLATE,
  steps: [GIVENS_STEP, EQUATION_STEP, REARRANGE_STEP, COMPUTE_STEP],
};

const FIXTURES = {
  computeOnly: FIXTURE_COMPUTE_ONLY,
  eqThenCompute: FIXTURE_EQ_THEN_COMPUTE,
  fullFlow: FIXTURE_FULL_FLOW,
  fullSolve: FIXTURE_FULL_SOLVE,
};

// Flip this one line to switch fixtures:
const ACTIVE_FIXTURE = FIXTURES.fullSolve;

export default function DevSteppedPage() {
  return (
    <div style={s.page}>
      <div style={s.wrapper}>
        <div style={s.devBanner}>
          🛠 DEV HARNESS — stepped solver · fixture {ACTIVE_FIXTURE.id} · uid "dev-user" · policy:{" "}
          {SESSION_CONFIG.stepped.restartPolicy} · nothing is saved
        </div>
        <SteppedQuestionRunner
          uid="dev-user"
          question={ACTIVE_FIXTURE}
          sessionConfig={SESSION_CONFIG}
        />
      </div>
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, sans-serif" },
  wrapper: { maxWidth: "640px", margin: "0 auto", padding: "24px 20px" },
  devBanner: {
    background: "#fff8e1", border: "1px dashed #f9a825", borderRadius: "8px",
    padding: "8px 14px", fontSize: "12px", color: "#5d4037", marginBottom: "16px",
  },
};
