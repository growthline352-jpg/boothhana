# 서브컬처 검색·DB 수집기 v1 (BoothHana v3 패키지)

## 무엇을 구현했나

**프롬프트 한 번 → Codex CLI 실시간 웹 검색 → JSON 검증 → 백엔드 수집 API → PostgreSQL 수집함**입니다.
고정 사이트 크롤러, 다중 에이전트, 외부 사이트 계정 로그인은 없습니다. 기존 행사·부스·예약 데이터는 수정하지 않습니다.
대상은 **서울특별시 실제 개최지**의 코믹·동인 행사/인형 행사/온리전/생일카페입니다. 기본 기간은 실행일(Asia/Seoul)부터 90일, `--month` 또는 `--start/--end`로 변경할 수 있습니다.

배너는 **이미지 URL + 게시 페이지 URL + CLI가 보고한 사용조건**까지 수집합니다. 자동 다운로드·R2 저장·공개는 이번 범위가 아닙니다. 이미지 없음을 이유로 행사 전체를 버리지 않습니다.
관리자 `/admin/subculture`에서 행사 후보/실행 기록/원문/배너 후보를 확인하고 검토 메모와 상태를 저장할 수 있습니다. **확인 완료는 공개가 아닙니다.** 기존 `event`에 승격하거나 팬 화면에 공개하는 기능은 의도적으로 넣지 않았습니다.

## 준비

1. 기존 DB 001~004 이후 `database/005_subculture_collection.sql`을 스테이징에 적용합니다.
2. 이 패키지의 백엔드와 프런트 소스를 함께 적용·배포합니다. 기존 v2 수정이 누적 포함됩니다.
3. 백엔드 `BOOTH_COLLECTOR_TOKEN` 환경변수에 전용 임의 토큰을 설정합니다. 생성 예: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
4. 수집할 PC에 Python **3.11+** 및 Codex CLI를 설치하고 로그인합니다. 이 패키지는 Codex 계정, API 크레딧, DB/R2 키를 포함하지 않습니다.
5. 같은 토큰을 수집 PC에만 설정합니다. **프런트 `.env` 또는 `VITE_*`에 토큰을 넣지 마세요.**

```powershell
cd collector
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item config.example.json config.local.json
# config.local.json의 apiBaseUrl을 실제 백엔드 origin으로 수정합니다.
$env:BOOTH_COLLECTOR_TOKEN = '백엔드와_같은_최소32자_임의토큰'
.\.venv\Scripts\python.exe run.py --config config.local.json --doctor
```

Linux/macOS는 `python3 -m venv .venv`, `.venv/bin/python`을 사용합니다.
토큰은 파일에 저장되지 않으며 기본적으로 환경변수에서만 읽습니다. `config.local.json`은 로컬 실행 경로/API 주소 설정용이며 Git에서 제외합니다.

## Codex 인증과 격리

기본적으로 기존 `$CODEX_HOME/auth.json` 또는 `~/.codex/auth.json`에서 인증 파일만 복사하여 **임시 격리 CODEX_HOME**에서 실행합니다. 사용자 config.toml/MCP/훅/스킬은 복사하지 않습니다. 코드/사용자 설정을 복사하거나 변경하지 않습니다. CLI가 인증 토큰을 갱신한 경우, 원본 인증 파일이 다른 프로세스에 의해 바뀌지 않았을 때에만 갱신된 인증 파일을 반영합니다. 동시 로그인 변경은 덮어쓰지 않고 실패 처리합니다. 장기 예약 실행에는 별도 codexHome과 전용 계정을 사용하세요.
OS 키체인 방식 인증만 사용하여 auth.json이 없는 경우에는 별도 디렉터리에 파일 방식으로 로그인한 후 `config.local.json`의 `codexHome`에 그 경로를 지정하세요.

```powershell
# 선택: 전용 Codex 로그인 디렉터리. 비밀 파일이므로 저장소 밖에 둡니다.
$env:CODEX_HOME = "$HOME\.boothhana-codex-auth"
codex -c 'cli_auth_credentials_store="file"' login
# 또는 단일 CLI 실행용 CODEX_API_KEY를 환경변수에 설정합니다.
```

