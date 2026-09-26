# 부스하나 v24 · API·스키마·계약·해시 코드리뷰 및 수정

2026-09-21 · 입력 `BoothHana2-full-v23-20260918.zip` · **운영 배포 승인: false**

## 결론과 검증 경계

v23의 기존 독립 검사가 이번에도 통과했지만, 교차 계층 계약을 추가 검사하자 실제 코드 경로의 불일치가 발견되었습니다. 아래 수정과 재현 테스트를 반영했습니다. **테스트 통과가 오류 0개, 실제 API 연결 성공, 실제 PostgreSQL 일치 또는 운영 배포 승인을 의미하지 않습니다.**

실제 제품 변경은 프런트 7개, 백엔드 5개, 수집기/JSON 규격 5개 파일입니다. UI 디자인·지역·분야·예약/재고 정책은 유지했습니다. SQL001~016과 의존성/잠금 파일을 변경하지 않았습니다. 프런트·백엔드·수집기는 같은 v24로 적용해야 합니다.

## R24-01 · 배치도 공개 철회의 빈 성공 응답

서버 `FloorplanAdminController.withdraw`는 `void`를 반환하지만 성공 상태 코드를 지정하지 않았습니다. 프런트 공통 API는 204가 아닌 성공 응답을 JSON으로 읽으므로, 작업이 처리돼도 빈 본문을 읽다가 `INVALID_RESPONSE`가 될 수 있었습니다.

서버 응답을 `204 No Content`로 명시하고 클라이언트 반환형을 `void`로 맞췄습니다. 서버 소스의 응답 선언과 실제 프런트 모듈을 함께 사용한 대역 HTTP 검사에서 재현·수정했습니다. 별도로 실제 Spring MVC 바인딩/응답 검사 `FloorplanHttpContractTests.withdrawalHasNoContentSuccess`를 추가했지만 정식 의존성 빌드가 불가능해 이 검사는 실행하지 못했습니다. 서비스·보안·DB까지 통과했다고 해석하지 않습니다.

파일: `backend/src/main/java/com/boothhana/floorplan/FloorplanAdminController.java`, `frontend/src/features/floorplan/api.ts`.

## R24-02 · API 서버 주소의 연결 계약

`VITE_API_BASE_URL` 뒤에 `/`가 있으면 기존 단순 문자열 연결은 `//api/...`를 만들 수 있었습니다. 공백도 그대로 전송됐습니다. 이제 HTTP(S) 원점을 파싱하여 공백·말단 슬래시를 정리합니다. 경로(`/api` 등), 쿼리, fragment(`#...`), 사용자/비밀번호가 포함된 값은 실제 요청 전에 명시적인 설정 오류로 거절합니다. 올바른 값은 `https://api.example.com` 형태이며 `/api`는 각 호출 경로가 이미 갖고 있습니다.

명시적인 빈 문자열은 기존처럼 동일 출처 API 연결을 지원합니다. 이때 오프라인 다운로드에는 상대주소 대신 `window.location.origin`을 전달하여 두 경로의 기준을 맞췄습니다. 환경변수 미설정의 기존 로컬 기본값은 유지합니다. 실제 DNS·프록시·TLS·CORS·쿠키를 검증한 결과는 아닙니다.

파일: `frontend/src/api/client.ts`, `frontend/src/features/offline/OfflineDownloadPanel.tsx`.

## R24-03 · 조회 객체를 쓰기 DTO로 그대로 보내는 문제

행사·부스·상품·공지 등의 수정에서 조회 객체에 포함된 ID, 이미지 URL, 표시/집계용 필드까지 서버 쓰기 DTO로 직렬화하는 경로를 정리했습니다. 서버 입력 record에 정의된 필드만 보내는 투영 함수를 추가했습니다. 행사별 부스 정보와 예약/POS의 중첩 품목도 허용된 필드만 보냅니다. 상품 수정의 `version`, `productVersion`, 거래의 `requestId`는 보존합니다.

이는 실제 서버가 과거 모든 요청을 거절했다는 주장이 아닙니다. 알 수 없는 필드를 무시하는 서버 설정에 우연히 의존하지 않도록 계약을 맞춘 것입니다. 실제 프런트 래퍼의 직렬화 결과를 검사했습니다.

또한 배치도 작업목록의 요약 객체와 상세 객체를 `PlanVersionSummary` / `PlanVersion`으로 구분했습니다. 목록 응답에 없는 geometry/image 필드가 항상 있다고 타입으로 보장하지 않습니다. 공개 배치도의 기존 서버 `sourceSha256` 필드도 프런트 계약에 반영했습니다.

파일: `frontend/src/api/index.ts`, `frontend/src/features/floorplan/api.ts`.

