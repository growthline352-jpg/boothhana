# BoothHana2 Deployment QA Report

- Date: 2026-08-21
- Frontend: https://booth-hana2.vercel.app
- Backend: https://boothhana2-api.onrender.com
- Environment: Vercel + Render + Supabase PostgreSQL
- Mode: authenticated deployment smoke and R2 mutation QA
- Status: Pass with one infrastructure limitation

## Deployment and configuration

- Render deployed backend commit `75b6f13` successfully after the cross-site CSRF cookie fix.
- Render administrator configuration was migrated from `ADMIN_KAKAO_SUBJECT` to `ADMIN_KAKAO_SUBJECTS` without reading or copying the secret value.
- The designated administrator logged in again after deployment and retained access to the Admin Console.
- The same authenticated account could enter Fan, Creator, and Admin areas, matching the additive permission model.

## Browser verification

- Public home, event list, event detail, booth detail, and product data loaded from the deployed backend.
- Kakao login completed and the public header changed from `카카오 로그인` to `로그아웃`.
- Fan reservation list loaded persisted mock reservations at `/reservations`.
- Creator dashboard, event applications, base/approved booths, event-booth edit form, product inventory, reservations, POS, and notices opened without an application error state.
- Admin event list, participation applications, and event registration form opened successfully.
- Admin event list loaded persisted DRAFT, PUBLISHED, and ENDED rows from Supabase.
- Product edit UI exposed the intended JPG/PNG/WebP representative-image picker.
- A PNG was uploaded from the Creator product edit screen through a backend-issued presigned URL to R2.
- The product was saved, the page was reloaded, and the edit screen retained a non-blob R2 public image URL.
- The persisted image loaded successfully after reload with a natural size of 1254 × 1254 pixels.

## Automated verification

- Frontend `pnpm lint`: pass.
- Frontend `pnpm build` (TypeScript + Vite production build): pass.
- Backend `gradlew test`: pass.

## Findings and limits

### Render cold start during a paused OAuth flow

The first callback attempt returned `/login?error` after the Kakao authorization page had remained open long enough for the Render free instance to sleep. Render then needed to wake the backend before handling the callback. An immediate retry after the backend was warm completed successfully.

This is recorded as a free-tier infrastructure limitation rather than an application crash. Normal prompt login was successful, but a user who pauses for a long time on the Kakao page may need to retry.

### R2 upload incident and resolution

The initial production upload failed in two stages:

1. The cross-site CSRF cookie used its default `SameSite=Lax` behavior, so the deployed frontend's authenticated presign request was rejected. Commit `75b6f13` makes the CSRF cookie follow the deployed session cookie's `Secure` and `SameSite=None` policy.
2. Render's stored R2 secret did not match the newly rolled Cloudflare token. The development token was rolled again, the old pair was invalidated, and both local `backend/.env` and Render were updated without recording the values in source or documentation.

After redeployment, the presign request, direct R2 PUT, product save, reload, and public image fetch all succeeded.

## Result

The deployed authentication, additive Fan/Creator permissions, plural administrator configuration, persisted reads, major management routes, and R2 upload persistence are working. The cross-site CSRF defect was fixed and verified in production. The Render free-tier OAuth cold-start limitation remains documented.
