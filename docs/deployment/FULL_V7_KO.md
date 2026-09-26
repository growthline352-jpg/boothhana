# v7 배포 안내 — 화면 리뷰 6건

## 범위 및 기준

기준은 `BoothHana2-full-v6-20260916.zip` 전체본입니다. 새 화면·표시 규칙·대표 배너 선택을 추가했습니다. 기존 주간 3단계 수집기와 프롬프트/스케줄은 변경하지 않았습니다. 박람회·축제는 준비 화면을 유지합니다.

이 소스는 스테이징 통합 검증 전 운영 배포 승인본이 아닙니다. 구문·모의 검사를 전체 프로젝트 빌드 성공으로 해석하지 마세요.

## 배포 순서

1. 코드·운영 DB 백업, 변경 중 배치/API 실행 충돌을 피할 유지보수 시간 확보.
2. 미적용 SQL을 001~008 순서대로 스테이징부터 적용. v6의 007까지 적용했으면 **008만**. 개발 seed 제외.
3. 새 프런트·백엔드 의존성 설치와 전체 빌드·JUnit. 사용자 설정·인증은 유지하고 비밀 값은 Git에서 제외.
4. 아래 수락 기준으로 실제 브라우저/스테이징 DB를 검증한 뒤 함께 배포.
5. 기존 일요일03시KST 배치 재개. collector와 config는 이번 버전에서 바이트 변경하지 않았으며 스케줄을 재등록할 필요는 없음.

SQL 008은 `subculture_catalog_presentation(event_id, banner_asset_id, revision, updated_at)`만 추가합니다. 기존 행사를 자동 backfill/공개/재선택하지 않습니다. SQL을 재실행해도 선택을 초기화하지 않습니다. 마이그레이션 먼저 적용하지 않으면 새 공개 배너/관리자 상세 쿼리가 실패할 수 있습니다.

RLS를 활성화하고 public/anon/authenticated에는 새 테이블 권한을 부여하지 않습니다. 백엔드 JDBC 계정이 테이블 소유자이거나 서버 전용 정책으로 접근할 수 있어야 합니다. 익명 역할에 전체 권한을 주는 방식으로 해결하지 마세요.

## 대표 배너 API

`PUT /api/admin/subculture/v4/events/{id}/banner` — 기존 ADMIN 세션/CSRF 인증을 유지합니다. 백엔드 CORS allowed methods에도 PUT을 추가했습니다. 실제 API prefix는 CatalogAdminController의 RequestMapping을 기준으로 하세요.

```json
{
  "assetId": 42,
  "revision": 0,
  "assetRevision": 3
}
```

위 ID와 숫자는 형식 설명용 가상 값입니다. 관리자 상세의 `bannerSelection.revision`과 선택한 이미지의 최신 `revision`을 그대로 보내야 합니다. 자동 복귀는 `assetId:null, assetRevision:null`을 보냅니다.

행사 행 잠금으로 첫 등록을 직렬화하고, 현재 선택 revision과 이미지 revision을 확인합니다. 타 행사 이미지·참가부스 이미지·배치도·미승인/미저장 이미지·제외 행사는 거절합니다. 오래된 화면은 409이며 재조회 후 다시 선택합니다. 이미지 사용 권한 자체는 변경하지 않습니다.

사용 승인/저장된 행사 레벨 배너만 선택합니다. **선택 결과는 이미 공개된 행사에 즉시 읽기 정책으로 반영**되며 publication snapshot 재발행이 필요하지 않습니다. 별도 확인창으로 안내합니다. 비공개 행사를 선택만으로 공개하지는 않습니다.

선택 행/assetId가 없으면 최초 eligible 배너 자동 선택을 유지합니다. 명시적 선택이 부적격이 되면 null을 반환하고 과거 이미지로 fallback하지 않습니다. 공개 목록과 상세 모두 동일 쿼리를 사용합니다. 명시적 null을 받은 프런트는 assets의 다른 BANNER를 다시 고르지 않습니다. 이미지 권한 메모 등 비공개 값은 공개 응답에 포함하지 않습니다.

## 화면 수락 기준

- 9/5·9/6·9/12·9/20 운영일을 9/16 기준으로 볼 때 9/20 우선. 주/월 필터와 같은 조건의 추가 일정 건수 확인.
- 10/10~11 및10/13을 10/12에 운영한다고 합치지 않음. 전체 원문 일정은 상세에 보존.
- 80개 부스 첫 항목을 눌러도 native modal이 화면에 열림. 제목 초점, Tab/Shift+Tab, Escape, 닫기 버튼, body scroll 및 원래 카드 초점 복귀.
- 모바일390/320 폭에서 가로 넘침 없음, ‘내 예약’ 접근성 이름 존재.
- 저장 행사 배치도가 별도 섹션에 노출. 원문 URL로 명시적으로 연결된 위치의 홀/날짜만 표시하고 그 외는 확인 필요.
- 상품명·작가 별칭·판매 주제를 찾아 해당 부스가 표시. 비공개 메모·URL의 기술 키로는 검색되지 않음.
- 정정 포스터를 대표 선택 → 목록과 상세 같은 이미지. 승인 철회/저장 FAILED → 기본 표시. 자동 복귀 명시적 요청 시에만 다른 eligible 이미지 선택 가능.
- 두 관리자 화면 동시 변경과 승인 변경 중 대표 저장: 권한/revision 충돌 확인. 실제 PostgreSQL에서 확인해야 함.
- 기존 로그인/예약/재고/POS/업로드/수집/검토 회귀.

## 전체 빌드

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

## 선택 PostgreSQL 테스트 — 전용 빈 로컬 DB에만

`CatalogPostgresTests`는 opt-in이며 **localhost의 boothhana_catalog_test public schema를 삭제하여 초기화**합니다. 운영·Supabase URL을 쓰지 마세요. v7의 새 8개 대표 배너 테스트는 작성되어 있으나 이 환경에서는 실행하지 못했습니다. 아래 변수는 테스트 코드의 확인된 명칭입니다.

```powershell
$env:BOOTH_CATALOG_TEST_URL='jdbc:postgresql://localhost:5432/boothhana_catalog_test'
$env:BOOTH_CATALOG_TEST_USER='postgres'
$env:BOOTH_CATALOG_TEST_PASSWORD='전용_테스트_DB_비밀번호'
# backend 폴더에서
.\gradlew.bat test --tests '*CatalogPostgresTests'
```

JUnit은 소스 기준 database005~008을 테스트 fixture로 적용합니다. 운영 마이그레이션 순서001~008과 테스트 fixture 초기화는 같은 절차가 아닙니다.

## 되돌리기

프런트/백엔드를 함께 이전 커밋 또는 백업으로 복원합니다. SQL008은 추가 전용 테이블이므로 코드 롤백 때문에 곧바로 삭제하지 않아도 됩니다. 이전 v6 코드는 대표 선택을 사용하지 않아 최초 배너로 표시될 수 있음을 확인하세요. 기존 배너·사용 승인·public snapshot은 자동 삭제하지 않습니다.

롤백 시에도 DB/소스 백업을 먼저 보관하고 서비스 환경에서 검토합니다. 이 ZIP 제작 과정에서 실제 GitHub/DB/스케줄을 변경하지 않았습니다.
