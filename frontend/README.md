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

서브컬처의 행사 유형 필터와 관심 설정에서 애니·게임·버추얼 공연, 애니·게임 행사, 아트북·독립출판, 보드게임, 캐릭터·아트, 일러스트 행사를 선택할 수 있습니다. 해당 유형의 공개 상세·canonical 주소는 서브컬처 분야로 연결됩니다. 유형 코드와 분야별 주소는 [분야별 사이트 안내](../docs/CATEGORY_SITES_KO.md), API·DB 적용 순서는 [관심분야 검증 및 배포 계획](../docs/CATEGORY_INTERESTS_TEST_PLAN.md)을 확인합니다.

분야별 홈의 **캘린더로 보기**, 또는 전체보기의 **목록 / 캘린더**에서 월별 일정으로 전환합니다. `/discover?view=calendar&month=2026-10`처럼 월을 지정할 수 있으며 메인 도메인의 기존 분류 경로에서는 `category=subculture|exhibitions|festivals`를 함께 사용합니다. 이전 달·다음 달·오늘 이동과 검색어·지역·행사 유형 필터를 지원합니다.

여러 날 열리는 행사는 실제 연속 운영 기간을 하나의 막대로 표시하고, 주 경계에서는 나누어 이어짐 표시를 붙입니다. 일정 사이에 쉬는 날이 있으면 그 날짜는 비워 둡니다. 같은 날짜의 행사는 별도 줄에 쌓이며, 달력에는 최대 3줄을 표시합니다. 넘치는 날짜의 **+N개**를 누르면 보이는 행사와 숨겨진 행사를 모두 포함한 그날의 목록을 엽니다.

날짜를 누르면 오른쪽 상세 패널에서 그날의 전체 행사 목록을 보고, 목록의 행사나 달력의 행사 막대를 누르면 같은 패널에서 일정·선택일 시간·장소·상태·주제를 확인합니다. **이날 행사 N개 보기**로 날짜 목록에 돌아가거나 **행사 상세보기**로 전체 상세 화면에 이동합니다. 화면 너비가 1100px를 초과하면 달력과 패널을 나란히 보며 달력을 계속 조작할 수 있습니다. 1100px 이하에서는 오른쪽에서 열리는 모달 드로어로 표시합니다. 닫기 버튼이나 Escape로 패널을 닫습니다.

선택은 URL의 `day=YYYY-MM-DD`와 `calendarEvent=행사ID`에 저장됩니다. 예를 들어 `/discover?view=calendar&month=2026-10&day=2026-10-02`는 날짜 목록을 열고, 유효한 `calendarEvent`를 함께 지정하면 그날의 행사 상세를 엽니다. 브라우저 뒤로가기와 새로고침 시 URL의 선택을 복원합니다. 패널을 닫거나 월·보기 방식을 바꾸면 선택 매개변수를 지웁니다.

막대·분류 배지·범례의 색은 행사에 저장된 명시적 하위 분류(`subcategory`)를 따릅니다. 여러 주제(`subjects`)는 상세 패널에 독립된 태그로 표시하며 색상을 결정하지 않습니다. 취소·연기·일정 변경된 행사는 회색 막대와 상태 문구로 표시합니다.

개선 의견은 데스크톱의 **이런 개선이 필요해요**, 서비스 메뉴의 **개선 의견 보내기**, 푸터에서 제목·내용만 작성합니다. 모바일에서는 서비스 메뉴와 푸터를 사용합니다. 비회원은 접수번호만 받고 개별 답변·추가 내용·조회는 지원하지 않습니다. 회원 의견은 `INQUIRY / FEATURE_REQUEST`로 접수되며 `/support`의 내 문의와 `/support/tickets/:id`에서 답변·상태를 확인합니다. 전송 결과가 불확실하면 같은 작성 시도의 내용과 요청 ID로 재시도하며, 창 닫기·로그인 상태 재확인에는 작성 내용을 유지하지만 페이지 새로고침 복구는 지원하지 않습니다.

## API behavior

- 요청은 `src/api/client.ts`의 브라우저 `fetch`를 사용합니다.
- 세션 쿠키를 전달하기 위해 `credentials: 'include'`를 사용합니다.
- 상태 변경 요청 전 `/api/auth/csrf`에서 토큰을 받아 `X-XSRF-TOKEN` 헤더에 전달합니다.
- 프런트엔드에는 Supabase 접속 정보나 GCS 자격증명을 넣지 않습니다.
- 업로드 파일은 백엔드가 크기·형식·SHA-256을 검증한 뒤 GCS에 저장합니다.
- **인기있는 행사**는 비회원 또는 현재 분야의 관심 설정이 없는 회원에게 `/api/public/catalog/events/popular`를 분야 제한 없이 조회해 서브컬처·박람회·축제 전체의 저장 인원순 상위 6개를 보여줍니다. 디페스타 양일은 한 회차로 집계하며 같은 회원의 중복 저장을 제거합니다. 서울·경기 공개 행사 중 종료·취소·연기·일정 변경된 행사는 제외합니다.
- 관심분야를 설정한 회원은 개인 `/api/me/interests/featured`를 사용합니다. 분야별 홈에서는 현재 분야만, 메인 포털에서는 선택한 분야의 결과를 합쳐 저장 인원·가까운 일정·행사 ID순 상위 5개를 표시합니다. 분야만 선택하고 세부 항목을 비워 두어도 그 분야의 관심 설정으로 취급합니다.
- 전체 저장 순위가 빈 결과일 때만 세 분야의 공개 목록을 모든 페이지까지 읽고 가까운 실제 운영 일정순 상위 6개를 저장 수 0명으로 표시합니다. 취소·연기·일정 변경·종료된 개별 운영일을 제외한 뒤 디페스타 양일을 합치며, 남은 운영일이 하나면 원래 행사 ID를 유지합니다. 순위나 목록 조회가 실패하면 오류와 재시도를 표시하고 0명 목록으로 대체하지 않습니다.
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
