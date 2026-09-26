# 실제 검증 결과 · 전체 소스 v7 · 2026-09-17

## 기준 및 통합

대상 원본은 `BoothHana2-full-v6-20260916.zip`입니다. 원본 전체를 해제하고 리뷰 R6-01~06을 수정했습니다. 원본 자산과 Gradle wrapper 및 collector/·기존 SQL001~007은 원본 바이트를 보존합니다. 새 SQL008을 추가합니다. 자세한 최종 대조는 `verification/v7/results/package-report.json`, 파일별 해시는 `SHA256SUMS.txt`에 남깁니다.

## 이번 최종 코드에서 실행한 검사

| 검사 | 실제 결과 | 범위 |
|---|---|---|
| 기존 Python 수집기 | **129개 통과** | 가짜CLI·로컬API/데이터 검증. 실제 행사 검색 아님 |
| 기존 API·조회·업로드 | **27개 통과** | actual TS source + mock fetch/hook |
| 기존 v5 검토UI | **34개 검증조건 통과** | source editor/override/product handler, React DOM 아님 |
| 기존 v6 탐색UI | **60개 검증조건 통과** | 카드·URL·날짜 source/hook. 날짜 표시의 의도된 새 정책에 기존 기대값1건 수정 |
| 새 v7 화면 규칙 | **49개 검증조건 통과** | 실제 source 함수/JSX 핸들러: 선택기간/과거+미래/휴무, 검색, map, drawer 호출, null banner, 예약이름 |
| 새 대표배너 UI | **11개 검증조건 통과** | 실제 BannerSelectionPanel 핸들러의 자격·revision전달·중복클릭·확인취소·오류 처리 |
| 기존 Java 순수규칙 | **329개 검증조건 통과** | 32+25+47+51+88+86. javac21 및 실제 pure rule 실행 |
| 새 대표배너 서비스 | **20개 검증조건 통과** | 실제 CatalogMediaService를 컴파일/호출하되 JdbcTemplate·외부 의존성은 명시적 fake/stub. 실제 SQL/잠금 검증 아님 |
| 번호생성 표본 | **10,000개 검사 통과** | 표본 중복/형식 확인. 충돌 불가능 증명 아님 |
| 전체 구문 검사 | **TS/TSX47개, Java80개 파일 통과** | 파서 수준. 실제 라이브러리 타입·빌드 검증 아님 |
| 로컬 TS/Java 계약 | **통과** | 새 UI/컨트롤러/서비스 포함. 실제 React/Router/Spring/AWS 정의 대신 stub 사용 |
| Chromium | **48개 검증조건 통과** | 1440·390·320 폭. source기반 staticDOM + 실제 dialogLifecycle 함수를 사용. 모달가시성·초점·Tab/Escape·복귀·스크롤·지도·접근성이름 |

전체 독립 실행기 `python verification/run_checks.py`의 이번 종료코드는 **0**입니다. 로그는 `verification/v7/results/offline-current.log`, 브라우저 결과는 `browser-checks.json`/`browser-checks.log`입니다. 스크린샷은 `[TEST]` 가상 부스/상품으로 검증한 화면이지 실제 행사·DB 조회 결과가 아닙니다. 기존 verification/v4~v6/results/는 과거 기록으로 보존했습니다.

환경: Python3.13, OpenJDK21, Node22.16, 검증용 TypeScript5.8.3, 시스템 Chromium. 원본 프로젝트의 TypeScript6/React19/Router8/Vite8 의존성 빌드는 아래와 같이 완료하지 못했습니다.

## 이번에 직접 시도했지만 실패한 전체 빌드

| 명령 | 실제 결과 |
|---|---|
| `sh backend/gradlew -p backend test --no-daemon` | Gradle9.5.1 다운로드에서 `UnknownHostException: services.gradle.org`. 프로젝트 전체 컴파일/JUnit에 진입하지 못함 |
| `npm run build --prefix frontend` | 설치되지 않은 vite/client 및 node 타입 정의로 TypeScript build 실패 |

로그는 `gradle-attempt.log`, `frontend-build.log`와 해당 exit 파일입니다. 파서와 stub type check 통과를 전체 빌드 성공으로 표현하지 않았습니다.

## 작성했으나 실행하지 못한 검사

- CatalogPostgresTests에 새 **8개** 테스트를 추가: 명시적 대표 목록/상세 일치, 권한철회와자동복귀, 저장실패, 선택/이미지revision충돌, 타유형/미승인, 타행사, 동시관리자, SQL008재실행.
- 실제 PostgreSQL SQL001~008 적용, FK/RLS/트랜잭션/잠금/롤백과 공개조회.
- 실제 Spring HTTP ADMIN/CSRF/CORS PUT 검증. 기존체인 유지와 PUT허용은 소스/로컬 계약에서 확인했지만 서버를 기동하지 못함.
- 실제 React state/effect·라우터·API와 연결한 브라우저 E2E, 로그인/예약/POS/R2 연결.
- 실제 Codex검색 및 일요일 예약 작업. 이 변경으로 collector 코드/설정/스케줄을 변경하지 않음.
- 실제 R2 사용권한·파일 존재·네트워크 실패 등 운영환경 연결.

가짜80부스와 상세를 실제 코드에서 static으로 렌더하고 dialog helper를 브라우저에서 실행한 것과 전체 React 앱을 기동한 것은 다릅니다. Map URL은 가상도메인 request를 intercept했고 실제 외부 포스터를 사용하지 않았습니다.

## 재실행

```powershell
python verification/run_checks.py
node verification/v7/render_browser_fixture.cjs
python verification/v7/browser_checks.py
```

브라우저 검사는 Playwright/Pillow/Chromium 설치 환경에서 선택 실행합니다. 실제 프로젝트 빌드와 **전용 테스트 DB 초기화 위험을 가진 opt-in JUnit**은 `docs/deployment/FULL_V7_KO.md`의 절차를 따르세요.

**전체 소스 통합 및 독립 검증은 완료했지만, 운영 배포 승인본은 아닙니다. 스테이징에서 실제 빌드·DB·브라우저 연결 검증 후 운영에 적용하세요.**
