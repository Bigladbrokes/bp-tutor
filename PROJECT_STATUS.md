# PROJECT_STATUS — B & P Tutor

> Handover document for the next agent. Written 2026-07-15 at commit `2273a49` (working tree clean, 49/49 tests passing, production in sync with HEAD).
>
> **⚠️ SUPERSEDED SNAPSHOT — not current state.** This document is frozen at 2026-07-15 and has not been updated since. For current status, see [`BP-Tutor_STATUS.md`](BP-Tutor_STATUS.md). Known-stale claims in this file, corrected inline below (verified 2026-07-31):
> - §4 originally said the Teacher Dashboard Phase 1 was "NOT started" and blocked on user confirmation — false as of commits `245705e`, `ba5688c`, `ef55649`, `6429329`, `efb5610` (2026-07-15/16), which built and shipped it. It is done; see `BP-Tutor_STATUS.md`.
> - §3/§7 originally said "49/49 tests passing" — the suite has since grown to 195 tests across 14 suites (`npm test`), plus a separate 22-test Firestore rules suite (`npm run test:rules`) added later and not covered by this document at all.
> - The rest of this document (architecture, data model, business rules, gotchas) has not been re-verified since 2026-07-15 and may also be stale — treat as historical context, not ground truth.

## 1. Objective

Classroom "exit ticket" quiz platform for a Thai tutoring school (M.1–M.3 math & science, ~60 students, nearly all on phones). One teacher account runs live sessions on a projector; students join by QR/code, answer guided + step-by-step questions, and earn tokens they redeem for physical rewards. A student motivation layer (streaks, per-chapter understanding %) and a growing teacher analytics layer sit on top. UI text is mixed English (chrome) and Thai (student-facing content).

- **Production**: https://bp-tutor-3db94.web.app (Firebase Hosting, project `bp-tutor-3db94`)
- **Repo**: https://github.com/Bigladbrokes/bp-tutor (branch `main`; deploys are manual from this machine)
- **Teacher account**: `bigladbrokes1@gmail.com` — hardcoded in `src/App.js` (`TEACHER_EMAIL`, bootstrap only) and in `isTeacher()` in `firestore.rules` / `storage.rules`. These three must stay in sync.
- Beware: the Firebase console also contains an unrelated project ("StepUp Math") — always confirm you're in `bp-tutor-3db94`.

## 2. Architecture

**Stack**: React 19 on Create React App (react-scripts 5.0.1, inline styles everywhere, no CSS framework), react-router-dom v7, Firebase v12 (Auth/Firestore/Storage/Hosting), KaTeX via react-katex, qrcode.react.

CRA + router v7 needs two shims — do not remove:
- `package.json` → `jest.moduleNameMapper` maps `react-router/dom` (CRA's Jest can't resolve package `exports`)
- `src/setupTests.js` → TextEncoder/TextDecoder polyfill

**Routes** (`src/App.js`): `/` (role-routed: teacher → TeacherPage, student → StudentPage, signed-out → LoginPage; role comes from `/students/{uid}.role` with email fallback) · `/session/:sessionId` (QR deep link → `SessionGate` validates: active → quiz, ended/not-found → friendly screens) · `/join` (6-char code entry) · `*` → `/`.

**Auth**: Google popup-primary with redirect fallback only on `auth/popup-blocked`/`auth/cancelled-popup-request`; `getRedirectResult` consumed on LoginPage mount. `authDomain` is `bp-tutor-3db94.web.app` (same-origin as the app — this fixed the iOS Safari / incognito "missing initial state" error; do not revert it to `firebaseapp.com`).

**Firestore data model**:

