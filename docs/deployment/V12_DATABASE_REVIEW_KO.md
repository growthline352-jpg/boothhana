# DB·보안·운영 검토 체크리스트 — v12

**이 문서는 미완료 검토 항목입니다. 실제 DB에 SQL을 실행하지 않았고, 아래 체크박스도 완료로 표시하지 않았습니다.** 담당자가 실제 프로젝트/DB/역할을 확인한 후 체크합니다. SQL012가 포함돼 있다는 사실은 적용 완료를 뜻하지 않습니다.

## 1. 대상·적용 순서

- [ ] DB/프로젝트/호스트/스키마가 스테이징인지 운영인지 식별했다.
- [ ] Git과 DB·policy/grants 백업 및 복원검증 방법·담당자를 정했다.
- [ ] 기존collector/관리자쓰기/API 업데이트 간 충돌을 피할 시간을 확보했다.
- [ ] `verification/v12/db_preflight_readonly.sql`을 실제 SQL Editor/psql에서 검토·실행했다. 사용자 본문/비밀값은 출력하지 않도록 작성되어 있다.
- [ ] 실제 적용된 SQL을 확인했다. ZIP 버전 이름으로 DB 상태를 가정하지 않는다.

| 실제 DB 상태 | 적용할 SQL |
|---|---|
| 001~011 완료(v11) | **012만** |
| 001~009 완료(v8~v10) | **010 → 011 → 012** |
| 001·002 최초 원본만 | **003부터012까지 순서대로** |
| 새 빈 DB | **001부터012까지 순서대로** |
| 상태 불명 | 읽기전용점검 후 누락분만 결정 |

`012_support_and_relationships.sql`은 BEGIN/COMMIT와 실패중단을 사용한다. 기존 root SQL001~011은 변경하지 않았다. 자동 Flyway/Liquibase나 운영 DB접속 코드는 추가하지 않았다. ddl-auto를 create/update로 바꾸어 누락을 덮지 않는다.

## 2. SQL012 변경 명세

신규 **7개 테이블**. 애플리케이션 소유 테이블 총 **40개**(기존33+7)이며 Supabase auth/storage 등 시스템 테이블은 제외한다.

| 테이블 | 데이터·검토사항 |
|---|---|
| `support_ticket` | 신고/문의/관리권 접수, UUID, 작성자 또는 guest조회키해시, 대상/public snapshot, 상태/revision/담당자/결과. 비회원은INQUIRY만 |
| `support_message` | 공개답변(작성자에게만)과 관리자내부메모, UUID재전송hash. PUBLIC은 인터넷공개를 뜻하지 않음 |
| `support_action` | 상태·담당·정정결과·심사·회수의 관리자실제ID/시각/사유 |
| `support_attachment` | 비공개객체키·형식·크기·hash·소유자/티켓. PUBLIC이미지테이블과 별도 |
| `exhibitor_manager` | 특정업체+계정 관계/승인근거/회수/버전, 권한은CORRECTION_REQUEST만 |
| `support_rate_limit` | 해시화한 제한키+시간대별카운트. 자동정리job없음 |
| `application_action` | 신청 전후상태·사유·처리자·버전; application 삭제시FK는null, 원래ID application_ref는보존 |

기존 테이블 변경:

| 테이블 | 변경 |
|---|---|
| `event_booth` | `version bigint not null default 0` 추가. 기존 데이터version만0, JPA낙관잠금+결정CAS에 사용 |
| `subculture_catalog_review_history` | `actor_id bigint references app_user(id)` 추가. 과거행의 처리자를 임의추정하지 않음 |

- [ ] 새PK/FK/CHECK/상태값/작성자구분/접수크기와 인덱스를 확인했다.
- [ ] pending관리권 신청 unique조건, 기존관계 승인/회수와 신규신청을 검증했다.
- [ ] 운영신청 WITHDRAWN 상태를 소비하는 타시스템이 있는지 확인했다.
- [ ] 기존타시스템이 event_booth를직접UPDATE하면version정합성이 깨질 수 있으므로 API통과 정책을 정했다.
- [ ] CREATE IF NOT EXISTS가 수동으로만든잘못된동명테이블을 고쳐주지 않는다는 점을 확인했다.

## 3. JDBC 역할·RLS·Data API

- [ ] SQL실행역할과 Spring `DATABASE_USERNAME`의 실제 DB역할을 구분했다.
- [ ] 같은 DB를 사용하는 다른 앱이 새/기존앱테이블을 Data API로직접읽는지 확인했다.
- [ ] SQL012 적용 시 `boothhana.backend_role`을 실제 기존 서버역할로 지정했다. 지정하지 않으면 현재SQL실행역할에grant되므로 서버와다르면readiness실패 가능.
- [ ] backend_role이 PUBLIC/anon/authenticated가 아니고, 위험한상호멤버십이 없다.
- [ ] 새7테이블에 RLS 활성화, PUBLIC/anon/authenticated 테이블·컬럼권한회수, restrictive deny정책이 확인된다.
- [ ] 서버역할에만 필요한 schema usage/CRUD/owned sequence권한과 서버RLS정책이 있다. 권한부족을일반API전체허용으로해결하지 않는다.
- [ ] 일반 브라우저역할로 support 본문·guest_secret_hash·첨부key·심사메모·처리이력을 조회/변경할 수 없다.
- [ ] RLS설정은 서버코드의 본인접수검사와별개이며 두경로 모두검증했다.
- [ ] SQL011의 기존33테이블 보호와 SQL012의 새7테이블 보호를 같이확인했다. 미래테이블을자동보호한다고가정하지 않는다.
- [ ] readiness에 새40테이블·event_booth.version·review actor_id가 반영됐다. `/api/public/health/ready`200은 실제정정정확성/비공개버킷설정까지보증하지 않는다.

