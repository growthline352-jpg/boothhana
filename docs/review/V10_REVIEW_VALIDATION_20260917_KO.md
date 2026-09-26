# v10 코드리뷰 — 이번 실행 검증 결과

2026-09-17 · 기준 ZIP `BoothHana2-full-v10-20260917.zip`. 이 문서는 원래 v10 제작 시 결과를 복사한 것이 아니라 이번 코드리뷰 작업에서 실제 다시 실행한 결과다.

## 1. 원본과 작업 범위

- 기준 ZIP SHA-256: `bcdfb7337f25f09cd626d1ef4319d1814a43d649a6c9356fd0fd59cb5cdee3de`.
- 원본 파일: **514개**.
- ZIP을 검사/해제해 실제 소스를 읽었다. GitHub 최신 main을 임의로 가져와 바꾸지 않았다.
- 검사 프로그램은 작업 사본의 가상 데이터·mock·pure rules를 실행했다. 최종 패키지는 **원래 ZIP의 각 파일 bytes**에 새 검토 자료만 추가하는 방식으로 만들어, 테스트 중 작업 사본에서 바뀐 로그·캐시·빌드 임시파일이 원본으로 섞이지 않게 했다.
- GitHub·실제 DB·Kakao·R2·Codex 로그인·작업 스케줄러는 변경하지 않았다.

## 2. 실제 다시 실행한 검사

| 실행 | 결과 | 범위 |
|---|---|---|
| `python verification/run_checks.py` | **종료코드0** | 기존 독립 검사 실행기 완주 |
| 위 실행기의 Python 수집기 | **170개 통과** | 가짜 CLI/로컬 모의 HTTP·테스트 데이터 |
| API/조회/업로드 모의 검사 | **27개 통과** | mock fetch/hook |
| v5~v9 화면/방문 검사 | **254개 검증 조건 통과** | 실제 소스 함수·JSX·명시적 hook/포인터 하네스 |
| Java 순수 규칙 | **389개 검증 조건 통과** | 실제 javac/java, DB 없음 |
| 대표 배너 서비스 | **20개 검증 조건 통과** | 실제 서비스 + 가짜 JDBC |
| 기록번호 생성 | **10,000개 표본 확인** | 표본 중복/형식, 충돌 불가능 증명 아님 |
| 전체 구문 검사 | **TS/TSX59개·Java89개** | 구문 및 외부 stub 계약, 실제 프로젝트 의존성 빌드 아님 |
| `python verification/v10/run_checks.py` | **종료코드0,62개 디자인/소스/선택 대비 조건** | 해당 모듈의 명시적 하네스; 새 실브라우저 측정은 아님 |

새 로그: [독립 회귀](../../verification/review_v10_20260917/results/offline-current.log), [v10 디자인 검사](../../verification/review_v10_20260917/results/v10-design.log).

## 3. 이번에 추가한 문제 재현

### 공개 상태 소실

실제 `CatalogPublicationService.java`에서 행사 복사 생성자 식을 추출했다. 실제 `CollectionModels.java`와 함께 javac21로 컴파일/실행한 결과 CANCELED·POSTPONED·RESCHEDULED·SCHEDULED가 모두 UNKNOWN이 되고 note/sourceUrl/checkedOn이 null이 되는 것을 확인했다.

실제 TS `eventStatus()`를 호출하면 미래 날짜에서 취소·연기·변경의 명시 표시가 ‘개최 예정’으로 바뀌었다. Java DTO 생성과 프런트 표시를 각각 실행했으며 HTTP/Jackson/DB 저장 전체 연결 시험은 아니다.

[Java 결과](../../verification/review_v10_20260917/results/reproductions/publish-status.log) · [추출한 실행 코드](../../verification/review_v10_20260917/results/reproductions/PublishStatusReproduction.java).

### 전체화면의 선택 부스 행동

실제 MapView와 PlanCanvas의 JSX/전체화면 핸들러를 호출했다. `상품 보기`는 MapView 형제 요소에 있지만 PlanCanvas의 dialog 내부에는 선택 부스명·상품 행동이 없었다. 실제 네이티브 모달/React effect/모바일 제스처를 새로 실행한 검사는 아니다.

