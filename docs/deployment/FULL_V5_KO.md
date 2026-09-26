# 부스하나 전체 소스 v5 · 적용 안내

## 이 ZIP 자체가 전체 소스입니다

첨부 원본에 v1~v4 기능과 v4 리뷰 CR-01~08 수정까지 통합했습니다. 패치나 전체본 생성기가 아니며 `apply_updates.py`를 추가 실행하지 않습니다.
기존 소스를 먼저 커밋/백업하고 새 브랜치에서 `BoothHana2` 내부 내용을 저장소 루트에 반영하세요. `.git`, 실제 `.env`, 수집기 `config.local.json`, Codex 인증은 유지하되 Git에 업로드하지 않습니다. 첨부 원본 이후 별도 수정한 부분은 비교하여 합칩니다. 저장소 밑에 폴더를 이중으로 만들지 마세요.

## 적용 순서

1. 일요일 수집 작업이 실행 중이지 않은지 확인하고 업데이트 동안 스케줄러를 중지합니다. 기존 배치는 정상 종료시킨 뒤 진행합니다.
2. 코드와 DB를 백업합니다. **스테이징에서 먼저** 아직 미적용한 SQL을 번호순으로 적용합니다.
   - v4의 006까지 적용: **`database/007_catalog_review_fixes.sql`만**.
   - v3의 005까지 적용: **006 → 007**.
   - 원본 001·002까지만 적용: **003 → 004 → 005 → 006 → 007**.
   - 신규 DB: **001부터 007까지**. `database/dev`는 운영에 자동 실행하지 않습니다.
3. 백엔드·프런트·수집기를 함께 교체합니다. 내부 API 경로 `/api/internal/subculture/v4`는 유지되지만 새 명단 커서 API와 v5 단계 데이터 규격이 있으므로 구버전 수집기를 섞지 않습니다.
4. 프로젝트 의존성 설치, 전체 빌드, 스테이징 DB/API 검증을 실행합니다. 이 작성 환경에서는 전체 빌드와 실서비스 연동을 완료하지 못했습니다.
5. 관리자에서 기존 자동 고정값을 확인합니다. v4에서 단순 검토 때문에 고정된 필드는 **‘최신 수집값 사용’**으로 해제할 수 있습니다. 의도적인 수정일 수 있으므로 자동으로 전부 지우지 않습니다.
6. 가상 dry-run → 실제 CLI dry-run → 스테이징 저장 순서로 확인합니다. 성공 후 기존 **일요일 03:00 Asia/Seoul** 스케줄러를 다시 활성화합니다. 실제 예약 등록은 사용자 환경에서 수행합니다.

## 실행

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

```powershell
cd collector
# Python 3.11+ / 가상환경 / requirements.txt / Codex 인증 / config.local.json 준비
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10 --dry-run --fixtures examples/v5
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10 --dry-run
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10
```

실제 CLI dry-run은 검색 사용량이 발생하며 DB에만 저장하지 않습니다. fixture는 가상 데이터이고 실제 DB 저장을 금지합니다.
Codex CLI LLM이 인터넷 조사·해석을 수행합니다. Python은 단계·예산·결과 검증·API 전송을 담당합니다. DB/R2 비밀 키를 검색 프로세스에 전달하지 않습니다.

## 보존되는 것과 자동 처리하지 않는 것

- 기존 예약·재고·POS 정책, 읽기 전용 `/discover`, 관리자 `/admin/subculture`, 일요일 스케줄은 유지됩니다.
- 새 배치는 검토 중인 데이터만 갱신합니다. 공개본은 관리자 승인이 필요합니다.
- 부분 수집은 기존 상품을 삭제하지 않습니다. 확인되지 않은 기존 상품은 재확인 미완료로 표시합니다. 명시적 취소 근거는 별도 상태로 보관합니다.
- 과거 중복 후보·수동 수정값·이미지 연결을 자동 병합/삭제하지 않습니다. 식별 근거가 다수 기존 ID와 겹치면 검토 필요로 남깁니다.
- 배너 파일 다운로드에는 기존과 동일하게 사용 승인 + `imageAllowedHosts` 설정이 필요합니다.
- v4 체크포인트는 보관하고 **새 v5 배치로 시작**합니다. v5끼리만 `--resume`을 사용합니다. 기존 수집 데이터는 DB에서 재사용합니다.

상세: `docs/deployment/FULL_V5_KO.md`, `collector/README_KO.md`, `docs/catalog/REVIEW_FIXES_V5_KO.md`, `TEST_RESULTS_KO.md`.
GitHub push·실제 DB 적용·배포·사용자 PC의 예약 등록은 이 패키지 생성 과정에서 수행하지 않았습니다.


## 필수 스테이징 수락 테스트

- 검토만 완료 → overrides가 비어 있음 → 다음 배치에서 부스번호 변경 시 새 값 표시.
- 실제 한 필드 수정 → 그 필드만 유지 → 필드 해제 시 최신 원문/누적값 복원.
- 명단 25페이지/호출당 10페이지 → 첫 실행 1~10, 다음 11~20, 그다음 21~25. 동일 배치 --resume과 응답유실 재전송도 확인.
- 참가 부스 200개, 앞 100개 미발견 → 다음 대상에 뒤 100개가 배정됨. 실패 cooldown이 다른 대상 진행을 막지 않음.
- 출처 순서·추가가 달라도 같은 참가자/상품 ID 및 이미지 연결 유지. 서로 다른 명시 등록 ID는 별도 유지.
- 상품 20개→부분 2개 → 누적 20개, 나머지 18개 재확인 미완료. 검토/공개 후도 20개 및 재확인 표기 유지.
- 서버 PARTIAL/REJECTED_ALL/NO_RESULTS와 실제 수신 건수, CLI 실패 횟수 기록.
- CLI 한도만 소진→이미지 실행; 전체 시간 소진→이미지 대기. 품절·취소·상품 주의사항 공개 카드 확인.
- 기존 카카오·세션·CSRF, 예약/POS 재고, R2 권한 회귀 확인.

## 선택 PostgreSQL 테스트 (이번 작성 환경에서는 미실행)

`CatalogPostgresTests` 19개를 작성했습니다. 이 테스트는 **전용 로컬 `boothhana_catalog_test` DB의 public schema를 삭제**하므로 실제 데이터가 있는 DB에서 실행하면 안 됩니다. 호스트·DB 이름을 코드로 제한합니다. SQL 005·006·007을 적용하며 실제 스테이징 데이터용 명령이 아닙니다.

```powershell
# backend 폴더 / 별도로 만든 빈 로컬 테스트 DB에서만
$env:BOOTH_CATALOG_TEST_URL = 'jdbc:postgresql://localhost:5432/boothhana_catalog_test'
$env:BOOTH_CATALOG_TEST_USER = 'postgres'
$env:BOOTH_CATALOG_TEST_PASSWORD = '테스트_DB_비밀번호'
.\gradlew.bat test --tests '*CatalogPostgresTests'
```

## 되돌리기

수집기를 중지하고 프런트·백엔드·수집기를 같은 구버전으로 복원합니다. SQL 007은 추가 컬럼/테이블이므로 코드 롤백 때문에 즉시 삭제하지 않습니다. 수집/검토/공개 데이터는 별도로 백업해야 합니다. v4로 되돌아가면 이 리뷰의 8가지 동작 문제가 다시 존재합니다. v5 디스크 체크포인트는 v4에서 사용하지 않습니다.
