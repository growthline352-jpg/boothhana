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
- 운영의 공개 행사 데이터로 로컬 디자인을 확인할 때는 `pnpm run build:local-preview`, `pnpm preview -- --host 127.0.0.1 --port 4181`, `pnpm run preview:public`을 차례로 실행한 뒤 `http://127.0.0.1:4182`를 엽니다. 마지막 프록시는 공개 API 읽기만 허용하고 로그인·관리·쓰기 요청을 차단합니다. 일반 운영 빌드에는 사용하지 않습니다.

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

- 공개·팬: `/`, `/login`, `/events`, `/events/:eventId`, `/booths/:boothId`, `/products/:productId`, `/booths/:boothId/reserve`, `/reservations`, `/reservations/:reservationId`
- 크리에이터: `/creator/events`, `/creator/booths`, `/creator/event-booths/:eventBoothId`, `/creator/event-booths/:eventBoothId/products`, `/creator/reservations`, `/creator/pos`, `/creator/notices`
- 관리자: `/admin/events`, `/admin/events/:eventId`, `/admin/applications`

모든 로그인 사용자는 팬·크리에이터 화면을 함께 사용할 수 있습니다. 관리자 화면은 백엔드가 `/api/me`에 `ADMIN` 권한을 반환하는 지정 카카오 계정만 접근할 수 있습니다.

## API behavior

- 요청은 `src/api/client.ts`의 브라우저 `fetch`를 사용합니다.
- 세션 쿠키를 전달하기 위해 `credentials: 'include'`를 사용합니다.
- 상태 변경 요청 전 `/api/auth/csrf`에서 토큰을 받아 `X-XSRF-TOKEN` 헤더에 전달합니다.
- 프런트엔드에는 Supabase 접속 정보나 GCS 자격증명을 넣지 않습니다.
- 업로드 파일은 백엔드가 크기·형식·SHA-256을 검증한 뒤 GCS에 저장합니다.

## Styling and state

- 상태 관리는 페이지 로컬 state와 로그인 사용자용 `AuthContext`만 사용합니다.
- 폼은 controlled input과 HTML 기본 제약을 사용합니다.
- 스타일은 외부 UI 프레임워크 없이 `tokens.css`, `global.css`에 작성합니다.
- API 화면은 로딩, 빈 결과, 오류 상태를 공통 컴포넌트로 표시합니다.

현재 확인된 기능 제한은 [루트 README의 Known limitations](../README.md#known-limitations)에 기록합니다.

## 통합 나들이·일정 로컬 미리보기

`pnpm dev:outings` 실행 후 `http://127.0.0.1:4193/outings-preview.html`에서 확인합니다.
`pnpm build:outings`는 별도 `dist-outings-preview`에 빌드하며 일반 배포 엔트리에는 포함되지 않습니다.

- 박람회·축제·팝업 통합 탐색, 보관함, 여러 일정, 장소 직접 추가, 순서·시간·메모 수정, 되돌리기, 방문 체크를 제공합니다.
- 첫 선택 부담을 줄이는 예시 코스, 먼저 담고 나중에 시간 정하기, 모바일 하단 메뉴, 자동 저장을 적용했습니다. 사용자 행동에 관한 설계 가설이며 실제 사용자 검증은 별도입니다.
- 내 코스 목록 → 장소 중심 편집 → 코스 미리보기로 구분합니다. 장소 선택창에서 연속으로 담거나 카드 사이에 삽입할 수 있으며, 순서 편집은 드래그와 위·아래 버튼을 함께 제공합니다. 방문 체크는 미리보기에서 사용합니다.
- 새 코스의 시작·종료시간은 비어 있습니다. 운영시간이 확인된 첫 장소는 시작시간을 제안하며, 이동시간이 없는 구간 이후에는 도착시간을 임의 계산하지 않습니다. 기존 시간 지정 일정과 같은 저장 형식을 호환합니다.
- 기본 예시 모드의 행사·사진·위치·시간·비용은 가상 체험 자료입니다. 실제 모드는 기존 공개 API의 박람회·축제를 읽습니다. 운영 API 쓰기는 로컬 프록시에서 차단합니다.
- 이동시간은 직접 입력하며 지도 점선은 순서 표시입니다. 자동 경로 탐색·실시간 영업 검증·팝업 데이터 수집·계정 일정 동기화·공유 링크/공동 편집은 미연결입니다.
- 기기 저장 키는 `boothhana.outings.local.v1`입니다. 기존 보관함을 수정하지 않으며 가져오기는 같은 브라우저·주소·포트의 게스트 기록만 읽습니다. 공유용 파일과 텍스트에서는 개인 메모·방문 체크가 제외됩니다.
- 검증: `pnpm exec vitest run src/features/outings/model.test.ts`.
