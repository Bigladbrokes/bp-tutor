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

// The doc §2 kinematics template, steps: [compute] only.
const FIXTURE_QUESTION = {
  id: "q_phys_kin_fv_001",
  type: "stepped",
  template: {
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
  },
  steps: [
    {
      stepType: "compute",
      answerField: { symbol: "vf", unitProvided: "m/s" },
      errorClass: "compute.wrongValue",
      feedback: "ตรวจการแทนค่าและการคำนวณอีกครั้ง (ยกกำลังก่อน คูณก่อน แล้วค่อยถอดราก)",
    },
  ],
};

export default function DevSteppedPage() {
  return (
    <div style={s.page}>
      <div style={s.wrapper}>
        <div style={s.devBanner}>
          🛠 DEV HARNESS — stepped solver build step 2 · uid "dev-user" · policy:{" "}
          {SESSION_CONFIG.stepped.restartPolicy} · nothing is saved
        </div>
        <SteppedQuestionRunner
          uid="dev-user"
          question={FIXTURE_QUESTION}
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