실행 명령은 프로그램이 다음 옵션을 고정합니다.
`codex exec --sandbox read-only --skip-git-repo-check --ephemeral --json -c web_search="live" --output-schema ... --output-last-message ... -`
프롬프트는 stdin으로 전달합니다. 셸 문자열을 만들어 실행하지 않습니다. 셸/통합 exec 도구와 로그인 셸은 꺼집니다. DB/R2/수집 API 토큰은 CLI 프로세스에 전달하지 않습니다.
사용자가 설정한 모델이 없으면 Codex 기본 모델을 사용합니다. `model` 설정은 선택 사항입니다. 오래된 CLI가 옵션을 지원하지 않으면 실패로 기록하며 위험한 권한으로 자동 재실행하지 않습니다.
호스팅형 웹 검색의 `item.completed` 기록이 없는데 성공을 주장하는 결과는 실패 처리합니다. 도구가 실행되었다고 자료의 진실성까지 입증되는 것은 아닙니다.

**보안 한계:** 읽기 전용은 완전한 파일 읽기 차단과 같지 않습니다. 개인 개발환경 대신 업무 비밀이 없는 전용 OS 계정/격리 컨테이너에서 운영하는 것을 권합니다. CLI 인증은 민감정보입니다. 이 프로그램의 격리 옵션이 모든 버전의 CLI/플러그인 보안을 보장하지 않습니다.

## 실행

```powershell
# 1. 실제 웹 검색 없이 포함된 가상 샘플로 검증만 수행 (DB 저장 없음)
.\.venv\Scripts\python.exe run.py --config config.local.json --month 2026-10 --input examples/sample.json --dry-run

# 2. 실제 CLI 검색과 검증까지만 (DB 저장 없음, Codex 사용량은 발생 가능)
.\.venv\Scripts\python.exe run.py --config config.local.json --month 2026-10 --dry-run

# 3. 실제 검색 → 검증 → DB 수집함 저장
.\.venv\Scripts\python.exe run.py --config config.local.json --month 2026-10

# 4. 오늘부터 90일을 조회·저장 (예약 실행에 적합)
.\.venv\Scripts\python.exe run.py --config config.local.json

# 5. 검색은 성공하고 전송이 실패한 경우, 같은 batch.json 재전송 (검색 비용 추가 없음)
.\.venv\Scripts\python.exe run.py --config config.local.json --retry-batch "$HOME\.boothhana-collector\runs\실행UUID\batch.json"
```

`--input result.json`은 정해진 JSON 스키마에 맞는 결과를 **수동 가져오기**하는 경로입니다. `--dry-run`이 없으면 DB에 저장합니다. 실제 CLI 검색이라고 표시하지 않습니다. 샘플은 실재하지 않는 `[TEST]` 데이터이므로 항상 `--dry-run`으로 사용하세요.
정상 실행은 exit 0, 검색/출력 검증 실패는 exit 2, 설정/전송 실패는 exit 1입니다. PARTIAL/REJECTED_ALL은 저장 자체가 성공하면 exit 0이며 관리자 실행 기록에서 구분합니다.

## 자동 실행

Windows 작업 스케줄러 등록 스크립트를 포함했으며 **등록은 사용자가 실행해야 합니다**. 이 ZIP을 여는 것만으로 예약 작업은 생성되지 않습니다.
`run-collection.ps1`은 현재 프로세스에 토큰이 없으면 Windows 사용자 환경변수의 `BOOTH_COLLECTOR_TOKEN`을 읽습니다. 예약 실행은 현재 로그인한 사용자와 켜져 있는 PC가 필요하고 실행시각은 Windows 로컬 시간 기준입니다.

