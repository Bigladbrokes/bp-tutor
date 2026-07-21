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

const FIXTURES = {
  computeOnly: FIXTURE_COMPUTE_ONLY,
  eqThenCompute: FIXTURE_EQ_THEN_COMPUTE,
};

// Flip this one line to switch fixtures:
const ACTIVE_FIXTURE = FIXTURES.eqThenCompute;

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
