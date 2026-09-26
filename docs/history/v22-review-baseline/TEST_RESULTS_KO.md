# 부스하나 v22 · 이번 검증 결과

2026-09-18 · 원본 v21 / 수정본 v22 · **productionApproval=false**

## 실행한 검사

| 검사 | 결과 | 실제 경계 |
|---|---|---|
| 수정 전 원본 v21의 기존 통합 검사 실행기 | exit0 | 이번 작업에서 새로 실행. 전체 framework/DB 빌드가 아님 |
| 신규 조회 순서 보호 | Node6개 통과 | 실제 useRemote/RemoteScope, hooks/Promise 대역 |
| 신규 비회원 문의 조회 수명 | Node6개 통과 | 실제 GuestSupportPage 이벤트, hooks/JSX/API 대역 |
| 신규 보관함 공개 투영·지역 주소 | Node10개 통과 | 실제 페이지/helper 코드, hooks·공개 API 경계 대역 |
| 동일 신규22개를 원본 v21에 실행 | 14실패·8통과·취소0 | 같은 원인의 여러 조건 포함. 독립 결함14개 아님 |
| 새 릴리스 기록 도구 | Python3개 통과 | 이전 성공 초기화/부모 성공 대기/후속 실패 검사. 실제 build/DB 실행 아님 |
| 기존 API·인증·초안·보관함·오프라인·지역·분류 | 독립 회귀 통과 | 기존 테스트의 React/HTTP/JDBC/JSON/저장소 대역 범위 그대로 |
| 수집기 | 170개 통과 | 가상자료/로컬 모의 CLI·API, 실제 행사 조사 아님 |
| TypeScript/Java 문법·로컬 타입 계약 | 통과 | TS/TSX98개·Java129개 문법, 외부 라이브러리는 대역. 실제 dependencies 빌드 아님 |
| 현재 통합 진입점 | `python verification/run_checks.py` exit0 | 위 신규+이전 연쇄 검사와 수집기 포함 |

실제 TypeScript 모듈을 transpile해 실행하지만 test runtime은 간소한 동기 hooks/JSX 대역입니다. 실제 React 재조정·DOM·브라우저 이벤트·네트워크·DB를 대신하지 않습니다. 메모 편집기 key/revision 유지 확인과 실브라우저의 입력값 보존은 구분합니다. 중첩 실행 횟수·assertion 수를 더해 고유 테스트 총수로 표시하지 않습니다.

## 새로 시도했지만 완료하지 못한 검사

| 명령/검사 | 결과 | 확인한 이유 |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | exit1 / NOT_READY | registry.npmjs.org DNS EAI_AGAIN, 패키지 관리자 다운로드 실패 |
| 프런트 `tsc -b` | exit1 / NOT_READY | 미설치 vite/client·node 타입 TS2688. Vite build에는 도달하지 못함 |
| `bash gradlew test bootJar --no-daemon` | exit1 / NOT_READY | services.gradle.org UnknownHostException. Spring 컴파일/JUnit 미도달 |
| 실제 Chromium 오프라인 리더 | NOT_READY / 완료0개 | localhost 첫 페이지가 ERR_BLOCKED_BY_ADMINISTRATOR로 차단. 정책 우회 없음 |
| 실제 SQL001~016 및 릴리스 게이트 | NOT_READY / exit2 | 새 격리 테스트 DB 준비 보고서/접속 환경 미준비. migration 미실행 |
| 이번 문의/메모의 실제 React DOM 통합 | 미실행 | 정상 실제 프런트 빌드와 브라우저 환경 필요 |
| 실제 모바일·Vercel·카카오·R2·Codex·부하 | 미실행 | 운영 계정/인프라/실기기 미사용 |

다운로드 오류는 소스가 컴파일에 실패한다는 증거가 아니며, 대역 검사 통과도 실배포 성공을 증명하지 않습니다. 실제 DB·브라우저 결과를 기존 로그에서 가져와 통과로 처리하지 않았습니다.

## 로그와 재실행

현재 로그는 `verification/v22/results/`입니다.
- `baseline-v21.log`, `baseline-v21-exit.json`: 수정 전 원본 기존 검사의 이번 실행.
- `original-v21-new-tests.log`, `new-tests.log`, 각 exit JSON 및 `comparison.json`: 같은 신규22개 원본/수정 비교.
- `final-checks.log`, `final-checks-exit.json`: 최종 현재 runner 완주.
- `frontend-install`, `frontend-build`, `backend-build`의 log/exit JSON: 이번 설치·빌드 시도.
- `browser-offline.json/log`, `release-gate.json/log` 및 exit JSON: 실제 미완료 원인.

```sh
python verification/run_checks.py
# 신규 제품22개만
node --test verification/v22/test_remote.cjs verification/v22/test_guest_session.cjs verification/v22/test_public_views.cjs
# 게이트 기록 검사3개만
python -m unittest discover -s verification/v22 -p test_gate.py -v
# 기존 실제 오프라인 리더 시나리오, 별도 브라우저 환경 필요
python verification/v22/browser_offline.py
# 전용 비어 있는 로컬 테스트 클러스터만 허용. 운영/공유 DB 사용 금지.
python verification/v18/prepare_test_db.py --confirm-isolated-empty-test-cluster
python verification/v22/release_gate.py
```

`browser_offline.py`는 이전 실제 오프라인 리더 시나리오를 v22 작업 소스로 다시 실행해 새 결과 경로에 기록하는 실행기입니다. 이번 문의·보관함 React E2E를 추가한 것으로 표시하지 않습니다. 릴리스 게이트는 모든 자동 검사가 통과해도 productionApproval을 true로 만들지 않으며 실사용 수락검사는 별도입니다.
