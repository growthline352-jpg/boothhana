# 공유 Ubuntu의 독립 Cloudflare Tunnel 배포

다른 서비스의 80/443 포트, 프록시, Docker 네트워크를 변경하지 않는다.
`compose.tunnel.yml`을 런타임 디렉터리의 `compose.yml`로 복사한다.
현재 운영 경로: `/home/bpdeploy/boothhana/shared`.

## 런타임 파일

- `.env`: 검증된 API/수집기 이미지 태그와 cloudflared digest만 지정.
  `BOOTHHANA_API_IMAGE`, `BOOTHHANA_COLLECTOR_IMAGE`, `CLOUDFLARED_IMAGE`.
- `api.env`: 기존 운영 환경 변수, Compose `format: raw`를 사용한다.
- `collector.env`: `BOOTH_COLLECTOR_TOKEN`만 전달한다. API의 DB 비밀번호를 수집기에 전달하지 않는다.
- `secrets/gcs-service-account.json`, `secrets/tunnel-token`.
- `collector.config.json`, `run-tunnel-collector.sh`.

Render 내보내기에는 일부 값에 따옴표가 붙는다. `normalize-render-env.py source target`으로 변환한다.
일반 dotenv 보간을 사용하면 bcrypt의 `$`가 훼손될 수 있다. raw 형식을 지원하는 Compose가 필요하다.
상위 런타임/비밀키 디렉터리는 0700, 환경 파일은 0600으로 보호한다.
비밀키 파일은 비루트 컨테이너가 읽을 수 있어야 하며, 호스트의 상위 디렉터리 접근 제한을 유지한다.

## 실행과 점검