## R24-04 · 수집 JSON 규격과 Java 서버 제한 불일치

배치도 좌표/라벨/경고, 발견한 배치도 목록의 수량·문자열·날짜 제한을 서버 규칙과 맞췄습니다. 레이아웃 좌표는 0~1, 다각형 점은 3~16개, 라벨은 최대80, 도형은 최대3,000개, 경고는 최대200개/각1,000자로 제한합니다. 발견 결과의 plans20개, checkedUrls30개, warnings50개와 날짜 형식·FOUND/목록의 일치도 검사합니다. 상세 한도는 두 JSON Schema가 기준입니다.

JSON Schema의 문자열 길이와 Java UTF-16 길이가 다른 문자를 고려하여 **서버의 UTF-16 단위 제한을 함께 검사**합니다. 공백뿐인 필수 문구도 거절합니다. 타일 병합을 직접 호출할 때도 잘못된 긴 라벨을 서버에 보내지 않고 해당 도형을 제외하며 `complete=false`와 경고를 남깁니다. 사용 권리나 공개 승인을 자동 부여하지 않습니다.

파일: `collector/schemas/floorplan-layout.schema.json`, `floorplan-discovery.schema.json`, `collector/floorplan_contract.py`, `floorplan_geometry.py`.

## R24-05 · 재사용 결과 파일의 입력·내용 해시 미검증

기존 배치도 `job()`은 `result.json`이 있으면 JSON을 읽고 바로 재사용했습니다. 깨진 JSON은 재시작을 중단시켰고, 현재 프롬프트/규격/이미지와 다른 결과나 수정된 파일을 검증하지 않았습니다.

이제 fresh/resume 모두 동일한 schema/문자열 검사 후 사용합니다. audit에 현재 프롬프트·schema SHA-256·입력 이미지 바이트 해시로 만든 `inputSha256`과 결과 JSON의 `resultSha256`을 기록합니다. 둘 다 일치하고 요구된 웹검색 증거가 있을 때만 재사용합니다. 불일치·깨진 파일·과거 audit은 새 조사로 전환합니다. 성공한 새 결과 전에는 이전 결과를 성공으로 재사용하지 않습니다. 새 결과와 audit 기록 도중 중단돼도 다음 시도의 해시 검사로 불일치가 드러납니다.

**이전 캐시를 다시 조사할 때 CLI 사용량이 추가될 수 있습니다.** 실제 CLI나 운영 수집을 이번에 실행한 것은 아닙니다. 해시는 우발적 변경·오래된 입력을 검출하는 용도이며 로컬 공격자가 audit과 result를 함께 바꾸는 경우의 전자서명/진위 인증을 대신하지 않습니다.

파일: `collector/floorplans.py`, `collector/floorplan_contract.py`.

## R24-06 · 해시 입력 구분자 충돌

SHA-256 자체의 충돌을 발견한 것이 아닙니다. 해시 전에 `전시관|구역|날짜`로 문자열을 합쳤기 때문에 `전시관=A|B, 구역=C`와 `전시관=A, 구역=B|C`가 같은 입력이 되는 문제입니다. 정규화 후 각 문자열의 `%`, `|`를 명시적으로 이스케이프하여 필드 경계를 분리했습니다. 날짜 정렬과 빈 범위의 asset ID 구분은 유지합니다.

예약어나 구분자가 없는 기존 범위는 이전 해시와 일치함을 검사했습니다. **기존 이름에 `%`, `|` 또는 정규화하면 같은 문자가 되는 값이 있다면 범위 키가 바뀝니다.** 기존 공개 버전이 `SCOPE_CHANGED`가 될 수 있으므로 관리자가 해당 배치도를 확인하고 새 버전 생성/재공개해야 합니다. DB를 일괄 재작성하거나 이전 다른 범위로 자동 연결하지 않습니다.

파일: `backend/src/main/java/com/boothhana/floorplan/FloorplanRules.java`, `FloorplanService.java`.

## R24-07 · 오프라인 배치도 URL과 실제 파일 바이트 검증

공개 관리 배치도의 `sourceSha256`와 실제 다운로드 Blob의 SHA-256을 비교합니다. URL이 같다는 이유만으로 다른 바이트를 저장하지 않습니다. 기대 해시가 없거나 불일치하면 해당 이미지는 저장하지 않고 부분 저장으로 안내합니다. 공개 텍스트·다른 정상 자료는 보존합니다.

