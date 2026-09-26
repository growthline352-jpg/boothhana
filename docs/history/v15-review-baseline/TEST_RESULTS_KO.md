# v15 실제 검증 결과 · 2026-09-18

## 대상
실제 확보된 `BoothHana2-full-v14-20260917.zip`에서 추출한 전체 소스를 변경했습니다. 기준 SHA-256은 `65a2d5e417c2484075b582c2804b0eec97e88303143484f9454f40ad73038380`입니다. 과거 존재가 확인되지 않았던 버전·파일·실행 주장을 재사용하지 않습니다.

## 이번에 실행한 검사
| 검사 | 결과 | 검증 경계 |
|---|---|---|
| v15 집중 실행기 | **종료코드0** | `verification/v15/results/focused-final.log`. 아래 독립 검사의 묶음 |
| 새 Java 규칙·공개 투영 | **32개 검증 조건 통과** | 실제 LibraryRules/Targets. 외부 프레임워크/Jackson은 명시적 stub |
| 새 보관함 서비스 흐름 | **35개 검증 조건 통과** | 실제 LibraryService/Targets + in-memory JDBC dispatcher/JSON registry. SQL/트랜잭션은 실행하지 않음 |
| 기기 저장·검색·공개 공유 주소 | **47개 조건 통과** | 실제 TypeScript 모듈, 메모리 localStorage 대역 |
| 새 UI·저장 버튼·연결 | **31개 조건 통과** | 실제 TSX 함수/markup, 명시적 mock hooks. React DOM 아님 |
| 배포 게이트 방어 | **9개 테스트 통과** | 환경/가상 JUnit XML의 미설정·누락·실패·skip·stale 거부 |
| 로컬 TS 계약 | **통과** | 실제 신규/연결 모듈, React/Router/qrcode 외부 선언은 test stub |
| 전체 구문 | **TS/TSX85개, Java128개 통과** | 파싱만. 실제 의존성 타입·SQL·실행 성공 아님 |
| Chromium 정적 시안 | **120개 조건 통과** | 계정/기기/빈상태 × 1440/768/390/320폭, 넘침·접근 가능한 이름·native dialog/초점. preview-only JS, 실제 React 앱 아님 |
| 기존 collector | **170개 테스트 통과** | 기존 루트 회귀 앞 단계. 가짜 CLI·로컬 모의 API, 실제 검색/DB 아님 |
| 기존 UI 선택 회귀 | 개별 단계 통과 | API14/조회13, v5편집34, v6탐색60, v7화면49/배너11, v8지도21, v9방문68, v14거래복구26, v13접수복구29, v12지원55. 각 파일의 경계는 mock hooks/순수 함수 |

검증 조건(assertion) 수를 단위테스트 수·커버리지·품질점수로 변환하지 않습니다.

### 실제로 점검한 핵심
- 상품 저장 1개에 업체·행사 맥락, 같은 대상 재저장 시 개인 메모 보존.
- 다른 회원 UUID 상세/수정 거부, 가져올 계정과 실제 로그인 계정 불일치 거절.
- 이미 저장한 메모·비어 있지 않은 방문 계획과 다르면 기기 원본을 남기는 충돌 결과.
- 오래된 메모 revision 수정/삭제 거절, 사용자 작성 메모는 불변의 공개판정 근거와 분리.
- 상품과 참가 부스가 공유하는 명시적 방문 표시. QR/조회만으로 방문 생성 안 됨.
- 미래·휴무일 방문 거절, 숨겨진 자료에 새로운 방문 확정 불가, 기존 표시 해제 가능.
- 공개 철회 시 과거 이름·소개·이미지·원문 링크를 반환하거나 검색하지 않으며 본인 메모는 유지.
- 현재 공지·가격·판매 상태와 저장 당시 작은 기억을 분리, image URL은 기억JSON에 저장하지 않음.
- 기기 저장 만료 후 접근 시 제거, 다른 앱의 localStorage 키 보존, 저장소 거절 안내.

