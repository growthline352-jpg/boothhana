# 전체 소스 v8 적용 및 배치도 운영

## 적용 순서

1. 기존 코드·DB·수집기 설정을 백업하고 진행 중인 배치를 종료합니다. 새 브랜치에 전체 소스의 내용물을 같은 루트 구조로 반영합니다. `.git`, 실제 `.env`, `collector/config.local.json`, Codex 인증은 보존하되 Git에 올리지 않습니다.
2. v7에서 SQL008까지 적용했다면 **`database/009_floorplan_automation.sql`만** 추가합니다. 신규 DB는 001~009 순서로 적용합니다. 009는 추가 전용 5개 테이블이며 기존 데이터를 자동 삭제/공개/승인하지 않습니다.
3. 서버 전용 JDBC 역할이 신규 테이블 소유자 또는 검토된 서버 전용 RLS 정책으로 접근 가능한지 확인합니다. 브라우저/anon 역할에 권한을 풀지 않습니다.
4. 백엔드·프런트·수집기를 함께 빌드/배포합니다. 009 없이 공개 배치도/이미지 수집 쿼리를 실행하면 실패할 수 있습니다.
5. `collector/config.local.json`에 기존 설정을 유지하고 config.example.json의 `floorplanMax*` 항목을 필요에 따라 추가합니다. 생략 시 기본값을 사용합니다. 기존 `BOOTH_COLLECTOR_TOKEN`, R2 설정, 별도 Codex 인증을 재사용합니다.
6. 가상 dry-run, 스테이징 CLI 검색, 승인한 실제 이미지의 분석, 공개 조회를 순서대로 검증합니다. 실제 테스트 완료 후 주간/보완 스케줄을 활성화합니다.

```powershell
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm build
cd ../backend
.\gradlew.bat test
.\gradlew.bat bootJar
```

이번 환경의 모의·규칙 검사 통과는 위 전체 빌드를 대신하지 않습니다.

## 수집 실행

Python3.11+, collector/requirements.txt, 이미지 입력을 지원하는 Codex CLI와 전용 로그인 설정이 필요합니다. DB/R2/수집 토큰은 CLI subprocess에 전달하지 않습니다. Python 실행기가 서버 API에 저장합니다.

```powershell
cd collector
# 네트워크/DB 없이 가상 도면으로 전체 처리 형식 확인
.\.venv\Scripts\python.exe floorplans.py --dry-run --fixtures examples/floorplan-v8
# 실제 CLI 웹 탐색만 시험, DB 저장/이미지 다운로드 없음
# event-file은 [{"eventId": 1, "event": { ...공개 행사 정보... }}] 형식
.\.venv\Scripts\python.exe floorplans.py --config config.local.json --dry-run --event-file my-events.json
# 스테이징 DB에 있는 재확인 대상 검색/이미지 분석/매핑
.\.venv\Scripts\python.exe floorplans.py --config config.local.json
# 14일 이내 행사만 보완 확인
.\.venv\Scripts\python.exe floorplans.py --config config.local.json --imminent
# 기존 일요일 배치 후 배치도 작업을 이어 실행
.\.venv\Scripts\python.exe run_scheduled.py --config config.local.json
```

`--dry-run`은 DB 전송 금지이며 실제 CLI를 쓰면 사용량이 발생합니다. fixture는 가상 데이터이며 실서비스 DB로 전송할 수 없습니다. fixture의 event-file을 실제 검증 자료처럼 사용하지 마세요.

기본 상한: 실행당 행사30, 행사당 허용 원본10, 원본당 타일40, CLI100회, 배치도 작업180분. 이미지당10MiB/2,500만화소입니다. 하나의 이미지 CLI 작업은 최대20분으로 제한하여25분 작업 임대 안에서 끝나게 합니다. 대량 초기 변환에서는 나머지 대상을 후속 배치로 처리하고 예산을 점진 조정하세요.

## 승인 및 화면

관리자 `/admin/subculture` → 행사 → **클릭형 배치도**:

- 원문과 적용 날짜/전시관 확인. 원본 저장·분할 분석·웹 지도 변환에 필요한 권리 근거와 공개 출처 표기를 입력하고 승인합니다.
- 수집 PC의 `imageAllowedHosts`에 승인한 실제 이미지/CDN 호스트를 설정합니다. 리다이렉트의 목적지도 허용되어야 합니다. 기본값 `[]`에서는 다운로드하지 않습니다.
- 다음 배치가 원본 저장·자동 분석·매핑을 수행합니다. 관리자는 선택한 버전만 불러와 좌표·번호·매핑·미확인 영역을 검토합니다.
- 꼭짓점 드래그·사각형 추가·번호 수정·참가자 직접 연결 또는 좌표 JSON 편집 → ‘수정 저장·재매핑’ → ‘이 버전 검토 완료·공개’입니다. 수동 연결 사유/날짜와 부분 공개 확인이 필요합니다.
- 행사·참가자 자체는 기존 카탈로그 검토/공개를 거쳐야 합니다. 배치도 승인만으로 비공개 참가자 이름이나 판매정보가 노출되지 않습니다.
- 공개 `/discover/:eventId`에서 날짜·전시관 선택, SVG 확대·검색·부스 클릭→기존 판매정보 드로어를 확인합니다. 원본이 바뀌거나 명단/공개본이 불일치하면 기존 도형을 숨깁니다.

