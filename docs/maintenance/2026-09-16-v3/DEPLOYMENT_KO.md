# 배포 안내 — 서브컬처 수집 v3

## 적용 범위

v2 코드리뷰 수정 위에 수집기, 서버 수집 API, 관리자 수집함, SQL 005를 추가합니다. 팬 공개 행사·예약·POS 정책은 변경하지 않습니다.
이 ZIP은 누적 업데이트 패키지입니다. 원본 전체 저장소는 포함하지 않습니다. 기존 소스에 적용하거나 build_full_source.py로 기준 원본을 받아 전체 ZIP을 만들 수 있습니다.

## 배포 순서

1. 기존 코드와 DB 백업. 기준 원본은 `f52839479746e195b0b503f0114485ebaed11298`입니다.
2. 원본 또는 이전 패키지가 적용된 소스에서 `python apply_updates.py --source 경로 --check`. 이전 적용 시 만든 형제 `<소스폴더>-backups`를 유지하세요. 서로 다른 버전/로컬 수정은 덮어쓰지 않습니다.
3. 검사 통과 후 `--apply`. 이미 동일한 내용이면 변경 없이 넘어갑니다.
4. DB 001→002→003→004→**005_subculture_collection.sql** 순서. 004까지 적용했다면 005만 적용합니다. 005는 새 수집 테이블 세 개만 추가합니다.
5. SQL의 소유자 또는 서버 전용 권한을 가진 백엔드 JDBC 계정을 사용합니다. 새 테이블 RLS는 활성화하고 anon/authenticated/public 권한은 차단합니다. 브라우저에 Supabase service-role 키를 노출하지 마세요.
6. 백엔드 환경변수 `BOOTH_COLLECTOR_TOKEN`에 32자 이상의 임의 전용 토큰을 설정합니다. 최소 권한 수집 전용 엔드포인트만 사용할 수 있으며 관리자 API 접근에는 사용할 수 없습니다.
7. 프런트·백엔드 전체 빌드/테스트 후 함께 배포. 기존 v2 업로드 프로토콜은 그대로 유지합니다.
8. 수집 PC에 collector 의존성과 Codex 인증/설정/동일 토큰을 준비하고 dry-run → 스테이징 저장 순서로 검증합니다.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
```

## 새 경로

- 서버 간 `POST /api/internal/subculture/batches`: Bearer 수집 전용 토큰. 최대 JSON 본문 2MiB, 최대 200개 행사. 토큰 미설정은 503, 잘못된 토큰은 401. 이 별도 stateless 체인만 CSRF를 사용하지 않으며 기존 관리자/사용자 API의 세션·CSRF 정책은 유지합니다.
- 관리자 `/api/admin/subculture/candidates`, `/candidates/{id}`, `/candidates/{id}/review`, `/runs`: 기존 ADMIN 권한 + CSRF. 목록은 20건 기본 페이지네이션(최대 100).
- 관리자 화면 `/admin/subculture`: 후보 상세, 출처/배너 링크, 검토 메모/상태, 실행 결과와 제외 이유.
- 자동 CLI 실행은 별도 수집 PC/서버에서 수행합니다. 관리자 버튼이 원격으로 PC의 터미널을 여는 구조가 아닙니다.

## 최소 스테이징 수락 기준

- 기존 로그인/예약/POS/이미지 업로드의 v2 회귀 확인.
- 수집 전용 토큰이 비어 있어도 기존 API 동작, 수집 API는 503. 잘못된 토큰은 401.
- 수집 토큰으로 관리자 API 접근 불가. 일반 FAN/CREATOR 계정은 수집함 접근 불가.
- 실제 Codex CLI로 실시간 검색 도구 기록과 올바른 JSON 생성 확인. 검색어/모델/원문 접근 상태를 사람 검토.
- 서울 밖/날짜 오류/출처 없는 항목이 제외되고 원인 확인 가능.
- `10/10~11, 10/13` 예시가 12일 포함 없이 저장되는지 확인.
- 같은 batch.json을 두 번 전송해 run/candidate/observation이 중복 생성되지 않음.
- 같은 runId 다른 내용은 409. 새 실행에서 동일 후보는 last_seen 갱신. 새로운 관찰값은 이전 검토 보존본 유지.
- REVIEWED를 저장한 후보의 정보가 바뀌면 PENDING. EXCLUDED는 자동 재개하지 않음.
- 두 서버에서 같은 배치를 동시에 받아도 같은 기록 하나. DB 잠금 대기 제한 도달 시 실패 응답/로컬 재전송 가능.
- 배너는 링크 후보만 저장되고 서버가 임의 외부 URL을 가져오지 않음.
- 확인 완료를 눌러도 기존 행사 목록/부스 신청/예약 데이터가 바뀌지 않음.

## 운영 제한

원본 전체/외부 의존성 다운로드가 제한되어 이 작성 환경에서는 실제 Codex·Spring/PostgreSQL·전체 React 빌드를 실행하지 못했습니다. 실제 실행/미실행 범위는 TEST_RESULTS_KO.md를 보세요.
2MiB 메모리 제한은 느린 요청/전역 DoS 제한과 다릅니다. 호스팅 리버스 프록시에서 요청 크기, 읽기 제한시간, 수집 API 접근 IP 및 요청 빈도를 제한하세요. 인증된 수집 요청의 장기 누적 보관/전역 비용 제한은 별도 운영 정책입니다.
소유자 권한 없는 JDBC 계정으로 RLS 정책 없이 호출하면 거부됩니다. 이를 해결하려고 anon/authenticated에 전체 접근을 주지 마세요.
SQL 005를 적용하지 않아도 기존 업무 엔티티는 그대로지만 새 수집 API는 작동하지 않습니다. 먼저 SQL을 적용하세요.
실패한 프로세스가 DB와 통신할 수 없으면 실행 실패 자체도 로컬에만 남습니다. 작업 스케줄러 exit code와 로그를 모니터링하세요.

## 되돌리기

코드는 적용기 백업으로 복원합니다. 추가 수집 테이블은 바로 삭제하지 않아도 이전 코드에 영향을 주지 않습니다. 수집 토큰을 제거하고 OS 예약 작업을 해제하면 자동 저장을 중단할 수 있습니다. 재배포 전 기존 후보/관찰 기록을 백업하세요.

## 선택: 실제 DB 회귀 테스트 (이 작성 환경에서는 미실행)

`CollectionPostgresTests` 5개는 `boothhana_collection_test`라는 **전용 로컬 DB**만 허용합니다. 실행 시 해당 DB의 수집 테이블 3개를 초기화하므로 실제 데이터가 있는 DB로 실행하지 마세요. 운영/Supabase URL은 거부합니다. 아래 실행은 전체 의존성 설치 후 사용합니다.

```powershell
$env:BOOTH_COLLECTION_TEST_URL = 'jdbc:postgresql://localhost:5432/boothhana_collection_test'
$env:BOOTH_COLLECTION_TEST_USER = 'postgres'
$env:BOOTH_COLLECTION_TEST_PASSWORD = '전용_테스트_DB_비밀번호'
# backend 폴더에서
.\gradlew.bat test --tests '*CollectionPostgresTests'
```
