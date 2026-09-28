# BoothHana Ubuntu 운영 서버

Vercel 프런트는 유지하고 다음 세 구성요소를 Ubuntu PC에서 같은 Git 커밋으로 빌드한다.

- `boothhana-api`: Spring Boot API 상시 실행
- `caddy`: API 도메인의 HTTPS 인증서 발급·갱신과 리버스 프록시
- `boothhana-collector`: Codex CLI 기반 수집 작업이 예약 시점에만 실행되는 일회성 컨테이너

Supabase DB와 Google Cloud Storage는 기존 서비스를 그대로 사용한다. 수집기는 외부 포트를 열지 않으며 Docker 내부 주소 `http://boothhana-api:8080`으로 API에 접근한다. 체크포인트·재시도 큐는 `collector_state` 볼륨에 남기 때문에 이미지 업데이트나 재부팅 뒤에도 이어진다.

## 준비 조건

- Ubuntu 24.04 LTS 권장
- Docker Engine과 Docker Compose 플러그인
- 서버로 연결된 API 도메인(예: `api.example.com`)
- 공유기 사용 시 TCP 80·443 포트포워딩 및 Ubuntu 방화벽 허용
- 통신사가 CGNAT를 사용해 포트포워딩할 수 없다면 공인 IP 또는 별도 터널 구성
- 서버 절전·자동 종료 해제
- Codex CLI를 사용할 ChatGPT 계정과 활성화된 device-code 로그인
- 선택 사항: 최근 X 게시물 검색용 X API bearer token

## 최초 설치

타이머 파일은 고정 경로를 사용하므로 저장소를 `/opt/boothhana`에 둔다.

```bash
sudo git clone https://github.com/growthline352-jpg/boothhana.git /opt/boothhana
sudo chown -R "$USER":"$USER" /opt/boothhana
cd /opt/boothhana/deploy/ubuntu
cp .env.example .env
mkdir -p secrets
```

1. `.env`에 Render에서 사용 중인 운영 환경변수를 옮긴다. 원문 관리자 비밀번호 대신 bcrypt cost 12 해시만 저장한다. 해시의 `$`가 환경변수 치환되지 않도록 `ADMIN_LOGIN_PASSWORD_HASH='$2a$12$...'`처럼 작은따옴표로 감싼다.
2. `BOOTH_COLLECTOR_TOKEN`은 API와 수집기가 공유할 32자 이상의 무작위 값으로 설정한다.
3. X API를 사용할 때만 `X_BEARER_TOKEN`을 설정한다. 비워 두면 공개 웹 검색 경로만 사용한다.
4. Google 서비스 계정 JSON을 `secrets/gcs-service-account.json`에 둔다.
5. DNS의 API 도메인 A/AAAA 레코드를 서버 공인 IP에 연결한다.
6. `collector.config.json`의 허용 이미지 호스트와 처리량을 운영 정책에 맞게 검토한다.

임의 토큰은 다음처럼 만들 수 있다.

```bash
openssl rand -hex 32
```

API·수집기 이미지를 함께 빌드하고 API·Caddy만 상시 실행한다.

```bash
chmod +x deploy.sh run-collector.sh login-collector.sh install-timers.sh
./deploy.sh api.example.com
```

배포 스크립트는 다음을 완료해야 성공한다.

1. 비밀값·설정 파일 존재 여부 검사
2. Compose 설정 검증
3. API와 수집기 이미지 빌드
4. API readiness 통과
5. 수집기 컨테이너의 Python·Codex CLI·토큰 설정 검사(최초 로그인 전이므로 인증은 제외)

`.env`와 서비스 계정 JSON은 Git에 포함되지 않는다. API 포트 8080은 외부에 공개하지 않고 Caddy 컨테이너에서만 접근한다.

## 수집기 확인과 타이머 설치

API 배포 후 수집기 컨테이너에서 ChatGPT 계정에 한 번 로그인한다. 서버 터미널에 표시되는 주소와 일회용 코드를 다른 브라우저에서 열어 승인한다.

```bash
./login-collector.sh
```

이 방식은 OpenAI의 헤드리스 장치 권장 절차인 `codex login --device-auth`를 사용한다. Codex는 이후 예약 작업에서 저장된 로그인을 재사용하며 `codex exec --ephemeral`로 실행 결과 세션을 별도 보존하지 않는다.

로그인 캐시는 코드나 `.env`가 아니라 `collector_auth` Docker 볼륨에만 저장된다. 이 파일은 비밀번호처럼 취급하고 저장소·채팅·일반 백업에 포함하지 않는다. 토큰 갱신 결과도 같은 볼륨에 보존된다.

첫 실제 수집 전에 doctor를 수동 실행한다.

