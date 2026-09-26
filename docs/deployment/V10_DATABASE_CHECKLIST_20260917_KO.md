# BoothHana2 v10 — DB 스키마 적용·권한·데이터 체크리스트

2026-09-17 · 근거는 ZIP의 `database/001~009`, 실제 JPA/JDBC 코드다. 현재 운영 DB의 적용 상태를 조회한 문서가 아니다.

## 1. 먼저 결정할 것

- [ ] 운영과 스테이징 DB를 분리하고 접속 대상(프로젝트/호스트/DB 이름)을 기록한다.
- [ ] 적용 전 DB 백업을 만들고 별도 환경에서 복원 가능한지 확인한다. ‘백업 있음’과 ‘복원 검증됨’은 구분한다.
- [ ] 적용 담당자, 검토자, 점검 시간, 실패 시 복구 결정을 기록한다.
- [ ] 기존 주간·배치도 작업과 관리자 변경을 중지하고 실행 중 작업이 종료됐는지 확인한다.
- [ ] 실제 스키마를 점검해 **미적용 SQL만 순서대로** 적용한다. ZIP 버전명만 보고 판단하지 않는다.

**자동 마이그레이션 없음:** `ddl-auto: validate`는 기존 JPA 엔티티 스키마 확인이며 root `database/*.sql`을 실행하지 않는다. 새 JDBC 기능 테이블도 별도 확인해야 한다. GitHub push/Render 배포만으로 SQL이 적용되지 않는다. 현재 소스를 그대로 쓰면서 `ddl-auto=create/update`로 누락을 덮으려 하지 않는다.

## 2. 현재 상태별 추가 적용 범위

| 확인된 현재 DB 상태 | 추가 SQL |
|---|---|
| 새 DB | **001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009** |
| 최초 원본의 001·002만 적용 | **003 → 004 → 005 → 006 → 007 → 008 → 009** |
| v2의 004까지 적용 | **005 → 006 → 007 → 008 → 009** |
| v3의 005까지 적용 | **006 → 007 → 008 → 009** |
| v4의 006까지 적용 | **007 → 008 → 009** |
| v5 또는 v6의 007까지 적용 | **008 → 009** |
| v7의 008까지 적용 | **009** |
| v8~v10, 실제 009까지 적용 | **추가 SQL 없음** |
| 버전·적용 상태 불명 | 아래 읽기 전용 점검 후 결정. 처음부터 무조건 재실행하지 않음 |

v9의 `operationStatus`는 기존 JSON 구조 확장이며 SQL 010이 없다. 이번 검토 문서 추가로도 마이그레이션을 만들지 않았다.

## 3. 파일별 변경 사항

| SQL 파일 | 변경 | 적용 후 확인 |
|---|---|---|
| `001_initial_schema.sql` | 로그인 사용자·운영 행사·부스·상품·예약·POS **11개** 테이블, FK/일부 인덱스 | 기본 테이블/참조 관계. 이 파일은 기존 테이블의 컬럼 불일치를 자동 보정하지 않음 |
| `002_remove_user_role.sql` | `app_user.role` 제거 | 기존 애플리케이션이 role 컬럼을 사용하지 않는 버전인지 확인. 권한은 Kakao 로그인과 관리자 설정에서 파생 |
| `003_inventory_safety.sql` | `event_product.version`; 재고·가격·예약/POS 수량 CHECK; 관련 인덱스 | 기존 잘못된 데이터 감사, NOT VALID 상태 확인. POS 취소 재고를 소급 계산하지 않음 |
| `004_review_v2_safety.sql` | `product.version`; `image_upload` | 버전 충돌 검사와 서버 검증 이미지 티켓 프로토콜 |
| `005_subculture_collection.sql` | 행사 수집 실행·후보·관찰 **3개** 테이블 | 수집 결과·검토 대기, 재전송 식별, 공개 역할 제한 |
| `006_subculture_catalog.sql` | 참가 부스·판매·상품·자산·단계·검토·공개본 등 **10개**; 행사 수동 수정 JSON | 참가자/상품 정보가 기존 운영 부스·예약과 분리되어 있음 |
| `007_catalog_review_fixes.sql` | 명단 진행 **1개**, 참가자·상품 식별 별칭, 마지막 시도/성공/재시도, 상품 확인 기록; 일부 실제 이력 backfill | 일부 수집의 이어가기·실패 순환·상품 누적. 이전 overrides나 모호한 중복을 임의 삭제하지 않음 |
| `008_catalog_presentation.sql` | 대표 배너 선택 **1개** | 이미지 사용 승인과 대표 선택 분리, revision |
| `009_floorplan_automation.sql` | 배치도 watch/source/version/publication/receipt **5개** | 탐색/임대/원본/좌표/매핑/공개 스냅샷 분리 |

**스크립트에 선언된 최종 애플리케이션 테이블은 32개**다. Supabase 자체 auth/storage/system 테이블은 이 개수에 포함하지 않는다.

### 전체 테이블 목록

