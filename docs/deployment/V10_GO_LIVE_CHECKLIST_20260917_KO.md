# BoothHana2 v10 — 실제 사용 준비 체크리스트

작성일: **2026-09-17** · 기준: 전달한 v10 전체 소스.  
목적: 개발자가 아닌 프로젝트 담당자도 무엇을 준비하고, 누가 확인하며, 어떤 결과가 나와야 하는지 확인한다.

**미체크는 미완료/미확인이다. 이번 문서를 생성하면서 실제 계정 개설, DB 적용, 배포, 로그인, 수집 스케줄 설치를 한 것은 아니다.** 소스에 구현된 사실과 운영을 위한 권고는 구분해서 적었다.

## 0. 진행 순서와 출시 조건

```text
소스·DB 백업
 → 코드리뷰의 공개 상태 오류 수정 및 실제 빌드
 → 스테이징 DB 스키마·권한 준비
 → 백엔드 환경변수·Kakao·R2 연결
 → 프런트 배포
 → Codex 수집기 준비·가상 검증·실제 dry-run
 → 스테이징 수집/관리자 검토/공개/배치도 검증
 → 운영 DB·서비스 반영
 → 스케줄 등록·첫 정기 실행 확인
```

- [ ] **R10-01: 취소·연기 상태가 공개 시 소실되는 오류를 수정한다.** 이번 ZIP은 검토 문서를 추가했을 뿐 코드 수정본은 아니다. [코드리뷰](../review/V10_CODE_REVIEW_20260917_KO.md)
- [ ] 실제 프로젝트 의존성으로 프런트/백엔드 빌드·테스트를 통과한다.
- [ ] DB 권한/Data API, HTTP 인증, 이미지 사용 승인, 수집 재시도·중복 처리를 스테이징에서 확인한다.
- [ ] 서비스 담당자와 개발 담당자가 아래 핵심 사용자 흐름을 직접 확인한다.

| 담당 | 주로 준비할 것 | 완료 증거 |
|---|---|---|
| 서비스/프로젝트 담당 | 실제 공개 범위, 관리자 계정, 이미지 사용 근거, 배치 예산, 공개 검토 기준 | 승인 기록, 담당자·연락/장애 대응 책임 |
| 백엔드·DB 담당 | SQL, JDBC, RLS·권한, Kakao, R2, API, 로그·백업 | 스키마 점검 결과, 빌드 및 연동 로그 |
| 프런트 담당 | API 주소, Vercel 설정, 사용자/모바일 흐름 | 실제 배포 URL·브라우저 검증 결과 |
| 수집기 담당 | Python·Codex, 전용 계정·인증, 설정 파일, 스케줄러 | 실제 dry-run·수집 저장·정시 실행 로그 |

## 1. 계정·호스팅·도메인 준비

| 준비 대상 | 필수 범위 | 확인사항 |
|---|---|---|
| GitHub 또는 소스 관리 저장소 | 전체 소스 관리 | 새 브랜치·기존 변경 비교. `.git`을 ZIP으로 덮지 않음 |
| Supabase PostgreSQL | 모든 DB 기능 | 운영/스테이징, SQL 담당 권한, 실제 JDBC Connect 정보 |
| 백엔드 호스팅 | API·인증·DB·R2 | 제공 구성은 Render Docker. 다른 호스팅은 동일 실행/환경변수 계약으로 준비 |
| 프런트 호스팅 | 실제 사용자 화면 | 제공 구성은 Vercel SPA. `frontend`를 루트로 설정 |
| Kakao Developers 앱 | 로그인·예약·크리에이터·관리자 | REST API 키, Client Secret, 로그인 활성화, Redirect URI |
| Cloudflare R2 | 실제 이미지 파일 사용 | 버킷, 해당 버킷 읽기·쓰기 키, HTTPS 공개 이미지 주소 |
| 수집용 PC/서버 | CLI LLM 조사·배치 | 작업시간 전원/네트워크/실행 계정/인증/충분한 디스크 |
| Codex 사용 계정 또는 API 인증 | 실검색·이미지 분석 | 해당 실행 계정의 인증·모델 접근·사용 한도 |

공개 조회 자체는 로그인 없이 가능하지만 관리자 검토·공개에는 관리자 Kakao 로그인이 필요하다. 박람회·축제는 준비 화면이며 현재 자동 조사 대상은 서울 서브컬처다. 기존 예약·POS와 외부 정보 제공용 카탈로그는 서로 다른 영역이다.

- [ ] 프런트 URL, 백엔드 URL, 이미지 URL, 운영/스테이징 구분을 한 문서에 기록한다.
- [ ] HTTPS 도메인과 프록시/방화벽 경로를 확인한다. 이 문서가 실제 도메인을 발급하지 않는다.
- [ ] 실제 행사·상품을 가상 테스트/미리보기 데이터와 구분한다. `preview/`와 fixture를 서비스 초기 데이터로 넣지 않는다.

