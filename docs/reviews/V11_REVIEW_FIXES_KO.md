# v10 리뷰 보완 · v11

기준 전체본: `BoothHana2-full-v10-reviewed-20260917.zip`. 이전 파일의 수집·프롬프트·스케줄·원본 자산을 유지하고 아래 항목을 수정했습니다.

| 리뷰 | 반영 | 확인과 남은 검증 |
|---|---|---|
| R10-01 개최 상태 소실 | `PublicEventProjection.fromReviewed()`가 `operationStatus` 포함 모든 행사 필드를 보존. 승인되지 않은 이미지 후보만 제거 | 실제 DTO의 모든 record component를 반사 검사. PostgreSQL 공개·재조회 테스트 추가했으나 미실행 |
| R10-02 전체화면 후속 행동 | 선택 부스·상품 보기 패널을 fullscreen dialog 내부에도 렌더. 공유 `BoothContent`를 같은 dialog의 상세 보기로 전환 | 실제 JSX/핸들러 하네스 및 Chromium 정적 DOM. 화면 밖/겹친 모달을 열지 않음. 실물 기기/React E2E 필요 |
| R10-03 오류 추적 | UUID 문의 코드, JSON `requestId`, `X-Request-ID`, CORS 노출. 서버 matched route와 비밀값 없는 cause 클래스/앱 스택 위치 기록 | 실제 오류 핸들러를 외부 타입 stub으로 실행. 스테이징 HTTP↔서버로그 연동은 별도 |
| R10-04 준비 확인 | 고정33테이블·필수 컬럼 zero-row query, RLS/서버 grants/일반 API grants 검사. 5초 캐시. live/ready/admin진단 분리 | 실제 서비스를 fake JDBC로 검사. Render health 경로 ready로 변경. 실제 스키마·역할·트랜잭션 필요 |
| R10-05 직접 DB 접근 | SQL011에서 지정한33앱테이블만 RLS+일반 API grants회수+restrictive deny+명시적 JDBC허용 | 코드만 포함, 운영 적용 아님. 공유앱 영향과 JDBC 역할 검토 후 DBA가 적용해야 함. 뷰/함수/기본권한 등은 별도 감사 |

## 개최 상태의 기존 공개본

새 코드로 재발행하는 시점부터 상태가 보존됩니다. 기존 snapshot은 SQL로 일괄 덮어쓰지 않습니다. `verification/v11/publication_status_audit_readonly.sql`로 검토값과 공개값이 다른 행사를 확인하고 공식 근거·검토 상태를 확인한 뒤 관리자에서 개별 재발행하세요. 최신 미검토 수집 JSON을 곧바로 공개하지 않습니다.

## 전체화면 지도 상세

선택 요약 → 상품 보기는 같은 native dialog 안에서 전환합니다. 뒤의 캔버스는 DOM과 스크롤을 유지한 채 `inert`/`aria-hidden` 처리하고 상세 제목으로 초점을 옮깁니다. 상세의 ‘같은 지도 위치로 돌아가기’ 또는 Escape는 지도와 원래 버튼 초점을 복원합니다. 그다음 Escape는 전체화면을 닫습니다. 전체화면 내부 보기는 자체 브라우저 history 엔트리를 새로 만들지 않으며, 외부 행사/드로어의 기존 URL 동작은 유지합니다.

## 오류 진단 개인정보 방어

예외 메시지/원시 SQL/Authorization/쿼리/요청본문/쿠키를 기록하지 않습니다. `FailureDiagnostics`는 예외 클래스와 com.boothhana 스택의 파일 위치만 남깁니다. 이 진단의 제한 때문에 필요한 상세 원인 정보는 스테이징에서 비식별화하여 조사해야 합니다. 서버프레임워크·DB라이브러리·프록시 자체 로그의 개인정보 정책까지 자동 통제하는 변경은 아닙니다.

추가 로컬 타입검사에서 DTO의 `@NotNull java.util.UUID` 표기 문제를 확인해 `UUID` import 형식으로 정리했습니다. 실제 Jakarta/Spring 의존성을 사용한 전체 빌드 성공을 의미하지는 않습니다.

## 변경하지 않은 정책

POS 취소 시 재고를 자동 복구하지 않는 기존 정책, 외부 수집과 운영 판매의 분리, 이미지 사용·공개 승인, 수집기/Codex 방식, 일요일 전체수집과 배치도 보완 주기는 그대로입니다. 권한 검토/준비 확인이 통과해도 전체 서비스 보안감사나 결제 검증을 뜻하지 않습니다.
