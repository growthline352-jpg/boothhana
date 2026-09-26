# Booth Platform Lean CRUD Plan

## Status

- Plan status: Approved
- Created: 2026-08-07
- Updated: 2026-08-21
- Implementation skill: `$build-lean-crud`
- Source precedence: `안건정리_20260801_1653 .txt`의 최신 합의가 엑셀 초안 및 프로토타입과 충돌하면 우선한다.
- Approval: 기능 범위, 기술 구성, 로그인·권한 모델 개정안과 기존 `role` 컬럼 제거는 2026-08-09 사용자 승인 완료 상태다.

## Validation goal

관리자가 행사를 공개하고, 크리에이터가 승인된 부스와 상품을 등록하며, 팬이 상품을 예약한 뒤 크리에이터가 현장 수령 또는 POS 판매를 기록하고, 그 결과와 통합 재고가 재접속 후에도 유지되는 하나의 정상 흐름을 실제 화면에서 확인한다.

## Implementation status

- React 화면, Spring Boot API, PostgreSQL 마이그레이션, 카카오 로그인, R2 서명 업로드와 개발용 mock seed가 구현되어 있으며 2026-08-12 PR #1을 통해 `main`에 병합되었다.
- TypeScript build, Oxlint, 백엔드 전체 테스트와 로컬 브라우저의 팬·크리에이터·관리자 주요 화면 및 인증 흐름을 검증했다.
- 지정 관리자 계정으로 행사 생성, `DRAFT` 저장, 목록 반영과 새로고침 후 데이터 유지까지 최종 QA를 완료했다.
- Vercel·Render 공개 환경에서 공개 조회, 카카오 로그인, 팬 예약 목록, Creator 주요 화면과 지정 관리자 화면 접근을 검증했다. R2 실제 파일 업로드와 공개 데이터 변경 검증은 별도 승인 전까지 남겨 두었다.
- Creator 행사 목록은 참가 신청 상태를 표시하고 신청 완료·승인 완료 상태에서는 버튼을 비활성화한다. 기본 부스가 여러 개이면 목록의 첫 번째 부스를 자동 선택하는 한계는 남아 있다.
- 행사별 부스의 부스 번호·소개·공개 여부 수정과 안전한 삭제, POS 판매 단건 상세 조회 API·화면을 구현했다. 종료 행사는 읽기 전용이며 예약 또는 판매가 연결된 행사별 부스 삭제는 차단한다.

## Repository baseline

- 2026-08-09 현재 React/Vite 프런트엔드, Java/Spring Boot 백엔드, 순서 있는 PostgreSQL 스키마·마이그레이션과 인증 테스트가 구현되어 있다.
- 프런트엔드는 TypeScript 함수형 컴포넌트·Hooks·`AuthContext`·브라우저 `fetch`·controlled input·일반 CSS·React Router·공통 오류 상태를 사용한다.
- 백엔드는 Spring Security OAuth2 Client로 카카오 로그인을 처리한다. 로그인 전 역할 선택은 없으며 모든 로그인 사용자에게 팬·크리에이터 권한을 파생하고 지정 카카오 계정에 관리자 권한을 추가한다.
- `database/002_remove_user_role.sql`로 기존 `app_user.role` 컬럼을 제거했으며 `/api/me`는 기능 권한 목록을 반환한다.
- 역기획 근거는 `docs/analysis/2026-08-09-prototype-reverse-analysis.md`를 사용한다. 프로토타입 화면 전체를 소스 코드로 복사하거나 전체 라우트로 재현하지 않는다.

## Users and ownership

- 팬: 공개된 행사·부스·상품을 조회하고 자신의 예약을 생성·조회·취소한다.
- 크리에이터(부스 운영자): 자신이 소유한 부스, 행사별 부스 정보, 상품, 부스 공지, 예약 수령, POS 판매 기록을 관리한다.
- 관리자: 행사 CRUD와 공개·종료 상태, 부스 참가 신청의 승인·반려만 관리한다.
- 공개 조회는 공개 중인 행사, 승인·공개된 행사 부스, 공개 상품에 한정한다.
- 팬과 크리에이터는 서로 배타적인 사용자 상태가 아니라 한 사용자가 함께 가질 수 있는 기능 권한이다.
- 모든 카카오 로그인 사용자는 팬 화면과 크리에이터 화면을 사용할 수 있고, 화면의 전환 버튼으로 두 영역을 자유롭게 이동한다.
- 지정된 카카오 계정 ID에는 팬·크리에이터 권한에 더해 관리자 권한을 추가한다.
- 권한을 사용자가 부여·회수하는 관리 기능과 세분화된 권한 체계는 만들지 않는다.

## Core user flow

1. 사용자는 팬·크리에이터 선택 화면 없이 카카오 로그인으로 바로 진입한다. 로그인 후 팬 화면과 크리에이터 화면 전환 버튼을 사용할 수 있다.
2. 관리자가 행사를 등록하고 공개한다.
3. 크리에이터가 기본 부스를 만들고 행사 참가를 신청하며, 관리자가 승인 또는 반려한다.
4. 승인된 크리에이터가 행사별 부스 정보, 상품, 통합 재고, 예약 가능 여부, `SOLD OUT`, 부스 공지를 관리한다.
5. 팬이 공개 행사에서 부스와 상품을 탐색하고 상품 수량을 예약한 뒤 예약번호와 QR을 확인한다.
6. 팬은 자신의 예약을 조회·취소하고, 크리에이터는 예약번호로 예약을 찾아 수령 완료 처리한다.
7. 크리에이터가 현장 POS 판매를 기록하거나 잘못된 판매를 취소하고 통합 재고를 확인한다.
8. 행사가 종료되면 기존 공개 주소에서 부스·상품 정보를 읽기 전용으로 유지하고 신규 예약과 신규 POS 판매를 막는다. 기존 예약 취소는 허용한다.

## Included scope

