# 현재 수집기: v18 서울·경기 / 서브컬처·박람회·축제

실제 주소 기준 서울특별시·경기도만 포함하며 인천은 제외합니다. SQL001~016과 v18 백엔드/프런트를 함께 사용합니다. 하위 분류는 taxonomy.py 및 서버 CatalogTaxonomy.java의15종입니다. 실제 조사·검토·공개는 별도 운영 작업입니다.

기존 일요일03시 주간 및 월~토04시 임박 배치도 스케줄 템플릿과 CLI→Python 저장 구조를 유지합니다. 새 실행 체크포인트는 weekly-v18이며 이전 weekly-v5/서울 전용 실행을 resume하지 않습니다. 원문 미공개·미조사·예산 부족은 PARTIAL/미확인으로 남기고 가짜 참가/상품을 만들지 않습니다. 공연 출연자는 자동으로 판매 부스가 되지 않습니다.

[현재 적용 절차](../docs/deployment/FULL_V18_KO.md) · [변경사항](../docs/release/V18_CHANGES_KO.md)

아래 v5~v9 내용은 기존 설치/운영 개념의 이력입니다. 서울-only/SQL007/weekly-v5 범위 안내는 현재 기준이 아닙니다. 토큰·로컬환경 보안, 출처 권한·예산·재시도 개념은 유지하며 운영 설정은 위 v18 절차를 우선합니다.

---

> v9 변경: 행사 결과에 출처 기반 `operationStatus`를 보고합니다. 기존 결과의 필드 누락은 UNKNOWN으로 호환됩니다. 기존 주간·배치도 보완 일정/CLI 조사 방식은 유지하며, 자세한 내용은 `docs/deployment/FULL_V9_KO.md`를 확인하세요.

# v8 배치도 자동화 추가 안내

기존3단계 수집 설명은 아래에 보존합니다. **일요일 실행 진입점은 `run_scheduled.py`로 변경**하여 기존 `weekly.py` 종료 뒤 `floorplans.py`가 이어집니다. 월~토04시KST의 `floorplans.py --imminent`는14일 이내 행사만 보완합니다. 스케줄은 별도 설치하세요.

배치도 사용 승인·허용 호스트·이미지 입력 CLI·원본별 타일 체크포인트·SQL009·실행 예시는 `../docs/deployment/FULL_V8_KO.md`, 정책은 `../docs/floorplans/AUTOMATION_V8_KO.md`에 있습니다. `weekly.py` 단독 명령은 예전3단계만 실행합니다. 아래 문서의 기존 v4/v5 설명은 배치도 분석 단계를 포함하지 않습니다.

---

# 일요일 반복 수집·보완 수집기 v5

## 역할

**매주 일요일 03:00 Asia/Seoul**에 서울의 진행 중/앞으로90일 행사를 발견한 뒤, 기존 행사의 누락 정보 → 참가부스 → 판매정보를 검색해 백엔드 DB에 저장합니다. 별도 배치도 작업은 월~토 04:00(14일 이내 행사)과 일요일 본 수집 뒤에 이어집니다.

발견 단계는 전시장 일정·주최사 공식 채널·공공기관·예매처·참가자 공개 공지·커뮤니티 일정표를 서로 다른 출처군으로 조사합니다. 커뮤니티 일정표는 행사명 후보를 찾는 용도로만 쓰며 공식 원문으로 재확인합니다. 각 출처군의 검색어와 확인 URL을 `sourceCoverage`로 남기므로 한 목록만 읽고 전체 조사를 완료했다고 처리할 수 없습니다.

발견된 행사와 기존 DB 행사는 행사명·회차·개최일을 포함한 한 건짜리 컨텍스트로 CLI에 차례대로 전달됩니다. CLI는 DB 행사 스펙의 주소·입장정보·운영시간·회차 포스터와 후속 참가부스·배치도·상품 조사 링크를 보완합니다. 이후 참가부스와 상품 단계가 행사별로 분리 실행되므로 행사 하나의 대량 상품 때문에 다른 행사 발견이 중단되지 않습니다.