예시 절차(실제 역할명을 확인해 같은 세션에서 설정; 비밀번호는 넣지 않음):

```sql
-- 아래 역할명은 예시이므로 실제 JDBC역할로 바꾼 뒤 실행한다.
-- SET boothhana.backend_role = 'your_actual_backend_role';
-- 이후 같은 세션에서 database/012_support_and_relationships.sql 실행.
-- 읽기 전용 사전 점검은 verification/v12/db_preflight_readonly.sql.
```

## 4. 비공개 첨부 준비

- [ ] SUPPORT_PRIVATE_BUCKET은 기존 R2_BUCKET과 다르게 만들었다.
- [ ] 해당 버킷에 r2.dev와public custom domain이 없고, 기존R2_PUBLIC_URL을 연결하지 않았다.
- [ ] 인증되지않은 HTTP접근으로 테스트객체가보이지 않는지확인했다. 'private/'prefix명만으로보호하지 않는다.
- [ ] 서버R2토큰의bucket범위를확인하고브라우저/collector에키를주지않았다.
- [ ] 먼저 SUPPORT_ATTACHMENTS_ENABLED=false로본문접수를확인했다. 파일보안테스트를 통과한 뒤 true로변경한다.
- [ ] 허용형식JPEG/PNG/WebP,5MiB/5개,실제body·hash·owner검사·변경된파일다운로드거절을 확인했다.
- [ ] MIME/시그니처검사는백신·완전디코딩·개인정보삭제가 아니다. 악성파일/메타데이터/민감정보가림정책을정했다.
- [ ] 업로드성공+DB실패의고아객체를참조대조후정리하는절차가있다. 티켓삭제편의로공개된원본이나정상첨부를삭제하지 않는다.

## 5. 비회원·연락·남용방어

- [ ] SUPPORT_GUEST_ENABLED=false가초기값임을확인하고오픈전에로그인장애연락수단을마련했다.
- [ ] guest기능을켜려면 SUPPORT_RATE_SECRET 32자이상난수와 HTTPS/CSRF/프록시제한/보관안내를검토했다.
- [ ] 키30일만료는조회권만료이며DB보관삭제정책과별개임을명시했다.
- [ ] 이메일검증/자동메일/SMS가없고,사용자가ID+비밀키로직접조회한다는안내를확인했다.
- [ ] 키분실복구미제공·키파일비공개보관·URL/로그/localStorage미저장·만료후POST생성재전송조회차단을검증했다.
- [ ] guest접수는로그인장애ACCOUNT만,회원예약소유권추정/첨부/관리권신청이차단된다.
- [ ] IP를프록시가신뢰가능하게전달하도록정리했다. rate설정이공유NAT/전역DoS를완전히해결하지않음을확인했다.
- [ ] 레이트제한별도트랜잭션에 필요한커넥션풀여유/동시성을점검했다.

## 6. 보관·삭제·정정 운영 정책 — 결정 필요

- [ ] 신고/문의/관리권증빙/내부메모/첨부/처리이력의실제보관기간·열람권한·삭제담당자를정했다. 임의의법정기간을가정하지 않는다.
- [ ] 문의첨부에개인정보를가리도록안내하고,삭제요청/소유권분쟁처리절차를정했다.
- [ ] support_rate_limit 만료행및참조없는스토리지의정리주기와검증/backup을정했다. 이번버전에자동정리job은없다.
- [ ] 소유권FK와신고이력참조를대조해탈퇴·계정삭제시보존/익명화절차를정했다. 단순CASCADE삭제로처리하지않는다.
- [ ] 신고완료는실제수정·공개반영과연결하고,잘못된예전지도/정정전정보가배치로다시공개되지않게확인했다.
- [ ] 관리자승인기준/담당자배정/처리기한/미답변알림체계(외부운영도구)를정했다. 구현에자동알림은없다.
- [ ] DB체크리스트/개인정보안내/서버로그에 실제본문·키·증빙을복사해공개하지않는다.

## 7. 실제 DB 테스트·롤백

- [ ] SQL012를스테이징에서실행하고최초적용/동일재실행/중간오류롤백을확인했다.
- [ ] 두ADMIN동시답변·관리권심사/회수·참가승인경합,create/reply재전송,rate실패영속화를 실제PostgreSQL에서검증했다.
- [ ] 공개정정실패시티켓/수동정정/public snapshot이함께rollback되는지검사했다. R2는별도정리필요.
- [ ] 기존 선택형DB테스트가 `public`schema삭제/TRUNCATE를 수행할수있어 운영 DB변수를설정하지 않았다. 로컬포트포워딩으로운영DB에연결하지도 않는다.
- [ ] v12에서운영DB테스트를실행했다고가정하지않고실제결과를배포기록에남겼다.
- [ ] 코드복구는프런트/백엔드를함께하고새테이블/권한/티켓데이터는즉시삭제하지않는다. 일반API권한을다시열지 않는다.

**검토·실행 전입니다.** [배포 절차](FULL_V12_KO.md)와 [실제 검증 범위](../../TEST_RESULTS_KO.md)를 함께 확인하세요.
