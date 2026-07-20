# Video Analysis: "1D Kinematics" (Nerd Island Studios)

**Source:** `videos/physics-demo.mp4` — screen recording of an iPad app, 03:58, 1200×1600 (portrait recording; problem screens run in landscape, so they appear rotated 90° in the raw video).

**App identified:** *Physics — 1D Kinematics* question module, Version 1.6, © 2012–2015 Nerd Island Studios, LLC. Recorded as reference material for BP-Tutor feature planning.

**Analysis basis:** 14 scene-change frames extracted across the full video. No audio transcript was available (frames-only analysis). Timestamps below are absolute video time. Steps 1–3 of the app's 7-step flow never appear in the extracted frames — the recording starts at the topic picker and jumps to Step 4/7 — so those steps are marked *inferred*.

---

## 1. The problem the app solves

Typical physics practice apps present a word problem and check a single final numeric answer. When the student is wrong, the app can't tell them *why* — was it a reading error, a unit mix-up, the wrong equation, bad algebra, or bad arithmetic?

This app decomposes each kinematics problem into **7 independently-checked steps** that mirror the canonical physics problem-solving method taught in class:

> read the problem → extract givens → attach units → choose the equation → rearrange for the unknown → substitute → compute.

Each step is validated separately, and a wrong answer produces a **step-specific diagnostic message** tied to the *type* of error the student made (e.g. picking an equation that requires a variable they don't have). The student cannot brute-force a final answer; they must demonstrate the process.

Two supporting design decisions amplify this:

- **Problem templates with randomized numbers.** The same problem skeleton reappears with fresh values on every attempt (observed: initial velocity 2.2 → 2.8 → 2.6 m/s and distance 140.0 → 240.0 → 290.0 m across three attempts in the video). Failing a step sends the student "back to the beginning" with *new numbers*, so answers can't be memorized or copied.
- **Massive generated volume.** The topic screen shows a progress counter of `0 / 1368` for a single topic — clearly template-generated variants, not hand-authored questions.

---

## 2. Every screen in order, with timestamps

| # | Time | Screen | What happens |
|---|------|--------|--------------|
| 1 | 00:00 | **Topic / question-type picker** (portrait) | "1D Kinematics" topic page inside a blue-binder notebook UI. Scrollable list of question types; score `0 / 1368`; tab rail to other physics topics. User picks *Accelerated Motion Finding Final Velocity*. |
| 2 | 00:54 | **Step 4/7 — Givens & Units** (landscape, attempt 1) | Problem: car at 2.2 m/s, a = 1.5 m/s², travels 140.0 m, find final velocity. Empty fields `d=`, `vi=`, `a=` show `00.0`; numeric keypad open. |
| 3 | 01:01 | Step 4/7 (cont.) | `d = 140` entered via keypad. |
| 4 | 01:04 | Step 4/7 (cont.) | `vi = 2.2` entered. |
| 5 | 01:23 | **Step 5/7 — Equation selection + "Incorrect!" panel** | Givens summary (d = 140.0 m, vi = 2.2 m/s, a = 1.5 m/s²; unknown vf = ??? m/s) and three candidate equations. The student pressed `d = vi·t + ½at²` — it is crossed out with a red X, and a slide-in panel explains: *"You do not know the time, they ask you to find it."* A **BACK TO BEGINNING** button restarts the problem. |
| 6 | 01:53 | **Step 4/7 — attempt 2, new numbers** | Same template, re-randomized: vi = 2.8 m/s, d = 240.0 m. All fields reset to `00.0`. |
| 7 | 01:58 | Step 4/7 (cont.) | Student enters `d = 140` — the *old* attempt's number (a realistic transcription/re-reading error, seemingly deliberate for the demo). |
| 8 | 02:02 | Step 4/7 (cont.) | `vi = 2.8` entered. `d` still 140. |
| 9 | 02:12 | **Step 4/7 — wrong-given feedback** | On submit, the incorrect given `d = 140 m` is crossed out with a red X. Slide-in panel: *"Re-read the problem… the units written next [to each] number: [m] goes with distance/displacement, [m/s] goes with velocity, [s] goes with time, [m/s²] goes with acceleration."* This screen also reveals the unit mechanic: unit chips are **dragged** onto each given ("Drag Units This Way — Tap to Delete"). |
| 10 | 02:37 | **Step 4/7 — attempt 3, new numbers again** | Re-randomized: vi = 2.6 m/s, d = 290.0 m. Fields reset. |
| 11 | 02:43 | Step 4/7 (cont.) | `d = 290` entered (correctly this time). |
| 12 | 02:45 | Step 4/7 (cont.) | `vi = 2.6` entered. |
| 13 | 03:02 | **Step 6/7 — Algebraic rearrangement** | Chosen equation `vf² = vi² + 2ad` shown. Instruction: *"Solve the equation for your unknown. Drag the variables from the palette to the right."* Empty tile slots sit under a pre-drawn radical: `vf = √( ▢ + ▢▢▢ )`. Palette tiles: `vi`, `vi²`, `vf`, `vf²`, `a`, `d`, `2`, `½`. "Tap to Delete." |
| 14 | 03:51 | **Step 7/7 — Substitute & solve** | Summary column (Givens: d = 290.0 m, vi = 2.6 m/s, a = 1.5 m/s²; Unknown: vf = ??? m/s; Equation: vf² = vi² + 2ad), a red car illustration, and a single input `vf = [00.0] m/s` with the numeric keypad open. |

Not captured in frames: Steps 1–3 (*inferred:* likely reading the problem, identifying the question type / what is asked, and identifying the unknown — the standard preamble to "list your givens"), and the success/completion screen after Step 7.

---

## 3. The 7-step flow and error-typed feedback

The step counter in the header (`Step 4/7` … `Step 7/7`) makes the pipeline explicit. Observed and inferred:

| Step | Content | Evidence |
|------|---------|----------|
| 1–3 | *Inferred:* read problem, identify question type / what's asked, identify the unknown variable | Never on screen in extracted frames |
| 4 | **Givens & Units** — type each given value (numeric keypad) and drag the correct unit chip onto it | 00:54–02:45, multiple attempts |
| 5 | **Equation selection** — choose the correct kinematic equation from 3 candidates | 01:23 |
| 6 | **Algebraic rearrangement** — build the solved-for-unknown form by dragging symbol tiles into slots | 03:02 |
| 7 | **Substitute & solve** — enter the final numeric answer with the unit displayed | 03:51 |

### How error-typed feedback works

Every observed failure produces feedback that is **specific to the error class**, not a generic "wrong, try again":

1. **Wrong equation choice (Step 5).** The chosen equation gets a red X drawn over it in place, and the slide-in panel explains the *reasoning* error: `d = vi·t + ½at²` is wrong **because it requires time, which is neither given nor asked**. This is distractor-specific feedback — each wrong equation presumably has its own rationale.

2. **Wrong given value (Step 4).** The specific incorrect field (`d = 140` when the problem said 290… actually 240 on that attempt) is crossed out with a red X — the other, correct givens are left untouched — and the panel coaches the *strategy* for the error class: re-read the problem and use the units printed next to each number to identify which quantity is which (m ↔ displacement, m/s ↔ velocity, s ↔ time, m/s² ↔ acceleration).

3. **Failure penalty = restart with new numbers.** The "Incorrect!" panel's exit button is **BACK TO BEGINNING**. The student returns to the start of the problem with a **re-randomized variant** (numbers changed on every observed restart). This makes retrying meaningful: the student must redo the *process*, not re-enter memorized values.

The feedback panel itself is consistent: it slides in from the screen edge, has a dark header bar reading "Incorrect!", body text with the diagnostic, and the single restart button.

---

## 4. Detailed UI notes per screen

### 4.0 Global visual language

- **Skeuomorphic notebook theme** throughout: blue plastic 3-ring binder cover, white lined notebook paper with horizontal blue rules and a red vertical margin line, metal spiral/ring bindings rendered along the bound edge, all on a beige fabric/canvas desktop texture.
- **Hand-drawn aesthetic:** all app chrome (buttons, field boxes, unit chips, equation boxes) is drawn with a sketchy, marker-style irregular outline; all text uses a handwritten felt-tip-style font. Exceptions: the numeric keypad and status bar.
- **Orientation split:** the topic picker is portrait; all problem-solving screens are landscape. (In the raw 1200×1600 portrait recording, problem screens therefore appear rotated 90°.)
- **Recurring chrome on problem screens:** `BACK` button (top-left, arrow-shaped outline), `SUBMIT` button (top-right), step title running across the top: *"Accelerated Motion Finding Final Velocity Step N/7"*, problem statement in blue handwritten text directly below the title, and a thin red border framing the page edge.
- **Color roles:** blue = binder, keypad, problem text, instructional arrows; grey/graphite = button fills and tile slots; red = error marks (X-outs), page border, margin line; dark green = "Incorrect!" panel header; yellow = active-tab highlight and equation-highlight on selection.

### 4.1 Topic / question-type picker (00:00, portrait)

- **Layout:** full-page notebook sheet inside the blue binder. Centered title "1D Kinematics". Below it, a two-column arrangement: left = question-type list, right = profile/score.
- **Question-type list:** a bordered, vertically scrollable container labeled "Pick a Question Type" holding grey rounded-rectangle buttons, one per template: *Constant Motion Finding Velocity / Finding Time / Finding Displace…*, *Accelerated Motion Finding Time / Finding Final Vel… / Finding Displace… / Finding Accelerati…*, with more clipped below. Long labels are truncated with `…`. A vertical "Scroll Me" label with up/down arrows sits along the container's left edge — an explicit scroll affordance.
- **Score block (right):** profile name ("Big") above a per-topic progress counter `0 / 1368` (solved / total variants).
- **Topic tab rail (right edge):** vertical file-folder-style index tabs — *1D Kinematics* (yellow = active), *2D Kinematics & Vectors*, *Newton's Laws*, *Energy & Momentum*, *Circular Motion & Gravity*. The whole app is one binder; each physics unit is a tab.
- **Top bar:** `BACK` (left), `?` help button and `EMAIL` button (right).
- **Footer:** "Version 1.6 © 2012–2015 Nerd Island Studios, LLC All Rights Reserved".

### 4.2 Step 4/7 — Givens & Units (00:54–02:45, landscape)

- **Layout:** step title + problem paragraph across the top; heading "Givens & Units:" in large handwritten text; below it a vertical stack of three labeled fields: `d =`, `vi =`, `a =`.
- **Value fields:** each is a sketchy rounded box displaying `00.0` as the empty placeholder. A blue arrow annotation labeled "Tap To Adjust" points at the fields. Tapping a field opens the keypad.
- **Numeric keypad:** a modal dark-grey rounded panel of glossy blue rounded-square keys: digits 1–9 in a 3×3 grid, then `0`, `.`, `-`, and a wide blue `Backspace` key. No Enter key — dismissal appears to happen by tapping elsewhere; final check is via the global `SUBMIT` button. The keypad overlays (occludes) part of the problem text while open.
- **Unit chips:** a row of four small square sketchy chips — `s`, `m`, `m/s`, `m/s²` — positioned above/beside the fields. Units are **dragged** from this palette onto a slot next to each value ("Drag Units This Way" arrow annotation, revealed at 02:12) and removed by tapping ("Tap to Delete"). The unit is a separate answer component from the number.
- **Validation:** pressing `SUBMIT` checks each (value, unit) pair independently; a wrong pair is crossed out in place with a red X (see 4.5).

### 4.3 Step 5/7 — Equation selection (01:23, landscape)

- **Layout:** two-column. Left column, small handwritten text: `Givens:` list (`d = 140.0 m`, `vi = 2.2 m/s`, `a = 1.5 m/s²`) and `Unknown:` (`vf = ??? m/s`) — the student's own Step-4 output carried forward. Beside it, the prompt: *"Looking at your givens and unknown, which accelerated motion equation would you use to solve the problem?"*
- **Equation options:** heading "Equations: (press me)" followed by three boxed, tappable equations rendered in handwritten math notation:
  - `vf = vi + at`
  - `d = vi·t + ½at²`
  - `vf² = vi² + 2ad` (the correct choice for these givens)
- **Selection feedback:** the tapped wrong equation gets a yellow highlight plus a hand-drawn red X through the whole box, kept visible on screen while the Incorrect panel is shown — the student sees exactly which choice failed.

### 4.4 "Incorrect!" feedback panel (01:23, 02:12)

- Slides in from the screen edge over the notebook page, styled as a separate card. Dark-green header bar with white "Incorrect!" text; body in small plain text with the error-class-specific diagnostic; a single `BACK TO BEGINNING` button (arrow-shaped, like BACK) at the bottom.
- Observed diagnostics:
  - Equation error: *"You do not know the time, they ask you to find it."*
  - Given-extraction error: *"Re-read the problem… the units written next [to each] number: [m] goes with distance/displacement, [m/s] goes with velocity, [s] goes with time, [m/s²] goes with acceleration."*
- Dismissing it restarts the problem with newly randomized numbers.

### 4.5 Step 4/7 — wrong-given state (02:12)

- Same Givens & Units layout, post-submit: the incorrect entry (`d = 140` with unit `m`) is crossed out with a red X drawn over the value box; the correct entries (`vi = 2.8 m/s`, `a = 1.5 m/s²`) remain untouched. The unit chip palette and the drag/delete annotations are visible on the right. The Incorrect panel is on screen simultaneously.

### 4.6 Step 6/7 — Algebraic rearrangement (03:02, landscape)

- **Layout:** the selected equation `vf² = vi² + 2ad` is displayed at top as reference. Instruction text: *"Solve the equation for your unknown. Drag the variables from the palette to the right."*
- **Answer scaffold:** a partially pre-drawn target expression: `vf = √( … )` with a hand-drawn radical sign, containing **four empty grey gradient tile slots** arranged as `▢ + ▢▢▢` under the radical (i.e. the student must build `vi² + 2·a·d`). The scaffold fixes the overall structure; the student supplies the symbols.
- **Tile palette:** a grid of draggable sketchy tiles at the screen edge: `vi`, `vi²`, `vf`, `vf²`, `a`, `d`, `2`, `½`. Includes plausible wrong tiles (unsquared/squared confusions, the `½` from the other equation). "Tap to Delete." removes a placed tile.

### 4.7 Step 7/7 — Substitute & solve (03:51, landscape)

- **Layout:** left column recaps the full working in small handwritten text — `Givens:` (d = 290.0 m, vi = 2.6 m/s, a = 1.5 m/s²), `Unknown:` (vf = ??? m/s), `Equation:` (`vf² = vi² + 2ad`) — everything the student produced in Steps 4–6. A heading beginning "Substitu…" (occluded by the keypad) introduces the final computation.
- **Decoration:** a red cartoon car illustration along one edge — the problem's subject drawn in.
- **Input:** a single answer field `vf = [00.0] m/s` — note the unit is *provided* here, the student supplies only the number — with the same modal numeric keypad open. Expected answer for this variant: `vf = √(2.6² + 2·1.5·290) ≈ 29.6 m/s`.

---

## 5. Takeaways relevant to BP-Tutor

(See the fuller comparison discussed in session; summary.)

1. **Heterogeneous step types** (extract givens / assign units / pick equation / build expression / compute) vs BP-Tutor's uniform type-an-answer steps.
2. **Error-typed, distractor-specific feedback** with in-place red-X marking of the exact wrong element.
3. **Units as a separately-checked answer component** (BP-Tutor's `mathAnswer.js` currently strips units).
4. **Template questions with per-attempt randomization** — also an anti-copying mechanism for live classroom sessions.
5. **Restart-with-new-numbers as the failure penalty**, making the process (not the answer) the thing being practiced.