- React 프런트엔드, Java 백엔드 API, Supabase PostgreSQL을 분리한 웹 애플리케이션과 실제 저장·재조회
- 사전 역할 선택 없는 카카오 OAuth 로그인, 로그인 후 팬·크리에이터 화면 전환, 지정 계정의 관리자 권한 추가와 최소 소유권 구분
- 관리자 행사 생성, 목록·상세 조회, 수정, 삭제, 공개, 종료
- 크리에이터 기본 부스 CRUD와 행사 참가 신청
- 관리자의 참가 신청 목록 조회, 승인, 반려
- 승인된 행사별 부스 정보 CRUD와 종료 후 공개 페이지 읽기 전용 전환
- 기본 상품 CRUD, 이전 행사 상품 정보 복사, 행사별 가격·공개·예약 가능 설정
- 상품별 단일 통합 재고, 유한·무한 재고, 판매자 수동 `SOLD OUT`
- 부스 및 상품 이미지의 Cloudflare R2 직접 업로드와 서버가 발급한 제한된 업로드 권한·경로 사용
- 팬용 행사 목록·상세, 부스 목록·상세, 상품 목록·상세
- 한 부스 안에서 상품과 수량을 선택하는 직접 예약, 예약번호와 QR 표시
- 팬의 내 예약 목록·상세·취소
- 크리에이터의 예약 목록·상세, 예약번호 검색, 수령 완료 처리
- 크리에이터의 간단 POS 판매 생성·목록·상세·취소와 결제수단 메모
- 부스 공지 CRUD와 부스당 최대 한 개의 상단 고정 공지
- GitHub `prototype`의 팬·크리에이터·관리자 화면 톤과 주요 이동 경로를 참고하되, 이 문서에 포함된 화면만 구현

## Explicit exclusions

- 온라인 결제, PG 연동, 결제 상태, 환불, 후원, 정산, 분리정산
- 매출 통계, 채널·결제수단별 집계, 분석, 보고서
- 실시간 중복 요청 방지, 재고 잠금, 복잡한 트랜잭션·동시성 처리, 자동 사후 정합성 보정
- 이메일 인증, 추가 약관 화면, 탈퇴 후 재가입 정책, 정지·차단 계정 관리
- 판매자 확인, 준비 완료, 기한 만료, 미수령 등 복잡한 예약 상태
- 사용자별 팬·크리에이터 권한 부여·회수 UI, 세분화된 권한, 주최자 계정, 관리자 사용자 관리, 감사 로그, 복구 기능
- 알림, 예약 일정 알림, 관심 상품·크리에이터, 추천, 통합 검색, 고급 필터
- 신고 접수·처리, 고객 문의 접수 시스템, 관리자용 공지 관리
- 업체 연결, 굿즈 견적 요청, 리드 관리
- 행사장 지도, 동선, 카테고리 기반 탐색
- 엑셀·PDF 가져오기/내보내기, 상품 일괄 관리, POS 배치 설정, 오프라인 모드
- 카메라 기반 QR 스캔. MVP는 QR 표시와 예약번호 검색으로 확인한다.
- 그로스라인 이메일을 표시하는 정적 장애 안내 화면. 이메일을 전달받은 뒤 같은 계획을 수정해 포함한다.
- 부스·상품 이미지 저장에 Supabase Storage 사용. DB는 Supabase PostgreSQL을 사용하되 이미지 파일은 Cloudflare R2에 저장한다.
- 캐시, 백그라운드 작업, 이벤트 시스템, 성능 최적화, 미래용 추상화
- 프로토타입에만 존재하고 이 계획의 포함 범위에 없는 화면과 기능

## Implementation conventions

### Folder structure

승인된 다음 최소 모노레포 구조를 사용한다. 구현 과정에서 범위 밖 계층이나 공용 패키지를 추가하지 않는다.

```text
BoothHana/
├─ frontend/
│  ├─ src/
│  │  ├─ app/                 # App 진입, 라우트 표, 인증 컨텍스트
│  │  ├─ pages/               # public, auth, creator, admin 화면
│  │  ├─ components/
│  │  │  ├─ layout/           # 헤더, 팬·크리에이터 화면 전환, 페이지 골격
│  │  │  └─ ui/               # 버튼, 필드, 상태 칩, 표, 로딩/빈/오류 상태
│  │  ├─ features/            # event, booth, product, reservation, pos, notice
│  │  ├─ api/                 # fetch 기반 TypeScript client와 기능별 요청 함수
│  │  └─ styles/              # tokens.css, global.css, 화면별 CSS
│  └─ public/
├─ backend/
│  └─ src/
│     ├─ main/java/.../       # auth, event, booth, product, reservation, pos, notice, upload
│     ├─ main/resources/      # application 설정
│     └─ test/java/.../       # 승인 범위 정상 흐름의 최소 백엔드 테스트
├─ database/                  # Supabase PostgreSQL에 적용할 순서 있는 SQL
└─ docs/
```

- 기능 폴더에는 그 기능에서만 쓰는 화면 조각과 API 함수를 둔다.
- 두 개 이상의 기능에서 실제로 반복되는 UI만 `components/ui`로 올린다.
- 백엔드는 도메인별 controller/service/repository/entity/DTO를 같은 도메인 패키지에 둔다. 별도 멀티모듈이나 범용 계층은 만들지 않는다.

### Component style

- TypeScript 함수형 React 컴포넌트와 Hooks를 사용한다.
- `pages`는 라우트 데이터 로딩과 화면 조합을 담당하고, 입력·표시 조각은 기능 또는 공통 컴포넌트로 분리한다.
- 프로토타입에서 반복 확인된 `PublicHeader`, `RoleHeader`, `SideNav`, `PageHeader`, `Button`, `StatusChip`, `FormField`, `DataTable`, `LoadingState`, `EmptyState`, `ErrorState`만 초기 공통 후보로 둔다.
- `EventCard`, `BoothCard`, `ProductCard`, `ReservationTicket`, `StockDisplay`는 해당 도메인의 반복이 확인될 때 기능 컴포넌트로 만든다.
- 한 번만 쓰는 작은 화면 조각은 공통화하지 않는다.

### State management

