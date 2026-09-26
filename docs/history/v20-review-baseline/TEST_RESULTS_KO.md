# 부스하나 v20 · 이번 검사 결과

2026-09-18 · 원본 v19 / 수정본 v20 · **productionApproval=false**

## 실행하여 통과한 검사

| 검사 | 결과 | 경계 |
|---|---|---|
| 원본 v19의 기존 독립 검사 | exit 0 | 수정 전 기준 확인; 실제 빌드/DB 아님 |
| 신규 API 생명주기 검사 | 6개 통과 | 실제 client + fetch/시계 대역 |
| 신규 인증/로그아웃/방문일 검사 | 5개 통과 | 실제 AuthSession·API wrapper·패널 + hooks/의존성 대역 |
| 신규 저장소 열기 검사 | 2개 통과 | 실제 store + IDB 이벤트 대역 |
| 동일 신규 13개를 원본 v19에 실행 | 12실패·1통과·취소0 | 원인별 복수 경계 포함; 독립 결함 12개 아님 |
| 기존 API 동작 검사 | 17개 통과 | 실제 API 모듈 + fetch 대역 |
| 기존 인증 상태 검사 | 22개 통과 | 실제 모듈 + 외부 경계 대역; 통합 runner에서도 포함 |
| 기존 인증/초안/메타/보관함/오프라인/지역·분류 | 독립 검사 통과 | 각 검사에서 명시한 React/HTTP/JDBC 대역 범위 유지 |
| 수집기 | 170개 통과 | 가상자료·로컬 모의 CLI/API. 실제 수집 아님 |
| TS/TSX·Java 문법 및 로컬 타입 계약 | 통과 | TS/TSX98개·Java129개. 정식 프레임워크 빌드 아님 |
| 현재 통합 진입점 | `python verification/run_checks.py` exit 0 | v20, 기존 연쇄 검사, 수집기 포함 |

중첩 실행·assertion 수를 더해 전체 고유 테스트 수로 표시하지 않습니다. 현재 최종 결과는 `verification/v20/results/final-checks.log` 및 `final-checks-exit.json`입니다.

## 실제로 시도했지만 완료하지 못한 검사

| 검사 | 이번 결과 | 실제 실패 지점 |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | exit1 / NOT_READY | pnpm10.13.1 다운로드 중 registry.npmjs.org DNS EAI_AGAIN. 프로젝트 의존성 설치 전에 실패 |
| 프런트 `tsc -b` | exit1 / NOT_READY | 미설치 `vite/client`·`node` 타입 TS2688. Vite 프로덕션 빌드 미도달 |
| `bash gradlew test bootJar --no-daemon` | exit1 / NOT_READY | services.gradle.org UnknownHostException. Spring 컴파일/JUnit 미도달 |
| 실제 Chromium 오프라인 리더 | NOT_READY / 완료0개 | 첫 로컬 URL 접근이 ERR_BLOCKED_BY_ADMINISTRATOR로 차단. 정책 변경/우회 없음 |
| 실제 SQL001~016·통합 게이트 | NOT_READY / exit2 | 격리 테스트 DB 준비 보고서·접속 환경 미준비. 마이그레이션 실행 안 함 |
| 실제 iPhone/Android·Vercel·R2·카카오·Codex·부하 | 미실행 | 실제 배포·외부 계정·기기 미사용 |

이 환경의 다운로드 실패는 코드 컴파일 오류를 입증하지 않습니다. 반대로 독립 검사 통과도 실제 빌드/모바일 동작 성공을 입증하지 않습니다. 기존 결과를 재사용한 것으로 처리하지 않고 이번 시도 로그·종료 상태를 새로 남겼습니다.

## 결과 파일

- 수정 전 기준: `baseline-v19.log`, `baseline-exit.json`.
- 원본/수정 비교: `v19-all-new-tests.log`, `v20-all-new-tests.log`, `comparison.json`.
- 기존 동작 재확인: `existing-api.log`, `existing-auth.log`.
- 전체 실행: `final-checks.log`, `final-checks-exit.json`.
- 설치/빌드: `frontend-install.log`, `frontend-build.log`, `backend-build.log`와 각 `*-exit.json`.
- 실제 브라우저: `browser-offline.json`, `browser-offline.log`, `browser-offline-exit.json`.
- 실제 게이트: `release-gate.json`, `release-gate.log`, `release-gate-exit.json`.

위 파일은 모두 `verification/v20/results/` 기준입니다. 실패 시나리오를 검사하는 수집기 로그의 FAILED fixture 표시는 실제 행사 수집 실패를 뜻하지 않으며, 테스트 실행 결과는 runner 종료코드와 unittest 요약으로 확인합니다.
