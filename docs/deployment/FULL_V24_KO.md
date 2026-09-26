> **문서 보완 — Google Cloud 크레딧 사용 방침**  
> [GCP_FREE_TRIAL_KO.md](GCP_FREE_TRIAL_KO.md)에 신규 가입 크레딧과 GCS 이미지 저장 방향을 기록했습니다. 아래는 현재 R2 기반 v24 코드의 기존 적용 절차이며, GCS 전환 완료 안내가 아닙니다. GCS 코드·공개 URL·권한·오프라인 연결 검증 전에는 R2 설정에 Google 값을 대입하지 마세요. 기존 DB와 저장 자료를 초기화하지 않습니다.  
> 현재 문서 ZIP 무결성 검사: `python verification/v24/verify_package.py BoothHana2-full-v24-gcp-credit-notes-20260921.zip`

# v24 적용·실환경 수락 절차

2026-09-21 · 운영 배포 승인 false · 원본 v23에서 API/스키마/해시 계약을 보완한 버전입니다.

## 적용

1. 현재 소스·DB·배포 설정을 백업합니다. SQL001~016은 유지하며 새 SQL017은 없습니다. v17 이하에서 건너뛰어 갱신할 때는 이전 SQL016 적용 여부를 별도로 확인합니다. 운영 DB에 테스트 준비 스크립트를 실행하지 않습니다.
2. `VITE_API_BASE_URL`에는 `https://api.example.com` 같은 서버 원점만 입력합니다. `/api`, query, hash, credentials를 붙이지 않습니다. 앞뒤 공백·마지막 슬래시는 정리됩니다. 동일 출처 프록시라면 명시적 빈 문자열을 사용할 수 있고 오프라인에는 해당 사이트 원점이 사용됩니다. 기본 로컬 주소를 운영 주소로 오해하지 않습니다.
3. 실제 의존성 frozen install, frontend lint/build 및 backend test/bootJar를 실행합니다. 새 프런트·백엔드·수집기를 같은 v24로 반영합니다. 진행 중 수집 작업을 확인한 뒤 중복 실행 없이 버전을 교체합니다. 기존 예약 시간과 배치 예산은 바뀌지 않았습니다.
4. readiness가 NOT_READY이면 RLS/권한뿐 아니라 COLUMN_TYPE/LENGTH/NULLABILITY 오류를 확인합니다. 알 수 없는 실제 DB 차이를 무조건 ALTER하거나 기본자료를 삭제하지 말고, 배포한 SQL/스키마와 원인을 먼저 맞춥니다.
5. 배치도 전시관·구역명에 `%`, `|`나 정규화 시 해당 문자가 되는 값이 있다면 SCOPE_CHANGED 여부를 확인하고 관리자 검토 후 새 버전/재공개합니다. 일반 범위의 키는 유지합니다. 사용자/예약 데이터는 변경하지 않습니다.
6. `/offline/` 정적 파일 전체와 `boothhana-offline-shell-v24-1`을 함께 배포합니다. IDB2/사본19 유지로 기존 전체 자료를 초기화하지 않습니다. 다만 검증 해시가 없거나 현재 원본과 다른 관리 배치도 파일은 온라인 재확인에서 제외되므로 필요한 행사 배치도는 다시 내려받습니다. 이미지 서버의 임의 리사이징/재인코딩이 원본 해시를 바꾸지 않는지 확인합니다.
7. 이전 수집 result.json/audit의 해시가 없거나 입력이 바뀌면 새 조사로 전환합니다. 실제 수집 시 추가 CLI 사용량이 생길 수 있습니다. 정상 fingerprint가 없는 과거 결과를 수작업으로 승인한 것처럼 조작하지 않습니다.
8. 실제 기기·서버 수락검사 후 운영 적용 여부를 결정합니다. 이번 ZIP을 만들면서 실제 배포·계정·DB·GitHub·예약을 변경한 것은 아닙니다.

## 명령

```sh
# 현재 코드에 대한 모든 독립 회귀 + 수집기 검사
python verification/run_checks.py
# 현재 경로/DTO/DDL 자동 대조 보고서 (실연결 검사 아님)
python verification/v24/audit_contracts.py
# ZIP 단독 검증. 실제 내려받은 ZIP 파일 경로를 지정합니다.
python verification/v24/verify_package.py BoothHana2-full-v24-20260921.zip
# 전용·빈 localhost 테스트 클러스터만: 운영/공유DB 금지
python verification/v18/prepare_test_db.py --confirm-isolated-empty-test-cluster
python verification/v24/release_gate.py
```

실DB 도구가 요구하는 환경변수/서버역할/빈 클러스터 조건은 기존 `docs/deployment/FULL_V18_KO.md`를 따릅니다. DB 준비만 있다고 게이트가 성공하지 않으며 실제 빌드/브라우저/필수 JUnit XML까지 통과해야 합니다. 이미 내려받은 SHA256SUMS를 함께 수정해서 통과시키지 말고 별도 전달된 ZIP SHA도 비교합니다.

## 필수 실환경 수락검사

| 경계 | 확인할 결과 |
|---|---|
| 배치도 withdraw | 실제 Spring Security/CSRF가 적용된 요청 성공204·빈 본문, 프런트 성공 표시 |
| API 주소 | 말단슬래시/공백 정상화, 빈 원점+동일출처 프록시, 잘못된 /api·query·hash·인증정보 설정은 명확한 오류 |
| 행사/상품/부스/공지 수정 | 조회용 필드 미전송, version/productVersion 보존, 잘못된 버전409·입력검증400 정상 |
| DTO 전체 바인딩 | 정적 33개 상위필드뿐 아니라 보고서의 가변/중첩17개 요청·응답·enum·nullable·날짜 실제 HTTP 검사 |
| JSON/Java 경계 | 정상한도와 한도+1, 이모지/결합문자, 빈문자, 좌표/도형 수·FOUND 의미 정합성 |
| 수집 재시작 | 같은 입력 재사용, schema/prompt/image 변경 및 손상 result/audit은 새 조사, 기존 성공을 허위 재사용하지 않음 |
| 범위 해시 | 정상키 이전값 유지, 구분자/percent/정규화/날짜순서/asset fallback 구분, 영향받는 기존 게시 검토 |
| 실제 DB | SQL001~016·43테이블397컬럼의 type/length/nullable와 RLS·grants, CHECK/FK/인덱스·쿼리·transaction 동작 |
| 오프라인 파일 | 정상SHA 저장, 같은URL 다른바이트 거절, 해시없는 관리배치도 거절, 일반이미지 기존권리검사 |
| 기존 사본 갱신 | 전체 초기화 없음, 오래된 관리배치도만 온라인 재확인에서 제외, 새다운로드 전용·기존TTL 유지 |
| 실연동 | DNS/TLS/CORS/세션쿠키·카카오·R2 원본바이트·실제Codex·프록시routing·iPhone/Android·저장공간 회수 |
| 배포물 | CRC/개별SHA/정확한목록·외부ZIP해시 일치. 수신된 파일을 원본 코드로 다시검사 |

가변JSON/Map 응답의 모든 키, 쿼리파라미터 의미, JPA/SQL 바인딩, 환경별 CORS/인증·실제변환을 컴파일러 AST 검사만으로 완전 검증할 수 없습니다. 이 부분은 운영 전 실연결 테스트로 닫아야 하며 NOT_READY를 임의로 PASS로 수정해서는 안 됩니다.
