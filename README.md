# B & P Tutor

A classroom "exit ticket" quiz app for math and science tutoring, built with React and Firebase.

- **Teacher** (fixed Google account) manages a question bank (multiple choice, fill-in-the-blank, short answer, with LaTeX support and a built-in drawing tool), starts a live session with selected questions, and watches results arrive in real time.
- **Students** sign in with Google, wait for a session, then work through two phases:
  1. **Guided Mode** — multiple choice / fill-in-the-blank with one retry and a hint.
  2. **Independent Mode** — step-by-step solutions (or a free-form short answer), checked with text/LaTeX/numeric-tolerance matching.

## Tech stack

- React 19 (Create React App), inline styles, no router in use
- Firebase: Google Auth, Firestore (questions / sessions / results), Storage (question images and drawings)
- KaTeX via `react-katex` for math rendering

## Getting started

```
npm install
npm start        # dev server at http://localhost:3000
npm test         # run tests once with: npm test -- --watchAll=false
npm run build    # production build in build/
```

The Firebase project config lives in `src/config/firebase.js`. The web API key there is not a secret — access control comes entirely from the security rules below.

## Security rules (important)

Access control lives in `firestore.rules` and `storage.rules`, keyed to the teacher's email (which must match `TEACHER_EMAIL` in `src/App.js`). On every login the app creates `/students/{uid}` if missing (backfilling only absent fields on existing docs) and routes to the Teacher Dashboard or Student page based on that doc's `role` field; `TEACHER_EMAIL` is only used to decide the role written to a brand-new doc. Rules prevent non-teachers from writing any role other than `student`. **The app is not safe to use until these are deployed:**

```
firebase deploy --only firestore:rules,storage
```

Storage CORS (needed once per bucket for uploads from the app's origins):

```
gsutil cors set cors.json gs://bp-tutor-3db94.firebasestorage.app
```

### Known trade-off: client-side grading

Session questions — including correct answers and hints — are downloaded to the student's browser, and grading happens client-side. A student who opens browser DevTools can see the answers or forge a result's `correct` flag (rules prevent them from impersonating another student, but not from flattering themselves). This is an accepted trade-off for a small, supervised tutoring class; moving grading to Cloud Functions would be required to close it.

## Data model (Firestore)

| Collection  | Written by | Contents |
|-------------|------------|----------|
| `questions` | teacher    | text, type (`mc` / `fill_in_blank` / `sa`), options/blanks/steps, hint, image URL, grade/subject/difficulty |
| `sessions`  | teacher    | `questionIds`, `isActive`, timestamps |
| `results`   | students   | one row per resolved question/blank/step: mode, correctness, attempts, hint usage, the student's answer, `tokensEarned`. Doc IDs are deterministic (`session_student_question_row`) and rows are create-only, so replaying a session never re-credits tokens |
| `students`  | students + teacher | `studentName`, `studentEmail`, `photoURL`, `role` (`teacher` / `student`), `tokenBalance` (running total), `createdAt` |
| `tokenHistory` | students + teacher | append-only ledger: `type` (`question` / `bonus` / `redemption`), signed `amount`, metadata |
| `rewards`   | teacher    | reward catalog: name, image, `tokenCost`, optional `stock` (null = unlimited) |
| `redemptionRequests` | students + teacher | student redemption requests; `status` `pending` → `approved` / `rejected` |

### Token rewards

Correct answers earn tokens by question difficulty — Easy 1, Medium 5, Hard 10 — halved when the second attempt was needed, per result row (each MC question, fill-in blank, or solution step). Tokens are deducted **only when the teacher approves** a redemption request (approval runs in a transaction that re-checks balance and stock), so rejections need no refunds.

Older question documents may use `type` only (newer ones also carry `questionType`) and numeric grades `7/8/9`; the app reads both forms, and the teacher dashboard offers a one-click grade-label migration when old labels are detected.