- 새 전역 상태 라이브러리를 추가하지 않는다.
- 입력값, 로딩, 오류, 선택 상태는 각 페이지 또는 기능 컴포넌트의 `useState`와 필요 시 `useReducer`로 관리한다.
- 로그인 사용자와 기능 권한 목록만 `AuthContext`로 공유한다.
- 서버에서 다시 가져올 수 있는 행사·부스·상품·예약 목록은 전역 캐시에 복제하지 않고 화면 진입 시 API로 조회한다.
- 목록 변경 후에는 낙관적 업데이트 체계를 만들지 않고 저장 성공 후 해당 목록을 다시 조회한다.

### API calls

- 새 HTTP 클라이언트 라이브러리를 추가하지 않고 브라우저 `fetch`를 사용한다.
- `frontend/src/api/client.ts`에서 API 기본 URL, JSON 변환, 쿠키 포함, 공통 오류 변환만 처리한다.
- 기능별 파일은 `eventsApi`, `boothsApi`, `productsApi`, `reservationsApi`, `posApi`, `noticesApi`, `uploadsApi` 정도로 나누고 화면에서 URL 문자열을 직접 반복하지 않는다.
- Java API는 `/api/public`, `/api/me`, `/api/creator`, `/api/admin` 경로로 공개·소유자·관리자 범위를 구분한다.
- 오류 응답은 최소한 `status`, `code`, `message`, 선택적 `fieldErrors` 형식으로 통일한다.
- R2 업로드는 백엔드에서 제한된 업로드 URL과 객체 키를 받은 뒤 브라우저가 R2로 직접 전송하고, 성공한 객체 키만 업무 데이터 저장 API에 전달한다.

### Forms and validation

- 새 폼 또는 스키마 검증 라이브러리를 추가하지 않는다.
- React controlled input, HTML의 `required`, `type`, `min`, `max`와 기능별 작은 검증 함수를 사용한다.
- 프런트엔드는 필수값, 음수 가격·수량, 행사 시작/종료 역전, 유한 재고 수량 누락, 이미지 업로드 미완료처럼 정상 흐름을 막는 값만 검증한다.
- 백엔드는 같은 핵심 규칙을 다시 검증하며 프런트 검증을 신뢰하지 않는다.
- 제출 중 중복 클릭은 버튼 비활성화로만 줄이고 분산 잠금이나 멱등성 체계는 추가하지 않는다.

### Styling

- 새 CSS 프레임워크, CSS-in-JS, 디자인 시스템 라이브러리를 추가하지 않는다.
- 프로토타입의 흰색·아이보리 바탕, 갈색 본문, 코럴·청록·금색 상태색, 세리프 제목과 카드·패널 톤을 `tokens.css`와 일반 CSS로 옮긴다.
- 컴포넌트 클래스는 화면별 CSS에서 직접 사용하며 빌드 시 기본 Vite CSS import를 따른다.
- 프로토타입의 정확한 픽셀 복제보다 포함 화면의 명확한 이동과 모바일 사용 가능성을 우선한다.

### Routing

- 승인된 `react-router`를 사용해 브라우저 URL과 팬·크리에이터·관리자 영역을 구분한다.
- 공개 화면은 `/events`, `/events/:eventId`, `/booths/:eventBoothId`, `/products/:eventProductId`, `/reservations`, `/reservations/:reservationId`를 최소 후보로 한다.
- 크리에이터 화면은 `/creator/events`, `/creator/booths`, `/creator/event-booths/:id`, `/creator/event-booths/:id/products`, `/creator/reservations`, `/creator/pos`, `/creator/notices`를 최소 후보로 한다.
- 관리자 화면은 `/admin/events`, `/admin/events/:eventId`, `/admin/applications`를 최소 후보로 한다.
- 기능 권한 보호는 프런트의 화면 진입 제어와 백엔드의 소유권·관리자 검사를 함께 적용한다. 모든 로그인 사용자는 팬·크리에이터 영역에 진입할 수 있다.
- 라우트 표는 `frontend/src/app/router.tsx`에서 관리하고 `frontend/vercel.json`이 SPA 새로고침을 `index.html`로 연결한다.

### Error handling

- 페이지는 로딩·정상·빈 데이터·오류 상태를 명시적으로 렌더링한다.
- 폼 저장 오류는 폼 상단 메시지와 해당 필드 오류로 표시하고 입력값을 유지한다.
- 401은 역할 선택 없이 카카오 로그인으로 바로 가는 안내, 403은 기능 권한 또는 소유권 없음, 404는 대상 없음, 그 외 오류는 재시도 가능한 공통 오류 상태로 표시한다.
- 삭제·예약 취소·POS 취소·수령 완료는 최소 확인창을 사용한다.
- 오류 추적 서비스, 감사 로그, 자동 재시도, 오프라인 큐는 추가하지 않는다.

### Testing and verification

- 프런트는 TypeScript project build와 Oxlint를 사용하고, 백엔드는 Spring Boot 기본 테스트 의존성을 사용한다.
- 사용자가 요청한 TypeScript와 린트 오류는 `pnpm build`, `pnpm lint`로 확인한다.
- 새 프런트 테스트 라이브러리를 임의로 추가하지 않는다. 프런트는 Vite production build와 실제 브라우저에서 권한별 정상 흐름을 확인한다.
- 백엔드는 승인된 Spring Boot 기본 테스트 의존성 범위 안에서 핵심 서비스 규칙과 API 정상 흐름만 검증한다. 별도 테스트 프레임워크를 더하지 않는다.
- 매 구현 단계마다 화면 저장→새로고침→재조회, 다른 소유자 접근 거부, 유한·무한 재고 표시, 취소 재고 규칙을 해당 단계 범위만큼 확인한다.
- 최종 검증은 Vercel Preview와 Render 스테이징에서 카카오 개발 앱, Supabase PostgreSQL, R2를 연결한 한 개의 정상 시나리오로 수행한다.

### Dependency rule

- 승인된 React·React DOM·Vite·React Router·QR 및 Spring Boot·Gradle·AWS S3 SDK 의존성이 lockfile과 build 파일에 반영되어 있다.
- 이후 새 라이브러리는 후보·사용 이유·대안·영향을 제시하고 승인을 받은 뒤 추가한다.
- 상태 관리, HTTP, 폼, 검증, CSS, 프런트 테스트 편의를 위한 라이브러리는 이번 계획에 추가하지 않는다.

