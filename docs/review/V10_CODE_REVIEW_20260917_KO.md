# BoothHana2 v10 코드리뷰

검토일: **2026-09-17**  
기준 ZIP: `BoothHana2-full-v10-20260917.zip`  
기준 SHA-256: `bcdfb7337f25f09cd626d1ef4319d1814a43d649a6c9356fd0fd59cb5cdee3de`

## 1. 범위와 결론

실제 v10 전체 소스를 기준으로 공개/관리자 화면, 공개 스냅샷, 배치 진입점, 환경변수, SQL 001~009, 인증·이미지 저장 경로, 배포 설정, 테스트 진입점을 대조했다. 아래 내용은 실제 이용자 조사나 운영 사고 보고가 아니다. 모든 코드 경로에 대한 완전한 보안감사·성능감사를 완료했다는 뜻도 아니다.

**핵심 검토 항목은 5개다.** 데이터 오류 1개는 실제 Java 모델과 공개 처리의 생성자 식, 실제 TS 표시 함수를 실행해 재현했다. UI 보완 1개는 소스 JSX·핸들러에서 확인했다. 운영 코드/설정 보완 2개, 운영 환경에 따라 달라지는 DB 보안 위험 1개를 별도로 분류했다.

| ID | 우선순위 | 항목 | 검증 수준 |
|---|---|---|---|
| R10-01 | P1 · 공개 전 수정 | 취소/연기/일정 변경의 `operationStatus`가 공개 시 소실 | Java 실제 DTO + 공개 생성자 식 추출 실행 + 실제 TS 표시 함수 |
| R10-02 | P2 · 사용자 동선 | 전체화면 배치도에서 선택한 부스명·판매정보 행동이 모달 밖에 남음 | 실제 JSX/상태 핸들러. 전체 React DOM 미실행 |
| R10-03 | P2 · 장애 대응 | 예기치 않은 500 오류를 처리하면서 예외를 기록하지 않음 | 예외 처리 메서드 정적 확인 |
| R10-04 | P2 · 배포 검증 | 기본 health check만으로 새 수집·카탈로그·배치도 스키마 준비 여부를 확인하지 못함 | Render 설정·기본 API·JDBC 쿼리·JPA 설정 대조 |
| R10-05 | 공개 전 확인 · 조건부 위험 | 기존 11개 업무 테이블의 RLS/공개 역할 권한을 별도로 점검해야 함 | SQL 전체 대조. 실제 Supabase grants/Data API 설정은 미확인 |

P1은 잘못된 정보가 사용자의 방문 판단에 영향을 줄 수 있어 공개 전에 수정할 항목이다. P2는 사용성·운영 신뢰성 보완이다. R10-05를 실제 데이터 유출이 확인된 것으로 읽으면 안 된다.

## 2. R10-01 — 행사 개최 상태가 공개 과정에서 사라짐

### 근거

- [`CatalogPublicationService.java:23–25,55–60`](../../backend/src/main/java/com/boothhana/collection/CatalogPublicationService.java): 검토된 행사에서 이미지 후보를 제거한 공개 DTO를 다시 생성하고 저장한다.
- [`CollectionModels.java:13–32`](../../backend/src/main/java/com/boothhana/collection/CollectionModels.java): 최종 필드가 `OperationStatus operationStatus`지만, 이전 형식 생성자를 호출하면 null을 거쳐 `UNKNOWN`으로 초기화한다.
- [`eventStatus.ts:7–14`](../../frontend/src/features/visit/eventStatus.ts): 취소·연기·일정 변경은 명시 상태가 있어야 우선 표시한다. UNKNOWN이며 별도 경고가 없으면 날짜상 상태로 돌아간다.

```java
// 현재 publish()에서 사용하는 생성자: raw.operationStatus()가 빠짐
EventData event = new EventData(
    raw.name(), raw.subcategory(), raw.organizer(), raw.edition(), raw.region(),
    raw.venueName(), raw.address(), raw.description(), raw.admission(),
    raw.subjects(), raw.occurrences(), raw.sources(), List.of(), raw.warnings(),
    raw.eventFormat(), raw.discoveryLinks()
);
```

