# BoothHana2

> **서브컬처 수집 v3**: `collector/README_KO.md`와 `docs/maintenance/2026-09-16-v3/DEPLOYMENT_KO.md`를 먼저 확인하세요. DB 005가 추가됩니다. Codex 검색 → 수집함 DB 저장만 자동화하며 기존 공개 행사/예약은 변경하지 않습니다.

> **코드리뷰 수정 v2 적용본**: 아래 원본 안내보다 `RELEASE_NOTES_KO.md`와 `docs/maintenance/2026-09-16-v2/DEPLOYMENT_KO.md`가 우선합니다. DB 003 및 004가 필요하며, 이미지는 브라우저 직접 R2 PUT 대신 서버 검증 업로드를 사용합니다. 프런트와 백엔드를 함께 배포하세요.

행사 부스 운영자와 방문자가 행사, 부스, 상품 예약과 현장 운영 흐름을 확인하는 Lean CRUD MVP입니다. 현재 코드는 개발 검증 단계이며 운영용 서비스 품질이나 실제 결제·정산 기능을 목표로 하지 않습니다.

## Current implementation

- 카카오 OAuth 로그인으로 바로 진입하며 로그인 전 팬·크리에이터 선택 화면은 없습니다.
- 모든 로그인 사용자는 `FAN`, `CREATOR` 기능 권한을 함께 사용하고 두 화면을 자유롭게 전환합니다.
- `ADMIN_KAKAO_SUBJECTS`에 쉼표로 지정한 카카오 계정에만 `ADMIN` 권한이 추가됩니다.
- 팬은 공개 행사·부스·상품 조회, 예약 생성·조회·취소를 사용할 수 있습니다.
- 크리에이터는 기본 부스, 행사 참가 신청, 행사별 부스 정보, 상품·재고, 공지, 예약 수령과 간단 POS 기록·상세를 관리합니다.
- 관리자는 행사 CRUD·공개·종료와 참가 신청 승인·반려만 관리합니다.
- 업무 데이터는 Supabase PostgreSQL에 저장하고, 부스·상품 이미지는 백엔드가 발급한 서명 URL로 Cloudflare R2에 직접 업로드합니다.
- 화면 헤더·푸터와 브라우저 제목에는 확정된 `부스하나` 로고와 표기명을 사용합니다.

온라인 결제, 환불, 정산, 통계, 알림, 신고, 고급 검색과 운영 자동화는 승인 범위에서 제외되어 있습니다.

## Documentation

- [승인된 Lean CRUD 계획](docs/plans/2026-08-07-booth-platform-lean-crud-plan.md)
- [프로토타입 역기획 및 불일치 분석](docs/analysis/2026-08-09-prototype-reverse-analysis.md)
- [로컬 QA 보고서](docs/qa/2026-08-10-localhost-qa-report.md)
- [공개 배포 QA 보고서](docs/qa/2026-08-21-deployment-qa-report.md)
- [프런트엔드 개발 안내](frontend/README.md)
- [백엔드 개발 안내](backend/README.md)

## Stack

- Frontend: React, TypeScript, Vite, React Router, 일반 CSS, Vercel
- Backend: Java 21, Spring Boot, Gradle, Render
- Database: Supabase PostgreSQL
- Image storage: Cloudflare R2
- Authentication: Kakao OAuth through Spring Security

## Repository structure

```text
frontend/       React 화면, 라우팅, API client, 스타일
backend/        Spring Boot API, 인증, 도메인 서비스, 테스트
database/       운영 순서의 SQL 마이그레이션
database/dev/   수동 실행하는 개발 전용 mock seed
docs/           승인 계획, 역기획 분석과 QA 기록
```

## Local setup

### 1. Database

Supabase SQL Editor에서 다음 파일을 번호순으로 실행합니다.

1. `database/001_initial_schema.sql`
2. `database/002_remove_user_role.sql`

`database/dev` 파일은 운영 마이그레이션이 아니므로 이 단계에서 자동으로 실행하지 않습니다.

