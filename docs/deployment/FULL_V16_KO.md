# v16 배포·검증 안내

실제 사용자 DB·GitHub·호스팅·예약 스케줄은 변경하지 않았습니다. 아래 명령은 준비된 테스트/배포 환경에서 담당자가 실행합니다.

## 일반 빌드

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

Java21, 프로젝트가 선언한 Node/React/Router/TypeScript/Vite/Gradle과 lockfile을 사용합니다. 다운로드가 안 된다고 버전을 임의로 낮추거나 모의 타입을 런타임에 복사하지 않습니다.

## 독립 검사

```powershell
# 저장소 루트. Java21/Node/TypeScript 모듈 필요. 실제 DB/React는 사용하지 않음.
python verification/v16/run_checks.py
python -m unittest discover -s collector/tests -v
```

v16 집중 검사에는 상태기계/캐시28개 Node 테스트, 실제 LibraryProvider 핸들러 대조(위28개 중6개), 서버 일괄 투영58조건과 기존67조건, 화면37조건, 기존 저장47/UI31조건, 게이트 거절9테스트가 포함됩니다. test stub 경계를 실제 서비스 통합으로 해석하지 않습니다.

## 실제 전체 스키마·Spring·HTTP 테스트

SQL001~015가 적용된 **비어 있는 독립 로컬 테스트 클러스터**를 준비합니다. 현재 DB가 빈 상태인지 검사하고 일반 API 역할과 최소권한 런타임 역할을 생성하는 도구는 스키마가 바뀌지 않아 v15 도구를 그대로 사용합니다.

```powershell
# PGHOST=localhost 또는127.0.0.1, PGPORT, PGDATABASE=boothhana_release_test,
# PGUSER와 테스트 전용 자격증명, BOOTH_FULL_TEST_PASSWORD를 먼저 준비합니다.
python verification/v15/prepare_test_db.py --confirm-isolated-empty-test-cluster

# 이어서 BOOTH_FULL_TEST_URL/USER/PASSWORD 및
# BOOTH_SUPPORT_TEST_URL/USER/PASSWORD를 테스트 전용 값으로 준비합니다.
python verification/v16/release_gate.py
```

운영 DB·Supabase URL·localhost 운영 포트포워딩은 금지합니다. 별도 support DB명은 `boothhana_support_test`입니다. 실제 비밀번호를 문서·Git·공유 로그에 넣지 않습니다. 과거 파괴적 DB 테스트 환경변수는 이 실행 세션에서 제거합니다. 설정·보고서 누락/오래된 결과/실패/skip은 NOT READY입니다.

게이트 순서: clean install → lint/build → 새TS상태/핸들러검사 → 수집기 → Gradle clean test → 필수 XML 검사 → bootJar. 요구하는 suite는 ReleaseIntegrationTests14개 이상, SupportReliabilityPostgresTests8개 이상, LibraryIntegrationTests**20개 이상(기존15+이번5)**입니다. 성공은 자동 검사 통과이며 전체 운영 승인 자체는 아닙니다.

이번 새5개는 실제 PostgreSQL 공개 JSON 확인상태 보존, 200개/201개 HTTP 경계, 입력 순서·부모·공개범위, 이미지 승인철회, 명시 배너 철회 후 옛배너 fallback 금지를 검사하도록 작성했습니다. **이 작업 환경에서는 실행하지 못했습니다.**

## CI 및 운영

`.github/workflows/release-verification.yml`은 v16 게이트를 호출합니다. 보호 브랜치 required check, 호스팅의 테스트 전 자동배포 차단, 실제 운영 승인자 설정은 GitHub/호스팅에서 별도로 확인해야 합니다. 파일만 추가했다고 설정이 활성화된 것은 아닙니다.

프런트/백엔드는 함께 배포합니다. 추가 환경변수·서비스 의존성·SQL은 없습니다. 기존 수집 PC와 스케줄은 변경하지 않습니다. 운영 시 로그인·공개권한철회·메모 초안·QR·실물 모바일·R2·Codex·부하·백업 복원은 [DB/운영 체크리스트](V16_DATABASE_REVIEW_KO.md)에 실제 결과를 기록합니다.

## 실제 결과 위치

`verification/v16/results/focused-final.log`, `state-tests.log`, `provider-tests.log`, `ui-tests.log`, `java-tests.log`, `collector-current.log`, `selected-ui-regression.log`, `frontend-build.log`, `backend-build.log`, `gate-refusal.log`, `environment.json`.

[검증 상태](../../TEST_RESULTS_KO.md) · [변경사항](../release/V16_CHANGES_KO.md)