v0.2.4.0 운영 화면 동기화는 SQL022를 새 API보다 먼저 적용합니다. DB 백업·검증, 런타임 역할 지정, API와 프런트 반영 순서 및 복구 기준은 [운영 화면 안내](../../docs/OPERATIONS_CONSOLE_SYNC_KO.md#배포와-복구)를 따릅니다.

관심분야 기능을 배포할 때는 해당 커밋의 전체 release-verification CI를 확인하고 운영 DB를 백업한 뒤 아카이브 목록을 확인한다. 실제 백엔드 역할을 `boothhana.backend_role`로 지정한 동일 DB 세션에서 `database/020_category_interests.sql`을 적용하고, v0.2.2.0의 서브컬처 유형 확장에는 `database/021_subculture_event_types.sql`을 이어서 새 API보다 먼저 적용한다. 이전 001~019는 적용되어 있어야 하며 이미 적용한 SQL은 다시 실행하지 않는다. 새 API 준비 상태와 개인 API 접근·CORS를 확인한 뒤 프런트와 수집기를 같은 릴리스 커밋으로 배포한다. 이전 API 이미지와 런타임 환경 파일을 보존하며, 상세 게이트는 [관심분야 검증 및 배포 계획](../../docs/CATEGORY_INTERESTS_TEST_PLAN.md)을 따른다.

SQL021은 기존 행사·공개 스냅샷을 변경하지 않는다. 기존 행사 재분류는 새 API·프런트 적용 후 관리자 검토와 공개를 거쳐 반영하고 공개 분야 목록·상세 주소를 확인한다. 지역·일정의 공식 근거가 부족한 보류 행사는 근거 확인 후 같은 검토 절차를 따른다.

캘린더·개선 의견·분야 이미지(v0.2.0.0)에는 추가 DB 마이그레이션이 없다. `api.env`의 `SUPPORT_RATE_SECRET`을 32자 이상의 무작위 값으로 설정한 뒤 새 API를 먼저 배포한다. 기존 `SUPPORT_GUEST_ENABLED=false`를 유지해도 개선 의견은 독립적으로 활성화된다.
API readiness와 `/api/public/support/options`의 `feedbackEnabled=true`를 확인한 뒤 프런트를 배포하고 세 분야의 캘린더, 의견 창, WebP·회색 SVG 응답을 확인한다. 운영 사용자 접수를 시험 데이터로 만들지 말고 익명 CSRF·중복 재전송·회원 답변 이력은 격리 PostgreSQL 통합 검사에서 확인한다. 기능 범위는 [프런트 안내](../../frontend/README.md), [고객지원 안내](../../docs/support/SUPPORT_AND_ROLES_V12_KO.md)를 따른다.

```sh
docker compose config --quiet
docker compose up -d boothhana-api cloudflared
docker compose exec -T boothhana-api curl --fail http://127.0.0.1:8080/api/public/health/ready
docker compose run --rm --no-deps -T boothhana-collector codex login --device-auth
docker compose run --rm --no-deps -T boothhana-collector codex login status
bash run-tunnel-collector.sh doctor
```

터널 공개 호스트 `api.boothana.kr`은 `http://boothhana-api:8080`으로만 연결한다.
SSH, Docker 소켓, 다른 서비스, 사설 네트워크 대역은 공개하지 않는다.
API와 터널은 Docker 재시작 정책으로 재기동한다. 수집기는 일회성 작업 컨테이너다.

## 정기 수집

현재 서버 시간대는 Asia/Seoul이다. bpdeploy 사용자 crontab에 다음을 등록했다.
sudo가 필요 없고 로그인 세션이 종료되어도 실행된다. 기존 시스템 타이머는 중복 활성화하지 않는다.

```cron
0 3 * * 0 /bin/bash /home/bpdeploy/boothhana/shared/run-tunnel-collector.sh weekly
0 4 * * 1-6 /bin/bash /home/bpdeploy/boothhana/shared/run-tunnel-collector.sh floorplans
```

공유 `collector.lock`으로 중복 실행을 차단한다. 결과는 `logs/날짜-작업.log`, 최근 결과는
`logs/weekly.status`, `logs/floorplans.status`에 기록한다. 종료 코드 2는 부분 완료다.
CLI 로그인이 만료되거나 사용량이 소진되면 인증/한도를 확인하고 재실행한다.
서버가 꺼진 동안 놓친 cron은 자동 소급 실행하지 않는다. 전체 실제 수집 성공 여부는 첫 실행 로그로 확인해야 한다.

## 이미지 보완 운영과 v0.3.1.1 반영

**2026-10-06 배포 대기 변경:** 이번 runner의 `images`는 `repair_all.py --apply`로
기존 대기 승인·전체 정보 보완·전체 이미지 저장/공개 검증을 순서대로 처리한다.
`images`와 `images-store`의 전체 실행 시간·행사 수 상한은 제거했으며 개별 요청 시간 제한은 유지한다.
API·수집기·runner를 함께 적용해야 한다. 현재 서버 예약·설정은 아직 변경하지 않았다.
자동 승인 설정과 완료/소진/미완료 판정은 [전체 보완 안내](../../collector/REPAIR_COMPLETION_KO.md)를 따른다.
아래 수집기 단독 교체 설명은 이전 릴리스의 운영 기록이다.

기존 매일 18:30 이미지 보완과 15분 간격 승인 이미지 저장 작업은 운영 중이다. v0.3.1.0(PR #51)의 API·수집기·프런트는 2026-10-05 운영에 반영했다. v0.3.1.1은 출처별 감사 복구를 추가하며 새 릴리스의 배포·실행 완료는 해당 커밋의 CI·배포·로그로 확인한다.
신규 API 계약이 바뀌는 릴리스에는 API·수집기·관련 프런트를 함께 반영한다. 이번 수정은 기존 API `dd9a64bd`와 호환되므로 API를 유지하고 수집기만 새 커밋으로 교체한다. 기존 bpdeploy crontab·`run-tunnel-collector.sh`·`api.env`는 변경하지 않는다.

```cron
30 18 * * * /bin/bash /home/bpdeploy/boothhana/shared/run-tunnel-collector.sh images
*/15 * * * * /bin/bash /home/bpdeploy/boothhana/shared/run-tunnel-collector.sh images-store
```

누락 이미지 추가 조사는 LLM CLI 로그인·사용량 한도를 사용한다. `images-store`는 이미 승인된 자산 저장만 수행하므로 CLI 웹 조사를 하지 않는다. 두 작업 모두 기존 collector 토큰과 호스트 정책을 사용한다.
`logs/images.status`와 수집기 상태 디렉터리의 `image-repair-v1/report.json`에서 미완료 원인을 확인한다.
잠금 충돌은 최대 15분 대기 후 `2 DEFERRED_LOCK`으로 기록한다. 미완료 작업은 다음 실행에서 이어간다. 적용·검토·첫 실행 수락 절차는 [공개 행사 이미지 누락 보완](../../collector/IMAGE_REPAIR_KO.md)을 참고한다.

팝업 일일 수집은 기존 매일 17:10 작업을 유지한다. 동네 팝업 탐색 API·화면은 2026-10-06 주소 분류·지도 공급·사용성을 보완해 통합 배포 대상으로 준비했다. 배포 때 API `POPUP_EXPLORE_ENABLED=true`와 Vercel 빌드 `VITE_POPUP_EXPLORE_ENABLED=true`를 함께 적용한다. 기존 `false` 환경은 새 기본값보다 우선한다. 별도 카카오 브라우저 SDK 키는 필요하지 않다. 이번 작업에서 운영 공개 설정이나 배포는 변경하지 않았다. [검증·공개 절차](../../docs/POPUP_NEIGHBORHOOD_KO.md)를 따른다. 공식 원문 재확인의 새 정기 실행은 별도 배포·실행 절차를 따른다.

지역 기반 4개 분야 발견과 공식 지점 목록 대조는 다음 통합 배포용으로 준비했다. 실행 모드는 `discovery`와 `popup-inventory`이며 `discovery.cron.example`은 지역 3시간/공식 목록 6시간 간격의 제안이다. 운영 예약은 아직 변경하지 않았다. 배포 때 기존 crontab에 해당 행만 합치고 전체 예약을 덮어쓰지 않는다. `doctor --coverage`로 실행 환경 정상과 출처별 미완료·오래된 작업을 따로 확인한다. [수집 범위와 실행 예산](../../collector/DISCOVERY_COVERAGE_KO.md)을 따른다.

일정 장소 API는 `api.env`의 `KAKAO_LOCAL_API_KEY`를 사용하고 없으면 `KAKAO_CLIENT_ID`를 사용한다. 2026-10-05 카카오 앱 1588512의 Local 제공 서비스 ON 상태와 실제 운영 장소 검색·주소 좌표·주변 조회의 200 응답을 확인했다. `ITINERARY_PLACE_DAILY_LIMIT`은 기본 2,000·최대 10,000이다. 키를 프런트로 전달하지 않으며 연결 실패 시 직접 입력을 사용할 수 있다. 개인 일정은 브라우저에 저장하고 이 기능에는 추가 SQL이 없다. [일정 안내](../../docs/ITINERARY_BUILDER_KO.md)를 따른다.

## 운영 전환 및 복구

Vercel `VITE_API_BASE_URL`, `SEO_API_BASE_URL`은 `https://api.boothana.kr`로 설정하고 재배포한다.
카카오 콜백에 `https://api.boothana.kr/login/oauth2/code/kakao`를 추가한다.
이전 Render 서비스는 삭제하지 않고 일시중지했다. GitHub 변수 `RENDER_KEEPALIVE_ENABLED=false`.
복구 시 Render를 재개하고 준비 상태를 확인한 뒤 Vercel 두 API 변수를 기존 주소로 복원하고 재배포한다.
DB와 GCS는 동일한 서비스를 계속 사용하므로 Render에서 Ubuntu로의 인프라 이관 자체에는 DB 이전이 없다. 이후 새 기능에 필요한 SQL 마이그레이션은 별도로 적용한다.


## 서브컬처 관계 수집 상시 실행 (0.4.0.3)

`graph.config.json`에는 `collector/config.graph.example.json`을 바탕으로 내부 API 주소,
`/var/lib/boothhana-collector/state/graph`, `/var/lib/boothhana-collector/codex`를 설정합니다.
SQL031–036, API 그래프 기능, Codex 로그인과 정확한 모델 호출 검증이 선행되어야 합니다.

```bash
docker compose --profile graph up -d --no-deps boothhana-graph
docker compose --profile graph logs --tail 50 boothhana-graph
```

독립 서비스는 `collector.lock`을 사용하지 않습니다. 서버 작업 임대, 컨텍스트 해시와
기존 공개 처리의 DB 잠금으로 중복 처리·변경된 자료의 공개를 방지합니다.
시작 시와 6시간 간격으로 발견/행사/작가 갱신을 페이지 끝까지 예약하며,
작가는 날짜 기준으로 중복 예약을 제거합니다. 대기 작업을 계속 처리하고 실패는 서버 큐에서 재시도합니다.
`run-graph-baseline.sh`의 기존 5분 cron은 상시 서비스를 활성화할 때 제거해 실행 경로를 하나로 유지합니다.
다른 카테고리·이미지·배치 스케줄은 유지합니다.

이전 완료까지는 `collection_job.baseline=true`인 작업의 진행을 우선 보존합니다.
기존 작가의 첫 공개 수집 역시 baseline으로 처리하여 과거 상품을 새 소식으로 알리지 않습니다.
원문 미확인에 따른 `ENRICH`는 오류 은폐나 강제 승인이 아닌 보완 대기입니다.

운영 `collector.config.json`에 `model: "gpt-6.1-sol"`,
`maxCliCalls: 0`, `floorplanMaxCliCalls: 0`, `dailyDiscoveryCliCalls: 0`을 명시합니다.
0은 호출 횟수 무제한이며 인증 오류, 개별 호출 시간 제한, 배치 실행 시간 제한은 유지됩니다.
이미 시작된 컨테이너의 모델 설정은 바뀌지 않으며 다음 실행부터 적용됩니다.
롤백 시 상시 그래프 서비스만 중지하고 이전 이미지·설정·graph baseline cron을 복원합니다.