## 2. 실행 환경·버전

아래는 **소스가 선언한 값**이다. 모든 버전의 다운로드·호환성을 이 환경에서 확인한 것은 아니다.

| 구성 | 소스 기준 | 준비/확인 |
|---|---|---|
| Java | toolchain **21** | JDK21, `java -version`, `JAVA_HOME` |
| Gradle | Wrapper **9.5.1** | 별도 임의 Gradle 대신 `gradlew`/`gradlew.bat`; services.gradle.org 및 의존성 저장소 연결 |
| Spring Boot | **4.1.0** | `backend/build.gradle` 기준 전체 test/bootJar |
| Node | lockfile의 Vite 계열 engine **^20.19.0 또는 >=22.12.0** | 이 범위를 만족하는 배포 런타임과 실제 의존성 버전 확인 |
| 프런트 | React19.2.8 계열, Router8.3 계열, TS6.0 계열, Vite8.2 계열 | 정확한 해석은 package.json + pnpm-lock.yaml 기준 |
| pnpm | 명시 packageManager/버전 고정 없음 | 팀이 검증한 버전 기록, `--frozen-lockfile` 설치 성공 확인 |
| Python | **3.11 이상** | 별도 가상환경 |
| 수집기 패키지 | jsonschema>=4.23,<5; Pillow>=11,<13; Windows tzdata | requirements.txt 설치 후 `pip check`, 실제 설치 목록 기록 |
| Codex CLI | 버전 고정 없음 | `codex --version`, `codex exec --help`, 실제 웹 검색·이미지 입력 호환성 확인 |

- [ ] 설치 불가능/비호환 버전이 발견되면 원인을 확인하고 코드·lockfile과 함께 별도 변경 승인한다. 임의 하향 설치 결과를 원본 빌드 성공으로 보고하지 않는다.
- [ ] 실제 비밀 파일·node_modules·.venv·빌드 캐시는 Git에 넣지 않는다.
- [ ] 원본 514개 파일+문서 추가본인지 `REVIEW_SHA256SUMS.txt`와 패키지 보고서로 확인한다.

## 3. DB 준비

- [ ] [DB 체크리스트](V10_DATABASE_CHECKLIST_20260917_KO.md)를 따라 현재 DB에 필요한 SQL001~009를 확정한다.
- [ ] SQL003의 NOT VALID 제약과 과거 재고/금액 데이터를 점검한다.
- [ ] 새 수집/배치도 테이블까지 필요한 서버 권한을 확인한다.
- [ ] 기존 업무 테이블의 Data API 접근/RLS와 일반 역할 권한을 확인한다.
- [ ] `database/dev/001_seed_mock_data.sql`은 운영에서 실행하지 않는다. 가장 최근 사용자에 연결하는 개발용 데이터다.
- [ ] 운영 배포 환경에 `BOOTH_*_TEST_*` DB 변수를 설정하지 않는다. 일부 테스트는 테이블 또는 public 스키마를 삭제한다.

**v9에서 009까지 적용 완료한 환경은 v10 디자인 업데이트에 추가 SQL이 없다.** 최초 원본에서 올라오는 환경은 003~009 누적 적용과 백엔드·수집기 업데이트가 필요하다. 이번 문서 추가도 SQL 변경을 포함하지 않는다.

## 4. 환경변수 — 실제 소스 기준 전체 목록

### 백엔드에만 설정

| 변수 | 역할 | 필수 시점 / 주의 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL JDBC 주소 | 서버 시작. `jdbc:postgresql://...` 형식, 운영 SSL/실제 pooler 정보 확인 |
| `DATABASE_USERNAME` | DB 접속 사용자 | 서버 전용 계정 |
| `DATABASE_PASSWORD` | DB 비밀번호 | 서버 비밀 저장소, Git/화면/CLI LLM에 전달 금지 |
| `FRONTEND_URL` | 로그인 성공 후 복귀 주소 | 스테이징/운영의 실제 origin. 경로·끝 슬래시 설정 검토 |
| `ALLOWED_ORIGINS` | credentials API CORS 허용 프런트 | 쉼표 구분 정확한 origin. wildcard로 열지 않음 |
| `KAKAO_CLIENT_ID` | REST API 앱 키 | JavaScript 키와 혼동 금지 |
| `KAKAO_CLIENT_SECRET` | OAuth Client Secret | 앱에서 활성화한 값과 일치 |
| `ADMIN_KAKAO_SUBJECTS` | 관리자 Kakao 사용자 subject 목록 | 쉼표 구분. app_user.id가 아니라 kakao_subject |
| `R2_ACCOUNT_ID` | R2 계정 | 이미지 저장 사용 시 |
| `R2_ACCESS_KEY_ID` | R2 S3 호환 Access Key | 해당 버킷 최소 권한 |
| `R2_SECRET_ACCESS_KEY` | R2 Secret | 서버에만 |
| `R2_BUCKET` | 버킷명 | URL이 아니라 실제 버킷명 |
| `R2_PUBLIC_URL` | 이미지 제공 HTTPS base URL | 저장 key 뒤에 붙여 사용하는 공개 주소 |
| `SESSION_COOKIE_SECURE` | 세션/CSRF 쿠키 Secure | 로컬 HTTP false; 배포 HTTPS true |
| `SESSION_COOKIE_SAME_SITE` | 쿠키 SameSite | 로컬 lax. 서로 다른 사이트의 프런트/API는 현재 안내대로 none + Secure |
| `UPLOAD_MAX_PER_HOUR` | 사용자당 새 업로드 티켓 한도 | 기본20, 양수 |
| `UPLOAD_MAX_BYTES_PER_DAY` | 사용자당 최근24h 선언 크기 한도 | 기본104857600(100MiB), 최소10MiB |
| `BOOTH_COLLECTOR_TOKEN` | 서버 간 수집 전용 토큰 | 32자 이상 임의 값, 수집 PC와 동일. ADMIN 권한 대체 아님 |