```powershell
# 예약 전 같은 계정에서 run-collection.ps1 수동 실행 성공을 확인하세요.
# 토큰을 사용자 환경변수에 영구 저장할 때는 해당 계정의 접근통제를 점검하세요.
[Environment]::SetEnvironmentVariable('BOOTH_COLLECTOR_TOKEN', '백엔드와_같은_토큰', 'User')
.\register-task.ps1 -At '07:00'
# 해제: Unregister-ScheduledTask -TaskName 'BoothHana Subculture Collection'
```

Linux cron 예시 (서버/컨테이너의 시간대 설정을 확인):
`0 7 * * * /opt/boothhana/collector/.venv/bin/python /opt/boothhana/collector/run.py --config /opt/boothhana/collector/config.local.json`
비밀값은 명령행에 넣지 말고 전용 서비스 계정의 제한된 실행 환경으로 주입하세요. 사용자 PC 로그인에 의존하지 않으려면 항상 켜진 별도 실행 서버가 필요합니다. 웹 API 서버의 HTTP 요청 안에서 CLI를 실행하지 않습니다.

## 저장 규칙

- Python에서 JSON 스키마 및 날짜/지역/URL/근거를 검사하고 서버도 독립적으로 다시 검사합니다.
- 날짜만 아는 행사는 시간을 null로 보존합니다. 떨어진 운영일 구간은 합치지 않습니다. 목록의 최소~최대 날짜는 범위 요약이고 실제 일정은 상세 occurrences입니다.
- 공식/주최/플랫폼 구분과 원문/검색요약/접근불가 확인 수준을 보관합니다. AI가 보고한 표시이지 독립 사실검증 인증은 아닙니다.
- 동일 제목·장소·주최·회차·개최일의 정규화 키로 정확 중복을 방어합니다. 배치 UUID는 재전송에도 유지합니다. 같은 UUID에 다른 내용은 409로 거절합니다.
- 같은 후보의 시간·소개·출처가 달라지면 새 관찰값과 이전 검토 보존본을 유지하고 검토 대기로 전환합니다. **제외한 후보는 자동으로 다시 살리지 않습니다.**
- 개최일/장소/주최/회차가 바뀌면 다른 후보가 될 수 있습니다. 제목·회차·연도가 유사하면 중복 가능 후보 ID를 표시할 뿐, AI로 임의 병합하지 않습니다. 제목까지 다른 중복은 사람 확인이 필요합니다.
- 실제 검색 실패, 정상 무결과, 부분 수집, 전체 제외를 구분합니다. 원문 삭제/응답 실패를 행사 취소로 단정하지 않습니다.
- 모든 저장은 private 수집함 대상입니다. 팬에게 공개되는 event 테이블은 건드리지 않습니다.

## 배너

이번 범위는 배너 **후보 URL 수집**입니다. 백엔드가 외부 이미지를 가져오지 않아 해당 경로의 SSRF/다운로드 비용을 만들지 않습니다. 관리자에서 링크를 열 때만 사용자의 브라우저가 외부 사이트에 접속합니다.
사용허락과 해당 회차가 확인된 뒤 기존 서버 검증 업로드를 통한 행사 이미지 반영은 후속 작업으로 남겨둡니다. 이번 패키지가 R2 자동 수집까지 구현했다고 해석하지 마세요.

## 파일/로그

기본 `~/.boothhana-collector/runs/<UUID>/`에 prompt.txt, search-result.json, codex.jsonl, codex.stderr.log, batch.json, validation.json, usage.json, receipt.json을 저장합니다. 임시 CLI 인증 디렉터리는 실행 종료 시 삭제합니다. API 전송이 불가능하면 배치는 로컬에 남습니다.
로그에는 공개 원문/검색어가 포함될 수 있으므로 로컬 접근을 제한하고 필요 기간 후 정리하세요. 로그·개인 인증·로컬 설정을 소스 ZIP에 넣지 마세요.

## 검증

`python -m unittest discover -s tests -v`
HTTP/CLI 파이프라인 테스트는 가짜 CLI와 로컬 모의 API를 사용합니다. 실제 웹검색·실제 PostgreSQL 성공 결과가 아닙니다. 스테이징 체크리스트는 v3 배포 안내를 따르세요.
