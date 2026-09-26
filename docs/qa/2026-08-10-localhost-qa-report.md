# BoothHana2 QA Report

- Date: 2026-08-10 to 2026-08-12
- Target: http://localhost:5173
- Tier: Standard
- Mode: diff-aware
- Framework: React SPA + Spring Boot
- Status: Complete

## Baseline

- Authentication: Kakao login succeeded after backend restart
- Console: no errors or warnings observed so far
- Scope: event reservation window, approved creator booths, admin event time input, adjacent creator/fan flows

## Issues

### ISSUE-001 - Applied events still show an enabled participation button

- Severity: Medium
- Category: Functional / UX
- Route: `/creator/events`
- Reproduction:
  1. Sign in and open Creator Console > 행사.
  2. Find `[MOCK] 부스하나 페어 2026`, which already has an application.
  3. Observe that `참가 신청` is enabled.
  4. Click it and observe `이미 참가 신청한 행사입니다.` while the button remains enabled.
- Expected: Already-applied events show their application status and cannot be submitted again, including after reload.
- Actual: The list does not include the user's application state; only the duplicate POST reveals it.
- Reproduced: Yes (existing user report and current browser QA)
- Fix Status: Verified
- Commit: `906aede`
- Verification: `[MOCK] 가을 굿즈 마켓` now shows `승인 대기 / 신청 완료`, and `[MOCK] 부스하나 페어 2026` shows `승인 완료`; both buttons remain disabled after reload.

### ISSUE-002 - Event booth selectors cannot distinguish the event

- Severity: Medium
- Category: UX / Functional
- Routes: `/creator/pos`, `/creator/notices`
- Reproduction:
  1. Open Creator Console > POS or 공지.
  2. Open the event-booth selector.
  3. Observe two options with the identical label `[MOCK] 달빛상점` (values `1` and `3`).
- Expected: Each option identifies both the reusable booth and its event.
- Actual: Booths connected to different events are visually indistinguishable.
- Reproduced: Yes (POS and notice routes)
- Fix Status: Verified
- Commit: `07b86b7`
- Verification: POS and notice selectors now show `부스명 · 행사명`; both routes were reloaded and had no console errors.

## Verification Summary

- Routes checked: 14
- Browser console errors/warnings: 0
- Fan flow: event list/detail, empty booth result, booth detail, reservation validation, reservation create/detail/cancel verified
- Creator flow: event applications, base/approved booths, product access, pending booth access rejection, reservation list, POS, notices verified
- Responsive: 375 × 812 checked on event list, creator event list, and notices; no horizontal overflow
- Static checks: frontend lint and TypeScript production build passed
- Backend checks: full Gradle test suite passed, including the new ISSUE-001 regression test
- Admin: non-admin rejection and designated-admin access both verified; event create form, date/time input, DRAFT save, list reflection, and reload persistence passed

## Final Admin QA - 2026-08-12

- Account: designated Kakao account configured through `ADMIN_KAKAO_SUBJECTS`
- Route: `/admin/events` and `/admin/events/new`
- Access: `ADMIN` console access verified after backend restart and Kakao re-login
- Input: event name, event period, reservation period, venue, description, and DRAFT status
- Save result: `[QA] 관리자 행사 등록 검증 2026-08-12` created successfully
- Persistence: saved event remained visible after a full browser reload
- Browser console errors/warnings: 0
- Result: Pass

## Health Score

- Baseline: 97/100
- Final: 100/100 for the exercised routes
- Issues found: 2 medium
- Fixes: 2 verified, 0 best-effort, 0 reverted, 0 deferred

## Top Things Fixed

1. Creator event applications now remain visibly applied after reload and cannot be submitted twice.
2. POS and notice event-booth selectors now identify the connected event.

## PR Summary

QA found 2 issues, fixed and browser-verified both, with scoped health improving from 97 to 100.

## Supplemental Verification - 2026-08-12

- Scope: event-booth information update/delete and POS sale detail
- Frontend: Oxlint and TypeScript production build passed
- Backend: 23 Gradle tests passed, including update, safe delete, reservation/POS delete-blocking, owned/unauthorized POS detail, and POS item/total mapping
- Browser: Kakao re-login succeeded after restarting the latest backend; authenticated visual interaction was re-run
- Event booth: existing values loaded, unchanged save succeeded, and the same values remained after a full reload
- Ended event booth: read-only notice displayed and inputs, delete, and save actions were disabled
- POS detail: canceled and sold records both loaded through the single-sale endpoint with sale time, payment method, item, quantity, unit price, line amount, and total
- Responsive: the event-booth form was checked at desktop width and the POS detail at mobile width; the wide POS table remained inside its horizontal scroll container
- Safety: destructive delete was verified at the service-test level only; no local user data was deleted
- Errors: no application error state or backend 5xx response occurred in the exercised flow
- Public deployment follow-up: completed for authentication, authorization, and major read/form routes on 2026-08-21; see `docs/qa/2026-08-21-deployment-qa-report.md`.
