# v11 상세 배포 안내

[시작 안내](../../START_HERE_KO.md), [실사용 체크리스트](V11_GO_LIVE_CHECKLIST_KO.md), [DB 체크리스트](V11_DATABASE_CHECKLIST_KO.md)를 함께 읽으세요.

## 1. 배포 차이

v10에서 **프런트엔드와 백엔드를 함께 교체**해야 합니다. 추가 SQL은 `010_goods_showcase.sql`과 `011_server_only_access.sql`입니다. 기존 수집기·프롬프트·스케줄 파일은 변경하지 않았습니다. 새 런타임 라이브러리나 외부 서비스 계정을 추가하지 않았습니다.

코드·DB 백업 → 실제 JDBC 역할과 공유 앱 영향 확인 → 스테이징 SQL 010 → 같은 SQL 세션에서 역할 지정 및 011 → 실제 빌드 → 스테이징 배포 → 준비 상태·업무 점검 → 운영 적용 순서로 진행합니다.

Render의 준비 확인이 강화되어, 필수 SQL이나 권한이 누락된 상태에서는 배포가 정상으로 판단되지 않을 수 있습니다. 이를 해결하려고 준비 확인을 항상 200으로 반환하게 만들지 마세요.

## 2. 기존 환경변수 유지

기존 `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `ADMIN_KAKAO_SUBJECTS`, 세션 쿠키 설정, R2 설정, `BOOTH_COLLECTOR_TOKEN`, 업로드 제한값을 실제 환경에 맞게 유지합니다. 비밀값은 ZIP에 들어 있지 않습니다.

`boothhana.backend_role`은 서버 환경변수가 아니라 **SQL 011을 실행하는 세션의 설정**입니다. SQL Editor에서 쓰는 관리자 계정과 실제 서버 JDBC 계정이 다를 수 있으므로, DB 체크리스트의 역할 지정 방법을 따르세요.

## 3. 준비 확인의 정확한 범위

| 경로 | 용도 |
|---|---|
| `/api/public/health/live` | 프로세스의 HTTP 응답 확인. DB 검사는 하지 않음 |
| `/api/public/health/ready` | 필수 33개 테이블·컬럼의 0행 조회, RLS·서버 CRUD 권한·서버 정책·일반 API grants 확인. 5초 캐시, 실패 시 503 |
| `/api/admin/health/readiness` | 기존 ADMIN 인증으로 내부 점검 결과와 진단 ID 확인 |

공개 준비 응답에는 테이블명이나 내부 예외가 들어가지 않습니다. 준비 확인은 자동 DDL이나 데이터 수정, 테스트 INSERT를 실행하지 않습니다.

준비 확인에 성공하더라도 모든 데이터 형식·인덱스·시퀀스 사용권한·정책 논리·실제 거래를 증명하는 것은 아닙니다. 기존의 별도 restrictive policy가 실제 쓰기를 막거나, 노출 view/RPC에 다른 접근 경로가 있는 경우에는 DBA 검토와 실제 업무 검증이 필요합니다.

## 4. 작성된 SQL 회귀 테스트

아래 테스트는 이번 작성 환경에서 실행하지 못했습니다. 운영·공유 DB가 아닌 **전용 빈 localhost DB**만 사용하세요.

```powershell
# backend 폴더
$env:BOOTH_GOODS_TEST_URL='jdbc:postgresql://localhost:5432/boothhana_goods_test'
$env:BOOTH_GOODS_TEST_USER='전용_테스트_역할'
$env:BOOTH_GOODS_TEST_PASSWORD='전용_테스트_비밀번호'
.\gradlew.bat test --tests '*GoodsRankingPostgresTests'
```

새 3개 테스트는 고유 임시 스키마에서 실제 순위 SQL을 검사합니다. 수량순 정렬, 취소·기간 밖·미래·MOCK 제외, 노출 철회, 같은 기본상품의 여러 행사 판매 합산을 다룹니다. SQL 010·011의 실제 마이그레이션과 전체 RLS 검증은 별도로 해야 합니다.

기존 `CatalogPostgresTests`에 상태 보존 테스트 1개를, 오류 응답 JUnit 테스트 1개를 추가했습니다. **기존 CatalogPostgresTests는 public 스키마를 삭제하므로 지정한 전용 테스트 DB 외에는 실행하면 안 됩니다.**

## 5. 문제 대응

### 메인 굿즈가 비어 있음

오류가 아닐 수 있습니다. ADMIN 노출 승인 → 공개 상품 → 최근 30일 SOLD 기록 → MOCK 제외 여부 → 분류 순서로 확인하세요. 실제 판매량이 없는 외부 수집 상품에 가상 수량을 입력해 해결하지 마세요.

### 준비 확인이 503

SQL 010·011, JDBC 역할, RLS 정책, 실효 grants를 확인합니다. 카카오 callback·CORS·R2 키 문제는 DB 준비 확인과 별도로 점검해야 합니다.

### 취소 행사가 여전히 예정으로 보임

이미 저장된 공개 스냅샷을 확인하세요. 코드 업데이트만으로 과거 공개본이 복구되지는 않습니다. 검토 완료된 공식 근거에서 재발행해야 합니다.

### 예상하지 못한 500 오류

화면의 문의 코드를 서버 로그와 대조하세요. 예외 메시지에 개인정보나 비밀값이 들어갈 수 있어 새 코드에서는 예외 클래스와 앱 스택 위치만 기록합니다. 더 상세한 진단은 스테이징에서 비식별화한 입력으로 재현하는 것이 좋습니다.

## 6. 되돌리기

코드·DB·policy·grants 백업을 기준으로 복구합니다. SQL 010의 새 테이블은 구버전 코드가 사용하지 않으므로 코드 롤백을 위해 즉시 삭제하지 않아도 됩니다.

**SQL 011의 보안 권한은 자동으로 되돌리지 않습니다.** 구버전 코드를 사용한다는 이유로 일반 API 전체 grants를 다시 열면 안 됩니다. 공유 앱 복구가 필요한 경우 실제 연동과 적용 전 권한 백업을 DBA가 검토해야 합니다.
