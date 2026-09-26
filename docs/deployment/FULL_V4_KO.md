> v4의 과거 문서입니다. 현재 배포는 docs/deployment/FULL_V5_KO.md, 변경 계약은 docs/catalog/REVIEW_FIXES_V5_KO.md를 따르세요.

# v4 전체 소스 배포 안내

## 1. 원본·기존 수정

사용자 첨부 원본 `f528394`에 이전 82개 변경을 실제 통합하고 v4를 추가했습니다. 이미 합쳐진 코드이므로 패치 적용기/overlay를 실행하지 않습니다. 이전 v3 안내는 `docs/history`/과거 배포문서에 보관되며 현재 절차는 이 문서가 우선합니다.

GitHub에 반영할 때 기존 저장소 루트의 같은 폴더로 복사하세요. Git 기록(.git)·실제 .env·관리 중인 별도 브랜치를 지우지 마세요. ZIP 기준 이후 사용자/다른 개발자가 수정한 내용이 있다면 반드시 diff 확인 후 합치세요. 새 브랜치/PR를 권장합니다.

## 2. DB 순서

실제 DB와 코드 백업 → 스테이징 DB에 아직 적용하지 않은 SQL을 번호 순서대로:

```
001_initial_schema.sql
002_remove_user_role.sql
003_inventory_safety.sql
004_review_v2_safety.sql
005_subculture_collection.sql
006_subculture_catalog.sql
```

003: event_product.version 및 정합성 CHECK/인덱스. 기존 나쁜 데이터를 자동 수정하지 않으므로 파일의 감사 쿼리 결과를 확인합니다.
004: product.version, 자체 이미지 업로드 기록. 기존 프런트/백엔드가 받는 입력 버전 변경 포함.
005: 행사 수집 전용 비공개 테이블.
006: 3단계 catalogue·명칭 보정·주간 배치·공개본. 기존 commerce 데이터는 변경하지 않습니다.

번호 파일은 애플리케이션 기동 시 자동 실행하지 않습니다. 기존 dev seed는 운영에 적용하지 마세요. 006 적용 없이 최신 수집/관리자 API는 동작하지 않습니다. 신규 JPA version 컬럼(003·004)은 서버 기동 전 필요합니다.

새 테이블은 RLS를 활성화하고 PUBLIC/anon/authenticated 권한을 차단합니다. 백엔드 JDBC는 테이블 소유자 또는 별도 검증된 서버 전용 권한으로 접근해야 합니다. 이를 해결하려고 브라우저/익명 역할에 전체 권한을 주면 안 됩니다. private candidate의 실제 API 접근은 ADMIN 세션 또는 별도 수집 토큰만 허용합니다.

## 3. 환경변수

기존 DATABASE_*, FRONTEND_URL, ALLOWED_ORIGINS, KAKAO_*, ADMIN_KAKAO_SUBJECTS, R2_* 값을 보존합니다.

`BOOTH_COLLECTOR_TOKEN`: 백엔드와 실행기 환경에만 같은 32자 이상의 임의 값. 프런트 `VITE_*`, Git, 공유 로그에 넣지 마세요. 비어 있으면 기존 API는 유지되지만 수집 API는 503; 잘못된 토큰은 401. 수집 토큰은 관리자 권한을 부여하지 않습니다.

백엔드·프런트 도메인이 다른 배포는 `SESSION_COOKIE_SECURE=true`, `SESSION_COOKIE_SAME_SITE=none`과 정확한 CORS origin이 필요합니다. 실제 브라우저 쿠키 정책을 확인하세요.

## 4. 이미지 경로 변경(이전 v2 포함)

부스·상품의 이전 `/presign` 직접 PUT은 사용하지 않습니다. 프런트가 서버 ticket/content/complete 경로에 raw 파일을 보내며 서버가 실제 크기/헤더/해시/소유권을 검증해 R2에 저장합니다. 구 프런트와 최신 백엔드를 섞지 마세요. 자체 이미지 최대10MiB, 기본 계정당 시간당20건/일100MiB.

외부 catalogue 이미지는 별도 권한입니다. 관리자가 원문 사용 조건 확인 후 `APPROVED`와 공개 출처 문구를 저장하고 실행기 `imageAllowedHosts`에도 허용하면 다음 주간 배치에서 R2 저장을 수행합니다. 기본 호스트 목록은 비어 있으므로 아무 외부 이미지도 자동 다운로드되지 않습니다.

실행기가 매 리다이렉트 목적지와 DNS를 검사하고 확인한 공개 IP로 TLS 연결합니다. HTTPS443만 허용, 원본 재인코딩/크롭 없음, 최대10MiB/25백만픽셀. 서버도 크기·파일 헤더·SHA256를 재검사합니다. 새 경로 `verified/catalog/...`를 포함해 **사용 중인 verified 파일 전체에 만료 lifecycle을 설정하지 마세요.** 원문 PDF 배치도는 링크만 보관하며 자동 이미지 변환하지 않습니다.

