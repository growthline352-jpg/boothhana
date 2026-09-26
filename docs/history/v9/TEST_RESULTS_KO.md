# v9 실제 검증 결과 · 2026-09-17

기준 원본: `BoothHana2-full-v8-20260917.zip`. 실제 전체 소스를 해제한 작업 사본에 변경했습니다. 이전 버전의 테스트 성공 기록을 이번 실행 결과로 대체하지 않았습니다.

## 실행한 검사

| 검사 | 결과 | 범위 |
|---|---|---|
| Python 수집기 | **170개 통과** | 기존155+새15. 모의 CLI/로컬 HTTP/API, 상태 근거·날짜·스키마 호환·신규 identity 보존 |
| 기존 API/조회/이미지 업로드 제어 | **27개 통과** | 실제 TS 모듈 mock fetch/hook |
| 기존 검토·탐색·드로어·배너 UI | **34 + 60 + 49 + 11 조건 통과** | 실제 소스의 독립 함수/핸들러; 새 구조·문구에 맞게 테스트 어댑터 보완 |
| 기존 SVG UI | **21개 조건 통과** | 모의 DOM/키보드/상태; 폐기 지도 숨김 회귀 |
| 새 방문 UX 규칙·핸들러 | **68개 조건 통과** | 방문일·동일 번호 다른날/홀·UNKNOWN·취소·공유/뒤로가기·상품 분리·폼·오류 대안 |
| 새 실제 포인터 핸들러 | **11개 조건 통과** | 실제 PlanCanvas 함수를 모의 viewport/pointer capture로 실행. 터치 탭·끌기·핀치·취소·키보드·전체화면 상태 |
| 기존 순수 Java 규칙 | **329 + 35개 조건 통과** | 컬렉션/조회/재고/이미지/배치도. 실제 javac/java, DB 없음 |
| 새 개최 상태 Java 규칙 | **25개 조건 통과** | 출처·날짜·문구 필요, legacy/null 기본값, 상태 변경에도 identity 유지 |
| 대표 배너 서비스 | **20개 조건 통과** | 실제 서비스+가짜 JDBC, 실제 SQL/DB 잠금 아님 |
| 번호 생성 표본 | **10,000개 검사 통과** | 표본 중복·길이, 충돌 가능성이 0임을 증명하지 않음 |
| 전체 구문 | **TS/TSX59개, Java89개 파일 통과** | 파서 수준, 실제 외부 프레임워크 호환성 보증 아님 |
| 로컬 타입 계약 | **통과** | React/Router/Spring/JDBC/Jackson은 명시적인 테스트 STUB. 실제 타입/런타임 의존성 아님 |
| Chromium 가상 화면 | **105개 조건 통과** | 소스 JSX/CSS 기반 static DOM,1440/390/320폭, 모달/이름/넘침/위계/범례·방문일/홀 선택과 요약 일치. 실제 React 앱 E2E 아님 |

실행 로그는 `verification/v9/results/`에 있습니다. `regression.log`와 `regression-final.log`는 전체 실행기가 환경 제한시간에서 중단된 시도의 로그이며 완주한 결과로 주장하지 않습니다. 완료된 검사는 보존했고 남은 Java/SVG/배너/새 UX 검사를 별도 실행했습니다. `python-final.log`, `java-regression.log`, `floorplan-regression.log`, `ux-final.log`, `banner-*.log`, `catalog-types-final.log`, `browser.json`은 각 완료 단계의 결과입니다.

기존 소스 테스트는 검토-only 저장·품절 경고·출처 격리 등 원래 검증 의도를 유지했습니다. JSX 컴포넌트 분리, 새 문구, context/router hook 사용에 대응하는 테스트 지원 코드만 함께 갱신했습니다. 실제 React가 없는 것을 하네스로 감추지 않습니다.

## 화면 관측

가상 행사에서 모바일 방문 조건 영역과 첫 상품명이 첫 화면 안에 들어오는지 확인했습니다. 지도는 도면 비율을 사용해 기존 큰 세로 빈 공간을 줄였으며 288영역 가상 도면에서 매핑6개/미확인282개 구분을 검사했습니다. 이 수치와 스크린샷은 실서비스·실사용자·실제 행사 규모의 측정값이 아닙니다.

## 실제 시도했으나 완료하지 못함

- `npm run build --prefix frontend`: `vite/client` 및 `node` 타입 의존성 미설치로 실패. `frontend-build.log`.
- `sh gradlew test --no-daemon`: Gradle 배포 다운로드의 `UnknownHostException: services.gradle.org`로 실패. `backend-build.log`.
- 결과적으로 전체 React19/Router8/TypeScript6/Vite8 및 Spring4.1 실제 빌드·실제 타입 호환성을 확인하지 못했습니다.

## 실행하지 않은 검증

실제 PostgreSQL/JDBC/RLS/트랜잭션·DTO 역직렬화/API, 카카오 로그인·세션·CSRF, Codex live 검색·이미지 인식·출력 품질, R2 저장·권한 철회, 실제 React DOM/라우터의 브라우저 back·공유·unsaved blocker, 실물 iOS/Android 핀치·드래그·전체화면·스크린리더, Windows/Linux 스케줄 정시 실행.

새 사용자 과업 UX는 자동화 코드에 포함했지만 위 스테이징 통합 확인 전 운영 배포 승인본은 아닙니다.

## 재실행

```powershell
# 전체 독립 검증 (실행 환경의 제한시간에 따라 여러 단계로 나눌 수 있음)
python verification/run_checks.py
# 새 UX/상태 검사만
python verification/v9/run_checks.py
# 기존 순수 Java 묶음만
python verification/v9/java_regression.py
# 소스 기반 가상 브라우저 화면
node verification/v9/render_preview.cjs
python verification/v9/browser_preview.py
```

Node/TypeScript 모듈,Java21,Python 의존성/Playwright·Chromium이 필요합니다. 사용하는 TypeScript 검사기는 설치된 모듈을 탐색하며 프로젝트 지정 TS6 전체 빌드를 대체하지 않습니다. 실제 사용한 환경은 Node22.16/OpenJDK21/Python3.13/검증용TypeScript5.8.3입니다.

## 전체 소스 패키지 검사

최종 ZIP은 **437개 파일**입니다. v8 원본375개 중 누락0개이며, 기존 SQL001~009·배치 스케줄과 주요 실행기·예약/POS 도메인·원본 브랜드/상품 자산·Gradle wrapper의 동일성을 대조했습니다. 추가 SQL은 없습니다. 실제 비밀 설정·인증 파일·의존성 캐시·폰트 바이너리는 패키지에서 제외합니다. ZIP CRC와 SHA256SUMS의 각 파일 내용을 작성 후 다시 검사합니다. 이 무결성 검사는 전체 서비스 실행 성공과 다릅니다. 자세한 비교는 `verification/v9/results/package-report.json`에 있습니다.
