# BoothHana2 v12 코드리뷰

검토일: **2026-09-17**  
대상: `BoothHana2-full-v12-20260917.zip`  
원본 SHA-256: `06843235f43177bfaed92e025e3a9ac66b755bd4d999caa48b2c29b787320cb1`

## 결론

**수정이 필요한 5개 항목을 확인했다.** 4개는 실제 v12 Java 서비스 또는 TSX 핸들러를 명시적인 모의 경계에서 실행해 재현했다. 1개는 실제 호출 경로·트랜잭션 선언과 Spring 공식 동작을 대조한 결과이며, 실제 Spring·PostgreSQL 실행으로 재현하지 않았다.

이번 검토의 중심은 v11→v12에 추가된 신고·문의, 비공개 첨부, 업체 관리권, 기존 신청·로그인 보완이다. 전체 코드에 대한 완전한 보안감사·성능검증이나 운영 장애 관측이 아니다. **코드·SQL·DB·GitHub·배포·예약 작업은 변경하지 않았다.** 원본 690개 파일을 바이트 단위로 대조해 수정·누락·추가가 모두 0개임을 확인했다.

| ID | 우선순위 | 발견 내용 | 확인 방식 |
|---|---|---|---|
| R12-01 | P1 | 행사 숨김 후 정상적인 404 조회가 전체 처리 트랜잭션을 롤백시킬 수 있음 | 실제 호출·Spring 트랜잭션 규칙 대조. 프레임워크 통합 미실행 |
| R12-02 | P1 | 배치도를 고치지 않고 다시 공개한 시각만 바꿔도 신고를 정정 완료할 수 있음 | 실제 SupportTargets·SupportService + 모의 JDBC/공개 서비스 |
| R12-03 | P2 | 추가 자료로 사진만 제출하면 ‘추가 정보 대기’ 상태가 유지됨 | 실제 추가 정보 요청·첨부 업로드·조회 메서드 + 모의 저장소 |
| R12-04 | P2 | 대화 200건 한도가 관리자 처리와 업체 관리권 회수를 막음 | 실제 승인→회수 메서드의 409 반환 재현. 실제 롤백 미실행 |
| R12-05 | P2 | 접수 응답 유실 후 같은 폼의 내용을 수정해 재시도하면 별도 접수 ID가 생성됨 | 실제 SupportNewForm 핸들러 + 모의 전송·저장 |

P1은 핵심 정정·공개 제어에 영향을 주어 공개 전 수정할 항목이다. P2는 조건부 사용자·운영 흐름 결함이다. R12-04의 관리 관계는 CORRECTION_REQUEST 범위이며, 무제한 편집·예약·POS 권한이 아니다.

## R12-01 — 행사 공개 중지와 정상적인 ‘비공개’ 조회가 충돌한다

### 사용자·관리자에게 미치는 영향

관리자가 잘못된 행사를 `대상 공개 중지 후 완료`로 처리했지만, 요청이 500 오류로 끝나고 행사 숨김·신고 완료가 함께 취소될 수 있다. 이미 다른 화면에서 행사가 비공개된 경우에는 해당 행사와 연결된 신고의 관리자 상세 조회도 같은 예외 경로의 영향을 받을 수 있다.

**이 현상을 실제 운영 DB에서 관측한 것은 아니다.** 현재 코드가 사용하는 기본 Spring 트랜잭션 설정을 전제로, 롤백 경로가 성립하는 것을 확인했다.

### 근거 코드

- [SupportResolutionService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportResolutionService.java) **43–57, 63–66행**: `hide()`는 `@Transactional`; 행사를 EXCLUDED로 바꾼 뒤 같은 작업 안에서 공개 대상 재조회.
- [SupportTargets.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportTargets.java) **37, 74행**: 다른 서비스의 공개 조회를 호출하고, 그 404를 나중에 잡아 `visible=false`로 바꿈.
- [CatalogPublicationService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/collection/CatalogPublicationService.java) **13–14, 93–95행**: 클래스에 `@Transactional(readOnly=true)`; EXCLUDED 행사는 조회하지 않고 `ApiException.notFound` 발생.
- [ApiException.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/api/ApiException.java) **5–9행**: 404도 RuntimeException 계열.
- [SupportService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportService.java) **15–16, 37–58행**: 관리자 상세 응답에서 현재 공개 대상을 조회함.
- [ApiExceptionHandler.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/api/ApiExceptionHandler.java) **49–58행**: 별도로 분류되지 않은 예외는 문의 코드가 있는 일반 500으로 처리.

