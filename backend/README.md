> **운영 배포 작업본 · 이미지 저장**
>
> 공개 이미지와 비공개 문의 첨부 저장 구현을 Google Cloud Storage로 전환했습니다. Render에서는 서비스 계정 JSON을 `/etc/secrets/gcs-service-account.json`로 등록하고 `GOOGLE_APPLICATION_CREDENTIALS`가 그 경로를 가리키게 합니다. 실제 버킷·IAM·공개 URL 검증 전에는 운영 준비 완료로 간주하지 않습니다.

관리자는 카카오 계정과 분리된 `/admin/login`을 사용합니다. Render에는 `ADMIN_LOGIN_USERNAME`과 bcrypt cost 12 형식의 `ADMIN_LOGIN_PASSWORD_HASH`만 저장하며 원문 비밀번호는 코드·DB·환경 변수에 저장하지 않습니다.

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

비회원 개선 의견을 받으려면 `SUPPORT_RATE_SECRET`을 32자 이상의 무작위 값으로 설정합니다. `SUPPORT_GUEST_ENABLED=false`인 운영 설정에서도 개선 의견 접수는 독립적으로 활성화됩니다. 비밀값이 없거나 짧으면 `feedbackEnabled=false`이고 접수는 `FEEDBACK_DISABLED`(503)로 거절합니다. 이 기능은 기존 고객지원 테이블을 사용하며 추가 SQL 마이그레이션이 없습니다.

