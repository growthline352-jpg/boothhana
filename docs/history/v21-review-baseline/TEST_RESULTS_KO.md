# 부스하나 v21 · 이번 검증 결과

2026-09-18 · 입력 v20 / 수정 v21 · **productionApproval=false**

## 실행하여 통과한 검사

| 검사 | 이번 결과 | 해석·한계 |
|---|---|---|
| 원본 v20의 기존 통합 검사 실행기 | exit0 | 수정 전 기준. 실제 프레임워크/DB 통합 검사가 아님 |
| 신규 공개 캐시 | Node6개 통과 | 실제 모듈 + fetch/시간 대역 |
| 신규 문의·예약/POS 요청 기록 | Node14개 통과 | 실제 클래스 + sessionStorage 대역 |
| 신규 판매 요약 철회 | Java6개 통과 | 실제 서비스/투영 + JDBC/JSON·외부 프레임워크 대역 |
| 동일26개를 원본 v20에 실행 | 17실패·9통과 | Node13실패·7통과, Java4실패·2통과. 독립 결함17개 아님 |
| 기존 지원 폼/거래 폼 | 29/26개 assertion 통과 | hooks/API/JSX 대역, 실제 React DOM 아님 |
| 기존 인증·초안·보관함·오프라인·지역·분류 | 기존 독립 회귀 통과 | 각 테스트의 외부 대역 경계 유지 |
| 수집기 | 170개 통과 | fixture/로컬 모의 CLI·HTTP. 실제 행사 조사 아님 |
| TS/TSX·Java 문법/로컬 타입 계약 | 통과 | TS/TSX98개·Java129개. 전체 의존성 빌드 아님 |
| 현재 진입점 `python verification/run_checks.py` | exit0 | 위 검사와 이전 연쇄 회귀·수집기 실행 완료 |

기존 검사가 여러 실행기에 중복 포함되므로 assertion이나 실행 횟수를 더해 전체 고유 테스트 수로 표시하지 않습니다. 비교 결과는 `verification/v21/results/comparison.json`과 원본/수정 로그에 있습니다.

## 시도했지만 완료하지 못한 검사

| 검사 | 결과 | 실제 이유 |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | exit1 / NOT_READY | registry.npmjs.org DNS EAI_AGAIN. 패키지 관리자 다운로드 단계에서 실패 |
| `tsc -b` | exit1 / NOT_READY | 미설치 vite/client·node 타입 TS2688. Vite 프로덕션 빌드 미도달 |
| `bash gradlew test bootJar --no-daemon` | exit1 / NOT_READY | services.gradle.org UnknownHostException. Spring 컴파일/JUnit 실행 미도달 |
| 실제 Chromium 오프라인 리더 | NOT_READY / 완료0개 | 첫 로컬 페이지를 ERR_BLOCKED_BY_ADMINISTRATOR로 차단. 환경 정책 변경·우회 없음 |
| 실제 SQL001~016 및 릴리스 게이트 | NOT_READY / exit2 | 격리 테스트 DB 준비 보고서/접속 환경 미준비. 마이그레이션 미실행 |
| 새 Spring/PostgreSQL 판매 철회 테스트 | 미실행 | 정식 빌드 및 위 실제 DB 환경 필요 |
| 실제 iPhone/Android·Vercel·R2·카카오·Codex·부하 | 미실행 | 외부 계정·운영 데이터·실기기 사용하지 않음 |

다운로드/실행 환경 오류는 소스 컴파일 오류를 입증하지 않습니다. 반대로 대역 검사 통과가 실제 배포 성공을 입증하지도 않습니다. 로그의 프로세스 `FAILED`는 해당 실행의 종료 결과이고, 환경 미준비 여부는 표의 실제 원인과 browser/release-gate JSON을 함께 확인합니다.

## 이번 로그

모두 `verification/v21/results/` 기준입니다.
- `baseline-complete.log`, `baseline-complete-exit.json`: 원본 기존 검사 exit0.
- `baseline-v20.log`: 초기 실행이 도구 시간제한으로 중단된 부분 로그. 통과 근거가 아니며 완주 기록은 baseline-complete입니다.
- `original-v20-node.log`, `original-v20-java.log`: 원본에 이번26개 실행.
- `new-node.log`, `new-java.log`, 각각의 exit JSON, `comparison.json`: 수정본과 비교.
- `existing-support.log`, `existing-trade.log`, `existing-library-state.log`, `type-contracts.log`: 별도 기존 회귀 확인.
- `final-checks.log`, `final-checks-exit.json`: 현재 진입점 완주 exit0.
- `frontend-install.log`, `frontend-build.log`, `backend-build.log` 및 exit JSON: 실제 설치/빌드 시도.
- `browser-offline.json/log`, `release-gate.json/log` 및 exit JSON: 실제 미완료 지점.

수집기 로그에 FAILED라는 가상 응답이 있어도 실패 경로를 검증하는 테스트 데이터일 수 있습니다. 실제 실행 결과는 unittest의 Ran170/OK와 실행기 종료코드로 확인합니다.

## 재실행

```sh
python verification/run_checks.py
# 신규 20 Node + 6 Java 시나리오만
node --test verification/v21/test_public_cache.cjs verification/v21/test_attempt_storage.cjs
python verification/v21/check_java.py
# 실제 브라우저 / 실제 독립 테스트 DB가 있어야 함
python verification/v21/browser_offline.py
python verification/v18/prepare_test_db.py --confirm-isolated-empty-test-cluster
python verification/v21/release_gate.py
```

이름이 localhost라도 운영 DB를 포워딩한 주소나 공유 DB를 넣으면 안 됩니다. 테스트 준비 도구의 전용·빈 로컬 클러스터 조건을 따라야 합니다. 실제 배포 및 실사용 수락 검사는 `docs/deployment/FULL_V21_KO.md`를 확인하세요.