```text
SupportResolutionService.hide() — 외부 트랜잭션
  → catalog.editEvent(EXCLUDED)
  → SupportTargets.current()
      → CatalogPublicationService 프록시 → detail()
          → RuntimeException인 404 발생
          → 참여 중인 트랜잭션을 rollback-only로 표시
      → current()가 404를 잡아 visible=false 반환
  → 숨김 성공으로 판단하고 티켓 완료 처리
  → 외부 commit 시 UnexpectedRollbackException / 롤백
```

Spring 공식 문서는 기본 REQUIRED 전파에서 내부·외부가 같은 물리 트랜잭션을 사용하고, 내부 rollback-only가 외부 commit에 영향을 준다고 설명한다. 기본적으로 RuntimeException은 롤백 대상이다. 내부 조회가 read-only라는 사실만으로 외부 쓰기 트랜잭션과 분리되지 않는다.

- [Spring Transaction Propagation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-propagation.html)
- [Spring Rolling Back](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html)

### 수정 방향

비공개/삭제 여부처럼 예상 가능한 상태는 **예외를 던지지 않는 공개 가시성 조회**로 반환해야 한다. 정상적인 `존재하지 않음`은 Optional/결과 객체로 다루고 실제 DB 장애는 실패로 전파한다. 숨김·정정·신고 처리의 원자성은 유지한다.

모든 ApiException의 롤백을 끄거나 숨김 후 확인을 무조건 REQUIRES_NEW로 분리하는 수정은 권장하지 않는다. 전자는 실제 실패를 커밋할 수 있고, 후자는 같은 작업에서 아직 커밋되지 않은 숨김을 보지 못할 수 있다.

### 필요한 회귀

실제 Spring 프록시와 전용 PostgreSQL에서 `행사 숨김 → 비공개 확인 → 신고 완료 → commit`을 검사한다. 숨겨진 행사의 신고 상세 조회, 외부에서 이미 비공개된 대상, 실제 SQL 오류에서는 전체 변경 롤백도 확인한다. 현재 모의 서비스는 트랜잭션 프록시를 만들지 않아 이 오류를 검출하지 못한다.

## R12-02 — 배치도 공개 시각만 바뀌어도 ‘정보 수정 완료’가 된다

### 실제 재현

동일한 배치도 ID, 이미지, 좌표, 부스번호, 참가자 연결을 유지하고 `publishedAt`만 변경했다. 실제 신고 생성·변경 확인 메서드 실행 결과:

| 입력 변화 | 결과 |
|---|---|
| 이미지·좌표·부스 연결 변화 없음 | 그대로 유지 |
| 공개 시각만 00:00 → 01:00 | fingerprint 변경 |
| 관리자 `VERIFY_CHANGED` 실행 | **RESOLVED / UPDATED** 허용 |

현재 설계는 ‘단순 공개 시각 변경을 정정 증거로 사용하지 않는다’고 명시하지만, 배치도는 예외가 되어 있다. 이 테스트는 **실제 SupportTargets/SupportService 코드와 모의 JDBC·공개·지도 응답**을 사용했으며 실제 SQL 저장·브라우저 클릭은 실행하지 않았다.

### 원인·근거

- [SupportTargets.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportTargets.java) **48–54, 70–74행**: 배치도 객체를 복사할 때 shapes만 제거하고 `publishedAt`은 내부 data에 남김. fingerprint는 data 전체로 계산.
- [SupportService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportService.java) **112–123행**: 기존 fingerprint와 다르면 UPDATED 완료 허용.
- [FloorplanService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/floorplan/FloorplanService.java) **168–177, 211–215행**: 같은 버전을 재공개할 수 있고 공개 시각을 갱신·반환함.

영역을 지정하지 않은 전체 배치도 신고에서는 shapes를 전부 제거한 뒤 특정 selectedShape도 넣지 않는다. 즉 접수 당시 전체 좌표·매핑을 비교할 자료도 부족하다. 영역별 신고에는 해당 selectedShape가 보관되므로 두 경우를 구분해야 한다.

