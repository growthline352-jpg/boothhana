#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing deploy/ubuntu/.env." >&2
  exit 1
fi

echo "Starting Codex device-code login for the collector container."
echo "The resulting auth cache is stored only in the collector_auth Docker volume."
docker compose --env-file .env -f compose.yml --profile jobs run \
  --rm --no-deps boothhana-collector codex login --device-auth

docker compose --env-file .env -f compose.yml --profile jobs run \
  --rm --no-deps -T boothhana-collector codex login status

docker compose --env-file .env -f compose.yml --profile jobs run \
  --rm --no-deps -T boothhana-collector \
  python doctor.py --config /etc/boothhana/collector.json
