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

관심분야 기능을 배포할 때는 운영 DB를 백업하고 아카이브 목록을 확인한 뒤, 실제 백엔드 역할을 `boothhana.backend_role`로 지정한 동일 DB 세션에서 `database/020_category_interests.sql`을 먼저 적용한다. 새 API 준비 상태와 개인 API 접근·CORS를 확인한 뒤 프런트를 배포한다. 이전 API 이미지와 런타임 환경 파일을 보존하며, 상세 게이트는 [관심분야 검증 및 배포 계획](../../docs/CATEGORY_INTERESTS_TEST_PLAN.md)을 따른다.

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

## 운영 전환 및 복구

Vercel `VITE_API_BASE_URL`, `SEO_API_BASE_URL`은 `https://api.boothana.kr`로 설정하고 재배포한다.
카카오 콜백에 `https://api.boothana.kr/login/oauth2/code/kakao`를 추가한다.
이전 Render 서비스는 삭제하지 않고 일시중지했다. GitHub 변수 `RENDER_KEEPALIVE_ENABLED=false`.
복구 시 Render를 재개하고 준비 상태를 확인한 뒤 Vercel 두 API 변수를 기존 주소로 복원하고 재배포한다.
DB와 GCS는 동일한 서비스를 계속 사용하므로 Render에서 Ubuntu로의 인프라 이관 자체에는 DB 이전이 없다. 이후 새 기능에 필요한 SQL 마이그레이션은 별도로 적용한다.