### 재현 결과

| 검토된 입력 | 생성한 공개 DTO | 안내문·원문·확인일 | 미래 날짜의 카드 표시 |
|---|---|---|---|
| CANCELED | UNKNOWN | 전부 null | 개최 예정 |
| POSTPONED | UNKNOWN | 전부 null | 개최 예정 |
| RESCHEDULED | UNKNOWN | 전부 null | 개최 예정 |
| SCHEDULED | UNKNOWN | 전부 null | 날짜 기준 상태로 되돌아감 |

실제 원본의 생성자 식을 추출하여 실제 `CollectionModels.java`와 `javac/java`로 실행했다. 프런트 표시 함수도 실제 파일에서 호출했다. 가상 일정은 2026-10-10, 판단 기준일은 2026-09-17이다. DB에 저장·조회하는 HTTP 통합 재현은 아니지만, 값이 소실되는 생성자 분기 자체는 실행으로 확인했다.

기존 `warnings`에 경고가 별도로 있으면 일반적인 ‘방문 전 안내 확인’이 남을 수 있다. 그러나 명시적 취소 상태와 그 근거가 사라진다는 문제는 같다.

### 영향 및 권장 수정

관리자는 취소로 검토했는데 방문자는 예정 행사로 볼 수 있다. `List.of()`로 미승인 이미지 후보를 제거하는 정책은 유지하면서 `raw.operationStatus()`를 최종 생성자 인수로 전달해야 한다. 별도 안전한 복사 메서드를 만들고 필드가 추가될 때 누락되지 않는 테스트가 필요하다.

코드만 고쳐도 **이미 만들어진 공개 스냅샷은 자동 수정되지 않는다.** 수정 후 기존 검토 완료 데이터와 공개본의 상태를 대조하고, 확인된 데이터에서 재발행해야 한다. 검토 전 수집값을 곧바로 공개하거나 단순 경고 문구에서 취소 상태를 추정해서는 안 된다.

수락 기준: 수집/관리자 검토 → publish → DB 재조회 → 공개 상세/목록까지 CANCELED·POSTPONED·RESCHEDULED·SCHEDULED의 상태·안내·원문·확인일이 보존되는 실제 PostgreSQL 회귀 테스트.

## 3. R10-02 — 전체화면에서 선택한 부스 정보로 이어지지 않음

### 근거와 확인

- [`InteractiveFloorPlans.tsx:48–56`](../../frontend/src/features/floorplan/InteractiveFloorPlans.tsx): `PlanCanvas` 뒤의 형제 영역에 선택한 부스명·한줄요약·‘상품 보기’를 렌더한다.
- [`PlanCanvas.tsx:82–106`](../../frontend/src/features/floorplan/PlanCanvas.tsx): 전체화면 dialog에는 지도·툴바·범례·닫기만 들어간다.

실제 MapView를 가상 B1 부스 선택 상태로 호출하고 PlanCanvas의 전체화면 핸들러를 실행했다. dialog 안에는 부스번호는 있지만 **선택한 참가 부스명과 ‘상품 보기’가 없고**, 이 행동은 모달 밖에 남아 있다.

네이티브 `showModal()`의 외부 영역은 비활성화된다. 이는 [MDN 공식 동작 설명](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)으로 별도 확인했다. 이번 검사에서 실제 React의 effect를 실행하거나 휴대전화로 조작한 것은 아니다.

### 사용자 영향과 수정 제안

전체화면에서 위치를 고른 뒤 이름·상품을 보려면 창을 닫아야 한다. 잘못된 참가자 정보를 노출하는 오류라기보다는 현장 모바일 동선이 끊기는 보완점이다.

dialog 내부에 선택 부스 요약과 ‘상품 보기’를 제공하거나, 전체화면 지도에서 안전하게 상세 드로어로 전환하는 공통 선택 패널을 둔다. 닫기/뒤로 가기 때 방문일·전시관·지도 위치와 초점을 복원한다. 겹친 모달을 무계획하게 여는 변경은 피한다.