### 수정 방향

**접수 당시 원문/공개 시각 같은 출처 기록과 실제 비교할 내용**을 구분한다. 배치도 비교에는 원본 해시, 적용 날짜·홀, 좌표, 해당 영역의 번호·참가자 연결·가시성 등을 명시적으로 사용하고, 공개 시각·관리자 열람 시각 등은 제외한다.

전체 배치도는 신고 당시 불변 버전과 좌표·매핑을 다시 읽을 수 있는 참조 또는 정규화된 내용 해시를 보존한다. 실제 정정이 신고 내용을 해결했는지에 대한 관리자 판단은 그대로 필요하다.

회귀: 시각만 변경하면 완료 거절; B1 좌표 또는 연결 대상 변경은 변경으로 감지; 전체 배치도/특정 영역의 비교 범위 차이; 사용 권한 철회·지도 폐기 시 숨김 결과 검사.

## R12-03 — 사진만 보완하면 계속 ‘추가 정보 대기’로 남는다

### 실제 재현

```text
관리자: 오류 화면 사진을 보내 달라고 추가 정보 요청
  → WAITING_USER
사용자: 내 문의에서 정상 PNG 1장 업로드
  → 파일 저장 완료, 접수 revision 증가
  → 상태는 계속 WAITING_USER
```

실제 `SupportService.action()`과 `SupportAttachments.upload()`를 실행해, 첨부 1개가 저장되고 revision이 1→2로 증가한 뒤에도 상태가 유지되는 것을 확인했다. 외부 R2 대신 명시적인 메모리 저장소와 가짜 JDBC를 사용했다.

이는 관리자에게 파일이 전혀 보이지 않는다는 의미는 아니다. updated_at은 변경된다. 다만 사용자는 자료를 제출했는데도 계속 추가 정보를 기다리는 상태로 보고, 운영자는 사용자 응답 대기 필터에서 잘못된 업무 상태를 보게 된다.

### 근거·수정 방향

- [SupportAttachments.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportAttachments.java) **27–35행**: 첨부·감사 기록·revision·updated_at만 변경.
- [SupportService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportService.java) **99–103행**: 텍스트 추가 답변은 OPEN으로 바꿔 재검토시킴.

작성자의 새로운 첨부도 추가 답변과 동일한 사건으로 처리해 운영자 재검토 상태로 돌려야 한다. 같은 uploadId의 단순 재전송은 상태·알림을 다시 발생시키지 않도록 구분한다. 여러 사진을 묶어 보내는 경우 첨부 완료 후 한 번에 보완 제출을 확정하는 UI도 가능하다.

회귀: WAITING_USER + 신규 첨부 → OPEN/운영자 확인 필요; ANSWERED + 추가 근거; 동일 업로드 재전송; 종료 접수의 정책; 타인 첨부 접근 차단.

## R12-04 — 대화 상한이 업체 관리권 회수까지 막는다

### 실제 재현

대화 한도는 200건이다. 이전 대화를 모의 DB에 199건 준비하고 실제 관리권 승인 메서드를 실행했다. 승인 알림이 200번째 메시지가 되고 관리 관계는 ACTIVE가 됐다. 이후 실제 회수 메서드는 다음 오류를 반환했다.

```text
409: 대화 한도에 도달했습니다. 새 문의로 이어서 접수해 주세요.
```

**일반 사용자 대화 제한을 관리자 상태 처리 알림에도 동일하게 적용**해 생기는 경계 문제다. 흔한 짧은 문의에서는 발생하지 않지만, 상한에 도달한 접수의 처리·관리 관계 회수가 막히면 새 문의를 만드는 것만으로 기존 관리 관계를 회수할 수 없다.

### 근거

- [SupportService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportService.java) **92, 120–124행**: 공통 insertMessage의 200건 검사와 완료·추가 정보 요청의 메시지 생성.
- [ExhibitorClaimsService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/ExhibitorClaimsService.java) **50–57행**: @Transactional revoke가 관계 상태를 바꾼 뒤 동일한 insertMessage를 호출.

