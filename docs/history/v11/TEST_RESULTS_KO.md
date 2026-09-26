# v11 실제 검증 결과 · 2026-09-17

기준 전체본은 `BoothHana2-full-v10-reviewed-20260917.zip`입니다. 이 문서는 이번 코드에서 수행한 검사만 설명합니다. 이전 버전의 검증 폴더·로그는 과거 기록입니다.

## 실행한 검사

| 검사 | 결과 | 실제 범위 |
|---|---|---|
| 기존 Python 수집기 | **170개 통과** | 이번 실행기의 앞부분에서 완주. 가짜 CLI·로컬 HTTP·가상 도면을 사용하는 테스트 |
| API 클라이언트 | **17개 통과** | 기존 14 + 문의 코드 3. 실제 client.ts를 변환해 mock fetch로 실행 |
| 기존 조회·이미지 업로드 제어 | **13개 통과** | 실제 모듈을 hook/mock 환경에서 실행 |
| 기존 검토·탐색·방문 UI | **254개 조건 통과** | 34+60+49+11+21+68+11, 실제 소스의 독립 함수·핸들러 |
| 기존 Java 규칙 | **389개 조건 통과** | 실제 javac/java. 데이터베이스·외부 프레임워크 실행 아님 |
| 기존 대표 배너 서비스 | **20개 조건 통과** | 실제 서비스 + 가짜 JDBC |
| 기존 v10 디자인 | **62개 조건 통과** | 선택 색상 대비·소스 레이아웃·기존 메뉴 보호 |
| 새 행사 공개·순위·진단·스키마 규칙 | **121개 조건 통과** | 실제 DTO 모든 필드 보존, 순위 조건·30일 범위, 비밀값 없는 진단. SQL은 문자열 계약 검사 |
| 새 굿즈·준비 확인 서비스 | **22개 조건 통과** | 실제 서비스 코드 + 가짜 JDBC. 빈 데이터·이미지 제한·공개 응답의 수량 비노출·RLS 경고·준비 결과 캐시 |
| 새 오류 처리 | **7개 조건 통과** | 실제 ApiExceptionHandler + 명시적 HTTP/SLF4J stub. 문의 코드·로그 연결과 비밀값 미포함 |
| 새 캐러셀·전체화면 지도 UI | **44개 조건 통과** | 실제 TS/TSX 함수·핸들러. 기준 형식·빈 결과·품절·키보드·모달 내부 상세/복귀 |
| 새/기존 로컬 타입 계약 | **통과** | 실제 소스 파일의 내부 타입 연결. React/Router/Spring/JDBC/HTTP 정의는 명시적 테스트 stub |
| 전체 소스 구문 | **TS/TSX 64개, Java 99개 파일 통과** | 문법 파싱. 실제 외부 의존성 전체 빌드는 아님 |
| Chromium 가상 화면 | **58개 조건 통과** | 1440/768/390/320px 수동 캐러셀·이름·넘침·품절·집계 안내, 단일 native dialog 상세/복귀·초점 |

번호 생성 10,000개 표본 검사도 기존 순수 Java 검사에서 실행했습니다. 중복 가능성이 수학적으로 0이라는 의미는 아닙니다.

새 실행기 `python verification/v11/run_checks.py`는 종료코드 0으로 완주했습니다. 기존 전체 실행기는 환경의 실행 제한에서 중단되어, 완료된 앞부분 로그를 보존하고 나머지 Java·v7·v8·v9·v10 검사를 각각 실행해 확인했습니다. **기존 전체 실행기 1회 완주로 표현하지 않습니다.**

## 검사 과정에서 수정한 사항

새 공유 상품 내용 컴포넌트가 생겨 이전 테스트의 얕은 노드 탐색을 해당 자식 컴포넌트까지 확장했습니다. 관리자 메뉴 목록에는 새 ‘메인 굿즈’를 포함했습니다. Java 로컬 계약 검사에 새 공개 복사 클래스를 추가하고, 테스트 하네스에서 굿즈 API를 명시적으로 모의했습니다. 기존 검증 의도(상시 상품 접기, 권한별 메뉴 등)는 삭제하지 않았습니다.

