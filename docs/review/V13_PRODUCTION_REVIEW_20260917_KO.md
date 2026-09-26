# BoothHana2 v13 — 운영 배포 기준 코드리뷰

검토일: 2026-09-17 · 판정: **NO-GO (운영 배포 승인 보류)**

## 1. 검토 대상을 먼저 고정

- 기준: `BoothHana2-full-v13-20260917.zip`
- SHA-256: `c5f5ecb1e4bccddea2d7a53d36c3da68df145c0083b43467279ea44c954606e1`
- 원본: 723개 파일, 40,127,612 bytes. 실제 ZIP CRC와 추출한 원본 파일 일치를 확인했다.
- 존재하지 않았던 과거 v13 주장을 재사용하지 않았다. 이번에 읽은 것은 재구축 후 실제 첨부된 ZIP이다.
- **애플리케이션 코드·SQL·GitHub·운영 DB·배포·예약 작업은 변경하지 않았다.** 이번 추가물은 검토·승인 체크리스트·재현 코드·실행 로그다.

## 2. 판단 요약

v12 리뷰의 다섯 문제를 고친 코드는 실제로 존재하며 v13의 독립 검사가 통과했다. 하지만 그 사실만으로 운영 배포를 승인할 수 없다.

| 구분 | 판단 | 확인 수준 |
|---|---|---|
| R13-01 · 정정 완료 판정 | **수정 필요 / P1** | 실제 SupportTargets와 SupportService 메서드로 재현. DB·공개 조회 경계는 모의 |
| R13-02 · 예약/POS 재전송 | **거래 기능 공개 전 수정 필요 / P1** | 실제 생성 메서드 본문·재고 규칙 실행. 메모리 저장소, 유효한 공개·소유권 fixture |
| R13-03 · 중첩 트랜잭션 연결 사용 | **조건부 운영 위험 / P2** | 실제 호출 경로와 공식 Spring 동작 대조. 실제 풀 부하 재현은 안 함 |
| G13-01 · 배포 승인 검사 범위 | **미충족 / 승인 차단** | 실제 빌드·게이트 시도 및 실행기·테스트·Dockerfile 검토 |
| D13-01 · 실행 안내 명령 | **문서 수정 필요** | 실제 MD에 수직탭·캐리지리턴 제어문자 확인 |

첫 두 항목은 운영 데이터의 신뢰성과 직접 연결된다. R13-03은 모든 요청에서 발생한다는 뜻이 아니며 실제 배포의 동시 요청·풀 구성에 따라 달라진다. G13-01은 환경 때문에 통과하지 못한 검증이지, 소스가 반드시 컴파일 불가능하다는 확정 결함은 아니다.

## 3. 이전 v12 리뷰 수정 확인

| 이전 지적 | v13에서 확인한 보완 | 남은 검증 |
|---|---|---|
| 비공개 대상의 404가 트랜잭션을 취소 | `findPublicDetail` / `findPublicPlans`의 Optional 반환과 호출 경로 변경 | 실제 Spring 프록시·DB 커밋/롤백 |
| 배치도 재공개 시각만 바뀌어도 정정 완료 | `SupportComparison.FLOORPLAN_CONTENT_V2`가 실제 도면 내용을 선택적으로 비교 | 아래 R13-01처럼 다른 신고 대상에도 일관된 기준 필요 |
| 사진만 보완하면 WAITING_USER 유지 | 신규 첨부 저장 시 OPEN, 같은 업로드 ID는 상태 재변경 전에 반환 | 실제 R2 성공·응답 유실·DB 롤백 |
| 대화 200건에서 관리자 필수 처리 차단 | DIALOGUE / SYSTEM 구분, 관리자 전용 시스템 안내 | 실제 SQL013·제약·권한 회수 트랜잭션 |
| 불명확한 접수 실패 후 중복 생성 | 최초 requestId 유지, 본인 receipt 조회, 불명확한 상태에서 폼 보호 | 실제 브라우저 새로고침·로그인 변경·지연 응답 |

관련 원본: [SupportComparison](../../backend/src/main/java/com/boothhana/support/SupportComparison.java), [SupportAttachments](../../backend/src/main/java/com/boothhana/support/SupportAttachments.java), [SupportService](../../backend/src/main/java/com/boothhana/support/SupportService.java), [TicketSubmission](../../frontend/src/features/support/submission.ts), [SQL013](../../database/013_support_reliability.sql).