R2 토큰은 대상 버킷 읽기·쓰기 필요. 공개용 URL은 R2_PUBLIC_URL로 지정. 객체 파일이 있어도 URL을 구성하지 않으면 화면 노출이 안 됩니다. 승인 철회는 사이트 조회에서 제외하지만 퍼블릭 R2 URL 자체의 폐기를 보장하지 않습니다. 포기한 업로드/오래된 객체의 정리는 현재 참조를 대조해 별도 정책으로 운영합니다.

서버 요청 제한: 내부 JSON2MiB, 실제 image content10MiB. 리버스 프록시의 크기·읽기시간·전역 연결수/IP 제한은 별도 설정하세요. raw upload이므로 Spring multipart 옵션만 설정해서는 충분하지 않습니다.

## 5. 빌드·실행

프런트 pnpm install --frozen-lockfile → pnpm lint → pnpm build. 백엔드 Java21로 gradlew test → bootJar. 원본 Render/Vercel 설정을 유지합니다. **Collector는 Vercel 프런트나 매 요청 Spring API 안에서 돌리지 않고 별도 실행 PC/서버에 배치로 설치**합니다.

수집 인증 준비/스케줄러: `collector/README_KO.md`. 실행기와 backend에는 HTTPS로 연결합니다(로컬 개발 localhost HTTP만 예외).

## 6. 스테이징 필수 시나리오

- 기존 로그인(FAN·CREATOR·ADMIN), CSRF, 예약/POS, 상품 stale version, 취소/수령 충돌, 자체 이미지 재시도 확인.
- SQL006과 RLS 서버권한 확인; 별도 local DB test는 아래 절차대로.
- 실제 Codex live web search가 이벤트 JSON과 감사 로그에 기록되는지 확인. CLI 도구 이벤트 이름이 다른 버전은 실패하도록 되어 있으므로 해당 버전에 맞춘 검증 필요.
- 행사발견 → participant event ID → sales participant ID가 다른 부모에 섞이지 않는지 확인.
- 같은 배치/단계 ID를 재전송, response loss, worker crash/resume → 중복 레코드 없음.
- 명단 미공개·24/720 일부·미배정·불연속 날짜·공동부스·상시 상품/과거정보 표시 확인.
- 관리자가 날짜/부스번호/판매요약 수정 → 다음 수집 raw 갱신 후에도 correction 유지, 검토 상태 재설정 확인.
- 이미지 미승인/허용호스트 없음은 저장 안 함. 승인+호스트+R2 정상일 때만 저장. 크기초과·내부IP·redirect·취소·서버지연 테스트.
- 검토되지 않은 행사 공개 불가, participant/sales 각각 별도 검토. 공개본에 원본 이미지 후보/비공개메모/예약버튼 없음.
- 새 수집은 공개본 자동덮어쓰기 안 함; 제외/사용승인철회는 공개조회 반영.
- 일요일 예약이 한 번만 실행되고 종료코드/로컬 로그/관리자 배치 상태를 확인. SUCCESS는 조사된 내용 전체의 사실성·명단 전수를 보장하는 상태가 아님.

## 7. 선택적 실제 PostgreSQL 테스트

`CatalogPostgresTests` 8개는 **전용 localhost boothhana_catalog_test의 public schema를 삭제하고 다시 생성**합니다. 운영·Supabase·원격 주소는 코드에서 거부합니다. 절대 실제 데이터가 있는 DB를 같은 이름으로 쓰지 마세요.

```powershell
# DB는 직접 생성한 빈 전용 테스트 DB. backend 폴더에서 실행
$env:BOOTH_CATALOG_TEST_URL = 'jdbc:postgresql://localhost:5432/boothhana_catalog_test'
$env:BOOTH_CATALOG_TEST_USER = 'postgres'
$env:BOOTH_CATALOG_TEST_PASSWORD = '전용 테스트 비밀번호'
.\gradlew.bat test --tests '*CatalogPostgresTests'
```

실제 DB 테스트는 여기서 실행하지 못했습니다. 기존 CollectionPostgresTests/PostgresConcurrencyTests도 각각 별도의 localhost 테스트 DB 요구사항을 코드에서 확인하세요.

## 8. 롤백·운영 제한

스케줄러 중지 → 배포 소스 이전 커밋으로 복구. 006 추가 테이블과 source observations는 먼저 백업하고 즉시 drop하지 않습니다. 신규 version 컬럼은 이전 코드가 사용하지 않지만 구 업로드 프로토콜로 돌릴 때 프런트와 백엔드를 반드시 동일버전으로 맞춥니다.

기본 한도: 최대50행사·행사당10명단페이지·100판매정보·160CLI호출·4시간·100이미지. 이것은 최대 시도량이지 사용요금 상한이 아닙니다. 넘으면 일부 수집으로 기록하고 다음 주/명시적 resume에서 이어 처리합니다. 출처 제한이나 검색미노출로 전수 수집이 안 될 수 있습니다.

이 소스는 운영 적용/외부 DB 저장/실제 스케줄 생성이 완료된 것이 아닙니다. 구문/독립 테스트와 전체프로젝트 실행·실제 서비스 통합검증은 `TEST_RESULTS_KO.md`에서 구분합니다.