실제 신규 페이지 타입 연결 검사에서 PageHeader의 필수 eyebrow가 빠진 점을 발견해 추가했습니다. Jakarta TYPE_USE와 같은 목표를 가진 stub 검사에서 `@NotNull java.util.UUID` 표기가 거절되어 UUID import 형식으로 정리했습니다. 이 사실과 실제 Spring/Jakarta 전체 빌드 성공은 별개입니다.

## 브라우저 검사와 캡처의 한계

`preview/v11`은 실제 소스 JSX/CSS를 명시적 hook 하네스로 정적 출력한 가상 화면입니다. 굿즈 8개와 순위·가격·관리자 수량은 **가상 검증 데이터**이며 실제 판매 실적이 아닙니다. 저장소의 예시 이미지는 미리보기에서만 사용하며 운영 DB나 홈의 초기 데이터로 넣지 않습니다.

미리보기의 스크롤·모달 연결 JavaScript는 별도 정적 DOM 어댑터입니다. 실제 React 상태/라우터/API E2E를 실행한 결과가 아닙니다. 실제 컴포넌트 핸들러는 별도 44개 검사에서 확인했습니다.

## 실제 시도했으나 완료하지 못한 빌드

- `npm run build --prefix frontend`: vite/client와 node 타입 의존성 미설치로 TS2688. React19/Router8/TS6/Vite8 실제 빌드까지 진행되지 않았습니다.
- `sh backend/gradlew test --no-daemon`: services.gradle.org DNS 오류로 Gradle 배포 다운로드 실패. 백엔드 전체 컴파일에 진입하지 못했습니다.

프로젝트 선언 버전을 몰래 낮추거나 lockfile을 바꿔 성공한 것처럼 표시하지 않았습니다. 스테이징에서 실제 의존성을 설치해 다시 빌드해야 합니다.

## 실행하지 못한 검사

- SQL 010·011의 실제 PostgreSQL 적용·RLS/grants·공유 앱 영향·동시성·실제 쿼리 결과/실행시간.
- 새 `GoodsRankingPostgresTests` 3개, 기존 CatalogPostgresTests에 추가한 상태 보존 1개, 오류 응답 JUnit 1개. 작성되어 있지만 Gradle에서 실행하지 않았습니다.
- 실제 API 인증·CSRF·readiness 응답과 Render 배포 gate, 실제 문의 코드와 운영 로그의 연결.
- 실제 Kakao·R2·Codex·수집기 스케줄, 기존 공개본 재발행.
- 실제 React 앱의 브라우저/실물 모바일 터치·뒤로 가기·키보드 전체 동선.

## 재실행

```powershell
python verification/v11/run_checks.py
node verification/v11/render_preview.cjs
python verification/v11/browser_check.py
```

위 독립 검사에는 Java21·Node·TypeScript 모듈, 브라우저 검사에는 Python Playwright/Chromium이 필요합니다. 저장소 전체 독립 검사는 `python verification/run_checks.py`, 실제 프로젝트 검사는 `pnpm lint`, `pnpm build`, `gradlew test`, `gradlew bootJar`입니다.

이번 로그는 `verification/v11/results/`에 있습니다. `regression-*.log`의 중단 지점과 개별 완료 로그를 구분하세요. 최종 ZIP 파일 수·보존/변경 목록·체크섬은 같은 폴더의 `package-report.json`과 루트 `SHA256SUMS.txt`를 기준으로 확인합니다.

**이 전체 소스는 운영 배포 승인본이 아닙니다.** 코드와 문서 작성·독립 검증만 수행했으며 GitHub/운영 DB/호스팅/사용자 PC의 실제 스케줄에는 변경하지 않았습니다.