실제 메서드의 409 반환은 재현했다. **모의 JDBC는 rollback을 실행하지 않으므로 이 테스트의 메모리 상태를 실제 commit 결과로 해석하면 안 된다.** 실제 Spring 기본 정책에서는 이 RuntimeException 때문에 같은 작업의 회수 변경도 롤백되는 경로다. 관리권 자체는 정정 요청 관계이며, 직접 상품 편집이나 ADMIN 권한이 아니다.

### 수정 방향

사용자의 임의 대화 한도와 필수 시스템 처리 알림·감사 이력을 분리한다. 한도를 무제한으로 없애는 대신 별도 시스템 기록 또는 제한된 관리자 종료 알림을 두고, 권한 회수·긴급 숨김을 대화 포화 때문에 막지 않는다. 개인정보·이력 보관 원칙도 유지한다.

회귀: 199→승인200→회수 성공; 200건 문의의 정상 종료; 200건 신고의 긴급 숨김; 반복 처리 멱등성; 실제 DB 트랜잭션으로 상태·알림·이력 일치 확인.

## R12-05 — 실패처럼 보인 접수를 수정해 다시 보내면 중복될 수 있다

### 실제 재현

같은 문의 작성 화면에서 아래 순서를 실행했다.

1. 첫 접수는 모의 서버에 저장됐지만 응답이 유실된 것으로 처리.
2. 입력을 바꾸지 않고 재시도: **같은 requestId를 사용함 — 정상 대조군**.
3. 실패 안내를 본 사용자가 본문을 조금 보완하고 다시 접수: **새 requestId 자동 발급**.
4. 서버 관점에서는 처음과 다른 신규 접수이므로 모의 저장 티켓 2개.

실제 SupportNewForm의 입력·submit 핸들러를 실행했다. React effect·DOM은 실행하지 않았고, API는 저장 뒤 응답이 사라지는 상황을 명시적으로 모의했다.

### 근거·수정 방향

- [SupportPages.tsx](boothhana_v12_review/source/BoothHana2/frontend/src/features/support/SupportPages.tsx) **21–29행**: 본문을 포함한 signature가 달라지면 retry.current.id를 새 UUID로 교체.
- [SupportService.java](boothhana_v12_review/source/BoothHana2/backend/src/main/java/com/boothhana/support/SupportService.java) **71–76행**: 기존 중복 방어는 requestId 기준. 서로 다른 ID인 정상 새 문의와 자동 재시도를 구분할 정보 없음.

내용 변경이 언제나 중복이라는 뜻은 아니다. **서버 접수 여부가 불명확한 채 같은 작성 화면에서 다시 보내는 경우**가 문제다. 이미 성공한 접수 뒤 의도적으로 새 문의를 작성하는 행동과 구분해야 한다.

네트워크 오류 후에는 최초 ID·요청을 유지하고, 접수 확인 또는 동일 내용 재전송을 먼저 제공한다. 기존 접수가 있으면 해당 상세에서 추가 내용을 쓰게 한다. 정말 다른 신규 문의를 만들 때는 명시적으로 확인받는다. 서버가 명확히 저장을 거절한 검증 오류는 해당 규칙과 구분한다. 전체 본문을 비교해 서로 다른 정당한 문의를 자동 병합하지 않는다.

회귀: 저장 후 응답 유실·본문 수정·재전송; 같은 입력 재전송; 실제 400 검증 실패 후 수정; 기존 접수 조회 권한; 새 문의 의도 확인; 중간 새로고침의 복구 정책.

## 검증 결과 — 이번에 실제 실행한 범위

| 검사 | 이번 결과 | 한계 |
|---|---|---|
| Python 수집기 기존 테스트 | **170개 통과** | 가짜 CLI·로컬 HTTP/API. 실제 외부 검색/운영 DB 아님 |
| v12 순수 Java 규칙 | **122개 검증 조건 통과** | 실제 javac/java, 프레임워크 없음 |
| 기존 v12 실제 지원 서비스 검사 | **49개 조건 통과** | 가짜 JDBC·JSON registry·메모리 private store |
| v12 TS/UI·계약 | **55개 조건 통과** | 모의 훅·API, 실제 React DOM 아님 |
| 신규 재현 | **4개 문제 재현** | Java3개 + TSX1개. 트랜잭션 finding은 별도 정적 분석 |
| 전체 구문 | **TS/TSX73개, Java114개 파일 통과** | 의존성 실제 타입/런타임 검증 아님 |
| 로컬 연결 타입 검사 | **통과** | 명시적인 React/Router/Spring 경계 STUB |
| 원본 보존 | **690개 수정·누락·추가 0개** | 바이트 무결성이지 기능 무결성 보증 아님 |