## 4. R13-01 — 상품·부스 신고는 마지막 확인 시각만 바뀌어도 정정 완료된다

### 사용자 영향

가격 오류나 부스 위치 오류를 신고했는데 실제 가격·위치는 그대로인 상태에서, 관리자의 ‘공개 변경 확인 후 완료’가 **정보 수정 완료(RESOLVED / UPDATED)**로 처리될 수 있다.

수집 배치가 자동으로 신고를 닫는다는 뜻은 아니다. **운영자가 완료 버튼을 눌렀을 때 서버의 ‘실제로 변경됐는지’ 검사가 관리용 시각 변경을 통과시키는 문제**다. 의미상 해결 여부는 관리자 판단이지만, 그 판단을 보조하는 변경 방어가 약하다.

### 코드 근거

- [SupportTargets.java](../../backend/src/main/java/com/boothhana/support/SupportTargets.java) 42~45행: PARTICIPANT는 전체 참가자 공개 객체, PRODUCT는 전체 `ProductRow`를 `data`에 넣는다.
- 같은 파일 72~80행: FLOORPLAN에만 전용 비교 투영을 적용하고 다른 대상은 `data` 전체 해시를 쓴다.
- [CatalogModels.java](../../backend/src/main/java/com/boothhana/collection/CatalogModels.java) 66~67행: `ProductRow`는 `ProductCheck(state,lastSeenAt)`를 포함한다.
- [CatalogService.java](../../backend/src/main/java/com/boothhana/collection/CatalogService.java) 223~241행: 다시 관찰된 상품의 `last_seen_at` 갱신. 이후 누적 확인 정보를 만든다.
- [CatalogPublicationService.java](../../backend/src/main/java/com/boothhana/collection/CatalogPublicationService.java) 39~50행: 검토된 상품과 `verification`을 공개 스냅샷에 포함한다.
- [SupportService.java](../../backend/src/main/java/com/boothhana/support/SupportService.java) 140~154행: 현재 fingerprint가 다르면 `VERIFY_CHANGED`로 UPDATED 처리를 허용한다.

### 이번 재현

동일한 상품명·설명·가격·판매상태와 동일한 부스명·B1 위치를 유지했다. `verification.state`도 유지하고 `verification.lastSeenAt`만 다음 주로 바꿨다.

| 대상 | 변경 없음 대조군 | 마지막 확인 시각만 변경 |
|---|---|---|
| 상품 가격 신고 | 409, 완료 거절 | **RESOLVED / UPDATED 허용** |
| 참가 부스 위치 신고 | 409, 완료 거절 | **RESOLVED / UPDATED 허용** |

로그: [timestamp-correction-reproduction.log](../../verification/release_review_v13/results/timestamp-correction-reproduction.log)

실제 메서드를 실행했지만 공개 서비스 응답·JDBC·JSON 경계는 제공된 테스트 대역이다. 실제 SQL 저장이나 HTTP·Spring 트랜잭션을 실행한 재현으로 읽으면 안 된다.

### 수정 설계 및 완료 기준

1. EVENT/PARTICIPANT/PRODUCT/ASSET/FLOORPLAN 각각 **업무 내용 비교 규격**을 정의한다. 원문·열람용 기록은 그대로 보관하되, 마지막 수집·검토·공개 시각은 그 자체로 정정 증거로 쓰지 않는다.
2. 참가 부스 위치 신고는 상품의 확인일 변경으로 해결 판정하지 않도록 대상·사유별 비교 범위를 명시한다. 단순히 메타데이터 키 하나만 삭제하는 보완으로 끝내지 않는다.
3. 비교 버전을 모든 대상에 적용한다. 과거 접수의 해시를 현재 값으로 일괄 덮어쓰지 말고, 당시 snapshot으로 재투영 가능한지 구분한다. 자료가 없으면 비교 제한과 수동 검토 사유를 남긴다.
4. 실제 공개 절차와 DB를 거쳐 ‘시각만 변경 → 거절’, ‘가격·위치 변경 → 변경 감지’, ‘변경 없는 재공개 → 거절’, ‘공개 중지 → HIDDEN’이 일치해야 한다.
5. 변경 감지는 해결의 진실성을 자동 보증하지 않는다. 최종 사용자 답변·처리 근거는 관리자 책임으로 남긴다.