| Collection | Written by | Key fields |
|---|---|---|
| `questions` | teacher | `text`, `type`+`questionType` (`mc`/`fill_in_blank`/`sa` — dual field, legacy), `options[]`, `correctAnswer` (**string index** into options), `blanks[]` (`{id, answer, hint}`, answers may contain `\|`-separated alternatives), `steps[]` (`{id, instruction, correctAnswer, hint, tolerance}`), `chapter` (normalized string), `grade` (`M.1/M.2/M.3`; legacy `7/8/9` handled by `normalizeGrade`), `subject`, `difficulty`, `imageUrl/imagePath`, `drawingShapes[]` (editable vector data) |
| `sessions` | teacher | `questionIds[]`, `isActive`, `joinCode` (6 chars, unique among active), `startedAt/endedAt`; subcollection `joins/{uid}` = presence markers |
| `results` | students | Deterministic doc ID `{sessionId}_{uid}_{questionId}_{mc\|blank-N\|step-N\|free}` (rules enforce segment[1] = writer uid; **73 oldest rows have auto-IDs — never parse IDs, read fields**). Fields: `sessionId/studentUid/Name/Email`, `questionId`, `mode` (`guided`/`independent`), `correct` (bool, or **null** = ungraded free-form), `attempts` (1/2), `usedHint`, `answer` (MC: original index; free-form: text) / `answerText` (MC option text) / `studentAnswer` (steps), `blankId`/`stepId`/`stepOrder`, `tokensEarned`, `timestamp` (server), timing: `shownAtMs`, `timeToFirstCheckMs` (thinking time to first Check), `timeToResolveMs` (incl. retry) |
| `students` | student self + teacher | `role`, `studentName/Email`, `photoURL`, `tokenBalance`, `grade` (teacher-assigned in Rankings tab) |
| `tokenHistory` | student (type `question` only) + teacher | append-only ledger; `amount` signed, `type` `question/bonus/redemption`; ledger sum must equal `tokenBalance` (verified in production) |
| `rewards` | teacher | `name`, `tokenCost`, `stock` (number or null=unlimited), `imageUrl/imagePath` |
| `redemptionRequests` | student creates pending; teacher resolves | tokens deducted **only at approval**, inside a transaction re-checking status/balance/stock |

**Security model**: rules in `firestore.rules`/`storage.rules` (both deployed). Trust model is documented in README: grading is client-side; students self-report results/tokens (rules stop impersonation and replay double-credit via create-only deterministic IDs, not self-flattery; the ledger is the audit trail). Students may `list` only their own results (`studentUid == auth.uid`), read questions/sessions/rewards, write only their own student doc (role-locked), join markers, pending redemption requests.

**Services** (`src/services/`): `firestore.js` (questions/sessions CRUD, `startSession` generates unique joinCode, `findSessionByCode`, join markers, `getMyResults`) · `tokens.js` (`saveResultWithTokens` — one transaction writes the result row + balance increment + ledger, replay-proof; `TOKEN_VALUES` Easy 1 / Medium 5 / Hard 10, halved on attempt 2, **per result row**; reward CRUD; `approveRequest` transaction) · `progress.js` (streak + chapter %) · `chapters.js` (`normalizeChapter`, `chaptersFor`, `normalizeGrade` — MetaBadges re-exports it) · `shuffle.js` (deterministic per `uid:questionId` MC display shuffle; selection/grading/storage stay in original-index space) · `storageService.js` (base64 uploads — avoids bucket CORS).

