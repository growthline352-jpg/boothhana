> **2026-09-21 · 이미지 저장 운영 방향**  
> 사용자가 Google Cloud 신규 가입 크레딧 수령 가능을 확인했습니다. 목표는 GCS 이미지 저장이며, [운영 결정 및 미실행 체크리스트](../docs/deployment/GCP_FREE_TRIAL_KO.md)를 먼저 확인하세요. **이 코드와 `.env.example`은 아직 R2용**입니다. GCS SDK·인증·저장·공개 URL 연결은 추가 구현이 필요하며, Google 자격증명을 `R2_*` 값에 넣는 것만으로 전환되지 않습니다. 아래의 기존 R2 설명은 목표 구성이 아니라 현재 구현을 설명합니다. `R2UploadService`의 실제 업로드 흐름은 서버 경유 검증 방식이므로 과거 서명 URL 표현보다 현재 Controller/구현을 우선 확인하세요.

# BoothHana2 backend

BoothHana2의 카카오 로그인, 팬·크리에이터·관리자 API, Supabase PostgreSQL 저장과 Cloudflare R2 업로드 서명을 제공하는 Spring Boot 애플리케이션입니다. 전체 로컬 설정 순서는 [루트 README](../README.md)를 확인합니다.

## Requirements

- Java 21
- 개발용 Supabase 프로젝트와 PostgreSQL 연결 정보
- 개발용 Kakao Developers 앱
- 이미지 업로드를 확인할 경우 Cloudflare R2 버킷과 API 토큰

## Environment

`backend/.env.example`을 `backend/.env`로 복사하고 개발용 값을 입력합니다. Spring Boot는 `.env`를 직접 읽지 않으므로 로컬에서는 `run-dev.ps1`을 사용합니다.

```powershell
cd backend
.\run-dev.ps1
```

서버는 기본적으로 `http://localhost:8080`에서 실행됩니다. 카카오 Redirect URI는 `http://localhost:8080/login/oauth2/code/kakao`입니다.

## Tests

환경 변수를 불러온 뒤 전체 Gradle 테스트를 실행합니다.

```powershell
cd backend
.\run-dev.ps1 test
```

## API areas

- `/api/public/**`: 공개 행사·부스·상품 조회
- `/api/me`, `/api/me/reservations/**`: 로그인 사용자와 자신의 예약
- `/api/creator/**`: 기본·행사별 부스, 참가 신청, 상품, 공지, 예약 수령, POS 목록·단건 상세·취소
- `/api/admin/**`: 지정 관리자 계정의 행사와 참가 신청 관리
- `/api/creator/uploads/presign`: Cloudflare R2 직접 업로드용 서명 URL 발급

정확한 엔드포인트와 요청 형식은 `src/main/java/com/boothhana/api`의 Controller와 DTO를 기준으로 합니다.

## Local troubleshooting

- `.env` 변경 후에는 백엔드를 재기동합니다.
- R2 API 토큰을 Roll했으면 Cloudflare가 한 번만 보여 주는 Access Key ID와 Secret Access Key를 `backend/.env`의 `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`에 반영하고 Render의 같은 변수도 함께 갱신합니다. 값 자체는 Git이나 프런트 환경 변수에 두지 않습니다.
- 관리자 권한 변경 후에는 카카오 로그아웃·재로그인으로 `/api/me`를 다시 확인합니다.
- 8080 포트가 이미 사용 중이면 기존 백엔드 프로세스를 먼저 종료합니다.
- 프런트 요청이 CORS로 차단되면 `ALLOWED_ORIGINS`에 실제 프런트 주소가 있는지 확인합니다.

Spring Boot와 Gradle 자체 사용법은 [Spring Boot 공식 문서](https://docs.spring.io/spring-boot/)와 [Gradle 공식 문서](https://docs.gradle.org/)를 참고합니다.
