# v17 검증 결과 · 2026-09-18

대상: 이번 수정본의 실제 소스. 운영 배포 승인 여부: **false**.

## 이번 작업 환경에서 실행한 결과

| 검사 | 결과 | 범위/한계 |
|---|---|---|
| `verification/v17/run_checks.py` | 통과 | 아래의 독립/대역 검사를 포함 |
| 새 초안·메타·Node HTML·hosting 준비 검사 | 27개 통과 | 실제 소스 모듈, 프레임워크/네트워크 일부 대역. 실제 Vercel 배포 아님 |
| 새 게이트/성능 측정 입력 검사 | 15개 통과 | 예외/권한 환경/과거 성공 차단/통계, 실제 DB 부하 아님 |
| 기존 v16 인증/Provider | 28개 통과 | 실제 모듈과 명시적 React/API 대역 |
| 기존 v16 UI | 37개 assertion 통과 | 독립 JSX 검사 |
| 기존 v15 메모리/UI | 각각 47/31개 assertion 통과 | 독립 검사 |
| 기존 Java 규칙/서비스/일괄 조회 | 통과 | JDBC 등 대역. 중복 대상의 순서/반복 복원·SQL 바인딩 감소 추가 검증 |
| 타입 계약/문법 | 통과 | 외부 타입 대역 포함; TS/TSX 95개·Java128개 문법. 실제 dependencies 빌드와 다름 |
| 수집기 | 170개 테스트 통과 | 로컬 fixture/모의 API/가짜 CLI. 실제 Codex/운영 DB 아님 |

같은 검사를 중첩 실행한 횟수나 assertion 수를 합쳐 '전체 unit test 수'로 표시하지 않습니다. 원래 v16 검사도 새 runner에 포함돼 있습니다.

## 실행을 시도했지만 완료하지 못한 검사

| 검사 | 상태 | 실제 이유 |
|---|---|---|
| frozen 의존성 설치 | 미완료 | npm registry 접속/DNS 실패 |
| 프런트 build | 미완료 | 의존성 미설치로 vite/client·node 타입 없음(TS2688) |
| 백엔드 Gradle test/build | 미완료 | services.gradle.org DNS 실패; 실제 컴파일/JUnit 미도달 |
| 실제 React/Chromium 모의 API 검사 | NOT_READY | 실제 frontend/dist 빌드 없음. 실행기 자체만 추가/문법 확인 |
| 실제 PostgreSQL release gate | NOT_READY | 격리 테스트 DB 환경변수/서버 미준비; 통합 테스트 미실행 |
| 성능 측정 | 미실행 | 실제 대상 200개·회원500 테스트 환경 없음. 측정값 없음 |
| 실제 hosting/OAuth/R2/Codex/모바일 | 미실행 | 실제 배포/외부 연동을 수행하지 않음 |

의존성 접속 실패는 소스 자체 오류를 입증하지 않습니다. 반대로 문법/대역 검사 통과를 실제 빌드 성공으로 간주하지 않습니다.

## 원본 로그

- `verification/v17/results/independent-checks.log`
- `verification/v17/results/v17-node.log`
- `verification/v17/results/collector-tests.log`
- `verification/v17/results/build-attempts.json` 및 frontend-install/frontend-build/backend-build 로그
- `verification/v17/results/release-gate.json`: 이번 시도의 NOT_READY
- `verification/v17/results/browser-drafts.json`: 미준비 사유

과거 버전 로그는 현재 결과가 아닙니다. 현재 무결성은 최상위 `SHA256SUMS.txt`에 정의되어 있습니다. 실환경 수락 항목은 `docs/quality/V17_ACCEPTANCE_KO.md`를 확인합니다.
