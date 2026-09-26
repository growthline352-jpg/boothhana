# v12 실제 검증 결과 · 2026-09-17

기준은 전달된 v11 전체 ZIP입니다. 이번 작업 사본에서 수행한 검사만 아래에 기록합니다. 실제 운영 DB/스토리지/계정/호스팅/스케줄을 변경하거나 SQL012를 실행하지 않았습니다.

## 실행 결과

| 검사 | 실제 결과 | 범위/한계 |
|---|---|---|
| 신규 SupportRules/LoginReturnPath/ApplicationRules | **122개 조건 통과** | 실제 Java21 컴파일/실행, 입력·역할 predicate·상태·내부 복귀 경로. 프레임워크 없음 |
| 신규 실제 지원 서비스/대상/관리권/첨부 메서드 | **49개 조건 통과** | 실제 서비스 코드+명시적 가짜 JDBC/JSON registry/private storage. SQL·Spring transaction·실제 스토리지 미실행 |
| 신규 TS/UI·라우트·요청 계약 | **55개 조건 통과** | 실제 TS 함수·컴포넌트+mock hooks, 코드 계약 assertions. React DOM 없음 |
| 새 프런트 연결의 로컬 타입 계약 | **통과** | React/Router 타입은 명시적 테스트 stub. 실제 React19/Router8/TS6 빌드 아님 |
| 전체 소스 구문 검사 | **TS/TSX73개, Java114개 파일 통과** | 파싱만, 실제 라이브러리 타입해석 아님 |
| source 기반 정적 고객센터/문의/신고/관리자/비회원 시안 | **48개 조건 통과** | 6화면×1440/390/320폭. 제목·가로넘침·필수입력·내부메모구분. 로그인·저장·라우터 실제 E2E 없음 |
| 기존 수집기 | **170개 테스트 통과** | 실제 Python+가짜CLI/로컬HTTP/API, 웹검색·운영DB 아님 |
| 기존 API/조회/업로드·v5~v9 독립회귀 | **완료·종료코드0** | 원래 독립 실행기. mock hooks/순수규칙/stub이며 서비스통합 아님 |
| v11 굿즈·진단 회귀 | **123+22+7+44 조건 및 로컬 타입 통과** | 새40테이블 계약으로 테스트를 갱신. 기존서비스 가짜JDBC/오류로그stub/UIhooks |

기존 검사와 새로운 검사의 assert수는 단위테스트 개수·코드 커버리지 백분율로 환산하지 않습니다. 표의 Java 구문 파일수에는 기존 테스트 파일이 포함됩니다. 전체 프로젝트 빌드 성공을 의미하지 않습니다.

## 신규 검사에서 확인한 경계

같은 requestId 재전송1건/다른사용자충돌, 타인 상세404, 내부메모가 사용자 JSON에없음, 답변과처리상태, 담당배정이해결결과를초기화하지않음, 오래된revision409, 과거공개시간만바뀐것은정정증거아님, 공개내용변화에따른해결, 비회원키hash/잘못된키/30일만료/만료후생성API재전송차단, 자기관리권심사거절, 승인/회수/당사자안내, 타인첨부거절과동일업로드ID 처리 등을 실제메서드/분리경계에서 확인했습니다.

모의JDBC가 성공했다고 SQL문법·RLS·잠금순서·외부오류시transactionrollback을 실제PostgreSQL에서 보증하는 것은 아닙니다. public correction의 실제 DB 연동·다중관리자 경합은 수락표에서 별도 확인해야 합니다.

## 실제 시도했으나 실패한 것

- frontend `npm run build`: `vite/client`, `node` 타입 의존성 미설치로 TS2688. 실제 TS6/Vite8 번들 생성에 이르지 못했습니다.
- backend `sh gradlew test --no-daemon`: Gradle 배포 다운로드의 `UnknownHostException: services.gradle.org`. 전체 Spring4.1/AWS/JPA 컴파일에 이르지 못했습니다.
- npm/Maven/Gradle 의존성 호스트의 DNS 확인이 실패했습니다. 동작하는 버전인 것처럼 임의 다운그레이드하지 않았습니다.

이번 실행 로그: `verification/v12/results/frontend-build.log`, `backend-build.log`, `final-checks.log`, `java-service.log`, `support-ui.log`, `types.log`, `regression-final.log`, `v11-final.log`, `browser.log`, `browser.json`.

## 실행하지 않은 검증 — 운영 전 검토항목

**SQL001~012 실제 적용·재실행/rollback, PostgreSQL 데이터/FK/RLS/실제 JDBC권한/잠금/레이트 REQUIRES_NEW, SupportController/SupportRequestFilter의 실제Spring HTTP·CSRF인증, 기존 전체 JUnit, Kakao 로그인후복귀·다중탭·로그인실패, 실제 private R2버킷의 공개차단·PUT/GET/hash·권한철회, actual React DOM 고객센터 작성/뒤로가기/미저장방지·브라우저다운로드·모바일, 비회원키조회 실서비스/프록시기반rate/운영알림, 기존 Codex·수집·스케줄 정시실행**은 실행하지 않았습니다.

`PrivateSupportStorage`와 ServletFilter의 실제 AWS/Servlet 계약도 전체 프레임워크 빌드로 검증해야 합니다. 허용된 파일헤더만 검사하며 백신검사나 개인정보자동제거가 아닙니다. 새실제DB테스트를통과했다고표현하지않습니다.

## 재실행

```powershell
# Java21/Node/TypeScript 모듈/Python 의존성 설치 환경
python verification/v12/run_checks.py
python verification/run_checks.py
python verification/v11/run_checks.py
# Pillow/Playwright/Chromium 있는 환경: 정적 시안만
node verification/v12/render_preview.cjs
python verification/v12/browser_preview.py
```

지원 코드 오류를 막기 위한 원래 회귀테스트 의도는 유지했습니다. 신규 support import/useId를 이해하는 하네스와, 검토이력 actor을 위한 외부 보안context stub, SchemaContract 테이블수 assertion만 새 계약에 맞게 변경했습니다. 이것은 실제라이브러리를설치한것이아닙니다.

## 소스 보존·패키지

원본614파일의 누락없이 통합합니다. 수집기·기존SQL001~011·원본이미지·Gradle wrapper·굿즈순위·POS취소정책은 보존합니다. 새SQL012와 지원기능코드/서버권한보완/화면/문서를 추가했고 원본 README·시작/검증안내는 docs/history/v11에 보관합니다. 이전검토SHA/로그는과거자료이며 현재 전체 검증에는 최상위SHA256SUMS를 사용합니다.

최종 파일수·원본비교·보존목록은 `verification/v12/results/package-report.json`에 기록합니다. `.env` 실제값·config.local.json·인증파일·.git·node_modules·빌드캐시·폰트바이너리는 넣지 않습니다. **전체소스 ZIP의 무결성은 서비스운영승인을 뜻하지 않습니다.**