### 2. Environment variables

`frontend/.env.example`을 `frontend/.env`로, `backend/.env.example`을 `backend/.env`로 복사한 뒤 개발용 값을 채웁니다. `.env` 파일은 Git에 커밋하지 않습니다.

카카오 개발자 앱의 Redirect URI에는 다음 주소를 등록합니다.

```text
http://localhost:8080/login/oauth2/code/kakao
```

주요 백엔드 환경 변수는 다음과 같습니다. 실제 비밀값은 `backend/.env`에만 둡니다.

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | Supabase PostgreSQL JDBC 연결 |
| `FRONTEND_URL` | 로그인 성공 후 돌아갈 프런트 주소 |
| `ALLOWED_ORIGINS` | 쿠키를 포함한 API 요청을 허용할 프런트 주소. 여러 개면 쉼표로 구분 |
| `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` | 개발용 Kakao Developers 앱 |
| `ADMIN_KAKAO_SUBJECTS` | 추가 관리자 권한을 받을 카카오 사용자 ID. 여러 명이면 쉼표로 구분 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | R2 서명 업로드와 공개 이미지 URL |
| `SESSION_COOKIE_SECURE`, `SESSION_COOKIE_SAME_SITE` | 로컬·배포 환경의 세션 쿠키 정책 |

#### R2 개발용 API 키 갱신

Cloudflare Dashboard의 **R2 Object Storage → Manage R2 API Tokens**에서 `BoothHana2 Dev Backend` 토큰을 생성하거나 Roll한 뒤, 한 번만 표시되는 값을 다음 위치에 각각 반영합니다.

- 로컬: `backend/.env`의 `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- 공개 개발계: Render 서비스의 같은 이름의 Environment Variables

키 값은 프런트엔드 환경 변수나 문서에 넣지 않으며 Git에 커밋하지 않습니다. 로컬 값을 바꾼 뒤에는 실행 중인 백엔드를 종료하고 `backend/run-dev.ps1`로 재기동해야 합니다. 토큰을 Roll하면 이전 키는 더 이상 사용할 수 없으므로 로컬과 Render를 함께 갱신합니다.

#### 로컬 관리자 권한 부여

1. 관리자용 카카오 계정으로 한 번 로그인해 `app_user`를 생성합니다.
2. Supabase SQL Editor에서 계정의 `kakao_subject`를 확인합니다.

```sql
select id, kakao_subject, display_name, created_at
from app_user
order by created_at desc;
```

3. 해당 값을 `backend/.env`의 `ADMIN_KAKAO_SUBJECTS`에 입력합니다. 여러 명이면 `123456789,987654321`처럼 쉼표로 구분합니다.
4. 백엔드를 재기동하고 브라우저에서 로그아웃한 뒤 같은 카카오 계정으로 다시 로그인합니다.
5. `/api/me`의 `permissions`에 `ADMIN`이 포함되고 `/admin/events`에 접근되는지 확인합니다.

`ADMIN_KAKAO_SUBJECTS`는 백엔드 시작 시 읽히므로 `.env` 변경만으로 실행 중인 서버 권한이 바뀌지는 않습니다. 기존 `ADMIN_KAKAO_SUBJECT`도 배포 전환을 위해 단일 관리자 값으로 계속 인식하지만 새 설정에는 복수형 변수를 사용합니다.

### 3. Backend

Spring Boot는 프로젝트의 `.env` 파일을 자동으로 읽지 않습니다. 로컬 개발 스크립트가 `backend/.env`를 현재 프로세스에 불러온 뒤 서버를 실행합니다.

```powershell
cd backend
.\run-dev.ps1
```

백엔드는 기본적으로 `http://localhost:8080`에서 실행됩니다.

PowerShell 실행 정책으로 스크립트가 차단되면 현재 터미널에서만 다음과 같이 허용한 뒤 다시 실행합니다.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\run-dev.ps1
```

`Web server failed to start. Port 8080 was already in use.`가 표시되면 기존 백엔드가 이미 실행 중인지 확인합니다.

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
```