`ADMIN_KAKAO_SUBJECT` 단수형은 호환 fallback이다. 새 설정에는 복수형을 사용하고 상충하는 값을 함께 두지 않는다. `render.yaml`에는 쿠키 두 변수만 있으므로 나머지 값을 자동으로 넣어준다고 생각하면 안 된다.

### 프런트

| 변수 | 역할 |
|---|---|
| `VITE_API_BASE_URL` | 백엔드 HTTPS 주소. 개발 기본은 http://localhost:8080 |

프런트 빌드에 들어가는 값은 브라우저에서 노출될 수 있으므로 DB/R2/Codex/수집 토큰을 `VITE_*`로 만들지 않는다. API 주소가 변경되면 프런트를 다시 빌드한다.

### 수집 실행 계정

- [ ] `BOOTH_COLLECTOR_TOKEN`: 백엔드와 같은 값. 설정 JSON 대신 실행 계정 환경변수/보호된 환경파일에 저장.
- [ ] 전용 `codexHome`의 파일 기반 인증 또는 지원되는 `CODEX_API_KEY` 방식 중 하나를 준비.
- [ ] `collector/config.local.json`: 실제 apiBaseUrl, codexExecutable, codexHome, stateDirectory, 예산, imageAllowedHosts 설정.
- [ ] 수집 프로세스가 쓰는 사용자 HOME·작업 디렉터리·파일 권한이 예약 실행에서도 동일한지 확인.

**Python 실행기는 DB/R2/수집 비밀값을 조사 LLM 프로세스에 넘기지 않고, 결과 JSON을 받아 별도 백엔드 API에 전달하도록 구현되어 있다.** 이 격리 구조와 실제 설치된 CLI의 설정 호환성을 스테이징에서 검증한다.

## 5. Kakao 로그인·관리자 준비

- [ ] Kakao 앱에서 로그인 활성화, 필요한 닉네임 동의항목 및 개발 테스트 사용자 정책을 확인한다.
- [ ] 개발 Redirect URI: `http://localhost:8080/login/oauth2/code/kakao`.
- [ ] 배포 Redirect URI: **백엔드 HTTPS origin** 뒤에 `/login/oauth2/code/kakao`. 프런트 Vercel 주소를 callback으로 넣지 않는다.
- [ ] 앱에 등록한 URI와 실제 OAuth 요청 URI의 scheme/host/port/path가 정확히 일치하는지 확인한다.
- [ ] 프록시 뒤의 서버가 올바른 외부 HTTPS 주소를 인식하는지 확인한다. 소스는 `forward-headers-strategy: framework`이다.
- [ ] 관리자 계정으로 한 번 로그인하여 `app_user`를 생성한다.
- [ ] SQL에서 해당 계정의 `kakao_subject`를 확인하고 `ADMIN_KAKAO_SUBJECTS`에 설정한다.
- [ ] 서버 재시작/재배포 후 로그아웃·재로그인하고 `/api/me` permissions에 ADMIN이 있는지 확인한다.
- [ ] 일반 로그인 계정의 FAN/CREATOR 기능과, ADMIN 없는 계정의 관리자 접근 거부를 함께 확인한다.

공식 외부 확인: [Kakao 로그인 사전 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite). 실제 사용자 Kakao 앱 설정을 이번에 조회하거나 변경하지 않았다.

### 쿠키·CORS 실검증