수락 기준: 전체화면 → 부스 선택 → 부스명 확인 → 상품 상세 → 같은 확대 위치 복귀를 실물 모바일/키보드로 검증한다.

## 4. R10-03 — 예기치 않은 서버 오류의 원인 기록이 없음

근거: [`ApiExceptionHandler.java:48–51`](../../backend/src/main/java/com/boothhana/api/ApiExceptionHandler.java).

```java
@ExceptionHandler(Exception.class)
ResponseEntity<ErrorView> handleUnexpected(Exception exception) {
    return ResponseEntity.internalServerError().body(
        new ErrorView(500, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.", null));
}
```

예외를 500 응답으로 소비하지만 이 메서드에서 예외 로그·추적 ID를 남기지 않는다. 하위 라이브러리가 일부 로그를 남길 수 있으므로 ‘모든 서버 로그가 없다’는 주장과는 다르다. 다만 예외의 최종 처리 지점에서 원인 기록이 보장되지 않는다.

SQL 미적용·DTO 문제·예상하지 못한 상태를 운영자가 추적하기 어려워진다. 서버에 요청 식별자·경로·비밀값을 제거한 예외 정보를 남기고 클라이언트에는 일반 오류와 요청 식별자를 반환하는 방향을 권장한다. Authorization·인증파일·DB 비밀번호·전체 요청 본문을 기록하면 안 된다.

수락 기준: 스테이징에서 통제된 500 한 건 발생 → 화면 요청 ID와 서버 로그 연계. 비밀 토큰·PII가 로그에 포함되지 않음.

## 5. R10-04 — 기존 health check와 신규 기능 readiness가 다름

근거:
- [`render.yaml:7`](../../render.yaml): `/api/public/events`를 healthCheckPath로 사용한다.
- [`application.yml:9–12`](../../backend/src/main/resources/application.yml): `ddl-auto: validate`.
- [`CatalogPublicationService.java:68–109`](../../backend/src/main/java/com/boothhana/collection/CatalogPublicationService.java), [`FloorplanService.java`](../../backend/src/main/java/com/boothhana/floorplan/FloorplanService.java): 새 기능은 수동 SQL로 만든 테이블을 JDBC로 조회한다.
- [`backend/build.gradle`](../../backend/build.gradle): 자동 Flyway/Liquibase 마이그레이션 구성 없음.

기본 업무 스키마가 준비되어 기존 행사 API가 작동하더라도, 수집/배치도 테이블이 빠진 상태를 이 health check가 직접 확인하지 않는다. JPA 엔티티 검증도 모든 JDBC 테이블·권한·운영 쿼리를 대신 검증하지 못한다. 이번에 실제 DB를 불완전하게 구성해 서버를 기동한 것은 아니며, 설정/호출 경로에서 확인한 배포 검증의 빈틈이다.

기존 health check는 생존 확인용으로 두되, 공개 카탈로그 목록·실제 행사 상세·배치도·수집 전용 인증·필수 테이블을 확인하는 배포 smoke/readiness 절차를 별도로 두어야 한다. DB를 새로 만드는 권한을 health check에 부여하지 않는다.

실행 가능한 준비 점검은 [DB 체크리스트](../deployment/V10_DATABASE_CHECKLIST_20260917_KO.md)와 [읽기 전용 SQL](../../verification/review_v10_20260917/db_preflight_readonly.sql)에 정리했다.

## 6. R10-05 — 기존 업무 테이블의 Supabase 직접 접근 경로 점검

### 소스에서 확인한 사실

[`001_initial_schema.sql`](../../database/001_initial_schema.sql)의 11개 업무 테이블에는 RLS 활성화나 일반 API 역할 권한 회수가 없다. 002~009도 이 11개 테이블 전체에 해당 보호를 추가하지 않는다. 반면 수집 관련 신규 테이블은 별도의 RLS/권한 제한을 둔다. `image_upload`는 RLS를 켜지만 일반 역할의 실효 권한도 별도로 점검할 필요가 있다.

### 실제 환경에서 확인할 조건