재확인 때에도 이미 보관한 관리 배치도의 검증 해시가 현재 공개값과 일치할 때만 유지합니다. URL이 같고 내용이 바뀐 배치도는 제거 후 재다운로드가 필요합니다. 재확인만으로 새 이미지를 몰래 내려받거나 원래 만료일을 연장하지 않습니다. 원본 해시 계약이 없는 일반 승인 이미지는 해시를 검증했다고 주장하지 않으며 기존 MIME·크기·사용권리 검사를 유지합니다.

**IDB2/사본형식19는 유지하지만 shell은 `boothhana-offline-shell-v24-1`로 갱신합니다.** 기존 전체 사본을 일괄 초기화하지 않습니다. 과거에 검증 해시 없이 보관된 관리 배치도만 온라인 재확인에서 빠질 수 있어 필요한 행사 배치도는 다시 내려받아야 합니다. 오프라인 중 즉시 업데이트·철회 확인을 보장하지 않습니다.

파일: `frontend/public/offline/policy.mjs`, `store.mjs`, `sw.js`.

## R24-08 · DB 준비 검사에서 자료형·길이·NULL 허용까지 확인

기존 준비 검사는 테이블/컬럼 존재와 권한/RLS를 확인하지만 이름이 같은 컬럼의 잘못된 자료형·해시 길이·NULL 허용 변경은 탐지하지 못할 수 있었습니다. SQL001~016에서 추출한 **43테이블·397컬럼**에 대해 예상 PostgreSQL 자료형·문자 길이·NULL 허용 계약을 추가했습니다. 실제 readiness 실행 시 information_schema 결과와 비교합니다.

`COLUMN_TYPE_MISMATCH`, `COLUMN_LENGTH_MISMATCH`, `COLUMN_NULLABILITY_MISMATCH`, `COLUMN_METADATA_MISSING`을 구분합니다. 기존 RLS·서버 권한·Data API 차단 검사를 유지합니다. 잘못된 DB를 자동으로 고치거나 접근 권한을 확대하지 않습니다. **실제 운영 DB의 스키마 오류가 관측됐다는 뜻은 아니며 예방 검사 보강**입니다.

실제 서비스 코드에 올바른/틀린 메타데이터 대역을 연결한 검사는 통과했습니다. 실제 PostgreSQL용 `v24TypedColumnContractMatchesRealPostgres`도 추가했지만 이번에는 DB가 없어 미실행입니다.

파일: `backend/src/main/java/com/boothhana/health/SchemaContract.java`, `ReadinessService.java`.

## R24-09 · 다음 변경에서 빠지는 계약을 드러내는 검사

- Java 컴파일러 AST로 서버 매핑151개와 record136개, TypeScript AST로 프런트 호출117곳을 수집합니다. 조건 분기를 포함한 컨트롤러 경로121개와 별도 Security logout 매핑을 대조했습니다. **이 범위에서 미연결 경로를 발견하지 않았습니다.**
- 정적으로 드러나는 쓰기 DTO 필드33건을 검사했습니다. 가변·중첩 입력17개 경계와 공통 forwarding2개는 별도로 기록합니다. 이 17개를 실제 Spring 바인딩 완료로 바꾸어 표시하지 않습니다. 경로/상위 필드의 일치가 응답 전체, 쿼리 의미, 인증, 직렬화까지 전부 맞는다는 보장은 아닙니다.
- SQL16개와 자료형 명세를 비교합니다. 추출기가 지원하지 않는 향후 ALTER TYPE/NULL/RENAME 또는 복합 ADD는 조용히 넘기지 않고 검사를 실패시킵니다. CHECK·FK·index·RLS·실데이터·실제 SQL 실행 검증은 기존 실DB 게이트가 별도로 맡습니다.
- 릴리스 게이트는 기존 격리 DB/실빌드/브라우저 검사에 더해 새 Spring HTTP·DB 검사 XML이 이번 시도에서 생성되어 누락/실패/skip되지 않았는지 요구합니다. 과거 PASS를 이번 완료로 재사용하지 않습니다.
- `verify_package.py`는 ZIP CRC, 개별 SHA-256, 정확한 목록 포함, 중복 파일·누락·미등록 파일·경로 탈출을 검사합니다. ZIP 외부 해시 비교도 선택할 수 있습니다. 무결성과 출처 진위 인증은 다릅니다.

검사 도구·CI 연결만 수정했으며 GitHub push/실행/배포를 하지 않았습니다.

## 이번 실행 결과

