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

분야별 홈의 **캘린더로 보기**, 또는 전체보기의 **목록 / 캘린더**에서 월별 일정으로 전환합니다. `/discover?view=calendar&month=2026-10`처럼 월을 지정할 수 있으며 메인 도메인의 기존 분류 경로에서는 `category=subculture|exhibitions|festivals`를 함께 사용합니다. 이전 달·다음 달·오늘 이동과 검색어·지역·행사 유형 필터를 지원합니다. 날짜를 누르면 실제 운영 일정에 해당하는 행사와 시간·장소를 보여주며 중간에 쉬는 날은 표시하지 않습니다.

개선 의견은 데스크톱의 **이런 개선이 필요해요**, 서비스 메뉴의 **개선 의견 보내기**, 푸터에서 제목·내용만 작성합니다. 모바일에서는 서비스 메뉴와 푸터를 사용합니다. 비회원은 접수번호만 받고 개별 답변·추가 내용·조회는 지원하지 않습니다. 회원 의견은 `INQUIRY / FEATURE_REQUEST`로 접수되며 `/support`의 내 문의와 `/support/tickets/:id`에서 답변·상태를 확인합니다. 전송 결과가 불확실하면 같은 작성 시도의 내용과 요청 ID로 재시도하며, 창 닫기·로그인 상태 재확인에는 작성 내용을 유지하지만 페이지 새로고침 복구는 지원하지 않습니다.

## API behavior

- 요청은 `src/api/client.ts`의 브라우저 `fetch`를 사용합니다.
- 세션 쿠키를 전달하기 위해 `credentials: 'include'`를 사용합니다.
- 상태 변경 요청 전 `/api/auth/csrf`에서 토큰을 받아 `X-XSRF-TOKEN` 헤더에 전달합니다.
- 프런트엔드에는 Supabase 접속 정보나 GCS 자격증명을 넣지 않습니다.
- 업로드 파일은 백엔드가 크기·형식·SHA-256을 검증한 뒤 GCS에 저장합니다.
- 인기 행사는 `/api/public/catalog/events/popular`의 실제 회원 행사 저장 수를 사용합니다. 디페스타 양일은 한 회차로 집계하며 같은 회원의 중복 저장을 제거한 뒤 순위를 정합니다. 서울·경기 공개 행사 중 종료·취소·연기·일정 변경된 행사는 제외하며 분야별로 조회할 수 있습니다.
- 홈 캐러셀은 공개 `/api/public/catalog/events/featured` 또는 개인 `/api/me/interests/featured`에서 분야·지역·관심 조건을 먼저 적용한 상위 5개를 받습니다. 저장 인원이 같으면 가까운 일정순, 행사 ID순이며 저장된 행사가 없으면 같은 조건의 최근 공개 목록(`RECENT`)을 표시합니다. 조건에 맞는 행사 자체가 없으면 빈 결과를 유지합니다.
- 관심 항목은 `/api/public/interests`의 서버 옵션을 사용하고 `GET /api/me/interests`·`PUT /api/me/interests`로 계정에 저장합니다. 분야별 행사 유형과 취향 주제는 독립적으로 선택하며 선택한 항목 중 하나에 해당하면 포함됩니다.
- 캘린더는 `/api/public/catalog/events`에 선택한 월 전체의 `from`·`to`를 전달하고 100개씩 모든 페이지를 읽은 뒤 같은 디페스타 회차를 합칩니다. 일부 페이지 조회가 실패하면 오류와 재시도를 표시합니다.
- 비회원 의견은 `/api/public/support/options`의 `feedbackEnabled`를 확인하고 `POST /api/public/support/feedback`으로 전달합니다. 회원은 기존 `POST /api/me/support/tickets`를 사용합니다. 자세한 접수 범위는 [고객지원 안내](../docs/support/SUPPORT_AND_ROLES_V12_KO.md#5-고객문의답변비회원)를 확인합니다.

## Styling and state

- 상태 관리는 페이지 로컬 state와 로그인 사용자용 `AuthContext`만 사용합니다.
- 폼은 controlled input과 HTML 기본 제약을 사용합니다.
- 스타일은 외부 UI 프레임워크 없이 `tokens.css`, `global.css`에 작성합니다.
- API 화면은 로딩, 빈 결과, 오류 상태를 공통 컴포넌트로 표시합니다.
- 메인 분야 선택 카드는 `public/assets/categories/{subculture,exhibitions,festivals}-3d.webp`의 투명 배경 3D 이미지를 사용합니다.
- 행사 이미지가 없거나 로드되지 않으면 `ContentImage`가 행사 유형에 맞는 `public/assets/fallback/event-{subculture,exhibitions,festivals}.svg`를 표시합니다. 회색 배경·아이콘만 사용하며 이미지 안의 안내 문구는 표시하지 않습니다. 행사 분야를 알 수 없거나 부스·상품인 경우에는 기존 종류별 SVG를 사용하고 접근성용 대체 텍스트는 유지합니다.

고객지원의 답변·알림·비회원 기능 제한은 [고객지원 안내](../docs/support/SUPPORT_AND_ROLES_V12_KO.md)를 확인합니다.