기존 서버를 실행한 터미널에서 종료한 뒤 `run-dev.ps1`을 다시 실행합니다. 서로 다른 환경 변수로 백엔드를 중복 실행하지 않습니다.

### 4. Frontend

다른 터미널에서 `frontend`로 이동해 실행합니다.

```powershell
cd frontend
pnpm install
pnpm dev
```

프런트엔드는 기본적으로 `http://localhost:5173`에서 실행되며 `VITE_API_BASE_URL`의 백엔드로 요청합니다.

## Development mock data

카카오 로그인으로 `app_user`가 생성된 뒤 [개발용 mock seed](database/dev/001_seed_mock_data.sql)를 Supabase SQL Editor에서 한 번 실행할 수 있습니다.

- 가장 최근 로그인 사용자를 부스 소유자와 예약자로 연결합니다.
- 행사, 부스, 상품, 예약, POS, 공지의 주요 정상 상태를 만듭니다.
- `[MOCK]` 또는 `MOCK-` 표식으로 실제 데이터와 구분합니다.
- 대표 mock 행사가 존재하면 다시 실행해도 중복 생성하지 않습니다.
- 애플리케이션 시작이나 운영 마이그레이션에서는 자동 실행되지 않습니다.
- 이미지 파일은 R2에 생성하지 않으며 화면의 로컬 대체 이미지를 사용합니다.

## Verification

```powershell
cd frontend
pnpm lint
pnpm build

cd ../backend
.\run-dev.ps1 test
```

실제 브라우저에서는 카카오 로그인, 팬·크리에이터 화면 전환, 저장 후 새로고침, 예약 상태, Creator 예약·POS·공지 화면을 확인합니다.

## API areas

- `/api/public/**`: 로그인 없이 공개 행사·부스·상품 조회
- `/api/me`, `/api/me/reservations/**`: 로그인 사용자 정보와 자신의 예약
- `/api/creator/**`: 소유 부스, 행사별 부스 정보, 참가 신청, 상품·공지, 예약 수령과 POS
- `/api/admin/**`: 지정 관리자 계정의 행사와 참가 신청 관리
- `/api/creator/uploads/presign`: Creator 이미지의 R2 직접 업로드 URL 발급

정확한 현재 엔드포인트는 `backend/src/main/java/com/boothhana/api`의 Controller를 기준으로 합니다.

## Known limitations

- 기본 부스가 여러 개이면 참가 신청 화면이 부스를 선택하게 하지 않고 목록의 첫 번째 부스를 사용합니다.
- Render 무료 인스턴스가 잠든 동안 카카오 동의 화면을 오래 열어 두면 OAuth callback 시점에 인스턴스를 다시 깨우면서 일회성 인증 코드가 만료될 수 있습니다. 이 경우 백엔드가 깨어난 뒤 로그인을 다시 시도합니다.
- 공개 배포 환경에서는 로그인·팬 조회/예약 목록·Creator 주요 화면·관리자 조회/입력 화면과 R2 이미지 업로드·상품 저장·새로고침 후 이미지 유지까지 검증했습니다.

## Deployment configuration

- Vercel: Root Directory를 `frontend`로 지정하고 `VITE_API_BASE_URL`을 백엔드 공개 주소로 설정합니다.
- Render: 루트의 `render.yaml`과 `backend/Dockerfile`을 사용하고 `backend/.env.example`에 나열된 비밀 환경 변수를 등록합니다.
- Supabase: `database` 루트의 번호 있는 SQL만 순서대로 적용합니다.
- Cloudflare R2: 버킷 CORS에서 프런트 도메인의 `PUT`을 허용하고 공개 이미지 URL을 `R2_PUBLIC_URL`에 지정합니다.
- Vercel과 Render처럼 프런트와 백엔드가 서로 다른 사이트이면 Render에서 `SESSION_COOKIE_SECURE=true`, `SESSION_COOKIE_SAME_SITE=none`을 사용합니다. CSRF 쿠키도 같은 정책을 따릅니다.
