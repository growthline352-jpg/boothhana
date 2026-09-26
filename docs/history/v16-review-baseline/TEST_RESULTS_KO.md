# v16 실제 검증 결과 · 2026-09-18

기준은 실제 업로드된 v15 ZIP(865개 파일), SHA-256 `33e9af931f64f75e9f4cf8788058b3301b6e82b4195b42926ef7b6aab115f514`입니다. 이전 회차의 통과 로그를 이번 실행 결과로 재사용하지 않았습니다. 운영 DB·GitHub·배포·스케줄을 변경하지 않았습니다.

## 이번 최종 코드에서 실행한 것

| 검사 | 결과 | 경계 |
|---|---|---|
| v16 집중 실행기 | 종료코드0, 완주 | `verification/v16/results/focused-final.log` |
| 인증·공개 캐시·기기 필터·페이지·임시 편집 초안 및 Provider | **28개 Node 테스트 통과** | 실제TS 모듈/Promise, 실제Provider 함수. 외부API/스토리지/React훅은 대역. React DOM·쿠키 미실행 |
| 신규 화면/핸들러 | **37개 검증조건 통과** | 실제카드/저장입력/메모open-close/경고/오류화면, 명시적 React/Router 대역 |
| 신규 서버 투영/일괄조회 | **58개 검증조건 통과** | 실제LibraryTargets/Service, scripted JDBC. 쿼리횟수 계측이며 SQL 실행·속도 측정 아님 |
| 기존 보관함 서버 | **32+35개 검증조건 통과** | 실제규칙·서비스와 모의JDBC/JSON |
| 기존 기기저장/UI | **47+31개 검증조건 통과** | 실제TypeScript와 모의저장소/훅 |
| 게이트 거절 경계 | **9개 테스트 통과** | 환경·XML 대역의 누락/실패/skip/stale 거절 |
| 새/기존 연결의 로컬 타입 | 통과 | React/Router 외부타입은 명시적 STUB. erasableSyntaxOnly/verbatimModuleSyntax 포함 |
| 전체 구문 | **TS/TSX92개, Java128개 파일 통과** | 파싱/선택 로컬타입이지 실제 외부의존성 전체 빌드 아님 |
| 기존 수집기 | **170개 테스트 통과** | 가짜CLI/로컬 모의API. 실제 검색·운영DB 아님 |
| 기존 UI 선택 회귀 | 실행한13개 스크립트 모두 종료0 | API17/조회13/카탈로그34/탐색60/드로어49/배너11/지도21/방문68/디자인62/굿즈44/고객센터55/접수29/거래26 조건. 실제React 앱 아님 |

assertion 수를 단위테스트 수·커버리지·성능점수로 환산하지 않습니다. v16 집중 실행기는 완주했지만 `verification/run_checks.py` 전체를 한 번 완주했다고 주장하지 않습니다. 수집기와 기존 UI는 개별로 재실행했습니다. 로그에 등장하는 가상 `FAILED` 배치 응답은 실패 상태를 검사하는 fixture이며 실제 외부배치 실패가 아닙니다.

## 핵심 결과

- 회원 상태에서 me503/403/timeout/network → 오류/확인 중. 기기 저장0, 늦은member응답의 다른계정 노출 차단.
- 확인된401만 anonymous. 로그아웃 실패는 error. A조회가 늦게 와도 B정체성을 덮지 않음.
- 200개 기기공개정보 초기 조회API 1회(CSRF 초기화 요청은 별도);30초 내 검색/페이지/메모의 로컬 계산은 추가 조회API 0회.30초 만료·명시무효화 후 재검증.
- 현재결과 미완성/오류/권한철회에서 stale정보를 무조건 반환하지 않음. 메모는 공용요청 밖에 유지.
- 200개 공개 대상=1 queryForList, 회원페이지=방문/본문/이미지3 queryForList: 가짜JDBC 경계에서 실제 서비스의 호출수 확인.
- 공개 상품의 미재확인/확인완료/LEGACY, 마지막 확인시각, 품절/취소/원문경고 보존.
- 10/1~5 행사에서10/3~4 조건 → 상세와저장모두10/3. 비연속구간 공백을 운영일로 만들지 않음.
- page2(3페이지)→메모open-close에서page2유지. 실제필터변경만page초기화.

## 검사 도중 보완한 경계

기존 scripted JDBC는 대상당4인수를 기대했으나 새묶음쿼리는 순서 인수를 포함한5인수이므로 테스트dispatcher를 갱신했습니다. 원래35개 보호검증을 제거하지 않았습니다. 강화한 TS 문법검사에서 기존 GuestStore/TradeSubmission 생성자 매개변수프로퍼티가 선언 설정과 충돌해 명시적 필드로 수정했습니다. 런타임에 test stub을 넣거나 라이브러리 버전을 낮추지 않았습니다.

## 실제 시도했지만 완료하지 못한 것

- `npm run build --prefix frontend`: exit1. 설치되지 않은 vite/client·node 타입으로 TS2688. 실제 번들 생성 실패.
- `sh backend/gradlew -p backend test --no-daemon`: exit1. services.gradle.org DNS 오류로 Gradle 다운로드 단계 실패. 실제 Spring 컴파일/JUnit 시작 못함.
- `python verification/v16/release_gate.py`: exit2/NOT READY. 전용 테스트 DB 설정 없음. 정상적으로 승인 차단된 것이지 빌드/통합 성공 아님.
- 현재 확인한 환경: node22.16, Java21, Python3.13. pnpm/psql/docker가 없고 npm/Gradle/Maven 호스트 DNS 해석 실패. 실제 명령·결과는 environment.json과 각 로그에 기록.

## 작성만 하고 실행하지 못한 것

LibraryIntegrationTests 새5개를 추가해20개로 확장하고 배포 게이트/CI의 요구 최소값을20으로 올렸습니다. SQL001~015·JDBC/RLS·SpringHTTP/CSRF·이미지승인테이블을 사용하는 테스트이며, 이번에는 의존성과 DB가 없어 **실행하지 못했습니다.** 이전full14/support8 통합검사도 실행하지 않았습니다.

실제 전체 의존성 빌드·React상태/effect·Router·브라우저메모초안/계정전환/로그인·다중탭·비공개전환·SQL성능·부하·Kakao·R2·QR·Codex·스케줄·백업복원은 여전히 스테이징 검증 대상입니다. 이 버전에서 새로운 브라우저 캡처를 실제앱 E2E 증거로 제공하지 않습니다.

## 보존·패키지

추가SQL없음. 기존database001~015/수집기·스케줄/브랜드원본/Gradlewrapper는 바이트대조합니다. 기존865파일을 누락 없이 포함하고 필요한코드·테스트·안내만 수정했습니다. 폰트바이너리/인증/실제env/config.local.json/.git/node_modules/캐시는 제외합니다. 최종CRC와파일별SHA256은 재검증하며 자세한 목록은 `verification/v16/results/package-report.json`, 릴리스정보는 `RELEASE_V16.json`입니다.

**판정: v15 리뷰5건 수정·독립검증·전체소스 패키징 완료. 실제 운영배포 승인 아님.**