기존 검사 통과는 새 결함이 없다는 뜻이 아니다. 원래 테스트의 공개 시각 비교는 행사 본문에 대해서만 검사했고, 지도 내부의 공개 시각, 사진만 보완, 대화 상한의 관리자 후속 처리, 입력이 바뀐 모호한 재전송을 다루지 않았다.

또한 기존 서비스 검사는 실제 코드를 사용하지만 직접 객체를 생성한다. Spring 프록시의 rollback-only 표시는 가짜 JDBC·단순 annotation stub으로 재현되지 않는다. 따라서 R12-01을 ‘실제 DB 테스트 통과/실패’로 제시하지 않는다.

### 아직 검증하지 않은 범위

실제 선언 의존성으로 React/TypeScript/Vite·Spring/Gradle 빌드, 실제 PostgreSQL001~012·RLS·잠금·트랜잭션, Servlet/CSRF·OAuth, 비공개 R2, 실제 브라우저 저장·모달·뒤로 가기, 실계정 Codex·예약 배치, 실사용자 테스트는 이번에도 실행하지 않았다. 이번 회차에서는 의존성 호스트 DNS 해석 실패를 확인했으며, 이전 빌드 실패 로그를 이번 빌드 재실행 결과로 주장하지 않는다.

본문·내부 메모·첨부 권한의 기존 분리 검사도 통과했다. 그러나 이 결과를 근거로 실제 배포환경에서 개인정보 유출 가능성이 전혀 없다고 보증하지 않는다.

## 수정 우선순위와 DB 검토

먼저 R12-01의 예상 가능한 비공개 결과와 트랜잭션을 정리하고, R12-02의 정정 판정 기준을 수정한다. R12-03 추가 자료 제출 상태, R12-04 관리자 필수 처리 한도, R12-05 모호한 접수 재시도를 이어 보완한다.

이번 검토만으로 운영 SQL을 작성·실행하지 않았다. 후속 수정 시 기존 접수를 임의 변환하지 말고 다음을 검토한다.

- 배치도 신고의 기존 fingerprint에는 공개 시각이 섞여 있다. 비교 알고리즘을 바꿀 때 **기존/신규 방식의 구분**이 필요하다. 현재값을 무조건 새 해시로 덮으면 접수 당시 근거를 잃는다.
- 전체 배치도 신고에서 보관하지 않은 좌표를 현재 지도에서 가져와 당시 데이터라고 만들면 안 된다. 불변 버전으로 복원 가능한지 확인하고 불가능하면 비교 제한 표시.
- WAITING_USER에 이미 첨부가 있는 티켓을 일괄 OPEN으로 바꾸면 이전 첨부까지 새 답변으로 오인할 수 있다. 마지막 추가 정보 요청과 첨부 시각·처리 이력을 비교할 것.
- 관리권 회수와 시스템 알림 구조 변경은 이력·개인정보 권한을 보존할 것.
- 중복 의심 접수는 사용자·내용·처리 이력을 보존한 상태에서 관리자가 검토할 것. 자동 삭제 금지.

## 재현 자료 사용

[재현 코드](boothhana_v12_review/reproduction/)와 [실행 결과](boothhana_v12_review/results/)를 포함했다. 재현 스크립트는 원본 전체 v12를 인수로 받으며, 이 자료에 포함한 일부 source 파일은 근거 열람용이지 독립 실행 프로젝트가 아니다.

```bash
# Python + Java21 필요. 제공 v12의 모의 외부 계약을 사용한다.
PYTHONDONTWRITEBYTECODE=1 python reproduction/run_java.py /path/to/BoothHana2
# Node.js + TypeScript 모듈 필요. v12 제공 hook harness를 사용한다.
node reproduction/reproduce_ui.cjs /path/to/BoothHana2
```

이 재현의 성공 종료는 **문제가 재현됐다는 의미이지 수정됐다는 의미가 아니다.** source 파일은 수정하지 않으며 실제 DB·스토리지·로그인 계정에 접속하지 않는다.