- [ ] 로컬5173/운영Vercel/custom domain/필요한 preview origin을 정확하게 관리한다.
- [ ] GET/POST/PATCH/DELETE/**PUT** 및 CSRF 헤더가 동작한다. 대표 배너 선택은 PUT이다.
- [ ] 401은 미인증, 403은 권한 또는 명시 CSRF 오류로 구분되는지 확인한다.
- [ ] HTTPS cross-site 배포의 Secure+SameSite=None을 세션과 CSRF 모두에 적용한다.
- [ ] 설정만으로 모든 브라우저 쿠키 정책을 해결했다고 가정하지 않고 실제 대상 브라우저에서 로그인→새로고침→저장→로그아웃을 검사한다.

## 6. R2·이미지 저장 준비

- [ ] 스테이징용 버킷/키와 운영용 버킷/키를 분리한다.
- [ ] 서버가 해당 버킷에 PUT/HEAD 등 필요한 읽기·쓰기 작업을 할 수 있는지 확인한다.
- [ ] `R2_PUBLIC_URL`로 정상 이미지 GET이 가능한지 확인한다. 생산용 전달 주소와 개발용 주소를 혼동하지 않는다.
- [ ] 외부 수집 이미지의 사용 근거·출처 표기 담당자를 정한다.
- [ ] 관리자 승인 후 수집기 `imageAllowedHosts`에 실제 이미지/CDN 호스트를 등록한다. 원문 사이트 호스트와 이미지 호스트는 다를 수 있다.
- [ ] redirects의 최종 목적지도 좁은 허용 목록으로 관리한다. 사설IP/로컬URL 차단을 편의상 해제하지 않는다.
- [ ] 배치도는 원본 저장뿐 아니라 변환·분석의 허용 근거도 확인한다.

현재 v10의 크리에이터 업로드는 `/api/creator/uploads/tickets → /{id}/content → /{id}/complete`이며 **브라우저 → 백엔드 검증 → R2**이다. 과거 `/presign`과 `/complete` 구형 API는 410을 반환한다. 옛 프런트와 혼용하지 않는다. **현재 경로에 브라우저 R2 직접 PUT CORS를 필수 준비사항으로 요구하지 않는다.**

서버의 일반 업로드는 실제 bytes·MIME·헤더·해시 및 최대10MiB를 검증한다. 지도 입력은 10MiB/2,500만 화소 등의 추가 규칙이 있다. raw body이므로 Spring multipart 설정만 바꾸어 제한했다고 생각하면 안 된다. 프록시의 요청 크기·읽기 제한시간·동시 연결·요청 빈도 정책도 필요하다.

**R2 운영 추가 주의:** 소스는 이미지에 장기 immutable cache를 설정한다. 앱에서 사용 승인을 철회해 목록에서 사라지는 것과 이미 알려진 공개 이미지 URL을 차단하는 것은 다르다. 긴급 회수 시 원본 객체 접근 및 CDN 캐시 처리 절차를 별도로 준비한다. 미사용 객체 자동 정리는 구현되어 있지 않으므로 사용중인 key·권한/완료 기록을 확인한 뒤 계획한다.

외부 확인: [Cloudflare public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)에서 `r2.dev`는 개발 용도이며 운영은 custom domain을 안내한다. 실제 계정의 요금·한도·도메인 설정은 여기서 확인하지 않았다.

## 7. 로컬 실행 및 전체 빌드

### 프런트 (저장소 루트에서)

```powershell
cd frontend
Copy-Item .env.example .env  # 기존 .env가 없을 때만. 실제 API 주소를 입력한다.
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm dev
```

- [ ] root를 혼동하지 않는다. 프런트 package.json은 frontend 안에 있다.
- [ ] 기본 개발 origin은 http://localhost:5173이며 변경 시 ALLOWED_ORIGINS도 맞춘다.
- [ ] `preview/v10/index.html`은 디자인 시안이다. 이 파일이 열렸다는 것으로 API/라우터/로그인이 동작했다고 판단하지 않는다.

### 백엔드 (별도 터미널)

```powershell
cd backend
Copy-Item .env.example .env  # 기존 파일이 없을 때만
# .env에 실제 로컬/스테이징 값을 넣고 SQL을 먼저 적용한다.
.\run-dev.ps1
```

`run-dev.ps1`은 backend/.env를 현재 프로세스에 읽고 Gradle bootRun을 실행한다. Spring 자체가 이 .env를 자동으로 읽는 구성이 아니다. Linux/호스팅에서는 환경변수를 명시적으로 전달해야 한다.

```powershell
# 의존성 설치 가능한 환경에서 전체 코드 검증
.\gradlew.bat test
.\gradlew.bat bootJar
# Linux: sh gradlew test --no-daemon && sh gradlew bootJar --no-daemon
```

- [ ] Test DB opt-in 환경변수가 설정되어 있지 않거나, 빈 전용 로컬 테스트 DB만 가리키는지 먼저 확인한다.
- [ ] 이 문서의 새 재현 테스트는 현재 오류가 존재함을 확인하는 테스트다. 기존 제품 회귀 테스트의 성공과 구분한다.
- [ ] 빌드 실패 원인을 확보하고 임시 외부 type stub을 제품 빌드에 넣어 통과시키지 않는다.

## 8. Vercel·Render 배포

### Vercel

- [ ] Root Directory=`frontend`, 실제 검증된 Node/pnpm 버전, Build=`pnpm build`, Output=`dist`.
- [ ] `VITE_API_BASE_URL`을 실제 배포 백엔드로 설정한 뒤 빌드.
- [ ] `frontend/vercel.json`의 SPA rewrite를 반영해 `/discover/실제ID`, `/admin/subculture`, 부스 공유 URL을 직접 열고 새로고침한다.
- [ ] preview와 production 환경변수/허용 origin을 구분한다.

### Render 또는 동일 역할의 백엔드

- [ ] `render.yaml`의 Docker rootDir=`backend`, Dockerfile=`./Dockerfile`와 실제 서비스 구성이 일치한다.
- [ ] Java21 이미지 빌드와 Gradle 의존성 다운로드가 가능하다.
- [ ] YAML에 없는 DB·Kakao·R2·collector 환경변수를 따로 등록한다.
- [ ] DB 연결 네트워크·SSL·JDBC 계정 권한을 확인한다.
- [ ] 재시작/인스턴스 변경 시 로그인 세션의 운영 정책을 확인한다. 현재 소스에는 공유 세션 저장소 구성이 없다. 여러 인스턴스가 필요하면 별도 검증·설계가 필요하다.
- [ ] 기본 `/api/public/events` health check 외에 아래 카탈로그/배치도 smoke를 수행한다.

공개 조회 예시(아래 api.example.com은 자리표시자다):

```powershell
curl.exe -fsS "https://api.example.com/api/public/events"
curl.exe -fsS "https://api.example.com/api/public/catalog/events?page=0&size=1"
# 실재하며 승인 공개된 행사 ID로 바꾼다. 없는 ID의 404를 기능 실패로 판단하지 않는다.
curl.exe -fsS "https://api.example.com/api/public/catalog/events/실제ID"
curl.exe -fsS "https://api.example.com/api/public/catalog/events/실제ID/floorplans"
```

- [ ] 운영에서 테스트 행사 생성/삭제를 smoke 목적으로 자동 실행하지 않는다. 테스트 쓰기는 스테이징에만 한다.
- [ ] 배포 전후 오류율·응답·기능 검증 로그를 남긴다. 원인 미기록 오류 처리(R10-03)를 보완한다.

## 9. Codex CLI 수집기 준비

### 구조 확인

```text
Python 실행기 → Codex CLI LLM 조사/이미지 해석 → JSON
             → Python 검증/중복 실행 관리/API 전송
             → 백엔드 DB/R2 저장 → 관리자 검토/공개
```

- [ ] Python이 직접 행사 내용을 대신 추론하거나 DB 비밀번호를 LLM에 전달하는 구조로 바꾸지 않는다.
- [ ] 채팅에서 좋은 결과가 나왔더라도 CLI의 실제 모델·웹 검색·이미지 입력·출처 기록·한도를 별도로 검증한다.
- [ ] `codex exec`의 비대화형 실행과 `--output-schema`, `--output-last-message`, `--image`, `--ephemeral` 등 **실제 소스가 사용하는 옵션**을 설치 버전에서 확인한다.
- [ ] 공식 문서의 지원 설명과 이 프로젝트의 실제 계정/프롬프트 실행 성공을 구분한다. [비대화형 실행](https://developers.openai.com/codex/noninteractive/), [인증](https://developers.openai.com/codex/auth/).

### Windows 초기 준비

```powershell
cd collector
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
Copy-Item config.example.json config.local.json  # 처음 준비할 때만
codex --version
codex exec --help

# 독립 수집 계정/전용 폴더를 권장한다.
$env:CODEX_HOME = "$env:USERPROFILE\.boothhana-codex"
codex -c cli_auth_credentials_store='"file"' login
```

`config.local.json`의 codexHome에 전용 절대 경로, codexExecutable에 필요 시 실행 파일 절대 경로를 넣는다. 이 실행기는 auth.json 파일을 격리 복사/갱신하는 방식이므로 keyring에만 저장된 로그인은 그대로 사용할 수 없다. 실제 개인 인증파일은 ZIP/Git/결과 로그에 넣지 않는다.

`CODEX_API_KEY`를 사용하는 경우 해당 인증이 설치 CLI에서 동작하는지 확인한다. ChatGPT 로그인 방식과 API 키의 과금·한도를 같다고 가정하지 않는다. 사용자가 API 키를 쓰도록 강제하거나 구독 사용을 보장하는 문서가 아니다.

### config.local.json에서 반드시 검토할 값

| 키 | 기본 | 의미 / 결정할 것 |
|---|---:|---|
| apiBaseUrl | localhost:8080 | 실제 HTTPS 백엔드, 로컬 개발만 HTTP |
| tokenEnv | BOOTH_COLLECTOR_TOKEN | 실행 계정 환경변수명 |
| stateDirectory | ~/.boothhana-collector | 로그·체크포인트·인증이 아닌 실행 상태. 재배포에도 보존 |
| codexExecutable / codexHome / model | codex / null / null | 전용 실행 경로·인증폴더·검증한 모델 |
| timeoutSeconds / httpTimeoutSeconds | 900 / 45 | CLI 작업/HTTP 단건 제한 |
| maxEvents / maxParticipantPages / maxSales | 50 / 10 / 100 | 전체를 무제한 조사하는 설정이 아님 |
| maxCliCalls / maxRuntimeMinutes | 160 / 240 | 주간 조사 예산 |
| maxImages / downloadApprovedImages | 100 / true | 승인 이미지 대상. 권한/호스트 없으면 저장 안 됨 |
| imageAllowedHosts | **[]** | 비어 있으면 이미지 파일 다운로드 불가. 실제 승인된 CDN 호스트만 |
| blockedSourceHosts | witchform.com | 현재 차단 목록. 원문 수집 허용 범위 확인 없이 제거 금지 |
| floorplanMaxEvents / floorplanMaxSources / floorplanMaxTiles | 30 / 10 / 40 | 배치도별 탐색·분석 한도 |
| floorplanMaxCliCalls / floorplanMaxMinutes | 100 / 180 | 배치도 작업 별도 예산 |

주간4시간+배치도3시간은 설정된 예산이지 실제 소요시간 보장이 아니다. 전체 최초 실행은 스테이징에서 작은 예산으로 비용·오류를 먼저 확인한다.

### 안전한 순서로 첫 실행

```powershell
# 가상 fixture만: CLI/인터넷/실제 DB 저장 없이 검증
.\.venv\Scripts\python.exe weekly.py --month 2026-10 --dry-run --fixtures examples/v5
.\.venv\Scripts\python.exe floorplans.py --dry-run --fixtures examples/floorplan-v8

# 실제 CLI 행사/참가/판매 조사. DB 저장만 생략하므로 사용량이 발생할 수 있음.
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10 --dry-run

# 실제 조사 + 스테이징 DB 저장. apiBaseUrl이 스테이징인지 먼저 확인.
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10

# DB에 있는 행사 대상으로 실제 배치도 탐색/허용된 원본 처리
.\.venv\Scripts\python.exe floorplans.py --config config.local.json
```

날짜 예시는 2026-10월이다. 실제 실행 목적에 맞게 바꾼다. `floorplans.py --dry-run`만 실행하면 실제 대상으로 조사하지 않으며, 실제 탐색 dry-run에는 소스가 지원하는 `--event-file`이 필요하다. 아무 작업 없이 종료한 dry-run을 실제 이미지 분석 성공으로 기록하지 않는다.

- [ ] fixture는 가상임을 유지하고 실제 DB 전송에 사용하지 않는다.
- [ ] 모델 결과에 공식 원문 URL·회차·실제 개최일·휴무일·부스번호 근거가 있는지 표본 검토한다.
- [ ] 같은 payload 재전송, 서버 거절, PARTIAL, 대상 없음, 권한 없음, 예산 소진을 구분한다.
- [ ] phase가 실패해도 이미 저장된 정상 결과가 보존되는지 확인한다.
- [ ] weekly-v5 / floorplans-v8 상태 폴더를 보존한다. 구버전의 체크포인트를 강제로 재개하지 않는다.

## 10. 일요일 배치와 배치도 보완 스케줄

| 작업 | 현재 소스의 일정 | 실제 실행 파일 |
|---|---|---|
| 전체 행사→참가자→판매정보→배치도 | 일요일 **03:00 Asia/Seoul** | `run_scheduled.py` → weekly.py --scheduled → floorplans.py |
| 임박/진행 행사 배치도 보완 | 월~토 **04:00 Asia/Seoul** | `floorplans.py --imminent` |

관리자 버튼이 사용자의 PC를 원격으로 켜거나 터미널을 여는 구조가 아니다. 예약 설치는 사용 환경에서 수행해야 한다.

### Windows 방식

- [ ] 실행 PC 전원·절전·배터리 정책과 네트워크를 확인한다.
- [ ] Windows 시간대는 `Korea Standard Time`, 제공 작업은 **로그인된 실행 계정(Interactive)**을 사용한다.
- [ ] 해당 계정의 새 예약 세션에서도 토큰·Codex 실행 파일·인증폴더를 읽을 수 있다. 현재 PowerShell의 `$env:`만 설정했다고 미래 작업에 유지된다고 가정하지 않는다.
- [ ] PowerShell 서명/실행 정책을 확인한다. 조직 정책을 임의로 해제하지 않는다.
- [ ] 구형 매일 수집 작업이나 중복 작업을 확인해 중지한다. 제공 등록 스크립트는 기존 이름을 자동 덮어쓰지 않는다.

```powershell
# collector 폴더. 실제 작업을 설치하는 명령이므로 설정 확인 후 실행.
.\register-task.ps1
.\register-floorplan-task.ps1

# 등록·최근 실행 조회
Get-ScheduledTask -TaskName 'BoothHana Weekly Subculture Catalogue','BoothHana Daily Floorplan Check'
Get-ScheduledTaskInfo -TaskName 'BoothHana Weekly Subculture Catalogue'
Get-ScheduledTaskInfo -TaskName 'BoothHana Daily Floorplan Check'
```

무로그인·항상 실행이 필요하면 현재 Interactive 설정을 그대로 사용하지 말고 별도 서비스 계정/실행 방식과 인증을 설계·검증한다.

### Linux systemd 방식

- [ ] 전용 `boothhana` 계정, `/opt/boothhana/collector`, `.venv`, 보호된 stateDirectory를 준비한다.
- [ ] 템플릿의 절대 경로를 실제 배포 위치와 맞춘다. 서비스는 대화형 셸 PATH/환경설정을 자동 읽지 않는다.
- [ ] `/etc/boothhana/collector.env`를 보호하고 mode600, 읽기 권한을 확인한다. 서비스 매니저가 이 파일을 읽고 사용자로 전환한다.
- [ ] 실행 계정으로 Codex 인증·쓰기 경로를 검증한다.

```bash
# 저장소 루트에서. 계정/경로/환경파일을 준비한 뒤 실행한다.
sudo cp collector/systemd/boothhana-weekly.service collector/systemd/boothhana-weekly.timer /etc/systemd/system/
sudo cp collector/systemd/boothhana-floorplans.service collector/systemd/boothhana-floorplans.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boothhana-weekly.timer boothhana-floorplans.timer
systemctl list-timers 'boothhana-*'
journalctl -u boothhana-weekly.service
journalctl -u boothhana-floorplans.service
```

타이머에 Asia/Seoul이 명시되어 있다. `Persistent=true`이므로 미실행 작업이 복구 시 실행될 수 있다. **SuccessExitStatus=2는 부분 수집도 서비스 종료로 인정하는 설정이지 전수/정상 수집 완료라는 뜻이 아니다.**

## 11. 수집에서 실제 공개까지

- [ ] `/admin/subculture`에서 행사·참가 부스·판매정보의 원문과 현재 값·관리자 수정값을 확인한다.
- [ ] 미발견/부분 수집을 전체 없음/전수 완료로 표시하지 않는지 확인한다.
- [ ] 현재 행사 판매, 상시·과거 상품, 품절·취소·미확인 상태를 구분한다.
- [ ] ‘검토 완료’와 ‘공개’는 별개다. 검토된 카탈로그를 발행한 뒤 `/discover`와 `/`에서 확인한다.
- [ ] 대표 배너는 사용 승인·저장 완료 후 별도 선택한다. 공개 중인 행사는 선택 변경이 다음 조회에 반영된다.
- [ ] 이미지 승인과 외부 호스트 허용 후 다음 배치에서 저장되는지 확인한다.
- [ ] 배치도 사용/변환 승인 → 원본 저장 → CLI 분석 → 날짜·홀·번호 매핑 → 위치 검토 → 지도 공개를 확인한다.
- [ ] 도면이 늦게 공개되거나 같은 URL 이미지가 바뀌면 재탐색/새 버전으로 처리되는지 확인한다.
- [ ] 참가 명단/날짜가 바뀐 오래된 위치 연결은 계속 최신처럼 보여주지 않는지 확인한다.

PDF 배치도는 현재 링크 안내만 제공한다. 이미지 입력이 가능하다는 것만으로 실제 도면의 좌표·부스 전수 인식이 정확하다고 가정하지 않는다. 행사 공개와 지도 공개가 모두 필요한 상태를 운영자가 이해하도록 한다.

## 12. 스테이징 수락 기준 — 확인 결과를 남긴다

| 영역 | 반드시 확인할 사례 | 통과 기준 |
|---|---|---|
| 빌드 | 실제 lockfile·Java21 전체 build/test | 외부 stub 아닌 프로젝트 빌드 통과 |
| 로그인 | 비로그인·일반·ADMIN, 새로고침·로그아웃 | 올바른 접근·쿠키·CSRF |
| DB | 001~009, RLS·서버권한·일반role | 신규/기존 API 작동, 비공개 데이터 직접 접근 불가 |
| 공개 상태 | 취소·연기·일정변경 행사 검토→공개 | R10-01 수정 후 원문·상태 보존, 기존 스냅샷 점검 |
| 예약/재고 | 마지막 재고 동시예약, 취소/수령 경쟁, 오래된 편집 | 초과 차감·중복 복구·덮어쓰기 방지 |
| POS | 판매·취소 | 기존 수동 재고 조정 정책 유지 |
| 수집 | 동일배치 재전송,25페이지 명단,미발견100개 | 중복 없음,이어가기·대상 순환 |
| 상품 | 20개 확보→이번2개 부분확인 | 기존 상품 보존·재확인 표시 |
| 이미지 | 실패/재시도/크기초과/권한철회 | 잘못된 파일 거부,상태 구분 |
| 지도 | 동일번호 다른날/홀,반부스,수정도면,미연결 | 근거 없는 연결 없음,버전 일치 |
| 방문 UX | 날짜·홀·검색→지도→판매→복귀·공유 | 맥락 보존,실물 모바일 조작 가능 |
| 운영자 | 일반폼 수정/최신 수집값 복귀/미저장 이탈 | 수동값만 고정,공개 승인 명확 |
| 배치 | 실제 예약시간·실행계정·사용한도 실패 | 실제 실행 기록,실패/부분 알림 |

- [ ] 확인한 브라우저/운영체제/화면폭/릴리스 버전/검증자/증거를 기록한다.
- [ ] 미완료 항목은 미완료로 남긴다. 체크리스트 작성 자체가 통과 증거가 아니다.

## 13. 운영·장애·롤백 준비

- [ ] 첫 정기 실행을 실제 확인하고 `pipeline.json`, 단계 receipt, 검증 제외 이유, CLI 오류를 점검한다.
- [ ] 종료코드 **0 정상 종료 / 2 부분·예산·단계 문제 / 1 설정·치명 오류**를 구분한다. 0도 정보 전수·정확성 보장이 아니다.
- [ ] DB 전송 실패 시 로컬 로그만 남을 수 있으므로 서버 대시보드만 보지 않는다.
- [ ] 사용량·시간·실패율·이미지 저장량·DB/디스크/연결 수·백업 상태에 대한 운영 확인 담당자를 정한다. 비용 수치는 실측·요금제 확인 후 산정한다.
- [ ] 예외 로그에 토큰·인증파일·원본 개인 연락처가 노출되지 않도록 제한한다.
- [ ] Codex 인증 만료/키 교체, R2 키 교체, 수집 토큰 교체를 실행 계정·백엔드 모두에 동기화한다.
- [ ] 배치 스케줄 중지, 잘못된 공개본 비공개 처리, 이전 소스/DB 복원 절차를 준비한다.
- [ ] 공개 이미지 회수는 API 응답 제거 외에도 R2·캐시 정책을 함께 처리한다.
- [ ] 오래된 원문·체크포인트·미사용 이미지·임대/실행 이력의 보존·정리 기준을 정한다. 원본 key·매핑 버전·권한 기록을 임의 삭제하지 않는다.

## 14. 남겨 둘 설치 기록

| 항목 | 실제 확인값/증거 |
|---|---|
| 소스 버전·SHA/커밋 | |
| 운영/스테이징 프런트 URL | |
| 운영/스테이징 API URL | |
| DB 식별정보(비밀번호 제외) | |
| 최종 SQL 파일·적용시간·담당자 | |
| DB 권한/Data API 점검 | |
| Java/Node/pnpm/Python/Codex 버전 | |
| 관리자 로그인 검증 | |
| R2 읽기·쓰기·승인·호스트 허용 검증 | |
| 실제 CLI 검색·지도 인식 표본 | |
| 정기작업 설치·최초실행 결과 | |
| 공개 전 수락 기준의 미해결 항목 | |
| 장애/백업/복구 담당자 | |

## 15. 이 문서의 근거

우선 기준은 실제 v10의 `application.yml`, `.env.example`, `build.gradle`, `package.json`, lockfile, `database/001~009`, `UploadController`, `SecurityConfig/CollectionSecurity`, `collector/config.example.json`, `run_scheduled.py`, `register-*.ps1`, `systemd/*`다. 과거 README의 옛 프로토콜을 현재 실행 방식으로 재해석하지 않았다.

공식 서비스 문서는 계정·호스팅 설정을 보완하는 용도로만 사용했다. 링크가 해당 계정의 설정 완료를 보증하지 않는다. 실제 연결·요금·정책 변경 여부는 배포 시 다시 확인한다.

- [Supabase 연결](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase 데이터 보호](https://supabase.com/docs/guides/database/secure-data), [Data API 보안](https://supabase.com/docs/guides/api/securing-your-api)
- [Kakao 로그인 사전 준비](https://developers.kakao.com/docs/ko/kakaologin/prerequisite)
- [R2 공개 이미지 제공](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Codex 비대화형 실행](https://developers.openai.com/codex/noninteractive/), [Codex 인증](https://developers.openai.com/codex/auth/)

[코드리뷰](../review/V10_CODE_REVIEW_20260917_KO.md) · [DB 상세](V10_DATABASE_CHECKLIST_20260917_KO.md) · [이번 검증 결과](../review/V10_REVIEW_VALIDATION_20260917_KO.md)