[UI 재현 결과](../../verification/review_v10_20260917/results/reproductions/ui-reproductions.log).

### 소스 메타데이터 감사

SQL001~009 선언의 애플리케이션 테이블32개, 최초11개 업무 테이블의 명시적 RLS 활성화 미포함, 예상치 못한 오류 처리기의 원인 로그 누락, Render healthCheckPath를 기록했다. 실제 DB·노출 권한·서버 실행의 증거는 아니다.

[소스 감사 JSON](../../verification/review_v10_20260917/results/reproductions/source-audit.json).

**재현 스크립트가 종료코드0인 것은 검토에서 발견한 조건을 재현했다는 뜻이다. 결함을 고쳤거나 서비스가 배포 준비됐다는 뜻이 아니다.**

## 4. 이번에 실제 시도한 전체 빌드

| 명령 | 결과 |
|---|---|
| frontend에서 `npm run build` | **EXIT1**. `vite/client`, `node` 타입 의존성 미설치로 TS2688. Vite 제품 빌드 완료 아님 |
| backend에서 `sh gradlew test --no-daemon` | **EXIT1**. Gradle9.5.1 배포 다운로드의 `UnknownHostException: services.gradle.org`. 실제 백엔드 컴파일/JUnit 진입 못함 |

[프런트 빌드 로그](../../verification/review_v10_20260917/results/frontend-build.log) · [백엔드 빌드 로그](../../verification/review_v10_20260917/results/backend-build.log).

의존성 설치 환경이 없어 발생한 실패를 ‘소스가 반드시 빌드 불가능하다’는 확정 오류로 세지 않았다. 반대로 부분 구문/테스트 stub 통과로 전체 빌드 성공을 주장하지도 않는다.

## 5. 실행하지 않은 것

- 실제 프로젝트 버전의 React19/Router8/TS6/Vite8, Spring4.1 외부 의존성 설치·전체 빌드·전체 JUnit.
- PostgreSQL001~009 적용/잠금/롤백/RLS/grants/실제 공개 JSON. 이번 첨부 읽기 전용 점검 SQL도 실제 PostgreSQL에서 실행하지 않았다.
- 실제 Kakao 로그인·관리자 권한·쿠키·CSRF/CORS·세션.
- 실제 Codex 웹 조사/이미지 인식·검색 품질·사용량.
- R2 PUT/HEAD/공개 URL·캐시·권한 철회·외부 이미지 다운로드.
- 이번 리뷰의 실제 React DOM·실물 휴대전화·새 화면 캡처·접근성 트리 검사. 원래 v10의 정적 브라우저320개 결과는 과거 기록으로 보존했으며 이번 재실행 수치에 넣지 않았다.
- Windows 작업 스케줄러/Linux systemd 설치와 정시 실행.

## 6. 재현 재실행

소스 루트에서 Java21+, Node, 소스 하네스가 사용하는 TypeScript 모듈이 있어야 한다. 네트워크/DB 접속 없이 실행한다.

```powershell
python verification/review_v10_20260917/reproduce_review.py --source . --output review-local-results
```

이 명령은 임시 디렉터리에 Java를 컴파일하고 `--output`에 로그를 쓴다. 애플리케이션 파일·실제 DB를 수정하지 않는다. 수정 후에는 ‘문제가 없어야 한다’는 방향의 정식 회귀 테스트로 전환해야 하며, 현재 재현 스크립트를 제품 성공 테스트로 사용할 수 없다.

## 7. 최종 ZIP 무결성

`REVIEW_PACKAGE_REPORT.json`에 원본·추가 파일 수, 원본 파일 바이트 변경/누락 수, 원본 압축파일 SHA-256을 기록한다. `REVIEW_SHA256SUMS.txt`는 문서 추가본의 전체 파일을 검사하는 목록이며 자기 자신은 제외한다. 원래 `SHA256SUMS.txt`도 변경하지 않았다.

**원본514개 파일은 변경/누락0개인 상태로 보존한다.** 따라서 R10-01 등 발견 사항도 코드에는 아직 남아 있다. 이 패키지의 의미는 ‘검토·실사용 준비 자료를 함께 가진 v10 전체본’이다.