**해당 스키마가 Supabase Data API에 노출되고, `anon` 또는 `authenticated`에 접근 권한이 있으며, 유효한 RLS 제한이 없다면** Spring API의 사용자/부스 소유권 검사와 별도의 경로로 DB에 접근할 수 있다. 운영 Supabase의 노출 스키마·grants·정책·키 배포 여부를 이번에 확인하지 않았으므로 실제 노출/유출로 단정하지 않는다.

외부 공식 확인: Supabase는 grants와 RLS를 서로 다른 접근 제어 계층으로 설명한다. 서버 직접 DB 연결만 사용하는 앱은 다른 서비스 의존성을 확인한 후 Data API를 끌 수도 있다. [Supabase 데이터 보호](https://supabase.com/docs/guides/database/secure-data), [Data API 보안](https://supabase.com/docs/guides/api/securing-your-api).

### 준비 기준

이 소스의 프런트는 자체 백엔드 API를 사용한다. 서버 전용 데이터 접근 정책을 정하고 Data API 비활성화 또는 노출 스키마·grants·RLS를 검토한다. 다른 앱이 같은 DB의 Data API를 사용하는지 먼저 확인해야 한다. JDBC 서버 계정이 새 private 테이블에 접근하지 못한다고 `anon/authenticated`에 전체 권한을 주어 해결하지 않는다.

이번에 제공하는 점검 SQL은 **읽기 전용**이다. 운영 권한을 일괄 바꾸거나 기존 데이터를 삭제하지 않는다.

## 7. 빌드·통합 검증은 별도의 공개 차단 조건

기존 독립 검사와 신규 재현은 실행했지만, 전체 프런트 빌드는 의존성 미설치에 의한 TS2688, Gradle은 배포 ZIP 다운로드 DNS 오류로 실패했다. 이를 코드가 컴파일 불가능하다는 확정 결함이나 빌드 성공으로 해석하지 않는다.

실제 선언 버전의 의존성을 설치하고 `pnpm lint`, `pnpm build`, `gradlew test`, `gradlew bootJar`를 통과시킨 뒤 PostgreSQL/Kakao/R2/Codex/브라우저 흐름을 검증해야 한다. 버전이 설치되지 않는 경우 묵시적으로 하향 변경하지 말고 호환 버전·lockfile·실행 환경을 명시해서 별도 수정한다.

## 8. 이번에 오류로 분류하지 않은 것

- 박람회·축제는 준비 화면이다. 현재 수집이 서울 서브컬처에 한정된 것은 정해진 범위다.
- POS 취소의 재고 자동 복구 미실행은 기존 승인 정책이다.
- LLM 대신 Python 크롤러로 조사하도록 바뀐 것이 아니다. Python이 CLI 실행과 검증·전송을 조정한다.
- 지도 선택은 `focusParticipantId/day/hall` 변경 시 `useEffect`로 초기화된다. effect를 실행하지 않는 하네스에서 이전 지도 선택이 남는 것만 보고 실제 앱 결함으로 판정하지 않았다.
- 이미지 권한/공개 승인, PDF 지도 링크 전용, 검색 정확도·누락률 미검증은 현재 기능 범위와 검증 한계다.

## 9. 수정 순서 제안 / 이번 패키지 상태

1. R10-01 수정 후 기존 공개 스냅샷 점검·재발행.
2. 실제 빌드 및 R10-05 환경 권한 점검, R10-04 smoke 절차 통과.
3. R10-03 예외 기록과 운영 알림 보완, R10-02 전체화면 동선 개선.

**이번 요청은 코드리뷰·문서 작성이므로 애플리케이션 소스와 SQL은 수정하지 않았다.** 기존 원본 514개 파일을 그대로 포함하고 새로운 문서·읽기 전용 점검·재현자료만 추가했다. 재현 스크립트의 성공 종료는 ‘문제가 재현됨’이지 ‘수정됨’이 아니다.

[실행 검증 결과](V10_REVIEW_VALIDATION_20260917_KO.md) · [준비 체크리스트](../deployment/V10_GO_LIVE_CHECKLIST_20260917_KO.md)
