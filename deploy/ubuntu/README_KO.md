# BoothHana Ubuntu 운영 서버

Vercel 프런트는 유지하고 Spring Boot API만 상시 가동 Ubuntu PC로 이전하는 구성이다. API 컨테이너는 재부팅 후 자동으로 다시 시작하며 Caddy가 도메인 인증서 발급·갱신과 HTTPS 프록시를 담당한다. Supabase DB와 Google Cloud Storage는 기존 서비스를 그대로 사용한다.

## 준비 조건

- Ubuntu 24.04 LTS 권장
- Docker Engine과 Docker Compose 플러그인
- 서버로 연결된 API 도메인(예: `api.example.com`)
- 공유기 사용 시 TCP 80·443 포트포워딩 및 Ubuntu 방화벽 허용
- 통신사가 CGNAT를 사용해 포트포워딩할 수 없다면 공인 IP 또는 별도 터널 구성
- 서버 절전·자동 종료 해제

## 최초 설치

```bash
git clone https://github.com/growthline352-jpg/boothhana.git
cd boothhana/deploy/ubuntu
cp .env.example .env
mkdir -p secrets
```

1. `.env`에 Render에서 사용 중인 운영 환경변수를 옮긴다. 원문 관리자 비밀번호 대신 bcrypt cost 12 해시만 저장한다. 해시의 `$`가 환경변수 치환되지 않도록 `ADMIN_LOGIN_PASSWORD_HASH='$2a$12$...'`처럼 작은따옴표로 감싼다.
2. Google 서비스 계정 JSON을 `secrets/gcs-service-account.json`에 둔다.
3. DNS의 API 도메인 A/AAAA 레코드를 서버 공인 IP에 연결한다.
4. 다음 명령으로 배포한다.

```bash
chmod +x deploy.sh
./deploy.sh api.example.com
```

`.env`와 서비스 계정 JSON은 Git에 포함되지 않는다. API 포트 8080은 외부에 공개하지 않고 Caddy 컨테이너에서만 접근한다.

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
# 상태
docker compose --env-file .env -f compose.yml ps

# 로그
docker compose --env-file .env -f compose.yml logs -f --tail=200

# 새 코드 반영
cd ~/boothhana
git pull --ff-only origin main
./deploy/ubuntu/deploy.sh api.example.com

# 안전한 재시작
docker compose --env-file .env -f compose.yml restart boothhana-api
```

Docker의 `restart: unless-stopped`가 Ubuntu 재부팅과 프로세스 장애 후 컨테이너를 다시 실행한다. 서버 자체의 고장·인터넷 단절은 막을 수 없으므로 외부에서 `/api/public/health/live`를 계속 감시한다.

## Render 임시 하트비트 종료

현재 `.github/workflows/render-keepalive.yml`은 Render 무료 API가 잠들지 않도록 5분마다 공개 liveness 경로를 호출한다. Ubuntu 전환이 끝나면 GitHub 저장소 변수 `RENDER_KEEPALIVE_ENABLED=false`를 추가하거나 해당 워크플로를 삭제한다. 공개 저장소의 예약 워크플로는 저장소 활동이 60일 동안 없으면 GitHub가 자동으로 비활성화할 수 있으므로 영구 운영 수단으로 사용하지 않는다.