누락 정보 보완 단계는 주소·입장정보·운영시간·참가부스 출처·해당 회차 포스터가 비어 있는 공개 행사를 다시 조사합니다. 한 회차에 전부 처리하지 않고 `maxEventEnrichments`만큼 순환하며, 미시도 행사를 먼저 고르고 그다음 마지막 시도가 오래된 행사부터 고릅니다. 공식 미발표 항목은 추측하지 않고 다음 회차에 다시 확인합니다.

보완 결과는 기존 행사명·회차·장소·일정을 임의로 바꾸지 않으며 빈 필드만 채웁니다. 새 출처·포스터 후보·참가부스/배치도 링크는 추가할 수 있습니다. 실제 공개는 기존과 동일하게 관리자 검토를 거치므로 잘못된 자동수집이 즉시 사용자 화면을 덮어쓰지 않습니다.

Codex CLI는 `exec` 비대화형 live web search와 JSON schema 출력을 사용합니다. DB/R2/수집 토큰·사용자 MCP 설정은 검색 프로세스에 전달하지 않습니다. 백엔드 저장은 Python 실행기가 담당합니다. 별도 데스크톱 터미널 창 자동 입력을 하지 않습니다.

## v4에서 업데이트

백엔드 DB에 SQL007 적용 후 프런트·백엔드·collector를 함께 교체합니다. v5는 별도 `weekly-v5/` 체크포인트를 사용하며 이전 v4 체크포인트는 강제 재개하지 않습니다. **`--resume`은 v5 실행 폴더에만 사용**합니다. DB의 이전 수집·검토·이미지는 그대로 재사용합니다.
명단은 서버가 보관한 다음 페이지부터 이어 수집합니다. 판매정보 대상은 마지막 **성공**이 아니라 마지막 **시도**를 기준으로 순환합니다. 무결과는 이전 상품을 지우지 않고 재확인 미완료로 표시합니다. CLI 한도와 이미지 처리 예산은 분리되어 있습니다.

## 1. 사전 준비

- Python3.11 이상, 설치된 Codex CLI, 실행 계정의 인증.
- 백엔드 최신 코드와 SQL001~007, HTTPS 주소(로컬 localhost 개발은 HTTP).
- 백엔드와 실행기에 동일한 `BOOTH_COLLECTOR_TOKEN` (32자 이상 임의 값).
- 작업 시간에 켜져 있는 수집 PC/서버. Windows 템플릿은 로그인된 실행 계정 필요.

```powershell
cd collector
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item config.example.json config.local.json
```

`config.local.json`의 apiBaseUrl을 백엔드 주소로 설정합니다. 토큰은 JSON에 적지 않고 환경변수에 둡니다. 현재 터미널만 시험하려면 `$env:BOOTH_COLLECTOR_TOKEN`에 값을 설정하고, 예약 작업에는 해당 실행 계정이 값을 받을 수 있게 별도 준비하세요. 실제 비밀 값을 Git에 저장하지 않습니다.

## 2. Codex 인증

전용 CODEX_HOME 폴더를 권장합니다. 파일 저장 방식으로 로그인하면 실행기가 필요한 auth.json만 격리된 임시 폴더에 복사하고, 갱신된 인증을 안전하게 되돌립니다.

```powershell
$env:CODEX_HOME = "$env:USERPROFILE\.boothhana-codex"
codex -c cli_auth_credentials_store='"file"' login
```

`config.local.json`의 `codexHome`을 위 절대 경로로 지정합니다. Windows JSON 경로는 `C:/Users/.../.boothhana-codex`처럼 슬래시를 쓰면 됩니다. 시스템 keyring에만 저장된 로그인은 이 실행기에 auth.json이 없으므로 사용할 수 없습니다.

`CODEX_API_KEY` 인증 방식도 코드에서 허용하지만 실제 인증/계정별 사용 가능 설정은 해당 CLI 문서와 환경에서 확인해야 합니다. ChatGPT 로그인과 API 키 방식의 사용량/과금은 같다고 가정하지 마세요. 자격증명·모델 사용한도·재로그인이 필요한 실패는 로컬 로그에 남으며 수집기를 조용히 성공 처리하지 않습니다.