승인 후 실제 구현에 반영한 의존성은 다음 범위로 제한한다. 버전은 lockfile과 Gradle build 파일에 고정하며, 표에 없는 패키지는 다시 승인받는다.

| 구분 | 의존성 | 용도와 근거 | 미승인 시 대안 |
| --- | --- | --- | --- |
| 프런트 필수 | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom` | 승인된 React/Vite TypeScript 프로젝트 골격과 TypeScript 오류 확인. [Vite 공식 React 템플릿](https://v8.vite.dev/guide/) | React TypeScript 구현 불가 |
| 프런트 필수 | `oxlint` | 사용자가 요구한 린트 오류 확인. 현재 `.oxlintrc.json`의 최소 React·TypeScript 규칙만 사용 | 린트 오류 확인 불가 |
| 프런트 승인 | `react-router` | 중첩 없는 SPA URL, 뒤로가기, 팬·크리에이터·관리자 영역 라우트. [React Router 공식 Vite 설치](https://reactrouter.com/start/data/installation) | History API 기반 최소 라우트 표 |
| 프런트 승인 | `qrcode` | 예약번호 또는 상세 URL을 표시용 QR 이미지로 생성. [node-qrcode 저장소](https://github.com/soldair/node-qrcode) | QR 제외는 승인 범위와 충돌하며 직접 QR 알고리즘 구현은 하지 않음 |
| 백엔드 필수 | Spring Boot Web, Data JPA, Validation, OAuth2 Client, 기본 Test starter, PostgreSQL JDBC driver | REST API, Supabase PostgreSQL, 입력 검증, 카카오 OAuth. [Spring OAuth2 Client](https://docs.spring.io/spring-security/reference/servlet/oauth2/), [Spring SQL/JPA](https://docs.spring.io/spring-boot/reference/data/sql.html) | 승인된 Java/Spring/DB/인증 구성을 구현할 수 없음 |
| 백엔드 승인 | AWS SDK for Java v2 S3·presigner 모듈 | R2의 S3 호환 API로 짧은 PUT 서명 URL 발급. [Cloudflare 공식 Java 예제](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-java/) | AWS Signature V4를 직접 구현해야 하므로 사용하지 않음 |

## Minimal data

| Field | Purpose | Evidence |
| --- | --- | --- |
| `User(id, kakao_subject, display_name, created_at)` | 카카오 계정 식별. 팬·크리에이터 권한은 모든 로그인 사용자에게 파생하고 지정 계정에만 관리자 권한을 추가하므로 단일 역할 상태를 저장하지 않는다. | 사용자 권한 모델 변경(2026-08-09); 최신 안건 정리 46-63행 |
| `Event(id, name, start_at, end_at, venue, description, image_key, reservation_start_at, reservation_end_at, status)` | 행사 등록·공개·종료와 예약 가능 기간 | 엑셀 `01_MVP_기능명세!A1:L53`, `03_데이터구조!A1:F16` |
| `Booth(id, owner_user_id, name, description, image_key, sns_url)` | 크리에이터가 재사용하는 기본 부스 | 엑셀 `03_데이터구조!A1:F16` |
| `EventBooth(id, event_id, booth_id, booth_number, intro, status, is_public)` | 행사 참가 신청·승인과 행사별 부스 정보 | 엑셀 `02_주요플로우!A1:H19`, `03_데이터구조!A1:F16` |
| `Product(id, booth_id, name, description, image_key)` | 행사 간 복사 가능한 기본 상품 정보 | 엑셀 `01_MVP_기능명세!A1:L53`, `03_데이터구조!A1:F16` |
| `EventProduct(id, event_booth_id, product_id, price, stock_mode, stock_quantity, is_sold_out, is_public, reservation_enabled)` | 행사별 가격·통합 재고·무한 재고·품절·예약 설정 | 최신 안건 정리 77-100행 |
| `BoothNotice(id, event_booth_id, title, body, is_pinned, created_at)` | 부스 변경 사항과 한 개의 고정 공지 | 최신 안건 정리 32-42행 |
| `Reservation(id, reservation_no, user_id, event_booth_id, status, qr_token, created_at, picked_up_at, canceled_at)` | 결제 없는 예약, QR, 수령·취소 상태 | 최신 안건 정리 1-8행, 102-119행 |
| `ReservationItem(id, reservation_id, event_product_id, quantity, unit_price)` | 예약 상품·수량과 현장 결제 참고 금액 보존 | 엑셀 `03_데이터구조!A1:F16`; 최신 안건 정리 1-8행 |
| `PosSale(id, event_booth_id, payment_method, status, sold_at)` | 일기장 수준의 현장 판매 기록과 취소 상태 | 최신 안건 정리 121-136행 |
| `PosSaleItem(id, pos_sale_id, event_product_id, quantity, unit_price)` | POS 판매 상품·수량과 통합 재고 차감 근거 | 엑셀 `02_주요플로우!A1:H19`; 최신 안건 정리 121-136행 |

별도 결제, 환불, 정산, 재고 감사 로그 테이블은 만들지 않는다. 예약·POS 항목과 현재 재고 값만 현재 MVP의 장부로 사용한다.

## Completion checks

- 사용자가 사전 역할 선택 없이 카카오 로그인하고, 로그인 후 팬·크리에이터 전환 버튼으로 두 화면에 진입할 수 있으며, 다른 크리에이터의 관리 데이터는 수정할 수 없다.
- React 프런트엔드가 Vercel Preview URL에서 열리고 Java 백엔드의 스테이징 API 및 Supabase PostgreSQL과 연결되어 핵심 흐름을 확인할 수 있다.
- 관리자가 행사를 생성·조회·수정·삭제하고 공개·종료할 수 있으며, 저장 내용이 재접속 후 유지된다.
- 크리에이터가 부스를 생성·조회·수정·삭제하고 행사 참가를 신청하며, 관리자가 승인·반려할 수 있다.
- 승인된 크리에이터가 상품을 생성·조회·수정·삭제하고 이전 행사 상품을 현재 행사로 복사할 수 있다.
- 유한 재고 상품은 현재 수량이 보이고, 무한 재고 상품은 재고 문구가 숨겨지며, 판매자가 재고와 무관하게 `SOLD OUT`을 켜고 끌 수 있다.
- 부스·상품 이미지는 서버 비밀정보를 브라우저에 노출하지 않고 지정된 Cloudflare R2 경로에 업로드된다.
- 크리에이터가 부스 공지를 생성·조회·수정·삭제하고 최대 한 개를 상단 고정할 수 있으며 팬 화면에 반영된다.
- 팬이 공개 행사→부스→상품을 탐색하고 예약을 생성한 뒤 예약번호·QR을 확인하며, 내 예약 목록·상세에서 다시 조회하고 취소할 수 있다.
- 유한 재고는 예약·POS 판매 시 감소하고, 취소 시 재고 처리 규칙은 승인된 D-009 결정대로 동작한다.
- 크리에이터가 예약번호로 예약을 찾고 수령 완료 처리할 수 있다. 같은 예약을 다시 처리하려는 경우 현재 상태를 보여주되 복잡한 차단 정책은 추가하지 않는다.
- 크리에이터가 POS 판매를 기록·조회·취소할 수 있고, 결제수단은 현금·계좌이체·기타 중 하나의 메모 값으로만 저장된다.
- 행사가 종료되면 기존 공개 주소에서 부스·상품을 조회할 수 있지만 부스·상품 수정, 신규 예약, 신규 POS 판매는 할 수 없다. 기존 예약 취소는 가능하다.
- 온라인 결제·정산·통계·알림·신고·견적 기능이 구현되어 있지 않다.

## Implementation sequence

1. 기존 로그인 전 팬·크리에이터 선택 화면과 선택 쿠키를 제거하고, 모든 로그인 사용자에게 팬·크리에이터 권한을 파생하며 지정 계정에 관리자 권한을 추가한다. 로그인 후 화면 전환, 소유권, 기존 `role` 컬럼 마이그레이션을 확인한다.
2. 관리자 행사 CRUD·공개·수동 종료와 크리에이터 기본 부스 CRUD·참가 신청·관리자 승인 흐름을 API와 실제 화면으로 연결한다.
3. 행사별 부스·상품 CRUD, 이전 상품 복사, 통합 재고·무한 재고·`SOLD OUT`, R2 이미지와 부스 공지를 연결하고 재접속 영속성을 검수한다.
4. 팬용 행사→부스→상품 조회, 한 부스 직접 예약, 예약번호·QR, 내 예약 조회·취소를 연결하고 예약 전 취소 재고 복구를 검수한다.
5. 크리에이터 예약번호 검색·수령 완료와 간단 POS 판매·목록·상세·취소를 연결하고 승인된 재고 규칙을 검수한다.
6. 종료 행사 읽기 전용, 권한별 접근, 로딩·빈·오류 상태와 포함 화면 이동을 정리한 뒤 Vercel Preview·Render 스테이징의 정상 흐름을 검증하고 멈춘다.

## Developer-autonomous decisions

- 프로토타입의 정확한 문구·배치가 요구사항과 충돌하지 않는 범위에서 컴포넌트 구조와 반응형 배치를 단순하게 결정한다.
- 변수명, 라우트명, 파일 구조, 기본 오류 문구, 버튼 위치처럼 쉽게 되돌릴 수 있는 세부사항은 기존 관례가 없으므로 가장 직접적인 형태로 결정한다.
- 필수값 누락, 음수 수량, 존재하지 않는 기록 접근처럼 정상 흐름을 막거나 데이터를 즉시 손상시키는 입력만 최소 검증한다.
- 삭제 전 단순 확인창은 사용하되 복구함이나 삭제 이력은 만들지 않는다.
- QR은 예약 상세 URL 또는 예약번호를 담는 표시용 코드로 생성하며 카메라 스캐너는 만들지 않는다.
- 프로토타입의 예시 데이터는 UI 참고에만 사용하고 실제 초기 데이터로 자동 삽입하지 않는다.

## Risks requiring confirmation

None. 기존 개발 데이터의 `app_user.role` 컬럼 제거를 포함한 로그인·권한 개정안은 2026-08-09 사용자 승인을 받았다.

### Implementation inputs already decided in principle

아래 항목은 정책 결정이 끝났으며 계획 승인을 막지 않는다. 실제 값과 비밀정보는 구현 단계에서 환경변수로 제공한다.

- **I-001 관리자 계정:** 지정된 카카오 계정 ID만 기본 팬·크리에이터 권한에 관리자 권한을 추가로 받는다. 실제 ID는 서버 환경변수로 제공한다.
- **I-002 Cloudflare R2:** Supabase 무료 구간의 파일 저장 공간보다 넉넉한 무료 이미지 저장 공간을 확보하려는 선택이다. 사용자 확인 기준으로 Cloudflare R2 무료 구간의 10GB 저장 공간을 활용한다. 공개 읽기 URL과 서버가 발급한 단기 서명 업로드를 사용하며, 버킷 이름·공개 URL·접근 키는 구현 단계에서 제공한다.
- **I-003 취소 재고:** 수령 전 예약 취소만 자동 복구한다. 수령 후 예약 취소와 POS 판매 취소는 상태만 변경하고 크리에이터가 재고를 직접 조정한다.
- **I-004 카카오 OAuth:** 개발용 Kakao Developers 앱이 준비되어 있다. REST API 키·Client Secret은 저장소나 채팅에 기록하지 않고 배포 환경변수로 제공하며, Callback URL은 Vercel·백엔드 스테이징 주소가 생성된 뒤 등록한다.
- **I-005 장애 안내:** 그로스라인 이메일이 정해질 때까지 정적 장애 안내 화면은 이번 구현에서 제외한다.

## Decision record

| ID | Decision | Evidence | Alternatives | Rationale | Reversibility | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D-001 | 최신 안건 정리를 엑셀과 프로토타입보다 우선한다. | 사용자 요청; 최신 안건 정리 1-155행 | 엑셀 초안 우선; 프로토타입 우선 | 사용자가 최신 자료라고 명시했다. | Easy | user-approved |
| D-002 | 온라인 결제·PG·환불·정산을 제외하고 예약만 저장한다. | 최신 안건 정리 1-8행, 121-136행 | 온라인 선결제; 결제 상태만 모사 | 최신 결정이며 MVP 범위를 크게 줄인다. | Moderate | user-approved |
| D-003 | 로그인은 카카오 OAuth만 사용하고 고급 계정 상태를 제외한다. | 최신 안건 정리 46-63행; 개발용 Kakao Developers 앱 준비 확인(2026-08-07) | 이메일 회원가입; 이메일 인증·차단 | 최신 합의에 직접 명시되어 있고 테스트 앱이 준비되었다. | Moderate | user-approved |
| D-004 | 관리자 행사와 참가 승인만 최소 관리자 기능으로 포함한다. | 엑셀 `01_MVP_기능명세!A1:L53`, `02_주요플로우!A1:H19` | 관리자 기능 전부 제외; 프로토타입 관리자 전체 구현 | 핵심 행사→부스 흐름에 필요한 범위만 남긴다. | Moderate | user-approved |
| D-005 | 예약은 복잡한 장바구니 대신 한 부스 내 상품 직접 예약으로 구현한다. | 최신 안건 정리 1-8행; 프로토타입 `f-003.html` | 다중 부스 장바구니; 즉시 단일 상품 예약만 | 결제 없는 예약 검증에 필요한 최소 흐름이다. | Moderate | user-approved |
| D-006 | 통합 재고 하나와 유한·무한 모드를 사용한다. | 최신 안건 정리 77-94행 | 사전·현장 재고 분리; 재고 미관리 | 최신 종결 결정이며 화면 규칙도 정해졌다. | Difficult | user-approved |
| D-007 | `SOLD OUT`은 재고 수량과 독립된 판매자 제어 값이다. | 최신 안건 정리 94-100행 | 재고 0 자동 품절만; 화면 계산값 | 재고가 남아도 판매자가 품절 처리해야 한다. | Moderate | user-approved |
| D-008 | 예약 상태는 예약·수령 완료·취소만 둔다. | 최신 안건 정리 102-119행 | 준비·만료·미수령 등 세분화; 상태 없음 | 복잡한 상태가 MVP 사용성을 해친다는 합의다. | Moderate | user-approved |
| D-009 | 수령 전 취소는 재고를 자동 복구하고, 수령 후 예약 취소와 POS 취소의 재고는 수동 조정한다. | 최신 안건 정리 110-136행; 사용자 권장안 승인(2026-08-07) | 모든 취소 자동 복구; 어떤 취소도 복구하지 않음 | 반품 여부를 추정하지 않으면서 일반 예약 취소는 작동하게 한다. | Difficult | user-approved |
| D-010 | POS 기록은 CRUD에 가까운 일기장 수준으로 구현하고 통계·감사 로그를 만들지 않는다. | 최신 안건 정리 121-136행 | 불변 거래 원장; 매출·정산 시스템 | 데이터 신뢰도와 중요도를 낮게 보기로 합의했다. | Moderate | user-approved |
| D-011 | 종료된 행사 부스는 기존 주소에서 읽기 전용으로 남긴다. | 최신 안건 정리 138-143행 | 페이지 삭제; 종료 후에도 수정 허용 | 공유 주소를 유지하면서 신규 변경을 막는다. | Moderate | user-approved |
| D-012 | 부스·상품 이미지는 Supabase Storage가 아닌 Cloudflare R2에 저장하고 공개 URL로 읽으며, 서버가 발급한 단기 서명 URL로 지정 경로에 직접 업로드한다. | 최신 안건 정리 145-150행; 사용자 권장안 및 R2 선택 이유 확인(2026-08-07) | Supabase Storage; 앱 서버 경유 업로드; 로컬 저장 | 사용자 확인 기준 무료 구간에서 10GB의 이미지 저장 공간을 확보하고, 비밀키 노출과 Java 서버의 이미지 중계를 피한다. | Difficult | user-approved |
| D-013 | 그로스라인 이메일을 받기 전까지 정적 장애 안내 화면을 이번 구현에서 제외한다. | 최신 안건 정리 14-30행; 사용자 보류 요청(2026-08-07) | 임시 이메일 표시; 빈 문의 화면 구현 | 현재 필요한 값이 없으며 추후 계획 변경으로 포함할 수 있다. | Easy | user-approved |
| D-014 | 부스 공지 CRUD와 한 개의 상단 고정을 포함한다. | 최신 안건 정리 32-42행 | 공지 제외; 서비스 공지만 구현 | 판매자가 현장 변경을 방문자에게 알려야 한다. | Easy | user-approved |
| D-015 | 업체 연결과 견적 요청을 제외한다. | 최신 안건 정리 152-155행 | MVP 포함; 외부 링크만 제공 | 서비스 밖의 메일·전화로 대체 가능하다는 최신 결정이다. | Easy | user-approved |
| D-016 | 프로토타입은 디자인·이동 참고 자료이며 구현 범위의 근거로 단독 사용하지 않는다. | 사용자 설명; GitHub `prototype/index.html` | 프로토타입 전체 구현 | 사용자가 화면이 불완전하고 변경될 수 있다고 명시했다. | Easy | user-approved |
| D-017 | 프런트엔드는 React, 백엔드는 Java, DB는 Supabase PostgreSQL을 사용한다. | 사용자 결정(2026-08-07) | Next.js 단일 앱과 SQLite; 다른 관계형 DB | 사용자가 기술 스택을 명시했다. | Difficult | user-approved |
| D-018 | React는 Vite로 빌드해 Vercel Preview에 배포하고, Java는 Spring Boot·Gradle로 구성해 Render 스테이징에 자동 배포한다. | 실시간 개발 확인에 대한 사용자 요청(2026-08-07); Vercel·Render 공식 배포 문서; 사용자 기술 구성 승인(2026-08-09) | Java를 Vercel 커뮤니티 런타임에 배포; Railway/Fly.io 사용 | Vercel 공식 Function 런타임에 Java가 없으므로 프런트엔드와 Java API 배포를 분리한다. | Moderate | user-approved |
| D-019 | 지정된 카카오 계정 ID만 관리자 권한을 추가로 받는다. | 사용자 결정(2026-08-07, 2026-08-09 재확인) | 화면에서 관리자 선택; 별도 관리자 비밀번호 | 일반 사용자의 관리자 권한 획득을 막는 가장 작은 규칙이다. | Moderate | user-approved |
| D-020 | 기존 React 관례가 없으므로 TypeScript 함수형 컴포넌트·Hooks와 기능 중심의 최소 폴더 구조를 사용한다. | 저장소 조사: `README.md`, 계획·분석 문서 외 React 파일 없음(2026-08-09); 사용자 TypeScript 오류 확인 요청 | 계층형 대규모 구조; JavaScript 사용; 파일을 모두 한 폴더에 배치 | 포함 기능을 구분하되 미래용 추상화를 만들지 않고 정적 오류를 확인한다. | Easy | user-approved |
| D-021 | 전역 상태 라이브러리 없이 로컬 state와 인증용 Context만 사용한다. | 사용자 요청: 새 라이브러리 임의 추가 금지; 기존 상태 관리 없음 | Redux/Zustand 등 추가; 모든 상태 전역화 | 현재 규모에서 React 기본 기능으로 충분하고 되돌리기 쉽다. | Easy | user-approved |
| D-022 | API 호출은 브라우저 `fetch`와 작은 공통 client를 사용한다. | 사용자 요청: 새 라이브러리 임의 추가 금지; 기존 API 방식 없음 | Axios 등 추가; 화면마다 직접 fetch | 공통 오류와 쿠키 처리만 모으는 최소 방식이다. | Easy | user-approved |
| D-023 | 폼은 controlled input·HTML 제약·작은 검증 함수로 구현한다. | 사용자 요청: 새 라이브러리 임의 추가 금지; 기존 폼 방식 없음 | React Hook Form/Zod 등 추가 | 핵심 폼 수와 검증 범위에 맞는 최소 방식이다. | Easy | user-approved |
| D-024 | 스타일은 프로토타입 톤을 일반 CSS와 토큰 파일로 옮긴다. | 역기획 분석 `docs/analysis/2026-08-09-prototype-reverse-analysis.md`; 기존 스타일 방식 없음 | Tailwind/CSS-in-JS 추가; 디자인 시스템 구축 | 새 의존성 없이 참고 화면의 톤을 재현한다. | Easy | user-approved |
| D-025 | 프런트 자동 테스트 라이브러리를 추가하지 않고 TypeScript·Oxlint·build·브라우저 정상 흐름을 검증한다. | 사용자 요청: TypeScript·린트·브라우저 오류 확인 및 새 라이브러리 임의 추가 금지; 기존 테스트 설정 없음 | Vitest/Testing Library/Playwright 추가 | 요청한 정적·실행 검증을 하면서 별도 테스트 체계를 만들지 않는다. | Easy | user-approved |
| D-026 | 삭제는 예약·판매가 연결되지 않은 행사의 부스·상품에만 허용하고 연결 기록이 있으면 비공개·종료 상태를 사용한다. | 기존 Assumptions; 데이터 손실 방지 원칙 | 연결 데이터까지 물리 삭제; 전체 soft delete | 대규모 복구 체계 없이 명백한 데이터 손실을 피한다. | Moderate | user-approved |
| D-027 | 행사 종료는 관리자 수동 상태 변경을 기준으로 하고 종료 시각 자동 작업은 만들지 않는다. | 관리자 종료가 포함된 승인 범위; 백그라운드 작업 명시적 제외 | 종료 시각 자동 전환 | 별도 스케줄러 없이 승인된 종료 흐름을 만족한다. | Easy | user-approved |
| D-028 | 이전 상품은 이름·설명·이미지를 복사하고 행사별 가격·재고·공개·예약·SOLD OUT 값은 새로 입력한다. | 승인 범위의 기본 상품/행사 상품 분리; 엑셀 초안의 재고·판매 기록 복사 금지 | 이전 가격까지 복사; 모든 행사 값을 복사 | 과거 운영 상태를 새 행사에 잘못 이어받지 않는 최소 규칙이다. | Moderate | user-approved |
| D-029 | 로그인 전 팬·크리에이터 선택 화면을 없애고 카카오 로그인으로 바로 진입한다. | 사용자 결정(2026-08-09) | 로그인 전 역할 선택 유지; 하나의 기본 화면만 고정 | 로그인 전 선택은 실제 사용자 상태나 권한을 결정하지 않으므로 불필요하다. | Easy | user-approved |
| D-030 | 모든 로그인 사용자는 팬·크리에이터 권한을 함께 가지며 화면 전환 버튼으로 두 영역을 자유롭게 이동한다. | 사용자 결정(2026-08-09) | 단일 역할 저장; 크리에이터 권한 별도 신청·승인 | 팬과 크리에이터는 배타적 상태가 아니라 추가 가능한 기능 권한이라는 합의를 직접 반영한다. | Moderate | user-approved |
| D-031 | 팬·크리에이터 권한은 로그인 사용자에게 파생하고 별도 권한 테이블을 만들지 않으며, 관리자 권한만 지정 카카오 ID에서 추가로 파생한다. 기존 `app_user.role` 컬럼은 삭제한다. | D-019, D-030; 사용자별 권한 관리 기능은 제외 범위; 사용자 개정안 승인(2026-08-09) | `user_permission` 테이블; `User.role` 유지 | 모든 일반 사용자가 같은 두 권한을 가지므로 저장 테이블은 중복이며 현재 요구에 불필요하다. | Moderate | user-approved |
| D-032 | 사용자가 제공한 `LOGO.png`를 화면의 `부스하나` 브랜드 로고로 사용한다. 저장소와 개발 문서의 프로젝트명은 `BoothHana2`를 유지한다. | 사용자 결정(2026-08-12) | 기존 `BH` 임시 표식 유지; 별도 로고 제작 | 확정된 브랜드 자산을 공개·크리에이터·관리자 화면에 동일하게 적용한다. | Easy | user-approved |

## Assumptions

- Included scope, Explicit exclusions, 기술 구성과 로그인·권한 개정안은 2026-08-09 사용자 승인 완료 상태다.
- 프로젝트에는 React/Vite, Spring Boot, PostgreSQL 스키마와 가산형 권한 기반 카카오 로그인 구현이 있다.
- 첫 검증 대상은 소수 사용자가 사용하는 단일 MVP이며 동시 재고 정확성은 보장하지 않는다.
- 가격은 온라인 청구 금액이 아니라 현장 결제를 위한 안내 및 POS 기록 값이다.
- Supabase는 PostgreSQL DB 용도로 사용하고, 부스·상품 이미지 원본은 Cloudflare R2에만 저장한다.
- 무한 재고 상품은 재고 차감 계산을 하지 않으며 공개 화면에서 수량 문구를 숨긴다.
- 삭제는 아직 예약·판매 기록이 연결되지 않은 행사·부스·상품·공지에만 제공한다. 연결된 거래 기록은 삭제 대신 상태 변경을 사용한다.
- 그로스라인 이메일은 추후 제공되며, 제공 시 정적 장애 안내 화면을 포함하도록 이 계획을 다시 Draft로 수정한다.
- 프로토타입의 75개 안팎 화면 전체는 구현 대상이 아니며, Included scope에 필요한 최소 화면만 재사용하거나 새로 구성한다.
- 모든 카카오 로그인 계정은 팬·크리에이터 권한을 함께 가지며, 지정된 계정에는 관리자 권한을 추가한다. 권한은 계정 상태값이나 단일 `User.role`로 저장하지 않는다.
- 서비스 화면 표기명과 로고는 `부스하나`를 사용한다. 저장소명과 개발 문서의 프로젝트 식별자는 `BoothHana2`를 유지한다.

## Implementation handoff

Use `$build-lean-crud` to implement only this document's included scope.
Do not implement excluded items or future preparation.
Stop when the completion checks pass.

구현 전 이 문서의 상태가 `Approved`인지 확인한다. 현재 요청이 이 문서와 충돌하면 구현하지 않고 `$plan-lean-crud`로 같은 문서를 수정한다.

## Revision history

| Date | Change | Reason |
| --- | --- | --- |
| 2026-08-07 | Initial Draft created | 최신 안건 정리를 우선해 초기 엑셀과 프로토타입을 Lean CRUD 범위로 축소했다. |
| 2026-08-07 | R2 공급자를 Cloudflare R2로 명시하고 D-012를 사용자 확인 결정으로 변경했다. | 사용자가 R2가 Cloudflare 서비스임을 확인했다. |
| 2026-08-07 | 미결정 사항을 6개 확인 항목과 승인 체크리스트로 구체화했다. | 구현 전에 무엇을 확정해야 하는지 명시하라는 사용자 요청을 반영했다. |
| 2026-08-07 | React·Java·Supabase 스택, 관리자 규칙, R2 방식, 취소 재고 규칙, Kakao 앱 준비를 반영하고 장애 안내를 제외했다. | 사용자가 미결정 사항에 답변했다. |
| 2026-08-07 | 이미지 저장소를 Supabase Storage가 아닌 Cloudflare R2로 선택한 용량 근거를 명시했다. | 사용자가 무료 구간의 10GB 이미지 저장 공간을 R2 선택 이유로 설명했다. |
| 2026-08-09 | Included scope와 Explicit exclusions 및 관련 결정들을 사용자 승인 상태로 변경했다. | 사용자가 전체 범위를 승인했다. |
| 2026-08-09 | 기술 구성을 승인하고 계획 상태를 Approved로 변경했다. | 사용자가 React/Vite/Vercel, Spring Boot/Gradle/Render, Supabase PostgreSQL 구성을 승인했다. |
| 2026-08-09 | 역기획 결과와 현재 빈 저장소를 기준으로 폴더·컴포넌트·상태·API·폼·스타일·라우팅·오류·테스트 방식을 추가하고 Draft로 전환했다. | 사용자가 현재 React 저장소의 관례를 우선한 구현 계획과 새 라이브러리 임의 추가 금지를 요청했다. |
| 2026-08-09 | 2단계 구현 설계와 제한된 의존성을 승인하고 TypeScript·ESLint 검증 요구를 반영해 Approved로 변경했다. | 사용자가 설계를 승인하고 구현 및 TypeScript·린트 검증을 요청했다. |
| 2026-08-09 | 로그인 전 팬·크리에이터 선택을 제거하고, 로그인 후 두 화면을 자유롭게 전환하는 가산형 권한 모델로 수정해 Draft로 전환했다. | 사용자가 팬·크리에이터를 배타적 상태값이 아닌 사용자에게 추가되는 권한으로 명시했다. |
| 2026-08-09 | 로그인·권한 개정안과 기존 `app_user.role` 컬럼 제거를 승인하고 Approved로 변경했다. | 사용자가 개정안을 승인했다. |
| 2026-08-09 | 구현 상태, 실제 의존성·검증 도구·DB 필드와 현재 참가 신청 화면 한계를 문서에 반영했다. | 구현 이후 문서와 코드의 사실 관계를 동기화했다. |
| 2026-08-12 | 참가 신청 상태 표시 수정, 최종 관리자 QA와 `main` 병합 결과를 반영하고 남은 승인 범위 두 항목을 명시했다. | 구현·QA 결과와 승인 계획의 현재 상태를 동기화했다. |
| 2026-08-12 | 사용자 제공 로고와 `부스하나` 화면 표기 확정을 D-032에 반영했다. | 임시 `BH` 표식을 확정된 브랜드 자산으로 교체했다. |
| 2026-08-12 | 행사별 부스 정보 수정·삭제와 POS 판매 단건 상세 조회 구현 및 자동 검증 결과를 반영했다. | 승인 범위에서 남아 있던 두 기능을 완료하고 현재 구현 상태와 문서를 동기화했다. |
| 2026-08-21 | 복수 관리자 배포 설정과 Vercel·Render 공개 환경의 인증·권한·주요 조회 화면 검증 결과를 반영했다. | 공개 배포 상태와 남은 R2 실제 업로드 검증 범위를 문서와 동기화했다. |
