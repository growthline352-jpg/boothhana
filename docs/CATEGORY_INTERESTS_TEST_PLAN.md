# Category interests and saved popularity — test plan

## Acceptance
- Each of SUBCULTURE, EXHIBITION and FESTIVAL has independent formats and topics, defined by the backend registry exposed through the public options endpoint.
- New Kakao members are PENDING and see onboarding before public or creator screens. Existing members are LEGACY and use optional account settings.
- Save or skip persists server side; completed accounts return to the interrupted safe internal route. Authentication retry recovers a completed onboarding.
- Account selection persists after navigation, across devices and category origins using the member account.
- Public and personalized featured endpoints rank distinct member EVENT saves, group the two reviewed D.Festa days, filter before limit and show at most five. Equal counts use closest upcoming date then event ID.
- Expired, excluded, canceled, postponed and rescheduled events are excluded. For the home carousel, with no saved matches the label is 새로 공개된 행사 and the latest matching publications are shown. Empty interest matches remain empty.
- The 인기있는 행사 section shows at most six global save-ranked events for guests or members with no selected current field, including on category homes. A selected field with empty child options still scopes the result to that field. The portal combines selected fields' private featured results and shows the top five by saves, next actual date and event ID.
- Only a successful empty global ranking enables the zero-save fallback: read every public page across all three categories, exclude ended, canceled, postponed, rescheduled and invalid operating days before combining D.Festa editions, and show six closest actual schedules with honest 0 counts. A surviving single D.Festa day keeps its real ID. Request failures remain errors; no eligible events remains an empty result.

## Automated checks
- LibraryIntegrationTests: session, CSRF, current-user pin, revision conflict, field isolation, anon/authenticated database privileges, new-user onboarding flag and detached profile updates.
- Featured SQL regression: unrelated popular rows do not suppress matching rows, guest/product saves do not count, repeat member saves count once, unsave switches to recent fallback, region and cancellation filters apply.
- Existing popularity SQL tests cover publication withdrawal and D.Festa member deduplication before limit.
- InterestTaxonomyTests reject foreign category codes, duplicates and null codes; all subject inputs use bound SQL values.
- Frontend tests verify category selection isolation and safe onboarding return destinations. `popular.test.ts` covers guest/skipped/unset-field global scope, category-only selections, portal personalization and tie ordering, account mismatch, zero-save fallback, canceled/ended edition-day filtering, limits and failed or partial requests.
- Required release-verification full-schema-and-app applies actual migrations 001..020 and requires fresh, non-skipped interest integration results.

## Browser acceptance
Use the fixture API at localhost only for member onboarding/account UI. Check field separation, save, interrupted-route return, edit, re-save, personal/whole popularity controls, the global/selected-field/zero-save popularity states and 390px layout. Production checks use public reads and guest screens; do not create or change a real member as a test.

## Release
Back up production public schema with PostgreSQL17 and verify the archive list. Apply additive SQL020 using the existing backend role, deploy only the BoothHana API, verify readiness/private access/CORS, then land the CI-verified frontend on all four existing domains. Keep prior API image and exact runtime environment for rollback. The added schema is backward compatible with the previous API.