Codex 실행 파일이 PATH에 없다면 `codexExecutable`에 절대 경로를 지정하세요. `model:null`은 CLI 기본 모델이며 특정 모델을 강제하지 않습니다. 로컬에서 다른 Codex 작업과 auth 파일을 동시에 갱신하지 않도록 전용 폴더를 사용합니다.

## 3. 스테이징 확인 순서

```powershell
# 인터넷/CLI/DB 없이 가상 fixture로 흐름 검사. 실제 행사 데이터가 아닙니다.
.\.venv\Scripts\python.exe weekly.py --month 2026-10 --dry-run --fixtures examples/v5

# 실제 CLI 조사만, DB 저장 없음 (CLI 사용량은 발생할 수 있음)
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10 --dry-run

# 실제 검색과 스테이징 저장
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10

# 같은 기간의 검증된 dry-run 발견 결과를 실제 DB에 재사용
.\.venv\Scripts\python.exe weekly.py --config config.local.json --month 2026-10 --seed-checkpoint 'C:/Users/me/.boothhana-collector/weekly-v18/<dry-run-folder>'

# 주간 운용: KST 실행일부터90일. 같은 주 SUCCESS이면 재실행하지 않음
.\.venv\Scripts\python.exe weekly.py --config config.local.json --scheduled
```

가상 fixture는 dry-run에서만 허용하며 실제 서비스 DB로 전송할 수 없습니다. 기간 지정은 `--month YYYY-MM` 또는 `--start YYYY-MM-DD --end YYYY-MM-DD` 중 하나입니다. `--seed-checkpoint`는 동일 기간·v5 감사 메타데이터·완료된 웹 검색 기록이 있는 체크포인트만 허용하며 임의 JSON을 우회 수집하지 않습니다.

공식 일정표를 사람이 대조해 보강한 이벤트 JSON은 별도 수동 배치로 검증·수입할 수 있습니다. 수동 수입은 CLI 웹 검색으로 위장하지 않으며, 운영 공개 전에 동일한 관리자 검토를 거칩니다.

```powershell
$env:BOOTH_COLLECTOR_TOKEN = "..."
python import_manual_events.py --config config.local.json --month 2026-11 --input manual-data/2026-11-official-events.json
```

관리자 `/admin/subculture`에서 raw 출처/검토값·참가부스·판매요약·이미지·배치 결과를 확인합니다. 수집 자체는 자동 공개/예약 활성화가 아닙니다.

## 4. Windows 일요일 예약

Windows timezone은 `Korea Standard Time`이어야 합니다. 현재 실행 계정의 영구 환경변수에 백엔드와 같은 토큰을 준비하고 새 세션에서 읽히는지 확인하세요. 토큰이 콘솔/로그에 그대로 출력되지 않게 하세요.

```powershell
# collector 폴더에서 실행. 작업 등록은 이 명령을 사용자가 실행할 때 일어납니다.
.\register-task.ps1
# 시간 변경 예: 일요일 04:00 (선택)
.\register-task.ps1 -At '04:00' -TaskName 'BoothHana Weekly 04'
```

`-Force`를 사용하지 않으므로 같은 이름 작업을 자동 덮어쓰지 않습니다. **이전 v3 매일 실행 작업이 남아 있다면 먼저 확인하여 중지**하세요. 제공 설정은 PC전원/실행계정 로그인 필요, 누락된 실행은 StartWhenAvailable에 따라 복구 시점에 실행할 수 있습니다. 기본시간을 바꾼 경우 현재 UI 안내의 기본03:00도 필요시 변경하세요.

스케줄러 관리 없이 단독 시도는 `run-collection.ps1`입니다. 실행 중복은 OS 파일 잠금 및 서버 활성 배치 잠금으로 차단합니다.

## 5. Linux systemd

수집 전용 계정과 디렉터리를 준비합니다. 템플릿은 `/opt/boothhana/collector`, 실행 계정 `boothhana`, 가상환경 `.venv` 기준입니다. 실제 배치 계정으로 Codex 로그인/인증파일 접근을 확인합니다. `config.local.json`에서 codexExecutable/codexHome은 절대 경로를 권장합니다.

`systemd/collector.env.example`을 참고해 `/etc/boothhana/collector.env`에 실제 환경변수를 작성하고 `chmod 600`으로 보호합니다. 서비스 템플릿과 timer를 검토한 뒤 설치합니다.