- 001: `app_user`, `event`, `booth`, `event_booth`, `product`, `event_product`, `booth_notice`, `reservation`, `reservation_item`, `pos_sale`, `pos_sale_item`
- 004: `image_upload`
- 005: `subculture_collection_run`, `subculture_event_candidate`, `subculture_collection_observation`
- 006: `subculture_pipeline_run`, `subculture_exhibitor`, `subculture_participant`, `subculture_participant_member`, `subculture_sales`, `subculture_catalog_product`, `subculture_stage_run`, `subculture_catalog_asset`, `subculture_catalog_review_history`, `subculture_catalog_publication`
- 007: `subculture_participant_progress`
- 008: `subculture_catalog_presentation`
- 009: `subculture_floorplan_watch`, `subculture_floorplan_source`, `subculture_floorplan_version`, `subculture_floorplan_publication`, `subculture_floorplan_receipt`

## 4. 권장 적용 절차

- [ ] [읽기 전용 사전 점검](../../verification/review_v10_20260917/db_preflight_readonly.sql)을 SQL Editor 또는 준비된 psql로 실행한다. 보고서에 운영 비밀키나 실제 사용자 행을 복사하지 않는다.
- [ ] SQL Editor의 프로젝트와 `search_path`를 확인한다. 제공 SQL의 테이블명은 대부분 schema가 생략되어 있으므로 의도한 **public**에 적용되는지 확인한다.
- [ ] 스테이징에서 한 파일씩 적용하고 오류가 나면 그 지점에서 중단한다. 실패 이후 파일을 계속 적용하지 않는다.
- [ ] 파일 내부 BEGIN/COMMIT와 주석을 확인한다. 재실행의 IF NOT EXISTS가 모든 기존 형식 불일치를 고쳐주는 것은 아니다.
- [ ] 적용 파일명·SHA-256·실행 시각·담당자·결과를 배포 기록에 남긴다. 현재 코드에는 공통 마이그레이션 이력 테이블/자동 실행기가 없다.
- [ ] 서버 JDBC 계정으로 필요한 새 테이블·시퀀스에 접근 가능한지 별도 확인한다.
- [ ] 아래 기존 데이터/권한 점검 및 API smoke를 통과한 뒤 운영에 같은 절차로 적용한다.

psql이 준비된 환경의 예시(실제 접속 정보는 보안 저장소/자격증명 파일 사용):

```bash
# PGHOST/PGPORT/PGDATABASE/PGUSER/SSL은 실제 환경에 맞게 준비한다.
# 비밀번호를 셸 명령·Git 파일에 붙이지 않는다.
psql -X -v ON_ERROR_STOP=1 -f verification/review_v10_20260917/db_preflight_readonly.sql
# 아래는 009만 누락된 환경의 예시. 현재 상태별로 파일을 선택한다.
psql -X -v ON_ERROR_STOP=1 -f database/009_floorplan_automation.sql
```

## 5. 기존 재고·금액 데이터와 제약조건