## 검사 중 발견·수정한 것
처음 서비스 대조에서 이미 저장된 상품ID를 다른 부모 부스로 제출하면 기존 결과가 반환되는 경우를 발견해, 재전송도 부모 부스 일치를 확인하도록 고쳤습니다. 행사 보관 카드의 지도 링크가 기본 부스탭으로 가던 경로도 고쳤습니다. 메모 폼은 다른 탭 갱신 때문에 무조건 재마운트되지 않도록 하고 오래된 revision을 거절합니다. 가져오기 시 메모뿐 아니라 방문계획 충돌도 보존합니다.

초기 테스트 파일의 괄호·잘못된 테스트 경로, QR 코드의 외부 test stub 누락을 수정했습니다. 애플리케이션에 stub을 넣지 않았습니다. 최초 미리보기에서 data URI가 실제 StoredImage 안전 규칙에 의해 거절되어, 가상의 HTTPS 자산주소로 소스를 렌더한 뒤 시안에서만 이미지 bytes를 내장했습니다. sticky 헤더는 스크롤0으로 복귀한 뒤 캡처했습니다. 초기 로그와 최종 로그를 구분해 보관합니다.

## 기존 전체 실행기에 관한 제한
기존 `verification/run_checks.py`는 최초 시도에서 새 QR import용 외부 stub이 없어서 중단됐고, 해당 test declaration을 보완한 두 번째 시도는 환경의45초 제한에서 Java 계약 직전에 중단됐습니다. 완료된 검사는 보존하고 새 기능과 기존 화면 회귀를 개별 실행했습니다. **이 루트 실행기를 한 번 완주했다는 뜻은 아닙니다.** v15 집중 실행기만 최종 종료0을 확인했습니다.

## 실제 전체 빌드 시도 — 완료하지 못함
- `npm run build --prefix frontend`: 미설치된 vite/client·node 타입으로 TS2688, 종료1. 전체 React/Vite 번들 생성 못함.
- `sh backend/gradlew -p backend test --no-daemon`: services.gradle.org DNS 오류(UnknownHostException), 종료1. Spring 전체 컴파일/JUnit에 진입 못함.
- `python verification/v15/release_gate.py`: 전용 DB 설정 없이 NOT READY·종료2. 통합 검사 통과가 아님.

로그: `verification/v15/results/frontend-build.log`, `backend-build.log`, `gate-refusal.log`.

## 작성했지만 실행하지 못한 검사
실제 SQL001~015·Spring 앱·JDBC·MockMvc HTTP/CSRF를 사용하는 **LibraryIntegrationTests 15개**를 추가하고 gate가 실행 누락/skip을 거절하도록 연결했습니다. 현재 환경에서는 필요한 의존성과 PostgreSQL이 없어 실행하지 않았습니다. 기존 release14·support8도 실제 실행하지 않았습니다.

추가 미검증: 실제 PostgreSQL/RLS/동시성·롤백·migration·public JSON SQL조회, 실제 React19/Router8/TS6/Vite8 빌드, 로그인 복귀·다중탭 계정전환·가져오기·브라우저 persistence·QR 생성/실물폰 스캔·스크린리더·실물 모바일, Kakao·R2 권한철회, 실제 Codex·배치, DB부하·복원. 현재는 운영 배포 승인본이 아닙니다.

## 결과 파일
- 집중 검사 `verification/v15/results/focused-final.log`
- 저장 모듈 `memory-final.log`, UI `ui-final.log`, 실제 Java 경계 `java-final.log`
- 이전 선택 회귀 `base-regression.log`, `base-regression-second.log`, `selected-ui-regression.log`, `support-final.log`
- 시안 `preview/v15/` / 브라우저 `browser-final.log`, `browser.json`, 캡처
- 최종 ZIP 내용 비교 `verification/v15/results/package-report.json`, 최상위 `SHA256SUMS.txt`

Source ZIP에 `.env` 실제값·config.local.json·auth·.git·의존성/빌드 캐시·폰트 바이너리를 넣지 않습니다. 기존 수집기·SQL001~014·원본 자산은 바이트 동일성을 비교합니다. ZIP 무결성은 운영 기능의 정상 동작 보증이 아닙니다.

[적용 안내](START_HERE_KO.md) · [DB 검토](docs/deployment/V15_DATABASE_REVIEW_KO.md) · [실제 환경 검증](docs/deployment/FULL_V15_KO.md)