```bash
sudo cp collector/systemd/boothhana-weekly.service /etc/systemd/system/
sudo cp collector/systemd/boothhana-weekly.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now boothhana-weekly.timer
systemctl list-timers boothhana-weekly.timer
journalctl -u boothhana-weekly.service
```

timer의 `OnCalendar=Sun *-*-* 03:00:00 Asia/Seoul`은 서버 기본시간이 UTC여도 KST03:00을 사용합니다. Persistent=true이므로 서버가 꺼져 있었으면 다음 부팅 시 누락 실행을 보완할 수 있습니다. 단순 cron을 사용할 경우 명시적 timezone 지원 여부를 확인해야 하므로 이 패키지는 systemd를 기본 제공합니다.

## 6. 기본 예산·부분 수집

검증이 끝난 수동 조사 파일은 한 달 단위뿐 아니라 분기 범위로도 넣을 수 있습니다.

```bash
python import_manual_events.py --config config.local.json --start 2026-10-01 --end 2026-12-31 --input manual-data/2026-q4-subculture-official-events.json
```

config 값:

| 키 | 기본 | 의미 |
|---|---:|---|
| maxEvents | 50 | 실행당 행사 수 |
| maxParticipantPages | 10 | 행사당 참가명단 페이지 작업 수 |
| maxSales | 100 | 실행당 판매정보 조사 대상 수 |
| maxSalesPagesPerParticipant | 5 | 부스별 상품 목록을 이어 읽는 최대 페이지 수. 다음 주소는 다음 실행에도 보존 |
| maxCliCalls | 240 | 실행당 CLI 호출 수 |
| maxRuntimeMinutes | 240 | 전체 조사/이미지 처리 시간 예산 |
| timeoutSeconds | 900 | CLI 한 작업 제한시간 |
| maxImages | 100 | 사용 승인된 이미지 저장 시도 수 |
| maxEventEnrichments | 50 | 실행당 누락 행사 재조사 수. 0이면 보완 단계 중지 |
| priorityEventKeywords | [] | 동률일 때 먼저 조사할 행사명 키워드. 이후에도 오래된 시도 순환 유지 |
| discoveryEventNames | [] | 사람이 찾았거나 외부 목록에서 추출한 행사명 후보. CLI가 각 이름을 공식 원문으로 재검증 |
| discoveryLeadUrls | [] | 누락 후보용 일정 인덱스. 공식 원문으로 재검증하며 리드 자체는 사실 근거로 저장하지 않음 |
| discoverySourceSeeds | {} | 전시장·주최사·공공기관·예매처·참가자·커뮤니티 출처군별 추가 시작 URL |
| imageAllowedHosts | [] | 외부 이미지 허용 호스트. 기본 다운로드불가 |
| blockedSourceHosts | [witchform.com] | 제한 출처. 사용 가능 범위는 운영자가 확인 |

한도/명단 미공개/원문접근실패는 PARTIAL로 남고, 확보된 항목은 보관됩니다. 아직 조사 차례가 오지 않은 누락 행사는 정상적인 `enrichmentQueued` 건수로 기록되며 실행 실패로 취급하지 않습니다. 상품목록이 없으면 요약/분야만 저장합니다. 이번 행사 판매 확인이 없으면 상시 상품으로 표시합니다. 개수 채우기를 위한 추측을 허용하지 않습니다.

새로 저장한 부스 전부를 한 번에 조사하는 것은 maxSales에 의해 제한될 수 있습니다. 다음 주는 미시도 부스를 먼저, 그다음 마지막 시도가 오래된 부스부터 선택합니다. 명단 커서와 상품 페이지 커서는 다음 실행과 v5 재개 실행에서도 유지됩니다. 상품표가 100개를 넘으면 `coverage.nextPageUrl`을 따라 최대 `maxSalesPagesPerParticipant` 페이지까지 이어가고, 출처 표기 총수보다 적게 확보한 결과는 완료로 처리하지 않습니다. 동일 참가·상품은 보수적인 sourceID/주소 기준으로 연결하므로 다른 주소로 중복 발견될 때 관리자 검토가 필요합니다.

