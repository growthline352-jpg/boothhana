# v14 DB 변경·실사용 검토 체크리스트

**운영 DB에 실행한 내역이 아닙니다.** 실제 DBA/JDBC 계정·공유 앱·백업·스테이징을 확인한 뒤 담당자가 적용합니다.

## 1. 적용 파일

| 현재 확인된 DB 상태 | 추가 적용 |
|---|---|
| v13 / SQL013까지 | **014_trade_idempotency.sql** |
| v12 / SQL012까지 | 013 → 014 |
| v11 / SQL011까지 | 012 → 013 → 014 |
| 최초001·002만 | 003부터014까지 순서대로 |
| 신규 DB | 001부터014까지 순서대로, database/dev 제외 |
| 모름 | 메타데이터와 배포기록 확인 후 미적용분 결정 |

001~013을 이번 코드에서 바꾸지 않았습니다. SQL014는 `trade_request` 1개 테이블, PK·FK·CHECK·인덱스·권한을 추가합니다. **최종 앱 테이블 41개**이며 Supabase 시스템 테이블은 별도입니다. 자동 Flyway/Liquibase 적용은 구성하지 않았습니다.

## 2. 필수 검토

- [ ] 스테이징/운영 프로젝트·호스트·DB 이름과 현재 schema가 맞다.
- [ ] 기존 DB/권한/소스 백업 및 별도 환경 복원 검증이 있다.
- [ ] 실제 JDBC 계정이 PUBLIC/anon/authenticated가 아니며, 해당 역할들과 위험한 상속이 없다.
- [ ] SQL 적용 계정과 애플리케이션 JDBC 계정이 다르면 아래 설정을 **같은 SQL 세션**에서 지정했다.
- [ ] DB를 공유하는 다른 앱의 Data API 의존성과 FK/삭제 동작 영향을 확인했다.
- [ ] 신규 테이블의 RLS·서버 정책과 grants를 확인했다. 기존 SQL011이 미래 테이블을 자동 보호한다고 가정하지 않는다.

```sql
-- ACTUAL_JDBC_ROLE을 현재 존재하는 서버 전용 역할로 교체. 비밀번호가 아님.
select set_config('boothhana.backend_role','ACTUAL_JDBC_ROLE',false);
-- 같은 세션에서 database/014_trade_idempotency.sql 실행
```

## 3. 새 테이블과 보존 정책

| 필드 | 목적 |
|---|---|
| user_id, operation, request_id | 본인+RESERVATION/POS+UUID 유일키 |
| request_hash | 최초 요청의 정규화 해시 |
| reservation_id / pos_sale_id | 정확히 한 종류의 결과 참조·FK·UNIQUE |
| created_at | 최초 결과 저장 시각 |

- [ ] 같은 ID+같은 입력은 원래 결과 ID이고, 다른 입력은409이다.
- [ ] 같은 상품을 정상적으로 다시 판매할 때는 새 UUID가 허용된다.
- [ ] 취소한 결과도 receipt에 남으며 재시도 시 재고가 다시 차감되지 않는다.
- [ ] 기존 예약/POS에 가짜 요청 ID를 만들어 일괄 backfill하지 않는다.
- [ ] 원래 거래가 존재하거나 재시도가 가능할 때 receipt를 임의 삭제하지 않는다. receipt 삭제는 재실행 방어를 없애며 FK가 있는 거래의 삭제도 운영 영향이 있다.
- [ ] 과거 신고의 snapshot·fingerprint와 과거 중복 의심 거래는 자동 삭제/합산하지 않는다. 별도 검토한다.

## 4. 첨부 PENDING과 연결 풀

새 첨부 방식은 기존012의 PENDING/STORED 상태를 사용하므로 추가 첨부 스키마 변경은 없습니다. 한 티켓의 새·대기 파일 합계는 최대5입니다.

- [ ] 오래된 PENDING 및 private R2 고아 객체의 검토·보관·정리 책임자가 있다.
- [ ] 완료 파일과 진행 중 재전송을 지우지 않도록 티켓/상태/생성시각/객체 해시를 대조한다.
- [ ] 주기적 cleanup은 이번 구현에 없으며, 읽기 전용 점검 결과를 자동삭제 승인으로 취급하지 않는다.
- [ ] 기본값 DB_POOL_SIZE=10, DB_CONNECTION_TIMEOUT_MS=5000, SUPPORT_ATTACHMENT_CONCURRENCY=4를 실제 인스턴스 수·DB 연결 한도에 맞췄다.
- [ ] 역방향 프록시에서 5MiB 고객지원 본문 상한, 요청 읽기 제한시간, 동시 연결/요청 제한을 별도 설정했다.

읽기 전용 상태 점검: [v14 DB 점검 SQL](../../verification/v14/db_preflight_readonly.sql).

## 5. 배포 및 수락

- [ ] 거래 쓰기를 유지보수 상태로 제한하고 DB014→백엔드→프런트를 같은 릴리스로 교체했다.
- [ ] old client의 requestId 누락은400이며 새로고침 안내를 운영 절차에 포함했다.
- [ ] ready200과 관리자 진단 확인. ready는 데이터 의미·외부 R2·전체 업무 성공 보증이 아니다.
- [ ] 스테이징 실제 JPA+JDBC 트랜잭션에서 재고/거래/receipt가 함께 커밋·롤백된다.
- [ ] 사용자A가 B의 receipt·예약·판매·문의·첨부에 접근할 수 없다.
- [ ] 지원 요청 동시성·느린 파일 전송에서도 풀 연결이 추가로 잠기지 않으며 상한 초과는 명확히429/시간초과로 안내한다.
- [ ] 이미지 PUT 이후 DB 확정 실패·응답 유실·같은 파일 재시도를 실제 private R2로 검증했다.
- [ ] 로그인/CSRF/브라우저 복구/배치 실동작/백업복원을 확인했다.

## 6. 테스트 DB 절대 분리

새 full-app 테스트는 **별도 localhost `boothhana_release_test`**에만 실행합니다. 준비 스크립트는 비어 있지 않은 public schema와 기존 테스트 역할이 있는 공유 클러스터를 거절하며 자동 DROP/TRUNCATE로 강제 초기화하지 않습니다. localhost 운영 포트포워딩도 금지입니다.

기존 support test는 `boothhana_support_test`에만 실행하며 임시 스키마를 만들고 삭제합니다. 다른 과거 opt-in 테스트는 public schema/테이블을 지울 수 있으므로 새 gate는 관련 환경변수가 남아 있으면 중단합니다.

## 7. 되돌리기

코드 롤백은 프런트·백엔드를 같이 합니다. 014 테이블을 즉시 DROP하지 말고 원본 거래와 재시도 이력을 보존하세요. v13 이하로 돌아가면 거래 idempotency를 사용하지 않으므로 **그대로 거래 쓰기를 재개하면 보호가 사라집니다**. 복구 검토 없이 RLS·일반 API 권한을 완화하지 않습니다.