**Confirmed business rules** (user-approved, tested — don't change silently):
- **Streak**: session complete = every `questionId` has ≥1 result row (lenient; streak = participation). Grace: the newest session, while incomplete, neither counts nor breaks. Grace ends the moment the teacher opens the next session; late completion never retroactively heals a break. Recomputed from data on every load — nothing stored.
- **Chapter %**: per question use most recent *independent* session-run (all rows in run must be correct); questions with **zero** independent rows ever fall back to their most recent *guided* run; free-form (`correct: null`) excluded from numerator and denominator; "previous %" = same computation excluding the chapter's most recent session (delta = "since last session"); no chapter → bucket `ยังไม่จัดหมวด`.

## 3. Fully working (deployed and user-verified)

- Google auth incl. iOS Safari/incognito; login error UI with retry
- Teacher: question bank (collapsible cards, grade/subject/difficulty/type/chapter filters, chapter autocomplete + normalization, backfill prompt), drawing tool (editable vector shapes, text sizes, per-question images), session start/end with QR modal (offline SVG QR, join code, copy link, live joined counter), Live Results (per-question realtime breakdown incl. FitB per-blank bars, deduped against replays), Rewards admin (catalog + stock, bonus tokens ± with reason, redemption approve/reject in transactions), Rankings tab (balance-sorted, medals, grade assignment, live)
- Student: guided mode (MC with per-student deterministic option shuffle; FitB with inline auto-sized blanks, `|` answer alternatives, unicode-safe matching), independent step mode (tolerance + alternatives matching, `√5`-type false-accepts fixed), free-form answers, hints with LaTeX, retry flow, per-answer time tracking (both metrics), token feedback chips, Rewards shop + history with running balance, motivation panel (streak 🔥 + grace reminder, chapter % bars with warm deltas) on waiting/done screens, QR/`/join` session joining, long-equation horizontal scroll with fade + Thai hint
- Replay protection: deterministic result IDs + create-only rules + localStorage done-guard; verified in production (counts frozen across replay test)
- Test suite (as of 2026-07-15): 49 tests / 7 suites, all green — includes user-specified cases for streak (all 5), guided fallback (all 6), shuffle, matchers, join codes, chapters.
  **Update (2026-07-31): now 195 tests / 14 suites (`npm test`), plus a separate 22-test Firestore rules suite (`npm run test:rules`) added after this document was written.**

## 4. In progress / incomplete (AS OF 2026-07-15 — see banner above)

**Per-session Teacher Dashboard — Phase 1 audit done, implementation NOT started (as of 2026-07-15).** The audit (reported to the user, last conversation) concluded: extend, don't rebuild. Plan:
- New pure module `src/services/sessionStats.js`: `(session, questions, results, joins, nowMs) → { summary, mostMissed, studentRows }`; move `dedupeResults` here from `LiveResults.js` (it currently lives there — line ~10) and have LiveResults import it; reuse `tsMs` from progress.js (export it).
- New `SessionDashboard.js`: Section A (live "X/Y finished" bar using `subscribeSessionJoins` denominator ∪ uids in results; class accuracy; most-missed items ranked by wrong-rate with KaTeX text) + Section B (sortable student table: progress x/y, score %, hints, tokens, avg `timeToFirstCheckMs` or "—"; subtle attention highlight; expandable per-student detail) + existing `<LiveResults/>` below as the question-detail layer. TeacherPage results tab renders it.
- **BLOCKED ON: user confirmation of 3 definitions** (asked, not yet answered): (a) finished = lenient rule, denominator = joins ∪ results-uids; (b) score % = row-level accuracy (not question-level), most-missed threshold ≥3 answers; (c) "stuck" = unfinished student quiet > 3 min (proxy via last row/join time, 30s tick). **Do not implement until the user confirms.**

**✅ UPDATE (2026-07-31): this shipped.** The user confirmed the 3 definitions and Teacher Dashboard Phase 1 was implemented in commits `245705e` (feat: implement Teacher Dashboard Phase 1), `ba5688c` (fix: exclude zero-attempt students from dashboard class averages), `ef55649` (fix: replace unreachable stuck-detection counter with a quiet-time threshold), `6429329` (teacher controls: delete student, adjust token balance, reward price editing), and `efb5610` (SessionDashboard: click-to-expand student row) — all 2026-07-15/16. `BP-Tutor_STATUS.md` lists it as a completed "Prior Milestone." The plan above is preserved as historical record of the design; it is no longer the current state.

Smaller known-incomplete items: chapter backfill is gradual/ongoing by the teacher (old questions show "Uncategorized"); LiveResults' "N students responded" badge counts guided-only rows (noted in audit, fix lands with dashboard).

## 5. Prioritized TODO

1. Get the 3 dashboard definitions confirmed → implement `sessionStats.js` + tests → `SessionDashboard.js` → local test → deploy (the standing pattern: never deploy without explicit user confirmation).
2. Roadmap (user-stated): "Set" system — multiple simultaneously active sessions for review/revision. Groundwork exists (join codes unique among active; `findSessionByCode` prefers active; `subscribeActiveSession` currently picks newest single). Will require rethinking `subscribeActiveSession` and streak "session order".
3. Tech debt, in rough order of value: CRA → Vite migration (CRA is deprecated; also fixes the Windows watcher issue below) · one-time `type`/`questionType` field migration to delete fallback chains · `npm audit` noise (CRA dev-deps, mostly unfixable without the migration) · unify UI language (mixed Thai/English).

## 6. Known bugs, quirks, and traps

- **⚠️ Concurrent editing**: other sessions/agents modify this repo between (and during!) conversations. Files drift constantly. **Always re-read a file (or grep the exact region) immediately before editing** — stale-context edits have failed repeatedly here.
- **⚠️ Windows CRA dev-server watcher misses newly created files.** After adding any new file, kill the server on port 3000, restart, and verify the served bundle actually contains a marker string: `Invoke-WebRequest http://localhost:3000/static/js/bundle.js` → `.Contains('yourNewFunction')`. This caused two real debugging incidents (shuffle "not working", stale panels). Thai strings appear as unicode escapes in the bundle — grep ASCII markers only.
- Old drawings (pre vector-shapes) can't be re-edited as shapes: their PNG background fetch is blocked because bucket CORS (`cors.json`) was **never applied** (needs gsutil/Cloud SDK, not installed). Redrawing once migrates a question to editable `drawingShapes`. New drawings are unaffected.
- Historical data gaps (by design, never backfill): 37 oldest `results` rows lack `tokensEarned`; all rows before the time-tracking deploy lack timing fields (show "—", exclude from averages); oldest 73 rows have auto doc IDs.
- Client-side grading trust model: a DevTools-savvy student could self-award tokens; ledger-vs-balance reconciliation is the detection tool (they currently match exactly).
- `Ko1tLVys…` question doc has type `mc` but historical FitB-style rows — it was edited across type changes; don't treat type-vs-rows mismatches in old data as corruption.
- Git on this machine emits LF→CRLF warnings on every commit — harmless, ignore.
- Commit convention: end messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## 7. Commands

```powershell
# from F:\Claude\BP-Tutor  (PowerShell 5.1 — no && chaining; use ; or if ($?))

npm start                          # dev server on :3000 — run in its OWN window so it survives session end:
Start-Process powershell -ArgumentList '-NoExit','-Command','npm run start'
# secondary instance (used for preview/verification): PORT=3100, BROWSER=none (see .claude/launch.json "dev-alt")

$env:CI = "true"; npm test -- --watchAll=false    # 195 tests must pass (CI=true → warnings are errors); npm run test:rules runs the separate 22-test Firestore rules suite
$env:CI = "true"; npm run build                    # production build to build/

firebase deploy --only hosting                     # app deploy (CLI already logged in as the teacher account)
firebase deploy --only firestore:rules             # rules only (used when a feature needs rules before hosting)
firebase deploy --only hosting,firestore:rules     # both

# post-deploy verification (the project's standing ritual — always do this):
$local = Select-String -Path "build\index.html" -Pattern 'main\.[0-9a-f]+\.js' | % { $_.Matches[0].Value }
$live  = [regex]::Match((Invoke-WebRequest -Uri "https://bp-tutor-3db94.web.app/index.html" -UseBasicParsing).Content, 'main\.[0-9a-f]+\.js').Value
"$local vs $live"                                  # must MATCH
```

**Read-only production data audits** (pattern used throughout this project): Node scripts in the session scratchpad exchange the Firebase CLI's stored refresh token (`~/.config/configstore/firebase-tools.json`, public CLI client ID) for an access token, then hit the Firestore REST API (`runQuery`/`runAggregationQuery`) and the Rules API (to verify *released* rulesets after deploys). Test students in prod data: `kanchanee orattanaprayunkit` (uid `Ejz6UptEk9eA0EKuMnNqxWFaAhn1`, richest history), `Pat S`.

**Working agreements with the user** (they will expect these): report/audit **before** implementing when asked; show interpretations of ambiguous specs and wait for confirmation; tests + clean build before every handoff; never deploy without explicit go-ahead; verify deploys with evidence (bundle hash, released-ruleset contents), not just success logs; report real numbers, never assert unverified correctness.