## 7. 이미지

CLI에는 이미지 URL/게시 원문/보고된 조건만 찾게 합니다. 저장과 공개 승인 판단은 CLI가 하지 않습니다.

1. 관리자 이미지 카드에서 실제 사용 조건을 확인하고 승인 근거(비공개)와 출처표시(공개)를 입력.
2. `imageAllowedHosts`에 승인한 원본 이미지 호스트를 등록. 원문페이지가 아닌 CDN 호스트일 수 있으며 redirect 목적지도 각각 허용해야 함.
3. 다음 일요일 배치에서 기존 승인 후보를 다운로드/검증하고 백엔드로 전달, R2 저장.

예를 들어 `["cdn.allowed-example.com"]`처럼 **검토한 실제 호스트**를 설정합니다. 이 예시 호스트는 실제 서비스를 뜻하지 않습니다. 선택적으로 `*.example.com` 와일드카드를 지원하지만 필요한 호스트만 좁게 허용하세요. 내부IP·비HTTPS·HTTP인증 URL은 허용하지 않습니다.

기본 목록이 빈 상태라면 후보는 모으지만 실제 이미지 파일은 저장하지 않습니다. 실패한 이미지만 다음 배치에서 다시 시도하며 행사·판매정보를 삭제하지 않습니다. 이미지를 크롭/재인코딩하지 않습니다. PDF 배치도는 링크만 수집합니다.

## 8. 재시도·로그

실행 결과 디렉터리는 기본 `~/.boothhana-collector/weekly-v5/` 아래입니다. 로그에는 수집 raw정보가 있으므로 일반 공개 폴더에 두지 마세요. auth·토큰은 결과 JSON에 넣지 않습니다.

- pipeline.json: run ID, 기간, 상태, 건수·문제.
- `stateDirectory/event-enrichment-attempts.json`: 행사별 마지막 보완 시도일·상태. 다음 실행의 순환 우선순위에 사용.
- jobs/*/payload.json + receipt.json: 보내려던 요청/서버 수신확인. 재시도는 같은ID/내용 유지.
- codex.jsonl, codex.stderr.log: CLI 도구사용 감사·오류.
- validation-rejections.json: 제외한 참가 데이터 사유.

```powershell
# 같은 검색기간/ID로 이어 실행. 기간 옵션을 함께 쓰지 않습니다.
.\.venv\Scripts\python.exe weekly.py --config config.local.json --resume 'C:/Users/me/.boothhana-collector/weekly-v5/2026-09-20'
```

동일 단계의 수신확인이 있으면 다시 저장하지 않습니다. CLI 결과가 보관되어 있으면 재검색하지 않고 재전송합니다. 이미 전달한 payload를 편집하지 마세요. 부모 revision 변경/409는 오래된 요청을 강제로 덮어쓰지 않고 다음 주의 새 배치에서 다시 확인합니다. CLI 실패는 로컬 오류와 pipeline issues에 기록되며, 서버에 도달하지 못한 내용은 로컬에만 남습니다.

종료코드: 0 정상 종료(전수/정확성 보장이 아님), 2 일부/예산소진/단계오류, 1 시작/설정/통신 치명오류. Linux service는 2도 프로세스 완료로 취급하므로 SUCCESS로 오해하지 말고 관리자 PARTIAL/로그를 확인하세요.

## 9. 테스트와 공식 참조

`python -m unittest discover -s tests -v`로 로컬 모의테스트 실행. 전체 저장소 독립검증은 루트 `python verification/run_checks.py`. 실제 Codex/서버/R2 연동은 별도 스테이징 검증이 필요합니다.

공식 기능 참조(설치한 CLI 버전과 함께 확인):
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/auth
- https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger

`run.py`의 예전 행사 1단계 단독 인터페이스는 호환을 위해 남겨 두었습니다. 주간3단계 설정 파일에는 키가 추가되었으므로 **v5 운용은 weekly.py**를 사용하세요.


상세 보완 계약: `../docs/catalog/REVIEW_FIXES_V5_KO.md`. 서버 receipt의 작업별 수신 건수는 누적 유일 참가자 수와 다릅니다. 관리자 목록의 누적 건수와 구분해서 확인하세요.
