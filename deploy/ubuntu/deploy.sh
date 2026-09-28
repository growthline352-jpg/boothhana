#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing deploy/ubuntu/.env. Copy .env.example to .env and fill every secret." >&2
  exit 1
fi

if [[ ! -f secrets/gcs-service-account.json ]]; then
  echo "Missing deploy/ubuntu/secrets/gcs-service-account.json." >&2
  exit 1
fi

if [[ ! -f collector.config.json ]]; then
  echo "Missing deploy/ubuntu/collector.config.json." >&2
  exit 1
fi

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "Usage: ./deploy.sh api.your-domain.example" >&2
  exit 1
fi

api_domain="$1"
if [[ "$api_domain" == *://* || "$api_domain" == */* ]]; then
  echo "Pass only the hostname, without scheme or path." >&2
  exit 1
fi

configured_domain="$(sed -n 's/^API_DOMAIN=//p' .env | tail -n 1 | tr -d '\r')"
if [[ "$configured_domain" != "$api_domain" ]]; then
  echo "API_DOMAIN in .env does not match '$api_domain'." >&2
  exit 1
fi

env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" .env | tail -n 1 | tr -d '\r'
}

collector_token="$(env_value BOOTH_COLLECTOR_TOKEN)"
if [[ ${#collector_token} -lt 32 || "$collector_token" == replace-* ]]; then
  echo "BOOTH_COLLECTOR_TOKEN must be a non-placeholder value of at least 32 characters." >&2
  exit 1
fi

chmod 600 .env secrets/gcs-service-account.json
chmod 700 deploy.sh run-collector.sh login-collector.sh install-timers.sh
docker compose --env-file .env -f compose.yml --profile jobs config --quiet
if [[ -n "$(docker ps --quiet \
    --filter label=com.docker.compose.project=boothhana-production \
    --filter label=com.docker.compose.service=boothhana-collector)" ]]; then
  echo "A collector job is running. Wait for it to finish before deploying." >&2
  exit 1
fi
docker compose --env-file .env -f compose.yml --profile jobs build boothhana-api boothhana-collector
docker compose --env-file .env -f compose.yml up -d --remove-orphans boothhana-api caddy

echo "Waiting for https://${api_domain}/api/public/health/ready ..."
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 10 \
      "https://${api_domain}/api/public/health/ready" >/dev/null; then
    echo "BoothHana API is ready."
    docker compose --env-file .env -f compose.yml --profile jobs run \
      --rm --no-deps -T boothhana-collector \
      python doctor.py --config /etc/boothhana/collector.json --skip-auth
    docker compose --env-file .env -f compose.yml ps
    exit 0
  fi
  sleep 5
done

echo "Readiness check failed. Recent logs:" >&2
docker compose --env-file .env -f compose.yml logs --tail=120 boothhana-api caddy >&2
exit 1
