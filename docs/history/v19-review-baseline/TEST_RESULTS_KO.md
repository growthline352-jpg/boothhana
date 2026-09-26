# 부스하나 v19 · 이번 코드리뷰 검증 결과

2026-09-18 · 기준 v18 / 수정본 v19 · **productionApproval=false**

## 실행하여 통과한 검사

| 검사 | 결과 | 해석·한계 |
|---|---|---|
| v19 독립 검사 실행기 | exit 0 | 기존 v18→v17→v16 검사와 신규 검사 실행 완료 |
| 새 저장소 회귀 검사 | 14개 통과 | 실제 store/policy 모듈, IndexedDB·fetch·worker·이미지 해석은 명시적 대역 |
| 새 리더 회귀 검사 | 4개 통과 | 실제 app.mjs, 최소 DOM·BroadcastChannel·저장소 대역. 실제 브라우저 아님 |
| 동일 새 검사로 원본 v18 재현 | 17개 실패 / 1개 통과 | 저장소 13실패·1통과 + 리더4실패. 같은 결함의 복수 시나리오 포함 |
| 기존 v18 오프라인 검사 | 18개 통과 | 공개 투영·권리·요청·캐시 정책 대역 검사 |
| 기존 지역·분류·규격 검사 | Python 10개 통과 | 서울·경기, 인천 제외, 세 분야/15개 하위 분류. 실제 수집 아님 |
| Java 지역·분류 / 조회 / 이미지 승인 | 기존 492/86/24개 조건 검사 통과 | 순수 규칙 실행 또는 JDBC 대역. 실제 PostgreSQL 아님 |
| 기존 인증·초안·보관함·메타 등 | 기존 회귀 검사 통과 | 각 테스트의 React/API/JDBC 대역 범위 유지 |
| TypeScript/Java | TS/TSX98개·Java129개 문법 검사 및 로컬 타입 계약 통과 | 정식 의존성을 연결한 전체 빌드가 아님 |
| 수집기 전체 | 170개 테스트 통과, exit 0 | 로컬 fixture·모의 CLI/API. 실제 Codex·외부 행사 수집 아님 |

신규 18개를 제외한 기존 검사는 상위 실행기에서 중첩 실행될 수 있으므로 합산하여 고유 테스트 총수로 표시하지 않습니다. 새 IDB 대역은 순서/완료/중단 검사용이며 디스크 영속성, 브라우저 잠금, 운영체제 저장공간 회수, Safari 구현을 대신하지 않습니다.

## 실제로 시도했지만 완료하지 못한 검사

| 검사 | 이번 결과 | 실패 지점 |
|---|---|---|
| 프런트 전체 타입 빌드 시도 (`tsc -b`) | exit 1 | 미설치된 vite/client·node 타입 오류 TS2688. 정식 Vite 프로덕션 빌드까지 도달하지 못함 |
| 백엔드 `gradlew test bootJar` | exit 1 | Gradle 다운로드의 services.gradle.org DNS 오류. Spring 컴파일·JUnit 실행 미도달 |
| v19 실제 Chromium 오프라인 리더 | NOT_READY / 완료 시나리오 0개 | 첫 localhost 페이지 접속이 ERR_BLOCKED_BY_ADMINISTRATOR로 차단됨. 정책 우회 없음 |
| 실제 SQL001~016 / 릴리스 게이트 | NOT_READY / exit 2 | 현재 격리 테스트 DB 준비 보고서 및 접속 환경 없음. 실제 마이그레이션 미실행 |
| 실제 iPhone/Android·배포·R2·카카오·Codex·부하 | 미실행 | 운영 계정·외부 서비스·실제 기기 사용하지 않음 |

v19 작업에서 frozen 의존성 설치 성공을 주장하지 않습니다. 이번 환경에서 의존성 저장소/Gradle DNS 오류를 확인했습니다. 전체 빌드 미완료는 소스 오류를 입증하지 않으며, 반대로 대역 검사 통과가 전체 빌드 성공을 보장하지 않습니다.

## 재실행

```sh
# 현재 독립 검사 + 수집기 전체
python verification/run_checks.py
# 신규 18개만
node --test verification/v19/test_offline_regressions.mjs verification/v19/test_reader.mjs
# 실제 브라우저 환경이 있어야 함
python verification/v19/browser_offline.py
# SQL은 v18과 같으므로 격리 테스트 DB 준비 도구도 그대로 사용
python verification/v18/prepare_test_db.py --confirm-isolated-empty-test-cluster
python verification/v19/release_gate.py
```

DB 도구는 지정된 격리 로컬 테스트 DB만 허용합니다. 운영 DB 또는 운영 DB로 포워딩한 주소를 넣지 않습니다. 필요한 변수는 `docs/deployment/FULL_V18_KO.md`와 준비 도구를 확인합니다. 브라우저 검사도 로컬 가상 공개 API·이미지를 사용하며 실제 R2/CORS/모바일 검증을 대신하지 않습니다.

## 현재 결과 파일

- `verification/v19/results/independent.log`, `independent-exit.json`
- `verification/v19/results/collector.log`, `collector-exit.json`
- `verification/v19/results/offline-regressions.log`, `reader-regressions.log`
- `verification/v19/results/v18-reproductions.log`, `v18-reader-reproductions.log`
- `verification/v19/results/frontend-build.log`, `frontend-build-exit.json`
- `verification/v19/results/backend-build.log`, `backend-build-exit.json`
- `verification/v19/results/browser-offline.json`, `browser-offline.log`
- `verification/v19/results/release-gate.json`, `release-gate.log`

패키징 직전 현재 통합 진입점 실행 결과는 `verification/v19/results/final-checks.log` 및 `final-checks-exit.json`에 기록합니다. 해당 결과가 누락되거나 실패하면 위 개별 결과만으로 최종 통과를 가정하지 않습니다. 과거 v18·v17 결과 파일은 이력입니다.
