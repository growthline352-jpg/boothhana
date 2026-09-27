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

chmod 600 .env secrets/gcs-service-account.json
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d --build --remove-orphans

echo "Waiting for https://${api_domain}/api/public/health/ready ..."
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 10 \
      "https://${api_domain}/api/public/health/ready" >/dev/null; then
    echo "BoothHana API is ready."
    docker compose --env-file .env -f compose.yml ps
    exit 0
  fi
  sleep 5
done

echo "Readiness check failed. Recent logs:" >&2
docker compose --env-file .env -f compose.yml logs --tail=120 boothhana-api caddy >&2
exit 1