## 5. R13-02 — 예약·POS에는 문의와 같은 재전송 보호가 없다

### 사용자 영향

서버가 예약 또는 POS 판매를 저장한 직후 응답만 유실됐다고 하자. 사용자가 실패 메시지를 보고 다시 누르면, 서버는 같은 논리 요청을 새 거래로 처리할 수 있다.

```text
재고 10개 / 같은 요청은 2개 구매
첫 요청 저장 완료 → 재고 8개 / 성공 응답 유실
사용자가 재시도  → 재고 6개 / 예약 또는 판매 2건
```

POS는 한 번의 현장 판매를 두 번 기록할 수 있고, 순위 집계도 정상 판매 두 건으로 읽을 수 있다. 예약은 팬의 의도보다 재고를 더 점유한다. **온라인 결제가 중복 청구된다는 의미는 아니다.** 현재 POS는 판매 기록이며 실제 PG 결제를 실행하지 않는다.

### 코드 근거

- [ApiModels.java](../../backend/src/main/java/com/boothhana/api/ApiModels.java) 53·56행: `ReservationInput`, `PosInput`에는 요청 식별자가 없다.
- [PlatformService.java](../../backend/src/main/java/com/boothhana/service/PlatformService.java) 206~216·244~250행: 매 호출마다 번호와 새 행을 생성하고 재고를 차감한다.
- [frontend API](../../frontend/src/api/index.ts) 30~36·76~77행: 요청은 부스·상품수량·결제수단만 전달한다.
- [ReservationPages.tsx](../../frontend/src/pages/ReservationPages.tsx) 32~46행과 [CreatorPages.tsx](../../frontend/src/pages/CreatorPages.tsx) 110~121행: 화면 내 진행 중 클릭 방어는 있지만, 통신 오류가 끝나면 다시 제출할 수 있다.

재고 행 잠금은 **동시에 발생한 재고 경쟁**을 다루는 것이지, **재시도가 같은 요청인지** 구분하지 못한다. 두 요청이 순서대로 실행돼도 발생한다. 이 문제는 v13 지원 기능 수정으로 새로 생긴 회귀가 아니라 기존 거래 API의 남아 있는 운영 요건이다.

### 이번 재현 경계

원본 `createReservation` / `createPos` 메서드 본문을 그대로 추출하고 실제 `InventoryOperations`, `StockRules`, `RecordNumbers`, DTO·엔티티와 함께 컴파일했다. 공개·소유권 조건은 유효한 fixture, 저장소는 메모리 대역이다. 똑같은 객체를 두 번 전달했을 때 각각 두 기록과 재고 6개를 확인했다.

로그: [trade-replay.log](../../verification/release_review_v13/results/trade-replay.log). 메서드 추출 SHA도 기록했다. 이는 **로직 수준 재현**이며 JDBC 커밋·실제 네트워크 응답 유실을 실행한 것은 아니다.

### 수정 설계 및 완료 기준

- 인증 주체 + 작업 종류 + 요청 ID에 유일성을 부여하고 최초 입력 내용 해시·결과 ID를 같은 트랜잭션에 저장한다.
- 같은 ID·같은 입력은 기존 결과 반환, 같은 ID·다른 입력은 409. 새 의도로 같은 물건을 다시 사는 경우는 새 ID로 허용한다. 동일 장바구니라는 이유만으로 정상 반복 구매를 합치지 않는다.
- 클라이언트는 성공 여부 불명확 시 ID와 최초 요청을 유지하고 확인/재전송 UI를 제공한다. POS와 예약 모두 적용한다.
- 실제 DB에서 동시 동일키·응답 유실·커밋 직전 오류·재시작·입력 변경을 검사한다. 거래 기록·항목·재고 변경은 전부 1회이거나 전부 롤백돼야 한다.
- 필요한 DB 변경은 별도 마이그레이션 검토 대상이다. 이 리뷰에서는 SQL014를 임의 작성·적용하지 않았다.
- 거래 기능을 출시 범위에서 제외하려면 메뉴만 숨길 것이 아니라 서버 경로도 명시적으로 제한하고 범위 변경을 승인해야 한다. 현재 ZIP에 그런 비활성화가 있다고 가정하지 않는다.

## 6. R13-03 — 지원 요청이 DB 연결을 중첩 사용한다

**조건부 운영 위험이다. 실제 장애·교착을 재현했다고 주장하지 않는다.**

