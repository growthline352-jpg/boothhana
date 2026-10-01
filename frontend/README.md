# BoothHana2 frontend

BoothHana2의 팬, 크리에이터, 관리자 화면을 제공하는 React·TypeScript SPA입니다. 프로젝트 전체 설정과 백엔드 실행 방법은 [루트 README](../README.md)를 먼저 확인합니다.

## Environment

`frontend/.env.example`을 `frontend/.env`로 복사하고 개발 백엔드 주소를 설정합니다.

```dotenv
VITE_API_BASE_URL=http://localhost:8080
```

## Commands

```powershell
pnpm install
pnpm dev
pnpm lint
pnpm build
pnpm preview
```

- `pnpm dev`: Vite 개발 서버 실행
- `pnpm lint`: Oxlint 정적 검사
- `pnpm build`: TypeScript project build 후 Vite production build
- `pnpm preview`: 생성된 production build 로컬 확인
- `pnpm build:hosting`: production build와 호스팅용 SEO 파일 생성·검사
- `pnpm build:local-preview`: 동일 출처 API 요청을 사용하는 로컬 미리보기 빌드
- `pnpm preview:public`: 공개 API만 중계하는 읽기 전용 로컬 프록시 실행

공개 운영 데이터로 로컬 화면을 확인하려면 `pnpm build:local-preview` 후 별도 터미널에서 `pnpm preview --host 127.0.0.1 --port 4185`와 `pnpm preview:public`을 실행하고 `http://127.0.0.1:4186`을 엽니다. 프록시는 `/api/public/`의 GET·HEAD만 운영 API로 전달하며 로그인·저장·수정 요청은 허용하지 않습니다. 포트와 대상은 `LOCAL_PREVIEW_PORT`, `LOCAL_PREVIEW_SITE_ORIGIN`, `LOCAL_PREVIEW_PUBLIC_API_ORIGIN`으로 설정합니다.

## Application structure

```text
src/app/          라우터, 인증 Context, 원격 데이터 Hook
src/api/          credentials·CSRF·오류 변환을 포함한 fetch client
src/components/   공통 레이아웃과 로딩·빈 결과·오류 상태
src/features/     반복되는 도메인 카드
src/pages/        팬, 크리에이터, 관리자 라우트 화면
src/styles/       색상 토큰과 전체 반응형 CSS
src/types.ts      API 응답과 화면에서 공유하는 TypeScript 타입
```

## Routes

- 공개·팬: `/`, `/login`, `/onboarding`, `/account`, `/events`, `/events/:eventId`, `/booths/:boothId`, `/products/:productId`, `/booths/:boothId/reserve`, `/reservations`, `/reservations/:reservationId`
- 크리에이터: `/creator/events`, `/creator/booths`, `/creator/event-booths/:eventBoothId`, `/creator/event-booths/:eventBoothId/products`, `/creator/reservations`, `/creator/pos`, `/creator/notices`
- 관리자: `/admin/events`, `/admin/events/:eventId`, `/admin/applications`

모든 로그인 사용자는 팬·크리에이터 화면을 함께 사용할 수 있습니다. 관리자 화면은 백엔드가 `/api/me`에 `ADMIN` 권한을 반환하는 지정 카카오 계정만 접근할 수 있습니다.

신규 카카오 회원은 `/onboarding`에서 분야별 관심 항목을 선택하거나 나중에 선택하기를 누른 뒤 원래 내부 경로로 돌아갑니다. 기존 회원은 `/account`에서 선택적으로 설정합니다. 분야별 홈의 캐러셀에서 `내 관심분야`와 `전체 인기`를 전환할 수 있으며 비회원은 분야 전체 목록을 봅니다.

## API behavior

- 요청은 `src/api/client.ts`의 브라우저 `fetch`를 사용합니다.
- 세션 쿠키를 전달하기 위해 `credentials: 'include'`를 사용합니다.
- 상태 변경 요청 전 `/api/auth/csrf`에서 토큰을 받아 `X-XSRF-TOKEN` 헤더에 전달합니다.
- 프런트엔드에는 Supabase 접속 정보나 GCS 자격증명을 넣지 않습니다.
- 업로드 파일은 백엔드가 크기·형식·SHA-256을 검증한 뒤 GCS에 저장합니다.
- 인기 행사는 `/api/public/catalog/events/popular`의 실제 회원 행사 저장 수를 사용합니다. 디페스타 양일은 한 회차로 집계하며 같은 회원의 중복 저장을 제거한 뒤 순위를 정합니다. 서울·경기 공개 행사 중 종료·취소·연기·일정 변경된 행사는 제외하며 분야별로 조회할 수 있습니다.
- 홈 캐러셀은 공개 `/api/public/catalog/events/featured` 또는 개인 `/api/me/interests/featured`에서 분야·지역·관심 조건을 먼저 적용한 상위 5개를 받습니다. 저장 인원이 같으면 가까운 일정순, 행사 ID순이며 저장된 행사가 없으면 같은 조건의 최근 공개 목록(`RECENT`)을 표시합니다. 조건에 맞는 행사 자체가 없으면 빈 결과를 유지합니다.
- 관심 항목은 `/api/public/interests`의 서버 옵션을 사용하고 `GET /api/me/interests`·`PUT /api/me/interests`로 계정에 저장합니다. 분야별 행사 유형과 취향 주제는 독립적으로 선택하며 선택한 항목 중 하나에 해당하면 포함됩니다.

## Styling and state

- 상태 관리는 페이지 로컬 state와 로그인 사용자용 `AuthContext`만 사용합니다.
- 폼은 controlled input과 HTML 기본 제약을 사용합니다.
- 스타일은 외부 UI 프레임워크 없이 `tokens.css`, `global.css`에 작성합니다.
- API 화면은 로딩, 빈 결과, 오류 상태를 공통 컴포넌트로 표시합니다.
- 행사·부스·상품 이미지가 없거나 로드되지 않으면 `ContentImage`가 종류별 기본 SVG를 표시합니다.

현재 확인된 기능 제한은 [루트 README의 Known limitations](../README.md#known-limitations)에 기록합니다.
