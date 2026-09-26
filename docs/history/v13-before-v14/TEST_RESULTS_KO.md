# 실제 검증 결과 — v13 재구축 · 2026-09-17

기준 원본은 실제 확보된 `BoothHana2-full-v12-20260917.zip`이며 SHA-256은 `06843235f43177bfaed92e025e3a9ac66b755bd4d999caa48b2c29b787320cb1`입니다. 존재가 확인되지 않았던 이전 v13의 검사/파일수 주장을 재사용하지 않았습니다.

## 이번 소스에서 실행한 검사

| 검사 | 실제 결과 | 경계 |
|---|---|---|
| 기존 Python 수집기 | **170개 테스트 통과** | 가짜 CLI·로컬 모의 API. 실제 인터넷 검색/운영 DB 아님 |
| 기존 지원 서비스 | **49개 검증 조건 통과** | 실제 서비스 + scripted JDBC·메모리 private store |
| 새 지원 안정성 | **24개 검증 조건 및 409/403 거절 대조 통과** | 실제 수정 메서드. 트랜잭션 프록시·SQL 실행 아님 |
| 새 접수 재시도 | **29개 검증 조건 통과** | 실제 TicketSubmission·TSX 핸들러, 모의 hooks/API. React DOM 아님 |
| 기존 지원 UI/요청 | **55개 검증 조건 통과** | 실제 소스 + 모의 hooks |
| 기존 API·조회·카탈로그·탐색·드로어·배너 | **선택 회귀 통과** | `base-ui-regression.log`의 각 실제 실행 결과. 전체 앱 E2E 아님 |
| 기존 순수 Java 규칙 | **329개 검증 조건 통과** | javac/java 실행, DB 없음 |
| 번호 생성 표본 | **10,000개 검사 통과** | 표본 중복 없음; 수학적 무충돌 보증 아님 |
| TS/TSX 전체 구문 | **74개 파일 통과** | 파서 수준 |
| Java 전체 구문 | **116개 파일 통과** | 신규 JUnit 포함 파서 수준; 외부 라이브러리 타입해석 아님 |
| 지원 UI 로컬 타입 연결 | **통과** | React/Router 외부 정의는 명시적 테스트 stub |
| 배포 검증기 설정 누락 방어 | **예상대로 exit2 / NOT READY** | DB 미설정 상태. 실제 빌드/통합 검사가 성공한 것 아님 |

검증 조건(assertion) 수를 단위테스트 수나 코드 커버리지로 환산하지 않습니다. 기존 통과 기록을 이번 결과로 합산하지 않았으며, v13 결과 폴더 밖의 기록은 과거 검사입니다.

## 현재 실행 로그

- `verification/v13/results/offline-checks.log`: 새 실행기 **종료코드0으로 완주**. 49+24 서비스,29 재시도,55UI,타입stub/구문.
- `collector-regression.log`: Python170개.
- `base-ui-regression.log`: 기존 API·조회·카탈로그·화면 선택 회귀.
- `base-java-regression.log`: 순수Java329조건·번호 표본·구문.
- `release-gate-refusal.log`: 실제DB 설정 없이 성공 표시하지 않는지 확인.
- `frontend-build.log`, `backend-build.log`: 이번 환경에서 실제 시도한 전체 빌드 실패.

초기 모의 실행에서 입력 복구 컨트롤러가 렌더마다 새로 만들어지는 테스트 경계를 확인하여 keyed useRef로 생명주기를 고정한 뒤 최종 검사를 재실행했습니다. v12 ServiceTest의 기존49개 검증 의도는 유지하고 실제 변경 계약(message_kind/Optional/receipt)만 mock에 반영했습니다. 이는 외부 프레임워크가 설치된 것처럼 취급한 것이 아닙니다.

## 전체 빌드 시도 — 완료하지 못함

- `npm run build`: 설치되지 않은 vite/client·node 타입 때문에 TS2688. 실제 Vite 번들에 이르지 못했습니다.
- `sh gradlew test --no-daemon`: services.gradle.org DNS 오류로 Gradle 배포 다운로드 실패. 실제 Spring 컴파일/테스트에 이르지 못했습니다.

환경: Python3.13.5, Node22.16.0, OpenJDK21.0.11, 독립 검사기의 전역 TypeScript. 소스가 선언한 의존성을 임의 하향 변경하거나 서비스 코드에 test stub을 넣지 않았습니다.

## 새로 작성했지만 실행하지 못한 검사

`SupportReliabilityPostgresTests`의 **8개 JUnit 테스트**를 작성했습니다. 실제 Spring 트랜잭션 프록시와 JDBC/PostgreSQL을 사용하도록 했지만, 이번 환경에서는 의존성/DB가 없어 **문법 파싱만 수행했고 실행하지 못했습니다.**

이 테스트도 SQL013 및 support 경로 최소 fixture 중심이며, 전체SQL001~012/RLS·HTTP·OAuth·실R2 통합을 모두 대체하지 않습니다. [배포 검증기](verification/v13/release_gate.py)는 건너뛴 DB 테스트를 통과로 표시하지 않습니다.

추가 미검증: 실제 PostgreSQL 사용자 역할/권한/잠금/롤백, 전체 Spring HTTP·CSRF, 실제 React DOM/라우터·브라우저 저장/다운로드, Kakao, private R2, Codex 실검색·이미지인식, Windows/Linux 실제 정시 배치.

## 패키지 무결성

전체 파일수·v12 대비 변경/추가 목록·보존 검사는 `verification/v13/results/package-report.json`에 기록합니다. 최상위 `SHA256SUMS.txt`와 ZIP CRC를 다시 검증합니다. 실제 .env/config.local.json/auth·.git·node_modules·빌드캐시·폰트 바이너리는 넣지 않습니다. 원본 파일은 누락 없이 포함하되 필요한 코드/문서만 변경하며 기존 root 안내는 `docs/history/v12-rebuild-baseline/`에 보존합니다.

**이 결과는 수정된 전체 소스의 독립 검사 결과입니다. 실제 서비스 빌드·통합검증 완료 또는 운영 배포 승인이 아닙니다. 사용자 DB·GitHub·배포·예약 작업은 변경하지 않았습니다.**
