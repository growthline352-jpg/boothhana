# 실제 검증 결과 · 전체 소스 v5 · 2026-09-16

## 기준과 작업

기준은 직전 전체본 `BoothHana2-full-v4-20260916.zip`입니다. 기준 SHA-256은 `ecd32b413c8a898a5a24ba0339ef1811fc21f968a37d12dbc115ed130f1ffa68`입니다. 실제 전체 소스에 CR-01~CR-08을 반영했으며 패치/생성기 방식이 아닙니다. 이전 원본 자산·기존 상거래 기능·일요일 스케줄을 유지했습니다.

## 최종 소스에서 실제 실행한 검사

| 검사 | 결과 | 범위 |
|---|---|---|
| Python collector 회귀 테스트 | **129개 통과** | 기존 104 + v5 신규 25. 실제 Pipeline·검증·전송 코드, 가짜 CLI/메모리 서버/로컬 HTTP 서버. 실제 Codex·외부 웹·DB는 사용 안 함 |
| 기존 API·조회·업로드 행동 | **27개 통과** | 실제 TS 모듈 + mock fetch/hook harness |
| 새 검토 UI·상품 카드 | **34개 검증 조건 통과** | 실제 TSX 핸들러 및 JSX 출력. 실제 React DOM/브라우저 테스트 아님 |
| 순수 Java 규칙 | **243개 검증 조건 통과** | 기존155 + v5 신규88. 실제 javac21 컴파일·실행. 검토값 해제/안정식별/부분상품누적/페이지진행 포함 |
| 번호 생성 표본 | **10,000개 통과** | 표본 내 중복/형식 검사. 충돌확률 0 보장 아님 |
| TS/TSX 구문 | **38개 파일 통과** | 전체 프런트 파싱. 의존성 실제 타입검사 아님 |
| Java 구문 | **79개 파일 통과** | 실제 backend 소스·테스트 문법 파싱. Spring/JPA/AWS 의존성 해석 아님 |
| 로컬 계약 보조 타입 검사 | **통과** | TS의 새 카탈로그 계약 및 Java DTO/서비스 연결을 **명시적인 외부 API 선언/stub**과 함께 타입 검사. 실제 React·Spring·Jackson·JDBC와의 호환성을 검증한 결과 아님 |

실행 로그는 `verification/v5/results/offline-checks.log`입니다. 검증 환경은 Python3.13, Java21, Node22 및 TypeScript5.8.3입니다. 프로젝트가 선언한 TypeScript6/Vite8/Spring Boot4.1 전체 빌드를 대체하지 않습니다. `verification/v4/results`의 기록은 과거 v4 로그이며 이번 성공 결과로 간주하지 않습니다.

## 새로 검증한 반복 흐름

- 명단 25페이지를 10/10/5로 3회에 나누어 끝까지 진행.
- 같은 v5 checkpoint의 재개에서도 이전 페이지 한도를 넘어 진행.
- 페이지 저장 후 응답 유실: 같은 runId/body를 재전송한 뒤 서버 커서부터 진행. 수신 건수 중복 가산 없음.
- 검토만 저장하면 overrides={}이며, 실제 바뀐 필드만 저장. override 제거와 null 값 지정은 구분.
- 출처 순서/추가, 업체명·부스 위치 변경에도 같은 명시 식별 키. 서로 다른 명시 ID는 별개.
- 상품20→부분2의 누적 목록20 보존 규칙, 이전 상품 재확인 상태, 명시적 취소 상태 유지.
- 서버 PARTIAL/REJECTED_ALL/NO_RESULTS와 건수 구분, 전송 결과 재사용.
- CLI 한도 소진 후에도 이미지 처리, 전체 시간 소진 시 보류, 이미지 개별 실패 격리.
- 판매 중/품절/취소/미확인 및 상품 주의사항·재확인 미완료 카드 출력 구분.

## 실제 시도했지만 실패한 전체 빌드

| 명령 | 결과 |
|---|---|
| `sh gradlew test --no-daemon` | Gradle 배포파일 다운로드의 `UnknownHostException: services.gradle.org`. 실제 프로젝트 컴파일/테스트 단계에 들어가지 못함 |
| `npm run build` | 설치되지 않은 `vite/client`, `node` 타입 때문에 실패. 실제 React/TypeScript6/Vite 전체 빌드 미완료 |

로그: `gradle-attempt.log`, `frontend-build-attempt.log`. 실패 사실을 숨기거나 구문/모의 테스트 성공으로 대체하지 않았습니다.

## 아직 실행하지 못한 검증

- PostgreSQL 001~007 실제 적용, RLS/서버 JDBC 권한, 원자적 커서 이동, 잠금·롤백.
- 실제 DB용 `CatalogPostgresTests` **19개**: 기존8 + 추가11. 작성·구문 파싱했지만 Gradle/DB 실행은 미완료. 특히 CR-03의 200부스100/100 큐 배정과 CR-05의 저장→검토→공개는 실제 DB에서 검증해야 합니다.
- 실제 프레임워크 의존성을 사용하는 JUnit 전체 실행. 보조 stub 타입검사는 이 검증이 아닙니다.
- 실제 Codex 로그인·실시간 검색 품질·외부 원문 접근·R2 저장·카카오 인증·브라우저 UI.
- Windows 예약 등록·실행 및 Linux service 실제 실행. 일정 파일은 v4와 바이트 동일하게 유지했습니다.

19개 DB 테스트는 **전용 localhost `boothhana_catalog_test` DB의 public schema를 삭제**합니다. 실제 데이터가 있는 DB에서는 실행하지 마세요. 실행법은 `docs/deployment/FULL_V5_KO.md`에 있습니다.

## 재실행과 산출물 검사

루트 `python verification/run_checks.py`로 독립 검사를 실행합니다. Python requirements·Java21·Node·TypeScript가 필요하며 실제 운영 DB/외부 API를 호출하지 않습니다.
파일 비교·비밀/캐시 제외·원본 이미지/Gradle wrapper 보존·압축 검사 결과는 `verification/v5/results/package-report.json` 및 `SHA256SUMS.txt`에 기록합니다.

**전체 소스 반영과 위 독립 검사만 완료했습니다. 운영 배포 승인본이 아니며 스테이징의 전체 빌드·DB·실서비스 통합 검증이 필요합니다.** GitHub/운영 DB/예약 작업에 직접 변경하지 않았습니다.
