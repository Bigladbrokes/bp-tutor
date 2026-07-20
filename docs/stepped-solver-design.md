# BP-Tutor: Stepped Solver — Design Document

**Based on:** `docs/video-analysis-1d-kinematics.md` (frame analysis of *1D Kinematics*, Nerd Island Studios)
**Goal:** adapt the app's *mechanics* — stepped validation, error-typed feedback, per-attempt randomization — into BP-Tutor's existing React + Firebase architecture.

> **Scope note on cloning:** the mechanics and pedagogical ideas (step-gated checking, error-class feedback, template randomization) are fair to implement. The notebook visual identity, artwork, and exact feedback wording belong to Nerd Island — BP-Tutor keeps its own visual language and writes its own Thai feedback text (which we'd need for our students anyway).

---

## 1. Design goals

1. **Grade the process, not the answer.** Each solving step is validated independently; a failure produces a *machine-readable error class*, not a generic "wrong".
2. **Fit the existing stack.** Reuse KaTeX, the mulberry32/FNV-1a determinism pattern, deterministic result IDs, Firestore transactions, the Guided/Independent flow, and the `progress.js` pure-function analytics layer.
3. **Generic engine, physics first.** Step types are pluggable (discriminated union). v1 ships one kinematics template end-to-end; math (algebra rearrangement) reuses the same engine later.
4. **Analytics as a first-class output.** Error classes feed teacher dashboards: *"64% of the class failed at equation selection"* → tomorrow's lesson plan writes itself.

---

## 2. Question schema (new question type: `stepped`)

```js
{
  id: "q_phys_kin_fv_001",
  type: "stepped",
  subject: "physics",
  grade: "m4",
  chapter: "การเคลื่อนที่แนวตรง",            // existing chapter/topic system
  topic: "หาความเร็วปลาย (accelerated motion)",

  template: {
    params: {
      vi: { min: 2.0, max: 3.0, step: 0.1, dp: 1, unit: "m/s" },
      a:  { min: 1.0, max: 2.0, step: 0.1, dp: 1, unit: "m/s²" },
      d:  { min: 100, max: 300, step: 10,  dp: 1, unit: "m"   }
    },
    problemText: "รถคันหนึ่งกำลังวิ่งด้วยความเร็ว {vi} m/s แล้วเร่งด้วยความเร่งคงที่ {a} m/s² เป็นระยะทาง {d} m จงหาความเร็วสุดท้ายของรถ",
    unknown: { symbol: "vf", unit: "m/s" },
    answerExpr: "sqrt(vi^2 + 2*a*d)",       // evaluated at render time (mathjs)
    tolerance: { type: "relative", value: 0.01 }   // ±1 %
  },

  steps: [ /* see §3 — array order = solving order */ ]
}
```

### 2.1 Per-attempt randomization (the seed trick)

Current MC shuffle: `mulberry32(FNV1a(uid + ":" + questionId))`. Extend the seed with the attempt number:

```js
seed = FNV1a(`${uid}:${questionId}:${attemptNo}`)
```

This gives, for free:

- **New numbers on every restart** — the observed "BACK TO BEGINNING with fresh values" penalty; answers can't be memorized.
- **Different numbers per student** — anti-copying in live sessions, same property as the existing MC shuffle.
- **Determinism** — params are *derivable*, never trusted from the client. Any later verification (or a Cloud Function) can re-derive the exact variant a student saw from `(uid, questionId, attemptNo)` alone. Nothing about the variant needs to be stored except `attemptNo`.

Param generation (pure function, unit-testable like `progress.js`):

```js
value = min + floor(rand() * ((max - min) / step + 1)) * step   // rounded to dp
```

**Guard:** always recompute the expected final answer from generated params at render/validation time. Never store per-variant answers.

---

## 3. Step types (pluggable engine)

Discriminated union on `stepType`. Four types cover the entire observed flow. (The video's steps 1–3 were never on screen — inferred as "read / identify what's asked / identify unknown". If we want them, they're a cheap `select`-style step; v1 skips them.)

### 3.1 `givens` — extract values + attach units

```js
{
  stepType: "givens",
  title: "Givens & Units",
  fields: [
    { symbol: "d",  expectedParam: "d",  expectedUnit: "m"    },
    { symbol: "vi", expectedParam: "vi", expectedUnit: "m/s"  },
    { symbol: "a",  expectedParam: "a",  expectedUnit: "m/s²" }
  ],
  unitPalette: ["s", "m", "m/s", "m/s²"],
  feedback: {
    "givens.wrongValue": "อ่านโจทย์อีกครั้ง แล้วสังเกตหน่วยที่เขียนติดกับตัวเลข: m คือระยะทาง, m/s คือความเร็ว, s คือเวลา, m/s² คือความเร่ง",
    "givens.wrongUnit":  "หน่วยนี้ไม่ตรงกับปริมาณ ลองดูว่าตัวเลขนี้ในโจทย์บอกปริมาณอะไร"
  }
}
```

- Each **(value, unit) pair validates independently**; only the wrong field gets the in-place red-X treatment. Correct fields stay untouched (exactly as observed at 02:12).
- Numeric keypad for values; **drag-and-drop unit chips** from the palette ("tap to delete" to remove).
- Note: current `mathAnswer.js` strips units — this step makes units a *separately checked answer component*, which is the point.

### 3.2 `equationSelect` — MC with distractor-specific feedback

This is the existing MC mode **plus one field**: per-distractor feedback.

```js
{
  stepType: "equationSelect",
  prompt: "จาก givens และ unknown ของเรา ควรใช้สมการใด",
  options: [
    { latex: "v_f = v_i + at",
      correct: false,
      errorClass: "equation.requiresTime",
      feedback: "สมการนี้ต้องรู้เวลา (t) แต่โจทย์ไม่ได้ให้เวลา และไม่ได้ถามหาเวลา" },
    { latex: "d = v_i t + \\tfrac{1}{2}at^2",
      correct: false,
      errorClass: "equation.requiresTime",
      feedback: "สมการนี้ต้องรู้เวลา และไม่มี v_f ที่โจทย์ถามหา" },
    { latex: "v_f^2 = v_i^2 + 2ad",
      correct: true }
  ]
}
```

Reuses: KaTeX rendering, mulberry32 per-student option shuffle. The wrong pick stays visible with a red X while the feedback panel shows (observed at 01:23) — the student sees exactly which choice failed and *why that choice specifically* fails.

### 3.3 `rearrange` — drag tiles into a scaffold

```js
{
  stepType: "rearrange",
  reference: "v_f^2 = v_i^2 + 2ad",
  instruction: "จัดรูปสมการเพื่อหา unknown แล้วลากตัวแปรจาก palette มาวางในช่อง",
  scaffold: "v_f = \\sqrt{ ⧠₁ + ⧠₂⧠₃⧠₄ }",   // KaTeX with positioned drop-zone slots
  slots: [
    { accepts: ["vi²"] },
    { accepts: ["2", "a", "d"], group: "product" },   // commutative group:
    { accepts: ["2", "a", "d"], group: "product" },   // 2·a·d in any order OK
    { accepts: ["2", "a", "d"], group: "product" }
  ],
  palette: ["vi", "vi²", "vf", "vf²", "a", "d", "2", "½"],  // includes distractors
  errorClass: "rearrange.wrongTile",
  feedback: "ดูสมการอ้างอิงอีกครั้ง — ตัวแปรตัวไหนกำลังสอง ตัวไหนไม่ได้กำลังสอง และ ½ มาจากสมการอื่น"
}
```

- The scaffold **fixes the structure** (radical pre-drawn), the student supplies the symbols — exactly the observed design. Distractor tiles (`vf²`, `½`, unsquared `vi`) make guessing costly.
- Validation: each slot checks membership; `group: "product"` slots additionally check the *set* {2, a, d} is complete without duplicates.
- **Reuses your existing drag-and-drop work**: the Thai-language inequality templates already solved iPad touch (`touchstart`/`touchmove`/`touchend`, `document.elementFromPoint()`, ghost element). Port that handling into a React component.

### 3.4 `compute` — final numeric answer

```js
{
  stepType: "compute",
  showRecap: true,     // left column: Givens / Unknown / Equation — the student's own
                       // Step-1..3 output carried forward (observed at 03:51)
  answerField: { symbol: "vf", unitProvided: "m/s" },   // unit is GIVEN here;
                                                        // only the number is typed
  errorClass: "compute.wrongValue",
  feedback: "ตรวจการแทนค่าและการคำนวณอีกครั้ง (ยกกำลังก่อน คูณก่อน แล้วค่อยถอดราก)"
}
```

Expected value and tolerance come from `template.answerExpr` + `template.tolerance`.

**Boundary semantics (spec'd 20 Jul 2026):** the comparison is inclusive, with an explicit float-safety epsilon — pass iff

```
|student − expected| ≤ tolAbs + 1e-9 · max(1, |expected|)
```

where `tolAbs` is `tolerance.value` for absolute tolerance, and `tolerance.value · |expected|` for relative. The epsilon sits far below any precision a student can type, so grading strictness is unchanged; it only prevents IEEE754 artifacts from rejecting mathematically-exact boundary answers (e.g. expected `29.6`, absolute tol `0.1`, student `29.7` → the float diff computes to `0.10000000000000142` and must still pass).

Sanity check for the doc's example variant: √(2.6² + 2·1.5·290) ≈ **29.6 m/s** ✓.

---

## 4. Results & error classes in Firestore

Extend the deterministic-ID pattern. One document per (session, student, question):

```
results/{sessionId}_{uid}_{questionId}
```

```js
{
  sessionId, uid, questionId, type: "stepped",
  attempts: [
    { n: 1, failedStepIndex: 1, errorClass: "equation.requiresTime",
      wrongElement: "d = v_i t + ½at²", tMs: 41000 },
    { n: 2, failedStepIndex: 0, errorClass: "givens.wrongValue",
      wrongElement: "d", tMs: 19000 },
    { n: 3, completed: true, tMs: 74000 }
  ],
  completedOnAttempt: 3,
  totalTimeMs: 134000,
  tokensAwarded: 1        // written in the same transaction (existing anti-replay pattern)
}
```

- Appends go through the existing **Firestore transaction** path (same guard that prevents token replay).
- Nothing about the variant is stored — `n` + the seed rule re-derives it.

### 4.1 The error-class taxonomy (keep it small)

```
givens.wrongValue      givens.wrongUnit
equation.requiresTime  equation.missingUnknown   equation.other
rearrange.wrongTile    rearrange.incompleteProduct
compute.wrongValue
```

Machine-readable, dot-namespaced, ~8 classes. Resist the urge to over-split — the value is in aggregation.

### 4.2 New pure functions in `progress.js`

Same style as the streak/understanding functions (unit-testable, no Firebase imports):

```js
aggregateErrorClasses(results)        // → { "givens.wrongUnit": 12, "rearrange.wrongTile": 7, ... }
weaknessProfile(studentResults)       // → dominant failure step per student
classHeatmap(sessionResults, steps)   // → per-step failure % for the teacher view
```

**Teacher payoff:** the class heatmap turns "students did badly" into "the class specifically breaks down at *unit assignment*" — step-level diagnosis no current BP-Tutor feature provides. This also refines the per-chapter understanding % (step-level grain instead of question-level).

---

## 5. Component architecture

```
<SteppedQuestionRunner>        // owns: attemptNo, seed, params, stepIndex, status
 ├─ <StepHeader/>              // "Step 2/4" + problemText with params injected
 ├─ (switch on steps[i].stepType)
 │   ├─ <StepGivens/>          //   numeric fields + <UnitChipDnD/>
 │   ├─ <StepEquationSelect/>  //   existing MC component + per-option feedback
 │   ├─ <StepRearrange/>       //   <TilePalette/> + <ScaffoldSlots/> (KaTeX)
 │   └─ <StepCompute/>         //   recap column + numeric field
 ├─ <IncorrectPanel/>          // slide-in card: errorClass feedback + restart button
 └─ <NumericKeypad/>           // shared modal keypad (digits, ".", "-", backspace)
```

State machine per question:

```
idle → step[i] → validate ─ pass → step[i+1] … → complete → write result (transaction)
                     └─ fail → IncorrectPanel → restart(attemptNo+1, new seed) → step[0]
```

### Flow-mode integration (Guided vs Independent)

- **Guided:** per-step retry allowed once before restart; feedback panel shows the full diagnostic.
- **Independent:** faithful clone — any failure = restart with new numbers; diagnostic still shown (that's the teaching moment).

*(Exact policy is Decision 1 below.)*

---

## 6. Reuse map

| Need | Already in BP-Tutor |
|---|---|
| Equation rendering | KaTeX |
| Per-student, per-attempt determinism | mulberry32 + FNV-1a (extend seed with `attemptNo`) |
| Equation-selection step | MC mode + add `feedback`/`errorClass` per option |
| Drag-and-drop on iPad | inequality-template touch handling (port to React) |
| Result integrity / anti-replay | deterministic IDs + Firestore transactions |
| Analytics layer | `progress.js` pure-function pattern |
| Chapter/topic wiring | existing autocomplete system |
| Token award | existing transaction hook at completion |

**Net-new builds:** step runner + state machine, givens/unit-chip step, rearrange scaffold, IncorrectPanel, error-class taxonomy, template param generator, `progress.js` aggregations, teacher heatmap view.

---

## 7. Decisions (resolved 20 Jul 2026)

1. **Restart policy → (c) teacher-configurable per session.** The session document gains a config block, surfaced as one toggle in the teacher's session-creation UI:

   ```js
   sessionConfig.stepped = {
     restartPolicy: "strict" | "stepRetry",  // default: "strict" in Independent, "stepRetry" in Guided
     retriesPerStep: 1
   }
   ```

   *Retry semantics:* a `stepRetry` retry re-attempts the **same step with the same numbers** (no reseed, `attemptNo` unchanged); only a **full restart** increments `attemptNo` and regenerates params. `retriesUsed` resets when a step is passed and on every full restart.

2. **Tokens → flat, equal award on completion.** Every student who finishes the question receives the same fixed token amount regardless of attempt count, written in the existing anti-replay transaction. No first-attempt bonus. Rationale: because every restart regenerates the numbers, completion is already proof the student performed the full process — and a flat reward removes the discouragement risk for weaker students entirely.

3. **v1 scope → generic engine, one template.** Ship *"accelerated motion → find final velocity"* end-to-end. After that, adding problems is authoring work, not engineering work.

---

## 8. Suggested build order

1. **Param generator + seed extension** — pure functions, tested like `progress.js` (small, day-one win)
2. **Step runner + `compute` step** — simplest step type; gives a working end-to-end skeleton
3. **`equationSelect`** — mostly reuse of MC
4. **`givens` + unit chips** — new DnD but simple drop targets
5. **`rearrange`** — hardest UI; base it on the old drag-drop code
6. **`IncorrectPanel` + error-class result writes**
7. **`progress.js` aggregations + teacher heatmap**

Items 1–3 are a weekend-scale chunk at your usual pace; 4–5 are the real work; 6–7 close the loop and unlock the analytics payoff.
