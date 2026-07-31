# BP-Tutor — Status & Workflow

_Last updated: 2026-07-25_

## What it is
Math/science tutoring web app for M.1–M.3 students (~60 students). Built with React + Firebase.

- **Live:** bp-tutor-3db94.web.app
- **Repo:** Bigladbrokes/bp-tutor

## Current Feature: Stepped Solver
A step-validated physics/math problem-solving flow. Built incrementally, Steps 1–6:

1. Pure-function parameter generator
2. `steppedReducer` state machine
3. `equationSelect` step — Thai per-distractor feedback
4. `givens` step — `useChipDrag` hook for iPad touch input
5. `rearrange` step — CSS-composed scaffold
6. Pure analytics functions + Firebase rules-test harness + `saveSteppedResult` (atomic token award)

### Status of `saveSteppedResult`
✅ Implemented and tested
❌ Not yet wired to a production caller

## Next Steps (in order)
1. Wire `saveSteppedResult` into live session flow
   - **PREREQUISITE** — the stepped-result `firestore.rules` branch (committed `8dc5cf1`) is NOT yet deployed to production. Run `firebase deploy --only firestore:rules` as part of this step, before enabling the production route, or students will hit permission-denied on save.
2. Session integration (connect stepped flow to overall session state)
3. Authoring surface (so new problem templates can be added without code changes)

## Key Product Decisions Already Made
- Restart policy is teacher-configurable
- Token award is flat per difficulty level (not scaled by step count/time)
- v1 ships with one kinematics template only

## Prior Milestone (context)
Teacher Dashboard Phase 1 — reviewed and verified. Caught and fixed a class-average denominator bug (students who joined via QR but hadn't answered yet were being excluded from the denominator incorrectly).

## Workflow Notes Specific to BP-Tutor
- Claude Code has stopped and flagged missing artifacts referenced in specs 3 separate times — correct behavior, keep this practice.
- Review protocol: Claude Code audits → reports → Bigladbrokes reviews → implement → Bigladbrokes reviews diff → commit.