| 검사 | 수정본 v24 | 원본 v23에 같은 신규 제품 검사 실행 |
|---|---|---|
| API 주소/응답·쓰기 DTO·오프라인 해시 | Node20개 통과 | 4통과·16실패 |
| JSON Schema/UTF-16/타일·캐시 재시작 | Python24개 통과 | 3통과·20assertion실패·1JSON파싱오류 |
| 범위 키·실제 준비 서비스의 타입 계약 | Java10개 통과 | 5통과·5실패 |
| 합계: 신규 제품 시나리오 | **54개 통과** | **12통과·42비통과** |
| 검증 도구 자체 | 게이트3·패키지8·스키마추출4 통과 | 제품 시나리오와 합산하지 않음 |
| 기존 인증·문의·보관함·오프라인·지역/분류 | 기존 독립 회귀 통과 | 원본 v23 기존 검사도 통과 |
| 수집기 전체 | 기존170개 통과 | 가상 CLI/API·로컬 자료 |
| 최종 통합 실행기 | `verification/run_checks.py` exit0 | 실제 의존성 빌드와 별개 |

54개에는 신규 계약/방어 조건과 동일 원인의 여러 경계가 포함됩니다. **42비통과는 독립적인 운영 버그42개나 사용자 피해42건이 아닙니다.** 실제품 모듈을 실행하지만 네트워크·JDBC·IDB·일부 프레임워크에는 명시적인 대역을 사용합니다. 최종 검사 결과는 `verification/v24/results/final-checks.log` 및 `final-checks-exit.json`, 비교는 `comparison.json`입니다.

## 실제로 시도했으나 완료하지 못한 검증

| 검사 | 이번 결과 |
|---|---|
| frozen 프로젝트 설치 | registry.npmjs.org DNS EAI_AGAIN, 패키지 관리자 다운로드 단계 실패 |
| 프런트 `tsc -b` | 미설치 vite/client·node 타입 TS2688, Vite build 미도달 |
| 백엔드 `gradlew test bootJar` | services.gradle.org DNS UnknownHostException, Spring/JUnit 미도달 |
| 실제 Chromium 오프라인 리더 | localhost 접근 ERR_BLOCKED_BY_ADMINISTRATOR, 완료 시나리오0개; 정책 우회 없음 |
| 실제 SQL001~016/릴리스 게이트 | 격리 테스트 DB 준비 미완료로 NOT_READY/exit2 |
| 신규 실제 Spring MVC/typed PostgreSQL | 코드 추가, 실제 실행 미완료 |
| 실제 모바일·배포·TLS/CORS·OAuth·R2·Codex·부하 | 미실행 |

의존성 다운로드 실패는 제품 컴파일 오류의 증거가 아니지만, 독립 검사 통과도 실제 빌드 성공의 증거가 아닙니다. **API·DB 실연결 검증을 마치기 전 ‘놓친 계약 오류가 없다’고 확정할 수 없습니다.** 남은 검사는 말로 완료 처리하지 않고 게이트의 NOT_READY와 현재 로그에 남겼습니다.

## 유지/변경 영향

서울특별시·경기도, 인천 제외, 세 분야15분류, SQL001~016, 의존성/잠금 파일, 예약·POS 재고/중복 방지 정책, 보관함 메모·방문기록, 오프라인7일·5행사·60MiB와 별도 이미지 권리를 유지합니다. 운영DB·키·계정·실행 예약·외부 행사 데이터는 변경하지 않았습니다.

**이전 안내와 다른 점**: v24는 프런트만 바꾸는 버전이 아닙니다. 서버의204/범위키/준비검사와 수집기의 규격/캐시 검사까지 함께 적용해야 합니다. API 원점 설정, 특수문자 범위의 재공개, 검증 해시 없는 관리 배치도의 선택적 재다운로드를 확인하세요. 추가 SQL017이나 전체 개인자료 초기화는 없습니다.

## 참고한 원칙

2026-09-21 확인. 아래는 구현 원칙의 출처이지 이 서비스의 실행 증거가 아닙니다.
- HTTP204 빈 성공 응답: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/204
- Java String/UTF-16: https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
- PostgreSQL 컬럼 메타데이터: https://www.postgresql.org/docs/16/infoschema-columns.html

## R24-10 · 과거 해시 목록과 현재 릴리스 혼동 방지

최상위 README.md는 v23, PRODUCTION_REVIEW_START_KO.md는 v17을 현재처럼 안내했고 REVIEW_PACKAGE_REPORT.json과 두 REVIEW 계열 SHA 목록은 과거 패키지 기준이었습니다. 현재 진입점을 v24로 통일하고 과거 해시/보고서를 `docs/history/legacy-package-manifests/`로 원문 이동했습니다. **과거 해시 값을 현재 바이트에 맞춰 조작하지 않았습니다.** 현재 기준은 최상위 SHA256SUMS.txt와 별도 전달한 ZIP SHA-256입니다. 이는 ZIP이 손상됐다는 발견이 아니라 서로 다른 버전의 검증 자료를 혼용하지 않도록 정리한 것입니다.
