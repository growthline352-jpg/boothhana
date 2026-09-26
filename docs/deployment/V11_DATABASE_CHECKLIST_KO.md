# v11 DB 준비·변경 체크리스트

이 문서는 수행 계획입니다. 운영 DB를 읽거나 수정한 결과가 아닙니다.

## 적용 범위

| 현재 실제 스키마 | 추가 SQL |
|---|---|
| SQL009까지 적용 | **010_goods_showcase.sql → 011_server_only_access.sql** |
| 001/002만 적용 | 003 → 004 → 005 → 006 → 007 → 008 → 009 → 010 → 011 |
| 신규 DB | 001부터011까지 번호순, dev seed 제외 |
| 적용 상태 불명 | 실제 metadata 확인 후 미적용분만 결정 |

010은 기본상품별 메인 노출 설정 `goods_showcase` 1개와 집계용 인덱스를 추가합니다. 총 앱테이블은33개입니다. 매출·판매 로그를 새로 만들거나 숫자를 임의 채우지 않습니다. 011은 새 테이블을 만들지 않고33개 앱테이블의 역할/권한을 보호합니다.

## 반드시 먼저 확인

- [ ] 별도 스테이징 DB와 복원 검증한 백업을 준비한다.
- [ ] 주간/배치도/관리자 쓰기와 운영 조회 영향이 겹치지 않을 적용 시간을 정한다.
- [ ] DB를 공유하는 앱·스크립트가 이 테이블을 Supabase Data API의 `anon`/`authenticated`로 직접 사용하는지 조사한다.
- [ ] 직접 API를 사용하는 다른 앱이 있으면 전환/영향 협의 없이011을 실행하지 않는다. 이번 서비스의 프런트는 Spring API를 사용한다.
- [ ] `DATABASE_USERNAME` 및 실제 `current_user`로 백엔드 JDBC 로그인 역할을 확인한다. Supabase 프로젝트 key는 DB role/password가 아니다.
- [ ] 실제 JDBC 역할이 일반API역할이거나 해당 역할들과 상속관계이면 분리한다.
- [ ] SQL 실행자는 모든 대상테이블의 owner/권한 변경이 가능한 DBA이어야 한다.

## 011 역할 지정 방법

**같은 SQL 세션에서** 아래 한 줄을 실제 존재하는 JDBC 역할로 바꿔 실행한 다음011을 실행합니다. 비밀번호는 넣지 않습니다.

```sql
select set_config('boothhana.backend_role', 'ACTUAL_JDBC_ROLE', false);
```

이 문자열은 예시이므로 그대로 쓰지 않습니다. 설정이 없으면 SQL의 `current_user`를 쓰므로, SQL Editor 관리자와 백엔드 접속 역할이 다르면 반드시 지정해야 합니다. 다른 창·연결로011을 실행하면 설정이 유지되지 않을 수 있습니다. 가장 안전한 방법은 검토한 설정문과011 본문을 동일 실행 세션에 두는 것입니다.

010 → 역할 지정 → 011 순서입니다. 011은 내부 transaction/5초 lock timeout을 사용하며 실패 시 중단합니다. 운영에서 경쟁 트래픽이 있는 상태로 반복 강제 실행하지 않습니다.

## 011이 수행하는 것

- [ ] **고정33개 앱테이블만** RLS 활성화. Supabase auth/storage/system·다른 앱테이블을 일괄 변경하지 않는다.
- [ ] PUBLIC/anon/authenticated의 테이블 및 컬럼별 grants 회수.
- [ ] 일반 API역할의 restrictive deny 정책. JDBC와 일반API역할은 분리.
- [ ] 지정 JDBC 역할에 SELECT/INSERT/UPDATE/DELETE와 별도 server policy, public schema USAGE 허용.
- [ ] 앱컬럼 소유의 시퀀스만 일반권한회수/JDBC USAGE·SELECT 허용.
- [ ] 기존 업무 행/상품/예약/수집/스냅샷은 삭제하지 않는다.

## 적용 뒤 검사

- [ ] `verification/v11/db_preflight_readonly.sql`을 실제 JDBC 역할로 실행한다. 현재 schema가 public인지 확인한다.
- [ ] 33개가 모두 존재하고 필요한 컬럼을 포함한다. `goods_showcase`가 없는 상태로 백엔드부터 배포하지 않는다.
- [ ] 준비 API가 200 READY이며 관리자 진단에 issues가 없다. 권한을 잘못 적용한 것을 anon 전체허용으로 해결하지 않는다.
- [ ] 시퀀스 USAGE, 실제 쓰기·rollback, unique/FK/CHECK, 이미 존재하는 custom restrictive policy 충돌을 스테이징에서 확인한다.
- [ ] anon/authenticated가 직접 예약·사용자·POS·수집원문에 접근하지 못함을 확인한다. 실제 데이터 내용을 로그/채팅에 출력하지 않는다.
- [ ] 다른 스키마·노출 view·SECURITY DEFINER/RPC·service-role/BYPASSRLS·상속 grants·미래 기본권한을 별도로 점검한다.
- [ ] SQL011 재실행 전 `boothhana_server_v11`을 어떤 역할로 지정했는지 확인한다. 예전 백엔드 역할을 폐기하는 경우 기존 grants는 DBA가 별도 회수한다.

readiness는 metadata/zero-row SELECT와 정해진 권한·policy 존재를 확인합니다. 모든 쓰기경로/시퀀스/복잡한 사용자 policy/실제 거래를 대신 검증하지 않습니다. 기존 role의 별도 restrictive policy가 쓰기를 막는 경우 실제 작업 검사로 확인해야 합니다.

## 기존 공개 상태 복구

- [ ] `publication_status_audit_readonly.sql` 결과의 행사들을 관리자에서 확인한다.
- [ ] 검토 완료 여부·공식 취소/연기 근거를 확인하고 새 코드로 개별 공개본을 갱신한다.
- [ ] 이미 public snapshot이 잘못되어 있는 것을 코드 업로드만으로 복구됐다고 판단하지 않는다.

## 테스트와 되돌리기

기존 `CatalogPostgresTests`는 전용 localhost `boothhana_catalog_test`의 **public 스키마를 삭제**합니다. 운영/공유DB로 실행하지 않습니다. 새 `GoodsRankingPostgresTests`는 localhost `boothhana_goods_test`의 고유 임시스키마만 생성/삭제하지만 반드시 별도 빈 테스트DB에서만 사용합니다. 새 env는 `BOOTH_GOODS_TEST_URL`, `BOOTH_GOODS_TEST_USER`, `BOOTH_GOODS_TEST_PASSWORD`이며 운영 배포 환경에 두지 않습니다.

011은 접근 차단 변경입니다. 코드 롤백만으로 일반 API권한을 다시 열지 않으며, 공유앱 복구가 필요하면 적용 전 policy/grant 백업과 보안 검토를 기준으로 DBA가 조정합니다. 010 테이블/인덱스는 코드 롤백 때문에 즉시 삭제할 필요가 없습니다.

참고: [Supabase 데이터 보호](https://supabase.com/docs/guides/database/secure-data), [API 보안](https://supabase.com/docs/guides/api/securing-your-api), [PostgreSQL RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html). 공식 지침 확인과 실제 사용자 DB 검증은 다릅니다.
