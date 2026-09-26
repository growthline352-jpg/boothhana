# GitHub · Vercel · Render · Supabase · GCS 운영 배포

상태: **코드 준비 작업본 / 실제 클라우드 생성·실연동·운영 승인 전**

## 목표 구성

- GitHub 비공개 저장소: 단일 소스 원본
- Vercel: `frontend/` React 애플리케이션과 SEO 함수
- Render: `backend/` Spring Boot Docker 서비스
- Supabase: PostgreSQL, SQL001~016 적용
- Google Cloud Storage: 공개 이미지 버킷과 비공개 문의 첨부 버킷
- Kakao Developers: 운영 OAuth 애플리케이션

프런트에는 DB 비밀번호나 Google 자격증명을 넣지 않는다. 브라우저 업로드는 백엔드가 크기, MIME 헤더와 SHA-256을 검증한 후 GCS에 기록한다.

## 1. GitHub

1. 비공개 저장소를 만든다.
2. 현재 로컬 `main` 브랜치에 원격 `origin`을 추가한다.
3. 비밀 파일이 추적되지 않는지 `git status`와 `.gitignore`를 확인한다.
4. 기준 브랜치 보호에서 GitHub Actions의 `release-verification` 성공을 병합 조건으로 설정한다.

## 2. Google Cloud Storage

1. 결제가 연결된 Google Cloud 프로젝트를 준비하고 Cloud Storage API를 활성화한다.
2. 공개 이미지용 버킷과 비공개 문의 첨부용 버킷을 **서로 다른 이름**으로 만든다.
3. 두 버킷 모두 균일한 버킷 수준 액세스를 사용한다.
4. Render 백엔드 전용 서비스 계정을 만들고 두 버킷에 필요한 객체 권한만 부여한다.
5. 공개 버킷만 공개 읽기 또는 별도 CDN 읽기 경로를 구성한다. 비공개 버킷에는 공개 주체를 추가하지 않는다.
6. 오프라인 저장 기능이 공개 이미지를 `fetch`할 수 있도록 공개 버킷 CORS에 실제 Vercel 운영 origin의 `GET`, `HEAD`만 허용한다.
7. 예산과 사용량 알림을 만든다.

Render가 Google Cloud 외부에서 실행되므로 장기적으로는 Workload Identity Federation이 우선이다. 첫 배포에서 서비스 계정 키를 사용한다면 Render Secret File `gcs-service-account.json`으로만 저장하고 저장소·환경변수 값·프런트 번들에는 넣지 않는다.

## 3. Supabase PostgreSQL

1. 운영 프로젝트를 만들고 백업·2FA·Security Advisor를 확인한다.
2. 운영 DB와 분리된 빈 테스트 DB에 SQL001~016 및 release gate를 먼저 실행한다.
3. 성공 후 운영 DB에 SQL001부터 순서대로 적용한다.
4. 백엔드 전용 DB 역할, RLS, `anon`/`authenticated` 직접 권한 차단을 확인한다.
5. Render에는 JDBC 형식의 TLS 연결 문자열과 사용자·비밀번호를 따로 설정한다.

## 4. Vercel 프런트엔드

GitHub 저장소를 Import하고 Root Directory를 `frontend`로 지정한다. `vercel.json`의 빌드 설정을 사용한다.

운영 환경변수:

```dotenv
VITE_API_BASE_URL=https://API_HOST
VITE_PUBLIC_SITE_URL=https://FRONTEND_HOST
PUBLIC_SITE_URL=https://FRONTEND_HOST
SEO_API_BASE_URL=https://API_HOST
```

처음에는 임시 API 주소로 프로젝트 URL을 확보한 뒤, Render API 주소가 생성되면 네 값을 확정하고 Production을 다시 배포한다.

## 5. Render 백엔드

루트 `render.yaml`로 Blueprint를 만들고 싱가포르 리전에 배포한다. Dashboard에서 `sync: false` 값을 입력한다.

필수 환경변수:

```dotenv
DATABASE_URL=jdbc:postgresql://DB_HOST:5432/DB_NAME?sslmode=require
DATABASE_USERNAME=...
DATABASE_PASSWORD=...
FRONTEND_URL=https://FRONTEND_HOST
ALLOWED_ORIGINS=https://FRONTEND_HOST
KAKAO_CLIENT_ID=...
KAKAO_CLIENT_SECRET=...
ADMIN_KAKAO_SUBJECTS=...
GCS_PROJECT_ID=...
GCS_PUBLIC_BUCKET=...
GCS_PRIVATE_BUCKET=...
GCS_PUBLIC_URL=https://storage.googleapis.com/GCS_PUBLIC_BUCKET
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gcs-service-account.json
BOOTH_COLLECTOR_TOKEN=32자 이상의 무작위 비밀값
```

Render의 Secret Files에 서비스 계정 JSON을 `gcs-service-account.json`이라는 이름으로 추가한다. 공개 URL 끝에는 `/`를 붙이지 않는다.

## 6. Kakao OAuth

운영 Redirect URI에 다음 주소를 정확히 등록한다.

```text
https://API_HOST/login/oauth2/code/kakao
```

Vercel 운영 도메인과 Render API 도메인을 확정한 후 카카오 로그인, 로그아웃, 세션 쿠키, CSRF 요청을 실제 브라우저에서 확인한다.

## 7. 공개 전 필수 확인

- GitHub Actions release gate 성공
- Vercel production build 성공 및 `/`, `/discover`, `/offline/` 확인
- Render 최신 deploy가 live이고 `/api/public/health/live`와 `/ready`가 200
- 운영 DB가 SQL001~016, 43테이블·397컬럼 계약과 RLS 검사를 통과
- 카카오 로그인 후 `/api/me`, 관리자/크리에이터 권한 확인
- 실제 PNG/JPEG/WebP 업로드, GCS 메타데이터 `sha256`, 공개 이미지 표시 확인
- 비공개 문의 첨부가 공개 URL로 접근되지 않고 권한 있는 API 다운로드만 가능한지 확인
- 모바일 Safari와 Chrome에서 예약·POS·오프라인 다운로드 확인
- 로그에 DB 비밀번호, 카카오 secret, Google 서비스 계정 JSON이 출력되지 않는지 확인

하나라도 실패하면 DNS나 운영 도메인을 공개 전환하지 않는다.

## 8. 현재 로컬 검증 결과

2026-09-26 기준으로 다음 검증을 통과했다.

- 프런트엔드 `pnpm lint`, `pnpm build`, `pnpm build:hosting`
- 백엔드 `gradlew.bat test bootJar --no-daemon` (Java 21)
- 수집기 Python 단위 테스트 170개
- `render.yaml` 공식 Blueprint JSON Schema 검증
- Git 변경분 공백 오류 및 대표적인 비밀키 패턴 검사

운영 Supabase 데이터베이스, 실제 GCS 버킷, Kakao OAuth, Vercel·Render 배포와 브라우저 수락검사는 계정 리소스가 연결된 뒤 별도로 수행해야 한다.