[SupportService](../../backend/src/main/java/com/boothhana/support/SupportService.java)의 create/message/action/guest 요청은 이미 트랜잭션 안에서 데이터와 잠금을 사용한 뒤 `limit()`을 호출한다. [SupportRateLimiter](../../backend/src/main/java/com/boothhana/support/SupportRateLimiter.java) 12~13행의 `REQUIRES_NEW`는 별도 트랜잭션이다.

```text
요청별 외부 작업이 연결 A를 점유
→ 레이트 카운터를 기록하려 연결 B를 추가 요청
→ 다수 요청이 외부 연결을 이미 점유했다면 내부 연결 대기
```

첨부는 [SupportAttachments](../../backend/src/main/java/com/boothhana/support/SupportAttachments.java) 15~34행에서 DB 작업 안에 파일 읽기·R2 전송도 포함하므로 오래 걸릴 때 연결과 행 잠금을 유지한다.

Spring 공식 문서는 `REQUIRES_NEW`의 이러한 풀 고갈 가능성을 명시한다. [공식 트랜잭션 전파 문서](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html). 다만 현재 운영 풀 크기·최대 동시 요청·인스턴스 수는 확인하지 않았다.

### 보완 선택지

- 실패 요청도 횟수 제한에 반영하려는 정책을 유지하면서, 짧은 제한 확인을 외부 업무 트랜잭션 전에 수행하는 facade로 분리하거나 별도 제한 저장소·제한된 풀을 사용한다.
- 동시 실행 상한, 풀 용량, 풀 획득·SQL·스토리지 제한시간을 실제 배포 설정으로 고정한다. 막연히 풀 크기만 올리면 충분하다고 보지 않는다.
- 첨부는 검증/외부 파일 작업과 최종 DB 연결 확정을 분리하되, 새 흐름에서도 인증·상태 변경·응답 유실·고아 객체 처리를 유지해야 한다.
- 운영과 같은 풀 설정으로 동시성 경계(풀 크기보다 작음/같음/큼), 느린 R2·느린 업로드·실패율을 측정한다. 승인한 처리량에서 지속적인 풀 획득 시간초과나 데이터 불일치가 없어야 한다.
- SQL과 데이터보호를 무시하고 모든 예외의 롤백을 끄거나 REQUIRES_NEW만 제거하는 단순 변경은 금지한다.

## 7. G13-01 — 현재 검증기는 운영 승인 전체를 검사하지 않는다

실제 [release_gate.py](../../verification/v13/release_gate.py)는 프런트 lint/build, Gradle tests, 특정 support JUnit XML의 8건 이상·실패/건너뜀0, bootJar를 확인한다. 설정이 없으면 NOT READY로 중단하는 것은 올바르다.

그러나 [SupportReliabilityPostgresTests](../../backend/src/test/java/com/boothhana/support/SupportReliabilityPostgresTests.java) 43~69행과 fixtureDdl은 **지원 기능의 축소 스키마 + SQL013**을 사용한다. 실제 운영 SQL001~013 전체·40개 테이블·RLS·시퀀스·JPA/JDBC 결합·HTTP 인증·실제 R2를 모두 검사하지 않는다. 레이트 제한기 역시 mock이므로 R13-03을 검출하지 못한다. 이 테스트의 범위 제한은 원문 주석에도 명시되어 있다.

또한 원본 ZIP에 CI workflow는 없고, [Dockerfile](../../backend/Dockerfile)은 `bootJar`만 실행한다. `bootJar` 작업 의존성만으로 `test`가 수행되는 구성은 이 build.gradle에 없다. **검증기 파일이 존재한다는 것과 배포 전에 실행이 강제된다는 것은 다르다.** 외부 GitHub 보호 규칙·호스팅 파이프라인은 이번 ZIP으로 확인할 수 없다.

### 승인까지 필요한 보강

