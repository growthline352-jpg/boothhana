# 부스하나 v23 · 이번 검증 결과

2026-09-18 · **productionApproval=false**

## 실행하여 통과

| 검사 | 결과 | 실제 범위 |
|---|---|---|
| 원본 v22 기존 검사 | exit0 | 이번 작업에서 다시 실행한 기준 검사 |
| 신규 모달 수명 | 7개 통과 | 실제 TypeScript helper + 명시적인 DOM 대역 |
| 신규 공개 조회·필터·상태·이동 | 14개 통과 | 실제 페이지/helper + hooks/router/API 대역 |
| 신규 보관함·다운로드 안내/입력 | 7개 통과 | 실제 페이지/panel + hooks/API 대역 |
| 동일 신규28개를 원본v22에 실행 | 23실패·5통과·취소0 | 신규 UI 요구사항도 포함. 독립 결함23개를 뜻하지 않음 |
| 게이트 기록 도구 | 3개 통과 | 이전 성공 파일 초기화·후속 검사 실패·승인 분리 |
| 기존 인증·문의·초안·보관함·오프라인·지역/분류 | 독립 검사 통과 | 이전 검사의 프레임워크/API/JDBC 대역 경계 유지 |
| 수집기 | 170개 통과 | 로컬 fixture·가짜CLI/HTTP. 실제 행사 수집 아님 |
| 현재 `verification/run_checks.py` | exit0 | 신규+이전 회귀 및 수집기 포함 |
| TypeScript 문법·로컬 타입계약 | 통과 | 실제 프로젝트 외부 라이브러리 타입은 대역. 정식 의존성 빌드와 다름 |
| 실제 Chromium 모달 | 3개 통과 | 독립 HTMLDialogElement + 실제 helper. React 없이 네이티브 DOM 이벤트/초점/스크롤 확인 |
| 같은 네이티브 모달을 원본v22에 실행 | 1실패·2통과 | 부모 창을 먼저 닫으면 hidden이 남는 경로를 직접 재현 |
| 실제 Chromium 정적 화면 | 4화면×4폭=16개 통과 | 320/390/768/1280px의 가로 넘침 없음. 실제 JSX/CSS + 가상자료를 HTML로 변환. 앱 hydration/API/검색·저장 기능 검증 아님 |

정적 화면은 탐색·행사상세·빈 보관함·날짜오류입니다. 핵심 모바일 메뉴/검색 버튼 크기와 정적 배치도 확인했지만 모든 화면·문자열·확대율·스크린리더·실기기를 전수 검사한 것은 아닙니다. PNG는 `preview/v23/`에 있습니다.

**브라우저 검증을 구분합니다:** 빈 문서에 HTML을 주입하는 독립 DOM/정적 화면 검사는 실행됐지만, 관리 정책이 localhost 서비스로의 페이지 이동을 차단해 실제 앱/오프라인 리더 시나리오는 완료하지 못했습니다. 정책을 변경하거나 다른 주소로 우회하지 않았습니다.

## 시도했지만 완료하지 못함

| 검사 | 상태/이유 |
|---|---|
| `corepack pnpm install --frozen-lockfile` | exit1. registry.npmjs.org DNS EAI_AGAIN, 패키지 관리자 다운로드 단계에서 실패 |
| 프런트 `tsc -b` | exit1. 미설치 vite/client·node 타입 TS2688, 정식 Vite 빌드 미도달 |
| 백엔드 `gradlew test bootJar --no-daemon` | exit1. services.gradle.org UnknownHostException, Spring 컴파일/JUnit 미도달 |
| 실제 localhost 오프라인 리더 | NOT_READY, 완료0. ERR_BLOCKED_BY_ADMINISTRATOR |
| 실제 PostgreSQL001~016/릴리스 게이트 | NOT_READY, exit2. 새 격리 테스트 DB 준비 보고서·환경 없음 |
| 실제 iPhone/Android·접근성 보조기술·API·R2·OAuth·Codex·부하 | 미실행 |

환경 실패는 소스 오류를 입증하지 않으며, 대역/정적 검사 성공 역시 정식 빌드·운영 성공을 보장하지 않습니다. 실제 DB·계정·GitHub·배포·예약 작업은 변경하지 않았습니다.

## 이번 기록

`verification/v23/results/`: `baseline-complete.log` 및 exit JSON, `final-checks.log` 및 exit JSON, `new-tests.log`, `original-v22-tests.log`, `comparison.json`, `types.log`, `native-dialog.json/log`, `baseline-native-dialog.json/log`, `static-layout.json/log`, `frontend-install.log/json`, `frontend-build.log`, `backend-build.log`, `browser-offline.json/log`, `release-gate.json/log`.

테스트 횟수/조건 수를 합쳐 하나의 고유 테스트 총수로 표시하지 않습니다. `baseline.log` 등 중간 점검 로그가 있다면 완주를 증명하는 `*-exit.json`이 있는 실행을 우선합니다. 이전 버전의 results는 역사 자료입니다.