```bash
./run-collector.sh doctor
```

필요하면 예약 전 한 번 직접 실행해 로그와 DB 수집함을 확인한다. 이 명령은 실제 Codex 사용량과 DB 변경을 발생시킨다.

```bash
./run-collector.sh weekly
```

확인 후 타이머를 설치한다.

```bash
sudo ./install-timers.sh
```

- 일요일 03:00 KST: 행사 발견 → 행사 보완 → 참가업체 → 상품 → 이미지 → 배치도 전체 파이프라인
- 월요일~토요일 04:00 KST: 개최 임박 행사의 배치도 추가 확인
- 주간 전체 작업은 `Persistent=true`라서 예약 시각에 서버가 꺼져 있었다면 다음 기동 후 누락 실행
- 일일 배치도 작업은 전체 작업과 동시 기동하지 않도록 누락분을 즉시 재생하지 않고 다음 04:00에 다시 확인
- 공통 파일 잠금: 두 작업이 겹치면 뒤 작업은 중복 실행하지 않고 종료
- API readiness 실패: DB 전송을 시도하지 않고 작업 종료

상태와 로그 확인:

```bash
systemctl list-timers --all boothhana-collector-weekly.timer boothhana-floorplans.timer
journalctl -u boothhana-collector-weekly.service -n 200 --no-pager
journalctl -u boothhana-floorplans.service -n 200 --no-pager
docker volume inspect boothhana-production_collector_state
docker volume inspect boothhana-production_collector_auth
```

## 전환 전 검증

```bash
curl -fsS https://api.example.com/api/public/health/live
curl -fsS https://api.example.com/api/public/health/ready
curl -fsS 'https://api.example.com/api/public/catalog/events?page=0&size=1&category=SUBCULTURE'
```

세 요청이 모두 성공한 뒤 아래 주소를 변경한다.

1. Vercel 운영 환경변수의 `VITE_API_BASE_URL`과 `SEO_API_BASE_URL`을 새 API origin으로 변경하고 재배포한다.
2. Kakao Developers의 Redirect URI를 `https://API_DOMAIN/login/oauth2/code/kakao`로 변경한다.
3. API `.env`의 `FRONTEND_URL`과 `ALLOWED_ORIGINS`가 `https://boothhana.vercel.app`인지 확인한다.
4. 다른 휴대전화 네트워크에서 행사 목록·카카오 로그인·관리자 로그인·이미지를 확인한다.

전환이 확인되기 전에는 Render 서비스를 삭제하지 않는다. 문제가 생기면 Vercel의 API 환경변수를 기존 Render 주소로 되돌려 즉시 복구한다.

## 운영 명령

```bash
# 상시 서비스 상태
docker compose --env-file .env -f compose.yml ps

# 로그
docker compose --env-file .env -f compose.yml logs -f --tail=200 boothhana-api caddy

# 새 코드 반영: fast-forward만 허용한 뒤 두 이미지를 같은 커밋으로 재빌드
cd /opt/boothhana
git pull --ff-only origin main
./deploy/ubuntu/deploy.sh api.example.com

# 안전한 API 재시작
docker compose --env-file .env -f compose.yml restart boothhana-api

# 수집 작업이 실행 중인지 확인
docker ps --filter name=boothhana-production-boothhana-collector
```

`Docker restart: unless-stopped`가 Ubuntu 재부팅과 API/Caddy 프로세스 장애 후 컨테이너를 다시 실행한다. 수집기에는 restart 정책을 적용하지 않는다. 실패 원인을 고치지 않은 무한 재실행과 Codex 비용 중복을 피하고 다음 타이머 또는 수동 실행에서 재시도하기 위해서다.

## 백업과 복구

DB와 GCS가 실제 데이터의 원본이다. `collector_state`에는 수집 진행 상태와 감사 로그가 들어 있으므로 함께 백업하면 재조사를 줄일 수 있다. 아래 명령은 인증정보가 든 별도 `collector_auth` 볼륨을 백업하지 않는다.

```bash
docker run --rm \
  -v boothhana-production_collector_state:/source:ro \
  -v "$PWD/backups":/backup \
  alpine:3.22 tar czf /backup/collector-state-$(date +%F).tgz -C /source .
```

백업 파일에는 조사 결과와 URL이 포함될 수 있으므로 공개 저장소에 올리지 않는다.

## Render 임시 하트비트 종료

현재 `.github/workflows/render-keepalive.yml`은 Render 무료 API가 잠들지 않도록 5분마다 공개 liveness 경로를 호출한다. Ubuntu 전환이 끝나면 GitHub 저장소 변수 `RENDER_KEEPALIVE_ENABLED=false`를 추가하거나 해당 워크플로를 삭제한다. 전환 전에는 유지한다.