1. 실제 라이브러리·lockfile 기반의 clean install, lint, 전체 타입/번들/Java 빌드를 필수 검사로 둔다.
2. 전체 애플리케이션 컨텍스트와 HTTP 계층을 띄운다. Spring Boot의 `@SpringBootTest`와 실제 서버 `RANDOM_PORT`는 이 목적에 사용할 수 있다. [공식 Spring Boot 테스트 문서](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html).
3. 별도 깨끗한 PostgreSQL과 실제 마이그레이션 전체, 최소권한 서버 역할 및 비로그인/일반 사용자 역할에서 실제 읽기·쓰기 검사를 수행한다.
4. 아래 승인 체크리스트의 권한·동시성·브라우저·외부 연결·복구 증거를 릴리스 SHA와 연결한다.
5. 필수 검사 건너뜀·미실행·누락은 승인 실패로 처리한다. 다른 파괴적 DB 테스트를 같은 DB에 병렬 실행하지 않는다.
6. 위 검사를 통과하지 않으면 보호된 배포 브랜치·배포 작업이 진행되지 않도록 운영 파이프라인에 연결한다.

readiness200, ZIP 무결성, 모의검사 수백 건은 위 증거를 대체하지 않는다. 다음 체크리스트는 제안하는 승인 기준이며 이미 통과한 결과가 아니다.

## 8. D13-01 — 실행 안내의 Python 경로가 제어문자로 손상됐다

원본 `docs/deployment/FULL_V13_KO.md` 30행에 다음 제어문자가 실제 존재한다.

```text
python .<U+000B>erification<U+000B>13<U+000D>elease_gate.py
```

복사해서 실행하는 사용자에게 정상 경로가 전달되지 않는다. 원본 소스는 리뷰에서 고치지 않았다. 새 승인 체크리스트에는 안전한 슬래시 표기를 적었다.

```powershell
python verification/v13/release_gate.py
```

로그: [documentation-controls.json](../../verification/release_review_v13/results/documentation-controls.json). 문서의 출력 문제로 보고하며 Windows에서 실제 해당 오류를 실행 재현한 것은 아니다.

## 9. 이번 실행 기록과 한계

| 검사 | 실제 결과 |
|---|---|
| v13 독립 지원 검사 | 종료0. 기존 service49 / 신규 reliability24 / retry29 / UI55 및 명시적 외부 stub 타입·구문 검사 |
| 수집기 Python | 170 tests, OK. 가짜CLI/로컬 모의HTTP이지 실제 외부 검색 아님 |
| 신규 정정 판정 재현 | 상품·참가부스 각 시각만 변경 시 RESOLVED/UPDATED. 변경 없음 대조는409 |
| 신규 거래 재전송 재현 | 예약·POS 각 생성 본문 2회, 레코드2개·재고6. 메모리 경계 |
| 실제 프런트 빌드 시도 | exit1, TS2688 vite/client·node 타입 의존성 미설치 |
| 실제 Gradle test 시도 | exit1, services.gradle.org DNS 오류. 실제 backend 컴파일 진입 못함 |
| 실제 release_gate 시도 | exit2 / NOT READY. 전용 PostgreSQL 설정 미제공 |
| 실제 PostgreSQL·Docker | 현재 실행 도구/서버 없음. 운영 DB를 대신 연결하지 않음 |
| 원본 ZIP·파일 대조 | CRC 정상, 723개 원본 파일 수정·누락0 |

추가 미실행: 실제 선언 의존성의 전체 빌드, dependency 취약점 스캔, 전체 마이그레이션·RLS·실제 HTTP, 카카오·실R2·Codex, 실물 휴대전화·브라우저, 부하·백업복원. 운영 데이터나 외부 행사 목록을 이번 재현의 fixture로 사용하지 않았다.

테스트 조건 수는 커버리지나 품질 점수가 아니다. 발견을 재현하는 스크립트가 exit0으로 끝났다는 것은 **문제가 재현됐다는 뜻이지 코드가 수정됐다는 뜻이 아니다.**

## 10. 최종 권고

**새 기능을 추가하지 않고 R13-01과 R13-02를 수정한 다음, 실제 환경에서 승인 체크리스트를 통과시켜야 한다.** R13-03은 구성·구조 보완 또는 해당 부하의 안전성을 입증해야 한다. ‘스테이징 검증 필요’라는 문구만 남기고 운영 승인으로 바꾸지 않는다.

현재 판정은 전체 서비스 공개 **NO-GO**이며, 수정·통합검증을 위한 내부 스테이징 구성은 다음 단계로 진행할 수 있다. 일부 기능만 출시하려면 기능 범위·서버 차단·각 남은 위험을 따로 승인해야 하며, 그것도 이번에 승인된 상태는 아니다.

[운영 배포 승인 체크리스트](../deployment/V13_PRODUCTION_ACCEPTANCE_20260917_KO.md)