SQL003의 다음 제약은 **NOT VALID**로 생성된다. 새/수정 행에 적용되는 것과 과거 모든 행이 검증된 것은 다르다. [PostgreSQL 공식 ALTER TABLE 설명](https://www.postgresql.org/docs/current/sql-altertable.html)의 NOT VALID/VALIDATE 동작을 참고한다.

| 테이블 | 제약 |
|---|---|
| event_product | `ck_event_product_stock`, `ck_event_product_price` |
| reservation_item | `ck_reservation_item_amounts` |
| pos_sale_item | `ck_pos_sale_item_amounts` |

- [ ] SQL003 마지막 감사 SELECT 결과를 확인한다.
- [ ] 예약/POS 항목의 `quantity <= 0` 또는 `unit_price < 0`도 읽기 전용으로 확인한다.
- [ ] 잘못된 수량은 운영 기록과 담당자 근거로 수정한다. 과거 POS 취소를 보고 임의로 재고를 되돌리지 않는다.
- [ ] 정리 후 점검 시간에 DBA가 각 `VALIDATE CONSTRAINT`를 별도 수행하고 `pg_constraint.convalidated`를 확인한다. 이번 자료가 해당 ALTER를 자동 실행하지는 않는다.
- [ ] 예약/POS 생성 경쟁, 취소/수령 경쟁, 오래된 상품 편집 저장을 스테이징에서 검사한다.

## 6. Supabase JDBC 연결·RLS·Data API

### 연결

- [ ] Supabase Dashboard의 **실제 Connect 정보**에서 호스트·포트·DB 사용자 형식을 가져온다. pooler 호스트나 사용자 접미사를 예제로 추정하지 않는다.
- [ ] `DATABASE_URL`은 `jdbc:postgresql://...` 형태다. REST URL, Supabase 프로젝트 URL, publishable/service-role 키를 JDBC 비밀번호 대신 넣지 않는다.
- [ ] 상시 Spring 서버에 맞는 direct 또는 session pooler를 선택하고 서버의 IPv4/IPv6 연결 가능성을 확인한다.
- [ ] transaction pooler를 쓰려면 JPA/JDBC와 prepared statement 설정을 별도 검증한다. direct/session을 선택한 설정과 섞지 않는다.
- [ ] SSL과 인증서 검증 정책을 확정한다. `sslmode=require`와 인증서까지 검증하는 설정을 동일하게 취급하지 않는다.
- [ ] DB 접속 허용 네트워크·연결 풀 총합·최대 연결 수를 환경 규모에 맞춰 확인한다.

위 연결 방식은 [Supabase 공식 연결 안내](https://supabase.com/docs/guides/database/connecting-to-postgres)로 보완한 설정 지침이다. 실제 운영 네트워크는 점검하지 않았다.

### 권한 — 공개 전 필수

- [ ] 백엔드 JDBC 계정과 브라우저용 `anon/authenticated` 역할을 구분한다.
- [ ] 001의 11개 업무 테이블에 실제로 RLS가 켜져 있는지 확인한다. **제공 SQL만 적용하면 이 11개 전체의 RLS 활성화가 보장되지 않는다.**
- [ ] Supabase Data API가 켜져 있는지, public 등 어느 스키마가 노출되는지, 일반 역할의 실제 grants가 무엇인지 확인한다.
- [ ] 이 DB를 공유하는 다른 앱이 없다면 서버 전용 접근에 맞춰 Data API 비활성화를 검토한다. 다른 앱이 의존하면 영향 분석 후 노출 스키마/grants/RLS를 정한다.
- [ ] RLS가 켜진 수집 테이블의 서버 접근은 적절한 서버 역할·소유자·정책으로 해결한다. 일반 역할에 전체 접근을 열지 않는다.
- [ ] 새 테이블의 미래 기본 권한과 시퀀스·함수 권한도 확인한다. 테이블의 RLS ON 한 줄만으로 전체 DB 보호를 증명하지 않는다.
- [ ] anon/authenticated로 새 수집 원문·검토 메모·예약 사용자 정보에 직접 접근할 수 없는지 스테이징에서 검증한다.

공식 근거: [데이터 보호](https://supabase.com/docs/guides/database/secure-data), [grants와 RLS, Data API 비활성화](https://supabase.com/docs/guides/api/securing-your-api). **조건부 위험이며 이번에 실제 DB 노출을 발견한 것은 아니다.**

## 7. DB 테스트는 운영에서 실행 금지

기본 `gradlew test`에서도 아래 환경변수가 설정되어 있으면 opt-in 통합 테스트가 활성화될 수 있다. 운영 배포 환경에 테스트 DB 환경변수를 두지 않는다. localhost가 운영 DB로 포워딩되어 있는 상황도 금지한다.

| 테스트 | 활성 변수 / 전용 DB | 파괴적 동작 |
|---|---|---|
| `PostgresConcurrencyTests` | `BOOTH_TEST_DATABASE_URL`; `boothhana_patch_test` | 11개 업무 테이블 TRUNCATE · RESTART IDENTITY · CASCADE |
| `CollectionPostgresTests` | `BOOTH_COLLECTION_TEST_URL`; `boothhana_collection_test` | 수집 테이블 3개 DROP CASCADE 후 재생성 |
| `CatalogPostgresTests` | `BOOTH_CATALOG_TEST_URL`; `boothhana_catalog_test` | **public 스키마 DROP CASCADE 후 재생성** |
| `FloorplanPostgresTests` | `BOOTH_FLOORPLAN_TEST_URL`; `boothhana_floorplan_test` | 임시 `floorplan_test_<uuid>` 스키마 생성·삭제. public을 삭제하는 테스트와는 다름 |

각 전용 DB는 실제 업무 데이터가 없는 로컬 테스트 DB다. 처음 세트의 username/password 변수는 `BOOTH_TEST_DATABASE_USERNAME/PASSWORD`, 나머지는 각각 `BOOTH_COLLECTION_TEST_USER/PASSWORD`, `BOOTH_CATALOG_TEST_USER/PASSWORD`, `BOOTH_FLOORPLAN_TEST_USER/PASSWORD`다.

테스트 코드가 허용하는 호스트·DB 이름 검사가 있어도 운영 접속정보를 시험삼아 넣지 않는다. 재현 스크립트 `verification/review_v10_20260917/reproduce_review.py`는 DB에 연결하지 않는다.

## 8. 되돌리기와 보관

- [ ] 백엔드·프런트·수집기를 호환되는 동일 릴리스 조합으로 복원한다.
- [ ] 코드 롤백 때문에 추가 테이블/컬럼을 즉시 삭제하지 않는다. 운영 데이터와 새 버전 기록을 먼저 보존한다.
- [ ] 예전 코드가 새 필드·대표 배너·지도 상태를 무시할 수 있음을 확인한다.
- [ ] DB 복원 범위와 복원 이후 들어온 데이터를 어떻게 보존할지 결정한다.
- [ ] 참가 명단 커서·식별 별칭·상품 관찰·지도 버전·권한 이력을 정리 작업으로 임의 삭제하지 않는다.

**이 문서는 DB 변경 계획이며 실제 DB 적용 결과가 아니다.** [전체 실사용 체크리스트](V10_GO_LIVE_CHECKLIST_20260917_KO.md)와 함께 사용한다.