R2의 `verified/floorplan/` 객체에 무조건 만료 lifecycle을 적용하지 마세요. 과거/공개 버전이 참조할 수 있습니다. 공개 권한 철회 시 API에서는 숨기지만 이미 공유된 R2 직접 URL 자체의 폐기/CDN 캐시 제거는 별도 운영 작업입니다.

## 스케줄

- 일요일03:00 KST: 기존 전체 배치, 종료 후 배치도. Windows 기존 `run-collection.ps1` 경로를 등록한 작업은 변경된 래퍼를 사용합니다. `weekly.py`를 직접 등록했다면 `run_scheduled.py`로 바꿉니다.
- 월~토04:00 KST: 14일 이내 행사 배치도 전용 보완. 일요일은 전체 배치에 포함하여 중복을 피합니다.

Windows는 한국시간대 및 해당 실행 계정 로그인/PC전원이 필요합니다. `register-floorplan-task.ps1`를 1회 실행합니다. 기존 이름을 강제 덮어쓰지 않습니다. 주간 작업 미설치 시 `register-task.ps1`도 사용합니다. 실제 토큰은 작업 실행 계정 환경에서 읽을 수 있어야 합니다.

Linux는 `collector/systemd/boothhana-weekly.service`(변경)와 기존 weekly.timer, 신규 `boothhana-floorplans.service/.timer`를 실제 경로/계정에 맞춰 설치 후 daemon-reload·enable 합니다. `EnvironmentFile` 권한600 및 Codex 전용 auth파일 접근을 확인하세요. 설정 파일에 스케줄을 적는 것과 실제 설치는 다릅니다.

파일 잠금과 서버 임대가 동시에 실행되는 작업을 차단합니다. 프로세스가 충돌/중단된 경우 자동으로 기존 데이터를 지우지 않으며 체크포인트와 서버 오류를 확인하세요. 스케줄러/백엔드/CLI 사용 한도 오류를 계속 관찰해야 합니다.

## 체크포인트와 실패

`stateDirectory/floorplans-v8/`에 실행 로그, 발견 결과/payload/receipt를 보관합니다. 구역별 분석 결과는 `floorplan-vision-cache/{versionId}/{extractorVersion}/`에 보관되어 다음 실행에서도 완료 타일을 재사용합니다. 원본 bytes/범위가 달라지면 다른 버전·캐시를 씁니다.

`floorplans.py --resume 이전실행폴더`는 해당 실행의 전달/타일 처리를 재시도합니다. 새로운 공지를 다시 검색하려면 새 실행을 시작하세요. v5~v7 주간 catalogue 체크포인트와 floorplans-v8 체크포인트를 혼용하지 않습니다. 로그는 공개 웹 폴더에 두지 마세요.

0은 예약된 작업 처리상 정상, 2는 일부 단계 오류·예산 소진, 1은 설정/시작 오류입니다. ‘정상’은 전수 확보·전수 정확·자동 공개를 뜻하지 않습니다. 권한 대기 항목은 sources 상태에서 별도로 확인합니다.

## 전용 로컬 PostgreSQL 테스트 (미실행)

새 `FloorplanPostgresTests` 10개는 `jdbc:postgresql://localhost:5432/boothhana_floorplan_test` 형태만 허용합니다. 테스트마다 UUID로 임시 스키마를 만들고 **그 스키마만 삭제**하며, public은 삭제하지 않습니다. 테스트 전용 DB와 계정만 사용하세요. Codex/R2는 이 테스트에서도 모의 처리입니다.

```powershell
$env:BOOTH_FLOORPLAN_TEST_URL='jdbc:postgresql://localhost:5432/boothhana_floorplan_test'
$env:BOOTH_FLOORPLAN_TEST_USER='postgres'
$env:BOOTH_FLOORPLAN_TEST_PASSWORD='전용_테스트_암호'
.\gradlew.bat test --tests '*FloorplanPostgresTests'
```

기존 `CatalogPostgresTests`는 이전과 같이 다른 전용 DB의 public schema를 초기화하므로 두 테스트를 혼동하지 마세요. 새 SQL009도 기존 카탈로그 fixture에 포함했습니다.

## 미구현/제한

PDF 페이지 분석, 자동 이미지 사용권 판단, 도면의 정밀 실측, 전시관 내부 최단경로, 여러 홀 합성지도, 모든 작은 글씨의 완벽한 판독은 제공하지 않습니다. 다양한 공식 도면으로 스테이징 정확도·수정률·처리비용을 먼저 확인하세요. 무단 외부 수집 제한을 우회하는 기능도 없습니다.
