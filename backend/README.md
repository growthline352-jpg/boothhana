> **운영 배포 작업본 · 이미지 저장**
>
> 공개 이미지와 비공개 문의 첨부 저장 구현을 Google Cloud Storage로 전환했습니다. Render에서는 서비스 계정 JSON을 `/etc/secrets/gcs-service-account.json`로 등록하고 `GOOGLE_APPLICATION_CREDENTIALS`가 그 경로를 가리키게 합니다. 실제 버킷·IAM·공개 URL 검증 전에는 운영 준비 완료로 간주하지 않습니다.

# BoothHana2 backend

BoothHana2의 카카오 로그인, 팬·크리에이터·관리자 API, Supabase PostgreSQL 저장과 Google Cloud Storage 이미지 저장을 제공하는 Spring Boot 애플리케이션입니다. 전체 로컬 설정 순서는 [루트 README](../README.md)를 확인합니다.

## Requirements

- Java 21
- 개발용 Supabase 프로젝트와 PostgreSQL 연결 정보
- 개발용 Kakao Developers 앱
- 이미지 업로드를 확인할 경우 공개·비공개 GCS 버킷과 Application Default Credentials

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
- `/api/creator/uploads/tickets`: 검증 업로드 티켓 발급
- `/api/creator/uploads/tickets/{id}/content`: 서버에서 파일 바이트 검증 후 GCS 저장
- `/api/creator/uploads/tickets/{id}/complete`: 저장 객체 메타데이터 재검증 후 업로드 완료

정확한 엔드포인트와 요청 형식은 `src/main/java/com/boothhana/api`의 Controller와 DTO를 기준으로 합니다.

## Local troubleshooting

- `.env` 변경 후에는 백엔드를 재기동합니다.
- GCS 서비스 계정 키는 Git이나 프런트 환경 변수에 두지 않습니다. 로컬에서는 `GOOGLE_APPLICATION_CREDENTIALS`에 파일 경로를 지정하고, Render에서는 Secret File을 사용합니다.
- 공개 버킷과 비공개 첨부 버킷은 서로 다른 버킷이어야 합니다. 비공개 버킷에는 공개 IAM 정책을 추가하지 않습니다.
- 관리자 권한 변경 후에는 카카오 로그아웃·재로그인으로 `/api/me`를 다시 확인합니다.
- 8080 포트가 이미 사용 중이면 기존 백엔드 프로세스를 먼저 종료합니다.
- 프런트 요청이 CORS로 차단되면 `ALLOWED_ORIGINS`에 실제 프런트 주소가 있는지 확인합니다.

Spring Boot와 Gradle 자체 사용법은 [Spring Boot 공식 문서](https://docs.spring.io/spring-boot/)와 [Gradle 공식 문서](https://docs.gradle.org/)를 참고합니다.