일정 장소 검색은 서버의 `KAKAO_LOCAL_API_KEY`를 사용하며 없으면 `KAKAO_CLIENT_ID`를 사용합니다. 2026-10-05 운영 카카오 앱 1588512의 Local 제공 서비스 ON 상태와 검색·주변·주소 조회의 200 응답을 확인했습니다. 새 개발 환경에서도 제공 서비스 활성화 여부를 확인하며 API 키를 프런트 환경변수에 넣지 않습니다. `ITINERARY_PLACE_DAILY_LIMIT`은 기본 2,000, 설정 범위 1~10,000입니다. 서버 인스턴스의 한국시간 일일·분당 요청 수를 제한하며 재시작 시 초기화됩니다. 운영 확인과 연결 실패 시 직접 입력 대안은 [일정 안내](../docs/ITINERARY_BUILDER_KO.md#장소와-지도)를 확인합니다.

## Tests

환경 변수를 불러온 뒤 전체 Gradle 테스트를 실행합니다.

```powershell
cd backend
.\run-dev.ps1 test
```

## API areas

- `/api/public/**`: 공개 행사·부스·상품 조회
- `GET /api/public/itinerary/places/search?q=장소명&lat=위도&lon=경도`: 검색 중심을 지정한 장소 이름 검색, 최대 6개.
- `GET /api/public/itinerary/places/nearby?lat=위도&lon=경도`: 반경 1.2km 음식점·카페 거리순 검색, 종류별 최대 8개.
- `GET /api/public/itinerary/places/geocode?address=주소`: 행사 주소의 좌표 검색, 최대 3개.
- `GET /api/internal/subculture/v4/image-repair-events?limit=100&afterId=0`: 수집기 토큰으로 공개 행사의 이미지 보완 대상을 ID 순서로 조회. `limit`은 1~100이며 마지막 행사 ID를 다음 `afterId`로 전달한다. 배포·후보 검토·저장·공개 검증은 [이미지 보완 절차](../collector/IMAGE_REPAIR_KO.md)를 따른다.
- `/api/me`, `/api/me/reservations/**`: 로그인 사용자와 자신의 예약
- `GET /api/public/interests`: `InterestTaxonomy`가 정의한 분야별 행사 유형·취향 주제 옵션
- `GET /api/me/interests`, `PUT /api/me/interests`: 현재 회원의 관심 설정 조회·저장. 저장에는 `expectedUserId`, `revision`, `onboardingStatus`, `fields`가 필요하며 다른 계정·과거 revision은 충돌로 거절합니다.
- `GET /api/public/catalog/events/featured`, `GET /api/me/interests/featured`: 분야·지역의 전체 또는 개인 관심 조건으로 회원 저장 수 상위 5개와 `POPULAR / RECENT` 상태 조회
- `/api/creator/**`: 기본·행사별 부스, 참가 신청, 상품, 공지, 예약 수령, POS 목록·단건 상세·취소
- `/api/admin/**`: 지정 관리자 계정의 행사와 참가 신청 관리
- `POST /api/public/support/feedback`: CSRF가 필요한 비회원 개선 의견 접수. `GuestCreate` 형식의 `ticket`, 난수 `accessKey`, 빈 `website`를 받으며 `INQUIRY / FEATURE_REQUEST`만 허용합니다. 대상·업체·증거 링크는 받지 않고 문맥은 검색어·해시 없는 내부 `pagePath`만 받습니다. 201 응답은 `id`·`number`만 포함하고 `no-store`입니다.
- `/api/me/support/tickets`: 회원의 `FEATURE_REQUEST` 작성·본인 답변 이력 조회. 관리자 `/api/admin/support/tickets?kind=INQUIRY&category=FEATURE_REQUEST`에서 회원·비회원 개선 제안을 함께 확인합니다. 비회원 개선 제안에는 기존 guest 조회·추가 답변 API를 사용할 수 없습니다.
- `/api/creator/uploads/tickets`: 검증 업로드 티켓 발급
- `/api/creator/uploads/tickets/{id}/content`: 서버에서 파일 바이트 검증 후 GCS 저장
- `/api/creator/uploads/tickets/{id}/complete`: 저장 객체 메타데이터 재검증 후 업로드 완료

정확한 엔드포인트와 요청 형식은 `src/main/java/com/boothhana/api`의 Controller와 DTO를 기준으로 합니다.
일정 장소 계약은 `src/main/java/com/boothhana/itinerary`를 기준으로 합니다. 응답은 `no-store` GeoJSON `FeatureCollection`이며 좌표는 `[경도, 위도]`, 속성은 제공자·장소 ID·이름·주소·카카오맵 링크·장소 종류입니다. 검색어·주소는 2~100자, 검색 중심은 위도 33~39·경도 124~132 범위입니다. 서버 결과 캐시는 15분·최대 256개이고 캐시 미적중 제공자 호출은 분당 120회와 일일 한도를 함께 사용합니다. 주변 조회 한 번은 음식점·카페 두 제공자 호출을 사용합니다. 한도 초과는 `PLACE_LIMIT`(429), 제공자 미설정·연결 실패는 `PLACE_UNAVAILABLE`(503)이며 개인 일정 저장 API는 제공하지 않습니다.
관심 설정 계약은 `src/main/java/com/boothhana/interests`의 Controller·Service·Taxonomy를 기준으로 합니다. 신규 카카오 계정은 `PENDING`, 기존 계정은 `LEGACY`이며 설정 저장 또는 건너뛰기 후 `DONE / SKIPPED`로 갱신합니다. 관심 설정에는 `database/020_category_interests.sql`, 확장된 서브컬처 행사 유형에는 그 뒤의 `database/021_subculture_event_types.sql`이 필요하며 적용·검증 순서는 [관심분야 검증 및 배포 계획](../docs/CATEGORY_INTERESTS_TEST_PLAN.md)을 확인합니다.
서브컬처 목록·공개·관심 유형은 기존 5종과 함께 `SUBCULTURE_MUSIC`(애니·게임·버추얼 공연), `ANIME_GAME_FESTIVAL`(애니·게임 행사), `ART_BOOK`(아트북·독립출판), `BOARD_GAME`(보드게임), `CHARACTER_ART`(캐릭터·아트), `ILLUSTRATION`(일러스트 행사)을 지원합니다. 일반 공연 `MUSIC`은 축제, 일반 디자인 박람회 `DESIGN`은 박람회 유형입니다. SQL021은 허용 분류 제약만 확장하며 기존 행사의 재분류는 관리자 검토와 공개가 필요합니다.
개선 의견 계약은 `src/main/java/com/boothhana/support`를 기준으로 하며 사용 경로·비회원 접수 제한은 [고객지원 안내](../docs/support/SUPPORT_AND_ROLES_V12_KO.md#5-고객문의답변비회원)를 확인합니다. 비회원 의견과 로그인 장애 문의는 기존 IP별 시간당 작성 시도 5회 한도를 함께 사용하고 같은 요청 ID·내용·조회키의 재전송은 새 접수를 만들지 않습니다.

## Local troubleshooting

- `.env` 변경 후에는 백엔드를 재기동합니다.
- GCS 서비스 계정 키는 Git이나 프런트 환경 변수에 두지 않습니다. 로컬에서는 `GOOGLE_APPLICATION_CREDENTIALS`에 파일 경로를 지정하고, Render에서는 Secret File을 사용합니다.
- 공개 버킷과 비공개 첨부 버킷은 서로 다른 버킷이어야 합니다. 비공개 버킷에는 공개 IAM 정책을 추가하지 않습니다.
- 관리자 권한 변경 후에는 카카오 로그아웃·재로그인으로 `/api/me`를 다시 확인합니다.
- 8080 포트가 이미 사용 중이면 기존 백엔드 프로세스를 먼저 종료합니다.
- 프런트 요청이 CORS로 차단되면 `ALLOWED_ORIGINS`에 실제 프런트 주소가 있는지 확인합니다.

Spring Boot와 Gradle 자체 사용법은 [Spring Boot 공식 문서](https://docs.spring.io/spring-boot/)와 [Gradle 공식 문서](https://docs.gradle.org/)를 참고합니다.
